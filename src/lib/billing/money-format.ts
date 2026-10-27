// ============================================================
// Money formatting for platform billing screens (pure).
//
// Platform billing is INR. `formatCurrency` in src/lib/currency.ts is
// the CRM deal-value formatter: it defaults to USD and follows the
// browser locale, so a ₹9,000 AutoPay charge rendered "$9,000" on the
// Activity log and the same ₹45,150 could show Western or Indian digit
// grouping depending on the machine. Every billing amount goes through
// one of the two functions below instead: the row's own currency,
// defaulting to INR, always en-IN grouping.
// ============================================================

import { formatCurrency } from '@/lib/currency';

import { currencyExponent, fromMinor } from './razorpay/money';

/** The currency of every platform plan, Razorpay and manual UPI alike. */
export const PLATFORM_BILLING_CURRENCY = 'INR';

function normalise(currency: string | null | undefined): string {
  return (currency || PLATFORM_BILLING_CURRENCY).trim().toUpperCase();
}

/** "XYZ 1,234" for a code `Intl` refuses, so a bad row never crashes. */
function fallback(code: string, major: number): string {
  return `${code} ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(major)}`;
}

function format(major: number, code: string, exponent: number): string {
  const digits = Number.isInteger(major) ? 0 : exponent;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return fallback(code, major);
  }
}

function exponentFor(code: string): number {
  try {
    return currencyExponent(code);
  } catch {
    return 2;
  }
}

/** 99950 INR -> "₹999.50"; 900000 -> "₹9,000". "—" for null. */
export function formatMoneyMinor(
  minor: number | null | undefined,
  currency?: string | null
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) {
    return '—';
  }
  const code = normalise(currency);
  const exponent = exponentFor(code);
  let major: number;
  try {
    major = fromMinor(Math.round(minor), code);
  } catch {
    major = Math.round(minor) / 10 ** exponent;
  }
  return format(major, code, exponent);
}

/**
 * Plan prices on the pricing pages, the plan editor and checkout.
 *
 * INR is delegated to `formatCurrency(amount, 'INR')` unchanged, so every
 * Global (INR) price renders exactly as before localized pricing. Other
 * currencies use en-US grouping and keep minor digits when the amount is
 * not whole: $60 stays "$60" and $1.99 stays "$1.99" (whole-unit rounding
 * would show "$2", a price nobody is charged).
 */
export function formatPlanAmount(
  amount: number,
  currency?: string | null
): string {
  const code = normalise(currency);
  const value = Number(amount) || 0;
  if (code === 'INR') return formatCurrency(value, 'INR');
  const digits = Number.isInteger(value) ? 0 : exponentFor(code);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${code} ${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(value)}`;
  }
}

/**
 * 9000 INR -> "₹9,000"; 4515000 -> "₹45,15,000" (Indian grouping);
 * 990.5 -> "₹990.50". For NUMERIC major-unit columns such as
 * subscription_events.amount and payment_requests.paid_amount.
 */
export function formatMoneyMajor(
  amount: number | string | null | undefined,
  currency?: string | null
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const major = Number(amount);
  if (!Number.isFinite(major)) return '—';
  const code = normalise(currency);
  return format(major, code, exponentFor(code));
}
