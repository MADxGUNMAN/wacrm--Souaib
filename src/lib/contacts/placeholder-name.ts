/**
 * Is a contact's name a placeholder rather than a real name?
 *
 * ─── Why this exists ──────────────────────────────────────────
 *
 * Several paths create a contact before anyone knows what it is called,
 * and they all fall back to the phone number:
 *
 *   - `findOrCreateContact` in the webhook does `name: name || phone`
 *   - coexistence `history` ingestion passes '' because the history
 *     payload carries no name at all
 *   - the coexistence import does `full_name || first_name || phone`
 *
 * So a coexistence inbox fills up with rows labelled "919716747472".
 * Later, `smb_app_state_sync` delivers the real name — but only an
 * *upgrade* is wanted. Overwriting a name a human typed, or one that came
 * from a live message's WhatsApp profile, would be worse than the problem:
 * the phone's address book is not more authoritative than a person.
 *
 * This is the test for "there is nothing here worth keeping".
 *
 * ─── The rule ─────────────────────────────────────────────────
 *
 * A name is a placeholder when it is blank, or when it contains no
 * letters. That catches every shape the fallbacks produce —
 * `919716747472`, `+91 97167 47472`, `(919) 716-7472` — without needing
 * to know which phone number the contact has, and without a brittle list
 * of formats.
 *
 * `\p{L}` rather than `[a-zA-Z]` on purpose: this app's contacts are
 * largely Indian and Gulf numbers, so names in Devanagari, Arabic or
 * Malayalam script are ordinary. An ASCII-only test would classify
 * "सब्ज़ी वाला" as a placeholder and let the phone number overwrite a
 * perfectly good name.
 *
 * Kept deliberately in step with the SQL in
 * `20260824000000_coexistence_contact_names.sql`, which uses
 * `name !~ '[[:alpha:]]'` for the same decision. If one changes, change
 * both — a backfill and the live path disagreeing about what counts as a
 * real name is the kind of drift that is invisible until it is not.
 */
export function isPlaceholderName(
  name: string | null | undefined
): boolean {
  if (name == null) return true;
  const trimmed = name.trim();
  if (trimmed === '') return true;
  return !/\p{L}/u.test(trimmed);
}

/**
 * Pick the better of two names for the same contact.
 *
 * Returns null when the existing name should be left alone, or the new
 * name when it is a genuine improvement — so callers can treat null as
 * "no write needed" and skip the round trip entirely.
 *
 * Only ever upgrades placeholder → real. It will not replace one real
 * name with another, which is what stops an address-book sync from
 * renaming a contact an agent has already corrected.
 */
export function betterContactName(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  if (incoming == null) return null;
  const candidate = incoming.trim();
  if (candidate === '' || isPlaceholderName(candidate)) return null;
  if (!isPlaceholderName(existing)) return null;
  if (existing != null && existing.trim() === candidate) return null;
  return candidate;
}
