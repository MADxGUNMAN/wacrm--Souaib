// ============================================================
// Status groups the super-admin billing tools share (pure).
// ============================================================

import type { BillingSubscriptionStatus } from './types';

/** Every billing_subscriptions.status value (CHECK in 20261021000000). */
export const BILLING_SUBSCRIPTION_STATUSES: readonly BillingSubscriptionStatus[] =
  [
    'initiating',
    'failed_to_create',
    'created',
    'authenticated',
    'active',
    'pending',
    'halted',
    'paused',
    'cancelled',
    'completed',
    'expired',
    'superseded',
  ];

/** billing_subscriptions.payment_method values, plus `unknown` for "not set". */
export const PAYMENT_METHODS = [
  'card',
  'upi',
  'emandate',
  'nach',
  'unknown',
] as const;

/**
 * A Razorpay subscription that exists and has not ended: it has charged,
 * will charge, or could be revived. Deleting or banning a workspace must
 * cancel these first.
 */
export const LIVE_AUTOPAY_STATUSES: ReadonlySet<string> = new Set([
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
]);

/** Razorpay will charge these on `charge_at` (same set as view.ts WORKING). */
export const CHARGING_STATUSES: ReadonlySet<string> = new Set([
  'authenticated',
  'active',
  'pending',
]);

/** What an operator may cancel from the Payments page. */
export const ADMIN_CANCELLABLE: ReadonlySet<string> = LIVE_AUTOPAY_STATUSES;

/**
 * An `initiating` claim younger than this may get a Razorpay id any
 * second, so a delete must wait. Older claims never reached Razorpay.
 */
export const INITIATING_GRACE_MS = 15 * 60_000;

/**
 * Razorpay Dashboard deep link. The path format is not documented by
 * Razorpay; it is what the Dashboard uses today, so the UI labels it
 * "Open in Razorpay" rather than promising a specific page.
 */
export function dashboardUrl(
  kind: 'subscription' | 'payment',
  id: string
): string {
  const path = kind === 'subscription' ? 'subscriptions' : 'payments';
  return `https://dashboard.razorpay.com/app/${path}/${encodeURIComponent(id)}`;
}
