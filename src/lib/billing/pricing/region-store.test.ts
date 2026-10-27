import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeAdmin } from '@/lib/billing/__fixtures__/fake-admin';
import type { RazorpayConfig } from '@/lib/billing/razorpay/config';

let fake: ReturnType<typeof createFakeAdmin>;

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => fake.client,
}));
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(async () => {
    throw new Error('no session');
  }),
}));

import { getAccountPricingRegion, getLandingPlansBundle } from './region-store';

const PLAN = 'plan-1';
const ACCOUNT = 'acct-1';
const OWNER = 'user-owner';

const LIVE: RazorpayConfig = {
  mode: 'live',
  env: 'prod',
  keyId: 'rzp_live_x',
  keySecret: 'x'.repeat(16),
  webhookSecrets: ['y'.repeat(16)],
  testAllowedAccountIds: new Set(),
  livePilotAccountIds: null,
  chargeCurrencies: new Set(['INR', 'USD']),
};

function tables(over: Record<string, Record<string, unknown>[]> = {}) {
  return {
    subscription_settings: [
      { id: 's', currency: 'INR', payment_provider: 'razorpay' },
    ],
    pricing_regions: [
      { code: 'US', currency: 'USD', is_enabled: true, settings: {} },
    ],
    subscription_plans: [{ id: PLAN, is_visible: true }],
    billing_cycles: [
      {
        id: 'g-30',
        region: 'global',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: true,
        is_visible_in_region: false,
      },
      {
        id: 'us-30',
        region: 'US',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: false,
        is_visible_in_region: true,
      },
    ],
    subscription_plan_prices: [
      { plan_id: PLAN, cycle_id: 'g-30', amount: '990.00', is_visible: true },
      { plan_id: PLAN, cycle_id: 'us-30', amount: '60.00', is_visible: true },
    ],
    accounts: [{ id: ACCOUNT, owner_user_id: OWNER }],
    // `id` deliberately differs from user_id (AGENTS.md section 4).
    profiles: [{ id: 'profile-pk', user_id: OWNER, phone: '+14155550100' }],
    billing_subscriptions: [] as Record<string, unknown>[],
    ...over,
  };
}

beforeEach(() => {
  fake = createFakeAdmin(tables());
});

describe('getAccountPricingRegion', () => {
  it('resolves a US owner to USD, reading profiles by user_id', async () => {
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: LIVE })
    ).resolves.toMatchObject({
      region: 'US',
      currency: 'USD',
      source: 'phone',
    });
    expect(fake.calls).toContainEqual({
      table: 'profiles',
      op: 'eq',
      column: 'user_id',
      value: OWNER,
    });
    expect(
      fake.calls.some((c) => c.table === 'profiles' && c.column === 'id')
    ).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it('keeps a live Global mandate on Global', async () => {
    fake = createFakeAdmin(
      tables({
        billing_subscriptions: [
          {
            account_id: ACCOUNT,
            mode: 'live',
            status: 'active',
            cycle_id: 'g-30',
            currency: 'INR',
            created_at: '2026-10-01',
          },
        ],
      })
    );
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: LIVE })
    ).resolves.toMatchObject({ region: 'global', source: 'subscription' });
  });

  it('ignores a mandate from the other mode', async () => {
    fake = createFakeAdmin(
      tables({
        billing_subscriptions: [
          {
            account_id: ACCOUNT,
            mode: 'test',
            status: 'active',
            cycle_id: 'g-30',
            currency: 'INR',
            created_at: '2026-10-01',
          },
        ],
      })
    );
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: LIVE })
    ).resolves.toMatchObject({ region: 'US' });
  });

  it('answers Global when Razorpay is not configured (manual UPI)', async () => {
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: null })
    ).resolves.toMatchObject({
      region: 'global',
      reason: 'manual_upi_inr_only',
    });
  });

  it('answers Global with no pricing regions at all', async () => {
    fake = createFakeAdmin(tables({ pricing_regions: [] }));
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: LIVE })
    ).resolves.toMatchObject({
      region: 'global',
      currency: 'INR',
      reason: 'region_not_configured',
    });
  });

  it('never throws: a read error answers Global', async () => {
    fake.client.from = () => {
      throw new Error('boom');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      getAccountPricingRegion(ACCOUNT, { config: LIVE })
    ).resolves.toMatchObject({ region: 'global', reason: 'lookup_failed' });
    spy.mockRestore();
  });
});

describe('getLandingPlansBundle', () => {
  it('shows Global to an anonymous visitor', async () => {
    const bundle = await getLandingPlansBundle();
    expect(bundle.region?.isGlobal).toBe(true);
    expect(bundle.cycles.map((c) => c.id)).toEqual(['g-30']);
  });
});
