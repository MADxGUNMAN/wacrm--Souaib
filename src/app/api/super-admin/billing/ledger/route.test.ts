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
  superAdminErrorResponse: (err: unknown) =>
    err instanceof NextResponse ? err : null,
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => state.fake.client,
  MissingServerConfigError: class extends Error {},
}));

import { GET } from './route';

const ACC = '11111111-1111-4111-8111-111111111111';
const OWN = '22222222-2222-4222-8222-222222222222';
const OWNER = 'cccccccc-0000-4000-8000-0000000000cc';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000ad';
const SUB = 'b5b5b5b5-0000-4000-8000-000000000001';

function pay(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    mode: 'test',
    provider_payment_id: `pay_${id}`,
    account_id: ACC,
    subscription_id: SUB,
    kind: 'charge',
    status: 'captured',
    amount_minor: 900000,
    currency: 'INR',
    amount_refunded_minor: 0,
    captured: true,
    method: 'upi',
    vpa_masked: 'te****@razorpay',
    provider_created_at: '2026-10-22T10:00:00.000Z',
    access_applied_at: '2026-10-22T10:00:05.000Z',
    created_at: '2026-10-22T10:00:01.000Z',
    ...over,
  };
}

function get(qs = '') {
  return GET(
    new Request(`https://app.test/api/super-admin/billing/ledger${qs}`)
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
        full_name: 'Riya',
        email: 'riya@example.com',
        is_super_admin: false,
      },
      {
        user_id: ADMIN,
        full_name: 'Admin',
        email: 'admin@example.com',
        is_super_admin: true,
      },
    ],
    billing_subscriptions: [
      {
        id: SUB,
        provider_subscription_id: 'sub_A',
        plan_name: 'Pro',
        cycle_label: 'Monthly',
      },
    ],
    billing_invoices: [{ id: 'inv-row-1', provider_invoice_id: 'inv_A' }],
    billing_payments: [
      pay('auth1', {
        kind: 'authorization',
        status: 'refunded',
        amount_minor: 500,
        amount_refunded_minor: 500,
        access_applied_at: null,
        provider_created_at: '2026-10-21T09:00:00.000Z',
      }),
      pay('charge1', { invoice_id: 'inv-row-1' }),
      pay('other', { account_id: OWN }),
    ],
    payment_requests: [
      {
        id: 'r1',
        account_id: ACC,
        plan_name_snapshot: 'Pro',
        cycle_label_snapshot: 'Yearly',
        expected_amount: '22575.00',
        paid_amount: '22575.00',
        currency: 'INR',
        transaction_ref: '614912345678',
        payer_upi_id: 'riya@upi',
        status: 'approved',
        created_at: '2026-10-21T12:00:00.000Z',
      },
      {
        id: 'r2',
        account_id: ACC,
        plan_name_snapshot: 'Pro',
        cycle_label_snapshot: 'Monthly',
        expected_amount: '990.00',
        paid_amount: '990.00',
        currency: 'INR',
        transaction_ref: '614900000000',
        status: 'rejected',
        created_at: '2026-10-20T12:00:00.000Z',
      },
    ],
  });
});

describe('GET /api/super-admin/billing/ledger', () => {
  it('403 for a non super admin', async () => {
    state.superAdmin = false;
    expect((await get()).status).toBe(403);
  });

  it.each([
    ['?channel=manual'],
    ['?status=captured'],
    ['?mode=sandbox'],
    ['?sort=amount:asc'],
  ])('400 for %s', async (qs) => {
    expect((await get(qs)).status).toBe(400);
  });

  it('merges Razorpay payments and manual requests, newest first', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { key: string }) => i.key)).toEqual([
      'rzp:charge1',
      'upi:r1',
      'rzp:auth1',
      'upi:r2',
    ]);
    expect(body.total).toBe(4);
    expect(body.counts.channel).toEqual({ razorpay: 2, manual_upi: 2 });
    expect(body.truncated).toBe(false);

    const charge = body.items[0];
    expect(charge).toMatchObject({
      channel: 'razorpay',
      type: 'first_payment',
      status: 'paid',
      amountMinor: 900000,
      ownerEmail: 'riya@example.com',
      providerSubscriptionId: 'sub_A',
      reference: 'pay_charge1',
    });
    const upi = body.items[1];
    expect(upi).toMatchObject({
      channel: 'manual_upi',
      amountMinor: 2257500,
      reference: '614912345678',
      mode: null,
    });
    expect(body.items[2]).toMatchObject({
      type: 'card_verification',
      status: 'refunded',
    });
  });

  it('excludes super-admin-owned workspaces', async () => {
    const body = await (await get()).json();
    expect(
      body.items.some((i: { accountId: string }) => i.accountId === OWN)
    ).toBe(false);
  });

  it('filters by channel, status and mode', async () => {
    const manual = await (await get('?channel=manual_upi')).json();
    expect(manual.total).toBe(2);
    const rejected = await (await get('?status=rejected')).json();
    expect(rejected.items.map((i: { key: string }) => i.key)).toEqual([
      'upi:r2',
    ]);
    const test = await (await get('?mode=test')).json();
    expect(test.counts.channel.manual_upi).toBe(0);
    expect(test.total).toBe(2);
  });

  it('is read-only', async () => {
    await get();
    expect(state.fake.writes).toEqual([]);
  });
});
