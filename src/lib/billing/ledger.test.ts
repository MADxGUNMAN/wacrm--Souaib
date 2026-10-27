import { describe, expect, it } from 'vitest';

import {
  razorpayLedgerStatus,
  manualLedgerStatus,
  selectLedgerPage,
  toLedgerFromManual,
  toLedgerFromRazorpay,
  type LedgerParams,
  type ManualLedgerInput,
} from './ledger';
import { safeMinor } from './ledger-db';
import type { AdminPaymentRow } from './razorpay/admin-db';

function payment(over: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    id: 'p1',
    mode: 'test',
    accountId: 'acc1',
    accountName: 'Acme',
    providerPaymentId: 'pay_A',
    providerOrderId: null,
    subscriptionId: 'sub-row-1',
    providerSubscriptionId: 'sub_A',
    invoiceId: null,
    providerInvoiceId: null,
    planName: 'Pro',
    cycleLabel: 'Monthly',
    chargeType: 'renewal',
    kind: 'charge',
    status: 'captured',
    amountMinor: 900000,
    currency: 'INR',
    amountRefundedMinor: 0,
    refundStatus: null,
    captured: true,
    method: 'upi',
    cardNetwork: null,
    cardType: null,
    cardLast4: null,
    cardIssuer: null,
    vpaMasked: 'te****@razorpay',
    bank: null,
    wallet: null,
    feeMinor: null,
    taxMinor: null,
    errorCode: null,
    errorDescription: null,
    errorSource: null,
    errorStep: null,
    errorReason: null,
    providerCreatedAt: '2026-10-22T10:00:00.000Z',
    capturedAt: null,
    failedAt: null,
    grantedFrom: '2026-10-22T10:00:00.000Z',
    grantedUntil: '2026-11-21T10:00:00.000Z',
    accessAppliedAt: null,
    anomaly: null,
    createdAt: '2026-10-22T10:00:01.000Z',
    ...over,
  };
}

function manual(over: Partial<ManualLedgerInput> = {}): ManualLedgerInput {
  return {
    id: 'r1',
    accountId: 'acc2',
    accountName: 'Bharat Stores',
    ownerEmail: 'b@example.com',
    planName: 'Pro',
    cycleLabel: 'Yearly',
    expectedMinor: 2257500,
    paidMinor: 2257500,
    currency: 'INR',
    transactionRef: '614912345678',
    payerUpiId: 'b@upi',
    status: 'approved',
    activatedFrom: null,
    activatedUntil: null,
    createdAt: '2026-10-21T10:00:00.000Z',
    ...over,
  };
}

const P: LedgerParams = {
  channel: 'all',
  status: 'all',
  mode: 'all',
  search: '',
  sort: 'date:desc',
  page: 1,
  pageSize: 20,
};

describe('ledger status mapping', () => {
  it.each([
    [
      {
        status: 'captured',
        captured: true,
        amountMinor: 100,
        amountRefundedMinor: 0,
      },
      'paid',
    ],
    [
      {
        status: 'captured',
        captured: true,
        amountMinor: 100,
        amountRefundedMinor: 40,
      },
      'partially_refunded',
    ],
    [
      {
        status: 'captured',
        captured: true,
        amountMinor: 100,
        amountRefundedMinor: 100,
      },
      'refunded',
    ],
    [
      {
        status: 'refunded',
        captured: true,
        amountMinor: 500,
        amountRefundedMinor: 500,
      },
      'refunded',
    ],
    [
      {
        status: 'failed',
        captured: false,
        amountMinor: 100,
        amountRefundedMinor: 0,
      },
      'failed',
    ],
    [
      {
        status: 'created',
        captured: false,
        amountMinor: 100,
        amountRefundedMinor: 0,
      },
      'pending',
    ],
    [
      {
        status: 'authorized',
        captured: false,
        amountMinor: 100,
        amountRefundedMinor: 0,
      },
      'pending',
    ],
  ])('%o -> %s', (p, want) => {
    expect(razorpayLedgerStatus(p)).toBe(want);
  });

  it('maps manual review states', () => {
    expect(manualLedgerStatus('approved')).toBe('paid');
    expect(manualLedgerStatus('pending')).toBe('pending');
    expect(manualLedgerStatus('rejected')).toBe('rejected');
  });

  it('the ₹5 AutoPay setup check is a refunded card verification', () => {
    const row = toLedgerFromRazorpay(
      payment({
        kind: 'authorization',
        chargeType: 'card_verification',
        status: 'refunded',
        amountMinor: 500,
        amountRefundedMinor: 500,
      }),
      'owner@example.com'
    );
    expect(row).toMatchObject({
      channel: 'razorpay',
      type: 'card_verification',
      status: 'refunded',
      refundedMinor: 500,
      mode: 'test',
      reference: 'pay_A',
      ownerEmail: 'owner@example.com',
    });
  });

  it('a manual row has no mode and references its UTR', () => {
    const row = toLedgerFromManual(manual());
    expect(row).toMatchObject({
      key: 'upi:r1',
      channel: 'manual_upi',
      type: 'manual_payment',
      mode: null,
      method: 'upi_qr',
      reference: '614912345678',
      paymentRequestId: 'r1',
      status: 'paid',
    });
  });

  it('converts manual major amounts to minor', () => {
    expect(safeMinor('990.00', 'INR')).toBe(99000);
    expect(safeMinor(22575, 'INR')).toBe(2257500);
    expect(safeMinor(null, 'INR')).toBe(0);
  });
});

