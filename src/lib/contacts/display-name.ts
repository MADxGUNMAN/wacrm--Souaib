// ============================================================
// Contact names: the saved one vs the WhatsApp one.
//
// THE BUG THIS FIXES
// An operator renamed contact 917861902341 to "Souaib Ansari". The contact
// then sent a message and the name reverted to "Souaib" — their WhatsApp
// profile name. `findOrCreateContact` in the webhook did:
//
//   if (name && name !== existingContact.name) { update({ name }) }
//
// i.e. every inbound message overwrote whatever the CRM held with whatever
// WhatsApp reported. A deliberate edit survived only until the next reply.
//
// The guard for exactly this already existed — `betterContactName` — but
// only the Coexistence address-book path used it. The live message path,
// which runs far more often, did not.
//
// THE MODEL, copied from WhatsApp itself
// WhatsApp keeps two names per person and shows them differently:
//
//   the name YOU saved       authoritative, never silently changed
//   their own profile name   shown as "~Name" when it differs
//
// So:
//
//   contacts.name             the saved name. User-owned. Only ever
//                             auto-filled while nobody has set it.
//   contacts.wa_profile_name  their WhatsApp profile name, kept fresh from
//                             every inbound message. Display only.
//
// WHERE EACH IS SHOWN
//   conversation list (left)  saved name only — a list is for scanning, and
//                             two names per row halves how many fit
//   thread header / sidebar   "Souaib Ansari ~Souaib", because that is
//                             where you check who you are talking to
//
// When the two are the same — the common case, a contact nobody has renamed
// — there is no suffix. A "~" that merely repeats the name is noise.
// ============================================================

import { isPlaceholderName } from './placeholder-name';

/** The contact fields these helpers read. */
export interface ContactNameFields {
  name?: string | null;
  /** Their WhatsApp profile name. Display only; never authoritative. */
  wa_profile_name?: string | null;
  phone?: string | null;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The name to lead with, everywhere.
 *
 * Saved name first, then the WhatsApp profile name, then the number. The
 * middle step is what makes a brand-new contact read as "Souaib" rather than
 * as a bare number before anyone has saved anything.
 */
export function primaryContactName(
  contact: ContactNameFields,
  fallback = 'Unknown'
): string {
  return (
    clean(contact.name) ??
    clean(contact.wa_profile_name) ??
    clean(contact.phone) ??
    fallback
  );
}

/**
 * The "~Name" part, or null when there is nothing worth adding.
 *
 * Null in three cases, all of which would otherwise produce a suffix that
 * tells the reader nothing:
 *
 *   no profile name           nothing to show
 *   profile name is the       "Souaib ~Souaib"
 *     primary name already
 *   no saved name at all      the profile name IS the primary name, so it is
 *                             already on screen once
 *
 * Comparison is case-insensitive: "souaib ansari" and "Souaib Ansari" are the
 * same person typing the same thing, and surfacing that as a difference is
 * pedantry the operator has to read past every time.
 */
export function whatsappNameSuffix(contact: ContactNameFields): string | null {
  const profile = clean(contact.wa_profile_name);
  if (!profile) return null;

  const saved = clean(contact.name);
  if (!saved) return null;

  if (saved.toLowerCase() === profile.toLowerCase()) return null;

  return profile;
}

/**
 * One string for places that show both, e.g. "Souaib Ansari ~Souaib".
 *
 * Prefer rendering the two parts separately where styling matters — the
 * suffix reads better muted — and use this for titles, tooltips and exports.
 */
export function contactNameWithProfile(
  contact: ContactNameFields,
  fallback = 'Unknown'
): string {
  const primary = primaryContactName(contact, fallback);
  const suffix = whatsappNameSuffix(contact);
  return suffix ? `${primary} ~${suffix}` : primary;
}

// ============================================================
// The write side
// ============================================================

export interface ContactNameUpdate {
  /** Present only when the saved name may be advanced. */
  name?: string;
  /** Present only when the stored profile name is stale. */
  wa_profile_name?: string;
}

/**
 * Decide what an inbound message is allowed to change about a contact's name.
 *
 * Returns null when nothing needs writing, so the caller skips the round trip
 * entirely — which is the common case, since most people's profile name does
 * not change between messages.
 *
 * ─── When the saved name may be auto-advanced ─────────────────────
 *
 * Two cases, and only two:
 *
 *   1. There is no real name yet (blank, or a phone number). Filling it in is
 *      the whole reason we read the profile name.
 *
 *   2. The saved name is EXACTLY the profile name we last recorded. That means
 *      we auto-filled it and nobody has touched it since, so following a
 *      rename on WhatsApp is correct and expected.
 *
 * Anything else means a human chose that name, and it is left alone. This is
 * what makes the flag-free design work: the moment an operator types
 * something different from the profile name, case 2 stops matching and the
 * name is protected from then on. No `name_is_custom` column, and nothing to
 * keep in sync.
 *
 * Existing rows have `wa_profile_name` NULL, so case 2 cannot match and every
 * current name is protected. That is the safe direction to be wrong in: a
 * name that stops tracking WhatsApp is a cosmetic staleness, whereas one that
 * overwrites an operator's edit is data loss they already reported.
 */
export function resolveContactNameUpdate(args: {
  existingName: string | null | undefined;
  existingProfileName: string | null | undefined;
  /** `contacts[0].profile.name` from the webhook payload. */
  incomingProfileName: string | null | undefined;
}): ContactNameUpdate | null {
  const { existingName, existingProfileName, incomingProfileName } = args;

  const incoming = clean(incomingProfileName);
  if (!incoming) return null;

  const update: ContactNameUpdate = {};

  // Always track the profile name, even when it is number-like. It is
  // display-only, so an odd value costs nothing — and recording it is what
  // lets case 2 below work on the NEXT message.
  const storedProfile = clean(existingProfileName);
  if (storedProfile !== incoming) {
    update.wa_profile_name = incoming;
  }

  // A profile name with no letters must never become the saved name; that is
  // how a contact ends up called "+91 97167 47472" twice over.
  if (!isPlaceholderName(incoming)) {
    const saved = clean(existingName);
    const autoFilled =
      storedProfile != null &&
      saved != null &&
      saved.toLowerCase() === storedProfile.toLowerCase();

    if ((isPlaceholderName(saved) || autoFilled) && saved !== incoming) {
      update.name = incoming;
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}
