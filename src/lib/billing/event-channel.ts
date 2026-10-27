// ============================================================
// How one billing event happened: the "channel" (pure, shared).
//
// The super-admin Activity log used to derive a binary
// `source: 'payment' | 'manual'` from the event type alone, so every
// Razorpay AutoPay event (checkout, authorisation, charge, refund,
// dispute) read "Manual", and a manual UPI payment looked the same as an
// admin granting a free month. This module is the one definition of how
// a `subscription_events` row happened, used by the events API, the
// Workspaces "Access via" column and the AutoPay drawer alike.
//
// Inputs are the row's own columns (`source`, `payment_request_id`,
// `billing_subscription_id`, `billing_payment_id`, `actor_user_id`) plus
// lookups (is the actor a super admin, the Razorpay mode). `source` is
// NULL on every row written before Razorpay shipped, so the rules fall
// back to links and actor for those.
//
// Channel precedence, first match wins:
//   1. source 'admin' or billing_admin_action           -> admin
//   2. source 'customer'                                -> customer
//   3. a Razorpay link, Razorpay source or AutoPay type -> razorpay
//   4. a payment request or a manual payment type       -> manual_upi
//   5. actor is a super admin                           -> admin
//   6. actor is anyone else (a workspace member)        -> customer
//   7. nobody acted                                     -> system
// ============================================================

import type { SubscriptionEventType } from '@/lib/subscription/types';

export type BillingChannel =
  'razorpay' | 'manual_upi' | 'admin' | 'customer' | 'system';

/** Display order of channels in filters and tiles. */
export const BILLING_CHANNELS: readonly BillingChannel[] = [
  'razorpay',
  'manual_upi',
  'admin',
  'customer',
  'system',
];

export function isBillingChannel(value: unknown): value is BillingChannel {
  return (
    typeof value === 'string' &&
    (BILLING_CHANNELS as readonly string[]).includes(value)
  );
}

export type InitiatorKind =
  'customer' | 'admin' | 'razorpay' | 'scheduled' | 'system';

export type MoneyInvolved = 'autopay' | 'manual_upi' | 'refund' | 'none';

/**
 * What the row's `amount` means. Only `paid` and `refund` are money that
 * moved; the rest are shown muted with a caption, because on autopay_*
 * rows `amount` is the PLAN PRICE, not money collected.
 */
export type AmountKind =
  | 'paid'
  | 'refund'
  | 'claimed'
  | 'rejected'
  | 'failed'
  | 'covered_by_payment'
  | 'plan_price'
  | null;

export interface EventInitiator {
  kind: InitiatorKind;
  label: string;
  detail: string | null;
}

export interface EventClassification {
  channel: BillingChannel;
  /** Which payment system the row concerns, even when an admin acted. */
  context: 'autopay' | 'manual_upi' | null;
  initiatedBy: EventInitiator;
  moneyInvolved: MoneyInvolved;
  amountKind: AmountKind;
  /** Razorpay mode of the linked payment or subscription; null otherwise. */
  mode: 'test' | 'live' | null;
}

export interface ClassifyInput {
  eventType: string;
  /** subscription_events.source; NULL on legacy rows. */
  source: string | null;
  paymentRequestId: string | null;
  billingSubscriptionId: string | null;
  billingPaymentId: string | null;
  actorUserId: string | null;
  actorIsSuperAdmin: boolean;
  actorName: string | null;
  actorEmail: string | null;
  ownerEmail: string | null;
  /** billing_subscriptions.mode of the linked subscription. */
  subMode: string | null;
  /** billing_payments.mode of the linked payment. */
  payMode: string | null;
  /** subscription_events.amount (major units); only nullness matters. */
  amount?: number | null;
}

/** Every SubscriptionEventType, in the order the filter lists them. */
export const ALL_EVENT_TYPES: readonly SubscriptionEventType[] = [
  'autopay_checkout_created',
  'autopay_authenticated',
  'autopay_activated',
  'payment_succeeded',
  'payment_failed',
  'autopay_pending',
  'autopay_halted',
  'autopay_paused',
  'autopay_resumed',
  'autopay_cancelled',
  'autopay_completed',
  'refund_processed',
  'dispute_opened',
  'dispute_closed',
  'billing_anomaly',
  'payment_submitted',
  'payment_approved',
  'payment_rejected',
  'trial_started',
  'trial_extended',
  'subscription_activated',
  'subscription_extended',
  'subscription_revoked',
  'subscription_expired',
  'billing_admin_action',
];

