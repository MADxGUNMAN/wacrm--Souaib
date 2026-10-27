/**
 * Contact search helpers.
 *
 * Phone numbers are stored in many shapes ("+222 4855 0082",
 * "+22248550082", "050 675 1025"), so a plain substring match on
 * `phone` misses whenever the user types different spacing than what's
 * stored. For phone-looking input we instead compare digits only against
 * the generated `contacts.phone_normalized` column — the approach CRMs
 * use so "+222 4855 0082", "222-4855-0082" and "48550082" all find the
 * same contact.
 */

/** Only digits and the punctuation people type inside phone numbers. */
const PHONE_LIKE_RE = /^[\d\s+().\-/]+$/;

/**
 * Digits to match against `phone_normalized`, or null when the term
 * isn't a phone search. Leading zeros are dropped so a number typed with
 * a domestic trunk 0 or a 00 international prefix ("0501234567",
 * "00971…") still matches the stored international form.
 */
export function phoneSearchDigits(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || !PHONE_LIKE_RE.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length > 0 ? digits : null;
}

/**
 * Quote a value for a PostgREST `or=(…)` filter so commas, parentheses
 * or quotes in the search box can't break (or inject into) the filter.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Build the `.or()` filter string for a contact search over the given
 * text columns, adding a digits-only `phone_normalized` match when the
 * term looks like a phone number.
 */
export function buildContactSearchFilter(
  term: string,
  columns: readonly string[] = ['name', 'phone', 'email']
): string {
  const trimmed = term.trim();
  const like = quoteFilterValue(`%${trimmed}%`);
  const clauses = columns.map((col) => `${col}.ilike.${like}`);

  const digits = phoneSearchDigits(trimmed);
  if (digits)
    clauses.push(`phone_normalized.like.${quoteFilterValue(`%${digits}%`)}`);

  return clauses.join(',');
}
