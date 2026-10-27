// ============================================================
// Global (Universal) currency change: pure rules, no I/O.
//
// Report: docs/razopay/localized-pricing-report.md, section 12.
//
// Global is the fallback plan for every workspace, so its currency must
// always be chargeable by every workspace that can land on it:
//   - INR is always allowed (UPI and Razorpay both charge it). It is also
//     the rollback path.
//   - Any other currency is allowed only when every workspace on this
//     deployment pays by AutoPay (DB flag `razorpay` and no test allowlist
//     or live pilot list), because manual UPI accepts INR only, and only
//     when Razorpay is configured here and the code is listed in
//     RAZORPAY_CHARGE_CURRENCIES.
//
// Global prices are plain numbers with no currency of their own, so a
// change must carry a new price for every Global price row. The checks
// here give readable messages; `fn_change_global_currency` is the
// authority under concurrency.
//
// Safe for client components: imports only pure modules (the provider
// import is type-only and erased).
// ============================================================

import { toMinor } from '@/lib/billing/razorpay/money';
import type { ManualIntake } from '@/lib/billing/razorpay/provider';

import {
  isCurrencyChargeable,
  isValidCurrencyCode,
  type ChargeContext,
} from './regions';

/** One Global `subscription_plan_prices` row, as the change dialog shows it. */
export interface GlobalPriceRow {
  planId: string;
  planName: string;
  planVisible: boolean;
  cycleId: string;
  cycleLabel: string;
  cycleVisible: boolean;
  durationDays: number | null;
  months: number;
  amount: number;
  perDayAmount: number | null;
  compareAtAmount: number | null;
  priceVisible: boolean;
}

/** One new price, as sent to the route and to the database function. */
export interface GlobalPriceInput {
  plan_id: string;
  cycle_id: string;
  amount: number;
  per_day_amount: number | null;
}

export interface GlobalCurrencyContext {
  ctx: ChargeContext;
  /** `subscription_settings.payment_provider`. */
  settingsProvider: string | null;
  /** resolveManualIntake for this deployment. */
  manualIntake: ManualIntake;
}

export type GlobalCurrencyCode =
  | 'invalid_currency'
  | 'unchanged'
  | 'manual_upi_inr_only'
  | 'currency_not_chargeable';

export interface GlobalCurrencyRefusal {
  code: GlobalCurrencyCode;
  status: 400 | 409;
  message: string;
}

export const GLOBAL_PRICES_REQUIRED_MESSAGE =
  'Enter the new price of every Global billing cycle before changing the currency.';

export const GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE =
  'One of the prices does not belong to a Global billing cycle. Reload the page and try again.';

export const GLOBAL_CATALOGUE_CHANGED_MESSAGE =
  'Global prices or billing cycles changed while you were editing. Reload the page and try again.';

export const GLOBAL_INVALID_AMOUNT_MESSAGE =
  'One of the new prices is not valid. Check the amounts and try again.';

export const GLOBAL_SETTINGS_MISSING_MESSAGE =
  'The subscription settings row is missing. Nothing was changed.';

export const GLOBAL_MIGRATION_REQUIRED_MESSAGE =
  'Changing the Global currency needs the database function from migration 20261028000000_global_currency_change.sql, which is not applied yet. Nothing was changed.';

export function globalCurrencyStaleMessage(stored: string): string {
  return `The Global currency changed to ${stored} since this page loaded. Reload the page and try again.`;
}

export function globalCurrencyUnchangedMessage(currency: string): string {
  return `The Global currency is already ${currency}.`;
}

const MAX_AMOUNT = 9_999_999_999;

/**
 * Why `currency` cannot be the Global currency on this deployment, or
 * null when it can. INR is always allowed.
 */
export function globalCurrencyRefusal(
  currency: string,
  c: GlobalCurrencyContext
): GlobalCurrencyRefusal | null {
  const cur = (currency ?? '').trim().toUpperCase();
  if (cur === 'INR') return null;
  if (c.settingsProvider !== 'razorpay' || c.manualIntake === 'open') {
    return {
      code: 'manual_upi_inr_only',
      status: 409,
      message:
        'Workspaces on this deployment pay by manual UPI, which accepts INR only, so the Global currency must stay INR.',
    };
  }
  if (c.manualIntake === 'partial') {
    return {
      code: 'manual_upi_inr_only',
      status: 409,
      message:
        'Some workspaces on this deployment still pay by manual UPI (the Razorpay test allowlist or the live pilot list decides who gets AutoPay), and UPI accepts INR only. Global is the fallback for every workspace, so its currency can change only on a deployment where every workspace pays by AutoPay.',
    };
  }
  if (!c.ctx.razorpayConfigured) {
    return {
      code: 'currency_not_chargeable',
      status: 409,
      message: `Razorpay is not configured on this deployment, so ${cur} cannot be charged. Global must always be chargeable.`,
    };
  }
  if (!isCurrencyChargeable(cur, c.ctx)) {
    return {
      code: 'currency_not_chargeable',
      status: 409,
      message: `${cur} is not enabled for charging on this deployment. Add it to RAZORPAY_CHARGE_CURRENCIES after Razorpay activates International payments.`,
    };
  }
  return null;
}

