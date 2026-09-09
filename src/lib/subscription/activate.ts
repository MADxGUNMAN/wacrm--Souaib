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
      'Specify a duration of at least one day or one month'
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
 * Renewal semantics (updated Aug 2026 for window stacking):
 *
 *   1. If the account has an ACTIVE TRIAL (`trial_ends_at > now`
 *      and stored status is `trialing`), the paid window is QUEUED
 *      behind the trial. The paid window starts at `trial_ends_at`,
 *      status stays `trialing`, and the resolver exposes the paid
 *      window via `pendingWindow`. The user keeps their remaining
 *      trial days, then the subscription takes over.
 *
 *   2. If the account already has a paid window (`subscription_ends_at
 *      > now`), the new window EXTENDS from the current end date.
 *
 *   3. Otherwise (lapsed or no window), the window starts now.
 *
 *   `resolveRenewalStart` owns the decision for cases 2 and 3.
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

  // ---- Window-stacking: queue paid behind an active trial ----
  const trialEndsAt = current.trial_ends_at
    ? new Date(current.trial_ends_at)
    : null;
  const trialIsOpen =
    trialEndsAt !== null &&
    trialEndsAt.getTime() > now.getTime() &&
    current.subscription_status === 'trialing';

  // When no explicit start was given, decide where the paid window begins:
  //   - active trial → start from trial_ends_at (queue behind trial)
  //   - existing paid → extend from subscription_ends_at
  //   - otherwise → now
  const startsAt =
    input.startAt ??
    (trialIsOpen
      ? resolveRenewalStart(
          // If a paid window already exists AND ends later than the
          // trial, extend from the paid end. Otherwise start from
          // the trial end.
          current.subscription_ends_at &&
            new Date(current.subscription_ends_at).getTime() >
              trialEndsAt!.getTime()
            ? current.subscription_ends_at
            : current.trial_ends_at,
          now
        )
      : resolveRenewalStart(current.subscription_ends_at, now));
  const endsAt = addDuration(startsAt, input.duration);

  if (endsAt.getTime() <= now.getTime()) {
    throw new SubscriptionMutationError(
      'That duration would end in the past. Check the values and try again.'
    );
  }

  const extended = startsAt.getTime() > now.getTime();

  // When the trial is still open, keep the status as 'trialing' so the
  // resolver knows the user is inside their trial. The paid window sits
  // behind it and becomes active automatically when the trial expires.
  const newStatus: SubscriptionStatus = trialIsOpen ? 'trialing' : 'active';

  const { error } = await admin
    .from('accounts')
    .update({
      subscription_status: newStatus,
      subscription_plan_id:
        input.planId ?? current.subscription_plan_id ?? null,
      subscription_plan_name:
        input.planName ?? current.subscription_plan_name ?? null,
      subscription_cycle_label:
        input.cycleLabel ?? current.subscription_cycle_label ?? null,
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
      500
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: extended ? 'subscription_extended' : 'subscription_activated',
    fromStatus: current.subscription_status,
    toStatus: newStatus,
    endsAt,
    planName: input.planName ?? current.subscription_plan_name ?? null,
    cycleLabel: input.cycleLabel ?? current.subscription_cycle_label ?? null,
    amount: input.amount ?? null,
    paymentRequestId: input.paymentRequestId ?? null,
    actorUserId: input.actorUserId ?? null,
    note: trialIsOpen
      ? (input.note ??
        `Paid window queued behind trial (trial ends ${trialEndsAt!.toISOString().slice(0, 10)})`)
      : (input.note ?? null),
    durationDays: input.duration.days ?? null,
    durationMonths: input.duration.days
      ? null
      : (input.duration.months ?? null),
    previousEndsAt: current.subscription_ends_at ?? null,
    windowKind: 'paid',
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
      500
    );
  }
  if (!existing) {
    throw new SubscriptionMutationError('Payment request not found', 404);
  }
  if (existing.status !== 'pending') {
    throw new SubscriptionMutationError(
      `This request was already ${existing.status}`,
      409
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

  // ---- Window-stacking: queue paid behind an active trial ----
  const trialEnd = account?.trial_ends_at
    ? new Date(account.trial_ends_at)
    : null;
  const trialIsOpen =
    trialEnd !== null &&
    trialEnd.getTime() > now.getTime() &&
    account?.subscription_status === 'trialing';

  const startsAt = trialIsOpen
    ? resolveRenewalStart(
        account?.subscription_ends_at &&
          new Date(account.subscription_ends_at).getTime() > trialEnd!.getTime()
          ? account.subscription_ends_at
          : account?.trial_ends_at,
        now
      )
    : resolveRenewalStart(account?.subscription_ends_at, now);
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
      500
    );
  }
  if (!claimed || claimed.length === 0) {
    throw new SubscriptionMutationError(
      'This request was reviewed by someone else a moment ago. Reload to see its current state.',
      409
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
      500
    );
  }
  if (!claimed || claimed.length === 0) {
    // Either it doesn't exist or it's already been reviewed. Same
    // conflict response — the admin's next move is to reload either way.
    throw new SubscriptionMutationError(
      'That request is no longer pending. Reload to see its current state.',
      409
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
      500
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
    // No duration — a block is not a span of time. But recording the date
    // it overrode matters: it is how you see how much access the customer
    // still had left when they were cut off.
    previousEndsAt: current?.subscription_ends_at ?? null,
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
      500
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
    // Which window was cut short, and the date it would otherwise have
    // run to — the two facts that make this event reviewable later.
    windowKind: hasPaidWindow ? 'paid' : 'trial',
    previousEndsAt: hasPaidWindow
      ? (current.subscription_ends_at ?? null)
      : (current.trial_ends_at ?? null),
  });

  return { mode: hasPaidWindow ? 'paid' : 'trial', endsAt: now };
}

