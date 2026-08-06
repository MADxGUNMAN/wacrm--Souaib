// ============================================================
// Payment-submission validation — pure, no I/O.
//
// Validates and NORMALISES the manual UPI payment form. Normalisation
// matters as much as validation here: these fields are typed by hand
// off a banking app screen, then read by a human verifying against a
// bank statement. Consistent shapes (trimmed, uppercased UTR, digits-
// only mobile) make that comparison reliable and make the duplicate-UTR
// index actually catch duplicates.
//
// Note what is deliberately NOT here: the amount to charge. The client
// never supplies `expected_amount` — `resolveQuote` derives it from the
// database. `paidAmount` below is only the payer's own claim about what
// they transferred, kept so an admin can spot a mismatch.
// ============================================================

export class ValidationError extends Error {
  readonly status = 400 as const;
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = 'ValidationError';
  }
}

/** Cleaned, storage-ready payment submission. */
export interface PaymentSubmission {
  planId: string;
  cycleId: string;
  transactionRef: string;
  payerName: string;
  payerMobile: string;
  payerUpiId: string | null;
  payerBank: string | null;
  paidAmount: number;
  paidAt: string | null;
  payerNote: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireUuid(value: unknown, field: string, label: string): string {
  const str = asString(value);
  if (!str) throw new ValidationError(`${label} is required`, field);
  if (!UUID_RE.test(str)) {
    throw new ValidationError(`${label} is not valid`, field);
  }
  return str;
}

/**
 * UTR / transaction reference.
 *
 * Uppercased and stripped of internal whitespace: bank apps present
 * UTRs inconsistently and users paste them with stray spaces. The DB's
 * uniqueness index is on `LOWER(TRIM(...))`, so normalising here means
 * "412 0987 6543" and "41209876543" are recognised as the same payment
 * instead of both being accepted.
 *
 * Length 6-64 spans a 12-digit NEFT/IMPS UTR, a 12-22 char UPI
 * transaction id, and RRNs, without accepting a single stray character.
 */
function parseTransactionRef(value: unknown): string {
  const raw = asString(value).replace(/\s+/g, '').toUpperCase();
  if (!raw) {
    throw new ValidationError(
      'Enter the UTR / transaction ID from your payment app',
      'transactionRef',
    );
  }
  if (raw.length < 6) {
    throw new ValidationError(
      'That UTR looks too short — copy the full transaction ID from your payment app',
      'transactionRef',
    );
  }
  if (raw.length > 64) {
    throw new ValidationError('That UTR is too long', 'transactionRef');
  }
  if (!/^[A-Z0-9\-/]+$/.test(raw)) {
    throw new ValidationError(
      'A UTR contains only letters, numbers, hyphens and slashes',
      'transactionRef',
    );
  }
  return raw;
}

/**
 * Mobile number, reduced to digits (a single leading `+` is dropped
 * along with separators). Stored digits-only so an admin searching for
 * "9876543210" finds a row entered as "+91 98765 43210".
 *
 * Range 7-15 digits covers E.164 worldwide without hardcoding India,
 * since the currency and PSP are admin-configurable.
 */
function parseMobile(value: unknown): string {
  const digits = asString(value).replace(/\D/g, '');
  if (!digits) {
    throw new ValidationError('Enter your mobile number', 'payerMobile');
  }
  if (digits.length < 7 || digits.length > 15) {
    throw new ValidationError(
      'Enter a valid mobile number',
      'payerMobile',
    );
  }
  return digits;
}

/**
 * The amount the payer says they sent.
 *
 * Accepts a string (the form sends one) and tolerates grouping commas
 * and a leading currency symbol, because people type "₹7,560". Rounded
 * to 2dp so a pasted "7560.004" can't create a value that never matches
 * the expected amount on inspection.
 */
function parsePaidAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError('Enter the amount you paid', 'paidAmount');
  }
  const raw =
    typeof value === 'number'
      ? value
      : Number.parseFloat(asString(value).replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(raw)) {
    throw new ValidationError('Enter the amount you paid as a number', 'paidAmount');
  }
  if (raw <= 0) {
    throw new ValidationError('The amount paid must be greater than zero', 'paidAmount');
  }
  if (raw > 100_000_000) {
    throw new ValidationError('That amount is not plausible', 'paidAmount');
  }
  return Math.round(raw * 100) / 100;
}

