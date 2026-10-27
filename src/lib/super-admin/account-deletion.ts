// ============================================================
// Super admin — permanent workspace deletion.
//
// Flow (all enforced on the server, not just in the UI):
//   1. verify  — the super admin re-enters their password (and their
//                authenticator code if they use 2FA). On success we issue
//                a short-lived deletion token bound to (admin, account).
//   2. delete  — needs that token AND the typed confirmation word. The
//                database function sa_delete_account() then removes the
//                workspace, every member's login and all their data in a
//                single transaction, and refuses banned accounts.
//   3. storage — files in S3 (and legacy Supabase Storage) under the
//                workspace's prefixes are removed afterwards.
//
// A deleted user's email no longer exists anywhere, so signing in shows
// "no account" and they can sign up again as a brand-new user.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteS3Prefix } from '@/lib/storage/s3-client';
import {
  TEMPLATE_REVIEW_MEDIA_FOLDER,
  TEMPLATE_SEND_MEDIA_FOLDER,
} from '@/lib/storage/media-folders';
import { SUPPORT_MEDIA_PREFIX } from '@/lib/support-chat/attachments';

/** What the super admin must type in step 2. */
export const DELETE_CONFIRM_WORD = 'CONFIRM';
/** How long a verified password stays good for the delete call. */
export const DELETION_TOKEN_TTL_MS = 10 * 60_000;

export class AccountDeletionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

export const BANNED_MESSAGE =
  'This account is banned. Unban it first, then you can delete it.';
export const PROTECTED_MESSAGE =
  'This workspace contains a super admin account and cannot be deleted from here.';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);

// ── Deletion token ──────────────────────────────────────────────

function tokenKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  return key;
}

function sign(payload: string): string {
  return createHmac('sha256', tokenKey())
    .update(`sa-account-delete:${payload}`)
    .digest('base64url');
}

