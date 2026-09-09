'use client';

// ============================================================
// Marketing opt-out guidance for the template editor.
//
// WHY THIS EXISTS
//
// The suppression machinery already works: a customer who replies STOP,
// or taps a button carrying the opt-out payload, is unsubscribed and no
// further marketing template reaches them. What was missing is the half
// the BUSINESS controls — nothing in the editor ever mentioned that a
// marketing template should carry a way out, so templates shipped without
// one and customers who wanted to leave had to block the number instead.
//
// A block is not a neutral outcome. Blocks feed Meta's quality rating,
// and a falling rating is what gets a number restricted from opening new
// conversations. So this panel is about account health, not etiquette,
// and it says so rather than moralising.
//
// SCOPE: shown for Marketing only. Utility and authentication templates
// are never suppressed — order updates and one-time codes must arrive
// even for somebody who opted out of promotions — so demanding an
// unsubscribe button on them would be advice that makes the product
// worse.
//
// Everything imported here is client-safe on purpose:
// `opt-out-keywords.ts` is pure data and pure string logic, whereas
// `marketing-opt-out.ts` drags in the Meta API layer and Supabase.
// ============================================================

import { BellOff, Check, Plus, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TEMPLATE_LIMITS } from '@/lib/whatsapp/template-limits';
import {
  DEFAULT_OPT_OUT_KEYWORDS,
  SUGGESTED_OPT_OUT_BUTTON_LABEL,
  SUGGESTED_OPT_OUT_KEYWORDS,
  matchesKeyword,
} from '@/lib/whatsapp/opt-out-keywords';
import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateButton } from '@/types';

/** Does this button list already carry a recognised opt-out button? */
export function hasOptOutButton(buttons: TemplateButton[]): boolean {
  return buttons.some(
    (b) =>
      b.type === 'QUICK_REPLY' &&
      matchesKeyword(b.text, DEFAULT_OPT_OUT_KEYWORDS)
  );
}

/**
 * Quick replies whose wording READS as an opt-out but will not be treated
 * as one.
 *
 * "Unsubscribe" is the common case: it is obviously an opt-out to a human
 * and matches nothing, because the account's keyword list says STOP. The
 * button then does nothing at all when tapped — the worst possible
 * outcome, since the customer believes they have unsubscribed and the
 * business believes it offered a way out.
 */
export function mismatchedOptOutLabels(buttons: TemplateButton[]): string[] {
  return buttons
    .filter(
      (b) =>
        b.type === 'QUICK_REPLY' &&
        b.text.trim() !== '' &&
        matchesKeyword(b.text, SUGGESTED_OPT_OUT_KEYWORDS) &&
        !matchesKeyword(b.text, DEFAULT_OPT_OUT_KEYWORDS)
    )
    .map((b) => b.text.trim());
}

/**
 * Does the body or footer tell people how to leave?
 *
 * The word must START a word, so it has to be preceded by the beginning of
 * the string or by whitespace/punctuation — NOT by a letter or a hyphen.
 *
 * A plain `\b` boundary is not enough, and getting this wrong matters in
 * one direction specifically: a hyphen counts as a word boundary, so
 * "Non-stop savings all week" would satisfy `\bstop\b` and mark a template
 * as having an opt-out instruction when it says the exact opposite. That
 * is a false PASS — it would suppress the warning on precisely the
 * template that needs it.
 */
