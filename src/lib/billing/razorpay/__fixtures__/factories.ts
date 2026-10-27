// Test factories shared by the Razorpay unit tests. Not imported by app code.

import { vi } from 'vitest';

import type { RazorpayConfig } from '../config';
import type { BillingDb, PaymentNoteContext } from '../db';
import type {
  CheckoutCopy,
  CheckoutQuote,
  RazorpayClientLike,
} from '../service';
import type {
  BillingSubscriptionRow,
  RazorpayPayment,
  RazorpaySubscription,
} from '../types';

export const ACCOUNT_ID = 'c1db92d7-7ae4-44ac-aae7-b62e152b0341';
export const OTHER_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '8d0abceb-a457-4a85-b67c-00df3e16c9c2';
export const KEY_SECRET = 'test_secret_0123456789abcdef';

export function makeConfig(
  overrides: Partial<RazorpayConfig> = {}
): RazorpayConfig {
  return {
    mode: 'test',
    env: 'dev',
    keyId: 'rzp_test_unit0000000000',
    keySecret: KEY_SECRET,
    webhookSecrets: ['w'.repeat(64)],
    testAllowedAccountIds: new Set([ACCOUNT_ID]),
    livePilotAccountIds: null,
    providerOverride: null,
    ...overrides,
  };
}

export const QUOTE: CheckoutQuote = {
  planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  planName: 'Replai',
  cycleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  cycleLabel: 'Monthly',
  cycleMonths: 1,
  cycleDurationDays: 30,
  amount: 990,
  currency: 'INR',
};

export const COPY: CheckoutCopy = {
  business: 'Replai',
  consentTemplate: null,
  deferTemplate: null,
  immediateTemplate: null,
};

export function makeRow(
  overrides: Partial<BillingSubscriptionRow> = {}
): BillingSubscriptionRow {
  return {
    id: 'row-1',
    account_id: ACCOUNT_ID,
    mode: 'test',
    env: 'dev',
    checkout_id: 'chk-1',
    provider_subscription_id: 'sub_Unit000001',
    provider_plan_row: 'pp-1',
    provider_plan_id: 'plan_Unit000001',
    provider_customer_id: 'cust_Secret0001',
    plan_id: QUOTE.planId,
    cycle_id: QUOTE.cycleId,
    plan_name: 'Replai',
    cycle_label: 'Monthly',
    duration_days: 30,
    amount_minor: 99000,
    currency: 'INR',
    quantity: 1,
    status: 'created',
    status_changed_at: '2026-10-21T06:00:00.000Z',
    intent: 'defer_to_trial_end',
    start_at: '2026-10-31T06:00:00.000Z',
    current_start: null,
    current_end: null,
    charge_at: '2026-10-31T06:00:00.000Z',
    end_at: null,
    ended_at: null,
    expire_by: '2026-10-22T06:00:00.000Z',
    total_count: 121,
    paid_count: 0,
    remaining_count: 121,
    auth_attempts: 0,
    has_scheduled_changes: false,
    change_scheduled_at: null,
    payment_method: null,
    method_summary: null,
    short_url: 'https://rzp.io/rzp/secret',
    cancel_requested_at: null,
    cancel_at_cycle_end: false,
    cancelled_by: null,
    last_error: 'internal detail',
    anomaly: 'internal anomaly',
    created_by_user_id: USER_ID,
    last_synced_at: null,
    last_event_at: null,
    created_at: '2026-10-21T06:00:00.000Z',
    updated_at: '2026-10-21T06:00:00.000Z',
    ...overrides,
  };
}

export function makeRazorpaySubscription(
  overrides: Partial<RazorpaySubscription> = {}
): RazorpaySubscription {
  return {
    id: 'sub_Unit000001',
    entity: 'subscription',
    plan_id: 'plan_Unit000001',
    customer_id: null,
    status: 'created',
    current_start: null,
    current_end: null,
    ended_at: null,
    quantity: 1,
    notes: { account_id: ACCOUNT_ID, env: 'dev', checkout_id: 'chk-1' },
    charge_at: 1793426400,
    start_at: 1793426400,
    end_at: null,
    auth_attempts: 0,
    total_count: 121,
    paid_count: 0,
    customer_notify: true,
    created_at: 1792562400,
    expire_by: 1792648800,
    short_url: 'https://rzp.io/rzp/unit',
    has_scheduled_changes: false,
    change_scheduled_at: null,
    remaining_count: 121,
    payment_method: null,
    source: 'api',
    ...overrides,
  };
}

