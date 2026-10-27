// ============================================================
// Localized pricing regions: pure rules, no I/O.
//
// Report: docs/razopay/localized-pricing-report.md.
//
// Global (Universal) is implicit: today's `subscription_settings` row plus
// every cycle with region 'global'. A country plan lives in
// `pricing_regions` and owns its own cycles (and, through them, prices).
//
// Resolution order, used by every price shown or charged:
//   1. A live AutoPay mandate pins the region of the cycle it was bought
//      on, so a phone change never moves an existing subscriber.
//   2. Otherwise the ACCOUNT OWNER's phone (E.164) picks a country by the
//      longest matching dialing code. Shared codes with no longer match
//      use SHARED_DIAL_CODE_DEFAULT (+1 -> United States, +7 -> Russia).
//   3. That country is used only when it is enabled, complete and its
//      currency can be charged here. Otherwise Global.
//
// Safe for client components: imports only pure modules.
// ============================================================

import { toMinor } from '@/lib/billing/razorpay/money';
import {
  COUNTRIES,
  findCountryByCode,
  findCountryByDialPrefix,
} from '@/lib/phone/countries';
import {
  normalisePlanFeatures,
  serialisePlanFeatures,
} from '@/lib/subscription/plans';
import type {
  PricingRegionReason,
  PricingRegionResolution,
} from '@/lib/subscription/types';
import { ValidationError } from '@/lib/subscription/validation';

export const GLOBAL_REGION = 'global';
export const GLOBAL_REGION_LABEL = 'Global (Universal)';

/**
 * Dialing codes shared by several countries, mapped to the one used when
 * no longer (area-code) prefix matches. There is no NANP area-code table
 * in this repo, so Canada and other +1 members without their own 4-digit
 * entry in COUNTRIES resolve to the United States.
 */
export const SHARED_DIAL_CODE_DEFAULT: Readonly<Record<string, string>> = {
  '1': 'US',
  '7': 'RU',
};

/** 'global' or an ISO alpha-2 code present in COUNTRIES. */
export function isRegionCode(value: unknown): value is string {
  if (value === GLOBAL_REGION) return true;
  return (
    typeof value === 'string' &&
    /^[A-Z]{2}$/.test(value) &&
    COUNTRIES.some((c) => c.code === value)
  );
}

/** Parse a `?region=` value. Null when it is not a known region. */
export function parseRegionParam(
  value: string | null | undefined
): string | null {
  if (value == null || value === '') return GLOBAL_REGION;
  const v = value.trim();
  if (v.toLowerCase() === GLOBAL_REGION) return GLOBAL_REGION;
  const upper = v.toUpperCase();
  return isRegionCode(upper) ? upper : null;
}

export function isGlobalRegion(code: string | null | undefined): boolean {
  return !code || code === GLOBAL_REGION;
}

/** "Global (Universal)" or "United States (+1)". */
export function regionLabel(code: string): string {
  if (isGlobalRegion(code)) return GLOBAL_REGION_LABEL;
  const c = findCountryByCode(code);
  return c ? `${c.name} (${c.dialCode})` : code;
}

export interface RegionOption {
  code: string;
  label: string;
  name: string;
  dialCode: string | null;
  flag: string | null;
}

/** Global first, then every country sorted by name. */
export const REGION_OPTIONS: readonly RegionOption[] = [
  {
    code: GLOBAL_REGION,
    label: GLOBAL_REGION_LABEL,
    name: GLOBAL_REGION_LABEL,
    dialCode: null,
    flag: null,
  },
  ...[...COUNTRIES]
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((c) => ({
      code: c.code,
      label: `${c.name} (${c.dialCode})`,
      name: c.name,
      dialCode: c.dialCode,
      flag: c.flag,
    })),
];

const E164 = /^\+[1-9]\d{3,14}$/;

/** True for a stored E.164 number ("+" then digits; separators ignored). */
export function isE164Phone(phone: string | null | undefined): boolean {
  if (typeof phone !== 'string') return false;
  return E164.test(phone.replace(/[\s\-().]/g, ''));
}

