// ============================================================
// Subscription access guards for API routes — SERVER ONLY.
//
// Proxy handles the *navigational* gate (redirecting a browser to
// /upgrade-plan). This module is the *API* gate. Both are needed:
// Proxy only sees requests the browser makes to page/route URLs,
// and a redirect is meaningless to a fetch() caller. Relying on the
// redirect alone would leave every mutation endpoint reachable by a
// lapsed account with a valid session cookie.
//
// Two independent checks live here, and they answer different questions:
//   - requireBillingOwner()      — "may this USER transact?" (owner only)
//   - requireActiveSubscription() — "may this ACCOUNT use the CRM?"
// ============================================================

import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  getCurrentAccount,
  type AccountContext,
} from '@/lib/auth/account';
import { getAccountSubscription, getGateConfig } from './queries';
import { resolveSubscriptionState, type SubscriptionState } from './status';

/**
 * Machine-readable reasons, so the client can branch on a stable code
 * rather than string-matching a human message that we might reword.
 */
export type BillingDenialCode =
  | 'subscription_required'
  | 'owner_only';

export class BillingAccessError extends Error {
  readonly status: number;
  readonly code: BillingDenialCode;
  constructor(code: BillingDenialCode, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'BillingAccessError';
  }
}

/**
 * Map billing errors to responses, falling through to the shared
 * account-context mapper for auth errors. Routes do:
 *
 *   } catch (err) { return toBillingErrorResponse(err); }
 */
export function toBillingErrorResponse(err: unknown): NextResponse {
  if (err instanceof BillingAccessError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  // Anything with a numeric `status` and a message — QuoteError,
  // SubscriptionMutationError, UpiConfigError. Their messages are
  // written for end users, so they're safe to surface.
  if (
    err instanceof Error &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return NextResponse.json(
      { error: err.message },
      { status: (err as { status: number }).status },
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error && err.name === 'UnauthorizedError') {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error('[billing] uncategorized error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/**
 * Resolve the caller's account context AND the account's live
 * subscription state in one place.
 *
 * Does not block — callers decide what to do with `state`. Read-only
 * billing endpoints need the state without being gated by it (the
 * upgrade page has to load *because* the account is expired).
 */
export async function getBillingContext(): Promise<{
  ctx: AccountContext;
  state: SubscriptionState;
}> {
  const ctx = await getCurrentAccount();
  const [row, config] = await Promise.all([
    getAccountSubscription(ctx.accountId),
    getGateConfig(),
  ]);
  return { ctx, state: resolveSubscriptionState(row, config) };
}

/**
 * Require that the caller is the account OWNER.
 *
 * Purchasing is owner-only by product decision: members who are blocked
 * get a "contact your owner" screen rather than a payment form. This is
 * the enforcement of that decision — hiding the button in the UI is not
 * access control, since the endpoint is reachable directly.
 */
export async function requireBillingOwner(): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (ctx.role !== 'owner') {
    throw new BillingAccessError(
      'owner_only',
      'Only the workspace owner can manage the subscription',
    );
  }
  return ctx;
}

/** Owner-only AND with the live subscription state attached. */
export async function requireBillingOwnerWithState(): Promise<{
  ctx: AccountContext;
  state: SubscriptionState;
}> {
  const { ctx, state } = await getBillingContext();
  if (ctx.role !== 'owner') {
    throw new BillingAccessError(
      'owner_only',
      'Only the workspace owner can manage the subscription',
    );
  }
  return { ctx, state };
}

/**
 * Gate a CRM API route on the account having access.
 *
 * Throws `BillingAccessError('subscription_required')` when the trial
 * and any paid window have both lapsed past the grace period. Use on
 * endpoints that do real work; do NOT use on the billing endpoints
 * themselves, or a lapsed account could never pay to recover.
 */
export async function requireActiveSubscription(): Promise<{
  ctx: AccountContext;
  state: SubscriptionState;
}> {
  const { ctx, state } = await getBillingContext();
  if (state.isBlocked) {
    throw new BillingAccessError(
      'subscription_required',
      'This workspace needs an active subscription to continue',
    );
  }
  return { ctx, state };
}