export function makeRazorpayPayment(
  overrides: Partial<RazorpayPayment> = {}
): RazorpayPayment {
  return {
    id: 'pay_Unit000001',
    entity: 'payment',
    amount: 99000,
    currency: 'INR',
    status: 'captured',
    method: 'card',
    order_id: 'order_Unit000001',
    invoice_id: 'inv_Unit000001',
    international: false,
    amount_refunded: 0,
    refund_status: null,
    captured: true,
    card: {
      last4: '1111',
      network: 'Visa',
      type: 'credit',
      issuer: 'HDFC',
      international: false,
    },
    created_at: 1792562500,
    ...overrides,
  };
}

/** A payment that is ours: a captured first charge on the demo account. */
export function makeNoteContext(
  overrides: Partial<PaymentNoteContext> = {}
): PaymentNoteContext {
  return {
    accountId: ACCOUNT_ID,
    workspace: 'Replai Demo',
    env: 'dev',
    mode: 'test',
    planName: 'Replai',
    cycleLabel: 'Monthly',
    subscriptionId: 'sub_Unit000001',
    invoiceId: 'inv_Unit000001',
    kind: 'charge',
    createdAt: '2026-10-22T11:33:58.000Z',
    periodStart: '2026-10-22T11:33:58.000Z',
    periodEnd: '2026-11-21T11:33:58.000Z',
    firstAppliedChargeAt: '2026-10-22T11:33:58.000Z',
    ...overrides,
  };
}

/** In-memory BillingDb: every method is a vi.fn with a harmless default. */
export function makeDb() {
  return {
    claimCheckout: vi.fn<BillingDb['claimCheckout']>(),
    attachProviderSubscription:
      vi.fn<BillingDb['attachProviderSubscription']>(),
    markCreateFailed: vi.fn<BillingDb['markCreateFailed']>(
      async () => undefined
    ),
    markSuperseded: vi.fn<BillingDb['markSuperseded']>(async () => undefined),
    applySubscriptionSnapshot: vi.fn<BillingDb['applySubscriptionSnapshot']>(
      async () => ({
        outcome: 'applied',
      })
    ),
    applyPayment: vi.fn<BillingDb['applyPayment']>(async () => ({
      outcome: 'granted',
    })),
    getLatestSubscription: vi.fn<BillingDb['getLatestSubscription']>(
      async () => null
    ),
    getSubscription: vi.fn<BillingDb['getSubscription']>(async () => null),
    isPaymentApplied: vi.fn<BillingDb['isPaymentApplied']>(async () => false),
    isCurrentCyclePaid: vi.fn<BillingDb['isCurrentCyclePaid']>(
      async () => false
    ),
    getLastFailedPayment: vi.fn<BillingDb['getLastFailedPayment']>(
      async () => null
    ),
    getContact: vi.fn<BillingDb['getContact']>(async () => ({
      name: 'Demo Owner',
      email: 'owner@example.com',
      phone: null,
    })),
    getPaymentNoteContext: vi.fn<BillingDb['getPaymentNoteContext']>(
      async () => null
    ),
    listPaymentIdsForNotes: vi.fn<BillingDb['listPaymentIdsForNotes']>(
      async () => []
    ),
    markCancelRequested: vi.fn<BillingDb['markCancelRequested']>(
      async () => undefined
    ),
    refreshMethodSummary: vi.fn<BillingDb['refreshMethodSummary']>(
      async () => undefined
    ),
  } satisfies BillingDb;
}

/** Razorpay client fake: every call must be stubbed by the test that expects it. */
export function makeClient() {
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected Razorpay call: ${name}`);
  };
  return {
    createSubscription: vi.fn<RazorpayClientLike['createSubscription']>(
      unexpected('createSubscription')
    ),
    fetchSubscription: vi.fn<RazorpayClientLike['fetchSubscription']>(
      unexpected('fetchSubscription')
    ),
    cancelSubscription: vi.fn<RazorpayClientLike['cancelSubscription']>(
      unexpected('cancelSubscription')
    ),
    fetchPayment: vi.fn<RazorpayClientLike['fetchPayment']>(
      unexpected('fetchPayment')
    ),
    fetchInvoice: vi.fn<RazorpayClientLike['fetchInvoice']>(
      unexpected('fetchInvoice')
    ),
    listSubscriptionInvoices: vi.fn<
      RazorpayClientLike['listSubscriptionInvoices']
    >(unexpected('listSubscriptionInvoices')),
    updatePaymentNotes: vi.fn<RazorpayClientLike['updatePaymentNotes']>(
      unexpected('updatePaymentNotes')
    ),
  } satisfies RazorpayClientLike;
}
