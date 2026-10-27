// ============================================================
// /api/super-admin/billing/global-currency
//
// GET  the Global (Universal) currency, what this deployment allows, and
//      every Global price row the change must re-price
// PUT  { currency, expected_currency, prices: [{ plan_id, cycle_id,
//      amount, per_day_amount }] } change the Global currency and every
//      Global price together
//
// Super admin only. Report: docs/razopay/localized-pricing-report.md,
// section 12.
//
// Global prices are plain numbers with no currency of their own, so a
// currency change without new prices would silently turn 990 INR into
// 990 USD. The PUT therefore requires a new price for every Global price
// row and hands prices and currency to `fn_change_global_currency`, which
// writes them in ONE transaction. This route never writes
// `subscription_settings` or a price itself, and never touches
// `payment_provider`.
//
// A non-INR Global is allowed only where every workspace pays by AutoPay
// and the currency is chargeable here (see global-currency.ts). For a
// non-INR target the Razorpay plans are created up front in this
// deployment's mode, so a currency Razorpay refuses is reported here with
// its own wording instead of at a customer's checkout.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  GLOBAL_CATALOGUE_CHANGED_MESSAGE,
  GLOBAL_INVALID_AMOUNT_MESSAGE,
  GLOBAL_MIGRATION_REQUIRED_MESSAGE,
  GLOBAL_PRICES_REQUIRED_MESSAGE,
  GLOBAL_SETTINGS_MISSING_MESSAGE,
  allowedGlobalCurrencies,
  checkGlobalCurrencyChange,
  globalCurrencyStaleMessage,
  globalCurrencyUnchangedMessage,
  globalPriceRowLabel,
  soldPlanIdOf,
  validateGlobalPriceInputs,
  type GlobalCurrencyContext,
  type GlobalPriceRow,
} from '@/lib/billing/pricing/global-currency';
import { GLOBAL_REGION } from '@/lib/billing/pricing/regions';
import { chargeContextOf } from '@/lib/billing/pricing/region-store';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { ensureProviderPlan } from '@/lib/billing/razorpay/plans';
import { resolveManualIntake } from '@/lib/billing/razorpay/provider';
import { getBillingDeps } from '@/lib/billing/razorpay/runtime';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { toAmount, toNullableAmount } from '@/lib/subscription/plans';

export const dynamic = 'force-dynamic';

const LOG = '[super-admin/billing/global-currency]';

type Admin = ReturnType<typeof supabaseAdmin>;

interface SettingsRow {
  id: string;
  currency: string;
  payment_provider: string | null;
}

async function readSettings(admin: Admin): Promise<SettingsRow | null> {
  const { data, error } = await admin
    .from('subscription_settings')
    .select('id, currency, payment_provider')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    currency: String(row.currency ?? 'INR')
      .trim()
      .toUpperCase(),
    payment_provider: (row.payment_provider as string | null) ?? null,
  };
}

/** Every Global price row (any plan, visible or hidden). Throws on error. */
async function loadGlobalPriceRows(admin: Admin): Promise<GlobalPriceRow[]> {
  const { data: cycles, error: cyclesErr } = await admin
    .from('billing_cycles')
    .select('id, label, months, duration_days, is_visible, position')
    .eq('region', GLOBAL_REGION);
  if (cyclesErr) throw new Error(`cycles read failed: ${cyclesErr.message}`);
  const cycleRows = (cycles ?? []) as Record<string, unknown>[];
  if (cycleRows.length === 0) return [];

  const { data: prices, error: pricesErr } = await admin
    .from('subscription_plan_prices')
    .select(
      'plan_id, cycle_id, amount, per_day_amount, compare_at_amount, is_visible'
    )
    .in(
      'cycle_id',
      cycleRows.map((c) => String(c.id))
    );
  if (pricesErr) throw new Error(`prices read failed: ${pricesErr.message}`);
  const priceRows = (prices ?? []) as Record<string, unknown>[];
  if (priceRows.length === 0) return [];

  const planIds = [...new Set(priceRows.map((p) => String(p.plan_id)))];
  const { data: plans, error: plansErr } = await admin
    .from('subscription_plans')
    .select('id, name, is_visible, position')
    .in('id', planIds);
  if (plansErr) throw new Error(`plans read failed: ${plansErr.message}`);

  const cycleById = new Map(cycleRows.map((c) => [String(c.id), c]));
  const planById = new Map(
    ((plans ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p])
  );

  return priceRows
    .map((p) => {
      const cycle = cycleById.get(String(p.cycle_id)) ?? {};
      const plan = planById.get(String(p.plan_id)) ?? {};
      return {
        row: {
          planId: String(p.plan_id),
          planName: String(plan.name ?? 'Plan'),
          planVisible: Boolean(plan.is_visible),
          cycleId: String(p.cycle_id),
          cycleLabel: String(cycle.label ?? ''),
          cycleVisible: Boolean(cycle.is_visible),
          durationDays:
            cycle.duration_days == null ? null : Number(cycle.duration_days),
          months: Number(cycle.months ?? 0),
          amount: toAmount(p.amount),
          perDayAmount: toNullableAmount(p.per_day_amount),
          compareAtAmount: toNullableAmount(p.compare_at_amount),
          priceVisible: Boolean(p.is_visible),
        } satisfies GlobalPriceRow,
        planPos: Number(plan.position ?? 0),
        cyclePos: Number(cycle.position ?? 0),
      };
    })
    .sort((a, b) => a.planPos - b.planPos || a.cyclePos - b.cyclePos)
    .map((x) => x.row);
}

