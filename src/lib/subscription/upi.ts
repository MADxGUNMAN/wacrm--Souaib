// ============================================================
// UPI deep link + QR generation.
//
// A UPI QR is nothing more than a QR encoding of a `upi://pay?…` URI.
// The amount is a parameter in that URI, so "the QR asks for ₹2,000"
// is entirely a function of what we put in `am=`. Since callers get
// that number from `resolveQuote` (a live DB read), changing a price in
// the super admin panel changes the next QR with no cache to bust.
//
// Spec notes that actually bite in practice:
//   - `am` must be a bare decimal with a dot: "2000.00". Any grouping
//     separator, currency symbol, or comma makes UPI apps either reject
//     the intent or silently drop to "enter amount yourself" — which
//     defeats the whole point of a fixed-amount QR.
//   - `pa` (payee VPA) and `pn` (payee name) are mandatory in practice;
//     several apps refuse an intent with a blank `pn`.
//   - `tn` (note) and `tr` (reference) are length-capped by many PSPs.
//     We truncate rather than let a long plan name corrupt the payload.
//   - Everything must be percent-encoded. `encodeURIComponent` is
//     correct here EXCEPT that it leaves `'`, `!`, `(`, `)`, `*`
//     unescaped; those are legal in a query value, so it's fine.
// ============================================================

import QRCode from 'qrcode';

/** PSP-safe caps. Chosen conservatively — the shortest limits observed
 *  across major Indian PSPs, rather than the spec maximums. */
const MAX_NOTE_LENGTH = 50;
const MAX_REF_LENGTH = 35;
const MAX_PAYEE_NAME_LENGTH = 50;

export interface UpiUriParams {
  /** Payee VPA, e.g. "merchant@okhdfcbank". */
  upiId: string;
  /** Payee display name shown in the payer's UPI app. */
  payeeName: string;
  /** Exact amount to request. Rendered with 2 decimal places. */
  amount: number;
  /** ISO-4217. UPI settles INR only; kept a parameter for correctness. */
  currency?: string;
  /** Human note shown in the payer's app. Truncated to 50 chars. */
  note?: string | null;
  /** Merchant reference id. Truncated to 35 chars, alphanumerics only. */
  reference?: string | null;
}

export class UpiConfigError extends Error {
  readonly status = 503 as const;
  constructor(message: string) {
    super(message);
    this.name = 'UpiConfigError';
  }
}

/**
 * Loose VPA validation: `handle@psp`.
 *
 * Deliberately permissive — PSP handles vary widely and an overly
 * strict pattern would reject a legitimate operator's ID and block all
 * payments. This catches the realistic operator mistakes (pasting a
 * phone number, an email with no PSP, leaving the field as a
 * placeholder) rather than trying to be authoritative.
 */
export function isValidUpiId(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  return /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9.\-_]{1,}$/.test(trimmed);
}

/** Strip characters PSPs reject in a reference id. */
function sanitiseReference(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, MAX_REF_LENGTH);
}

/**
 * Collapse a note to something a PSP will carry: no newlines, no
 * double spaces, capped length. UPI notes also choke on some
 * punctuation, so keep it to a safe subset.
 */
function sanitiseNote(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-zA-Z0-9 .\-_/]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_NOTE_LENGTH);
}

/**
 * Format the amount for `am=`.
 *
 * Always two decimals, always a dot, never grouped. Guards against
 * NaN/Infinity/negatives, any of which would produce a malformed
 * intent that some apps "helpfully" reinterpret as an open amount.
 */
export function formatUpiAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new UpiConfigError('Cannot build a payment request for a zero amount');
  }
  // Round to paise first so floating point can't emit 2799.9999999.
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * Build the `upi://pay?…` deep link. This exact string is what gets
 * QR-encoded, and also what the "Pay from this device" link opens on
 * mobile.
 */
export function buildUpiUri(params: UpiUriParams): string {
  const upiId = params.upiId?.trim();
  if (!isValidUpiId(upiId)) {
    throw new UpiConfigError(
      'No valid UPI ID is configured. Ask the platform admin to set one before accepting payments.',
    );
  }

  const payeeName = (params.payeeName || '').trim().slice(0, MAX_PAYEE_NAME_LENGTH);
  if (!payeeName) {
    throw new UpiConfigError('No UPI payee name is configured');
  }

  const query: string[] = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    `am=${encodeURIComponent(formatUpiAmount(params.amount))}`,
    `cu=${encodeURIComponent(params.currency || 'INR')}`,
  ];

  const note = params.note ? sanitiseNote(params.note) : '';
  if (note) query.push(`tn=${encodeURIComponent(note)}`);

  const reference = params.reference ? sanitiseReference(params.reference) : '';
  if (reference) query.push(`tr=${encodeURIComponent(reference)}`);

  return `upi://pay?${query.join('&')}`;
}

/**
 * Render a URI as inline SVG QR markup.
 *
 * SVG rather than a PNG data URL: it stays crisp at any size, is a
 * fraction of the bytes, and needs no `<img>` round trip. Error
 * correction level M is the usual choice for payment QRs — tolerates
 * a scuffed phone screen without inflating the module count.
 *
 * `margin: 1` keeps the quiet zone minimal since the surrounding card
 * already provides visual padding; some scanners need a non-zero one.
 */
export async function generateQrSvg(uri: string): Promise<string> {
  return QRCode.toString(uri, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    // Omit width so the SVG scales to its container via viewBox rather
    // than being locked to a pixel size.
  });
}

/**
 * A short, human-recognisable reference to stamp on the payment.
 *
 * Shape: `RPL<plan><cycle><account-prefix>` capped at 35 alphanumerics.
 * It shows up in the payer's UPI history and in our own record, giving
 * the verifying admin a second signal beyond the UTR when a payer
 * mistypes it. Not a security token — it's a convenience label, and it
 * is never trusted for matching.
 */
export function buildReferenceNote(input: {
  accountId: string;
  planName: string;
  cycleLabel: string;
}): string {
  const plan = input.planName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const cycle = input.cycleLabel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4);
  const acct = input.accountId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return sanitiseReference(`RPL${plan}${cycle}${acct}`.toUpperCase());
}

/** The `tn=` note: what the payer sees in their UPI app. */
export function buildPaymentNote(input: {
  planName: string;
  cycleLabel: string;
}): string {
  return sanitiseNote(`${input.planName} ${input.cycleLabel} subscription`);
}
