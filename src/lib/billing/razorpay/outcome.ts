// ============================================================
// Which result screen the payment page shows. Pure and browser-safe.
//
// The page never decides "paid" from Checkout's success callback. It asks
// the server (verify, then status polling) and maps the answer here, so
// the rule is unit-tested and the screens can never mix.
// ============================================================

import type { AutopayView } from './view';

export type CheckoutResult =
  | { kind: 'paid'; autopay: AutopayView | null }
  | { kind: 'authorised'; autopay: AutopayView | null }
  | { kind: 'processing' }
  | { kind: 'still_processing' }
  | { kind: 'not_completed'; reason: string | null }
  | { kind: 'failed'; reason: string; paymentId: string | null };

/**
 * A final screen for what the server reports, or null while the payment
 * is still settling (keep polling).
 *
 *   paid        access was granted now, or the current cycle is covered
 *   authorised  a deferred start whose mandate is authorised (no charge yet)
 *   failed      Razorpay is retrying or has halted the subscription
 *
 * An immediate start that is only `authenticated` is NOT done: it still
 * owes its first charge, so it stays "processing".
 */
export function classifyAutopay(
  autopay: AutopayView | null,
  paymentOutcome?: string
): CheckoutResult | null {
  if (paymentOutcome === 'granted') return { kind: 'paid', autopay };
  if (!autopay) return null;
  if (autopay.display.key === 'subscription_active') {
    return { kind: 'paid', autopay };
  }
  if (autopay.status === 'authenticated' && autopay.intent !== 'immediate') {
    return { kind: 'authorised', autopay };
  }
  if (autopay.status === 'pending' || autopay.status === 'halted') {
    return {
      kind: 'failed',
      reason: autopay.lastFailure ?? 'The payment did not go through.',
      paymentId: null,
    };
  }
  return null;
}
