// ============================================================
// In-app support chat — message text validation. Pure, no I/O.
//
// Shared by the composer (to cap typing and disable Send) and by the
// send route (which must never trust the client). Returns a result
// object rather than throwing, so the client can use it in a render
// path without a try/catch.
//
// ─── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────
//
// It does NOT reuse `src/lib/validation/notes.ts`. That module's
// CODE_PATTERNS array REJECTS text containing `function`, `const`,
// backticks, `{...}` blocks, `document.`, SQL keywords and
// `javascript:` URIs. That is right for a contact note and
// catastrophic here: the first thing a customer does in a support chat
// is paste an error message, a JSON payload or a stack trace. Refusing
// exactly that would make the feature useless for its only purpose.
//
// It also does NOT sanitise HTML, because nothing here is ever rendered
// as HTML. Every bubble renders `{message.content_text}` as a plain
// React child, which React escapes — the same convention the inbox
// follows, and the reason this repo carries no DOMPurify dependency.
// Introducing a sanitiser would imply the opposite is safe somewhere.
// ============================================================

/**
 * Longest message we accept.
 *
 * Matches the inbox's `TEXT_MESSAGE_MAX` so the two composers behave
 * identically, but declared here rather than imported from
 * `lib/whatsapp/content-types` — that value is Meta's text.body limit,
 * and coupling an in-app chat to a WhatsApp constraint would mean a
 * future Meta change silently moving this cap.
 */
export const SUPPORT_MESSAGE_MAX = 4096;

/**
 * Strip characters that cannot render and can corrupt a layout.
 *
 * Removes C0/C1 control characters but KEEPS `\n` and `\t`: a support
 * message is routinely a multi-line paste of a log or a config, and
 * flattening it would destroy the thing the customer is trying to show.
 * Also normalises CRLF, so a Windows paste does not double-space every
 * line in a `whitespace-pre-wrap` bubble.
 */
export function stripControlCharacters(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

export type SupportTextResult =
  { ok: true; text: string } | { ok: false; error: string };

/**
 * Normalise and validate a message body.
 *
 * Order matters: strip first, then trim, then measure. Stripping after
 * measuring would let a string of control characters pass the length
 * check and then collapse to empty.
 */
export function normalizeSupportText(raw: unknown): SupportTextResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'A message is required.' };
  }

  const text = stripControlCharacters(raw).trim();

  if (!text) {
    return { ok: false, error: 'Type a message before sending.' };
  }
  if (text.length > SUPPORT_MESSAGE_MAX) {
    return {
      ok: false,
      error: `That message is ${text.length.toLocaleString()} characters. The limit is ${SUPPORT_MESSAGE_MAX.toLocaleString()}.`,
    };
  }

  return { ok: true, text };
}

/**
 * One-line preview for the conversation list row.
 *
 * Newlines become spaces so a multi-line message does not render as a
 * one-word row, and the result is clipped well under any column width —
 * the list truncates visually too, but storing a whole 4 KB message in
 * a preview column would bloat every list query.
 */
export const SUPPORT_PREVIEW_MAX = 140;

export function buildSupportPreview(
  contentType: string,
  text: string | null
): string {
  if (contentType !== 'text') {
    // An attachment's caption is the most useful preview there is, so it
    // wins when present. The glyph labels are the fallback — named rather
    // than left blank so a row never reads as an empty conversation.
    const caption = (text ?? '').replace(/\s+/g, ' ').trim();
    const label =
      contentType === 'image'
        ? '📷 Photo'
        : contentType === 'document'
          ? '📄 Document'
          : contentType === 'audio'
            ? '🎤 Voice message'
            : 'Attachment';
    if (!caption) return label;
    const combined = `${label} · ${caption}`;
    return combined.length > SUPPORT_PREVIEW_MAX
      ? `${combined.slice(0, SUPPORT_PREVIEW_MAX - 1)}…`
      : combined;
  }
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > SUPPORT_PREVIEW_MAX
    ? `${flat.slice(0, SUPPORT_PREVIEW_MAX - 1)}…`
    : flat;
}
