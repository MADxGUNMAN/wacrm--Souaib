'use client';

// ============================================================
// Marketing subscription status for one contact.
//
// Everyone starts subscribed — the suppression list is a NEGATIVE index,
// so absence of a row means consent was never withdrawn. That is why the
// "since" date is optional rather than required: a contact who never
// unsubscribed has no transition to date, and inventing one would assert
// a consent moment that never happened. The caller may pass the contact's
// own `created_at` as a fallback, which is honest because that IS when the
// number entered the CRM, and the label says "in your CRM since" rather
// than claiming they opted in.
//
// Read through `/api/whatsapp/opt-in-out/status` rather than querying
// Supabase here, so this file stays free of the server-only opt-out
// module. See that route's header for the full reasoning.
// ============================================================

import { BellOff, BellRing, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export type SubscriptionState = 'subscribed' | 'unsubscribed';

export interface SubscriptionInfo {
  status: SubscriptionState;
  /** ISO timestamp of the transition, or null when never recorded. */
  since: string | null;
  source: string | null;
}

/**
 * How the current state came about, in words an operator can act on.
 *
 * `meta_131050` is called out specifically: Meta reporting an opt-out on a
 * send attempt means the customer opted out at the PLATFORM level, which
 * the business may never have seen in its own inbox — so "they never told
 * us" is a reasonable reaction and the copy should not imply otherwise.
 */
const SOURCE_COPY: Record<string, string> = {
  customer_keyword: 'they replied with a keyword',
  customer_button: 'they tapped the opt-out button',
  meta_131050: 'reported by Meta',
  agent: 'set by your team',
  api: 'set via the API',
  import: 'imported',
};

/** "2 Jul 2026, 10:44" — short, unambiguous, no locale surprises. */
export function formatSubscriptionSince(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SubscriptionStatusRow({
  info,
  fallbackSince,
  busy,
  disabled,
  onToggle,
}: {
  /** Null while loading — renders nothing rather than guessing a state. */
  info: SubscriptionInfo | null;
  /** Usually the contact's created_at. Only used when subscribed. */
  fallbackSince?: string | null;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const unsubscribed = info?.status === 'unsubscribed';
  const recorded = formatSubscriptionSince(info?.since ?? null);
  const fallback = formatSubscriptionSince(fallbackSince ?? null);
  const sourceNote = info?.source ? SOURCE_COPY[info.source] : undefined;

  // Only the recorded date is shown for an unsubscribe — there is always
  // one, because the suppression row itself carries `opted_out_at`.
  const shownDate = unsubscribed ? recorded : (recorded ?? fallback);
  const dateIsFallback = !unsubscribed && !recorded && Boolean(fallback);

  if (info === null) {
    return (
      <div className="text-muted-foreground mt-2.5 flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
        <Loader2 className="size-3 animate-spin" />
        <span>Checking subscription…</span>
      </div>
    );
  }

  if (unsubscribed) {
    return (
      <div
        className="border-destructive/25 bg-destructive/10 mt-2.5 rounded-lg border p-2.5"
        title="Marketing templates are suppressed for this number. Utility and authentication messages still send."
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-destructive inline-flex items-center gap-1.5 text-xs font-semibold">
            <BellOff className="size-3.5 shrink-0" />
            <span>Unsubscribed</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={busy || disabled}
            className="border-destructive/30 bg-background text-destructive hover:bg-destructive/15 hover:text-destructive h-6 cursor-pointer px-2 text-[11px] font-medium shadow-xs transition-all active:scale-95"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              'Re-subscribe'
            )}
          </Button>
        </div>

        <div className="mt-1 space-y-0.5 text-[11px]">
          {shownDate ? (
            <p className="flex items-center gap-1">
              <span className="text-muted-foreground">Opted out:</span>
              <span className="text-foreground/80 font-medium">
                {shownDate}
              </span>
            </p>
          ) : null}
          {sourceNote ? (
            <p className="text-muted-foreground text-[10px]">{sourceNote}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-border/50 bg-muted/20 mt-2.5 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <BellRing className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Subscribed</span>
        </div>
        {shownDate ? (
          <p className="text-muted-foreground truncate text-[10px]">
            {dateIsFallback
              ? `In CRM since ${shownDate}`
              : `Since ${shownDate}`}
          </p>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        disabled={busy || disabled}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-6 shrink-0 cursor-pointer px-2 text-[11px]"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : 'Unsubscribe'}
      </Button>
    </div>
  );
}
