// ============================================================
// Minor-unit conversion — the one place a rupee becomes paise.
//
// Razorpay amounts are integers in the currency's smallest unit. The
// catalogue stores NUMERIC(12,2) major units. Converting with plain
// `amount * 100` silently produces 98999.99999 for 989.99999…, so this
// rounds to the nearest minor unit and REFUSES values that are not a
// whole number of minor units rather than quietly charging a different
// amount.
// ============================================================

/** Exponents for currencies Razorpay documents as non-2-decimal. */
const EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  UGX: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function normaliseCurrency(currency: string): string {
  const c = (currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c))
    throw new MoneyError(`Invalid currency code: ${currency}`);
  return c;
}

export function currencyExponent(currency: string): number {
  return EXPONENTS[normaliseCurrency(currency)] ?? 2;
}

/** 990 INR -> 99000. Throws for negatives, NaN, or sub-minor fractions. */
export function toMinor(amount: number, currency: string): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new MoneyError(`Invalid amount: ${amount}`);
  }
  const factor = 10 ** currencyExponent(currency);
  const scaled = amount * factor;
  const rounded = Math.round(scaled);
  // Allow float noise (990.1 * 100 = 99010.00000000001) but nothing more.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new MoneyError(
      `${amount} ${currency} is not a whole number of minor units`
    );
  }
  if (!Number.isSafeInteger(rounded))
    throw new MoneyError(`Amount too large: ${amount}`);
  return rounded;
}

/** 99000 INR -> 990. */
export function fromMinor(minor: number, currency: string): number {
  if (!Number.isSafeInteger(minor))
    throw new MoneyError(`Invalid minor amount: ${minor}`);
  return minor / 10 ** currencyExponent(currency);
}
