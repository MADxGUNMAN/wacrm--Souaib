// ============================================================
// /api/super-admin/billing/regions
//
// GET  every configured country pricing region with its readiness
// PUT  { code, currency?, is_enabled? } set a country's currency, or
//      enable / disable its localized plan
//
// Super admin only. Report: docs/razopay/localized-pricing-report.md.
//
// Enabling FAILS CLOSED. A country is shown to its customers only once it
// is enabled, so enabling runs every check the customer-side resolver
// relies on, and for a non-INR currency it also creates the Razorpay
// plans in this deployment's mode up front (objects only, no money). A
// currency Razorpay cannot charge is refused here with the reason, rather
// than discovered by a customer at checkout. Disabling is always allowed:
// customers fall back to Global and live mandates keep charging.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  assessRegion,
  isGlobalRegion,
  isRegionCode,
  isValidCurrencyCode,
  pricedCycles,
  regionLabel,
  validateRegionEnable,
  type PricingRegionRow,
} from '@/lib/billing/pricing/regions';
import {
  chargeContextOf,
  loadPricingRegions,
  loadRegionCatalogue,
} from '@/lib/billing/pricing/region-store';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { ensureProviderPlan } from '@/lib/billing/razorpay/plans';
import { getBillingDeps } from '@/lib/billing/razorpay/runtime';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const config = getRazorpayConfig();
    const ctx = chargeContextOf(config);
    const [regions, catalogue] = await Promise.all([
      loadPricingRegions(),
      loadRegionCatalogue(),
    ]);

    // Countries that have cycles but no row yet still show as drafts.
    const codes = new Set<string>(regions.keys());
    for (const c of catalogue.cycles) {
      if (!isGlobalRegion(c.region)) codes.add(c.region);
    }

    const list = [...codes].sort().map((code) => {
      const row = regions.get(code) ?? null;
      const status = assessRegion(row, catalogue, ctx);
      return {
        code,
        label: regionLabel(code),
        currency: row?.currency ?? null,
        is_enabled: row?.is_enabled ?? false,
        enabled_at: row?.enabled_at ?? null,
        cycle_count: catalogue.cycles.filter((c) => c.region === code).length,
        priced_cycle_count: pricedCycles(catalogue, code).length,
        complete: status.complete,
        chargeable: status.chargeable,
        problems: status.problems,
      };
    });

    return NextResponse.json({
      regions: list,
      razorpay: {
        configured: ctx.razorpayConfigured,
        mode: config?.mode ?? null,
        chargeCurrencies: [...ctx.chargeCurrencies].sort(),
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/regions] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load pricing regions' },
      { status: 500 }
    );
  }
}

function unprocessable(problems: string[]): NextResponse {
  return NextResponse.json(
    {
      error: 'This localized plan cannot be enabled yet.',
      code: 'region_not_ready',
      problems,
    },
    { status: 422 }
  );
}

/**
 * Create (or reuse) the Razorpay plan for every priced visible cycle of
 * the country, in this deployment's mode. Any refusal is reported with
 * Razorpay's own wording.
 */
async function preflightRazorpayPlans(
  row: PricingRegionRow,
  catalogue: Awaited<ReturnType<typeof loadRegionCatalogue>>
): Promise<string[]> {
  const problems: string[] = [];
  let deps: ReturnType<typeof getBillingDeps>;
  try {
    deps = getBillingDeps();
  } catch (err) {
    return [
      `Razorpay is not configured on this deployment: ${err instanceof Error ? err.message : 'unknown error'}.`,
    ];
  }
  const admin = supabaseAdmin();
  const priced = pricedCycles(catalogue, row.code);
  const { data: plans } = await admin
    .from('subscription_plans')
    .select('id, name')
    .in(
      'id',
      priced.map((p) => p.price.planId)
    );
  const names = new Map(
    (plans ?? []).map((p) => [
      String((p as { id: unknown }).id),
      String((p as { name: unknown }).name),
    ])
  );
  for (const { cycle, price } of priced) {
    try {
      await ensureProviderPlan({
        admin,
        client: deps.client,
        mode: deps.config.mode,
        env: deps.config.env,
        quote: {
          planId: price.planId,
          planName: names.get(price.planId) ?? 'Replai',
          cycleId: cycle.id,
          cycleLabel: cycle.label,
          cycleMonths: cycle.months,
          cycleDurationDays: cycle.durationDays,
          amount: price.amount,
          currency: row.currency ?? '',
          region: row.code,
        },
      });
    } catch (err) {
      problems.push(
        `Razorpay refused the ${cycle.label} plan in ${row.currency}: ${err instanceof Error ? err.message : 'unknown error'}`
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
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const code =
      typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!isRegionCode(code) || isGlobalRegion(code)) {
      return NextResponse.json(
        { error: 'Choose a country to configure.', field: 'code' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const [regions, catalogue] = await Promise.all([
      loadPricingRegions(admin),
      loadRegionCatalogue(admin),
    ]);
    const existing = regions.get(code) ?? null;

    const patch: Record<string, unknown> = {};

    if ('currency' in body) {
      const currency =
        typeof body.currency === 'string'
          ? body.currency.trim().toUpperCase()
          : '';
      if (!isValidCurrencyCode(currency)) {
        return NextResponse.json(
          {
            error: 'Enter a 3-letter ISO 4217 currency code, for example USD.',
            field: 'currency',
          },
          { status: 400 }
        );
      }
      if (existing?.is_enabled && existing.currency !== currency) {
        return NextResponse.json(
          {
            error:
              'Disable this localized plan before changing its currency. Customers would otherwise see prices in a currency they were not charged in.',
            field: 'currency',
          },
          { status: 409 }
        );
      }
      patch.currency = currency;
    }

    let enabling = false;
    if ('is_enabled' in body) {
      const wantEnabled = Boolean(body.is_enabled);
      if (wantEnabled && !existing?.is_enabled) {
        enabling = true;
        const candidate: PricingRegionRow = {
          code,
          currency:
            (patch.currency as string | undefined) ??
            existing?.currency ??
            null,
          is_enabled: true,
          settings: existing?.settings ?? {},
        };
        const config = getRazorpayConfig();
        const problems = validateRegionEnable({
          row: candidate,
          catalogue,
          ctx: chargeContextOf(config),
        });
        if (problems.length) return unprocessable(problems);
        if (candidate.currency !== 'INR') {
          const preflight = await preflightRazorpayPlans(candidate, catalogue);
          if (preflight.length) return unprocessable(preflight);
        }
        patch.is_enabled = true;
        patch.enabled_at = new Date().toISOString();
        patch.enabled_by_user_id = userId;
      } else if (!wantEnabled) {
        patch.is_enabled = false;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ region: existing, unchanged: true });
    }
    patch.updated_by_user_id = userId;

    const { data, error } = existing
      ? await admin
          .from('pricing_regions')
          .update(patch)
          .eq('code', code)
          .select('code, currency, is_enabled, settings, enabled_at')
          .single()
      : await admin
          .from('pricing_regions')
          .insert({ code, ...patch, created_by_user_id: userId })
          .select('code, currency, is_enabled, settings, enabled_at')
          .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ region: data, enabled: enabling });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/regions] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update the pricing region' },
      { status: 500 }
    );
  }
}