describe('selectLedgerPage', () => {
  const rows = [
    toLedgerFromRazorpay(
      payment({ id: 'a', providerCreatedAt: '2026-10-22T10:00:00.000Z' }),
      null
    ),
    toLedgerFromRazorpay(
      payment({
        id: 'b',
        providerCreatedAt: '2026-10-21T10:00:00.000Z',
        status: 'failed',
        captured: false,
        amountMinor: 100,
        mode: 'live',
      }),
      null
    ),
    toLedgerFromManual(
      manual({ id: 'c', createdAt: '2026-10-21T10:00:00.000Z' })
    ),
    toLedgerFromManual(
      manual({
        id: 'd',
        createdAt: '2026-10-20T10:00:00.000Z',
        status: 'rejected',
        paidMinor: 99000,
      })
    ),
    toLedgerFromRazorpay(
      payment({
        id: 'e',
        providerCreatedAt: '2026-10-19T10:00:00.000Z',
        amountRefundedMinor: 100,
      }),
      null
    ),
  ];

  it('merges both channels newest first with a stable tie-break', () => {
    const r = selectLedgerPage(rows, P);
    // b and c share a timestamp: key order breaks the tie (rzp < upi).
    expect(r.items.map((x) => x.key)).toEqual([
      'rzp:a',
      'rzp:b',
      'upi:c',
      'upi:d',
      'rzp:e',
    ]);
    expect(r.total).toBe(5);
  });

  it('sorts oldest first and by amount', () => {
    expect(
      selectLedgerPage(rows, { ...P, sort: 'date:asc' }).items[0].key
    ).toBe('rzp:e');
    expect(
      selectLedgerPage(rows, { ...P, sort: 'amount:desc' }).items[0].key
    ).toBe('upi:c');
  });

  it('pages', () => {
    const r = selectLedgerPage(rows, { ...P, pageSize: 2, page: 3 });
    expect(r.totalPages).toBe(3);
    expect(r.items.map((x) => x.key)).toEqual(['rzp:e']);
  });

  it('filters channel, status, mode and search', () => {
    expect(selectLedgerPage(rows, { ...P, channel: 'manual_upi' }).total).toBe(
      2
    );
    expect(
      selectLedgerPage(rows, { ...P, status: 'failed' }).items[0].key
    ).toBe('rzp:b');
    // refunded matches partly refunded too
    expect(
      selectLedgerPage(rows, { ...P, status: 'refunded' }).items.map(
        (x) => x.key
      )
    ).toEqual(['rzp:e']);
    // explicit mode drops manual rows
    expect(
      selectLedgerPage(rows, { ...P, mode: 'test' }).items.every(
        (x) => x.channel === 'razorpay'
      )
    ).toBe(true);
    expect(selectLedgerPage(rows, { ...P, search: '614912' }).total).toBe(2);
    expect(selectLedgerPage(rows, { ...P, search: 'bharat' }).total).toBe(2);
  });

  it('each count dimension ignores its own filter', () => {
    const r = selectLedgerPage(rows, {
      ...P,
      channel: 'manual_upi',
      status: 'paid',
    });
    expect(r.total).toBe(1);
    // channel counts: status=paid applied, channel not
    expect(r.counts.channel).toEqual({ razorpay: 1, manual_upi: 1 });
    // status counts: channel=manual_upi applied, status not
    expect(r.counts.status).toEqual({
      paid: 1,
      pending: 0,
      failed: 0,
      rejected: 1,
      refunded: 0,
      partially_refunded: 0,
    });
  });
});
