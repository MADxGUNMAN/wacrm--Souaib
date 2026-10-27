import { beforeEach, describe, expect, it, vi } from 'vitest';

// ------------------------------------------------------------
// Localized pricing: super-admin routes (cycles, plans, prices, settings,
// regions, copy). A small in-memory Supabase stand-in that applies
// filters and records every write with its payload, so tests can assert
// the exact columns written and that Global paths are untouched.
// ------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as {
    table: string;
    op: string;
    payload?: unknown;
    filters: [string, string, unknown][];
  }[],
  reads: [] as [string, string, unknown][],
  config: null as unknown,
  createPlan: null as unknown,
}));

function makeClient() {
  let seq = 0;
  function from(table: string) {
    let op = 'select';
    let payload: unknown;
    const filters: [string, string, unknown][] = [];
    const matches = (r: Row) =>
      filters.every(([col, kind, v]) =>
        kind === 'eq'
          ? r[col] === v
          : kind === 'neq'
            ? r[col] !== v
            : kind === 'in'
              ? (v as unknown[]).includes(r[col])
              : true
      );
    const run = () => {
      const rows = (h.tables[table] ??= []);
      if (op === 'select') {
        const data = rows.filter(matches);
        return { data, error: null, count: data.length };
      }
      h.writes.push({ table, op, payload, filters: [...filters] });
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted = list.map((p) => ({
          id: `${table}-new-${++seq}`,
          ...p,
        }));
        rows.push(...inserted);
        return { data: inserted, error: null, count: inserted.length };
      }
      if (op === 'update') {
        const hit = rows.filter(matches);
        for (const r of hit) Object.assign(r, payload as Row);
        return { data: hit, error: null, count: hit.length };
      }
      if (op === 'upsert') {
        return { data: [payload], error: null, count: 1 };
      }
      if (op === 'delete') {
        h.tables[table] = rows.filter((r) => !matches(r));
        return { data: null, error: null, count: 0 };
      }
      return { data: null, error: null, count: 0 };
    };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      insert: (p: unknown) => ((op = 'insert'), (payload = p), b),
      update: (p: unknown) => ((op = 'update'), (payload = p), b),
      upsert: (p: unknown) => ((op = 'upsert'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      eq: (c: string, v: unknown) => {
        filters.push([c, 'eq', v]);
        if (op === 'select') h.reads.push([table, c, v]);
        return b;
      },
      neq: (c: string, v: unknown) => (filters.push([c, 'neq', v]), b),
      in: (c: string, v: unknown[]) => (filters.push([c, 'in', v]), b),
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        const r = run();
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: null };
      },
      single: async () => {
        const r = run();
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: null };
      },
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(ok, fail),
    });
    return b;
  }
  return { from };
}

vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => makeClient(),
  MissingServerConfigError: class extends Error {},
}));
vi.mock('@/lib/super-admin/guard', () => ({
  requireSuperAdmin: async () => ({
    userId: 'admin-1',
    email: 'admin@example.com',
  }),
}));
vi.mock('@/lib/billing/razorpay/config', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/razorpay/config')>()),
  getRazorpayConfig: () => h.config,
}));
vi.mock('@/lib/billing/razorpay/runtime', () => ({
  getBillingDeps: () => {
    if (!h.config) throw new Error('RAZORPAY_MODE must be "test" or "live"');
    return {
      config: h.config,
      client: { createPlan: h.createPlan },
      db: {},
    };
  },
}));

import { RazorpayApiError } from '@/lib/billing/razorpay/client';
import {
  GET as getCycles,
  POST as postCycle,
  PUT as putCycle,
} from '../cycles/route';
import { GET as getPlans } from '../plans/route';
import { PUT as putPrice } from '../prices/route';
import { GET as getSettings, PUT as putSettings } from '../settings/route';
import { POST as copyFromGlobal } from './copy/route';
import { GET as listRegions, PUT as putRegion } from './route';

