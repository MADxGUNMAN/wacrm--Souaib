// ============================================================
// Catalogue (plan, cycle, price) -> Razorpay plan — SERVER ONLY.
//
// D1: terms keep their exact day counts. A 30-day cycle becomes a
// Razorpay plan with period=daily, interval=30; a 360-day cycle,
// interval=360. Phase 0 confirmed both are accepted. Razorpay rejects a
// daily interval below 7, and calendar-month cycles are not converted:
// silently turning "30 days" into "a month" would change what customers
// pay for, so those are refused with a clear error instead.
//
// Razorpay plans are immutable. A price change creates a new plan and
// flips `is_current`; existing subscriptions keep their old plan (D8).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { toMinor } from './money';
import type { RazorpayClient } from './client';
import type {
  BillingProviderPlanRow,
  RazorpayMode,
  RazorpayPeriod,
} from './types';

export class ProviderPlanError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'ProviderPlanError';
  }
}

export interface PlanQuote {
  planId: string;
  planName: string;
  cycleId: string;
  cycleLabel: string;
  cycleMonths: number;
  cycleDurationDays: number | null;
  amount: number;
  currency: string;
  /**
   * Pricing region of the cycle. Optional so older callers still compile;
   * absent means 'global'. Each region owns its cycles, so the existing
   * (mode, plan_id, cycle_id) key already keeps a USD plan apart from INR.
   */
  region?: string;
}

export function planFrequencyFor(cycle: {
  durationDays: number | null;
  months: number;
}): {
  period: RazorpayPeriod;
  interval: number;
  durationDays: number;
} {
  const days = cycle.durationDays;
  if (days && days > 0) {
    if (!Number.isInteger(days) || days < 7) {
      throw new ProviderPlanError(
        'AutoPay needs a billing term of at least 7 whole days.'
      );
    }
    return { period: 'daily', interval: days, durationDays: days };
  }
  throw new ProviderPlanError(
    'AutoPay supports day-based billing terms only. Set a day count on this billing cycle.'
  );
}

const PLAN_COLUMNS =
  'id, provider, mode, plan_id, cycle_id, plan_name, cycle_label, duration_days, amount_minor, currency, period, period_interval, provider_plan_id, is_current, region, created_at';

function matches(
  row: BillingProviderPlanRow,
  want: {
    amountMinor: number;
    currency: string;
    period: string;
    interval: number;
  }
): boolean {
  return (
    Number(row.amount_minor) === want.amountMinor &&
    row.currency === want.currency &&
    row.period === want.period &&
    row.period_interval === want.interval
  );
}

/**
 * The current Razorpay plan for this quote, creating it when the price or
 * term changed. Safe under concurrency: a losing insert re-reads the
 * winner (one orphan Razorpay plan is harmless).
 */
export async function ensureProviderPlan(input: {
  admin: SupabaseClient;
  client: Pick<RazorpayClient, 'createPlan'>;
  mode: RazorpayMode;
  env: string;
  quote: PlanQuote;
}): Promise<BillingProviderPlanRow> {
  const { admin, client, mode, env, quote } = input;
  const currency = quote.currency.toUpperCase();
  const region = quote.region || 'global';
  const amountMinor = toMinor(quote.amount, currency);
  const freq = planFrequencyFor({
    durationDays: quote.cycleDurationDays,
    months: quote.cycleMonths,
  });

  const readCurrent = async (): Promise<BillingProviderPlanRow | null> => {
    const { data, error } = await admin
      .from('billing_provider_plans')
      .select(PLAN_COLUMNS)
      .eq('mode', mode)
      .eq('plan_id', quote.planId)
      .eq('cycle_id', quote.cycleId)
      .eq('is_current', true)
      .maybeSingle();
    if (error)
      throw new ProviderPlanError(
        `Could not read billing plans: ${error.message}`,
        500
      );
    return (data as BillingProviderPlanRow | null) ?? null;
  };

  const want = {
    amountMinor,
    currency,
    period: freq.period,
    interval: freq.interval,
  };
  const current = await readCurrent();
  if (current && matches(current, want)) return current;

  const created = await client.createPlan({
    period: freq.period,
    interval: freq.interval,
    item: {
      name: `${quote.planName} · ${quote.cycleLabel} (${freq.durationDays} days)`,
      amount: amountMinor,
      currency,
      description: `${quote.planName} ${quote.cycleLabel} subscription`,
    },
    notes: {
      plan_id: quote.planId,
      cycle_id: quote.cycleId,
      env,
      region,
      currency,
    },
  });

  if (current) {
    const { error } = await admin
      .from('billing_provider_plans')
      .update({ is_current: false })
      .eq('id', current.id)
      .eq('is_current', true);
    if (error)
      throw new ProviderPlanError(
        `Could not retire the old billing plan: ${error.message}`,
        500
      );
  }

  const { data, error } = await admin
    .from('billing_provider_plans')
    .insert({
      mode,
      plan_id: quote.planId,
      cycle_id: quote.cycleId,
      plan_name: quote.planName,
      cycle_label: quote.cycleLabel,
      duration_days: freq.durationDays,
      amount_minor: amountMinor,
      currency,
      period: freq.period,
      period_interval: freq.interval,
      provider_plan_id: created.id,
      is_current: true,
      region,
    })
    .select(PLAN_COLUMNS)
    .single();

  if (error) {
    // 23505: another request won the race. Use its plan.
    if (error.code === '23505') {
      const winner = await readCurrent();
      if (winner && matches(winner, want)) return winner;
    }
    throw new ProviderPlanError(
      `Could not save the billing plan: ${error.message}`,
      500
    );
  }
  return data as BillingProviderPlanRow;
}
