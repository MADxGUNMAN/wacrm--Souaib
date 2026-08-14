/**
 * Turn template text into styled segments for the WhatsApp preview.
 *
 * Two jobs, deliberately kept out of the React component so they can be
 * unit-tested without rendering:
 *
 *   1. WhatsApp's inline formatting — *bold*, _italic_, ~strike~ and
 *      ```monospace```. Meta's own editor offers these buttons, so a
 *      preview that renders the raw asterisks is showing something the
 *      customer will never see.
 *
 *   2. Variable substitution. `{{1}}` becomes its sample value when one
 *      exists; when it doesn't, the segment is MARKED as an unresolved
 *      placeholder rather than silently left as braces. The component
 *      renders those as a chip, so "I forgot a sample value" is visible
 *      at a glance instead of looking like literal text the customer
 *      would receive.
 *
 * Returns plain data — no HTML string is ever produced, so template text
 * (which is user input) cannot inject markup.
 */

export interface PreviewSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mono?: boolean;
  /** An unfilled {{…}} placeholder. Rendered as a chip, not as text. */
  placeholder?: boolean;
}

type Style = 'bold' | 'italic' | 'strike' | 'mono';

/**
 * Order matters: the triple backtick must be tested before `*`, and
 * before any single-character marker, or ```code``` would be parsed as
 * an unterminated something-else.
 */
const MARKERS: { token: string; style: Style }[] = [
  { token: '```', style: 'mono' },
  { token: '*', style: 'bold' },
  { token: '_', style: 'italic' },
  { token: '~', style: 'strike' },
];

function styleFlags(styles: Set<Style>): Omit<PreviewSegment, 'text'> {
  const out: Omit<PreviewSegment, 'text'> = {};
  if (styles.has('bold')) out.bold = true;
  if (styles.has('italic')) out.italic = true;
  if (styles.has('strike')) out.strike = true;
  if (styles.has('mono')) out.mono = true;
  return out;
}

/**
 * Parse inline formatting into flat segments.
 *
 * A marker only counts when it has a closing partner with at least one
 * character between them — WhatsApp treats a lone `*` as literal, and so
 * must we, or typing "2 * 3" would silently turn bold.
 */
function parseFormatting(
  text: string,
  styles: Set<Style> = new Set(),
): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let best: { index: number; token: string; style: Style; close: number } | null =
      null;

    for (const { token, style } of MARKERS) {
      // A style cannot nest inside itself.
      if (styles.has(style)) continue;
      const open = text.indexOf(token, cursor);
      if (open === -1) continue;
      const close = text.indexOf(token, open + token.length);
      // Needs a closer with content between.
      if (close === -1 || close === open + token.length) continue;
      if (!best || open < best.index) {
        best = { index: open, token, style, close };
      }
    }

    if (!best) {
      segments.push({ text: text.slice(cursor), ...styleFlags(styles) });
      break;
    }

    if (best.index > cursor) {
      segments.push({
        text: text.slice(cursor, best.index),
        ...styleFlags(styles),
      });
    }

    const inner = text.slice(best.index + best.token.length, best.close);
    const nextStyles = new Set(styles);
    nextStyles.add(best.style);
    segments.push(...parseFormatting(inner, nextStyles));

    cursor = best.close + best.token.length;
  }

  return segments.filter((s) => s.text.length > 0);
}

/** Matches `{{1}}` and `{{order_id}}` — positional and named alike. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Resolve `{{…}}` inside already-styled segments.
 *
 * Values are looked up by the key as written, so a positional `{{1}}`
 * reads `values['1']`. Callers holding a positional array should pass
 * `Object.fromEntries(arr.map((v, i) => [String(i + 1), v]))`.
 */
function resolvePlaceholders(
  segments: PreviewSegment[],
  values: Record<string, string | undefined>,
): PreviewSegment[] {
  const out: PreviewSegment[] = [];

  for (const segment of segments) {
    const { text, ...styles } = segment;
    let last = 0;
    PLACEHOLDER.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = PLACEHOLDER.exec(text)) !== null) {
      if (match.index > last) {
        out.push({ text: text.slice(last, match.index), ...styles });
      }
      const key = match[1];
      const value = values[key];
      if (value !== undefined && value !== '') {
        out.push({ text: value, ...styles });
      } else {
        // Keep the original spelling so the operator can see WHICH
        // variable is unfilled, not just that one is.
        out.push({ text: match[0], ...styles, placeholder: true });
      }
      last = match.index + match[0].length;
    }

    if (last < text.length) {
      out.push({ text: text.slice(last), ...styles });
    }
  }

  return out.filter((s) => s.text.length > 0);
}

/**
 * The single entry point: template text plus known sample values in,
 * render-ready segments out.
 */
export function buildPreviewSegments(
  text: string,
  values: Record<string, string | undefined> = {},
): PreviewSegment[] {
  if (!text) return [];
  return resolvePlaceholders(parseFormatting(text), values);
}

/** Convenience for the positional `{{1}}`, `{{2}}` case. */
export function positionalValues(
  samples: (string | undefined)[],
): Record<string, string | undefined> {
  return Object.fromEntries(samples.map((v, i) => [String(i + 1), v]));
}
