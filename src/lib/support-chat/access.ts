// ============================================================
// In-app support chat — SERVER ONLY. Who is calling, and which thread
// may they touch.
//
// Both audiences hit the same three routes, so one resolver decides
// which side of the conversation the caller is on. That decision is
// made HERE from the session, never from the request body — a
// `sender_kind` accepted off the wire would let a tenant post messages
// that render as coming from support.
//
// Writes use the service-role client deliberately. The tables carry
// SELECT policies for both audiences (Realtime needs them) but no client
// INSERT policy at all, because a send has invariants a policy cannot
// express: sender_kind must match the caller, account_id must come from
// the conversation rather than the request, the text must be validated
// and capped, and the correct unread counter must be bumped. Same split
// as super_admin_notifications.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { canAccessSettingsSection, type AccountRole } from '@/lib/auth/roles';
import { getSupportAccessForAccount } from './availability';
import {
  SUPPORT_CONVERSATIONS_TABLE,
  type SupportConversation,
  type SupportSenderKind,
} from './types';

export class SupportAccessError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SupportAccessError';
    this.status = status;
  }
}

export interface SupportCaller {
  userId: string;
  /** Which side this caller writes as. */
  senderKind: SupportSenderKind;
  /**
   * The account whose thread this caller is acting on.
   *
   * For a tenant it is their own account, taken from their profile. For
   * an operator it is the account they asked for — which is why the
   * operator path REQUIRES an explicit accountId and the tenant path
   * ignores any they send.
   */
  accountId: string;
  /**
   * Whether this caller may act on their side's messages generally, not
   * only their own.
   *
   * True for a workspace owner and for every operator. Used by the retract
   * route: an owner is accountable for what their team sends to us, so they
   * can withdraw a colleague's message; a member cannot.
   */
  isOwner: boolean;
  /** Service-role client. Every query must still be scoped by accountId. */
  admin: SupabaseClient;
}

/**
 * Resolve the caller and the thread they may act on.
 *
 * @param requestedAccountId Only consulted for a super admin. A tenant's
 *   value is deliberately ignored rather than rejected: the tenant UI has
 *   no reason to send one, and honouring it would be a tenancy hole one
 *   edited request wide.
 */
export async function resolveSupportCaller(
  requestedAccountId?: string | null
): Promise<SupportCaller> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    throw new SupportAccessError('Not signed in.', 401);
  }

  // One profile read answers every question: is this an operator, which
  // account do they belong to, and may they use this feature at all.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('account_id, is_super_admin, account_role, permissions')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) {
    console.error('[support-chat/access] profile read failed:', profileErr);
    throw new SupportAccessError('Could not load your account.', 503);
  }
  if (!profile) {
    throw new SupportAccessError('Your profile is not set up yet.', 403);
  }

  const admin = supabaseAdmin();

  if (profile.is_super_admin === true) {
    const accountId = (requestedAccountId ?? '').trim();
    if (!accountId) {
      throw new SupportAccessError(
        'accountId is required when replying as support.',
        400
      );
    }
    return {
      userId: user.id,
      senderKind: 'admin',
      accountId,
      // Operators are all peers on their own side of the conversation.
      isOwner: true,
      admin,
    };
  }

  if (!profile.account_id) {
    throw new SupportAccessError(
      'Your profile is not linked to a workspace.',
      403
    );
  }

  // The owner can revoke Live chat per member (Settings → Team members →
  // Permissions). Enforced HERE as well as in the rail, because a hidden
  // nav item is not access control — every route below this resolver would
  // otherwise still answer a hand-made request.
  //
  // `canAccessSettingsSection` is the same function the rail uses, so the
  // two cannot disagree: it checks the parent `settings` grant, then the
  // derived `settings_live_chat` key, and treats an absent key as allow.
  const accountRole = (profile.account_role ?? null) as AccountRole | null;
  const permissions = (profile.permissions ?? null) as Record<
    string,
    boolean | undefined
  > | null;

  // Workspace level first: whether Replai offers Live chat to this
  // workspace at all (master switch, visibility rule, per-workspace
  // override). Checked before the member permission because it is the more
  // fundamental answer — telling a member to "ask your owner" about a
  // feature the owner cannot turn on would send them on a pointless errand.
  const workspaceAccess = await getSupportAccessForAccount(
    admin,
    profile.account_id as string
  );
  if (!workspaceAccess.available) {
    throw new SupportAccessError(
      'Live chat is not available for your workspace.',
      403
    );
  }

  if (!canAccessSettingsSection(accountRole, permissions, 'live-chat')) {
    throw new SupportAccessError(
      'You do not have access to Live chat. Ask your workspace owner to enable it.',
      403
    );
  }

  return {
    userId: user.id,
    senderKind: 'account',
    accountId: profile.account_id as string,
    isOwner: accountRole === 'owner',
    admin,
  };
}

/**
 * Get the account's thread, creating it on first use.
 *
 * A tenant should not have to "start" a support conversation — opening
 * the pane is the intent. Created lazily rather than on signup so an
 * account that never asks for help carries no empty row.
 *
 * The race between two members opening the pane at the same moment is
 * handled by the UNIQUE constraint on account_id plus a re-read on
 * conflict, not by checking first and hoping: two concurrent opens both
 * see "no row" and both insert.
 */
export async function findOrCreateSupportConversation(
  admin: SupabaseClient,
  accountId: string
): Promise<SupportConversation> {
  const existing = await admin
    .from(SUPPORT_CONVERSATIONS_TABLE)
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (existing.error) {
    console.error(
      '[support-chat/access] conversation read failed:',
      existing.error
    );
    throw new SupportAccessError('Could not open the support thread.', 500);
  }
  if (existing.data) return existing.data as SupportConversation;

  const created = await admin
    .from(SUPPORT_CONVERSATIONS_TABLE)
    .insert({ account_id: accountId })
    .select('*')
    .maybeSingle();

  if (created.data) return created.data as SupportConversation;

  // 23505 = unique_violation: the other opener won. Re-read rather than
  // erroring — both callers want the same row and it now exists.
  if (created.error?.code === '23505') {
    const reread = await admin
      .from(SUPPORT_CONVERSATIONS_TABLE)
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (reread.data) return reread.data as SupportConversation;
  }

  console.error(
    '[support-chat/access] conversation create failed:',
    created.error
  );
  throw new SupportAccessError('Could not open the support thread.', 500);
}

/** Maps a thrown access error to a response body + status. */
export function supportErrorResponse(err: unknown): {
  body: { error: string };
  status: number;
} {
  if (err instanceof SupportAccessError) {
    return { body: { error: err.message }, status: err.status };
  }
  console.error('[support-chat] uncategorized error:', err);
  return { body: { error: 'Something went wrong.' }, status: 500 };
}
