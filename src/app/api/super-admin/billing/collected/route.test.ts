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
const NOW = new Date().toISOString();

beforeEach(() => {
  state.superAdmin = true;
  state.fake = createFakeAdmin({
    accounts: [
      { id: ACC, name: 'Acme', owner_user_id: 'u1' },
      { id: OWN, name: 'Platform', owner_user_id: 'sa' },
    ],
    profiles: [
      { user_id: 'u1', email: 'u1@example.com', is_super_admin: false },
      { user_id: 'sa', email: 'sa@example.com', is_super_admin: true },
    ],
    billing_payments: [
      {
        id: 'p1',
        account_id: ACC,
        mode: 'test',
        kind: 'charge',
        status: 'captured',
        captured: true,
        amount_minor: 900000,
        currency: 'INR',
        captured_at: NOW,
        created_at: NOW,
      },
      {
        id: 'p2',
        account_id: ACC,
        mode: 'test',
        kind: 'authorization',
        status: 'refunded',
        captured: true,
        amount_minor: 500,
        currency: 'INR',
        captured_at: NOW,
        created_at: NOW,
      },
      {
        id: 'p3',
        account_id: OWN,
        mode: 'live',
        kind: 'charge',
        status: 'captured',
        captured: true,
        amount_minor: 100,
        currency: 'INR',
        captured_at: NOW,
        created_at: NOW,
      },
    ],
    billing_refunds: [
      {
        id: 'f1',
        account_id: ACC,
        mode: 'test',
        status: 'processed',
        amount_minor: 500,
        currency: 'INR',
        access_effect: 'none_not_a_charge',
        processed_at: NOW,
        created_at: NOW,
      },
    ],
    payment_requests: [
      {
        id: 'r1',
        account_id: ACC,
        status: 'approved',
        paid_amount: '22575.00',
        currency: 'INR',
        reviewed_at: NOW,
        created_at: NOW,
      },
      {
        id: 'r2',
        account_id: ACC,
        status: 'rejected',
        paid_amount: '990.00',
        currency: 'INR',
        reviewed_at: NOW,
        created_at: NOW,
      },
    ],
  });
});

describe('GET /api/super-admin/billing/collected', () => {
  it('403 for a non super admin', async () => {
    state.superAdmin = false;
    expect((await GET(new Request('https://app.test/x'))).status).toBe(403);
  });

  it('summarises by channel, keeps test apart and excludes own workspaces', async () => {
    const res = await GET(new Request('https://app.test/x'));
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const w of [body.last30d, body.allTime]) {
      expect(w.autopay.test).toEqual([
        { currency: 'INR', amountMinor: 900000, count: 1 },
      ]);
      expect(w.autopay.live).toEqual([]);
      expect(w.setupChecks.test[0].amountMinor).toBe(500);
      expect(w.refunds.test).toEqual([]);
      expect(w.manualUpi).toEqual([
        { currency: 'INR', amountMinor: 2257500, count: 1 },
      ]);
      expect(w.netLive).toEqual([
        { currency: 'INR', amountMinor: 2257500, count: 1 },
      ]);
    }
    expect(typeof body.generatedAt).toBe('string');
    expect(state.fake.writes).toEqual([]);
  });
});
