// ============================================================
// Admin-editable copy templating — pure, no I/O.
//
// Every user-visible string in the subscription flow lives in
// `subscription_settings` so the super admin can reword it without a
// deploy. Some of those strings need runtime values spliced in (the
// owner's name, the workspace name, a date), which means a tiny
// template pass.
//
// Design constraint: an operator editing copy in a textarea must not be
// able to break the page. So this is deliberately forgiving —
// see `fillTemplate`.
// ============================================================

/** Values available to the member-blocked and expiry copy. */
export interface CopyVars {
  account_name?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  plan_name?: string | null;
  expired_on?: string | null;
  days?: number | string | null;
  [key: string]: string | number | null | undefined;
}

/**
 * Substitute `{placeholder}` tokens in an admin-authored string.
 *
 * Forgiving by design, because the input is hand-typed in a CMS field:
 *   - A placeholder with a value is replaced.
 *   - A placeholder whose value is null/undefined/empty is removed,
 *     and the leftover double-space is collapsed — so a sentence with
 *     an unavailable `{owner_name}` still reads cleanly instead of
 *     showing a raw brace or the word "null".
 *   - A placeholder we don't recognise is left EXACTLY as typed. That
 *     way a typo is visible to the operator who made it rather than
 *     silently deleting a chunk of their sentence.
 *
 * Not a general template engine on purpose: no logic, no nesting, no
 * HTML. The output is rendered as text, so authored copy cannot inject
 * markup.
 */
export function fillTemplate(
  template: string | null | undefined,
  vars: CopyVars,
): string {
  if (!template) return '';

  const out = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    // Unknown key -> leave the token visible for the operator to spot.
    if (!(key in vars)) return match;

    const value = vars[key];
    if (value === null || value === undefined) return '';

    const str = typeof value === 'number' ? String(value) : value.trim();
    return str;
  });

  // Tidy up the gaps left by dropped placeholders: collapse runs of
  // spaces, and pull punctuation back against the preceding word
  // ("Ask  to pay ." -> "Ask to pay.").
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

/**
 * Best-effort display name for the account owner, for use in copy and
 * as the mailto target label. Falls back through full name -> email ->
 * a neutral noun, so the sentence never reads "Ask  to pay".
 */
export function ownerDisplayName(owner: {
  full_name?: string | null;
  email?: string | null;
} | null | undefined): string {
  const name = owner?.full_name?.trim();
  if (name) return name;
  const email = owner?.email?.trim();
  if (email) return email;
  return 'your workspace owner';
}

/**
 * Format an end date for copy — "12 Aug 2026". Locale-aware via
 * Intl, with a null guard so a missing window renders as an empty
 * string that `fillTemplate` then cleans up.
 */
export function formatCopyDate(
  value: string | Date | null | undefined,
  locale?: string,
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
