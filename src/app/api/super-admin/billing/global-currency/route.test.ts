import { beforeEach, describe, expect, it, vi } from 'vitest';

// ------------------------------------------------------------
// Global currency change route. Same in-memory Supabase stand-in as
// regions/routes.test.ts plus `rpc`, which records its arguments and
// answers `h.rpcResult`. Every write is recorded, so a test can prove the
// route never writes settings or prices itself.
// ------------------------------------------------------------

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; op: string; payload?: unknown }[],
  rpcCalls: [] as { name: string; args: unknown }[],
  rpcResult: { data: null, error: null } as {
    data: unknown;
    error: { code?: string; message: string } | null;
  },
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
      h.writes.push({ table, op, payload });
      if (op === 'insert') {
        const inserted = (
          (Array.isArray(payload) ? payload : [payload]) as Row[]
        ).map((p) => ({ id: `${table}-new-${++seq}`, ...p }));
        rows.push(...inserted);
        return { data: inserted, error: null, count: inserted.length };
      }
      if (op === 'update') {
        const hit = rows.filter(matches);
        for (const r of hit) Object.assign(r, payload as Row);
        return { data: hit, error: null, count: hit.length };
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
      eq: (c: string, v: unknown) => (filters.push([c, 'eq', v]), b),
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
  return {
    from,
    rpc: async (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args });
      return h.rpcResult;
    },
  };
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
import { GET, PUT } from './route';

const PLAN = 'plan-1';
const URL_ = 'https://app.test/api/super-admin/billing/global-currency';

const LIVE_RETIRED = {
  mode: 'live',
  env: 'prod',
  keyId: 'rzp_live_x',
  keySecret: 'x'.repeat(16),
  webhookSecrets: ['y'.repeat(16)],
  testAllowedAccountIds: new Set<string>(),
  livePilotAccountIds: null,
  providerOverride: null,
  chargeCurrencies: new Set(['INR', 'USD']),
};
const TEST_PARTIAL = {
  ...LIVE_RETIRED,
  mode: 'test',
  env: 'dev',
  keyId: 'rzp_test_x',
  testAllowedAccountIds: new Set(['00000000-0000-0000-0000-000000000001']),
};

function seed() {
  return {
    subscription_settings: [
      { id: 'settings-1', currency: 'INR', payment_provider: 'razorpay' },
    ],
    subscription_plans: [
      { id: PLAN, name: 'Replai', is_visible: true, position: 0 },
    ],
    billing_cycles: [
      {
        id: 'g-360',
        label: 'Yearly',
        months: 12,
        duration_days: 360,
        is_visible: true,
        region: 'global',
        position: 1,
      },
      {
        id: 'g-30',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: true,
        region: 'global',
        position: 0,
      },
      {
        id: 'us-30',
        label: 'Monthly',
        months: 1,
        duration_days: 30,
        is_visible: false,
        region: 'US',
        position: 0,
      },
    ],
    subscription_plan_prices: [
      {
        plan_id: PLAN,
        cycle_id: 'g-360',
        amount: '9000.00',
        per_day_amount: null,
        compare_at_amount: null,
        is_visible: true,
      },
      {
        plan_id: PLAN,
        cycle_id: 'g-30',
        amount: '990.00',
        per_day_amount: '33.00',
        compare_at_amount: null,
        is_visible: true,
      },
      {
        plan_id: PLAN,
        cycle_id: 'us-30',
        amount: '60.00',
        is_visible: true,
      },
    ],
    landing_sections: [
      {
        section_key: 'pricing',
        extra_data: {
          price_currency: 'usd',
          price_overrides: {
            Monthly: { total: '60' },
            Yearly: { total: '360' },
          },
        },
      },
    ],
    billing_provider_plans: [] as Row[],
  };
}

