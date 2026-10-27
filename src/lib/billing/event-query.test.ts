import { describe, expect, it } from 'vitest';

import type { BillingEventView } from '@/types/super-admin';

import { selectEventsPage, type EventPageParams } from './event-query';

function ev(
  id: string,
  over: Partial<BillingEventView> = {}
): BillingEventView {
  return {
    id,
    accountId: 'acc',
    accountName: 'Acme',
    ownerEmail: 'owner@example.com',
    eventType: 'trial_extended',
    channel: 'admin',
    context: null,
    initiatedBy: { kind: 'admin', label: 'Asha', detail: 'Super admin' },
    moneyInvolved: 'none',
    amountKind: null,
    amount: null,
    currency: 'INR',
    mode: null,
    fromStatus: null,
    toStatus: null,
    endsAt: null,
    previousEndsAt: null,
    durationMonths: null,
    durationDays: null,
    windowKind: null,
    planName: null,
    cycleLabel: null,
    note: null,
    paymentRequestId: null,
    billingSubscriptionId: null,
    billingPaymentId: null,
    providerSubscriptionId: null,
    providerPaymentId: null,
    utr: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    ...over,
  };
}

const P: EventPageParams = {
  channel: 'all',
  mode: 'all',
  search: '',
  page: 1,
  pageSize: 2,
};

const ROWS = [
  ev('1', {
    channel: 'razorpay',
    mode: 'test',
    providerSubscriptionId: 'sub_A',
  }),
  ev('2', { channel: 'razorpay', mode: 'live' }),
  ev('3', { channel: 'manual_upi', utr: '6149' }),
  ev('4'),
  ev('5', { channel: 'customer', mode: 'test' }),
];

describe('selectEventsPage', () => {
  it('counts per channel over the whole filtered set', () => {
    const r = selectEventsPage(ROWS, P);
    expect(r.counts.total).toBe(5);
    expect(r.counts.byChannel).toEqual({
      razorpay: 2,
      manual_upi: 1,
      admin: 1,
      customer: 1,
      system: 0,
    });
    expect(r.events.map((e) => e.id)).toEqual(['1', '2']);
    expect(r.totalPages).toBe(3);
  });

  it('channel filter narrows total but not byChannel', () => {
    const r = selectEventsPage(ROWS, { ...P, channel: 'razorpay' });
    expect(r.counts.total).toBe(2);
    expect(r.counts.byChannel.admin).toBe(1);
  });

  it('mode filter drops rows without a Razorpay mode', () => {
    const r = selectEventsPage(ROWS, { ...P, mode: 'test', pageSize: 10 });
    expect(r.events.map((e) => e.id)).toEqual(['1', '5']);
    expect(r.counts.byChannel.manual_upi).toBe(0);
  });

  it('search matches references and initiator', () => {
    expect(selectEventsPage(ROWS, { ...P, search: 'SUB_a' }).counts.total).toBe(
      1
    );
    expect(selectEventsPage(ROWS, { ...P, search: '6149' }).counts.total).toBe(
      1
    );
    expect(selectEventsPage(ROWS, { ...P, search: 'asha' }).counts.total).toBe(
      5
    );
  });

  it('clamps a page past the end to the last page', () => {
    const r = selectEventsPage(ROWS, { ...P, page: 9 });
    expect(r.page).toBe(3);
    expect(r.events.map((e) => e.id)).toEqual(['5']);
  });

  it('answers one empty page for no rows', () => {
    const r = selectEventsPage([], P);
    expect(r).toMatchObject({ page: 1, totalPages: 1, events: [] });
  });
});
