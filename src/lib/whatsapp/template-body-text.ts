// ============================================================
// Render a template body for STORAGE.
//
// Distinct from `template-preview-text.ts`, which produces styled React
// segments for the on-screen preview (bold runs, placeholder chips). This
// produces one plain string, for `messages.content_text` and the
// conversation preview line — the two places that need "what did this
// message actually say" as text.
// ============================================================

/**
 * Substitute positional `{{n}}` placeholders with the values actually
 * sent to that recipient.
 *
 * ─── The rules, and why ───────────────────────────────────────────
 *
 * 1-INDEXED. Meta numbers template variables from `{{1}}`, so `{{1}}`
 * takes `params[0]`. Off-by-one here would silently shift every value in
 * every stored broadcast message.
 *
 * An UNSUPPLIED placeholder is left exactly as written. Substituting an
 * empty string would produce "Hi , your order shipped" — which reads as a
 * bug in the message the customer received, when the real situation is
 * that we do not know what was in that slot. Leaving `{{2}}` visible is
 * honest about the gap. (Meta rejects empty parameters outright, so a
 * message that actually reached a customer cannot have had a blank here
 * anyway; this branch only guards stored data that is incomplete.)
 *
 * Returns null for an absent or blank body so the caller can fall back to
 * a template-name placeholder rather than storing an empty string, which
 * would render as a blank chat bubble.
 */
export function interpolateTemplateBody(
  body: string | null | undefined,
  params: readonly string[] = []
): string | null {
  if (!body || !body.trim()) return null;

  return body.replace(/\{\{(\d+)\}\}/g, (whole, digits: string) => {
    const index = Number.parseInt(digits, 10) - 1;
    if (!Number.isInteger(index) || index < 0) return whole;
    const value = params[index];
    // Only a genuinely supplied, non-empty value replaces the marker.
    return typeof value === 'string' && value.length > 0 ? value : whole;
  });
}