/**
 * Country of an E.164 phone number by the longest matching dialing code,
 * or null when it is not E.164 or no code matches.
 */
export function countryFromPhone(
  phone: string | null | undefined
): string | null {
  if (!isE164Phone(phone)) return null;
  const digits = String(phone).replace(/\D/g, '');
  const country = findCountryByDialPrefix(digits);
  if (!country) return null;
  const dial = country.dialCode.slice(1);
  return SHARED_DIAL_CODE_DEFAULT[dial] ?? country.code;
}

/** Stored cycle_key for a region: 'monthly' or 'us-monthly'. */
export function regionCycleKey(code: string, slug: string): string {
  const clean = slug.trim();
  if (isGlobalRegion(code)) return clean;
  const prefix = `${code.toLowerCase()}-`;
  return clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
}

/** The admin-facing key without the region prefix. */
export function stripRegionCycleKey(code: string, key: string): string {
  if (isGlobalRegion(code)) return key;
  const prefix = `${code.toLowerCase()}-`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

// ------------------------------------------------------------
// Region page copy
// ------------------------------------------------------------

/** Copy keys a country may override. Everything else is Global only. */
export const REGION_TEXT_KEYS = [
  'upi_id',
  'upi_payee_name',
  'page_heading',
  'page_subheading',
  'cycle_hint',
  'selected_plan_label',
  'total_label',
  'save_label',
  'continue_label',
  'equals_label',
  'payment_heading',
  'payment_instructions',
  'submit_button_label',
  'pending_review_message',
  'support_note',
  'trial_banner_template',
  'trial_banner_cta',
  'expired_heading',
  'free_plan_label',
  'free_plan_subtitle',
  'member_blocked_heading',
  'member_blocked_body',
  'member_blocked_note',
  'member_blocked_contact_label',
  'per_day_label',
  'price_equals_template',
  'features_heading',
  'features_subheading',
  'custom_plan_label',
  'custom_plan_price_text',
  'custom_plan_body',
  'custom_plan_cta_text',
  'custom_plan_cta_link',
  'trial_badge_template',
  'no_card_label',
  'trial_cta_label',
  'trial_cta_note',
  'upcoming_plan_label',
  'upcoming_unpaid_label',
  'pay_now_label',
  'change_plan_label',
] as const;

export const REGION_BOOLEAN_KEYS = [
  'show_custom_plan',
  'show_trial_badges',
  'member_blocked_show_owner_contact',
] as const;

export const REGION_SETTINGS_KEYS: readonly string[] = [
  ...REGION_TEXT_KEYS,
  ...REGION_BOOLEAN_KEYS,
  'custom_plan_features',
];

/** Settings that apply to every region and are edited under Global only. */
export const PLATFORM_WIDE_SETTING_KEYS = [
  'is_enabled',
  'trial_days',
  'grace_days',
  'payment_provider',
  'autopay_grace_days',
  'currency',
] as const;

const UPI_KEYS = new Set(['upi_id', 'upi_payee_name']);

/**
 * Whitelist a country settings patch. A value of null means "clear the
 * override and use the Global wording". Platform-wide keys are refused
 * with a field error; unknown keys are ignored, as on the Global route.
 * UPI keys are dropped unless the country charges INR, because a UPI QR
 * in another currency must never be offered.
 */
export function sanitizeRegionSettings(
  body: Record<string, unknown>,
  currency: string | null
): Record<string, unknown> {
  for (const key of PLATFORM_WIDE_SETTING_KEYS) {
    if (key in body) {
      throw new ValidationError(
        key === 'currency'
          ? 'Set the currency in the country header, not in page settings.'
          : `${key.replace(/_/g, ' ')} is set under Global and applies to every country.`,
        key
      );
    }
  }

  const inr = (currency ?? '').toUpperCase() === 'INR';
  const patch: Record<string, unknown> = {};

  for (const key of REGION_TEXT_KEYS) {
    if (!(key in body)) continue;
    if (UPI_KEYS.has(key) && !inr) continue;
    const raw = body[key];
    const value = raw == null ? '' : String(raw).trim();
    if (value.length > 2000) {
      throw new ValidationError(
        'That text is too long (max 2000 characters)',
        key
      );
    }
    patch[key] = value === '' ? null : value;
  }

  for (const key of REGION_BOOLEAN_KEYS) {
    if (!(key in body)) continue;
    patch[key] = body[key] == null ? null : Boolean(body[key]);
  }

  if ('custom_plan_features' in body) {
    if (body.custom_plan_features == null) {
      patch.custom_plan_features = null;
    } else {
      const features = serialisePlanFeatures(
        normalisePlanFeatures(body.custom_plan_features)
      );
      if (features.length > 40) {
        throw new ValidationError(
          'The custom card can list at most 40 features',
          'custom_plan_features'
        );
      }
      patch.custom_plan_features = features.length ? features : null;
    }
  }

  return patch;
}

/** Apply a sanitized patch to stored overrides, dropping cleared keys. */
export function applyRegionSettingsPatch(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * Effective settings for a country: Global, then non-empty overrides,
 * then the country currency. UPI payee is cleared for non-INR so no
 * screen can build a QR in a currency UPI does not support.
 */
export function mergeRegionSettings<T extends { currency: string }>(
  global: T,
  overrides: Record<string, unknown> | null | undefined,
  currency: string
): T {
  const merged: Record<string, unknown> = { ...global };
  for (const key of REGION_SETTINGS_KEYS) {
    const value = overrides?.[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    merged[key] = value;
  }
  merged.currency = currency.toUpperCase();
  if (merged.currency !== 'INR') {
    merged.upi_id = null;
    merged.upi_payee_name = null;
  }
  return merged as T;
}

// ------------------------------------------------------------
// Completeness and chargeability
// ------------------------------------------------------------

export interface PricingRegionRow {
  code: string;
  currency: string | null;
  is_enabled: boolean;
  settings: Record<string, unknown> | null;
  enabled_at?: string | null;
  updated_at?: string | null;
}

export interface CatalogueCycle {
  id: string;
  region: string;
  label: string;
  durationDays: number | null;
  months: number;
  /** Customer visibility after the Global/country mapping. */
  visible: boolean;
}

export interface CataloguePrice {
  planId: string;
  cycleId: string;
  amount: number;
  isVisible: boolean;
}

/** The slice of the catalogue the resolver needs, for every region. */
export interface RegionCatalogue {
  cycles: CatalogueCycle[];
  prices: CataloguePrice[];
  visiblePlanIds: ReadonlySet<string>;
}

export interface PricedCycle {
  cycle: CatalogueCycle;
  price: CataloguePrice;
}

/** Visible cycles of a region that a visible plan prices above zero. */
export function pricedCycles(
  catalogue: RegionCatalogue,
  code: string
): PricedCycle[] {
  const out: PricedCycle[] = [];
  for (const cycle of catalogue.cycles) {
    if (cycle.region !== code || !cycle.visible) continue;
    for (const price of catalogue.prices) {
      if (
        price.cycleId === cycle.id &&
        price.isVisible &&
        price.amount > 0 &&
        catalogue.visiblePlanIds.has(price.planId)
      ) {
        out.push({ cycle, price });
      }
    }
  }
  return out;
}

export interface ChargeContext {
  /** Razorpay configured (correctly) on this deployment. */
  razorpayConfigured: boolean;
  /** RAZORPAY_CHARGE_CURRENCIES; always contains INR. */
  chargeCurrencies: ReadonlySet<string>;
}

export interface RegionAssessment {
  complete: boolean;
  /** The currency can be charged on this deployment. */
  chargeable: boolean;
  problems: string[];
}

/** Can this deployment charge `currency`? INR always (UPI or Razorpay). */
export function isCurrencyChargeable(
  currency: string | null | undefined,
  ctx: ChargeContext
): boolean {
  const c = (currency ?? '').toUpperCase();
  if (!c) return false;
  if (c === 'INR') return true;
  return ctx.razorpayConfigured && ctx.chargeCurrencies.has(c);
}

/** Status of a country plan for the super-admin view. */
export function assessRegion(
  row: PricingRegionRow | null | undefined,
  catalogue: RegionCatalogue,
  ctx: ChargeContext
): RegionAssessment {
  if (!row) {
    return {
      complete: false,
      chargeable: false,
      problems: ['This country has no localized plan yet.'],
    };
  }
  const problems = validateRegionEnable({ row, catalogue, ctx });
  const complete =
    Boolean(row.currency) && pricedCycles(catalogue, row.code).length > 0;
  return {
    complete,
    chargeable: isCurrencyChargeable(row.currency, ctx),
    problems,
  };
}

function isKnownCurrency(code: string): boolean {
  try {
    const list = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.('currency');
    return list ? list.includes(code) : /^[A-Z]{3}$/.test(code);
  } catch {
    return /^[A-Z]{3}$/.test(code);
  }
}

/** Is `code` a usable ISO 4217 currency code? */
export function isValidCurrencyCode(code: unknown): code is string {
  return (
    typeof code === 'string' && /^[A-Z]{3}$/.test(code) && isKnownCurrency(code)
  );
}

/**
 * Every reason this country cannot be enabled. Empty means it can.
 * Messages are written for the super admin and name the exact fix.
 */
export function validateRegionEnable(input: {
  row: PricingRegionRow;
  catalogue: RegionCatalogue;
  ctx: ChargeContext;
}): string[] {
  const { row, catalogue, ctx } = input;
  const problems: string[] = [];
  const currency = (row.currency ?? '').toUpperCase();

  if (!currency) {
    problems.push('Choose the currency this country is charged in.');
  } else if (!isValidCurrencyCode(currency)) {
    problems.push(`${currency} is not a recognised ISO 4217 currency code.`);
  }

  const priced = pricedCycles(catalogue, row.code);
  if (priced.length === 0) {
    problems.push(
      'Add at least one visible billing cycle with a price above zero.'
    );
  }

  for (const { cycle, price } of priced) {
    const days = cycle.durationDays;
    if (!days || !Number.isInteger(days) || days < 7) {
      problems.push(
        `The ${cycle.label} cycle must be at least 7 whole days for AutoPay.`
      );
    }
    if (currency && isValidCurrencyCode(currency)) {
      try {
        toMinor(price.amount, currency);
      } catch {
        problems.push(
          `${price.amount} ${currency} on the ${cycle.label} cycle is not a whole number of ${currency} minor units.`
        );
      }
    }
  }

  if (currency && currency !== 'INR' && isValidCurrencyCode(currency)) {
    if (!ctx.razorpayConfigured) {
      problems.push(
        `Razorpay is not configured on this deployment, so ${currency} cannot be charged. Manual UPI accepts INR only.`
      );
    } else if (!ctx.chargeCurrencies.has(currency)) {
      problems.push(
        `${currency} is not enabled for charging on this deployment. Add it to RAZORPAY_CHARGE_CURRENCIES after Razorpay activates International payments.`
      );
    }
  }

  return problems;
}

// ------------------------------------------------------------
// The resolver
// ------------------------------------------------------------

export interface ResolvePricingInput {
  /** The account owner's `profiles.phone`. */
  ownerPhone: string | null | undefined;
  regions: ReadonlyMap<string, PricingRegionRow>;
  catalogue: RegionCatalogue;
  /** Purchase flow this account gets here (resolvePaymentProvider). */
  provider: 'manual_upi' | 'razorpay';
  ctx: ChargeContext;
  /** `subscription_settings.currency`. */
  globalCurrency: string;
  /**
   * The latest live AutoPay mandate in this deployment's mode, if any.
   * `cycleRegion` is the region of its cycle (null when the cycle is gone).
   */
  mandate?: { cycleRegion: string | null; currency: string | null } | null;
}

type Usability =
  { ok: true; currency: string } | { ok: false; reason: PricingRegionReason };

function regionUsability(code: string, input: ResolvePricingInput): Usability {
  const row = input.regions.get(code);
  if (!row) return { ok: false, reason: 'region_not_configured' };
  if (!row.is_enabled) return { ok: false, reason: 'region_disabled' };
  const currency = (row.currency ?? '').toUpperCase();
  if (!currency || pricedCycles(input.catalogue, code).length === 0) {
    return { ok: false, reason: 'region_incomplete' };
  }
  if (currency === 'INR') return { ok: true, currency };
  if (input.provider !== 'razorpay') {
    return { ok: false, reason: 'manual_upi_inr_only' };
  }
  if (!isCurrencyChargeable(currency, input.ctx)) {
    return { ok: false, reason: 'currency_not_chargeable' };
  }
  return { ok: true, currency };
}

export function globalResolution(
  currency: string,
  reason: PricingRegionReason = 'default',
  countryCode: string | null = null,
  source: PricingRegionResolution['source'] = 'fallback'
): PricingRegionResolution {
  return {
    region: GLOBAL_REGION,
    currency: (currency || 'INR').toUpperCase(),
    countryCode,
    source,
    reason,
  };
}

/** Decide the pricing region for one workspace. See the header. */
export function resolvePricingRegion(
  input: ResolvePricingInput
): PricingRegionResolution {
  const globalCurrency = input.globalCurrency || 'INR';
  const country = countryFromPhone(input.ownerPhone);

  // 1. A live mandate keeps the region it was bought in.
  const mandate = input.mandate;
  if (mandate) {
    const pinned =
      mandate.cycleRegion ??
      ((mandate.currency ?? 'INR').toUpperCase() === 'INR'
        ? GLOBAL_REGION
        : null);
    // The mandate charges its own currency whatever Global uses now.
    const mandateCurrency = mandate.currency
      ? mandate.currency.toUpperCase()
      : null;
    if (pinned === GLOBAL_REGION) {
      return {
        ...globalResolution(
          globalCurrency,
          'live_mandate',
          country,
          'subscription'
        ),
        mandateCurrency,
      };
    }
    if (pinned) {
      const usable = regionUsability(pinned, input);
      if (usable.ok) {
        return {
          region: pinned,
          currency: usable.currency,
          countryCode: country,
          source: 'subscription',
          reason: 'live_mandate',
          mandateCurrency,
        };
      }
    }
  }

  // 2. The owner's phone.
  if (!isE164Phone(input.ownerPhone)) {
    return globalResolution(globalCurrency, 'no_phone');
  }
  if (!country) {
    return globalResolution(globalCurrency, 'unknown_dial_code');
  }

  // 3. Only an enabled, complete, chargeable country plan.
  const usable = regionUsability(country, input);
  if (!usable.ok) {
    return globalResolution(globalCurrency, usable.reason, country);
  }
  return {
    region: country,
    currency: usable.currency,
    countryCode: country,
    source: 'phone',
    reason: 'phone_match',
  };
}

/** Plain-language reason, for the super-admin tooltip. */
export function describePricingReason(reason: PricingRegionReason): string {
  switch (reason) {
    case 'phone_match':
      return "Owner's phone country has an enabled localized plan.";
    case 'live_mandate':
      return 'An active AutoPay mandate keeps the pricing it was bought with.';
    case 'no_phone':
      return 'The owner has no phone number in international format.';
    case 'unknown_dial_code':
      return "The owner's dialing code does not match a known country.";
    case 'region_not_configured':
      return "The owner's country has no localized plan.";
    case 'region_disabled':
      return "The owner's country plan is not enabled.";
    case 'region_incomplete':
      return "The owner's country plan has no priced visible cycle.";
    case 'currency_not_chargeable':
      return "The country's currency cannot be charged on this deployment.";
    case 'manual_upi_inr_only':
      return 'This workspace pays by manual UPI, which accepts INR only.';
    case 'lookup_failed':
      return 'Pricing lookup failed, so Global was used.';
    default:
      return 'Global pricing.';
  }
}