export function footerMentionsOptOut(text: string): boolean {
  return /(?:^|[\s.,;:!?"'()])(stop|unsubscribe|opt[\s-]?out|cancel)\b/i.test(
    text
  );
}

/**
 * Add an opt-out quick reply, placed so Meta will still accept it.
 *
 * Meta requires quick replies to sit in ONE contiguous run — two groups,
 * quick replies and everything else, in either order. Appending blindly
 * to `[QUICK_REPLY, URL]` produces `[QR, URL, QR]`, which is three runs
 * and is rejected with a message about button ordering that does not
 * mention the template at all.
 *
 * So the new button goes immediately after the LAST existing quick reply,
 * keeping the run intact, and only falls back to the end of the list when
 * there are no quick replies to join.
 */
export function withOptOutButton(buttons: TemplateButton[]): TemplateButton[] {
  const optOut: TemplateButton = {
    type: 'QUICK_REPLY',
    text: SUGGESTED_OPT_OUT_BUTTON_LABEL,
  };

  let lastQuickReply = -1;
  buttons.forEach((b, i) => {
    if (b.type === 'QUICK_REPLY') lastQuickReply = i;
  });

  if (lastQuickReply === -1) return [...buttons, optOut];
  return [
    ...buttons.slice(0, lastQuickReply + 1),
    optOut,
    ...buttons.slice(lastQuickReply + 1),
  ];
}

export function OptOutGuidance({
  category,
  buttons,
  bodyText,
  footerText,
  onButtonsChange,
}: {
  category: TemplateCategory;
  buttons: TemplateButton[];
  /**
   * Body and footer are both checked, because either is a legitimate
   * place to put "Reply STOP to unsubscribe" — the footer is the
   * conventional spot, but plenty of templates say it in the last line of
   * the body instead, and flagging those as non-compliant would be wrong.
   */
  bodyText: string;
  footerText: string;
  onButtonsChange: (next: TemplateButton[]) => void;
}) {
  // Utility and authentication templates are never suppressed, so an
  // unsubscribe affordance on them would be misleading.
  if (category !== 'Marketing') return null;

  const hasButton = hasOptOutButton(buttons);
  const hasFooterNote =
    footerMentionsOptOut(footerText) || footerMentionsOptOut(bodyText);
  const mismatched = mismatchedOptOutLabels(buttons);
  const atButtonLimit = buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal;
  const covered = hasButton || hasFooterNote;

  return (
    <section
      className={
        covered
          ? 'border-border bg-card rounded-xl border p-5'
          : 'rounded-xl border border-amber-500/40 bg-amber-500/5 p-5'
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            covered
              ? 'flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500'
          }
        >
          <BellOff className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-semibold">
            Let people opt out
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Customers who cannot unsubscribe block you instead, and blocks are
            what damage your number&rsquo;s quality rating — the rating Meta
            uses to decide whether you may keep starting conversations. Give
            every marketing template an obvious way out.
          </p>
        </div>
      </div>

      {/* What this template currently offers. Two independent routes, both
          of which the CRM honours, so either one is enough. */}
      <ul className="mt-4 space-y-2">
        <StatusRow
          done={hasButton}
          label={`A “${SUGGESTED_OPT_OUT_BUTTON_LABEL}” quick-reply button`}
          detail={
            hasButton
              ? 'Tapping it unsubscribes the contact automatically.'
              : 'One tap, nothing to type. The most reliable option.'
          }
        />
        <StatusRow
          done={hasFooterNote}
          label="Opt-out wording in the body or footer"
          detail={
            hasFooterNote
              ? 'Replying with that word unsubscribes the contact.'
              : `Add something like “Reply ${DEFAULT_OPT_OUT_KEYWORDS[0]} to unsubscribe”.`
          }
        />
      </ul>

      {!hasButton ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atButtonLimit}
            onClick={() => onButtonsChange(withOptOutButton(buttons))}
          >
            <Plus className="size-4" />
            Add &ldquo;{SUGGESTED_OPT_OUT_BUTTON_LABEL}&rdquo; button
          </Button>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {atButtonLimit
              ? `This template already has the maximum of ${TEMPLATE_LIMITS.maxButtonsTotal} buttons. Remove one, or put the opt-out instruction in the footer instead.`
              : 'Added as a quick reply next to your other quick replies, which is where Meta requires it to sit.'}
          </p>
        </div>
      ) : null}

      {mismatched.length > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            The button labelled <strong>&ldquo;{mismatched[0]}&rdquo;</strong>{' '}
            looks like an opt-out but will not be treated as one, so tapping it
            would do nothing. Either rename it to &ldquo;
            {SUGGESTED_OPT_OUT_BUTTON_LABEL}&rdquo;, or add &ldquo;
            {mismatched[0].toUpperCase()}&rdquo; to your opt-out keywords in
            Settings → Opt-in / opt-out.
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
        Opting out only stops <strong>marketing</strong> templates. Order
        updates, delivery notifications and one-time passcodes still reach the
        customer, so nobody loses a message they actually need.
      </p>
    </section>
  );
}

function StatusRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={
          done
            ? 'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'border-muted-foreground/40 mt-0.5 size-4 shrink-0 rounded-full border border-dashed'
        }
        aria-hidden="true"
      >
        {done ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0 text-sm">
        <span
          className={done ? 'text-foreground' : 'text-foreground font-medium'}
        >
          {label}
        </span>
        <span className="text-muted-foreground"> — {detail}</span>
        <span className="sr-only">{done ? ' (added)' : ' (not added)'}</span>
      </span>
    </li>
  );
}
