import { describe, expect, it } from 'vitest';

import {
  ALL_EVENT_TYPES,
  BILLING_CHANNELS,
  classifyBillingEvent,
  EVENT_TYPES_BY_CHANNEL,
  isBillingChannel,
  isEventType,
  type ClassifyInput,
} from './event-channel';

const SUB = 'aaaaaaaa-0000-4000-8000-000000000001';
const PAY = 'aaaaaaaa-0000-4000-8000-000000000002';
const PR = 'aaaaaaaa-0000-4000-8000-000000000003';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000ad';
const CUSTOMER = 'aaaaaaaa-0000-4000-8000-0000000000cc';

function row(over: Partial<ClassifyInput>): ClassifyInput {
  return {
    eventType: 'trial_started',
    source: null,
    paymentRequestId: null,
    billingSubscriptionId: null,
    billingPaymentId: null,
    actorUserId: null,
    actorIsSuperAdmin: false,
    actorName: null,
    actorEmail: null,
    ownerEmail: 'owner@example.com',
    subMode: null,
    payMode: null,
    amount: null,
    ...over,
  };
}

const asAdmin = {
  actorUserId: ADMIN,
  actorIsSuperAdmin: true,
  actorName: 'Platform Admin',
};
const asCustomer = { actorUserId: CUSTOMER, actorName: 'Riya Customer' };