const PLAN = 'plan-1';
const BASE = 'https://app.test/api/super-admin/billing';

function req(path: string, method = 'GET', body?: unknown) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function seed() {
  return {
    subscription_settings: [
      {
        id: 'settings-1',
        currency: 'INR',
        page_heading: 'Choose Your Plan',
        trial_days: 14,
        upi_id: 'pay@bank',
        payment_provider: 'razorpay',
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
        is_default: true,
        is_recommended: false,
        region: 'global',
        position: 0,
      },
      {
        id: 'g-360',
        cycle_key: 'yearly',
        label: 'Yearly',
        months: 12,
        duration_days: 360,
        is_visible: true,
        is_visible_in_region: false,
        is_default: false,
        is_recommended: true,
        region: 'global',
        position: 1,
      },
    ],
    subscription_plan_prices: [
      {
        id: 'p-g30',
        plan_id: PLAN,
        cycle_id: 'g-30',
        amount: '990.00',
        is_visible: true,
      },
      {
        id: 'p-g360',
        plan_id: PLAN,
        cycle_id: 'g-360',
        amount: '9000.00',
        is_visible: true,
      },
    ],
    pricing_regions: [] as Row[],
    billing_provider_plans: [] as Row[],
  };
}

function addUsCycle(days = 30, amount: string | null = '60.00') {
  h.tables.billing_cycles.push({
    id: 'us-30',
    cycle_key: 'us-monthly',
    label: 'Monthly',
    months: 1,
    duration_days: days,
    is_visible: false,
    is_visible_in_region: true,
    is_default: true,
    region: 'US',
    position: 0,
  });
  if (amount) {
    h.tables.subscription_plan_prices.push({
      id: 'p-us30',
      plan_id: PLAN,
      cycle_id: 'us-30',
      amount,
      is_visible: true,
    });
  }
}

const LIVE_USD = {
  mode: 'test',
  env: 'dev',
  keyId: 'rzp_test_x',
  keySecret: 'x'.repeat(16),
  webhookSecrets: ['y'.repeat(16)],
  testAllowedAccountIds: new Set<string>(),
  livePilotAccountIds: null,
  chargeCurrencies: new Set(['INR', 'USD']),
};

