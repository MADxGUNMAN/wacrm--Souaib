// ============================================================
// Subscription mutations — SERVER ONLY (service role).
//
// Every state change to an account's subscription funnels through this
// module: approving a payment, rejecting one, granting/extending access
// by hand, and revoking it. Centralised so the window arithmetic and
// the audit trail can't drift between call sites.
//
// The concurrency rule that shapes this file: **claim before you
// grant.** Approving a payment is two writes (mark the request
// approved, then extend the account). If we extended first, a
// double-clicked Approve button — or two admins reviewing the same
// queue — would extend the subscription twice for one payment. So we
// always flip `payment_requests.status` from 'pending' with a
// conditional UPDATE first and check the affected row count. The second
// caller finds nothing to claim and stops. Postgres makes that
// conditional update atomic, so no explicit lock is needed.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  addDuration,
  resolveCycleDuration,
  resolveRenewalStart,
} from './status';
import { toAmount } from './plans';
import { getAccountSubscription, logSubscriptionEvent } from './queries';
import type { PaymentRequest, SubscriptionStatus } from './types';

export class SubscriptionMutationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'SubscriptionMutationError';
  }
}

/** A duration to grant. `days` wins over `months` when both are set. */
export interface GrantDuration {
  months?: number | null;
  days?: number | null;
}

function assertUsableDuration(duration: GrantDuration): void {
  const days = duration.days ?? 0;
  const months = duration.months ?? 0;
  if (days <= 0 && months <= 0) {
    throw new SubscriptionMutationError(
      'Specify a duration of at least one day or one month',
    );
  }
}

export interface ActivateResult {
  accountId: string;
  fromStatus: SubscriptionStatus | null;
  startsAt: Date;
  endsAt: Date;
  /** True when the grant extended an already-active window. */
  extended: boolean;
}

/**
 * Grant or extend paid access on an account.
 *
 * Renewal semantics: if the account still has time left, the new window
 * starts at the CURRENT end date, not today — paying early must never
 * cost the customer their remaining days. Once lapsed, the window
 * starts now. `resolveRenewalStart` owns that decision.
 */