// One case per row shape in the live distribution (106 rows), as listed in
// the audit plan section 2: event_type, source, links, actor.
const LIVE: [
  string,
  Partial<ClassifyInput>,
  {
    channel: string;
    context: string | null;
    kind: string;
    label: string;
    money: string;
    amountKind: string | null;
    mode: string | null;
  },
][] = [
  [
    'autopay_activated via webhook',
    {
      eventType: 'autopay_activated',
      source: 'razorpay_webhook',
      billingSubscriptionId: SUB,
      subMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'razorpay',
      label: 'Razorpay',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'autopay_authenticated at checkout',
    {
      eventType: 'autopay_authenticated',
      source: 'checkout',
      billingSubscriptionId: SUB,
      subMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'customer',
      label: 'owner@example.com',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'autopay_authenticated via webhook',
    {
      eventType: 'autopay_authenticated',
      source: 'razorpay_webhook',
      billingSubscriptionId: SUB,
      subMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'razorpay',
      label: 'Razorpay',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'autopay_cancelled by the customer',
    {
      eventType: 'autopay_cancelled',
      source: 'customer',
      billingSubscriptionId: SUB,
      subMode: 'test',
      amount: 9000,
    },
    {
      channel: 'customer',
      context: 'autopay',
      kind: 'customer',
      label: 'owner@example.com',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'autopay_checkout_created by a customer',
    {
      eventType: 'autopay_checkout_created',
      source: 'checkout',
      billingSubscriptionId: SUB,
      subMode: 'test',
      amount: 9000,
      ...asCustomer,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'customer',
      label: 'Riya Customer',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'billing_admin_action by an admin',
    {
      eventType: 'billing_admin_action',
      source: 'admin',
      billingSubscriptionId: SUB,
      subMode: 'test',
      ...asAdmin,
    },
    {
      channel: 'admin',
      context: 'autopay',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: null,
      mode: 'test',
    },
  ],
  [
    'payment_approved (legacy NULL source)',
    {
      eventType: 'payment_approved',
      paymentRequestId: PR,
      amount: 22575,
      ...asAdmin,
    },
    {
      channel: 'manual_upi',
      context: 'manual_upi',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'manual_upi',
      amountKind: 'paid',
      mode: null,
    },
  ],
  [
    'payment_rejected (legacy NULL source)',
    {
      eventType: 'payment_rejected',
      paymentRequestId: PR,
      amount: 990,
      ...asAdmin,
    },
    {
      channel: 'manual_upi',
      context: 'manual_upi',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: 'rejected',
      mode: null,
    },
  ],
  [
    'payment_submitted by a customer',
    {
      eventType: 'payment_submitted',
      paymentRequestId: PR,
      amount: 990,
      ...asCustomer,
    },
    {
      channel: 'manual_upi',
      context: 'manual_upi',
      kind: 'customer',
      label: 'Riya Customer',
      money: 'none',
      amountKind: 'claimed',
      mode: null,
    },
  ],
  [
    'payment_succeeded via webhook',
    {
      eventType: 'payment_succeeded',
      source: 'razorpay_webhook',
      billingSubscriptionId: SUB,
      billingPaymentId: PAY,
      subMode: 'test',
      payMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'razorpay',
      label: 'Razorpay',
      money: 'autopay',
      amountKind: 'paid',
      mode: 'test',
    },
  ],
  [
    'subscription_activated by an admin grant (no money)',
    { eventType: 'subscription_activated', amount: 990, ...asAdmin },
    {
      channel: 'admin',
      context: null,
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: 'plan_price',
      mode: null,
    },
  ],
  [
    'subscription_activated from a manual UPI payment',
    {
      eventType: 'subscription_activated',
      paymentRequestId: PR,
      amount: 22575,
      ...asAdmin,
    },
    {
      channel: 'manual_upi',
      context: 'manual_upi',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'manual_upi',
      amountKind: 'covered_by_payment',
      mode: null,
    },
  ],
  [
    'subscription_expired set by an admin',
    { eventType: 'subscription_expired', ...asAdmin },
    {
      channel: 'admin',
      context: null,
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    'subscription_extended by an admin',
    { eventType: 'subscription_extended', ...asAdmin },
    {
      channel: 'admin',
      context: null,
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    'subscription_extended from a manual UPI payment',
    {
      eventType: 'subscription_extended',
      paymentRequestId: PR,
      amount: 22575,
      ...asAdmin,
    },
    {
      channel: 'manual_upi',
      context: 'manual_upi',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'manual_upi',
      amountKind: 'covered_by_payment',
      mode: null,
    },
  ],
  [
    'trial_extended by an admin',
    { eventType: 'trial_extended', ...asAdmin },
    {
      channel: 'admin',
      context: null,
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
];

const SYNTHETIC: typeof LIVE = [
  [
    'refund_processed via webhook',
    {
      eventType: 'refund_processed',
      source: 'razorpay_webhook',
      billingPaymentId: PAY,
      payMode: 'live',
      subMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'razorpay',
      label: 'Razorpay',
      money: 'refund',
      amountKind: 'refund',
      mode: 'live',
    },
  ],
  [
    'dispute_opened via webhook',
    {
      eventType: 'dispute_opened',
      source: 'razorpay_webhook',
      billingPaymentId: PAY,
      payMode: 'live',
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'razorpay',
      label: 'Razorpay',
      money: 'none',
      amountKind: null,
      mode: 'live',
    },
  ],
  [
    'billing_anomaly with only a subscription link',
    {
      eventType: 'billing_anomaly',
      billingSubscriptionId: SUB,
      subMode: 'live',
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'system',
      label: 'System',
      money: 'none',
      amountKind: null,
      mode: 'live',
    },
  ],
  [
    'subscription_revoked by a full refund (payment link, no actor)',
    {
      eventType: 'subscription_revoked',
      billingPaymentId: PAY,
      payMode: 'test',
      amount: 9000,
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'system',
      label: 'System',
      money: 'none',
      amountKind: 'plan_price',
      mode: 'test',
    },
  ],
  [
    'subscription_expired by the scheduled job (legacy NULL source)',
    { eventType: 'subscription_expired' },
    {
      channel: 'system',
      context: null,
      kind: 'scheduled',
      label: 'Scheduled job',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    "source = 'system'",
    { eventType: 'subscription_expired', source: 'system' },
    {
      channel: 'system',
      context: null,
      kind: 'system',
      label: 'System',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    "source = 'reconciliation'",
    {
      eventType: 'autopay_activated',
      source: 'reconciliation',
      billingSubscriptionId: SUB,
      subMode: 'live',
    },
    {
      channel: 'razorpay',
      context: 'autopay',
      kind: 'scheduled',
      label: 'Reconciliation',
      money: 'none',
      amountKind: null,
      mode: 'live',
    },
  ],
  [
    'trial_started at signup (no actor)',
    { eventType: 'trial_started' },
    {
      channel: 'system',
      context: null,
      kind: 'system',
      label: 'System',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    'actor whose profile is missing',
    { eventType: 'trial_extended', actorUserId: CUSTOMER },
    {
      channel: 'customer',
      context: null,
      kind: 'customer',
      label: 'Unknown user',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    'admin manual action on a payment request',
    {
      eventType: 'billing_admin_action',
      source: 'admin',
      paymentRequestId: PR,
      ...asAdmin,
    },
    {
      channel: 'admin',
      context: 'manual_upi',
      kind: 'admin',
      label: 'Platform Admin',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
  [
    'super admin with no name falls back to email',
    {
      eventType: 'trial_extended',
      actorUserId: ADMIN,
      actorIsSuperAdmin: true,
      actorEmail: 'admin@example.com',
    },
    {
      channel: 'admin',
      context: null,
      kind: 'admin',
      label: 'admin@example.com',
      money: 'none',
      amountKind: null,
      mode: null,
    },
  ],
];

describe('classifyBillingEvent', () => {
  it.each([...LIVE, ...SYNTHETIC])('%s', (_name, input, want) => {
    const got = classifyBillingEvent(row(input));
    expect(got.channel).toBe(want.channel);
    expect(got.context).toBe(want.context);
    expect(got.initiatedBy.kind).toBe(want.kind);
    expect(got.initiatedBy.label).toBe(want.label);
    expect(got.moneyInvolved).toBe(want.money);
    expect(got.amountKind).toBe(want.amountKind);
    expect(got.mode).toBe(want.mode);
  });

  it('reproduces the live tiles from the live distribution counts', () => {
    // Counts per shape, same order as LIVE.
    const counts = [1, 1, 1, 1, 3, 5, 2, 4, 6, 1, 13, 1, 29, 8, 1, 29];
    expect(counts.reduce((a, b) => a + b, 0)).toBe(106);
    const tiles: Record<string, number> = {};
    LIVE.forEach(([, input], i) => {
      const c = classifyBillingEvent(row(input)).channel;
      tiles[c] = (tiles[c] ?? 0) + counts[i];
    });
    expect(tiles).toEqual({
      razorpay: 7,
      manual_upi: 14,
      admin: 84,
      customer: 1,
    });
  });

  it('never classifies a Razorpay-linked row as manual', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const c = classifyBillingEvent(
        row({ eventType, billingSubscriptionId: SUB })
      );
      expect(c.channel).not.toBe('manual_upi');
    }
  });
});

describe('event type catalogue', () => {
  it('lists 25 unique event types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(25);
    expect(new Set(ALL_EVENT_TYPES).size).toBe(25);
  });

  it('groups every event type exactly once', () => {
    const grouped = EVENT_TYPES_BY_CHANNEL.flatMap((g) => g.types);
    expect(grouped).toHaveLength(25);
    expect(new Set(grouped)).toEqual(new Set(ALL_EVENT_TYPES));
    expect(EVENT_TYPES_BY_CHANNEL.map((g) => g.id)).toEqual([
      'autopay',
      'manual_upi',
      'access',
      'admin',
    ]);
  });

  it('validates channel and type values', () => {
    expect(BILLING_CHANNELS).toHaveLength(5);
    expect(isBillingChannel('razorpay')).toBe(true);
    expect(isBillingChannel('manual')).toBe(false);
    expect(isEventType('payment_succeeded')).toBe(true);
    expect(isEventType('payment')).toBe(false);
  });
});
