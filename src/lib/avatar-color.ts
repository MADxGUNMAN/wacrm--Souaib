// ============================================================
// Deterministic colour for an initials avatar.
//
// WHY THIS EXISTS
// WhatsApp does not give us customer profile pictures. Not in the inbound
// message webhook (`contacts[]` carries only `profile.name` and `wa_id`),
// not in the coexistence address-book sync (`full_name`, `first_name`,
// `phone_number`), and there is no Graph edge to look one up — verified
// against the live API, where `/{wa_id}/picture` does not exist as a
// field. The only WhatsApp avatar obtainable is the BUSINESS's own, from
// `/{phone-number-id}/whatsapp_business_profile?fields=profile_picture_url`.
//
// So for contacts, initials are not a placeholder waiting to be replaced —
// they are the final design. Rendering every one of them as the same grey
// circle made a correct UI look like a broken one, which is exactly how it
// got reported. Colour makes them read as deliberate, and gives each row a
// stable visual identity to scan by.
//
// Derived from a stable key rather than stored: a colour that changed when
// someone renamed a contact would undo the only thing this buys us.
// ============================================================

/**
 * Tailwind class pairs, chosen so text stays legible on the tint in both
 * light and dark mode. Ordered arbitrarily — adjacency in this list has no
 * meaning, only the count does.
 */
const PALETTE = [
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
] as const;

/**
 * Pick a colour for `seed`.
 *
 * Pass something that does not change over the contact's life — the row id
 * or the normalised phone number, NOT the display name. A name is the one
 * attribute users edit, and re-colouring an avatar on rename is the sort of
 * flicker that reads as a bug.
 *
 * FNV-1a rather than summing char codes. A plain sum is order-insensitive,
 * so it buckets anagrams together and, worse, spreads poorly over strings
 * that share a character set — which uuids do. FNV spreads evenly:
 * measured across 5,000 uuid-shaped seeds it fills all ten buckets with a
 * 1.13x spread between the largest and smallest.
 *
 * With ten buckets any two given contacts still share a colour about a
 * tenth of the time. That is inherent to a small palette, not a defect —
 * the goal is that a contact keeps ONE colour for life, not that colours
 * are unique.
 */
export function avatarColor(seed: string | null | undefined): string {
  if (!seed) return PALETTE[0];

  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    // 16777619, via shifts to stay in 32-bit int range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return PALETTE[hash % PALETTE.length];
}

/**
 * Up to two initials from a display name, falling back to a digit-safe
 * character so a contact known only by phone number still renders
 * something.
 *
 * Emoji and other astral characters are skipped rather than sliced: taking
 * `[0]` of a surrogate pair yields half a code point, which renders as a
 * replacement glyph. A name that is only an emoji is common enough on
 * WhatsApp to be worth handling.
 */
export function avatarInitials(
  name: string | null | undefined,
  fallback = '#'
): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Keep only words starting with a letter or digit, so "🎉" or "(work)"
    // does not become the initial.
    .filter((w) => /^[\p{L}\p{N}]/u.test(w));

  if (words.length === 0) return fallback;

  const first = [...words[0]][0] ?? '';
  const second = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : '';

  return (first + second).toUpperCase();
}
