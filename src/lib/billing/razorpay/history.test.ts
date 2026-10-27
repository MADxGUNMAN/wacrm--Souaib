import { describe, expect, it } from 'vitest';

import { classifyPaymentRow, toCustomerAutopayPayment } from './history';

type Row = Parameters<typeof toCustomerAutopayPayment>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'bp-1',
    provider_payment_id: 'pay_Unit000001',
    kind: 'charge',
    status: 'captured',
    amount_minor: 99000,
    amount_refunded_minor: 0,
    refund_status: null,
    currency: 'INR',
    method: 'upi',
    card_network: null,
    card_last4: null,
    vpa_masked: 'te****@razorpay',
    error_code: null,
    error_reason: null,
    granted_from: '2027-04-06T11:49:35Z',
    granted_until: '2027-05-06T11:49:35Z',
    access_applied_at: '2027-04-06T12:00:00Z',
    access_revoked_at: null,
    provider_created_at: '2027-04-06T11:50:00Z',
    created_at: '2027-04-06T11:50:05Z',
    subscription_id: 'bs-1',
    invoice: {
      short_url: 'https://rzp.io/i/abc',
      status: 'paid',
      provider_invoice_id: 'inv_Unit000001',
    },
    subscription: {
      provider_subscription_id: 'sub_Unit000001',
      plan_name: 'Replai Pro',
      cycle_label: 'Monthly',
    },
    ...overrides,
  };
}

describe('classifyPaymentRow', () => {
  it('says "paid" only when the payment bought access', () => {
    expect(classifyPaymentRow(row())).toBe('paid');
    // Captured but not applied (awaiting the paid invoice, or a failed check).
    expect(classifyPaymentRow(row({ access_applied_at: null }))).toBe(
      'processing'
    );
  });

  it('separates failures, refunds and the setup check', () => {
    expect(classifyPaymentRow(row({ status: 'failed' }))).toBe('failed');
    expect(
      classifyPaymentRow(row({ status: 'refunded', refund_status: 'full' }))
    ).toBe('refunded');
    expect(classifyPaymentRow(row({ refund_status: 'partial' }))).toBe(
      'partly_refunded'
    );
    expect(
      classifyPaymentRow(
        row({
          kind: 'authorization',
          status: 'refunded',
          access_applied_at: null,
        })
      )
    ).toBe('verification');
  });
});

describe('toCustomerAutopayPayment', () => {
  it('projects a paid charge with its receipt and period', () => {
    expect(toCustomerAutopayPayment(row())).toEqual({
      id: 'bp-1',
      reference: 'pay_Unit000001',
      state: 'paid',
      isVerification: false,
      amount: 990,
      amountRefunded: 0,
      currency: 'INR',
      method: {
        type: 'upi',
        network: null,
        last4: null,
        vpaMasked: 'te****@razorpay',
      },
      failureReason: null,
      periodStart: '2027-04-06T11:49:35Z',
      periodEnd: '2027-05-06T11:49:35Z',
      receiptUrl: 'https://rzp.io/i/abc',
      invoiceReference: 'inv_Unit000001',
      planName: 'Replai Pro',
      cycleLabel: 'Monthly',
      chargeType: 'first_payment',
      chargeLabel: 'First payment',
      createdAt: '2027-04-06T11:50:00Z',
    });
  });

  it('labels a later charge on the same subscription as a renewal', () => {
    const first = new Map([['bs-1', '2027-03-06T11:50:00Z']]);
    expect(toCustomerAutopayPayment(row(), first)).toMatchObject({
      chargeType: 'renewal',
      chargeLabel: 'Renewal',
    });
    // The first charge itself (same instant) stays the first payment.
    const same = new Map([['bs-1', '2027-04-06T11:50:00Z']]);
    expect(toCustomerAutopayPayment(row(), same).chargeType).toBe(
      'first_payment'
    );
  });

  it('labels the setup check and shows no invoice id for it', () => {
    const t = toCustomerAutopayPayment(
      row({ kind: 'authorization', invoice: null, access_applied_at: null })
    );
    expect(t).toMatchObject({
      chargeType: 'card_verification',
      chargeLabel: 'AutoPay setup check',
      invoiceReference: null,
      planName: 'Replai Pro',
    });
  });

  it('offers a receipt only for a paid invoice, never a guess', () => {
    expect(
      toCustomerAutopayPayment(
        row({ invoice: { short_url: 'https://rzp.io/i/x', status: 'issued' } })
      ).receiptUrl
    ).toBeNull();
    expect(
      toCustomerAutopayPayment(row({ invoice: null })).receiptUrl
    ).toBeNull();
  });

  it('turns a failure into plain language, not Razorpay text', () => {
    const t = toCustomerAutopayPayment(
      row({
        status: 'failed',
        error_code: 'SERVER_ERROR',
        error_reason: 'server_error',
        access_applied_at: null,
      })
    );
    expect(t.failureReason).toMatch(/temporary problem/);
    expect(JSON.stringify(t)).not.toMatch(/card_mandate_process|SERVER_ERROR/);
  });

  it('drops the covered period once a refund took it back', () => {
    const t = toCustomerAutopayPayment(
      row({
        status: 'refunded',
        refund_status: 'full',
        amount_refunded_minor: 99000,
        access_revoked_at: '2027-04-10T00:00:00Z',
      })
    );
    expect(t).toMatchObject({
      state: 'refunded',
      amountRefunded: 990,
      periodStart: null,
      periodEnd: null,
    });
  });

  it('marks the ₹5 setup check', () => {
    const t = toCustomerAutopayPayment(
      row({
        kind: 'authorization',
        status: 'refunded',
        amount_minor: 500,
        amount_refunded_minor: 500,
        access_applied_at: null,
        invoice: null,
      })
    );
    expect(t).toMatchObject({
      state: 'verification',
      isVerification: true,
      amount: 5,
      amountRefunded: 5,
      receiptUrl: null,
    });
  });
});
