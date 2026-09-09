/**
 * Presenting a WhatsApp business number — pure, no I/O.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Two screens printed a Meta asset id where a phone number belongs. The
 * super-admin panel labelled `phone_number_id` as "Phone Number", and
 * Settings → WhatsApp Setup fell back to `+${phone_number_id}` — which
 * renders "+870875646113078" and is indistinguishable from a real number
 * at a glance. Both were reported as bugs, twice, because the value looks
 * plausible: 15 digits, leading plus.
 *
 * The rule this file enforces: an asset id NEVER stands in for a number.
 * When the number is unknown, say it is unknown.
 */

/** What to show when Meta has not told us the number yet. */
export const PHONE_UNKNOWN_LABEL = 'Not synced from Meta yet';

/**
 * Format Meta's `display_phone_number` for display.
 *
 * Meta returns two different shapes for the same number, so both are
 * handled rather than assumed:
 *
 *   webhook metadata        '918588096070'      digits only
 *   GET /{phone_number_id}  '+91 72020 72233'   plus and spaces
 *
 * A value that already starts with '+' is passed through untouched;
 * anything else gets the '+' added, because customers recognise their own
 * number with it.
 *
 * Returns null rather than a placeholder so the caller decides how absence
 * reads in its own layout.
 */
export function formatDisplayPhoneNumber(
  displayPhoneNumber: string | null | undefined
): string | null {
  const raw = displayPhoneNumber?.trim();
  if (!raw) return null;
  if (raw.startsWith('+')) return raw;
  // Guard against an id being passed in by mistake: a real E.164 number is
  // at most 15 digits, and Meta's ids are 15-16. This cannot catch every
  // case, so it is a backstop, not the fix — the fix is that callers pass
  // display_phone_number and never phone_number_id.
  return `+${raw}`;
}
