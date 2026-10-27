// ============================================================
// Localized pricing: database reads — SERVER ONLY (service role).
//
// `getAccountPricingRegion` is the one entry point every price shown or
// charged goes through. It never throws: any read error answers Global
// with reason `lookup_failed`, because a pricing lookup must not take
// down the upgrade page or the webhook-adjacent routes.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { MANDATE_STATUSES } from '@/lib/billing/razorpay/checkout';
import {
  chargeCurrenciesOf,
  getRazorpayConfig,
  type RazorpayConfig,
} from '@/lib/billing/razorpay/config';
import { resolvePaymentProvider } from '@/lib/billing/razorpay/provider';
import { toAmount } from '@/lib/subscription/plans';
import {
  cycleRowVisible,
  getPlansBundle,
  getSubscriptionSettings,
} from '@/lib/subscription/queries';
import type {
  PlansBundle,
  PricingRegionResolution,
  PublicSubscriptionSettings,
} from '@/lib/subscription/types';

import {
  GLOBAL_REGION,
  globalResolution,
  resolvePricingRegion,
  type ChargeContext,
  type PricingRegionRow,
  type RegionCatalogue,
} from './regions';

type Admin = ReturnType<typeof supabaseAdmin>;

function toRegionRow(raw: Record<string, unknown>): PricingRegionRow {
  return {
    code: String(raw.code),
    currency: raw.currency ? String(raw.currency).trim().toUpperCase() : null,
    is_enabled: Boolean(raw.is_enabled),
    settings:
      raw.settings && typeof raw.settings === 'object'
        ? (raw.settings as Record<string, unknown>)
        : {},
    enabled_at: (raw.enabled_at as string | null) ?? null,
    updated_at: (raw.updated_at as string | null) ?? null,
  };
}

/** Every configured country region, keyed by code. Throws on read error. */
export async function loadPricingRegions(
  admin: Admin = supabaseAdmin()
): Promise<Map<string, PricingRegionRow>> {
  const { data, error } = await admin
    .from('pricing_regions')
    .select('code, currency, is_enabled, settings, enabled_at, updated_at');
  if (error) throw new Error(`pricing_regions read failed: ${error.message}`);
  const out = new Map<string, PricingRegionRow>();
  for (const raw of data ?? []) {
    const row = toRegionRow(raw as Record<string, unknown>);
    out.set(row.code, row);
  }
  return out;
}

/** Cycles of every region, visible plans and prices. Throws on error. */
export async function loadRegionCatalogue(
  admin: Admin = supabaseAdmin()
): Promise<RegionCatalogue> {
  const [cyclesRes, plansRes, pricesRes] = await Promise.all([
    admin
      .from('billing_cycles')
      .select(
        'id, region, label, months, duration_days, is_visible, is_visible_in_region'
      ),
    admin.from('subscription_plans').select('id').eq('is_visible', true),
    admin
      .from('subscription_plan_prices')
      .select('plan_id, cycle_id, amount, is_visible'),
  ]);
  const failed = cyclesRes.error ?? plansRes.error ?? pricesRes.error;
  if (failed) throw new Error(`catalogue read failed: ${failed.message}`);

  return {
    cycles: (cyclesRes.data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id),
        region: String(r.region ?? GLOBAL_REGION),
        label: String(r.label ?? ''),
        months: Number(r.months ?? 0),
        durationDays: r.duration_days == null ? null : Number(r.duration_days),
        visible: cycleRowVisible(r),
      };
    }),
    prices: (pricesRes.data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        planId: String(r.plan_id),
        cycleId: String(r.cycle_id),
        amount: toAmount(r.amount),
        isVisible: Boolean(r.is_visible),
      };
    }),
    visiblePlanIds: new Set(
      (plansRes.data ?? []).map((r) => String((r as { id: unknown }).id))
    ),
  };
}

/** Charge capability of this deployment. */
export function chargeContextOf(config: RazorpayConfig | null): ChargeContext {
  return {
    razorpayConfigured: config !== null,
    chargeCurrencies: chargeCurrenciesOf(config),
  };
}

