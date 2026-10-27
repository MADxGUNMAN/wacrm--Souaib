import { describe, expect, it } from 'vitest';

import {
  DISPUTE_LIST_SPEC,
  INVOICE_LIST_SPEC,
  PAYMENT_LIST_SPEC,
  RECONCILIATION_RUN_LIST_SPEC,
  REFUND_LIST_SPEC,
  SUBSCRIPTION_LIST_SPEC,
  WEBHOOK_EVENT_LIST_SPEC,
} from '@/lib/billing/razorpay/admin-db';
import {
  BILLING_CHANNELS,
  EVENT_TYPES_BY_CHANNEL,
} from '@/lib/billing/event-channel';
import { LEDGER_STATUSES } from '@/lib/billing/ledger-status';
import type { SubscriptionEventType } from '@/lib/subscription/types';

import {
  ACCESS_EFFECT_META,
  accessEffectMeta,
  accountStatusLabel,
  BILLING_EVENT_LABEL,
  billingEventLabel,
  amountCaption,
  cancelledByLabel,
  CHANNEL_META,
  channelLabel,
  disputePhaseLabel,
  disputeReasonLabel,
  EVENT_TYPE_GROUP_LABEL,
  methodLabel,
  paymentKindLabel,
  refundSpeedLabel,
  runTriggerLabel,
  sentenceCase,
  sourceInitiatorLabel,
  STATUS_META,
  statusMeta,
  statusOptions,
  TONE_BADGE_CLASS,
  webhookEventLabel,
  type StatusDomain,
  type Tone,
} from './billing-labels';

const ACCESS_KINDS = [
  'razorpay_autopay',
  'manual_upi',
  'admin_grant',
  'trial',
  'none',
  'unknown',
] as const;

/**
 * One label table for every status on the Payments page. Every value
 * the server can send has an explicit, human-readable entry, so no raw
 * snake_case ever reaches a badge.
 */

/** Filter-only values: not statuses, never rendered in a row. */
const FILTER_ONLY = new Set(['live', 'retryable']);

const SPECS: [StatusDomain, readonly string[] | undefined][] = [
  ['subscription', SUBSCRIPTION_LIST_SPEC.statuses],
  ['payment', PAYMENT_LIST_SPEC.statuses],
  ['invoice', INVOICE_LIST_SPEC.statuses],
  ['refund', REFUND_LIST_SPEC.statuses],
  ['dispute', DISPUTE_LIST_SPEC.statuses],
  ['webhook', WEBHOOK_EVENT_LIST_SPEC.statuses],
  ['reconciliation', RECONCILIATION_RUN_LIST_SPEC.statuses],
  ['ledger', LEDGER_STATUSES],
  ['access', ACCESS_KINDS],
];

describe('STATUS_META', () => {
  it.each(SPECS)('covers every %s status explicitly', (domain, statuses) => {
    const values = (statuses ?? []).filter((s) => !FILTER_ONLY.has(s));
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const meta = STATUS_META[domain][value];
      expect(meta, `${domain}:${value}`).toBeDefined();
      expect(meta.label).not.toContain('_');
      expect(meta.label.charAt(0)).toBe(meta.label.charAt(0).toUpperCase());
    }
  });

  it('labels each payment kind', () => {
    for (const kind of PAYMENT_LIST_SPEC.kinds ?? []) {
      const label = paymentKindLabel(kind);
      expect(label).not.toContain('_');
      expect(label).not.toBe('—');
    }
    expect(paymentKindLabel('charge')).toBe('Recurring charge');
    expect(paymentKindLabel('authorization')).toBe('Authorisation');
  });

  it.each([
    ['subscription', 'authenticated', 'Authorised'],
    ['subscription', 'pending', 'Payment pending'],
    ['subscription', 'created', 'Awaiting authorisation'],
    ['subscription', 'superseded', 'Replaced'],
    ['payment', 'authorized', 'Authorised'],
    ['payment', 'created', 'Created'],
    ['invoice', 'partially_paid', 'Partly paid'],
    ['dispute', 'under_review', 'Under review'],
    ['refund', 'pending', 'Pending'],
    ['manual', 'pending', 'Pending review'],
    ['manual', 'approved', 'Approved'],
    ['workspace', 'none', 'Ungated'],
    ['webhook', 'dead', 'Dead'],
    ['reconciliation', 'succeeded', 'Succeeded'],
  ] as const)('%s %s reads "%s"', (domain, value, label) => {
    expect(statusMeta(domain, value).label).toBe(label);
  });

  it('falls back to sentence case in slate for an unknown value', () => {
    expect(statusMeta('payment', 'some_new_state')).toEqual({
      label: 'Some new state',
      tone: 'slate',
    });
    expect(statusMeta('invoice', null).label).toBe('—');
  });

  it('has a badge class for every tone used', () => {
    const tones: Tone[] = [
      'slate',
      'green',
      'blue',
      'amber',
      'red',
      'violet',
      'cyan',
    ];
    for (const t of tones) expect(TONE_BADGE_CLASS[t]).toMatch(/border-/);
    for (const domain of Object.values(STATUS_META)) {
      for (const meta of Object.values(domain)) {
        expect(TONE_BADGE_CLASS[meta.tone]).toBeDefined();
      }
    }
  });
});

