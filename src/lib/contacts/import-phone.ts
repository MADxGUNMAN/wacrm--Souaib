/**
 * Phone clean-up for CSV contact import.
 *
 * The rule is "keep what the sheet says": a number written with a
 * country code (`+CC …` or `00CC …`) is stored as E.164 with that exact
 * code, and a number without one is kept as entered and flagged — we
 * never guess a country, because a guess silently turns a foreign
 * number into a wrong one.
 */

export type ImportPhoneStatus = 'international' | 'local' | 'invalid';

export interface CleanedImportPhone {
  /** Value to store in `contacts.phone` (empty when invalid). */
  phone: string;
  status: ImportPhoneStatus;
  /** Why the value was rejected (only for `invalid`). */
  reason?: 'scientific-notation' | 'too-short' | 'too-long';
}

/** Trailing extension: "ext. 123", "ext 123", "int. 2", "x 45", "#12". */
const EXTENSION_RE =
  /\s*[,;]?\s*(?:ext(?:ension)?|int|x|#)\.?\s*[:#]?\s*\d+\s*$/i;

/** Spreadsheet-mangled numbers like "2.14E+11" — the digits are lost. */
const SCIENTIFIC_RE = /^\d+(?:[.,]\d+)?e\+?\d+$/i;

/** E.164 allows at most 15 digits including the country code. */
const MAX_E164_DIGITS = 15;
/** Shortest real international number (country code + subscriber). */
const MIN_INTERNATIONAL_DIGITS = 7;
/** Shortest local number worth keeping (e.g. "800 698"). */
const MIN_LOCAL_DIGITS = 5;

export function cleanImportPhone(raw: string): CleanedImportPhone {
  let value = raw.replace(/["']/g, '').trim();

  if (SCIENTIFIC_RE.test(value)) {
    return { phone: '', status: 'invalid', reason: 'scientific-notation' };
  }

  value = value.replace(EXTENSION_RE, '');
  // Drop anything that isn't part of a written phone number (mis-encoded
  // characters, letters), then tidy the spacing.
  value = value
    .replace(/[^\d+\s().\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isPlus = value.startsWith('+');
  // "+44 (0)20 …": the bracketed trunk 0 is not dialled internationally.
  if (isPlus) value = value.replace(/\(\s*0\s*\)/g, '');
  const digits = value.replace(/\D/g, '');
  const isDoubleZero = !isPlus && /^00[1-9]/.test(digits);

  if (isPlus || isDoubleZero) {
    const e164Digits = isDoubleZero ? digits.slice(2) : digits;
    if (e164Digits.length < MIN_INTERNATIONAL_DIGITS) {
      return { phone: '', status: 'invalid', reason: 'too-short' };
    }
    if (e164Digits.length > MAX_E164_DIGITS) {
      return { phone: '', status: 'invalid', reason: 'too-long' };
    }
    return { phone: `+${e164Digits}`, status: 'international' };
  }

  if (digits.length < MIN_LOCAL_DIGITS) {
    return { phone: '', status: 'invalid', reason: 'too-short' };
  }
  if (digits.length > MAX_E164_DIGITS) {
    return { phone: '', status: 'invalid', reason: 'too-long' };
  }
  return { phone: value, status: 'local' };
}