export function isEventType(value: unknown): value is SubscriptionEventType {
  return (
    typeof value === 'string' &&
    (ALL_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Event types only the Razorpay integration writes. */
export const RAZORPAY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'autopay_checkout_created',
  'autopay_authenticated',
  'autopay_activated',
  'payment_succeeded',
  'payment_failed',
  'autopay_pending',
  'autopay_halted',
  'autopay_paused',
  'autopay_resumed',
  'autopay_cancelled',
  'autopay_completed',
  'refund_processed',
  'dispute_opened',
  'dispute_closed',
  'billing_anomaly',
]);

/** Event types only the manual UPI flow writes. */
export const MANUAL_UPI_EVENT_TYPES: ReadonlySet<string> = new Set([
  'payment_submitted',
  'payment_approved',
  'payment_rejected',
]);

/** subscription_events.source values that mean Razorpay recorded it. */
export const RAZORPAY_SOURCES: ReadonlySet<string> = new Set([
  'razorpay_webhook',
  'checkout',
  'reconciliation',
]);

export type EventTypeGroupId = 'autopay' | 'manual_upi' | 'access' | 'admin';

/** Event types grouped for the filter; each type appears exactly once. */
export const EVENT_TYPES_BY_CHANNEL: readonly {
  id: EventTypeGroupId;
  types: readonly SubscriptionEventType[];
}[] = [
  {
    id: 'autopay',
    types: ALL_EVENT_TYPES.filter((t) => RAZORPAY_EVENT_TYPES.has(t)),
  },
  {
    id: 'manual_upi',
    types: ALL_EVENT_TYPES.filter((t) => MANUAL_UPI_EVENT_TYPES.has(t)),
  },
  {
    id: 'access',
    types: [
      'trial_started',
      'trial_extended',
      'subscription_activated',
      'subscription_extended',
      'subscription_revoked',
      'subscription_expired',
    ],
  },
  { id: 'admin', types: ['billing_admin_action'] },
];

function normaliseMode(value: string | null): 'test' | 'live' | null {
  return value === 'test' || value === 'live' ? value : null;
}

function channelOf(i: ClassifyInput): {
  channel: BillingChannel;
  context: EventClassification['context'];
} {
  const hasBilling = Boolean(i.billingSubscriptionId || i.billingPaymentId);
  if (i.source === 'admin' || i.eventType === 'billing_admin_action') {
    return {
      channel: 'admin',
      context: hasBilling
        ? 'autopay'
        : i.paymentRequestId
          ? 'manual_upi'
          : null,
    };
  }
  if (i.source === 'customer') {
    return { channel: 'customer', context: hasBilling ? 'autopay' : null };
  }
  if (
    hasBilling ||
    (i.source !== null && RAZORPAY_SOURCES.has(i.source)) ||
    RAZORPAY_EVENT_TYPES.has(i.eventType)
  ) {
    return { channel: 'razorpay', context: 'autopay' };
  }
  if (i.paymentRequestId || MANUAL_UPI_EVENT_TYPES.has(i.eventType)) {
    return { channel: 'manual_upi', context: 'manual_upi' };
  }
  if (i.actorUserId && i.actorIsSuperAdmin) {
    return { channel: 'admin', context: null };
  }
  if (i.actorUserId) return { channel: 'customer', context: null };
  return { channel: 'system', context: null };
}

function initiatorOf(i: ClassifyInput): EventInitiator {
  if (i.actorUserId) {
    const name = i.actorName || i.actorEmail;
    if (i.actorIsSuperAdmin) {
      return {
        kind: 'admin',
        label: name || 'Super admin',
        detail: 'Super admin',
      };
    }
    return {
      kind: 'customer',
      label: name || 'Unknown user',
      detail: 'Customer',
    };
  }
  switch (i.source) {
    case 'razorpay_webhook':
      return { kind: 'razorpay', label: 'Razorpay', detail: 'Webhook' };
    case 'reconciliation':
      return {
        kind: 'scheduled',
        label: 'Reconciliation',
        detail: 'Scheduled job',
      };
    case 'checkout':
    case 'customer':
      return {
        kind: 'customer',
        label: i.ownerEmail || 'Customer',
        detail: 'Customer',
      };
    case 'admin':
      return { kind: 'admin', label: 'Super admin', detail: 'Super admin' };
    default:
      break;
  }
  if (i.source === null && i.eventType === 'subscription_expired') {
    return { kind: 'scheduled', label: 'Scheduled job', detail: null };
  }
  return { kind: 'system', label: 'System', detail: null };
}

function moneyOf(i: ClassifyInput): {
  moneyInvolved: MoneyInvolved;
  amountKind: AmountKind;
} {
  const hasAmount = i.amount !== null && i.amount !== undefined;
  switch (i.eventType) {
    case 'payment_succeeded':
      return { moneyInvolved: 'autopay', amountKind: 'paid' };
    case 'payment_failed':
      return { moneyInvolved: 'none', amountKind: 'failed' };
    case 'refund_processed':
      return { moneyInvolved: 'refund', amountKind: 'refund' };
    case 'payment_approved':
      return { moneyInvolved: 'manual_upi', amountKind: 'paid' };
    case 'payment_submitted':
      return { moneyInvolved: 'none', amountKind: 'claimed' };
    case 'payment_rejected':
      return { moneyInvolved: 'none', amountKind: 'rejected' };
    case 'subscription_activated':
    case 'subscription_extended':
      if (i.paymentRequestId) {
        return {
          moneyInvolved: 'manual_upi',
          amountKind: 'covered_by_payment',
        };
      }
      break;
    default:
      break;
  }
  return { moneyInvolved: 'none', amountKind: hasAmount ? 'plan_price' : null };
}

export function classifyBillingEvent(
  input: ClassifyInput
): EventClassification {
  const { channel, context } = channelOf(input);
  return {
    channel,
    context,
    initiatedBy: initiatorOf(input),
    ...moneyOf(input),
    mode: normaliseMode(input.payMode) ?? normaliseMode(input.subMode),
  };
}
