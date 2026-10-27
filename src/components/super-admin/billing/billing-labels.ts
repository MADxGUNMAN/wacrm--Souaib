// ============================================================
// Words and colours for every billing status the Payments page shows
// (pure, no JSX), so one value reads the same in every list, filter and
// drawer.
//
// Statuses are scoped by domain on purpose: `pending` is "Payment
// pending" on an AutoPay, "Pending" on a refund and "Pending review" on a
// manual UPI request; `created` is "Awaiting authorisation" on an AutoPay
// but "Created" on a payment. Raw values come from the CHECK constraints
// (20261021000000_razorpay_billing_schema.sql), the list specs in
// src/lib/billing/razorpay/admin-db.ts and the refund/dispute functions
// (20261022000000_razorpay_billing_phase3.sql). Anything unknown falls
// back to sentence case in slate, never to the raw snake_case value.
// ============================================================

import type {
  AmountKind,
  BillingChannel,
  EventTypeGroupId,
} from '@/lib/billing/event-channel';

export type Tone =
  'slate' | 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'cyan';

export type StatusDomain =
  | 'subscription'
  | 'payment'
  | 'invoice'
  | 'refund'
  | 'dispute'
  | 'webhook'
  | 'reconciliation'
  | 'manual'
  | 'workspace'
  | 'ledger'
  | 'access';

export interface LabelMeta {
  label: string;
  tone: Tone;
  /** One plain sentence, shown as a tooltip or a muted second line. */
  hint?: string;
}

export const TONE_BADGE_CLASS: Readonly<Record<Tone, string>> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  slate: 'border-slate-200 bg-slate-100 text-slate-600',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
};

export const STATUS_META: Readonly<
  Record<StatusDomain, Readonly<Record<string, LabelMeta>>>
> = {
  // billing_subscriptions.status
  subscription: {
    initiating: {
      label: 'Starting checkout',
      tone: 'slate',
      hint: 'Checkout started, not created at Razorpay yet',
    },
    failed_to_create: { label: 'Failed to create', tone: 'red' },
    created: {
      label: 'Awaiting authorisation',
      tone: 'slate',
      hint: 'Created at Razorpay, the customer has not authorised it',
    },
    authenticated: {
      label: 'Authorised',
      tone: 'blue',
      hint: 'Mandate authorised, first charge still to come',
    },
    active: { label: 'Active', tone: 'green' },
    pending: {
      label: 'Payment pending',
      tone: 'amber',
      hint: 'A charge failed and Razorpay is retrying',
    },
    halted: {
      label: 'Halted',
      tone: 'red',
      hint: 'Razorpay stopped charging after repeated failures',
    },
    paused: { label: 'Paused', tone: 'slate' },
    cancelled: { label: 'Cancelled', tone: 'slate' },
    completed: { label: 'Completed', tone: 'slate' },
    expired: { label: 'Expired', tone: 'slate' },
    superseded: {
      label: 'Replaced',
      tone: 'slate',
      hint: 'Replaced by a newer checkout',
    },
  },
  // billing_payments.status
  payment: {
    created: { label: 'Created', tone: 'slate' },
    authorized: { label: 'Authorised', tone: 'blue' },
    captured: { label: 'Captured', tone: 'green' },
    refunded: { label: 'Refunded', tone: 'slate' },
    failed: { label: 'Failed', tone: 'red' },
  },
  // billing_invoices.status
  invoice: {
    draft: { label: 'Draft', tone: 'slate' },
    issued: { label: 'Issued', tone: 'blue' },
    partially_paid: { label: 'Partly paid', tone: 'amber' },
    paid: { label: 'Paid', tone: 'green' },
    expired: { label: 'Expired', tone: 'slate' },
    cancelled: { label: 'Cancelled', tone: 'slate' },
    deleted: { label: 'Deleted', tone: 'slate' },
  },
  // billing_refunds.status
  refund: {
    pending: { label: 'Pending', tone: 'amber' },
    processed: { label: 'Processed', tone: 'green' },
    failed: { label: 'Failed', tone: 'red' },
  },
  // billing_disputes.status
  dispute: {
    open: { label: 'Open', tone: 'red' },
    under_review: { label: 'Under review', tone: 'amber' },
    won: { label: 'Won', tone: 'green' },
    lost: { label: 'Lost', tone: 'red' },
    closed: { label: 'Closed', tone: 'slate' },
  },
  // billing_webhook_events.status
  webhook: {
    received: { label: 'Received', tone: 'blue' },
    processing: { label: 'Processing', tone: 'blue' },
    processed: { label: 'Processed', tone: 'green' },
    ignored: { label: 'Ignored', tone: 'slate' },
    failed: {
      label: 'Failed',
      tone: 'amber',
      hint: 'Will be retried automatically',
    },
    dead: {
      label: 'Dead',
      tone: 'red',
      hint: 'Automatic retries exhausted',
    },
  },
  // billing_reconciliation_runs.status
  reconciliation: {
    running: { label: 'Running', tone: 'blue' },
    succeeded: { label: 'Succeeded', tone: 'green' },
    failed: { label: 'Failed', tone: 'red' },
  },
  // payment_requests.status (manual UPI)
  manual: {
    pending: { label: 'Pending review', tone: 'amber' },
    approved: { label: 'Approved', tone: 'green' },
    rejected: { label: 'Rejected', tone: 'red' },
  },
  // accounts.subscription_status, as derived (liveStatus) or stored
  workspace: {
    trialing: { label: 'Trialing', tone: 'blue' },
    active: { label: 'Active', tone: 'green' },
    expired: { label: 'Expired', tone: 'red' },
    none: {
      label: 'Ungated',
      tone: 'slate',
      hint: 'Never gated, internal or demo',
    },
  },
  // All payments ledger (src/lib/billing/ledger-status.ts), one status
  // across Razorpay payments and manual UPI requests.
  ledger: {
    paid: { label: 'Paid', tone: 'green' },
    pending: {
      label: 'Pending',
      tone: 'amber',
      hint: 'Awaiting capture or review',
    },
    failed: { label: 'Failed', tone: 'red' },
    rejected: { label: 'Rejected', tone: 'red' },
    refunded: { label: 'Refunded', tone: 'slate' },
    partially_refunded: { label: 'Partly refunded', tone: 'amber' },
  },
  // How a workspace has (or last had) access (src/lib/billing/access-via.ts).
  access: {
    razorpay_autopay: {
      label: 'Razorpay AutoPay',
      tone: 'blue',
      hint: 'Paid time granted by a Razorpay AutoPay charge',
    },
    manual_upi: {
      label: 'Manual UPI payment',
      tone: 'green',
      hint: 'Paid time granted by an approved manual UPI payment',
    },
    admin_grant: {
      label: 'Admin grant',
      tone: 'violet',
      hint: 'A super admin granted the time, no payment recorded',
    },
    trial: { label: 'Trial', tone: 'blue' },
    none: {
      label: 'Ungated',
      tone: 'slate',
      hint: 'Never gated, internal or demo',
    },
    unknown: {
      label: 'Not recorded',
      tone: 'slate',
      hint: 'No grant event is recorded for the current access',
    },
  },
};

