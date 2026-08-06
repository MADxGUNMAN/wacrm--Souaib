// ============================================================
// Email HTML primitives — pure, no I/O.
//
// Table-based, inline-styled markup because that is the only thing that
// renders consistently in Outlook and Gmail. The visual language matches
// the existing contact-reply email (slate palette, 600px white card on
// #f8fafc, 12px radius, CID logo header) so a customer receiving a
// billing notice and a support reply sees the same product.
//
// SECURITY: every value that reaches this module is escaped, and the
// helpers take PLAIN TEXT, never HTML. That matters more here than in
// most templates because the inputs are hostile-by-default: the payer's
// name, bank and UTR are typed by the customer, and the rejection reason
// is typed by an admin. Unescaped, a name like `<b>` would corrupt the
// layout and an `<a href>` would turn our own transactional mail into a
// phishing vector. Callers cannot opt out — there is no "raw" variant.
// ============================================================

import { EMAIL_LOGO_CID } from './send';

/**
 * Escape text for interpolation into HTML.
 *
 * Covers the five XML predefined entities. `&` is replaced first, since
 * doing it later would double-escape the ampersands introduced by the
 * other replacements.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape text and convert newlines to `<br>`.
 *
 * For free-text fields an author typed into a textarea — a rejection
 * reason, a payer note — where line breaks are meaningful. Escaping runs
 * FIRST, so the `<br>` tags this adds are the only markup that survives.
 */
export function escapeMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

const SLATE_900 = '#0f172a';
const SLATE_700 = '#334155';
const SLATE_500 = '#64748b';
const SLATE_400 = '#94a3b8';
const BORDER = '#e2e8f0';
const HAIRLINE = '#f1f5f9';
const PAGE_BG = '#f8fafc';
const BRAND = '#25D366';

export type NoticeTone = 'neutral' | 'success' | 'warning' | 'danger';

const NOTICE_TONES: Record<NoticeTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: '#f8fafc', border: BORDER, text: SLATE_700 },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  danger: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
};

/** A single `<p>` of body copy. */
export function paragraph(text: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: ${SLATE_700};">${escapeHtml(text)}</p>`;
}

/** The one-line headline above the body copy. */
export function heading(text: string): string {
  return `<h1 style="margin: 0 0 16px 0; font-size: 20px; line-height: 1.4; font-weight: 700; color: ${SLATE_900};">${escapeHtml(text)}</h1>`;
}

export interface DetailRow {
  label: string;
  value: string;
  /** Renders the value bold and darker — for the amount and the plan. */
  emphasis?: boolean;
}

/**
 * The label/value summary block: plan, amount, transaction id, dates.
 *
 * Rows whose value is empty are dropped rather than rendered blank, so
 * an optional field the payer skipped (bank name, note) doesn't leave a
 * dangling label in the email.
 */
export function detailTable(rows: DetailRow[]): string {
  const cells = rows
    .filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
    .map((row) => {
      const valueStyle = row.emphasis
        ? `font-size: 15px; font-weight: 700; color: ${SLATE_900};`
        : `font-size: 14px; color: ${SLATE_700};`;
      return `
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid ${HAIRLINE}; font-size: 13px; color: ${SLATE_500};">${escapeHtml(row.label)}</td>
              <td align="right" style="padding: 10px 0; border-bottom: 1px solid ${HAIRLINE}; ${valueStyle}">${escapeHtml(row.value)}</td>
            </tr>`;
    })
    .join('');

  if (!cells) return '';

  return `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; border-collapse: collapse;">
        <tbody>${cells}
        </tbody>
      </table>`;
}

/** A tinted callout box. `body` may contain newlines. */
export function notice(options: {
  tone: NoticeTone;
  title?: string;
  body: string;
}): string {
  const tone = NOTICE_TONES[options.tone];
  const title = options.title
    ? `<p style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: ${tone.text};">${escapeHtml(options.title)}</p>`
    : '';

  return `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 16px; background-color: ${tone.bg}; border: 1px solid ${tone.border}; border-radius: 8px;">
            ${title}
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: ${tone.text};">${escapeMultiline(options.body)}</p>
          </td>
        </tr>
      </table>`;
}

/**
 * Primary call-to-action. Rendered as a padded table cell rather than a
 * styled `<a>` because Outlook ignores padding on inline elements.
 */
export function button(options: { href: string; label: string }): string {
  return `
      <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td align="center" style="background-color: ${BRAND}; border-radius: 8px;">
            <a href="${escapeHtml(options.href)}" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">${escapeHtml(options.label)}</a>
          </td>
        </tr>
      </table>`;
}

/**
 * Wrap composed content blocks in the branded shell.
 *
 * `preheader` is the grey line clients show next to the subject in the
 * inbox list. Hidden in the body via zero dimensions — without one, the
 * client scrapes whatever text comes first, which would be the alt text
 * of the logo.
 */
export function renderEmail(options: {
  siteName: string;
  preheader: string;
  /** Pre-escaped output of the helpers above, concatenated. */
  content: string;
  /** Small print under the divider, e.g. how to reach support. */
  footerNote?: string;
}): string {
  const year = new Date().getFullYear();
  const siteName = escapeHtml(options.siteName);
  const footerNote = options.footerNote
    ? `<p style="margin: 0; font-size: 12px; color: ${SLATE_400}; line-height: 1.5;">${escapeMultiline(options.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${PAGE_BG}; color: ${SLATE_900};">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(options.preheader)}</div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${PAGE_BG}; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid ${BORDER};">

          <tr>
            <td style="padding: 32px 40px; border-bottom: 1px solid ${HAIRLINE}; text-align: left;">
              <img src="cid:${EMAIL_LOGO_CID}" alt="${siteName}" style="height: 32px; max-width: 200px; display: block; object-fit: contain;">
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">${options.content}
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 40px; background-color: ${PAGE_BG}; border-top: 1px solid ${HAIRLINE}; text-align: left;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: ${SLATE_500}; font-weight: 500;">
                The ${siteName} Team
              </p>
              ${footerNote}
            </td>
          </tr>

        </table>

        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding: 24px 0;">
              <p style="margin: 0; font-size: 12px; color: ${SLATE_400};">
                &copy; ${year} ${siteName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Derive a plain-text alternative from the composed blocks.
 *
 * Strips tags, decodes the entities we introduced, and collapses blank
 * runs. Not a general HTML-to-text converter — it only has to handle the
 * markup produced above, and it keeps the templates from having to be
 * authored twice and drift apart.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand last, mirroring escapeHtml's ordering in reverse.
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
    .trim();
}
