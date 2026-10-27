// ============================================================
// Super-admin re-authentication for destructive actions — SERVER ONLY.
//
// The super admin re-enters their password, plus their authenticator
// code when they use 2FA. Shared by account deletion (step 1) and the
// Razorpay AutoPay cancel, so both refuse with identical messages and
// codes. Callers rate limit BEFORE calling this.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { verifyPassword } from '@/lib/super-admin/account-deletion';
import { hasActiveTwoFactor, verifyUserTotp } from '@/lib/two-factor/server';

export type ReauthFailureCode =
  'invalid_password' | 'two_factor_code_required' | 'invalid_two_factor_code';

export type ReauthResult =
  | { ok: true }
  | { ok: false; status: 401; error: string; code: ReauthFailureCode };

export async function verifySuperAdminReauth(
  admin: SupabaseClient,
  sa: { userId: string; email: string },
  input: { password: unknown; code?: unknown },
  logTag: string,
  logContext: Record<string, unknown> = {}
): Promise<ReauthResult> {
  if (!(await verifyPassword(sa.email, input.password))) {
    console.warn(`[${logTag}] wrong password`, {
      admin: sa.userId,
      ...logContext,
    });
    return {
      ok: false,
      status: 401,
      error: 'Incorrect password.',
      code: 'invalid_password',
    };
  }

  if (await hasActiveTwoFactor(admin, sa.userId)) {
    if (input.code === undefined || input.code === '') {
      return {
        ok: false,
        status: 401,
        error: 'Enter the code from your authenticator app.',
        code: 'two_factor_code_required',
      };
    }
    const r = await verifyUserTotp(admin, sa.userId, input.code);
    if (r !== 'ok') {
      return {
        ok: false,
        status: 401,
        error:
          r === 'reused'
            ? 'That code was already used. Wait for the next one.'
            : 'That authenticator code is not valid.',
        code: 'invalid_two_factor_code',
      };
    }
  }
  return { ok: true };
}