beforeEach(() => {
  h.tables = seed() as unknown as Record<string, Row[]>;
  h.writes = [];
  h.reads = [];
  h.config = LIVE_USD;
  h.createPlan = vi.fn(async () => ({ id: 'plan_USD_1' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cycles route by region', () => {
  it('GET ?region=US filters by region', async () => {
    addUsCycle();
    const res = await getCycles(req('/cycles?region=US'));
    expect(res.status).toBe(200);
    const { cycles } = await res.json();
    expect(cycles).toEqual([
      expect.objectContaining({
        id: 'us-30',
        cycle_key: 'monthly',
        is_visible: true,
      }),
    ]);
    expect(h.reads).toContainEqual(['billing_cycles', 'region', 'US']);
  });

  it('GET without a region lists Global only, unchanged', async () => {
    addUsCycle();
    const { cycles } = await (await getCycles(req('/cycles'))).json();
    expect(cycles.map((c: Row) => c.id)).toEqual(['g-30', 'g-360']);
    expect(cycles[0]).toEqual(h.tables.billing_cycles[0]);
  });

  it.each(['XX', '../', 'global;drop'])('rejects ?region=%s', async (r) => {
    const res = await getCycles(req(`/cycles?region=${encodeURIComponent(r)}`));
    expect(res.status).toBe(400);
  });

  it('POST for US stores a hidden-from-legacy, region-visible, prefixed cycle', async () => {
    const res = await postCycle(
      req('/cycles', 'POST', {
        region: 'US',
        cycle_key: 'monthly',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_default: true,
      })
    );
    expect(res.status).toBe(201);
    const insert = h.writes.find(
      (w) => w.table === 'billing_cycles' && w.op === 'insert'
    );
    expect(insert?.payload).toMatchObject({
      region: 'US',
      cycle_key: 'us-monthly',
      is_visible: false,
      is_visible_in_region: true,
    });
    // Clearing other defaults stays inside the US region.
    const clear = h.writes.find(
      (w) => w.table === 'billing_cycles' && w.op === 'update'
    );
    expect(clear?.filters).toContainEqual(['region', 'eq', 'US']);
    expect(
      h.tables.billing_cycles.find((c) => c.id === 'g-30')?.is_default
    ).toBe(true);
    expect((await res.json()).cycle).toMatchObject({
      cycle_key: 'monthly',
      is_visible: true,
    });
  });

  it('PUT takes the region from the stored row, never the body', async () => {
    addUsCycle();
    const res = await putCycle(
      req('/cycles', 'PUT', {
        id: 'us-30',
        is_visible: false,
        region: 'global',
      })
    );
    expect(res.status).toBe(200);
    const update = h.writes.find((w) => w.table === 'billing_cycles');
    expect(update?.payload).toEqual({
      is_visible: false,
      is_visible_in_region: false,
    });
  });
});

describe('plans route by region', () => {
  it('Global GET returns the unchanged bundle with no regionStatus', async () => {
    const body = await (await getPlans(req('/plans'))).json();
    expect(body.cycles.map((c: Row) => c.id)).toEqual(['g-30', 'g-360']);
    expect(body).not.toHaveProperty('regionStatus');
  });

  it('country GET returns only that country plus its readiness', async () => {
    addUsCycle();
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
      settings: {},
    });
    const body = await (await getPlans(req('/plans?region=US'))).json();
    expect(body.cycles.map((c: Row) => c.id)).toEqual(['us-30']);
    expect(body.prices.map((p: Row) => p.amount)).toEqual([60]);
    expect(body.regionStatus).toMatchObject({
      complete: true,
      chargeable: true,
    });
  });
});

describe('prices route currency check', () => {
  it('rejects an amount that is not whole minor units of the country currency', async () => {
    h.tables.billing_cycles.push({
      id: 'jp-30',
      region: 'JP',
      is_visible: false,
    });
    h.tables.pricing_regions.push({
      code: 'JP',
      currency: 'JPY',
      is_enabled: false,
    });
    const res = await putPrice(
      req('/prices', 'PUT', { plan_id: PLAN, cycle_id: 'jp-30', amount: 990.5 })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('amount');
    expect(h.writes).toEqual([]);
  });

  it('a Global price must be representable in the Global currency', async () => {
    h.tables.subscription_settings[0].currency = 'JPY';
    const res = await putPrice(
      req('/prices', 'PUT', { plan_id: PLAN, cycle_id: 'g-30', amount: 12.5 })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('amount');
    expect(h.writes).toEqual([]);
  });

  it('keeps Global prices as before', async () => {
    const res = await putPrice(
      req('/prices', 'PUT', { plan_id: PLAN, cycle_id: 'g-30', amount: 990 })
    );
    expect(res.status).toBe(200);
    expect(h.writes[0]).toMatchObject({
      table: 'subscription_plan_prices',
      op: 'upsert',
    });
  });
});

describe('settings route by region', () => {
  it('refuses a platform-wide key for a country', async () => {
    const res = await putSettings(
      req('/settings?region=US', 'PUT', { trial_days: 7 })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('trial_days');
    expect(h.writes).toEqual([]);
  });

  it('stores country copy in pricing_regions.settings', async () => {
    const res = await putSettings(
      req('/settings?region=US', 'PUT', {
        page_heading: 'Pricing for the US',
        upi_id: 'x@bank',
      })
    );
    expect(res.status).toBe(200);
    const insert = h.writes.find((w) => w.table === 'pricing_regions');
    expect(insert?.op).toBe('insert');
    // No currency yet: UPI is dropped (INR only).
    expect(insert?.payload).toMatchObject({
      code: 'US',
      settings: { page_heading: 'Pricing for the US' },
      created_by_user_id: 'admin-1',
    });
    expect(h.writes.some((w) => w.table === 'subscription_settings')).toBe(
      false
    );
  });

  it('GET for a country returns blank overrides and the Global values', async () => {
    const body = await (await getSettings(req('/settings?region=US'))).json();
    expect(body.settings).toEqual({});
    expect(body.global.page_heading).toBe('Choose Your Plan');
    expect(body.region).toMatchObject({ code: 'US', configured: false });
  });

  it('Global settings PUT refuses a different currency and writes nothing', async () => {
    const res = await putSettings(
      req('/settings', 'PUT', { currency: 'USD', page_heading: 'x' })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'use_global_currency_header',
      field: 'currency',
    });
    expect(h.writes).toEqual([]);
  });

  it('Global settings PUT drops an unchanged currency', async () => {
    const res = await putSettings(
      req('/settings', 'PUT', { currency: 'inr', page_heading: 'x' })
    );
    expect(res.status).toBe(200);
    expect(h.writes).toEqual([
      expect.objectContaining({
        table: 'subscription_settings',
        op: 'update',
        payload: { page_heading: 'x' },
      }),
    ]);
  });

  it('Global PUT still updates the singleton', async () => {
    const res = await putSettings(
      req('/settings', 'PUT', { page_heading: 'New heading' })
    );
    expect(res.status).toBe(200);
    expect(h.writes).toEqual([
      expect.objectContaining({
        table: 'subscription_settings',
        op: 'update',
        payload: { page_heading: 'New heading' },
      }),
    ]);
  });
});

describe('regions route: enable validation', () => {
  async function enable(code = 'US') {
    const res = await putRegion(
      req('/regions', 'PUT', { code, is_enabled: true })
    );
    return { res, body: await res.json() };
  }

  it('refuses without a currency', async () => {
    addUsCycle();
    const { res, body } = await enable();
    expect(res.status).toBe(422);
    expect(body.problems).toContain(
      'Choose the currency this country is charged in.'
    );
  });

  it('refuses with no priced cycle', async () => {
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const { res, body } = await enable();
    expect(res.status).toBe(422);
    expect(body.problems).toContain(
      'Add at least one visible billing cycle with a price above zero.'
    );
  });

  it('refuses a 5-day cycle', async () => {
    addUsCycle(5);
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const { res, body } = await enable();
    expect(res.status).toBe(422);
    expect(body.problems).toContain(
      'The Monthly cycle must be at least 7 whole days for AutoPay.'
    );
  });

  it('refuses a currency not chargeable on this deployment', async () => {
    addUsCycle();
    h.config = { ...LIVE_USD, chargeCurrencies: new Set(['INR']) };
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const { res, body } = await enable();
    expect(res.status).toBe(422);
    expect(body.problems[0]).toContain('RAZORPAY_CHARGE_CURRENCIES');
    expect(h.createPlan).not.toHaveBeenCalled();
  });

  it("passes Razorpay's own refusal through", async () => {
    addUsCycle();
    h.createPlan = vi.fn(async () => {
      throw new RazorpayApiError({
        status: 400,
        code: 'BAD_REQUEST_ERROR',
        description: 'Currency USD is not supported for this merchant',
      });
    });
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const { res, body } = await enable();
    expect(res.status).toBe(422);
    expect(body.problems[0]).toContain(
      'Currency USD is not supported for this merchant'
    );
    expect(h.tables.pricing_regions[0].is_enabled).toBe(false);
  });

  it('enables USD when chargeable, after creating the USD plan', async () => {
    addUsCycle();
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const { res } = await enable();
    expect(res.status).toBe(200);
    expect(h.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'daily',
        interval: 30,
        item: expect.objectContaining({ amount: 6000, currency: 'USD' }),
      })
    );
    expect(h.tables.billing_provider_plans[0]).toMatchObject({
      region: 'US',
      currency: 'USD',
      amount_minor: 6000,
    });
    expect(h.tables.pricing_regions[0]).toMatchObject({
      is_enabled: true,
      enabled_by_user_id: 'admin-1',
    });
  });

  it('enables an INR country without Razorpay at all', async () => {
    h.config = null;
    h.tables.billing_cycles.push({
      id: 'in-30',
      region: 'IN',
      label: 'Monthly',
      months: 1,
      duration_days: 30,
      is_visible: false,
      is_visible_in_region: true,
    });
    h.tables.subscription_plan_prices.push({
      plan_id: PLAN,
      cycle_id: 'in-30',
      amount: '800.00',
      is_visible: true,
    });
    h.tables.pricing_regions.push({
      code: 'IN',
      currency: 'INR',
      is_enabled: false,
    });
    const { res } = await enable('IN');
    expect(res.status).toBe(200);
    expect(h.tables.pricing_regions[0].is_enabled).toBe(true);
  });

  it('refuses a currency change while enabled', async () => {
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: true,
    });
    const res = await putRegion(
      req('/regions', 'PUT', { code: 'US', currency: 'AED' })
    );
    expect(res.status).toBe(409);
  });

  it('always allows disabling', async () => {
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: true,
    });
    const res = await putRegion(
      req('/regions', 'PUT', { code: 'US', is_enabled: false })
    );
    expect(res.status).toBe(200);
    expect(h.tables.pricing_regions[0].is_enabled).toBe(false);
  });

  it('refuses Global and unknown codes', async () => {
    for (const code of ['global', 'XX', '']) {
      const res = await putRegion(req('/regions', 'PUT', { code }));
      expect(res.status).toBe(400);
    }
  });

  it('lists configured regions with readiness and deployment currencies', async () => {
    addUsCycle();
    h.tables.pricing_regions.push({
      code: 'US',
      currency: 'USD',
      is_enabled: false,
    });
    const body = await (await listRegions(req('/regions'))).json();
    expect(body.regions).toEqual([
      expect.objectContaining({
        code: 'US',
        label: 'United States (+1)',
        currency: 'USD',
        is_enabled: false,
        priced_cycle_count: 1,
        complete: true,
        chargeable: true,
      }),
    ]);
    expect(body.razorpay.chargeCurrencies).toEqual(['INR', 'USD']);
  });
});