describe('statusOptions', () => {
  it('starts with All statuses and labels each value', () => {
    expect(statusOptions('refund', ['pending', 'processed'])).toEqual([
      { value: 'all', label: 'All statuses' },
      { value: 'pending', label: 'Pending' },
      { value: 'processed', label: 'Processed' },
    ]);
    expect(statusOptions('manual', [], 'Every request')[0]).toEqual({
      value: 'all',
      label: 'Every request',
    });
  });
});

describe('access effect', () => {
  it.each([
    ['window_removed', 'Access removed'],
    ['none_not_a_charge', 'No change'],
    ['none_partial', 'No change'],
    ['none_not_granted', 'No change'],
    ['unchanged_later_grant', 'No change'],
    ['unchanged', 'No change'],
    ['already_removed', 'Already removed'],
  ])('%s reads "%s" with a reason', (value, label) => {
    const meta = accessEffectMeta(value);
    expect(meta.label).toBe(label);
    expect(meta.hint).toBeTruthy();
  });

  it('covers exactly the seven stored outcomes', () => {
    expect(Object.keys(ACCESS_EFFECT_META)).toHaveLength(7);
  });

  it('explains the setup-check case instead of "none not a charge"', () => {
    const meta = accessEffectMeta('none_not_a_charge');
    expect(meta.label).toBe('No change');
    expect(meta.hint).toContain('AutoPay setup check');
  });

  it('reads "Not applied yet" before the refund is processed', () => {
    expect(accessEffectMeta(null).label).toBe('Not applied yet');
    expect(accessEffectMeta(undefined).label).toBe('Not applied yet');
  });
});

