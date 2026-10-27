import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ProviderPlanError,
  ensureProviderPlan,
  planFrequencyFor,
} from './plans';
import type { BillingProviderPlanRow } from './types';

const QUOTE = {
  planId: 'aaa689df-4c95-44b5-b52b-605239d41edd',
  planName: 'Replai',
  cycleId: '9c1f8a3f-7873-4bb7-adb7-2f38511a54c3',
  cycleLabel: 'Monthly',
  cycleMonths: 0,
  cycleDurationDays: 30,
  amount: 990,
  currency: 'INR',
};

const CURRENT: BillingProviderPlanRow = {
  id: 'row-1',
  provider: 'razorpay',
  mode: 'test',
  plan_id: QUOTE.planId,
  cycle_id: QUOTE.cycleId,
  plan_name: 'Replai',
  cycle_label: 'Monthly',
  duration_days: 30,
  amount_minor: 99000,
  currency: 'INR',
  period: 'daily',
  period_interval: 30,
  provider_plan_id: 'plan_EXISTING',
  is_current: true,
  created_at: '2026-10-21T00:00:00Z',
};

/** Records every builder call; resolves `maybeSingle`/`single`/updates from the queue. */
function fakeAdmin(results: Array<{ data: unknown; error: unknown }>) {
  const log: string[] = [];
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'update', 'insert']) {
      b[m] = (...args: unknown[]) => {
        log.push(`${m}(${m === 'eq' ? args.join('=') : ''})`);
        return b;
      };
    }
    b.maybeSingle = async () => results.shift();
    b.single = async () => results.shift();
    b.then = (resolve: (v: unknown) => void) => resolve(results.shift());
    return b;
  };
  return {
    admin: {
      from: (t: string) => (log.push(`from(${t})`), builder()),
    } as unknown as SupabaseClient,
    log,
  };
}

describe('planFrequencyFor (D1)', () => {
  it('keeps 30 and 360 days as daily plans', () => {
    expect(planFrequencyFor({ durationDays: 30, months: 0 })).toEqual({
      period: 'daily',
      interval: 30,
      durationDays: 30,
    });
    expect(planFrequencyFor({ durationDays: 360, months: 0 })).toEqual({
      period: 'daily',
      interval: 360,
      durationDays: 360,
    });
  });

  it('refuses terms Razorpay rejects or that would change meaning', () => {
    expect(() => planFrequencyFor({ durationDays: 6, months: 0 })).toThrow(
      ProviderPlanError
    );
    expect(() => planFrequencyFor({ durationDays: null, months: 1 })).toThrow(
      /day-based/
    );
  });
});

describe('ensureProviderPlan', () => {
  it('reuses the current plan when price and term match', async () => {
    const { admin } = fakeAdmin([{ data: CURRENT, error: null }]);
    const createPlan = vi.fn();
    const row = await ensureProviderPlan({
      admin,
      client: { createPlan },
      mode: 'test',
      env: 'dev',
      quote: QUOTE,
    });
    expect(row.provider_plan_id).toBe('plan_EXISTING');
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('creates a new Razorpay plan when the price changed, retiring the old mapping', async () => {
    const { admin, log } = fakeAdmin([
      { data: CURRENT, error: null },
      { data: null, error: null },
      {
        data: {
          ...CURRENT,
          id: 'row-2',
          amount_minor: 120000,
          provider_plan_id: 'plan_NEW',
        },
        error: null,
      },
    ]);
    const createPlan = vi.fn(async () => ({ id: 'plan_NEW' }));
    const row = await ensureProviderPlan({
      admin,
      client: { createPlan } as never,
      mode: 'test',
      env: 'dev',
      quote: { ...QUOTE, amount: 1200 },
    });
    expect(row.provider_plan_id).toBe('plan_NEW');
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'daily',
        interval: 30,
        item: expect.objectContaining({ amount: 120000, currency: 'INR' }),
      })
    );
    expect(log).toContain('update()');
  });

  it('creates a separate USD plan for a US cycle without retiring INR plans', async () => {
    const US_CYCLE = '5b0e2c1d-1111-4222-8333-444455556666';
    const inserted: unknown[] = [];
    const { admin, log } = fakeAdmin([
      { data: null, error: null },
      {
        data: {
          ...CURRENT,
          id: 'row-us',
          cycle_id: US_CYCLE,
          amount_minor: 6000,
          currency: 'USD',
          provider_plan_id: 'plan_USD',
          region: 'US',
        },
        error: null,
      },
    ]);
    const realFrom = (admin as unknown as { from: (t: string) => unknown })
      .from;
    (admin as unknown as { from: (t: string) => unknown }).from = (t) => {
      const b = realFrom(t) as Record<string, (...a: unknown[]) => unknown>;
      const insert = b.insert;
      b.insert = (row: unknown) => (inserted.push(row), insert(row));
      return b;
    };
    const createPlan = vi.fn(async () => ({ id: 'plan_USD' }));
    const row = await ensureProviderPlan({
      admin,
      client: { createPlan } as never,
      mode: 'test',
      env: 'dev',
      quote: {
        ...QUOTE,
        cycleId: US_CYCLE,
        amount: 60,
        currency: 'USD',
        region: 'US',
      },
    });
    expect(row.provider_plan_id).toBe('plan_USD');
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'daily',
        interval: 30,
        item: expect.objectContaining({ amount: 6000, currency: 'USD' }),
        notes: expect.objectContaining({ region: 'US', currency: 'USD' }),
      })
    );
    expect(inserted).toEqual([
      expect.objectContaining({
        cycle_id: US_CYCLE,
        amount_minor: 6000,
        currency: 'USD',
        region: 'US',
      }),
    ]);
    // Looked up by the US cycle only; nothing retired.
    expect(log).toContain(`eq(cycle_id=${US_CYCLE})`);
    expect(log).not.toContain('update()');
  });

  it('records Global for a quote without a region', async () => {
    const inserted: unknown[] = [];
    const { admin } = fakeAdmin([
      { data: null, error: null },
      { data: CURRENT, error: null },
    ]);
    const realFrom = (admin as unknown as { from: (t: string) => unknown })
      .from;
    (admin as unknown as { from: (t: string) => unknown }).from = (t) => {
      const b = realFrom(t) as Record<string, (...a: unknown[]) => unknown>;
      const insert = b.insert;
      b.insert = (row: unknown) => (inserted.push(row), insert(row));
      return b;
    };
    await ensureProviderPlan({
      admin,
      client: { createPlan: vi.fn(async () => ({ id: 'plan_X' })) } as never,
      mode: 'test',
      env: 'dev',
      quote: QUOTE,
    });
    expect(inserted).toEqual([
      expect.objectContaining({ region: 'global', currency: 'INR' }),
    ]);
  });

  it('uses the winner when a concurrent request inserted first', async () => {
    const { admin } = fakeAdmin([
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: CURRENT, error: null },
    ]);
    const createPlan = vi.fn(async () => ({ id: 'plan_ORPHAN' }));
    const row = await ensureProviderPlan({
      admin,
      client: { createPlan } as never,
      mode: 'test',
      env: 'dev',
      quote: QUOTE,
    });
    expect(row.provider_plan_id).toBe('plan_EXISTING');
  });
});