/** "partially_paid" -> "Partially paid". "—" when empty. */
export function sentenceCase(raw: string | null | undefined): string {
  if (!raw) return '—';
  const text = raw.replace(/_/g, ' ').trim();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusMeta(
  domain: StatusDomain,
  value: string | null | undefined
): LabelMeta {
  const meta = value ? STATUS_META[domain][value] : undefined;
  return meta ?? { label: sentenceCase(value), tone: 'slate' };
}

/** Filter options: "All statuses" first, then each value in words. */
export function statusOptions(
  domain: StatusDomain,
  values: readonly string[],
  allLabel?: string
): { value: string; label: string }[] {
  return [
    { value: 'all', label: allLabel ?? 'All statuses' },
    ...values.map((v) => ({ value: v, label: statusMeta(domain, v).label })),
  ];
}

// ------------------------------------------------------------
// Refund access effect (billing_refunds.access_effect)
// ------------------------------------------------------------

export const ACCESS_EFFECT_META: Readonly<Record<string, LabelMeta>> = {
  window_removed: {
    label: 'Access removed',
    tone: 'red',
    hint: 'The paid time this payment bought was taken off',
  },
  none_not_a_charge: {
    label: 'No change',
    tone: 'slate',
    hint: 'Not a plan charge, for example the AutoPay setup check',
  },
  none_partial: {
    label: 'No change',
    tone: 'slate',
    hint: 'Partial refund',
  },
  none_not_granted: {
    label: 'No change',
    tone: 'slate',
    hint: 'This payment never granted access',
  },
  unchanged_later_grant: {
    label: 'No change',
    tone: 'slate',
    hint: 'A later payment covers this period',
  },
  unchanged: {
    label: 'No change',
    tone: 'slate',
    hint: 'The access end date did not need to move',
  },
  already_removed: {
    label: 'Already removed',
    tone: 'slate',
    hint: 'Removed by an earlier refund or dispute',
  },
};

const ACCESS_NOT_APPLIED: LabelMeta = {
  label: 'Not applied yet',
  tone: 'slate',
  hint: 'Recorded when the refund is processed',
};

export function accessEffectMeta(value: string | null | undefined): LabelMeta {
  if (!value) return ACCESS_NOT_APPLIED;
  return (
    ACCESS_EFFECT_META[value] ?? { label: sentenceCase(value), tone: 'slate' }
  );
}

// ------------------------------------------------------------
// Payments, refunds and disputes
// ------------------------------------------------------------

const PAYMENT_KIND_LABEL: Readonly<Record<string, string>> = {
  authorization: 'Authorisation',
  charge: 'Recurring charge',
  upfront: 'Upfront',
  unknown: 'Unknown',
};

export function paymentKindLabel(kind: string | null | undefined): string {
  return (kind && PAYMENT_KIND_LABEL[kind]) || sentenceCase(kind);
}

const SPEED_PROCESSED: Readonly<Record<string, string>> = {
  instant: 'Instant',
  normal: 'Normal',
};

const SPEED_REQUESTED: Readonly<Record<string, string>> = {
  optimum: 'Optimum requested',
  normal: 'Normal requested',
};

/** How fast Razorpay paid the refund out, or what was asked for. */
export function refundSpeedLabel(
  processed: string | null,
  requested: string | null
): string {
  if (processed) return SPEED_PROCESSED[processed] ?? sentenceCase(processed);
  if (requested) {
    return SPEED_REQUESTED[requested] ?? `${sentenceCase(requested)} requested`;
  }
  return '—';
}

const DISPUTE_PHASE: Readonly<Record<string, string>> = {
  chargeback: 'Chargeback',
  pre_arbitration: 'Pre-arbitration',
  arbitration: 'Arbitration',
  retrieval: 'Retrieval request',
  fraud: 'Fraud',
};

export function disputePhaseLabel(phase: string | null | undefined): string {
  return (phase && DISPUTE_PHASE[phase]) || sentenceCase(phase);
}

export function disputeReasonLabel(code: string | null | undefined): string {
  return sentenceCase(code);
}

export const METHOD_LABEL: Readonly<Record<string, string>> = {
  card: 'Card',
  upi: 'UPI',
  emandate: 'eMandate',
  nach: 'NACH',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  unknown: 'Not known yet',
};

export function methodLabel(method: string | null | undefined): string {
  if (!method) return METHOD_LABEL.unknown;
  return METHOD_LABEL[method] ?? sentenceCase(method);
}

// ------------------------------------------------------------
// Billing events (subscription_events.event_type) and who did them
// ------------------------------------------------------------

export const BILLING_EVENT_LABEL: Readonly<Record<string, string>> = {
  trial_started: 'Trial started',
  trial_extended: 'Trial extended',
  payment_submitted: 'Payment submitted',
  payment_approved: 'Payment approved',
  payment_rejected: 'Payment rejected',
  subscription_activated: 'Subscription activated',
  subscription_extended: 'Subscription extended',
  // Written by Block, by "set status expired" and by a full refund or a
  // lost dispute removing paid time, so "blocked" would be wrong.
  subscription_revoked: 'Access removed',
  subscription_expired: 'Expired',
  autopay_checkout_created: 'AutoPay checkout started',
  autopay_authenticated: 'AutoPay authorised',
  autopay_activated: 'AutoPay active',
  payment_succeeded: 'AutoPay payment succeeded',
  payment_failed: 'AutoPay payment failed',
  autopay_pending: 'AutoPay payment pending',
  autopay_halted: 'AutoPay halted',
  autopay_paused: 'AutoPay paused',
  autopay_resumed: 'AutoPay resumed',
  autopay_cancelled: 'AutoPay cancelled',
  autopay_completed: 'AutoPay completed',
  refund_processed: 'Refund processed',
  dispute_opened: 'Dispute opened',
  dispute_closed: 'Dispute closed',
  billing_anomaly: 'Billing anomaly',
  billing_admin_action: 'Admin billing action',
};

export function billingEventLabel(eventType: string): string {
  return BILLING_EVENT_LABEL[eventType] ?? sentenceCase(eventType);
}

// subscription_events.source, worded as WHO started the event. There is
// deliberately no "Paid" or "Manual" here: those were derived labels that
// called every Razorpay AutoPay event "Manual". How an event happened is
// its channel (CHANNEL_META below).
const SOURCE_INITIATOR_LABEL: Readonly<Record<string, string>> = {
  razorpay_webhook: 'Razorpay',
  checkout: 'Customer at checkout',
  reconciliation: 'Reconciliation',
  customer: 'Customer',
  admin: 'Super admin',
  system: 'System',
};

/** Who started an event, from its stored source. "System" when unset. */
export function sourceInitiatorLabel(
  source: string | null | undefined
): string {
  if (!source) return 'System';
  return SOURCE_INITIATOR_LABEL[source] ?? sentenceCase(source);
}

// ------------------------------------------------------------
// Channels: how an event or payment happened
// ------------------------------------------------------------

export const CHANNEL_META: Readonly<Record<BillingChannel, LabelMeta>> = {
  razorpay: {
    label: 'Razorpay AutoPay',
    tone: 'blue',
    hint: 'Recorded by Razorpay checkout, webhooks or reconciliation',
  },
  manual_upi: {
    label: 'Manual UPI',
    tone: 'green',
    hint: 'A customer paid by UPI QR and an admin reviewed it',
  },
  admin: {
    label: 'Admin action',
    tone: 'violet',
    hint: 'Done by a super admin, no money moved unless shown',
  },
  customer: {
    label: 'Customer action',
    tone: 'cyan',
    hint: 'Done by the customer',
  },
  system: {
    label: 'System',
    tone: 'slate',
    hint: 'Automatic, nobody acted',
  },
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return '—';
  return (
    CHANNEL_META[channel as BillingChannel]?.label ?? sentenceCase(channel)
  );
}

/** Labels of the event type groups in the Activity log filter. */
export const EVENT_TYPE_GROUP_LABEL: Readonly<
  Record<EventTypeGroupId, string>
> = {
  autopay: 'Razorpay AutoPay',
  manual_upi: 'Manual UPI',
  access: 'Access changes',
  admin: 'Admin',
};

const AMOUNT_KIND_CAPTION: Readonly<Record<Exclude<AmountKind, null>, string>> =
  {
    paid: 'Paid',
    refund: 'Refunded',
    claimed: 'Claimed, under review',
    rejected: 'Not accepted',
    failed: 'Not collected',
    covered_by_payment: 'Covered by manual UPI payment',
    plan_price: 'Plan price, no payment',
  };

/**
 * The muted line under an amount, saying what the number means. `paid`
 * names the channel: "Paid via AutoPay" / "Paid via manual UPI".
 */
export function amountCaption(
  kind: AmountKind | undefined,
  channel?: BillingChannel | null,
  moneyInvolved?: string | null
): string | null {
  if (!kind) return null;
  if (kind === 'paid') {
    if (moneyInvolved === 'autopay' || channel === 'razorpay') {
      return 'Paid via AutoPay';
    }
    if (moneyInvolved === 'manual_upi' || channel === 'manual_upi') {
      return 'Paid via manual UPI';
    }
  }
  return AMOUNT_KIND_CAPTION[kind] ?? null;
}

/**
 * "subscription.authenticated" -> "Subscription authenticated";
 * "payment.dispute.created" -> "Payment dispute created".
 */
export function webhookEventLabel(raw: string | null | undefined): string {
  if (!raw) return '—';
  const text = raw.split(/[._]/).filter(Boolean).join(' ').toLowerCase();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const CANCELLED_BY_LABEL: Readonly<Record<string, string>> = {
  customer: 'the customer',
  admin: 'a super admin',
  provider: 'Razorpay',
  system: 'the system',
};

/** Fits "Cancel requested … by <label>". */
export function cancelledByLabel(by: string | null | undefined): string {
  if (!by) return '—';
  return CANCELLED_BY_LABEL[by] ?? sentenceCase(by).toLowerCase();
}

/** Who started a reconciliation run. */
export function runTriggerLabel(run: {
  scope: string;
  triggeredBy: string | null;
  triggeredByName: string | null;
}): string {
  if (run.triggeredByName) return run.triggeredByName;
  if (run.triggeredBy) return 'Unknown user';
  if (run.scope === 'cron') return 'Scheduled run';
  if (run.scope === 'admin') return 'A super admin';
  return sentenceCase(run.scope);
}

/** A workspace status in words (Activity from/to, drawer, dialog). */
export function accountStatusLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (
    STATUS_META.workspace[value]?.label ??
    STATUS_META.subscription[value]?.label ??
    sentenceCase(value)
  );
}
