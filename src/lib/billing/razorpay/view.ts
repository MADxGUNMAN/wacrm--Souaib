// ============================================================
// What the browser is allowed to see about an AutoPay subscription.
// Pure projection of a `billing_subscriptions` row.
//
// Deliberately narrow: no provider customer id, no internal error text,
// no anomaly notes, no short_url (the payment page opens Checkout itself).
// The failure reason is converted to plain language here, so raw
// Razorpay wording never reaches a customer.
// ============================================================

import {
  autopayDisplayState,
  customerFailureMessage,
  type AutopayDisplay,
} from './mapping';
import type {
  BillingIntent,
  BillingSubscriptionRow,
  BillingSubscriptionStatus,
} from './types';

export interface AutopayView {
  id: string;
  status: BillingSubscriptionStatus;
  display: AutopayDisplay;
  /**
   * A working mandate that will charge: authorised, active or retrying,
   * and not ending at period end. While true there is nothing to buy.
   */
  hasMandate: boolean;
  /**
   * The mandate exists but will not charge (stopped after failed retries,
   * or paused). Setting up AutoPay again replaces it (plan section 4,
   * rows 11 and 24).
   */
  canReplace: boolean;
  intent: BillingIntent;
  /** Catalogue ids, for "Renew" / "Set up again" links. Null if since deleted. */
  planId: string | null;
  cycleId: string | null;
  planName: string;
  cycleLabel: string;
  amountMinor: number;
  currency: string;
  durationDays: number;
  /** First scheduled charge (deferred start). */
  firstChargeAt: string | null;
  /** Next charge Razorpay has scheduled. */
  nextChargeAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtCycleEnd: boolean;
  method: {
    type: string | null;
    network: string | null;
    last4: string | null;
    vpaMasked: string | null;
  } | null;
  /** Plain-language reason for the latest failed attempt, if any. */
  lastFailure: string | null;
}

/** Mandates that will charge. */
const WORKING: ReadonlySet<BillingSubscriptionStatus> = new Set([
  'authenticated',
  'active',
  'pending',
]);

/** Mandates that exist but will not charge; a new checkout replaces them. */
export const REPLACEABLE: ReadonlySet<BillingSubscriptionStatus> = new Set([
  'halted',
  'paused',
]);

function s(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function buildAutopayView(
  row: BillingSubscriptionRow,
  extras: {
    currentCyclePaid: boolean;
    lastFailure: {
      error_code: string | null;
      error_reason: string | null;
    } | null;
  }
): AutopayView | null {
  const display = autopayDisplayState({
    status: row.status,
    cancelAtCycleEnd: row.cancel_at_cycle_end,
    currentCyclePaid: extras.currentCyclePaid,
  });
  if (display.key === 'hidden') return null;

  const summary = row.method_summary ?? null;
  return {
    id: row.id,
    status: row.status,
    display,
    hasMandate: WORKING.has(row.status) && !row.cancel_at_cycle_end,
    canReplace: REPLACEABLE.has(row.status),
    intent: row.intent,
    planId: row.plan_id,
    cycleId: row.cycle_id,
    planName: row.plan_name,
    cycleLabel: row.cycle_label,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    durationDays: row.duration_days,
    firstChargeAt: row.start_at,
    nextChargeAt: row.charge_at,
    currentPeriodEnd: row.current_end,
    cancelAtCycleEnd: row.cancel_at_cycle_end,
    method: summary
      ? {
          type: s(summary.method) ?? row.payment_method,
          network: s(summary.network),
          last4: s(summary.last4),
          vpaMasked: s(summary.vpa_masked),
        }
      : row.payment_method
        ? {
            type: row.payment_method,
            network: null,
            last4: null,
            vpaMasked: null,
          }
        : null,
    lastFailure: extras.lastFailure
      ? customerFailureMessage(
          extras.lastFailure.error_code,
          extras.lastFailure.error_reason
        )
      : null,
  };
}
