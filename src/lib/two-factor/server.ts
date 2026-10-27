// ============================================================
// Two-factor authentication — server-side service.
//
// Personal 2FA: every user (owner or member) can link their own TOTP
// authenticator app. Secrets are AES-256-GCM encrypted (ENCRYPTION_KEY).
//
// Owner verification: a workspace owner who has personal 2FA can require
// members to enter the OWNER's current code to sign in. While on, that
// requirement replaces a member's personal 2FA for the workspace login;
// the member's own code is not accepted.
//
// Verification is recorded on the caller's own auth session
// (user_sessions.two_factor_*). Sessions remain per user.
// ============================================================

import QRCode from 'qrcode';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import type { RequestDeviceMeta } from '@/lib/security/device';
import {
  recordSecurityEvent,
  touchCurrentSession,
  type SecurityContext,
} from '@/lib/security/server';
import {
  generateTotpSecret,
  formatSecretForDisplay,
  normalizeTotpCode,
  otpauthUri,
  verifyTotp,
} from './totp';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery';
import type { TwoFactorGateResult } from './gate';

export const TOTP_ISSUER = 'Replai';

export class TwoFactorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

const invalidCode = () =>
  new TwoFactorError(
    'That code is not valid. Check the code in your authenticator app and try again.',
    400,
    'invalid_code'
  );

interface TwoFactorRow {
  user_id: string;
  secret_enc: string;
  status: 'pending' | 'active';
  enabled_at: string | null;
}

