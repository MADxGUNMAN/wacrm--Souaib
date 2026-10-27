import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeAdmin } from '@/lib/billing/__fixtures__/fake-admin';

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<
    typeof import('@/lib/billing/__fixtures__/fake-admin').createFakeAdmin
  >,
  config: null as unknown,
}));

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => h.fake.client,
}));
vi.mock('@/lib/super-admin/guard', () => ({
  requireSuperAdmin: async () => ({ userId: 'admin-1', email: 'a@x.test' }),
}));
vi.mock('@/lib/billing/razorpay/config', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay/config')>()),
  getRazorpayConfig: () => h.config,
}));

import { GET } from './route';

const PLAN = 'plan-1';
const LIVE = {
  mode: 'live',
  env: 'prod',
  keyId: 'rzp_live_x',
  keySecret: 'x'.repeat(16),
  webhookSecrets: ['y'.repeat(16)],
  testAllowedAccountIds: new Set<string>(),
  livePilotAccountIds: null,
  chargeCurrencies: new Set(['INR', 'USD']),
};

function tables(usEnabled: boolean) {
  return {
    subscription_settings: [
      {
        id: 's',
        currency: 'INR',
        payment_provider: 'razorpay',
        is_enabled: true,
        grace_days: 0,
      },
    ],
    accounts: [
      {
        id: 'acct-us',
        name: 'US Workspace',
        owner_user_id: 'u-us',
        created_at: '2026-10-01',
        subscription_status: 'trialing',
        trial_ends_at: '2099-01-01T00:00:00Z',
      },
      {
        id: 'acct-in',
        name: 'Indian Workspace',
        owner_user_id: 'u-in',
        created_at: '2026-10-02',
        subscription_status: 'trialing',
        trial_ends_at: '2099-01-01T00:00:00Z',
      },
    ],
    profiles: [
      {
        id: 'p1',
        user_id: 'u-us',
        phone: '+14155550100',
        is_super_admin: false,
      },
      {
        id: 'p2',
        user_id: 'u-in',
        phone: '+919876543210',
        is_super_admin: false,
      },
    ],
    pricing_regions: [
      { code: 'US', currency: 'USD', is_enabled: usEnabled, settings: {} },
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
    billing_subscriptions: [],
    subscription_events: [],
  };
}

async function list() {
  const res = await GET(
    new Request('https://app.test/api/super-admin/billing/subscriptions')
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return new Map(
    (body.subscribers as { accountId: string; pricingRegion: unknown }[]).map(
      (s) => [s.accountId, s.pricingRegion]
    )
  );
}

beforeEach(() => {
  h.config = LIVE;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('subscribers pricing badge', () => {
  it('shows Global for a US-phone owner while the US plan is disabled', async () => {
    h.fake = createFakeAdmin(tables(false));
    const byAccount = await list();
    expect(byAccount.get('acct-us')).toMatchObject({
      region: 'global',
      currency: 'INR',
      countryCode: 'US',
      reason: 'region_disabled',
    });
    expect(byAccount.get('acct-in')).toMatchObject({
      region: 'global',
      reason: 'region_not_configured',
    });
    expect(h.fake.writes).toEqual([]);
  });

  it('shows US / USD from the phone once the US plan is enabled', async () => {
    h.fake = createFakeAdmin(tables(true));
    const byAccount = await list();
    expect(byAccount.get('acct-us')).toMatchObject({
      region: 'US',
      currency: 'USD',
      source: 'phone',
      reason: 'phone_match',
      reasonText: expect.stringContaining('enabled localized plan'),
    });
    expect(byAccount.get('acct-in')).toMatchObject({ region: 'global' });
  });
});
