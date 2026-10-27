import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

import { createFakeAdmin } from '@/lib/billing/__fixtures__/fake-admin';

const state = vi.hoisted(() => ({
  superAdmin: true,
  fake: null as unknown as ReturnType<
    typeof import('@/lib/billing/__fixtures__/fake-admin').createFakeAdmin
  >,
}));

vi.mock('@/lib/super-admin/guard', () => ({
  requireSuperAdmin: async () => {
    if (!state.superAdmin) {
      throw NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return { userId: 'admin-1', email: 'sa@example.com' };
  },
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => state.fake.client,
}));

import { GET } from './route';

const ACC = '11111111-1111-4111-8111-111111111111';
const OWN = '22222222-2222-4222-8222-222222222222'; // super-admin-owned
const OWNER = 'cccccccc-0000-4000-8000-0000000000cc';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000ad';
const SUB = 'b5b5b5b5-0000-4000-8000-000000000001';
const PAY = 'b6b6b6b6-0000-4000-8000-000000000002';
const PR = 'b7b7b7b7-0000-4000-8000-000000000003';

type Shape = [
  string,
  string | null,
  boolean,
  boolean,
  boolean,
  string | null,
  number,
];
// event_type, source, has pr, has sub, has pay, actor, count (live audit)
const SHAPES: Shape[] = [
  ['autopay_activated', 'razorpay_webhook', false, true, false, null, 1],
  ['autopay_authenticated', 'checkout', false, true, false, null, 1],
  ['autopay_authenticated', 'razorpay_webhook', false, true, false, null, 1],
  ['autopay_cancelled', 'customer', false, true, false, null, 1],
  ['autopay_checkout_created', 'checkout', false, true, false, OWNER, 3],
  ['billing_admin_action', 'admin', false, true, false, ADMIN, 5],
  ['payment_approved', null, true, false, false, ADMIN, 2],
  ['payment_rejected', null, true, false, false, ADMIN, 4],
  ['payment_submitted', null, true, false, false, OWNER, 6],
  ['payment_succeeded', 'razorpay_webhook', false, true, true, null, 1],
  ['subscription_activated', null, false, false, false, ADMIN, 13],
  ['subscription_activated', null, true, false, false, ADMIN, 1],
  ['subscription_expired', null, false, false, false, ADMIN, 29],
  ['subscription_extended', null, false, false, false, ADMIN, 8],
  ['subscription_extended', null, true, false, false, ADMIN, 1],
  ['trial_extended', null, false, false, false, ADMIN, 29],
];

function seedEvents() {
  const rows: Record<string, unknown>[] = [];
  let n = 0;
  const base = Date.parse('2026-10-20T00:00:00.000Z');
  for (const [type, source, pr, sub, pay, actor, count] of SHAPES) {
    for (let i = 0; i < count; i++) {
      n += 1;
      rows.push({
        id: `e${String(n).padStart(4, '0')}`,
        account_id: ACC,
        event_type: type,
        source,
        payment_request_id: pr ? PR : null,
        billing_subscription_id: sub ? SUB : null,
        billing_payment_id: pay ? PAY : null,
        actor_user_id: actor,
        amount:
          type.startsWith('autopay') || type === 'payment_succeeded'
            ? '9000.00'
            : null,
        note:
          type === 'autopay_authenticated'
            ? 'Razorpay sub_TrEgorVChJpnSX: created -> authenticated'
            : null,
        created_at: new Date(base - n * 3600000).toISOString(),
      });
    }
  }
  // A super-admin-owned workspace's event must never appear.
  rows.push({
    id: 'e9999',
    account_id: OWN,
    event_type: 'trial_extended',
    source: null,
    actor_user_id: ADMIN,
    created_at: new Date(base).toISOString(),
  });
  return rows;
}

function get(qs = '') {
  return GET(
    new Request(`https://app.test/api/super-admin/billing/events${qs}`)
  );
}

beforeEach(() => {
  state.superAdmin = true;
  state.fake = createFakeAdmin({
    accounts: [
      { id: ACC, name: 'Acme Traders', owner_user_id: OWNER },
      { id: OWN, name: 'Platform', owner_user_id: ADMIN },
    ],
    profiles: [
      {
        user_id: OWNER,
        full_name: 'Riya Owner',
        email: 'riya@example.com',
        is_super_admin: false,
      },
      {
        user_id: ADMIN,
        full_name: 'Platform Admin',
        email: 'admin@example.com',
        is_super_admin: true,
      },
    ],
    subscription_events: seedEvents(),
    billing_subscriptions: [
      {
        id: SUB,
        mode: 'test',
        currency: 'INR',
        provider_subscription_id: 'sub_TrEgorVChJpnSX',
      },
    ],
    billing_payments: [
      {
        id: PAY,
        mode: 'test',
        currency: 'INR',
        provider_payment_id: 'pay_TrF0000000001',
      },
    ],
    payment_requests: [
      { id: PR, currency: 'INR', transaction_ref: '614912345678' },
    ],
  });
});

describe('GET /api/super-admin/billing/events', () => {
  it('403 for a non super admin', async () => {
    state.superAdmin = false;
    expect((await get()).status).toBe(403);
  });

  it.each([
    ['?channel=manual'],
    ['?channel=payment'],
    ['?type=bogus'],
    ['?mode=sandbox'],
    ['?since=1y'],
    ['?accountId=not-a-uuid'],
  ])('400 for %s', async (qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('counts each channel exactly like the live audit', async () => {
    const body = await (await get()).json();
    expect(body.counts.byChannel).toEqual({
      razorpay: 7,
      manual_upi: 14,
      admin: 84,
      customer: 1,
      system: 0,
    });
    expect(body.counts.total).toBe(106);
    expect(body.truncated).toBe(false);
    expect(body.events).toHaveLength(20);
  });

  it('channel=razorpay returns only Razorpay rows and the tiles stay whole', async () => {
    const body = await (await get('?channel=razorpay&pageSize=100')).json();
    expect(body.counts.total).toBe(7);
    expect(body.events).toHaveLength(7);
    for (const e of body.events) expect(e.channel).toBe('razorpay');
    // byChannel ignores the channel filter itself.
    expect(body.counts.byChannel.admin).toBe(84);
  });

  it('never calls a Razorpay event Manual', async () => {
    const body = await (await get('?pageSize=100&page=1')).json();
    const autopay = body.events.filter((e: { eventType: string }) =>
      e.eventType.startsWith('autopay_')
    );
    expect(autopay.length).toBeGreaterThan(0);
    for (const e of autopay) expect(e.channel).not.toBe('manual_upi');
  });

  it('mode=test keeps only Razorpay-linked rows', async () => {
    const body = await (await get('?mode=test&pageSize=100')).json();
    expect(body.counts.total).toBe(13); // 7 razorpay + 1 customer + 5 admin
    for (const e of body.events) expect(e.mode).toBe('test');
    expect(body.counts.byChannel.manual_upi).toBe(0);
  });

  it('searches by sub_ id and by UTR', async () => {
    const bySub = await (await get('?search=sub_TrEgor&pageSize=100')).json();
    expect(bySub.counts.total).toBe(13);
    const byUtr = await (await get('?search=614912345678&pageSize=100')).json();
    expect(byUtr.counts.total).toBe(14);
    for (const e of byUtr.events) expect(e.utr).toBe('614912345678');
  });

  it('pages', async () => {
    const p1 = await (await get('?pageSize=50&page=1')).json();
    const p3 = await (await get('?pageSize=50&page=3')).json();
    expect(p1.totalPages).toBe(3);
    expect(p3.events).toHaveLength(6);
    expect(p3.page).toBe(3);
    // Newest first, no overlap between pages.
    const ids = new Set(p1.events.map((e: { id: string }) => e.id));
    for (const e of p3.events) expect(ids.has(e.id)).toBe(false);
  });

  it('excludes super-admin-owned workspaces', async () => {
    const body = await (await get('?pageSize=100&search=Platform%20')).json();
    for (const e of body.events) expect(e.accountId).not.toBe(OWN);
  });

  it('carries INR on amounts and resolves references', async () => {
    const body = await (await get('?type=payment_succeeded')).json();
    expect(body.events).toHaveLength(1);
    const e = body.events[0];
    expect(e.currency).toBe('INR');
    expect(e.amount).toBe(9000);
    expect(e.amountKind).toBe('paid');
    expect(e.moneyInvolved).toBe('autopay');
    expect(e.providerPaymentId).toBe('pay_TrF0000000001');
    expect(e.providerSubscriptionId).toBe('sub_TrEgorVChJpnSX');
    expect(e.initiatedBy).toEqual({
      kind: 'razorpay',
      label: 'Razorpay',
      detail: 'Webhook',
    });
    // The type filter is applied in SQL, on the event_type column.
    expect(state.fake.calls).toContainEqual({
      table: 'subscription_events',
      op: 'eq',
      column: 'event_type',
      value: 'payment_succeeded',
    });
  });

  it('filters one workspace on the account_id COLUMN', async () => {
    const body = await (await get(`?accountId=${ACC}&pageSize=5`)).json();
    expect(body.counts.total).toBe(106);
    expect(state.fake.calls).toContainEqual({
      table: 'subscription_events',
      op: 'eq',
      column: 'account_id',
      value: ACC,
    });
  });

  it('applies the date window in SQL on created_at', async () => {
    await get('?since=7d');
    const gte = state.fake.calls.find(
      (c) => c.table === 'subscription_events' && c.op === 'gte'
    );
    expect(gte?.column).toBe('created_at');
  });

  it('is read-only', async () => {
    await get('?pageSize=100');
    expect(state.fake.writes).toEqual([]);
  });
});
