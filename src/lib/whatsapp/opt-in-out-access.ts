// ============================================================
// Shared access resolution for the opt-in/out routes.
//
// Extracted so `/api/whatsapp/opt-in-out` and its `/list` sibling cannot
// drift on who may read and who may write. Two hand-rolled copies of a
// permission check is how one of them ends up more permissive than the
// other after a later edit.
//
// The tiers, and why they differ:
//
//   READ  — owner, or a member whose `settings_opt_out` key is not
//           explicitly false. Knowing that STOP unsubscribes people is
//           useful context for anyone working the inbox and reveals
//           nothing sensitive.
//
//   CONFIG WRITE — owner only. Keywords and confirmation wording are a
//           compliance control; a member who could clear them makes the
//           safeguard pointless. Mirrors `opt_in_out_configs_write` RLS.
//
//   LIST WRITE (re-subscribing one number) — member tier, matching
//           `marketing_opt_outs_write` RLS and the per-contact control
//           that already exists in the Inbox sidebar. Putting a customer
//           back on the list after they asked in conversation is ordinary
//           inbox work, not a settings change.
// ============================================================

import type { createClient } from '@/lib/supabase/server';

export interface OptInOutCaller {
  userId: string;
  accountId: string;
  isOwner: boolean;
  canRead: boolean;
}

export interface OptInOutCallerError {
  error: string;
  status: number;
}

export async function resolveOptInOutCaller(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<OptInOutCaller | OptInOutCallerError> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const { data: profile } = await supabase
    .from('profiles')
    // Keyed on user_id, NOT id — `profiles.id` is its own PK and matching
    // on it silently returns nothing.
    .select('account_id, account_role, permissions')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return {
      error: 'Your profile is not linked to an account.',
      status: 403,
    };
  }

  const isOwner = profile?.account_role === 'owner';
  const permissions = (profile?.permissions ?? null) as Record<
    string,
    boolean | undefined
  > | null;

  // Absent key means ALLOW, matching `canAccessSettingsSection`'s default
  // for panes outside OWNER_ONLY_SETTINGS_SECTIONS.
  const canRead = isOwner || permissions?.settings_opt_out !== false;

  return { userId: user.id, accountId, isOwner, canRead };
}

export function isCallerError(
  caller: OptInOutCaller | OptInOutCallerError
): caller is OptInOutCallerError {
  return 'error' in caller;
}