export function issueDeletionToken(
  adminUserId: string,
  accountId: string,
  now = Date.now()
): { token: string; expiresAt: string } {
  const exp = now + DELETION_TOKEN_TTL_MS;
  const payload = `${adminUserId}.${accountId}.${exp}`;
  return {
    token: `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/** True only for an unexpired token minted for this admin + account. */
export function checkDeletionToken(
  token: unknown,
  adminUserId: string,
  accountId: string,
  now = Date.now()
): boolean {
  if (typeof token !== 'string' || token.length > 400) return false;
  const [encoded, mac] = token.split('.');
  if (!encoded || !mac) return false;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return false;
  }
  const [uid, aid, expRaw] = payload.split('.');
  const exp = Number(expRaw);
  return (
    uid === adminUserId &&
    aid === accountId &&
    Number.isFinite(exp) &&
    exp > now
  );
}

export function isConfirmWord(v: unknown): boolean {
  return typeof v === 'string' && v.trim() === DELETE_CONFIRM_WORD;
}

// ── Eligibility ─────────────────────────────────────────────────

export interface DeletionTarget {
  id: string;
  name: string;
  isBanned: boolean;
  isProtected: boolean;
  memberCount: number;
}

export async function loadDeletionTarget(
  admin: SupabaseClient,
  accountId: string,
  actorUserId: string
): Promise<DeletionTarget> {
  const { data: account, error } = await admin
    .from('accounts')
    .select('id, name, is_banned, owner_user_id')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`load account failed: ${error.message}`);
  if (!account) {
    throw new AccountDeletionError(
      'Account not found.',
      404,
      'account_not_found'
    );
  }
  const { data: members } = await admin
    .from('profiles')
    .select('user_id, is_super_admin')
    .eq('account_id', accountId);
  const list = (members ?? []) as {
    user_id: string;
    is_super_admin: boolean;
  }[];
  const isProtected =
    account.owner_user_id === actorUserId ||
    list.some((m) => m.user_id === actorUserId || m.is_super_admin);
  return {
    id: account.id as string,
    name: account.name as string,
    isBanned: account.is_banned === true,
    isProtected,
    memberCount: list.length,
  };
}

export function assertDeletable(target: DeletionTarget): void {
  if (target.isBanned) {
    throw new AccountDeletionError(BANNED_MESSAGE, 409, 'account_banned');
  }
  if (target.isProtected) {
    throw new AccountDeletionError(PROTECTED_MESSAGE, 403, 'protected_account');
  }
}

// ── Password re-check ───────────────────────────────────────────

/**
 * Re-verify the super admin's password with a throwaway, non-persisting
 * client, then close the session that check opened so it doesn't linger
 * as a device.
 */
export async function verifyPassword(
  email: string,
  password: unknown
): Promise<boolean> {
  if (
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 200
  ) {
    return false;
  }
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  return true;
}

// ── Delete ──────────────────────────────────────────────────────

export interface DeletionResult {
  auditId: string;
  memberIds: string[];
  supportConversationIds: string[];
}

export async function deleteAccountRecords(
  admin: SupabaseClient,
  accountId: string,
  actorUserId: string
): Promise<DeletionResult> {
  const { data, error } = await admin.rpc('sa_delete_account', {
    p_account_id: accountId,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('account_banned')) {
      throw new AccountDeletionError(BANNED_MESSAGE, 409, 'account_banned');
    }
    if (msg.includes('protected_account')) {
      throw new AccountDeletionError(
        PROTECTED_MESSAGE,
        403,
        'protected_account'
      );
    }
    if (msg.includes('account_not_found')) {
      throw new AccountDeletionError(
        'Account not found.',
        404,
        'account_not_found'
      );
    }
    if (msg.includes('not_super_admin')) {
      throw new AccountDeletionError(
        'Super admin access required.',
        403,
        'not_super_admin'
      );
    }
    throw new Error(`sa_delete_account failed: ${msg}`);
  }
  const r = (data ?? {}) as {
    audit_id?: string;
    member_ids?: string[];
    support_conversation_ids?: string[];
  };
  return {
    auditId: r.audit_id ?? '',
    memberIds: r.member_ids ?? [],
    supportConversationIds: r.support_conversation_ids ?? [],
  };
}

// ── Storage ─────────────────────────────────────────────────────

const ACCOUNT_S3_FOLDERS = [
  'chat-media',
  'flow-media',
  TEMPLATE_REVIEW_MEDIA_FOLDER,
  TEMPLATE_SEND_MEDIA_FOLDER,
  'business-profile',
];

/** Every storage prefix that belongs to the deleted workspace. */
export function accountStoragePrefixes(
  accountId: string,
  memberIds: string[],
  supportConversationIds: string[]
): string[] {
  return [
    ...ACCOUNT_S3_FOLDERS.map((f) => `${f}/account-${accountId}/`),
    ...memberIds.map((u) => `avatars/${u}/`),
    ...supportConversationIds.map((c) => `${SUPPORT_MEDIA_PREFIX}/${c}/`),
  ];
}

export interface StorageResult {
  deleted: number;
  failed: string[];
}

/**
 * Remove the workspace's files. Best effort and never throws: the
 * database part is already done, and a storage failure is recorded on
 * the audit row so it can be retried.
 */
export async function purgeAccountStorage(
  admin: SupabaseClient,
  result: DeletionResult,
  accountId: string
): Promise<StorageResult> {
  const out: StorageResult = { deleted: 0, failed: [] };
  const prefixes = accountStoragePrefixes(
    accountId,
    result.memberIds,
    result.supportConversationIds
  );

  if (process.env.AWS_S3_BUCKET_NAME) {
    for (const prefix of prefixes) {
      try {
        out.deleted += await deleteS3Prefix(prefix);
      } catch (err) {
        console.error('[account-deletion] S3 purge failed:', prefix, err);
        out.failed.push(`s3:${prefix}`);
      }
    }
  }

  // Legacy Supabase Storage buckets (pre-S3 uploads).
  const legacy: [string, string][] = [
    ['chat-media', `account-${accountId}`],
    ['flow-media', `account-${accountId}`],
    ...result.memberIds.map((u) => ['avatars', u] as [string, string]),
  ];
  for (const [bucket, folder] of legacy) {
    try {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: 1000 });
      if (error) throw error;
      const paths = (data ?? [])
        .filter((f) => f.name && f.id)
        .map((f) => `${folder}/${f.name}`);
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) throw rmErr;
        out.deleted += paths.length;
      }
    } catch (err) {
      console.error(
        '[account-deletion] storage purge failed:',
        bucket,
        folder,
        err
      );
      out.failed.push(`storage:${bucket}/${folder}`);
    }
  }

  await admin
    .from('super_admin_account_deletions')
    .update({ storage_result: { deleted: out.deleted, failed: out.failed } })
    .eq('id', result.auditId);
  return out;
}