export async function activateSubscription(input: {
  accountId: string;
  planId?: string | null;
  planName?: string | null;
  cycleLabel?: string | null;
  duration: GrantDuration;
  actorUserId?: string | null;
  paymentRequestId?: string | null;
  amount?: number | null;
  note?: string | null;
  /** Explicit start override. Defaults to the renewal-aware start. */
  startAt?: Date | null;
}): Promise<ActivateResult> {
  assertUsableDuration(input.duration);

  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const now = new Date();
  const startsAt =
    input.startAt ?? resolveRenewalStart(current.subscription_ends_at, now);
  const endsAt = addDuration(startsAt, input.duration);

  if (endsAt.getTime() <= now.getTime()) {
    // Would grant an already-expired window — almost certainly an
    // operator typo (negative days, a past start override). Refuse
    // rather than silently locking the customer out.
    throw new SubscriptionMutationError(
      'That duration would end in the past. Check the values and try again.',
    );
  }

  const extended = startsAt.getTime() > now.getTime();

  const { error } = await admin
    .from('accounts')
    .update({
      subscription_status: 'active' satisfies SubscriptionStatus,
      subscription_plan_id: input.planId ?? current.subscription_plan_id ?? null,
      subscription_plan_name:
        input.planName ?? current.subscription_plan_name ?? null,
      subscription_cycle_label:
        input.cycleLabel ?? current.subscription_cycle_label ?? null,
      // Preserve the original start across renewals so "customer since"
      // stays meaningful; only set it on a fresh activation.
      subscription_started_at:
        current.subscription_started_at ?? startsAt.toISOString(),
      subscription_ends_at: endsAt.toISOString(),
      subscription_updated_by_user_id: input.actorUserId ?? null,
      subscription_note: input.note ?? null,
    })
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not activate the subscription: ${error.message}`,
      500,
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: extended ? 'subscription_extended' : 'subscription_activated',
    fromStatus: current.subscription_status,
    toStatus: 'active',
    endsAt,
    planName: input.planName ?? current.subscription_plan_name ?? null,
    cycleLabel: input.cycleLabel ?? current.subscription_cycle_label ?? null,
    amount: input.amount ?? null,
    paymentRequestId: input.paymentRequestId ?? null,
    actorUserId: input.actorUserId ?? null,
    note: input.note ?? null,
  });

  return {
    accountId: input.accountId,
    fromStatus: current.subscription_status,
    startsAt,
    endsAt,
    extended,
  };
}

/**
 * Approve a pending payment and activate the matching subscription.
 *
 * `durationOverride` lets the reviewing admin grant something other
 * than the purchased cycle — the common cases being a goodwill top-up,
 * or a payer who transferred a different amount than the plan price and
 * agreed a shorter term. When omitted, the duration snapshotted on the
 * request at submit time is used, so a later edit to the cycle cannot
 * retroactively change what an approved payment buys.
 */
export async function approvePaymentRequest(input: {
  requestId: string;
  actorUserId: string;
  durationOverride?: GrantDuration | null;
  note?: string | null;
}): Promise<{ request: PaymentRequest; activation: ActivateResult }> {
  const admin = supabaseAdmin();

  const { data: existing, error: readErr } = await admin
    .from('payment_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle();

  if (readErr) {
    throw new SubscriptionMutationError(
      `Could not load the payment request: ${readErr.message}`,
      500,
    );
  }
  if (!existing) {
    throw new SubscriptionMutationError('Payment request not found', 404);
  }
  if (existing.status !== 'pending') {
    throw new SubscriptionMutationError(
      `This request was already ${existing.status}`,
      409,
    );
  }

  const duration: GrantDuration = input.durationOverride?.days
    ? { days: input.durationOverride.days }
    : input.durationOverride?.months
      ? { months: input.durationOverride.months }
      : resolveCycleDuration({
          months: existing.cycle_months,
          duration_days: existing.cycle_duration_days,
        });

  assertUsableDuration(duration);

  // Work out the window before claiming, so the values we stamp on the
  // request match what the account will get.
  const account = await getAccountSubscription(existing.account_id);
  const now = new Date();
  const startsAt = resolveRenewalStart(account?.subscription_ends_at, now);
  const endsAt = addDuration(startsAt, duration);

  // ---- CLAIM ----
  // Conditional on status still being 'pending'. If a concurrent
  // approval already claimed it, this matches zero rows and we bail
  // BEFORE touching the account — which is what prevents one payment
  // from granting two subscription windows.
  const { data: claimed, error: claimErr } = await admin
    .from('payment_requests')
    .update({
      status: 'approved',
      reviewed_by_user_id: input.actorUserId,
      reviewed_at: now.toISOString(),
      review_note: input.note ?? null,
      activated_from: startsAt.toISOString(),
      activated_until: endsAt.toISOString(),
    })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*');

  if (claimErr) {
    throw new SubscriptionMutationError(
      `Could not approve the payment: ${claimErr.message}`,
      500,
    );
  }
  if (!claimed || claimed.length === 0) {
    throw new SubscriptionMutationError(
      'This request was reviewed by someone else a moment ago. Reload to see its current state.',
      409,
    );
  }

  const request = claimed[0] as PaymentRequest;

  await logSubscriptionEvent({
    accountId: request.account_id,
    eventType: 'payment_approved',
    planName: request.plan_name_snapshot,
    cycleLabel: request.cycle_label_snapshot,
    amount: toAmount(request.paid_amount),
    paymentRequestId: request.id,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });

  // ---- GRANT ----
  // Pass the start we already computed so the account window matches
  // `activated_from`/`activated_until` exactly, rather than being
  // recomputed a few milliseconds later.
  const activation = await activateSubscription({
    accountId: request.account_id,
    planId: request.plan_id,
    planName: request.plan_name_snapshot,
    cycleLabel: request.cycle_label_snapshot,
    duration,
    actorUserId: input.actorUserId,
    paymentRequestId: request.id,
    amount: toAmount(request.paid_amount),
    note: input.note ?? null,
    startAt: startsAt,
  });

  return {
    request: {
      ...request,
      expected_amount: toAmount(request.expected_amount),
      paid_amount: toAmount(request.paid_amount),
    },
    activation,
  };
}

/**
 * Reject a pending payment.
 *
 * Rejecting also releases the UTR: the live-reference unique index only
 * covers non-rejected rows, so a payer who mistyped their transaction
 * id can resubmit the corrected one. `review_note` is the message the
 * customer sees, so the caller should supply a reason.
 */
export async function rejectPaymentRequest(input: {
  requestId: string;
  actorUserId: string;
  note?: string | null;
}): Promise<PaymentRequest> {
  const admin = supabaseAdmin();

  const { data: claimed, error } = await admin
    .from('payment_requests')
    .update({
      status: 'rejected',
      reviewed_by_user_id: input.actorUserId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note ?? null,
    })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*');

  if (error) {
    throw new SubscriptionMutationError(
      `Could not reject the payment: ${error.message}`,
      500,
    );
  }
  if (!claimed || claimed.length === 0) {
    // Either it doesn't exist or it's already been reviewed. Same
    // conflict response — the admin's next move is to reload either way.
    throw new SubscriptionMutationError(
      'That request is no longer pending. Reload to see its current state.',
      409,
    );
  }

  const request = claimed[0] as PaymentRequest;

  await logSubscriptionEvent({
    accountId: request.account_id,
    eventType: 'payment_rejected',
    planName: request.plan_name_snapshot,
    cycleLabel: request.cycle_label_snapshot,
    amount: toAmount(request.paid_amount),
    paymentRequestId: request.id,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });

  return {
    ...request,
    expected_amount: toAmount(request.expected_amount),
    paid_amount: toAmount(request.paid_amount),
  };
}

/**
 * Revoke access immediately, regardless of the stored end date.
 *
 * Sets the status to `expired`, which `resolveSubscriptionState` treats
 * as an override that beats an open window — so a mistaken activation
 * or a chargeback takes effect on the customer's next request rather
 * than whenever the date happens to pass.
 */
export async function revokeSubscription(input: {
  accountId: string;
  actorUserId: string;
  note?: string | null;
}): Promise<void> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);

  const { error } = await admin
    .from('accounts')
    .update({
      subscription_status: 'expired' satisfies SubscriptionStatus,
      subscription_updated_by_user_id: input.actorUserId,
      subscription_note: input.note ?? null,
    })
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not revoke the subscription: ${error.message}`,
      500,
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'subscription_revoked',
    fromStatus: current?.subscription_status ?? null,
    toStatus: 'expired',
    planName: current?.subscription_plan_name ?? null,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });
}

