/**
 * Template-category gating for marketing suppression — pure logic.
 *
 * Split out of `marketing-opt-out.ts` for the same reason as
 * `opt-out-keywords.ts`: that module imports `MetaApiError` and Supabase's
 * client types, so a client component asking the simple question "does
 * suppression apply to this template?" would pull the whole Meta API layer
 * into the page bundle.
 *
 * The broadcast wizard needs exactly this question answered in the browser
 * so it can tell an operator how many recipients will be skipped BEFORE
 * they press send.
 *
 * Re-exported from `marketing-opt-out.ts` for the existing server-side
 * importers. Client code must import from here.
 */

/**
 * Does this template category count as marketing for suppression?
 *
 * Fails CLOSED on a missing category. `templateRow` is legitimately null
 * in both broadcast paths — a template that exists at Meta but was never
 * synced locally — and in that state the category is unknowable.
 *
 * Fail-closed is cheap because this only ever decides the fate of
 * messages to contacts who explicitly opted out. Recipients who never
 * opted out are unaffected either way, so the cost of the safe choice is
 * one suppressed message to somebody who asked us to stop.
 *
 * Compared case-insensitively: the column is TitleCase ('Marketing') but
 * Meta's own API uses UPPERCASE, and both spellings reach this function.
 */
export function isMarketingCategory(
  category: string | null | undefined
): boolean {
  if (!category) return true;
  return category.trim().toUpperCase() === 'MARKETING';
}

/**
 * Whether the template's category is actually known.
 *
 * Exists so a suppressed send can explain ITSELF honestly. Both a real
 * Marketing template and an unsynced one of unknown category are blocked
 * for an opted-out contact, but the fix differs: the first is working as
 * intended, the second is fixed by running "Sync from Meta". Telling an
 * operator their utility template "is marketing" would send them looking
 * in the wrong place.
 */
export function isTemplateCategoryKnown(
  category: string | null | undefined
): boolean {
  return Boolean(category && category.trim());
}

/**
 * Operator-facing reason a marketing send was withheld. Single source of
 * wording so every send path explains a suppression the same way.
 */
export function marketingSuppressionReason(
  category: string | null | undefined
): string {
  return isTemplateCategoryKnown(category)
    ? 'This contact opted out of marketing messages. Utility and authentication templates can still be sent.'
    : 'This contact opted out of marketing messages, and this template is not synced locally so its category is unknown — it was treated as marketing. Run "Sync from Meta" in Settings if it is actually a utility or authentication template.';
}