/** Landing CMS display override, which this change does not touch. */
async function readLandingOverride(
  admin: Admin
): Promise<{ currency: string | null; cycles: string[] } | null> {
  try {
    const { data, error } = await admin
      .from('landing_sections')
      .select('extra_data')
      .eq('section_key', 'pricing')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const extra = ((data as { extra_data?: unknown } | null)?.extra_data ??
      {}) as Record<string, unknown>;
    const currency =
      typeof extra.price_currency === 'string' && extra.price_currency.trim()
        ? extra.price_currency.trim().toUpperCase()
        : null;
    const overrides =
      extra.price_overrides && typeof extra.price_overrides === 'object'
        ? Object.keys(extra.price_overrides as Record<string, unknown>)
        : [];
    return currency || overrides.length
      ? { currency, cycles: overrides }
      : null;
  } catch (err) {
    console.error(
      `${LOG} landing override read failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function contextOf(settings: SettingsRow | null): GlobalCurrencyContext & {
  config: ReturnType<typeof getRazorpayConfig>;
} {
  const config = getRazorpayConfig();
  return {
    config,
    ctx: chargeContextOf(config),
    settingsProvider: settings?.payment_provider ?? null,
    manualIntake: resolveManualIntake({
      settingsProvider: settings?.payment_provider ?? null,
      config,
    }),
  };
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const settings = await readSettings(admin);
    const c = contextOf(settings);
    const [prices, landingOverride] = await Promise.all([
      loadGlobalPriceRows(admin),
      readLandingOverride(admin),
    ]);
    return NextResponse.json({
      currency: settings?.currency ?? 'INR',
      paymentProvider: c.settingsProvider,
      manualIntake: c.manualIntake,
      razorpay: {
        configured: c.ctx.razorpayConfigured,
        mode: c.config?.mode ?? null,
        chargeCurrencies: [...c.ctx.chargeCurrencies].sort(),
      },
      allowedCurrencies: allowedGlobalCurrencies(c),
      prices,
      landingOverride,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error(`${LOG} GET failed:`, err);
    return NextResponse.json(
      { error: 'Failed to load the Global currency' },
      { status: 500 }
    );
  }
}

function staleResponse(stored: string): NextResponse {
  return NextResponse.json(
    { error: globalCurrencyStaleMessage(stored), code: 'stale' },
    { status: 409 }
  );
}

/** Create (or reuse) the Razorpay plan of every sold row, in this mode. */
async function preflightRazorpayPlans(
  admin: Admin,
  rows: GlobalPriceRow[],
  prices: { plan_id: string; cycle_id: string; amount: number }[],
  currency: string
): Promise<string[]> {
  let deps: ReturnType<typeof getBillingDeps>;
  try {
    deps = getBillingDeps();
  } catch (err) {
    return [
      `Razorpay is not configured on this deployment: ${err instanceof Error ? err.message : 'unknown error'}.`,
    ];
  }
  const sold = soldPlanIdOf(rows);
  const problems: string[] = [];
  for (const row of rows) {
    if (!row.planVisible || !row.cycleVisible || !row.priceVisible) continue;
    const input = prices.find(
      (p) => p.plan_id === row.planId && p.cycle_id === row.cycleId
    );
    if (!input) continue;
    try {
      await ensureProviderPlan({
        admin,
        client: deps.client,
        mode: deps.config.mode,
        env: deps.config.env,
        quote: {
          planId: row.planId,
          planName: row.planName,
          cycleId: row.cycleId,
          cycleLabel: row.cycleLabel,
          cycleMonths: row.months,
          cycleDurationDays: row.durationDays,
          amount: input.amount,
          currency,
          region: GLOBAL_REGION,
        },
      });
    } catch (err) {
      problems.push(
        `Razorpay refused the ${globalPriceRowLabel(row, sold)} plan in ${currency}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }
  return problems;
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireSuperAdmin(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'bad_request' },
        { status: 400 }
      );
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'bad_request' },
        { status: 400 }
      );
    }

    const currency = String(body.currency ?? '')
      .trim()
      .toUpperCase();
    const expected = String(body.expected_currency ?? '')
      .trim()
      .toUpperCase();
    if (!expected) {
      return NextResponse.json(
        { error: 'Reload the page and try again.', code: 'bad_request' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const settings = await readSettings(admin);
    if (!settings) {
      return NextResponse.json(
        { error: GLOBAL_SETTINGS_MISSING_MESSAGE, code: 'settings_missing' },
        { status: 500 }
      );
    }
    const stored = settings.currency;
    if (expected !== stored) return staleResponse(stored);

    const c = contextOf(settings);
    const refusal = checkGlobalCurrencyChange({
      current: stored,
      next: currency,
      ...c,
    });
    if (refusal) {
      return NextResponse.json(
        { error: refusal.message, code: refusal.code, field: 'currency' },
        { status: refusal.status }
      );
    }

    const rows = await loadGlobalPriceRows(admin);
    const checked = validateGlobalPriceInputs(rows, body.prices, currency);
    if (!checked.ok) {
      return NextResponse.json(
        {
          error: GLOBAL_PRICES_REQUIRED_MESSAGE,
          code: 'prices_required',
          problems: checked.problems,
        },
        { status: 422 }
      );
    }

    if (currency !== 'INR') {
      const problems = await preflightRazorpayPlans(
        admin,
        rows,
        checked.prices,
        currency
      );
      if (problems.length) {
        return NextResponse.json(
          {
            error:
              'Razorpay refused the new Global prices. Nothing was changed.',
            code: 'razorpay_refused',
            problems,
          },
          { status: 422 }
        );
      }
    }

    const { data, error } = await admin.rpc('fn_change_global_currency', {
      p_expected_currency: stored,
      p_new_currency: currency,
      p_prices: checked.prices,
    });
    if (error) {
      const missing =
        error.code === 'PGRST202' ||
        String(error.message ?? '').includes('fn_change_global_currency');
      if (missing) {
        return NextResponse.json(
          {
            error: GLOBAL_MIGRATION_REQUIRED_MESSAGE,
            code: 'migration_required',
          },
          { status: 503 }
        );
      }
      console.error(`${LOG} rpc failed:`, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? {}) as Record<string, unknown>;
    switch (result.outcome) {
      case 'changed':
        console.info(`${LOG} changed`, {
          userId,
          from: stored,
          to: currency,
          prices: Number(result.prices ?? checked.prices.length),
        });
        return NextResponse.json({
          currency: String(result.currency ?? currency),
          previousCurrency: String(result.previous ?? stored),
          pricesUpdated: Number(result.prices ?? checked.prices.length),
        });
      case 'stale':
        return staleResponse(String(result.currency ?? stored));
      case 'unchanged':
        return NextResponse.json(
          {
            error: globalCurrencyUnchangedMessage(
              String(result.currency ?? stored)
            ),
            code: 'unchanged',
            field: 'currency',
          },
          { status: 400 }
        );
      case 'prices_mismatch':
        return NextResponse.json(
          {
            error: GLOBAL_CATALOGUE_CHANGED_MESSAGE,
            code: 'catalogue_changed',
          },
          { status: 409 }
        );
      case 'invalid_amount':
      case 'invalid_prices':
      case 'invalid_currency':
        return NextResponse.json(
          { error: GLOBAL_INVALID_AMOUNT_MESSAGE, code: 'invalid_amount' },
          { status: 400 }
        );
      case 'settings_missing':
        return NextResponse.json(
          { error: GLOBAL_SETTINGS_MISSING_MESSAGE, code: 'settings_missing' },
          { status: 500 }
        );
      default:
        console.error(`${LOG} unexpected rpc result:`, result);
        return NextResponse.json(
          { error: 'Failed to change the Global currency' },
          { status: 500 }
        );
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error(`${LOG} PUT failed:`, err);
    return NextResponse.json(
      { error: 'Failed to change the Global currency' },
      { status: 500 }
    );
  }
}