/**
 * End an account's CURRENT access window right now, through the NATURAL
 * expiry path.
 *
 * Distinct from {@link revokeSubscription} in a way that matters for both
 * testing and support:
 *
 *   revoke    — forces `subscription_status = 'expired'`, which
 *               `resolveSubscriptionState` treats as an override beating
 *               any open window. Right for a chargeback or a mistaken
 *               activation, but it is NOT how a real lapse looks.
 *   expireNow — leaves the status alone and moves the governing DATE to
 *               this instant, so the account lapses exactly as it would
 *               on the morning its trial or subscription ran out. This
 *               exercises the date-derived branch of the resolver rather
 *               than the override branch, which is what you want when
 *               verifying real customer behaviour.
 *
 * Which date it moves mirrors how `resolveSubscriptionState` decides
 * which window governs — a paid window always wins over a trial:
 *
 *   paid account  -> `subscription_ends_at = now`, status stays `active`
 *   trial account -> `trial_ends_at = now`, status stays `trialing`,
 *                    and any stale paid window is cleared so it cannot
 *                    keep the account alive
 *
 * Reversible from the same UI: "Grant / extend paid access" for a paid
 * account, "Extend trial" for a trial one.
 */
export async function expireNow(input: {
  accountId: string;
  actorUserId: string;
  note?: string | null;
}): Promise<{ mode: 'paid' | 'trial'; endsAt: Date }> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const now = new Date();
  const iso = now.toISOString();

  // Same precedence rule the resolver uses: if a paid window exists at
  // all, it is the one that governs, so it is the one to expire.
  const hasPaidWindow =
    current.subscription_status === 'active' ||
    current.subscription_ends_at !== null;

  const patch: Record<string, unknown> = hasPaidWindow
    ? {
        subscription_status: 'active' satisfies SubscriptionStatus,
        subscription_ends_at: iso,
      }
    : {
        subscription_status: 'trialing' satisfies SubscriptionStatus,
        trial_ends_at: iso,
        // A stale paid window would take precedence and keep the account
        // active, making the expired-trial state unreachable.
        subscription_ends_at: null,
      };

  const { error } = await admin
    .from('accounts')
    .update({
      ...patch,
      subscription_updated_by_user_id: input.actorUserId,
      subscription_note: input.note ?? null,
    })
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not expire the current window: ${error.message}`,
      500,
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'subscription_expired',
    fromStatus: current.subscription_status,
    toStatus: hasPaidWindow ? 'active' : 'trialing',
    endsAt: now,
    planName: current.subscription_plan_name ?? null,
    cycleLabel: current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note:
      input.note ??
      `${hasPaidWindow ? 'Subscription' : 'Trial'} ended immediately by a platform admin`,
  });

  return { mode: hasPaidWindow ? 'paid' : 'trial', endsAt: now };
}

/**
 * Set an account's subscription state directly.
 *
 * The operator escape hatch behind the super admin "Subscribers" tab:
 * grant a bespoke window, extend a trial, or mark an account `none` so
 * it's never gated (internal/demo workspaces).
 */
export async function setSubscriptionState(input: {
  accountId: string;
  status: SubscriptionStatus;
  endsAt?: Date | null;
  trialEndsAt?: Date | null;
  planId?: string | null;
  planName?: string | null;
  cycleLabel?: string | null;
  actorUserId: string;
  note?: string | null;
}): Promise<void> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const patch: Record<string, unknown> = {
    subscription_status: input.status,
    subscription_updated_by_user_id: input.actorUserId,
    subscription_note: input.note ?? null,
  };

  if (input.endsAt !== undefined) {
    patch.subscription_ends_at = input.endsAt ? input.endsAt.toISOString() : null;
  }
  if (input.trialEndsAt !== undefined) {
    patch.trial_ends_at = input.trialEndsAt
      ? input.trialEndsAt.toISOString()
      : null;
  }
  if (input.planId !== undefined) patch.subscription_plan_id = input.planId;
  if (input.planName !== undefined) patch.subscription_plan_name = input.planName;
  if (input.cycleLabel !== undefined) {
    patch.subscription_cycle_label = input.cycleLabel;
  }
  if (input.status === 'active' && !current.subscription_started_at) {
    patch.subscription_started_at = new Date().toISOString();
  }

  const { error } = await admin
    .from('accounts')
    .update(patch)
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not update the subscription: ${error.message}`,
      500,
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType:
      input.status === 'expired'
        ? 'subscription_revoked'
        : input.trialEndsAt
          ? 'trial_extended'
          : 'subscription_activated',
    fromStatus: current.subscription_status,
    toStatus: input.status,
    endsAt: input.endsAt ?? input.trialEndsAt ?? null,
    planName: input.planName ?? current.subscription_plan_name ?? null,
    cycleLabel: input.cycleLabel ?? current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });
}
