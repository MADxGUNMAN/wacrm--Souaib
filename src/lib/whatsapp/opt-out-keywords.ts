/**
 * Opt-out keywords, payloads and matching — as pure data and pure logic.
 *
 * ─── Why this is separate from marketing-opt-out.ts ───────────────
 *
 * `marketing-opt-out.ts` imports `MetaApiError` and Supabase's client
 * types, so anything importing it lands the Meta API layer in the bundle.
 * That is fine for the send paths, which are server-only. It is not fine
 * for the Settings panel or the template wizard, which need to KNOW what
 * the opt-out word is so they can label a button and explain a rule.
 *
 * Everything here is a string, a number or a pure function over strings.
 * No imports at all, deliberately — the file cannot acquire a server-only
 * dependency by accident.
 *
 * Same reasoning as `template-limits.ts` versus `template-validators.ts`,
 * and the same rule applies: CLIENT COMPONENTS MUST IMPORT FROM HERE.
 *
 * Unlike template-limits, these names ARE re-exported from
 * `marketing-opt-out.ts`. That is a deliberate difference: twelve
 * server-side modules already import them from there, and breaking those
 * paths would be churn with no safety benefit. The re-export is not what
 * caused the earlier client-bundle problem — importing the server module
 * from a client component was. So: server code may use either path,
 * client code must use this one.
 */

export const DEFAULT_OPT_OUT_KEYWORDS = ['STOP'] as const;
export const DEFAULT_OPT_IN_KEYWORDS = ['START'] as const;

export const DEFAULT_OPT_OUT_RESPONSE =
  'You have been opted out. Reply START to opt in again.';
export const DEFAULT_OPT_IN_RESPONSE =
  'Thank you for opting in to our messages. Reply STOP to opt out at any time.';

/**
 * Editing limits, shared by the Settings panel and the route that saves
 * it so the two cannot disagree about what is acceptable.
 *
 * These are typo guards, not product limits. A keyword is a single word a
 * customer types, so 32 characters is already generous; ten of them is
 * more than any real business needs.
 */
export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 32;
/**
 * Confirmation-message ceiling. Well under WhatsApp's 4096-character text
 * limit — a confirmation that needs more than this is not a confirmation.
 */
export const MAX_RESPONSE_MESSAGE_LENGTH = 1024;

/** Offered in the Settings UI as one-tap additions. */
export const SUGGESTED_OPT_OUT_KEYWORDS = [
  'STOP',
  'CANCEL',
  'UNSUBSCRIBE',
  'END',
  'QUIT',
] as const;
export const SUGGESTED_OPT_IN_KEYWORDS = [
  'JOIN',
  'START',
  'SUBSCRIBE',
  'YES',
  'CONFIRM',
] as const;

/**
 * Reserved button payloads — the reliable half of button-based opt-out.
 *
 * A tapped button is matched on its PAYLOAD as well as its visible label,
 * and before these existed the payload had to equal one of the account's
 * keywords by coincidence. That made a correct-looking button silently
 * inert: label it "Unsubscribe" while the keyword list says STOP, or
 * translate it to "Detener", and the tap did nothing. The customer gets
 * no confirmation, concludes they are being ignored, and blocks the
 * number — the precise outcome this feature exists to avoid.
 *
 * These are matched IN ADDITION to the configured keywords, so a button
 * carrying one works whatever it is labelled and in any language.
 *
 * Upper-case with an inner underscore on purpose: `normalizeInboundText`
 * strips surrounding punctuation but never inner characters, so these
 * survive normalization unchanged, and the prefix makes a collision with
 * something a human would actually type implausible.
 */
export const RESERVED_OPT_OUT_PAYLOAD = 'REPLAI_OPT_OUT';
export const RESERVED_OPT_IN_PAYLOAD = 'REPLAI_OPT_IN';

/**
 * The label suggested for a one-tap opt-out button in the template
 * wizard.
 *
 * Deliberately equal to the first default keyword once upper-cased, so
 * the button also works through the plain keyword path — belt and braces
 * for a template approved before reserved payloads existed, or sent by a
 * path that does not attach an explicit payload.
 */
export const SUGGESTED_OPT_OUT_BUTTON_LABEL = 'Stop';
/** Label for the re-subscribe button on the opt-out confirmation. */
export const SUGGESTED_OPT_IN_BUTTON_LABEL = 'Resubscribe';

/**
 * Canonical stored form of a keyword: trimmed and UPPERCASE.
 *
 * The DB cannot enforce this — a CHECK constraint may not contain the
 * subquery an array-wide `upper()` test would need — so this function is
 * the enforcement point. Every write path must run keywords through it.
 */
export function normalizeKeyword(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Normalize, drop blanks, de-duplicate, preserve first-seen order. */
export function normalizeKeywordList(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const keyword = normalizeKeyword(candidate);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push(keyword);
  }
  return out;
}

/**
 * Reduce an inbound message to the token we compare against keywords.
 *
 * Trims, strips surrounding punctuation and quotes, and upper-cases —
 * so "stop", " STOP ", "STOP." and "*STOP*" all reduce to STOP. Inner
 * characters are untouched, so this cannot merge two words into one.
 */
export function normalizeInboundText(text: string): string {
  return text
    .trim()
    .replace(/^[\s"'`*_~(<[{.,!¡¿?-]+/u, '')
    .replace(/[\s"'`*_~)>\]}.,!¡¿?-]+$/u, '')
    .trim()
    .toUpperCase();
}

/**
 * Whole-message keyword match.
 *
 * Substring matching is WRONG here and this is the reason detection is
 * not built on the `keyword_match` automation trigger, whose `contains`
 * mode has no word-boundary handling: "please don't stop sending these"
 * and "stop by tomorrow" both contain "stop", and opting those
 * customers out against their wishes is precisely the harm this feature
 * is meant to prevent.
 */
export function matchesKeyword(
  text: string | null | undefined,
  keywords: readonly string[]
): boolean {
  if (!text) return false;
  const candidate = normalizeInboundText(text);
  if (!candidate) return false;
  return keywords.some((keyword) => normalizeKeyword(keyword) === candidate);
}

/** True when a tapped button's payload is the reserved opt-out value. */
export function isReservedOptOutPayload(
  payload: string | null | undefined
): boolean {
  return matchesKeyword(payload, [RESERVED_OPT_OUT_PAYLOAD]);
}

/** True when a tapped button's payload is the reserved opt-in value. */
export function isReservedOptInPayload(
  payload: string | null | undefined
): boolean {
  return matchesKeyword(payload, [RESERVED_OPT_IN_PAYLOAD]);
}

/**
 * Would this button label, on its own, register as an opt-out?
 *
 * Used by the template wizard to warn that a Marketing template's
 * quick-reply button says something opt-out-ish ("Unsubscribe me") that
 * the account's keyword list will not actually match. The answer is only
 * about the LABEL — a button also carrying a reserved payload works
 * regardless, which is why the wizard offers to add one rather than
 * merely complaining.
 */
export function labelMatchesOptOutKeyword(
  label: string | null | undefined,
  keywords: readonly string[]
): boolean {
  return matchesKeyword(label, keywords);
}
