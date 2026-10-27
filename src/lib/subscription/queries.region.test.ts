import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeAdmin } from '@/lib/billing/__fixtures__/fake-admin';

let fake: ReturnType<typeof createFakeAdmin>;

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => fake.client,
}));

import {
  PRICES_CHANGED_MESSAGE,
  QuoteError,
  getPlansBundle,
  getSelectedPlan,
  resolveQuote,
  setSelectedPlan,
} from './queries';

const PLAN = 'plan-1';

function tables() {
  return {
    subscription_settings: [
      {
        id: 'settings-1',
        currency: 'INR',
        page_heading: 'Choose Your Plan',
        cycle_hint: 'Global hint',
        upi_id: 'pay@bank',
        upi_payee_name: 'Replai',
        payment_provider: 'razorpay',
      },
    ],
    pricing_regions: [
      {
        code: 'US',
        currency: 'USD',
        is_enabled: true,
        settings: { page_heading: 'Pricing for the US' },
      },
    ],
    subscription_plans: [
      { id: PLAN, name: 'Replai', is_visible: true, position: 0 },
    ],
    billing_cycles: [
      {
        id: 'g-30',
        cycle_key: 'monthly',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: true,
        is_visible_in_region: false,
        region: 'global',
        position: 0,
      },
      {
        id: 'us-30',
        cycle_key: 'us-monthly',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: false,
        is_visible_in_region: true,
        region: 'US',
        position: 0,
      },
      {
        id: 'us-hidden',
        cycle_key: 'us-yearly',
        label: 'Yearly',
        months: 12,
        duration_days: 360,
        is_visible: false,
        is_visible_in_region: false,
        region: 'US',
        position: 1,
      },
    ],
    subscription_plan_prices: [
      {
        id: 'p1',
        plan_id: PLAN,
        cycle_id: 'g-30',
        amount: '990.00',
        is_visible: true,
      },
      {
        id: 'p2',
        plan_id: PLAN,
        cycle_id: 'us-30',
        amount: '60.00',
        is_visible: true,
      },
      {
        id: 'p3',
        plan_id: PLAN,
        cycle_id: 'us-hidden',
        amount: '600.00',
        is_visible: true,
      },
    ],
    accounts: [
      { id: 'acct-1', selected_plan_id: PLAN, selected_cycle_id: 'g-30' },
    ],
  };
}

const US = { region: 'US', currency: 'USD' };

beforeEach(() => {
  fake = createFakeAdmin(tables());
});

describe('getPlansBundle by region', () => {
  it('Global bundle has only Global cycles and prices, INR, unchanged copy', async () => {
    const bundle = await getPlansBundle();
    expect(bundle.cycles.map((c) => c.id)).toEqual(['g-30']);
    expect(bundle.prices.map((p) => p.cycle_id)).toEqual(['g-30']);
    expect(bundle.settings.currency).toBe('INR');
    expect(bundle.settings.page_heading).toBe('Choose Your Plan');
    expect(bundle.settings.upi_id).toBe('pay@bank');
    expect(bundle.region).toEqual({
      code: 'global',
      currency: 'INR',
      label: 'Global (Universal)',
      isGlobal: true,
    });
    expect(fake.calls).toContainEqual({
      table: 'billing_cycles',
      op: 'eq',
      column: 'region',
      value: 'global',
    });
  });

  it('US bundle has only visible US cycles, USD and merged copy', async () => {
    const bundle = await getPlansBundle({ region: 'US' });
    expect(bundle.cycles.map((c) => c.id)).toEqual(['us-30']);
    expect(bundle.cycles[0]).toMatchObject({ region: 'US', is_visible: true });
    expect(bundle.prices.map((p) => p.amount)).toEqual([60]);
    expect(bundle.settings.currency).toBe('USD');
    expect(bundle.settings.page_heading).toBe('Pricing for the US');
    expect(bundle.settings.cycle_hint).toBe('Global hint');
    expect(bundle.settings.upi_id).toBeNull();
    expect(bundle.region).toMatchObject({ code: 'US', currency: 'USD' });
    expect(fake.calls).toContainEqual({
      table: 'billing_cycles',
      op: 'eq',
      column: 'is_visible_in_region',
      value: true,
    });
  });

  it('shows hidden country cycles to the editor only', async () => {
    const bundle = await getPlansBundle({ region: 'US', includeHidden: true });
    expect(bundle.cycles.map((c) => [c.id, c.is_visible])).toEqual([
      ['us-30', true],
      ['us-hidden', false],
    ]);
  });
});

describe('resolveQuote by region', () => {
  it('keeps the Global quote unchanged', async () => {
    await expect(resolveQuote(PLAN, 'g-30')).resolves.toMatchObject({
      amount: 990,
      currency: 'INR',
      region: 'global',
      cycleDurationDays: 30,
    });
  });

  it('prices a US cycle in USD for a US resolution', async () => {
    await expect(resolveQuote(PLAN, 'us-30', US)).resolves.toMatchObject({
      amount: 60,
      currency: 'USD',
      region: 'US',
    });
  });

  it('refuses a Global cycle under a US resolution', async () => {
    await expect(resolveQuote(PLAN, 'g-30', US)).rejects.toBeInstanceOf(
      QuoteError
    );
  });

  it('refuses a US cycle without a US resolution', async () => {
    await expect(resolveQuote(PLAN, 'us-30')).rejects.toBeInstanceOf(
      QuoteError
    );
  });

  it('refuses a hidden country cycle', async () => {
    await expect(resolveQuote(PLAN, 'us-hidden', US)).rejects.toThrow(
      'That billing cycle is not available'
    );
  });

  it('refuses a Global quote when the Global currency changes between reads', async () => {
    // The price read is where fn_change_global_currency would commit: the
    // currency read before it says INR, the one after it says USD.
    const t = tables();
    t.subscription_settings[0].currency = 'INR';
    fake = createFakeAdmin(t);
    const from = fake.client.from;
    fake.client.from = (table: string) => {
      if (table === 'subscription_plan_prices') {
        t.subscription_settings[0].currency = 'USD';
      }
      return from(table);
    };
    await expect(resolveQuote(PLAN, 'g-30')).rejects.toThrow(
      PRICES_CHANGED_MESSAGE
    );
    // Same for a caller that resolved the region (and currency) first.
    t.subscription_settings[0].currency = 'INR';
    await expect(
      resolveQuote(PLAN, 'g-30', { region: 'global', currency: 'INR' })
    ).rejects.toBeInstanceOf(QuoteError);
    expect(fake.writes).toEqual([]);
  });

  it('does not re-read the Global currency for a country quote', async () => {
    await resolveQuote(PLAN, 'us-30', US);
    expect(
      fake.calls.filter((c) => c.table === 'subscription_settings')
    ).toEqual([]);
  });
});

describe('selected plan by region', () => {
  it('drops a Global selection for a US workspace', async () => {
    await expect(getSelectedPlan('acct-1', US)).resolves.toBeNull();
    await expect(getSelectedPlan('acct-1')).resolves.toMatchObject({
      amount: 990,
      currency: 'INR',
    });
  });

  it('refuses to store a Global cycle for a US workspace', async () => {
    await expect(
      setSelectedPlan('acct-1', PLAN, 'g-30', US)
    ).rejects.toMatchObject({ status: 400 });
    expect(fake.writes).toEqual([]);
  });
});
