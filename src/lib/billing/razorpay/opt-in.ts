// ============================================================
// Opt-in AutoPay prompt for existing customers (Razorpay Phase 6, plan
// sections 3.4 flow D, 8.1 and 8.3). Pure and browser-safe.
//
// Existing manual-UPI and trial customers are never migrated: nothing is
// created for them and their paid days stand. When their account is on
// Razorpay they are invited to set up AutoPay, and the first charge is
// deferred to the end of the access they already hold (same rule as
// `computeCoverageEnd` in checkout.ts). The Billing AutoPay card and the
// /upgrade-plan coverage notice both render these exact words.
//
// Dates are IST (formatBillingDate), like the charges themselves.
// ============================================================

import { formatBillingDate } from './format';

export type AutopayOptInKind = 'paid' | 'trial' | 'lapsed' | 'none';

export interface AutopayOptIn {
  kind: AutopayOptInKind;
  /** ISO end of current access, where a deferred first charge would land. */
  renewsOn: string | null;
  headline: string;
  detail: string;
}

export interface AutopayOptInState {
  isTrialing: boolean;
  isActive: boolean;
  isExpired: boolean;
  isBlocked: boolean;
  billingDisabled: boolean;
  endsAt: string | null;
  pendingWindow: { type: string; endsAt: string } | null;
}

const NONE: AutopayOptIn = {
  kind: 'none',
  renewsOn: null,
  headline: '',
  detail: '',
};

function coverageEnd(state: AutopayOptInState, now: Date): Date | null {
  if (state.isBlocked || state.isExpired) return null;
  const ends = [state.endsAt, state.pendingWindow?.endsAt ?? null]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && t > now.getTime());
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends));
}

export function autopayOptIn(input: {
  paymentProvider: 'manual_upi' | 'razorpay' | undefined;
  hasMandate: boolean;
  state: AutopayOptInState;
  now?: Date;
}): AutopayOptIn {
  const { state } = input;
  if (input.paymentProvider !== 'razorpay') return NONE;
  if (input.hasMandate || state.billingDisabled) return NONE;

  const end = coverageEnd(state, input.now ?? new Date());
  if (end) {
    const d = formatBillingDate(end);
    const renewsOn = end.toISOString();
    if (state.isActive || state.pendingWindow?.type === 'active') {
      return {
        kind: 'paid',
        renewsOn,
        headline: `You're paid until ${d}.`,
        detail: `Set up AutoPay to renew automatically on ${d}. Nothing is charged before then.`,
      };
    }
    return {
      kind: 'trial',
      renewsOn,
      headline: `Your free trial runs until ${d}.`,
      detail: `Set up AutoPay now and your first charge is on ${d}. Nothing is charged before then.`,
    };
  }

  // Only say access has ended when the server says so. An account with
  // no window for another reason gets the generic card text instead.
  if (state.isExpired || state.isBlocked) {
    return {
      kind: 'lapsed',
      renewsOn: null,
      headline: 'Your access has ended.',
      detail: 'Set up AutoPay to pay now and renew automatically.',
    };
  }
  return NONE;
}