/**
 * End ONE specific window right now, leaving the other untouched.
 *
 * `expireNow` (above) auto-detects which window to end, and that guess
 * is wrong exactly in the case that prompted this function: an account
 * can have BOTH a trial and a paid window at once (window stacking —
 * see the module comment), and the admin may want to end only one of
 * them. Concretely:
 *
 *   - End the trial while a paid plan is still queued behind it → the
 *     paid plan should take over immediately, not get cancelled.
 *   - Cancel a queued/active paid plan while a trial is still running
 *     → the trial should keep counting down, untouched.
 *
 * Each branch only ever writes the ONE date column it names. That is
 * deliberate and is what makes the two calls independent: expiring the
 * trial does not require knowing anything about the paid window's
 * state (the resolver's fallthrough already prefers whichever window
 * is still open), and vice versa.
 */
export async function expireWindow(input: {
  accountId: string;
  which: 'trial' | 'paid';
  actorUserId: string;
  note?: string | null;
}): Promise<{ which: 'trial' | 'paid'; endsAt: Date }> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const now = new Date();
  const iso = now.toISOString();

  const patch: Record<string, unknown> =
    input.which === 'trial'
      ? { trial_ends_at: iso }
      : { subscription_ends_at: iso };

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
      `Could not expire the ${input.which} window: ${error.message}`,
      500
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'subscription_expired',
    fromStatus: current.subscription_status,
    toStatus: current.subscription_status,
    endsAt: now,
    planName: current.subscription_plan_name ?? null,
    cycleLabel: current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note:
      input.note ??
      `${input.which === 'trial' ? 'Trial' : 'Paid subscription'} ended immediately by a platform admin`,
    windowKind: input.which,
    previousEndsAt:
      input.which === 'trial'
        ? (current.trial_ends_at ?? null)
        : (current.subscription_ends_at ?? null),
  });

  return { which: input.which, endsAt: now };
}

/**
 * End BOTH windows at once — the third option next to "expire trial
 * only" and "expire paid only". One account update (both date columns
 * in the same write, so there's no instant in between where only one
 * has closed) and two audit rows, since `window_kind` on
 * `subscription_events` is a single value and each window's own
 * "what date did this replace" deserves its own row.
 */
export async function expireBothWindows(input: {
  accountId: string;
  actorUserId: string;
  note?: string | null;
}): Promise<{ endsAt: Date }> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const now = new Date();
  const iso = now.toISOString();

  const { error } = await admin
    .from('accounts')
    .update({
      trial_ends_at: iso,
      subscription_ends_at: iso,
      subscription_updated_by_user_id: input.actorUserId,
      subscription_note: input.note ?? null,
    })
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not expire the account's access: ${error.message}`,
      500
    );
  }

  const note =
    input.note ??
    'Trial and paid subscription both ended immediately by a platform admin';

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'subscription_expired',
    fromStatus: current.subscription_status,
    toStatus: current.subscription_status,
    endsAt: now,
    planName: current.subscription_plan_name ?? null,
    cycleLabel: current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note,
    windowKind: 'trial',
    previousEndsAt: current.trial_ends_at ?? null,
  });
  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'subscription_expired',
    fromStatus: current.subscription_status,
    toStatus: current.subscription_status,
    endsAt: now,
    planName: current.subscription_plan_name ?? null,
    cycleLabel: current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note,
    windowKind: 'paid',
    previousEndsAt: current.subscription_ends_at ?? null,
  });

  return { endsAt: now };
}