describe('copy from Global', () => {
  it('copies cycle structure and copy, never amounts', async () => {
    const res = await copyFromGlobal(
      req('/regions/copy', 'POST', { code: 'US' })
    );
    expect(res.status).toBe(201);
    const insert = h.writes.find(
      (w) => w.table === 'billing_cycles' && w.op === 'insert'
    );
    expect(insert?.payload).toEqual([
      expect.objectContaining({
        region: 'US',
        cycle_key: 'us-monthly',
        label: 'Monthly',
        duration_days: 30,
        is_visible: false,
        is_visible_in_region: true,
        is_default: true,
      }),
      expect.objectContaining({
        cycle_key: 'us-yearly',
        duration_days: 360,
        is_recommended: true,
      }),
    ]);
    expect(h.writes.some((w) => w.table === 'subscription_plan_prices')).toBe(
      false
    );
    const region = h.writes.find((w) => w.table === 'pricing_regions');
    expect(region?.payload).toMatchObject({
      code: 'US',
      settings: { page_heading: 'Choose Your Plan' },
    });
    expect((region?.payload as { settings: Row }).settings).not.toHaveProperty(
      'upi_id'
    );
  });

  it('refuses when the country already has cycles', async () => {
    addUsCycle();
    const res = await copyFromGlobal(
      req('/regions/copy', 'POST', { code: 'US' })
    );
    expect(res.status).toBe(409);
    expect(h.writes).toEqual([]);
  });
});