describe('small labels', () => {
  it('sentenceCase', () => {
    expect(sentenceCase('partially_paid')).toBe('Partially paid');
    expect(sentenceCase('')).toBe('—');
    expect(sentenceCase(null)).toBe('—');
  });

  it('refundSpeedLabel', () => {
    expect(refundSpeedLabel('instant', 'optimum')).toBe('Instant');
    expect(refundSpeedLabel('normal', null)).toBe('Normal');
    expect(refundSpeedLabel(null, 'optimum')).toBe('Optimum requested');
    expect(refundSpeedLabel(null, 'normal')).toBe('Normal requested');
    expect(refundSpeedLabel(null, null)).toBe('—');
  });

  it('disputePhaseLabel and disputeReasonLabel', () => {
    expect(disputePhaseLabel('chargeback')).toBe('Chargeback');
    expect(disputePhaseLabel('pre_arbitration')).toBe('Pre-arbitration');
    expect(disputePhaseLabel('retrieval')).toBe('Retrieval request');
    expect(disputePhaseLabel('something_else')).toBe('Something else');
    expect(disputeReasonLabel('product_not_received')).toBe(
      'Product not received'
    );
    expect(disputeReasonLabel(null)).toBe('—');
  });

  it('methodLabel', () => {
    expect(methodLabel('upi')).toBe('UPI');
    expect(methodLabel('emandate')).toBe('eMandate');
    expect(methodLabel('nach')).toBe('NACH');
    expect(methodLabel('unknown')).toBe('Not known yet');
    expect(methodLabel(null)).toBe('Not known yet');
    expect(methodLabel('pay_later')).toBe('Pay later');
  });

  it('sourceInitiatorLabel', () => {
    expect(sourceInitiatorLabel('razorpay_webhook')).toBe('Razorpay');
    expect(sourceInitiatorLabel('checkout')).toBe('Customer at checkout');
    expect(sourceInitiatorLabel('reconciliation')).toBe('Reconciliation');
    expect(sourceInitiatorLabel('admin')).toBe('Super admin');
    expect(sourceInitiatorLabel(null)).toBe('System');
    // The old derived labels are gone: they called AutoPay "Manual".
    expect(sourceInitiatorLabel('payment')).toBe('Payment');
    expect(sourceInitiatorLabel('manual')).toBe('Manual');
  });

  it('webhookEventLabel', () => {
    expect(webhookEventLabel('subscription.authenticated')).toBe(
      'Subscription authenticated'
    );
    expect(webhookEventLabel('payment.dispute.created')).toBe(
      'Payment dispute created'
    );
    expect(webhookEventLabel('refund.speed_changed')).toBe(
      'Refund speed changed'
    );
    expect(webhookEventLabel(null)).toBe('—');
  });

  it('amountCaption', () => {
    expect(amountCaption('paid', 'razorpay', 'autopay')).toBe(
      'Paid via AutoPay'
    );
    expect(amountCaption('paid', 'manual_upi', 'manual_upi')).toBe(
      'Paid via manual UPI'
    );
    expect(amountCaption('plan_price', 'razorpay', 'none')).toBe(
      'Plan price, no payment'
    );
    expect(amountCaption('claimed')).toBe('Claimed, under review');
    expect(amountCaption(null)).toBeNull();
  });

  it('cancelledByLabel', () => {
    expect(cancelledByLabel('customer')).toBe('the customer');
    expect(cancelledByLabel('admin')).toBe('a super admin');
    expect(cancelledByLabel('provider')).toBe('Razorpay');
    expect(cancelledByLabel('system')).toBe('the system');
  });

  it('runTriggerLabel', () => {
    const run = { scope: 'cron', triggeredBy: null, triggeredByName: null };
    expect(runTriggerLabel(run)).toBe('Scheduled run');
    expect(runTriggerLabel({ ...run, scope: 'admin' })).toBe('A super admin');
    expect(runTriggerLabel({ ...run, triggeredBy: 'u1' })).toBe('Unknown user');
    expect(
      runTriggerLabel({ ...run, triggeredBy: 'u1', triggeredByName: 'Asha' })
    ).toBe('Asha');
  });

  it('accountStatusLabel', () => {
    expect(accountStatusLabel('trialing')).toBe('Trialing');
    expect(accountStatusLabel('none')).toBe('Ungated');
    expect(accountStatusLabel('authenticated')).toBe('Authorised');
    expect(accountStatusLabel(null)).toBe('—');
  });
});

describe('billing event labels', () => {
  // Every SubscriptionEventType, listed literally so a new one fails here.
  const ALL: SubscriptionEventType[] = [
    'trial_started',
    'trial_extended',
    'payment_submitted',
    'payment_approved',
    'payment_rejected',
    'subscription_activated',
    'subscription_extended',
    'subscription_revoked',
    'subscription_expired',
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
    'billing_admin_action',
  ];

  it('labels all 25 event types', () => {
    expect(ALL).toHaveLength(25);
    for (const type of ALL) {
      expect(BILLING_EVENT_LABEL[type], type).toBeTruthy();
      expect(billingEventLabel(type)).not.toContain('_');
    }
  });

  it('calls subscription_revoked "Access removed"', () => {
    expect(billingEventLabel('subscription_revoked')).toBe('Access removed');
  });
});

describe('channels', () => {
  it('has a label, tone and hint for every channel', () => {
    for (const channel of BILLING_CHANNELS) {
      const meta = CHANNEL_META[channel];
      expect(meta.label, channel).toBeTruthy();
      expect(meta.hint, channel).toBeTruthy();
      expect(TONE_BADGE_CLASS[meta.tone]).toBeDefined();
    }
    // Five distinct colours, so two channels never look alike.
    expect(
      new Set(BILLING_CHANNELS.map((c) => CHANNEL_META[c].tone)).size
    ).toBe(5);
  });

  it('separates manual UPI from an admin grant', () => {
    expect(channelLabel('razorpay')).toBe('Razorpay AutoPay');
    expect(channelLabel('manual_upi')).toBe('Manual UPI');
    expect(channelLabel('admin')).toBe('Admin action');
    expect(channelLabel('customer')).toBe('Customer action');
    expect(channelLabel('system')).toBe('System');
  });

  it('labels every event type group', () => {
    for (const group of EVENT_TYPES_BY_CHANNEL) {
      expect(EVENT_TYPE_GROUP_LABEL[group.id]).toBeTruthy();
    }
  });
});
