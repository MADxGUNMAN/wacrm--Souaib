'use client';

// ============================================================
// Settings → App integrations (plan §2.8, screenshot 13).
//
// A card grid with exactly ONE card, because exactly one integration
// exists. The grid shape is deliberate — a second integration drops in
// without a rewrite — but no placeholder or "coming soon" cards are
// rendered: a settings pane that advertises things you cannot use is
// worse than a short one.
//
// The card's job is not just the install link. The commonest way to fail
// at this integration is to install the add-on and only then discover you
// need an API key with the right scope and an API campaign to send
// through. So those two prerequisites are stated here, each linking to
// the screen that satisfies it.
// ============================================================

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Megaphone,
  PencilLine,
  Sheet,
  TableRowsSplit,
} from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { SettingsPanelHead } from './settings-panel-head';

/**
 * The published Marketplace listing.
 *
 * Google builds this path from the app's display name, so it changes if
 * the listing is ever renamed. Kept as a single constant so that is a
 * one-line fix, and percent-encoded because the app name contains an em
 * dash which must not sit raw in an href.
 */
const MARKETPLACE_URL =
  'https://workspace.google.com/marketplace/app/replai_%E2%80%94_whatsapp_sender_automation/1050125319240';

/** Public overview page for the add-on. */
const OVERVIEW_URL = '/integrations/google-sheets';

/** What the add-on can do, mirroring the three bullets in screenshot 13. */
const CAPABILITIES = [
  {
    icon: TableRowsSplit,
    text: 'Send when a row is added, including from a linked Google Form',
  },
  {
    icon: PencilLine,
    text: 'Send when a row is edited and matches your rules',
  },
  {
    icon: CalendarClock,
    text: 'Daily reminders for birthdays, renewals and due dates',
  },
] as const;

/**
 * The two things that must exist in the CRM before the add-on can send
 * anything. Both link to the screen that creates them.
 */
const PREREQUISITES = [
  {
    icon: KeyRound,
    label: 'An API key with the "Launch broadcast campaigns" permission',
    href: '/settings?tab=api',
    cta: 'API keys',
  },
  {
    icon: Megaphone,
    label: 'An API campaign — a saved name bound to an approved template',
    href: '/broadcasts',
    cta: 'Broadcasts',
  },
] as const;

export function AppIntegrations() {
  const t = useTranslations('Settings.integrations');

  return (
    <section className="animate-in fade-in-50 max-w-3xl duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      {/* Grid of one. See the note at the top of this file. */}
      <div className="grid gap-4">
        <article className="border-border bg-card rounded-xl border p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              >
                <Sheet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-foreground text-sm font-semibold">
                  Google Sheets
                </h3>
                <p className="text-muted-foreground text-xs">
                  WhatsApp automation add-on
                </p>
              </div>
            </div>

            <span className="border-primary/30 bg-primary/10 text-primary shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Available
            </span>
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Send WhatsApp messages straight from a spreadsheet. Build rules in
            the sidebar and the add-on watches your sheet, sending through an
            approved template when a row matches.
          </p>

          <ul className="mt-4 space-y-2">
            {CAPABILITIES.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="text-muted-foreground flex items-start gap-2 text-sm"
              >
                <Icon
                  aria-hidden="true"
                  className="text-primary mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="border-border mt-5 border-t pt-4">
            <p className="text-foreground text-xs font-semibold">
              Set these up first
            </p>
            <ul className="mt-2 space-y-2">
              {PREREQUISITES.map(({ icon: Icon, label, href, cta }) => (
                <li key={href} className="flex items-start gap-2 text-sm">
                  <Icon
                    aria-hidden="true"
                    className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="text-muted-foreground min-w-0">
                    {label}{' '}
                    <Link
                      href={href}
                      className="text-primary font-medium hover:underline"
                    >
                      {cta}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {/* Leaves the CRM, so it opens in a new tab and carries
                noreferrer — an external link from an authenticated page
                should not leak the referring URL. */}
            <a
              href={MARKETPLACE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: 'default',
                size: 'default',
                className:
                  'bg-primary text-primary-foreground hover:bg-primary/90',
              })}
            >
              Install add-on
              <ExternalLink className="h-4 w-4" />
            </a>

            <Link
              href={OVERVIEW_URL}
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
            >
              How it works
            </Link>
          </div>
        </article>
      </div>

      <p className="text-muted-foreground mt-4 flex items-start gap-2 text-xs">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <span>
          The add-on only ever reads the spreadsheet you install it in, and your
          API key is stored against your own Google account — never in the
          shared document.
        </span>
      </p>
    </section>
  );
}