/** Every check for moving Global from `current` to `next`, in order. */
export function checkGlobalCurrencyChange(
  input: { current: string; next: string } & GlobalCurrencyContext
): GlobalCurrencyRefusal | null {
  const next = (input.next ?? '').trim().toUpperCase();
  const current = (input.current ?? '').trim().toUpperCase();
  if (!isValidCurrencyCode(next)) {
    return {
      code: 'invalid_currency',
      status: 400,
      message: 'Enter a 3-letter ISO 4217 currency code, for example USD.',
    };
  }
  if (next === current) {
    return {
      code: 'unchanged',
      status: 400,
      message: globalCurrencyUnchangedMessage(current),
    };
  }
  return globalCurrencyRefusal(next, input);
}

/** Currencies Global may use on this deployment. INR first. */
export function allowedGlobalCurrencies(c: GlobalCurrencyContext): string[] {
  const codes = [
    'INR',
    ...[...c.ctx.chargeCurrencies].map((x) => x.toUpperCase()).sort(),
  ];
  return [...new Set(codes)].filter(
    (code) => globalCurrencyRefusal(code, c) === null
  );
}

/**
 * Parse a money value typed by the admin: a number, or a string with any
 * grouping separator or symbol stripped ("₹1,200" -> 1200). Rounded to 2
 * decimals, like the prices route. Null when blank or not a number.
 */
export function parseMoneyInput(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** "Monthly", or "Starter · Monthly" when the row is not the sold plan. */
export function globalPriceRowLabel(
  row: Pick<GlobalPriceRow, 'planId' | 'planName' | 'cycleLabel'>,
  soldPlanId: string | null
): string {
  return soldPlanId && row.planId !== soldPlanId
    ? `${row.planName} · ${row.cycleLabel}`
    : row.cycleLabel;
}

/** The plan customers buy: the first visible plan in row order. */
export function soldPlanIdOf(rows: readonly GlobalPriceRow[]): string | null {
  return rows.find((r) => r.planVisible)?.planId ?? rows[0]?.planId ?? null;
}

function isRepresentable(amount: number, currency: string): boolean {
  try {
    toMinor(amount, currency);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check the submitted prices against the required Global rows. Every
 * problem is collected so the admin can fix them in one pass.
 */
export function validateGlobalPriceInputs(
  required: readonly GlobalPriceRow[],
  submitted: unknown,
  currency: string
):
  { ok: true; prices: GlobalPriceInput[] } | { ok: false; problems: string[] } {
  const cur = currency.trim().toUpperCase();
  const problems: string[] = [];
  const key = (planId: string, cycleId: string) => `${planId}:${cycleId}`;
  const requiredKeys = new Set(required.map((r) => key(r.planId, r.cycleId)));

  const byKey = new Map<string, Record<string, unknown>>();
  let foreign = false;
  if (!Array.isArray(submitted)) {
    // Missing means "no prices entered"; anything else is a bad request.
    foreign = submitted != null;
  } else {
    for (const item of submitted) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as Record<string, unknown>).plan_id !== 'string' ||
        typeof (item as Record<string, unknown>).cycle_id !== 'string'
      ) {
        foreign = true;
        continue;
      }
      const it = item as Record<string, unknown>;
      const k = key(String(it.plan_id), String(it.cycle_id));
      if (!requiredKeys.has(k) || byKey.has(k)) {
        foreign = true;
        continue;
      }
      byKey.set(k, it);
    }
  }
  if (foreign) problems.push(GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE);

  const sold = soldPlanIdOf(required);
  const prices: GlobalPriceInput[] = [];
  for (const row of required) {
    const label = globalPriceRowLabel(row, sold);
    const item = byKey.get(key(row.planId, row.cycleId));
    const rawAmount = item?.amount;
    const blank =
      rawAmount === undefined ||
      rawAmount === null ||
      (typeof rawAmount === 'string' && rawAmount.trim() === '');
    if (blank) {
      problems.push(`Enter the new ${label} price in ${cur}.`);
      continue;
    }
    const amount = parseMoneyInput(rawAmount);
    if (amount === null || !(amount > 0)) {
      problems.push(`The new ${label} price must be a number above zero.`);
      continue;
    }
    if (amount > MAX_AMOUNT) {
      problems.push(`The new ${label} price is too large.`);
      continue;
    }
    if (!isRepresentable(amount, cur)) {
      problems.push(
        `${amount} ${cur} on the ${label} cycle is not a whole number of ${cur} minor units.`
      );
      continue;
    }

    let perDay: number | null = null;
    const rawPerDay = item?.per_day_amount;
    const perDayBlank =
      rawPerDay === undefined ||
      rawPerDay === null ||
      (typeof rawPerDay === 'string' && rawPerDay.trim() === '');
    if (!perDayBlank) {
      perDay = parseMoneyInput(rawPerDay);
      if (
        perDay === null ||
        !(perDay > 0) ||
        perDay > amount ||
        !isRepresentable(perDay, cur)
      ) {
        problems.push(
          `The ${label} daily rate must be above zero and no more than the total, or left blank.`
        );
        continue;
      }
    }

    prices.push({
      plan_id: row.planId,
      cycle_id: row.cycleId,
      amount,
      per_day_amount: perDay,
    });
  }

  return problems.length ? { ok: false, problems } : { ok: true, prices };
}