function put(body: unknown) {
  return PUT(
    new Request(URL_, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const USD_PRICES = [
  { plan_id: PLAN, cycle_id: 'g-30', amount: 12, per_day_amount: null },
  { plan_id: PLAN, cycle_id: 'g-360', amount: 120, per_day_amount: null },
];

function noDirectWrites() {
  expect(
    h.writes.filter(
      (w) =>
        w.table === 'subscription_settings' ||
        w.table === 'subscription_plan_prices'
    )
  ).toEqual([]);
}

beforeEach(() => {
  h.tables = seed() as unknown as Record<string, Row[]>;
  h.writes = [];
  h.rpcCalls = [];
  h.rpcResult = {
    data: { outcome: 'changed', previous: 'INR', currency: 'USD', prices: 2 },
    error: null,
  };
  h.config = LIVE_RETIRED;
  h.createPlan = vi.fn(async () => ({ id: 'plan_USD_1' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('GET', () => {
  it('returns the currency, the allowed list and sorted Global rows only', async () => {
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      currency: 'INR',
      paymentProvider: 'razorpay',
      manualIntake: 'retired',
      razorpay: {
        configured: true,
        mode: 'live',
        chargeCurrencies: ['INR', 'USD'],
      },
      allowedCurrencies: ['INR', 'USD'],
      landingOverride: { currency: 'USD', cycles: ['Monthly', 'Yearly'] },
    });
    expect(
      body.prices.map((p: Row) => [p.cycleId, p.amount, p.perDayAmount])
    ).toEqual([
      ['g-30', 990, 33],
      ['g-360', 9000, null],
    ]);
    expect(h.writes).toEqual([]);
  });

  it('offers INR only in Razorpay test mode', async () => {
    h.config = TEST_PARTIAL;
    const body = await (await GET(new Request(URL_))).json();
    expect(body.manualIntake).toBe('partial');
    expect(body.allowedCurrencies).toEqual(['INR']);
  });
});

describe('PUT validation', () => {
  it('refuses invalid JSON', async () => {
    const res = await put('{not json');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });

  it('needs the expected currency', async () => {
    const res = await put({ currency: 'USD', prices: USD_PRICES });
    expect(res.status).toBe(400);
  });

  it('refuses an invalid code', async () => {
    const res = await put({ currency: 'US', expected_currency: 'INR' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: 'invalid_currency',
      field: 'currency',
    });
  });

  it('refuses the same currency', async () => {
    const res = await put({ currency: 'inr', expected_currency: 'INR' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('unchanged');
  });

  it('refuses a stale page', async () => {
    const res = await put({
      currency: 'AED',
      expected_currency: 'USD',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'stale',
      error:
        'The Global currency changed to INR since this page loaded. Reload the page and try again.',
    });
  });

  it('refuses USD while the DB flag is manual UPI, without calling the function', async () => {
    h.tables.subscription_settings[0].payment_provider = 'manual_upi';
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('manual_upi_inr_only');
    expect(h.rpcCalls).toEqual([]);
  });

  it('refuses USD in test mode with the partial message', async () => {
    h.config = TEST_PARTIAL;
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain(
      'Some workspaces on this deployment'
    );
    expect(h.rpcCalls).toEqual([]);
  });

  it('refuses a currency missing from RAZORPAY_CHARGE_CURRENCIES', async () => {
    h.config = { ...LIVE_RETIRED, chargeCurrencies: new Set(['INR']) };
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('currency_not_chargeable');
  });

  it('lists every missing price', async () => {
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES.slice(0, 1),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: 'prices_required',
      problems: ['Enter the new Yearly price in USD.'],
    });
    expect(h.rpcCalls).toEqual([]);
  });

  it('refuses a fraction of a yen', async () => {
    h.config = {
      ...LIVE_RETIRED,
      chargeCurrencies: new Set(['INR', 'JPY']),
    };
    const res = await put({
      currency: 'JPY',
      expected_currency: 'INR',
      prices: [{ ...USD_PRICES[0], amount: 12.5 }, USD_PRICES[1]],
    });
    expect(res.status).toBe(422);
    expect((await res.json()).problems[0]).toContain('JPY minor units');
  });

  it("passes Razorpay's refusal through and changes nothing", async () => {
    h.createPlan = vi.fn(async () => {
      throw new RazorpayApiError({
        status: 400,
        code: 'BAD_REQUEST_ERROR',
        description: 'Currency USD is not supported for this merchant',
      });
    });
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('razorpay_refused');
    expect(body.problems[0]).toContain(
      'Currency USD is not supported for this merchant'
    );
    expect(h.rpcCalls).toEqual([]);
    noDirectWrites();
  });
});

describe('PUT commit', () => {
  it('creates the USD plans, then changes prices and currency in one call', async () => {
    const res = await put({
      currency: 'usd',
      expected_currency: 'INR',
      prices: [
        { plan_id: PLAN, cycle_id: 'g-360', amount: '120', per_day_amount: '' },
        { plan_id: PLAN, cycle_id: 'g-30', amount: 12 },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      currency: 'USD',
      previousCurrency: 'INR',
      pricesUpdated: 2,
    });
    expect(h.createPlan).toHaveBeenCalledTimes(2);
    expect(h.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: 30,
        item: expect.objectContaining({ amount: 1200, currency: 'USD' }),
      })
    );
    expect(h.tables.billing_provider_plans).toEqual([
      expect.objectContaining({
        mode: 'live',
        region: 'global',
        currency: 'USD',
      }),
      expect.objectContaining({
        mode: 'live',
        region: 'global',
        currency: 'USD',
      }),
    ]);
    expect(h.rpcCalls).toEqual([
      {
        name: 'fn_change_global_currency',
        args: {
          p_expected_currency: 'INR',
          p_new_currency: 'USD',
          p_prices: USD_PRICES,
        },
      },
    ]);
    noDirectWrites();
  });

  it('allows going back to INR in test mode, with no Razorpay call', async () => {
    h.config = TEST_PARTIAL;
    h.tables.subscription_settings[0].currency = 'USD';
    h.rpcResult = {
      data: { outcome: 'changed', previous: 'USD', currency: 'INR', prices: 2 },
      error: null,
    };
    const res = await put({
      currency: 'INR',
      expected_currency: 'USD',
      prices: [
        { plan_id: PLAN, cycle_id: 'g-30', amount: 990 },
        { plan_id: PLAN, cycle_id: 'g-360', amount: 9000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(h.createPlan).not.toHaveBeenCalled();
    expect(h.rpcCalls).toHaveLength(1);
  });

  it('maps a stale function outcome to 409', async () => {
    h.rpcResult = { data: { outcome: 'stale', currency: 'AED' }, error: null };
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('changed to AED');
  });

  it('maps a catalogue mismatch to 409 catalogue_changed', async () => {
    h.rpcResult = {
      data: { outcome: 'prices_mismatch', expected: 3, given: 2 },
      error: null,
    };
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('catalogue_changed');
  });

  it('answers 503 migration_required when the function is missing', async () => {
    h.rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    };
    const res = await put({
      currency: 'USD',
      expected_currency: 'INR',
      prices: USD_PRICES,
    });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('migration_required');
    noDirectWrites();
  });
});
