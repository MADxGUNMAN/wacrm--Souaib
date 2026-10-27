import { describe, expect, it } from 'vitest';

import {
  summariseCollected,
  type CollectedManual,
  type CollectedPayment,
  type CollectedRefund,
} from './collected';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const RECENT = '2026-10-20T10:00:00.000Z';
const OLD = '2026-09-20T10:00:00.000Z'; // 33 days before NOW

function pay(over: Partial<CollectedPayment>): CollectedPayment {
  return {
    mode: 'test',
    kind: 'charge',
    status: 'captured',
    captured: true,
    amountMinor: 900000,
    currency: 'INR',
    capturedAt: RECENT,
    createdAt: RECENT,
    ...over,
  };
}

function refund(over: Partial<CollectedRefund>): CollectedRefund {
  return {
    mode: 'test',
    status: 'processed',
    amountMinor: 500,
    currency: 'INR',
    accessEffect: 'none_not_a_charge',
    processedAt: RECENT,
    createdAt: RECENT,
    ...over,
  };
}

function manual(over: Partial<CollectedManual>): CollectedManual {
  return {
    status: 'approved',
    paidMinor: 2257500,
    currency: 'INR',
    reviewedAt: RECENT,
    createdAt: RECENT,
    ...over,
  };
}

// The live snapshot: 2 refunded ₹5 setup checks + 1 ₹9,000 test charge,
// 2 processed setup-check refunds, manual UPI 2 approved (₹45,150) and 4
// rejected.
const SNAPSHOT = {
  payments: [
    pay({ kind: 'authorization', status: 'refunded', amountMinor: 500 }),
    pay({ kind: 'authorization', status: 'refunded', amountMinor: 500 }),
    pay({}),
  ],
  refunds: [refund({}), refund({})],
  manual: [
    manual({}),
    manual({}),
    ...Array.from({ length: 4 }, () =>
      manual({ status: 'rejected', paidMinor: 99000 })
    ),
  ],
};

describe('summariseCollected', () => {
  it('matches the live snapshot', () => {
    const r = summariseCollected(SNAPSHOT, NOW).allTime;
    expect(r.autopay.test).toEqual([
      { currency: 'INR', amountMinor: 900000, count: 1 },
    ]);
    expect(r.autopay.live).toEqual([]);
    expect(r.setupChecks.test).toEqual([
      { currency: 'INR', amountMinor: 1000, count: 2 },
    ]);
    // Setup-check refunds never net against revenue.
    expect(r.refunds.test).toEqual([]);
    expect(r.manualUpi).toEqual([
      { currency: 'INR', amountMinor: 4515000, count: 2 },
    ]);
    // Test money never reaches the live net.
    expect(r.netLive).toEqual([
      { currency: 'INR', amountMinor: 4515000, count: 2 },
    ]);
  });

  it('nets live refunds of real charges', () => {
    const r = summariseCollected(
      {
        payments: [pay({ mode: 'live' })],
        refunds: [
          refund({
            mode: 'live',
            amountMinor: 100000,
            accessEffect: 'none_partial',
          }),
          refund({
            mode: 'live',
            status: 'pending',
            accessEffect: 'window_removed',
          }),
        ],
        manual: [],
      },
      NOW
    ).allTime;
    expect(r.refunds.live).toEqual([
      { currency: 'INR', amountMinor: 100000, count: 1 },
    ]);
    expect(r.netLive[0].amountMinor).toBe(800000);
  });

  it('excludes rows older than 30 days from the last-30-days window', () => {
    const r = summariseCollected(
      {
        payments: [pay({ mode: 'live', capturedAt: OLD, createdAt: OLD })],
        refunds: [],
        manual: [manual({ reviewedAt: OLD, createdAt: OLD })],
      },
      NOW
    );
    expect(r.last30d.autopay.live).toEqual([]);
    expect(r.last30d.manualUpi).toEqual([]);
    expect(r.allTime.autopay.live).toHaveLength(1);
    expect(r.allTime.manualUpi).toHaveLength(1);
  });

  it('keeps currencies apart, INR first', () => {
    const r = summariseCollected(
      {
        payments: [
          pay({ mode: 'live', currency: 'USD', amountMinor: 1000 }),
          pay({ mode: 'live' }),
        ],
        refunds: [],
        manual: [],
      },
      NOW
    ).allTime;
    expect(r.autopay.live.map((l) => l.currency)).toEqual(['INR', 'USD']);
  });

  it('ignores uncaptured and failed payments', () => {
    const r = summariseCollected(
      {
        payments: [
          pay({ status: 'failed', captured: false }),
          pay({ status: 'authorized', captured: false }),
        ],
        refunds: [],
        manual: [],
      },
      NOW
    ).allTime;
    expect(r.autopay.test).toEqual([]);
  });
});