/** The owner's `profiles.phone` (keyed by user_id, never by id). */
async function readOwnerPhone(
  admin: Admin,
  accountId: string
): Promise<string | null> {
  const { data: account, error } = await admin
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(`account read failed: ${error.message}`);
  const owner = (account as { owner_user_id?: string | null } | null)
    ?.owner_user_id;
  if (!owner) return null;
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('phone')
    .eq('user_id', owner)
    .maybeSingle();
  if (profileErr) throw new Error(`profile read failed: ${profileErr.message}`);
  const phone = (profile as { phone?: string | null } | null)?.phone;
  return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
}

/** Latest live mandate in this deployment's mode, or null. */
async function readLiveMandate(
  admin: Admin,
  accountId: string,
  config: RazorpayConfig | null
): Promise<{ cycle_id: string | null; currency: string | null } | null> {
  if (!config) return null;
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('cycle_id, currency, status, created_at')
    .eq('account_id', accountId)
    .eq('mode', config.mode)
    .in('status', [...MANDATE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`subscription read failed: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    cycle_id: (row.cycle_id as string | null) ?? null,
    currency: row.currency ? String(row.currency).trim().toUpperCase() : null,
  };
}

/**
 * Pricing region of a workspace, decided from its owner's phone and any
 * live mandate. Never throws; Global on any failure.
 */
export async function getAccountPricingRegion(
  accountId: string,
  options: {
    settings?: PublicSubscriptionSettings;
    /** Pass null for "Razorpay not configured"; omit to read the env. */
    config?: RazorpayConfig | null;
  } = {}
): Promise<PricingRegionResolution> {
  let globalCurrency = options.settings?.currency || 'INR';
  try {
    const admin = supabaseAdmin();
    const config =
      options.config !== undefined ? options.config : getRazorpayConfig();
    const [settings, regions] = await Promise.all([
      options.settings
        ? Promise.resolve(options.settings)
        : getSubscriptionSettings(),
      loadPricingRegions(admin),
    ]);
    globalCurrency = settings.currency || 'INR';

    const provider = resolvePaymentProvider({
      settingsProvider: settings.payment_provider,
      config,
      accountId,
    });

    const [phone, mandate, catalogue] = await Promise.all([
      readOwnerPhone(admin, accountId),
      readLiveMandate(admin, accountId, config),
      // With no country configured anywhere the catalogue cannot change
      // the answer, so production today skips that read entirely.
      regions.size > 0
        ? loadRegionCatalogue(admin)
        : Promise.resolve<RegionCatalogue>({
            cycles: [],
            prices: [],
            visiblePlanIds: new Set(),
          }),
    ]);

    const cycleRegion = mandate?.cycle_id
      ? (catalogue.cycles.find((c) => c.id === mandate.cycle_id)?.region ??
        (regions.size === 0 ? GLOBAL_REGION : null))
      : null;

    return resolvePricingRegion({
      ownerPhone: phone,
      regions,
      catalogue,
      provider,
      ctx: chargeContextOf(config),
      globalCurrency,
      mandate: mandate ? { cycleRegion, currency: mandate.currency } : null,
    });
  } catch (err) {
    console.error(
      '[pricing] region lookup failed, using Global:',
      err instanceof Error ? err.message : err
    );
    return globalResolution(globalCurrency, 'lookup_failed');
  }
}

export const MANUAL_UPI_INR_ONLY_MESSAGE =
  'UPI payments are available in INR only. Please use card AutoPay for this plan.';

/** 409 for a manual UPI step asked to collect a non-INR price. */
export function manualUpiInrOnlyResponse(): NextResponse {
  return NextResponse.json(
    { error: MANUAL_UPI_INR_ONLY_MESSAGE, code: 'manual_upi_inr_only' },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Plans bundle for the landing page: the signed-in visitor's workspace
 * region when there is one, Global for everyone else. Never throws on
 * the region step.
 */
export async function getLandingPlansBundle(): Promise<PlansBundle> {
  let pricing: PricingRegionResolution | null = null;
  try {
    const ctx = await getCurrentAccount();
    pricing = await getAccountPricingRegion(ctx.accountId);
  } catch {
    pricing = null;
  }
  if (!pricing || pricing.region === GLOBAL_REGION) return getPlansBundle();
  return getPlansBundle({ region: pricing.region, currency: pricing.currency });
}