async function loadRow(
  admin: SupabaseClient,
  userId: string
): Promise<TwoFactorRow | null> {
  const { data, error } = await admin
    .from('user_two_factor')
    .select('user_id, secret_enc, status, enabled_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`load two-factor failed: ${error.message}`);
  return (data as TwoFactorRow | null) ?? null;
}

async function activeSecret(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const row = await loadRow(admin, userId);
  return row?.status === 'active' ? decrypt(row.secret_enc) : null;
}

/**
 * Verify a TOTP code and claim its time step for `userId`, so the same
 * code can't be replayed by the same person. `secretUserId` is whose
 * authenticator generated it (the owner, for owner verification).
 */
async function checkTotp(
  admin: SupabaseClient,
  userId: string,
  secretUserId: string,
  secret: string,
  code: unknown
): Promise<'ok' | 'invalid' | 'reused'> {
  const step = typeof code === 'string' ? verifyTotp(secret, code) : null;
  if (step === null) return 'invalid';
  const { data, error } = await admin.rpc('security_two_factor_claim_step', {
    p_user_id: userId,
    p_secret_user_id: secretUserId,
    p_step: step,
  });
  if (error) throw new Error(`claim step failed: ${error.message}`);
  return data === true ? 'ok' : 'reused';
}

/** True when the user has a confirmed authenticator app. */
export async function hasActiveTwoFactor(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  return (await loadRow(admin, userId))?.status === 'active';
}

/**
 * Check a 6-digit code against the user's OWN authenticator (replay-safe).
 * For step-up confirmation of sensitive actions outside sign-in.
 */
export async function verifyUserTotp(
  admin: SupabaseClient,
  userId: string,
  code: unknown
): Promise<'ok' | 'invalid' | 'reused' | 'not_enabled'> {
  const secret = await activeSecret(admin, userId);
  if (!secret) return 'not_enabled';
  return checkTotp(admin, userId, userId, secret, code);
}

function throwFor(result: 'invalid' | 'reused'): never {
  if (result === 'reused') {
    throw new TwoFactorError(
      'That code was already used. Wait for the next code in your authenticator app.',
      400,
      'code_reused'
    );
  }
  throw invalidCode();
}

/** Consume one unused recovery code atomically. */
async function consumeRecoveryCode(
  admin: SupabaseClient,
  userId: string,
  raw: unknown
): Promise<boolean> {
  if (!normalizeRecoveryCode(raw)) return false;
  const { data, error } = await admin
    .from('user_two_factor_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('code_hash', hashRecoveryCode(raw as string))
    .is('used_at', null)
    .select('id');
  if (error) throw new Error(`use recovery code failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

async function replaceRecoveryCodes(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await admin
    .from('user_two_factor_recovery_codes')
    .delete()
    .eq('user_id', userId);
  const { error } = await admin
    .from('user_two_factor_recovery_codes')
    .insert(
      codes.map((c) => ({ user_id: userId, code_hash: hashRecoveryCode(c) }))
    );
  if (error) throw new Error(`save recovery codes failed: ${error.message}`);
  return codes;
}

/** Mark the caller's current auth session as having passed 2FA. */
async function markSessionVerified(
  ctx: SecurityContext,
  meta: RequestDeviceMeta,
  method: 'personal' | 'owner' | 'recovery' | 'enrollment'
): Promise<void> {
  if (!ctx.sessionId) {
    throw new TwoFactorError(
      'Your sign-in session could not be identified. Sign in again.',
      409,
      'no_session'
    );
  }
  // Creates the session row (and its "login" event) if it's new.
  await touchCurrentSession(ctx, meta);
  const { data, error } = await ctx.admin
    .from('user_sessions')
    .update({
      two_factor_verified_at: new Date().toISOString(),
      two_factor_method: method,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', ctx.sessionId)
    .eq('user_id', ctx.userId)
    .is('ended_at', null)
    .select('session_id');
  if (error) throw new Error(`mark session verified failed: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) {
    // The auth session is gone (signed out or revoked meanwhile).
    throw new TwoFactorError(
      'Your sign-in session has ended. Sign in again.',
      409,
      'no_session'
    );
  }
}

interface WorkspaceInfo {
  accountId: string | null;
  ownerUserId: string | null;
  isOwner: boolean;
  requireOwner: boolean;
}

async function workspaceInfo(ctx: SecurityContext): Promise<WorkspaceInfo> {
  if (!ctx.accountId) {
    return {
      accountId: null,
      ownerUserId: null,
      isOwner: false,
      requireOwner: false,
    };
  }
  const { data, error } = await ctx.admin
    .from('accounts')
    .select('owner_user_id, require_owner_two_factor')
    .eq('id', ctx.accountId)
    .maybeSingle();
  if (error) throw new Error(`load account failed: ${error.message}`);
  const owner = (data?.owner_user_id as string | null) ?? null;
  return {
    accountId: ctx.accountId,
    ownerUserId: owner,
    isOwner: !!owner && owner === ctx.userId,
    requireOwner: data?.require_owner_two_factor === true,
  };
}

async function displayName(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .maybeSingle();
  return (
    (data?.full_name as string | null) || (data?.email as string | null) || null
  );
}

// ── Status ──────────────────────────────────────────────────────

export interface TwoFactorStatus {
  personal: {
    status: 'off' | 'pending' | 'active';
    enabled_at: string | null;
    recovery_codes_remaining: number;
  };
  workspace: {
    in_workspace: boolean;
    is_owner: boolean;
    /** The owner's setting, as stored. */
    require_owner_verification: boolean;
    owner_has_two_factor: boolean;
    /** The setting is on AND the owner's authenticator is active. */
    owner_verification_active: boolean;
  };
  session: TwoFactorGateResult;
}

export async function getTwoFactorStatus(
  ctx: SecurityContext,
  gate: TwoFactorGateResult
): Promise<TwoFactorStatus> {
  const [row, ws] = await Promise.all([
    loadRow(ctx.admin, ctx.userId),
    workspaceInfo(ctx),
  ]);
  let remaining = 0;
  if (row?.status === 'active') {
    const { count } = await ctx.admin
      .from('user_two_factor_recovery_codes')
      .select('id', { count: 'exact' })
      .eq('user_id', ctx.userId)
      .is('used_at', null);
    remaining = count ?? 0;
  }
  const ownerHas = ws.ownerUserId
    ? ws.isOwner
      ? row?.status === 'active'
      : (await loadRow(ctx.admin, ws.ownerUserId))?.status === 'active'
    : false;
  return {
    personal: {
      status: row ? row.status : 'off',
      enabled_at: row?.status === 'active' ? row.enabled_at : null,
      recovery_codes_remaining: remaining,
    },
    workspace: {
      in_workspace: !!ws.accountId,
      is_owner: ws.isOwner,
      require_owner_verification: ws.requireOwner,
      owner_has_two_factor: ownerHas,
      owner_verification_active: ws.requireOwner && ownerHas,
    },
    session: gate,
  };
}

/** What the /two-factor page needs to render the right challenge. */
export async function getChallenge(
  ctx: SecurityContext,
  gate: TwoFactorGateResult
): Promise<TwoFactorGateResult & { owner_name: string | null }> {
  let owner_name: string | null = null;
  if (gate.required === 'owner') {
    const ws = await workspaceInfo(ctx);
    if (ws.ownerUserId)
      owner_name = await displayName(ctx.admin, ws.ownerUserId);
  }
  return { ...gate, owner_name };
}

// ── Enrollment ──────────────────────────────────────────────────

export async function startEnrollment(ctx: SecurityContext): Promise<{
  secret: string;
  secret_display: string;
  otpauth_uri: string;
  qr_data_url: string;
}> {
  const existing = await loadRow(ctx.admin, ctx.userId);
  if (existing?.status === 'active') {
    throw new TwoFactorError(
      'Two-factor authentication is already on for your account.',
      409,
      'already_enabled'
    );
  }
  const secret = generateTotpSecret();
  const { error } = await ctx.admin.from('user_two_factor').upsert(
    {
      user_id: ctx.userId,
      secret_enc: encrypt(secret),
      status: 'pending',
      enabled_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(`start enrollment failed: ${error.message}`);

  const accountName =
    (await displayName(ctx.admin, ctx.userId))?.slice(0, 64) || 'account';
  const uri = otpauthUri({ secret, accountName, issuer: TOTP_ISSUER });
  const qr = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });
  return {
    secret,
    secret_display: formatSecretForDisplay(secret),
    otpauth_uri: uri,
    qr_data_url: qr,
  };
}

export async function confirmEnrollment(
  ctx: SecurityContext,
  code: unknown,
  meta: RequestDeviceMeta
): Promise<{ recovery_codes: string[] }> {
  const row = await loadRow(ctx.admin, ctx.userId);
  if (!row || row.status !== 'pending') {
    throw new TwoFactorError(
      'Start the setup again: the setup request was not found or already finished.',
      409,
      'no_pending_setup'
    );
  }
  const result = await checkTotp(
    ctx.admin,
    ctx.userId,
    ctx.userId,
    decrypt(row.secret_enc),
    code
  );
  if (result !== 'ok') throwFor(result);

  const { error } = await ctx.admin
    .from('user_two_factor')
    .update({
      status: 'active',
      enabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', ctx.userId)
    .eq('status', 'pending');
  if (error) throw new Error(`activate two-factor failed: ${error.message}`);

  const codes = await replaceRecoveryCodes(ctx.admin, ctx.userId);
  // Setting it up proves possession: this session stays signed in.
  // Other devices will be asked for a code on their next request.
  await markSessionVerified(ctx, meta, 'enrollment');
  await recordSecurityEvent(ctx.admin, {
    userId: ctx.userId,
    accountId: ctx.accountId,
    type: 'two_factor_enabled',
    sessionId: ctx.sessionId,
    meta,
  });
  return { recovery_codes: codes };
}

/** Current TOTP code or an unused recovery code, for sensitive changes. */
async function requireOwnCode(
  ctx: SecurityContext,
  code: unknown
): Promise<'totp' | 'recovery'> {
  const secret = await activeSecret(ctx.admin, ctx.userId);
  if (!secret) {
    throw new TwoFactorError(
      'Two-factor authentication is not on for your account.',
      409,
      'not_enabled'
    );
  }
  // 6 digits = authenticator code; 10 characters = recovery code.
  if (!normalizeTotpCode(code) && normalizeRecoveryCode(code)) {
    if (await consumeRecoveryCode(ctx.admin, ctx.userId, code))
      return 'recovery';
    throw invalidCode();
  }
  const result = await checkTotp(
    ctx.admin,
    ctx.userId,
    ctx.userId,
    secret,
    code
  );
  if (result !== 'ok') throwFor(result);
  return 'totp';
}

export async function disableTwoFactor(
  ctx: SecurityContext,
  code: unknown,
  meta: RequestDeviceMeta
): Promise<void> {
  const ws = await workspaceInfo(ctx);
  if (ws.isOwner && ws.requireOwner) {
    throw new TwoFactorError(
      'Turn off "Require Owner 2FA Verification for Members" first. Your members sign in with your authenticator code while it is on.',
      409,
      'owner_verification_on'
    );
  }
  await requireOwnCode(ctx, code);
  await ctx.admin.from('user_two_factor').delete().eq('user_id', ctx.userId);
  await ctx.admin
    .from('user_two_factor_recovery_codes')
    .delete()
    .eq('user_id', ctx.userId);
  await recordSecurityEvent(ctx.admin, {
    userId: ctx.userId,
    accountId: ctx.accountId,
    type: 'two_factor_disabled',
    sessionId: ctx.sessionId,
    meta,
  });
}

export async function regenerateRecoveryCodes(
  ctx: SecurityContext,
  code: unknown,
  meta: RequestDeviceMeta
): Promise<{ recovery_codes: string[] }> {
  await requireOwnCode(ctx, code);
  const codes = await replaceRecoveryCodes(ctx.admin, ctx.userId);
  await recordSecurityEvent(ctx.admin, {
    userId: ctx.userId,
    accountId: ctx.accountId,
    type: 'recovery_codes_regenerated',
    sessionId: ctx.sessionId,
    meta,
  });
  return { recovery_codes: codes };
}

// ── Workspace owner verification ────────────────────────────────

export async function setOwnerVerification(
  ctx: SecurityContext,
  enabled: boolean,
  code: unknown,
  meta: RequestDeviceMeta
): Promise<{ require_owner_verification: boolean }> {
  const ws = await workspaceInfo(ctx);
  if (!ws.accountId || !ws.isOwner) {
    throw new TwoFactorError(
      'Only the workspace owner can change this setting.',
      403,
      'not_owner'
    );
  }
  const secret = await activeSecret(ctx.admin, ctx.userId);
  if (!secret) {
    throw new TwoFactorError(
      'Set up your personal two-factor authentication first. Members will sign in with codes from your authenticator app.',
      409,
      'owner_two_factor_required'
    );
  }
  // Recovery codes are deliberately not accepted here: changing this must
  // prove the authenticator members depend on actually works.
  const result = await checkTotp(
    ctx.admin,
    ctx.userId,
    ctx.userId,
    secret,
    code
  );
  if (result !== 'ok') throwFor(result);

  if (ws.requireOwner !== enabled) {
    const { error } = await ctx.admin
      .from('accounts')
      .update({ require_owner_two_factor: enabled })
      .eq('id', ws.accountId)
      .eq('owner_user_id', ctx.userId);
    if (error)
      throw new Error(`update owner verification failed: ${error.message}`);
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: enabled
        ? 'owner_verification_enabled'
        : 'owner_verification_disabled',
      sessionId: ctx.sessionId,
      meta,
    });
  }
  return { require_owner_verification: enabled };
}

// ── Sign-in verification ────────────────────────────────────────

export type VerifyMethod = 'totp' | 'recovery';

/**
 * Verify the code the /two-factor page submitted for the CURRENT session,
 * against the secret the gate says is required:
 *   owner    → the workspace owner's authenticator (no recovery codes;
 *              the member's personal code is not accepted)
 *   personal → the user's own authenticator, or one of their recovery codes
 */
export async function verifySignIn(
  ctx: SecurityContext,
  gate: TwoFactorGateResult,
  input: { code: unknown; method: VerifyMethod },
  meta: RequestDeviceMeta
): Promise<{ method: 'personal' | 'owner' | 'recovery' | 'none' }> {
  if (gate.required === 'none' || gate.satisfied) return { method: 'none' };

  const fail = async (reason: string): Promise<never> => {
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: 'two_factor_failed',
      sessionId: ctx.sessionId,
      meta,
      metadata: { required: gate.required, reason },
    });
    throw reason === 'reused'
      ? new TwoFactorError(
          'That code was already used. Wait for the next code and try again.',
          400,
          'code_reused'
        )
      : invalidCode();
  };

  if (gate.required === 'owner') {
    const ws = await workspaceInfo(ctx);
    const ownerSecret = ws.ownerUserId
      ? await activeSecret(ctx.admin, ws.ownerUserId)
      : null;
    if (!ws.ownerUserId || !ownerSecret) {
      // The gate and the data disagree (owner just turned 2FA off);
      // let the next gate read decide.
      throw new TwoFactorError(
        'Your workspace security settings just changed. Reload the page.',
        409,
        'requirement_changed'
      );
    }
    if (input.method === 'recovery') return fail('recovery_not_allowed');
    const result = await checkTotp(
      ctx.admin,
      ctx.userId,
      ws.ownerUserId,
      ownerSecret,
      input.code
    );
    if (result !== 'ok') return fail(result);

    await markSessionVerified(ctx, meta, 'owner');
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: 'two_factor_verified',
      sessionId: ctx.sessionId,
      meta,
      metadata: { method: 'owner' },
    });
    // Let the owner see where their code was used.
    await recordSecurityEvent(ctx.admin, {
      userId: ws.ownerUserId,
      accountId: ctx.accountId,
      actorUserId: ctx.userId,
      type: 'owner_code_used',
      meta,
      metadata: { member: await displayName(ctx.admin, ctx.userId) },
    });
    return { method: 'owner' };
  }

  // Personal.
  if (input.method === 'recovery') {
    if (!(await consumeRecoveryCode(ctx.admin, ctx.userId, input.code))) {
      return fail('invalid_recovery_code');
    }
    await markSessionVerified(ctx, meta, 'recovery');
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: 'two_factor_recovery_used',
      sessionId: ctx.sessionId,
      meta,
    });
    return { method: 'recovery' };
  }

  const secret = await activeSecret(ctx.admin, ctx.userId);
  if (!secret) {
    throw new TwoFactorError(
      'Your security settings just changed. Reload the page.',
      409,
      'requirement_changed'
    );
  }
  const result = await checkTotp(
    ctx.admin,
    ctx.userId,
    ctx.userId,
    secret,
    input.code
  );
  if (result !== 'ok') return fail(result);
  await markSessionVerified(ctx, meta, 'personal');
  await recordSecurityEvent(ctx.admin, {
    userId: ctx.userId,
    accountId: ctx.accountId,
    type: 'two_factor_verified',
    sessionId: ctx.sessionId,
    meta,
    metadata: { method: 'personal' },
  });
  return { method: 'personal' };
}
