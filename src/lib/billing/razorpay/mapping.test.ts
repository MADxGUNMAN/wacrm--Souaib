import { describe, expect, it } from 'vitest';

import cancelled from './__fixtures__/subscription-cancelled.json';
import deferred from './__fixtures__/subscription-created-deferred.json';
import immediate from './__fixtures__/subscription-created-immediate.json';
import invoice from './__fixtures__/invoice-issued-immediate.json';
import failedPayment from './__fixtures__/payment-failed-mandate.json';
import {
  autopayDisplayState,
  customerFailureMessage,
  maskVpa,
  noteValue,
  toInvoiceSnapshot,
  toPaymentSnapshot,
  toSubscriptionSnapshot,
  unixToIso,
} from './mapping';
import type {
  RazorpayInvoice,
  RazorpayPayment,
  RazorpaySubscription,
} from './types';

const FETCHED = new Date('2026-10-21T05:00:00.000Z');

describe('toSubscriptionSnapshot (real Phase 0 payloads)', () => {
  it('maps a deferred subscription with seconds converted to ISO', () => {
    const snap = toSubscriptionSnapshot(
      deferred as unknown as RazorpaySubscription,
      FETCHED
    );
    expect(snap).toMatchObject({
      provider_subscription_id: 'sub_TqQrUBh0Ic4tPv',
      provider_plan_id: 'plan_TqQrSLdcZJtDC3',
      status: 'created',
      customer_id: null,
      start_at: '2026-11-04T04:48:50.000Z',
      charge_at: '2026-11-04T04:48:50.000Z',
      current_start: null,
      total_count: 10,
      remaining_count: 10,
      notes_env: 'dev',
      notes_account_id: null,
      short_url: 'https://rzp.io/rzp/pPBNcdM',
      fetched_at: FETCHED.toISOString(),
    });
  });

  it('maps an immediate subscription (no start_at) and a cancelled one', () => {
    const imm = toSubscriptionSnapshot(
      immediate as unknown as RazorpaySubscription,
      FETCHED
    );
    expect(imm.start_at).toBeNull();
    expect(imm.remaining_count).toBe(119);
    const can = toSubscriptionSnapshot(
      cancelled as unknown as RazorpaySubscription,
      FETCHED
    );
    expect(can.status).toBe('cancelled');
    expect(can.ended_at).not.toBeNull();
  });
});

describe('toInvoiceSnapshot', () => {
  it('keeps amounts in paise and drops customer details', () => {
    const snap = toInvoiceSnapshot(invoice as unknown as RazorpayInvoice);
    expect(snap).toMatchObject({
      provider_invoice_id: 'inv_TqQrTFVHzXi53f',
      provider_subscription_id: 'sub_TqQrSZl9fuHjgT',
      status: 'issued',
      amount_minor: 99000,
      amount_paid_minor: 0,
      amount_due_minor: 99000,
      billing_start: null,
      billing_end: null,
      provider_payment_id: null,
    });
    expect(JSON.stringify(snap)).not.toMatch(/customer_details|email|contact/);
    expect(snap.line_items[0]).toEqual({
      name: '<redacted>',
      amount_minor: 99000,
      type: 'plan',
      quantity: 1,
    });
  });
});

describe('toPaymentSnapshot', () => {
  it('maps the failed mandate payment with card summary and error fields only', () => {
    const snap = toPaymentSnapshot(
      failedPayment as unknown as RazorpayPayment,
      'sub_TqQrToVQ4T33LB'
    );
    expect(snap).toMatchObject({
      provider_payment_id: 'pay_TqRBdZ9TAT3iGD',
      provider_subscription_id: 'sub_TqQrToVQ4T33LB',
      status: 'failed',
      amount_minor: 500,
      captured: false,
      method: 'card',
      card_network: 'Visa',
      card_type: 'credit',
      card_last4: '4366',
      card_issuer: 'UTIB',
      error_code: 'SERVER_ERROR',
      error_step: 'card_mandate_process',
      error_reason: 'server_error',
    });
    const text = JSON.stringify(snap);
    expect(text).not.toContain('token_');
    expect(text).not.toMatch(/"email"|"contact"/);
  });

  it('masks a VPA and rejects a malformed last4', () => {
    const upi = toPaymentSnapshot(
      {
        ...(failedPayment as unknown as RazorpayPayment),
        method: 'upi',
        card: { last4: '43a6' },
        vpa: 'someone.name@ybl',
      },
      'sub_x'
    );
    expect(upi.vpa_masked).toBe('so****@ybl');
    expect(upi.card_last4).toBeNull();
  });
});

describe('small helpers', () => {
  it('unixToIso ignores empty values', () => {
    expect(unixToIso(null)).toBeNull();
    expect(unixToIso(0)).toBeNull();
    expect(unixToIso(1792558193)).toBe('2026-10-21T04:49:53.000Z');
  });

  it('noteValue copes with Razorpay sending [] for no notes', () => {
    expect(noteValue([], 'account_id')).toBeNull();
    expect(noteValue({ account_id: ' abc ' }, 'account_id')).toBe('abc');
    expect(noteValue(null, 'account_id')).toBeNull();
  });

  it('maskVpa', () => {
    expect(maskVpa('ab@okhdfcbank')).toBe('a****@okhdfcbank');
    expect(maskVpa('x@upi')).toBe('x****@upi');
    expect(maskVpa('no-at-sign')).toBeNull();
    expect(maskVpa('@ybl')).toBeNull();
    expect(maskVpa(null)).toBeNull();
  });
});

describe('autopayDisplayState', () => {
  const show = (
    status: Parameters<typeof autopayDisplayState>[0]['status'],
    cancelAtCycleEnd = false,
    currentCyclePaid = false
  ) => autopayDisplayState({ status, cancelAtCycleEnd, currentCyclePaid }).key;

  it('never calls an authorised mandate a payment', () => {
    expect(show('authenticated')).toBe('autopay_authorised');
    expect(
      autopayDisplayState({
        status: 'authenticated',
        cancelAtCycleEnd: false,
        currentCyclePaid: false,
      }).label
    ).toBe('AutoPay authorised');
  });

  it('distinguishes pending, paid and failed', () => {
    expect(show('active', false, false)).toBe('payment_pending');
    expect(show('active', false, true)).toBe('subscription_active');
    expect(show('pending')).toBe('payment_failed_retrying');
    expect(show('halted')).toBe('action_needed');
    expect(show('active', true, true)).toBe('cancel_scheduled');
    expect(show('cancelled')).toBe('autopay_cancelled');
    expect(show('created')).toBe('checkout_incomplete');
    expect(show('superseded')).toBe('hidden');
    expect(show('expired')).toBe('hidden');
  });
});

describe('customerFailureMessage', () => {
  it('turns provider reasons into plain language and never echoes raw text', () => {
    expect(
      customerFailureMessage('BAD_REQUEST_ERROR', 'insufficient_funds')
    ).toMatch(/insufficient balance/);
    expect(
      customerFailureMessage(
        'BAD_REQUEST_ERROR',
        'international_transaction_not_allowed'
      )
    ).toMatch(/outside India/);
    expect(customerFailureMessage('SERVER_ERROR', 'server_error')).toMatch(
      /temporary problem/
    );
    expect(
      customerFailureMessage('BAD_REQUEST_ERROR', 'card_declined')
    ).toMatch(/declined/);
    expect(customerFailureMessage(null, null)).toBe(
      'The payment did not go through.'
    );
    expect(
      customerFailureMessage('X', 'card_mandate_process internal')
    ).not.toContain('card_mandate_process');
  });
});