/**
 * Correct the TRIAL's end date to an exact value, the trial-side
 * counterpart of the `set_end_date` action (which only ever touched
 * `subscription_ends_at`). Added because the paid window had a "fix the
 * date" escape hatch and the trial window did not — an admin who put in
 * a wrong number of trial days had no way to correct it without going
 * through the day-count math of `extend_trial` again.
 *
 * Deliberately leaves `subscription_status` exactly as stored. Unlike
 * `set_end_date`, which forces `status: 'active'` because setting a
 * paid end date only ever makes sense when paid access is/becomes the
 * live window, correcting a trial date must NOT flip status — the
 * account might currently be inside a paid window with this trial
 * merely queued behind it, and this call should not disturb that.
 */
export async function setTrialEndDate(input: {
  accountId: string;
  trialEndsAt: Date;
  actorUserId: string;
  note?: string | null;
}): Promise<void> {
  const admin = supabaseAdmin();
  const current = await getAccountSubscription(input.accountId);
  if (!current) {
    throw new SubscriptionMutationError('Account not found', 404);
  }

  const { error } = await admin
    .from('accounts')
    .update({
      trial_ends_at: input.trialEndsAt.toISOString(),
      subscription_updated_by_user_id: input.actorUserId,
      subscription_note: input.note ?? null,
    })
    .eq('id', input.accountId);

  if (error) {
    throw new SubscriptionMutationError(
      `Could not update the trial end date: ${error.message}`,
      500
    );
  }

  await logSubscriptionEvent({
    accountId: input.accountId,
    eventType: 'trial_extended',
    fromStatus: current.subscription_status,
    toStatus: current.subscription_status,
    endsAt: input.trialEndsAt,
    planName: current.subscription_plan_name ?? null,
    cycleLabel: current.subscription_cycle_label ?? null,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
    windowKind: 'trial',
    previousEndsAt: current.trial_ends_at ?? null,
  });
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
  /**
   * For the audit trail only (migration 081) — how many days the operator
   * asked for. Does not affect the dates, which the caller has already
   * resolved; this records the INTENT so "Trial extended" can say by how
   * much instead of only showing the resulting date.
   */
  durationDays?: number | null;
  /** Which window this write is about, when it is not implied by a trial date. */
  windowKind?: 'paid' | 'trial' | null;
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
    patch.subscription_ends_at = input.endsAt
      ? input.endsAt.toISOString()
      : null;
  }
  if (input.trialEndsAt !== undefined) {
    patch.trial_ends_at = input.trialEndsAt
      ? input.trialEndsAt.toISOString()
      : null;
  }

  // --- Window coexistence (Aug 2026) ---
  // Both a trial and a paid window may coexist now (queued windows).
  // The resolver uses stored status to decide which is primary and
  // falls through to the other when the primary expires.
  //
  // Only clear the OTHER window when it is STALE (in the past) and
  // would confuse the resolver. A future-dated other window is a
  // legitimate queue entry and must be preserved.
  if (
    input.status === 'trialing' &&
    input.trialEndsAt &&
    input.endsAt === undefined
  ) {
    // Clear stale paid window only — a future paid window is a queue.
    const currentPaidEnd = current.subscription_ends_at
      ? new Date(current.subscription_ends_at)
      : null;
    if (!currentPaidEnd || currentPaidEnd.getTime() <= Date.now()) {
      patch.subscription_ends_at = null;
    }
  }
  if (input.planId !== undefined) patch.subscription_plan_id = input.planId;
  if (input.planName !== undefined)
    patch.subscription_plan_name = input.planName;
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
      500
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
    // Migration 081. This path serves both trial extension and a direct
    // status write, so the window and duration are whatever the caller
    // supplied rather than assumed — a bare status change has neither.
    durationDays: input.durationDays ?? null,
    windowKind: input.trialEndsAt ? 'trial' : (input.windowKind ?? null),
    previousEndsAt: input.trialEndsAt
      ? (current.trial_ends_at ?? null)
      : (current.subscription_ends_at ?? null),
  });
}
