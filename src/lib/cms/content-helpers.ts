// ============================================================
// Small, dependency-free helpers shared by the CMS content resolvers
// (ai-integration-content, google-sheets-content, marketing-copy).
//
// Every resolver takes whatever is stored (any shape, possibly from an
// older version of the editor) and merges it over code defaults field by
// field, so a public page can never render blank or crash on bad data.
// ============================================================

export const nonEmpty = (s: unknown): s is string =>
  typeof s === 'string' && s.trim().length > 0;

/** The stored string when it has content, otherwise the fallback. */
export const text = (v: unknown, fallback: string): string =>
  nonEmpty(v) ? v : fallback;

/** The stored array filtered by `keep`, or the fallback when nothing is left. */
export function list<T>(
  v: unknown,
  fallback: T[],
  keep: (x: T) => boolean
): T[] {
  if (!Array.isArray(v)) return fallback;
  const items = (v as T[]).filter((x) => x != null && keep(x));
  return items.length ? items : fallback;
}

/** Narrow unknown stored JSON to a plain object (never an array or null). */
export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/**
 * Split "**bold**" markers into segments. Used by mockup copy so a super
 * admin can emphasise a word without the CMS accepting HTML.
 */
export function boldSegments(s: string): { text: string; bold: boolean }[] {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false }
    );
}

/** Replace the {site_name} token used in shared marketing copy. */
export const withSiteName = (s: string, siteName: string): string =>
  s.replace(/\{site_name\}/g, siteName);
