// ============================================================
// Auto Mail rendering and scheduling arithmetic — pure, no I/O.
//
// Kept free of database and network calls so the reminder timing can be
// reasoned about and unit-tested directly, and so the admin preview
// renders the byte-identical email the cron would send rather than an
// approximation of it.
//
// SECURITY NOTE, and the reason substitution happens where it does:
// every helper in src/lib/email/layout.ts escapes its input and there is
// no raw variant. So operator-authored template text is substituted
// while it is still PLAIN TEXT, and only then handed to `paragraph()` /
// `heading()`. Escaping therefore remains the last step, and an operator
// cannot inject markup into an email — even by pasting an `<a href>`
// into the body field. Substituting into already-built HTML would both
// double-escape and lose that guarantee.
// ============================================================

import {
  button,
  detailTable,
  heading,
  paragraph,
  renderEmail,
  toPlainText,
  type DetailRow,
} from '@/lib/email/layout';
import { fillTemplate } from '@/lib/subscription/copy';

import type { AutoEmailRule, AutoEmailVars } from './types';

/**
 * Tokens an operator may use, with a human description. Exported so the
 * settings UI can list them beside the editor — a template language
 * nobody can discover is a template language nobody uses correctly.
 */
export const AUTO_EMAIL_TOKENS: { token: string; description: string }[] = [
  { token: '{name}', description: "Recipient's first name" },
  { token: '{full_name}', description: 'Full name as stored in the CRM' },
  { token: '{workspace}', description: 'Workspace / account name' },
  { token: '{site_name}', description: 'Your product name' },
  {
    token: '{expiry_date}',
    description: 'Trial or renewal date, e.g. 8 Sep 2026',
  },
  { token: '{days_left}', description: 'Whole days remaining, e.g. 3' },
  {
    token: '{days_phrase}',
    description: 'Days remaining, already pluralised — "1 day" / "5 days"',
  },
  {
    token: '{plan_name}',
    description: 'Chosen or current plan. Empty if none — do not rely on it',
  },
];

/**
 * Human phrase for a day count.
 *
 * Zero renders as "less than a day" rather than "today" because the
 * templates read "ends in {days_phrase}", and "ends in today" is not a
 * sentence. Getting this wrong is the sort of thing that ships to every
 * customer at once, so the phrasing is decided here rather than left to
 * whoever writes the template.
 */
export function daysPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return 'less than a day';
  if (daysLeft === 1) return '1 day';
  return `${daysLeft} days`;
}

/**
 * Which reminder stage, if any, is due for an account right now.
 *
 * Each offset owns a BAND rather than an exact day. With stages
 * [7, 3, 1]:
 *
 *   offset 7 -> 3 <  daysLeft <= 7
 *   offset 3 -> 1 <  daysLeft <= 3
 *   offset 1 -> 0 <= daysLeft <= 1
 *
 * Two problems this solves, both of which a naive `daysLeft === offset`
 * has:
 *
 *   1. A missed day is not a missed email. The cron runs every five
 *      minutes, but if the host is down for a whole day an exact match
 *      skips that stage silently and forever — the one failure mode
 *      nobody notices until a customer's access lapses unannounced.
 *
 *   2. No back-mail burst. Testing `daysLeft <= offset` against every
 *      offset independently would fire the 7-day AND 3-day mails
 *      together for an account first seen with 2 days left. Bands mean
 *      at most one reminder per segment per tick, and a stage whose
 *      moment has already passed is simply skipped.
 *
 * Returns null when no stage applies, including when the window has
 * already closed (negative days) — a reminder about a deadline that has
 * gone is worse than silence.
 */
export function resolveDueOffset(
  daysLeft: number,
  offsets: number[]
): number | null {
  if (daysLeft < 0) return null;

  // Descending, de-duplicated, positive only. An operator can type
  // anything into the array field, and a 0 or a repeat would otherwise
  // produce an empty band or two claims for one moment.
  const sorted = [...new Set(offsets)]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);

  if (sorted.length === 0) return null;

  for (let i = 0; i < sorted.length; i++) {
    const offset = sorted[i];
    // The next smaller stage is this band's exclusive lower bound. The
    // smallest stage extends to 0 so the final day is always covered.
    const lower = i === sorted.length - 1 ? -1 : sorted[i + 1];
    if (daysLeft <= offset && daysLeft > lower) return offset;
  }

  return null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render one reminder.
 *
 * `detailRows` carries the factual summary (plan, date, days left) and is
 * built here rather than in the template on purpose: `detailTable` drops
 * rows whose value is empty, so a trialing account with no plan chosen
 * loses that one row cleanly instead of leaving a dangling label — which
 * is exactly what prose containing `{plan_name}` could not do.
 */
export function renderReminderEmail(input: {
  rule: AutoEmailRule;
  vars: AutoEmailVars;
  branding: {
    siteName: string;
    appUrl: string;
    supportEmail: string | null;
    logoUrl: string | null;
    logoDarkUrl: string | null;
  };
}): RenderedEmail {
  const { rule, vars, branding } = input;

  const subject = fillTemplate(rule.subject_template, { ...vars });
  const headingText = fillTemplate(rule.heading_template, { ...vars });
  const bodyText = fillTemplate(rule.body_template, { ...vars });

  // Blank lines separate paragraphs. Chosen because it is what an
  // operator types anyway in a textarea, needs no syntax to learn, and
  // cannot express anything unsafe.
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => paragraph(block))
    .join('');

  const rows: DetailRow[] = [
    { label: 'Workspace', value: vars.workspace },
    { label: 'Plan', value: vars.plan_name },
    {
      label: rule.segment === 'trial' ? 'Trial ends' : 'Renews on',
      value: vars.expiry_date,
      emphasis: true,
    },
    { label: 'Time remaining', value: vars.days_phrase },
  ];

  // A relative path is stored so one rule row is correct in every
  // environment; the origin is only known at render time.
  const ctaHref = rule.cta_path.startsWith('http')
    ? rule.cta_path
    : `${branding.appUrl}${rule.cta_path.startsWith('/') ? '' : '/'}${rule.cta_path}`;

  const content = [
    headingText ? heading(headingText) : '',
    paragraphs,
    detailTable(rows),
    button({ href: ctaHref, label: rule.cta_label }),
  ].join('');

  const footerParts: string[] = [];
  if (rule.footer_note) {
    footerParts.push(fillTemplate(rule.footer_note, { ...vars }));
  }
  footerParts.push(
    branding.supportEmail
      ? `Questions? Reply to this email or write to ${branding.supportEmail}.`
      : 'Questions? Just reply to this email.'
  );

  const html = renderEmail({
    siteName: branding.siteName,
    // Falls back to the subject rather than inventing a second string:
    // an empty preheader makes the client scrape the logo's alt text.
    preheader: subject,
    content,
    footerNote: footerParts.join('\n'),
    logoUrl: branding.logoUrl,
    logoDarkUrl: branding.logoDarkUrl,
  });

  return { subject, html, text: toPlainText(html) };
}
