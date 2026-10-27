// ============================================================
// Checkout rules — pure, no I/O (plan section 3.3).
//
// Decides, from the account's live subscription state, whether
// "Continue to pay" AUTHORISES AutoPay for a future first charge or PAYS
// NOW, and when that first charge is. The first charge always lands
// exactly where current access ends (trial end, existing paid end, or a
// paid window queued behind the trial), so nobody pays twice for the same
// days and no trial is restarted: nothing here writes trial_ends_at.
// ============================================================

import type { SubscriptionState } from '@/lib/subscription/status';
import type { BillingIntent, BillingSubscriptionStatus } from './types';

/**
 * Smallest gap between now and a deferred `start_at`.
 *
 * Phase 0 found this machine's clock about 60 s behind Razorpay's, and
 * Razorpay rejects a `start_at` that is already past on its clock. Ten
 * minutes leaves room for skew and a slow checkout; below it we charge
 * now instead, because a few minutes of coverage are not worth a mandate
 * that may fail to schedule.
 */
export const MIN_DEFER_MS = 10 * 60 * 1000;

/** How far ahead a subscription is scheduled (10 years, conservative). */
export const SUBSCRIPTION_HORIZON_DAYS = 3650;

/** Statuses that block a new checkout (an AutoPay already exists). */
export const MANDATE_STATUSES: ReadonlySet<BillingSubscriptionStatus> = new Set(
  ['authenticated', 'active', 'pending', 'halted', 'paused']
);

export function hasLiveAutopay(
  statuses: Iterable<{
    status: BillingSubscriptionStatus;
    cancel_at_cycle_end?: boolean;
  }>
): boolean {
  for (const s of statuses) {
    if (MANDATE_STATUSES.has(s.status) && !s.cancel_at_cycle_end) return true;
  }
  return false;
}

/**
 * When does the access the customer already holds end? Null when nothing
 * is open (blocked, expired, ungated or billing off).
 */
export function computeCoverageEnd(
  state: SubscriptionState,
  now: Date = new Date()
): Date | null {
  if (state.billingDisabled || state.status === 'none') return null;
  if (state.isBlocked || state.isExpired) return null;
  const candidates = [state.endsAt, state.pendingWindow?.endsAt ?? null].filter(
    (d): d is Date => d instanceof Date && d.getTime() > now.getTime()
  );
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

export interface FirstCharge {
  intent: BillingIntent;
  /** Null means "charge now" (immediate start). */
  startAt: Date | null;
}

export function computeFirstCharge(input: {
  state: SubscriptionState;
  now?: Date;
  minDeferMs?: number;
}): FirstCharge {
  const now = input.now ?? new Date();
  const coverageEnd = computeCoverageEnd(input.state, now);
  const minDefer = input.minDeferMs ?? MIN_DEFER_MS;
  if (!coverageEnd || coverageEnd.getTime() - now.getTime() <= minDefer) {
    return { intent: 'immediate', startAt: null };
  }
  const hasPaidCoverage =
    input.state.isActive || input.state.pendingWindow?.type === 'active';
  return {
    intent: hasPaidCoverage ? 'defer_to_paid_end' : 'defer_to_trial_end',
    startAt: coverageEnd,
  };
}

/**
 * Number of billing cycles to schedule: as many as fit in the horizon
 * after the deferral, at least one. Phase 0 confirmed Razorpay accepts far
 * more (about 98 years); 10 years keeps us inside every limit Razorpay
 * documents.
 */
export function computeTotalCount(
  durationDays: number,
  startAt: Date | null,
  now: Date = new Date()
): number {
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error('durationDays must be a positive integer');
  }
  const deferDays = startAt
    ? Math.max(0, Math.ceil((startAt.getTime() - now.getTime()) / 86_400_000))
    : 0;
  return Math.max(
    1,
    Math.floor((SUBSCRIPTION_HORIZON_DAYS - deferDays) / durationDays)
  );
}

/**
 * Same rule as today's `showTrialOffer` on /upgrade-plan, plus: no trial
 * offer once AutoPay exists. Shared so the page and the API agree.
 */
export function isTrialOfferVisible(input: {
  showTrialBadges: boolean;
  trialDays: number;
  isBlocked: boolean;
  billingDisabled: boolean;
  hasPaidCoverage: boolean;
  hasLiveAutopay: boolean;
}): boolean {
  return (
    input.showTrialBadges &&
    input.trialDays > 0 &&
    !input.isBlocked &&
    !input.billingDisabled &&
    !input.hasPaidCoverage &&
    !input.hasLiveAutopay
  );
}