/**
 * Optional payment timestamp. Rejects a future date (beyond a small
 * clock-skew allowance) because a payment cannot have happened later
 * than now, and a wrong date sends the verifying admin hunting through
 * the wrong day's statement.
 */
function parsePaidAt(value: unknown, now: Date = new Date()): string | null {
  const str = asString(value);
  if (!str) return null;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('That payment date is not valid', 'paidAt');
  }
  const skewMs = 10 * 60 * 1000;
  if (date.getTime() > now.getTime() + skewMs) {
    throw new ValidationError(
      'The payment date cannot be in the future',
      'paidAt',
    );
  }
  // Reject absurdly old dates — almost always a mistyped year.
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  if (date.getTime() < twoYearsAgo.getTime()) {
    throw new ValidationError('That payment date is too far in the past', 'paidAt');
  }
  return date.toISOString();
}

function parseOptionalText(
  value: unknown,
  field: string,
  label: string,
  maxLength: number,
): string | null {
  const str = asString(value);
  if (!str) return null;
  if (str.length > maxLength) {
    throw new ValidationError(
      `${label} must be ${maxLength} characters or fewer`,
      field,
    );
  }
  return str;
}

/**
 * Validate the whole submission. Throws on the FIRST problem, with the
 * offending field name attached so the form can highlight it.
 */
export function parsePaymentSubmission(
  body: unknown,
  now: Date = new Date(),
): PaymentSubmission {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Missing payment details');
  }
  const b = body as Record<string, unknown>;

  const payerName = asString(b.payerName);
  if (!payerName) {
    throw new ValidationError(
      'Enter the account holder name as it appears on the payment',
      'payerName',
    );
  }
  if (payerName.length < 2 || payerName.length > 100) {
    throw new ValidationError(
      'Enter the account holder name (2-100 characters)',
      'payerName',
    );
  }

  return {
    planId: requireUuid(b.planId, 'planId', 'Plan'),
    cycleId: requireUuid(b.cycleId, 'cycleId', 'Billing cycle'),
    transactionRef: parseTransactionRef(b.transactionRef),
    payerName,
    payerMobile: parseMobile(b.payerMobile),
    payerUpiId: parseOptionalText(b.payerUpiId, 'payerUpiId', 'UPI ID', 100),
    payerBank: parseOptionalText(b.payerBank, 'payerBank', 'Bank name', 100),
    paidAmount: parsePaidAmount(b.paidAmount),
    paidAt: parsePaidAt(b.paidAt, now),
    payerNote: parseOptionalText(b.payerNote, 'payerNote', 'Note', 500),
  };
}

/**
 * Parse an admin-supplied duration override on approval.
 *
 * Returns null when the admin didn't override, so the caller falls back
 * to the duration snapshotted on the request.
 */
export function parseDurationOverride(
  body: unknown,
): { months?: number; days?: number } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const rawMonths = b.durationMonths;
  const rawDays = b.durationDays;

  const months =
    rawMonths === null || rawMonths === undefined || rawMonths === ''
      ? null
      : Number(rawMonths);
  const days =
    rawDays === null || rawDays === undefined || rawDays === ''
      ? null
      : Number(rawDays);

  if (days !== null) {
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      throw new ValidationError(
        'Duration in days must be a whole number between 1 and 3650',
        'durationDays',
      );
    }
    return { days };
  }
  if (months !== null) {
    if (!Number.isInteger(months) || months <= 0 || months > 120) {
      throw new ValidationError(
        'Duration in months must be a whole number between 1 and 120',
        'durationMonths',
      );
    }
    return { months };
  }
  return null;
}
