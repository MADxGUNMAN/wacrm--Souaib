'use client';

// ============================================================
// Settings -> Billing & plan -> history.
//
// The customer-facing counterpart to the super admin Activity tab. The
// panel header has always promised "payment history"; until now nothing
// rendered it, so a customer whose payment was approved a month ago had
// no way to confirm it, find the UTR they sent, or see what period it
// bought.
//
// Two lists, not one merged timeline:
//
//   Payments      receipts. Answers "what did I pay, was it accepted,
//                 and what did it buy me?"
//   Plan activity changes with no receipt behind them — trial start,
//                 time granted by support, an expiry. Answers "why did
//                 my access change when I didn't pay anything?"
//
// Merging them was the first thing I tried and it reads badly: one
// payment produces both a `payment_submitted` and a `payment_approved`
// event, so a single transfer shows up as two or three timeline rows
// interleaved with its own receipt. Splitting by "does this have a
// receipt" keeps each list answering one question.
//
// Deliberately NOT ported from the admin panel:
//   - the "Done by" column. Naming the platform admin who approved a
//     payment leaks staff identity to a customer.
//   - the operator `note`. Free text one admin writes for another.
//     `review_note` IS customer copy and is shown.
//   - the Paid/Manual pill. That distinction is what SPLITS these two
//     lists here, so a pill restating it would be noise.
//   - `from_status -> to_status`. Internal state machine values.
//
// Palette note: theme tokens (`text-foreground`, `bg-card`,
// `text-muted-foreground`) throughout. The super-admin panels hardcode
// `slate-*`/`white` because they are light-only; the settings area
// supports dark mode and copying those classes would break it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldOff,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type {
  BillingHistoryPayload,
  CustomerPaymentRecord,
  CustomerPlanActivity,
} from '@/lib/subscription/types';

// ------------------------------------------------------------
// Formatting
// ------------------------------------------------------------

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Date + time, for the moment of a transfer or a decision. */
function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * "+2 days" / "+1 month" — the span that was GRANTED.
 *
 * Reads the requested duration rather than differencing the end dates,
 * for the reason spelled out in migration 081: extending a live window
 * adds to its existing end date while extending a lapsed one restarts
 * from today, so the same "1 month" can move the date by 30 days or by
 * 400.
 */
function formatGranted(a: CustomerPlanActivity): string | null {
  if (a.durationDays) {
    return `+${a.durationDays} day${a.durationDays === 1 ? '' : 's'}`;
  }
  if (a.durationMonths) {
    return `+${a.durationMonths} month${a.durationMonths === 1 ? '' : 's'}`;
  }
  return null;
}

// ------------------------------------------------------------
// Vocabulary
// ------------------------------------------------------------

const PAYMENT_STATUS_META: Record<
  CustomerPaymentRecord['status'],
  { label: string; icon: React.ElementType; badge: string; dot: string }
> = {
  pending: {
    label: 'Under review',
    icon: Clock,
    badge:
      'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Paid',
    icon: CheckCircle2,
    badge:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Not verified',
    icon: XCircle,
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
  },
};

/**
 * Plain-language labels for the stored `event_type` values.
 *
 * Wording tracks the super admin panel's `EVENT_META` so a customer and
 * a support agent describe the same row the same way on a call — with
 * one deliberate change: the two admin-initiated grants say "by
 * support" rather than the bare "Subscription activated". From the
 * customer's side the salient fact is that somebody gave them time they
 * did not pay for, and a label that hides the actor reads like a
 * billing glitch.
 */
const ACTIVITY_META: Record<
  string,
  { label: string; icon: React.ElementType; tone: string }
> = {
  trial_started: {
    label: 'Free trial started',
    icon: Sparkles,
    tone: 'text-primary bg-primary/10',
  },
  trial_extended: {
    label: 'Trial extended by support',
    icon: Clock,
    tone: 'text-primary bg-primary/10',
  },
  subscription_activated: {
    label: 'Plan activated by support',
    icon: CheckCircle2,
    tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  },
  subscription_extended: {
    label: 'Plan extended by support',
    icon: CalendarClock,
    tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  },
  subscription_revoked: {
    label: 'Access blocked',
    icon: ShieldOff,
    tone: 'text-destructive bg-destructive/10',
  },
  subscription_expired: {
    label: 'Access ended',
    icon: Ban,
    tone: 'text-muted-foreground bg-muted',
  },
};

// ------------------------------------------------------------

export function BillingHistory() {
  const [data, setData] = useState<BillingHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Two page numbers, not one. The lists are unrelated and different
  // lengths, so a shared page would drag the receipts along every time
  // the customer stepped through the activity log.
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        paymentsPage: String(paymentsPage),
        activityPage: String(activityPage),
      });
      const res = await fetch(`/api/billing/history?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        // 401 is not an error worth showing here — the session expired
        // and the app's own redirect will take over.
        if (res.status === 401) return;
        throw new Error('Could not load your billing history');
      }
      setData((await res.json()) as BillingHistoryPayload);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load billing history'
      );
    } finally {
      setLoading(false);
    }
  }, [paymentsPage, activityPage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="bg-muted h-4 w-28 animate-pulse rounded" />
          <div className="bg-muted mt-3 h-3 w-52 animate-pulse rounded" />
          <div className="bg-muted mt-4 h-3 w-40 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-8 text-center">
          <AlertTriangle className="text-destructive size-5" />
          <p className="text-destructive mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-foreground mt-3 inline-flex items-center gap-2 text-sm font-medium hover:underline"
          >
            <RefreshCw className="size-3.5" />
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { payments, activity, summary } = data;
  const hasAnything = payments.total > 0 || activity.total > 0;

  return (
    <div className="space-y-5">
      {/* ---- Summary ----
          Shown only once there is an approved payment. On a trial account
          a row of zeroes says nothing and makes the screen look like it
          failed to load. */}
      {summary.totalsByCurrency.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
            <div>
              <p className="text-muted-foreground text-xs">Total paid</p>
              <p className="text-foreground mt-0.5 text-lg font-semibold tracking-tight">
                {/* One entry per currency. Almost always exactly one; see
                    the route for why it is not summed into a single
                    figure. */}
                {summary.totalsByCurrency
                  .map((t) => formatCurrency(t.amount, t.currency))
                  .join(' + ')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Payments made</p>
              <p className="text-foreground mt-0.5 text-lg font-semibold tracking-tight">
                {summary.approvedCount}
              </p>
            </div>
            {summary.pendingCount > 0 ? (
              <div>
                <p className="text-muted-foreground text-xs">Under review</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-amber-600 dark:text-amber-400">
                  {summary.pendingCount}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Payments ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-foreground text-sm font-semibold">
            Payment history
          </h3>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </button>
        </div>

        {payments.total === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-8 text-center">
              <Receipt className="text-muted-foreground size-6" />
              <p className="text-muted-foreground mt-2 text-sm">
                No payments yet
              </p>
              <p className="text-muted-foreground mt-1 max-w-[38ch] text-xs">
                Once you submit a payment for verification it appears here with
                its transaction ID and the period it covers.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <ul className="divide-border divide-y">
                  {payments.items.map((p) => (
                    <PaymentRow key={p.id} payment={p} />
                  ))}
                </ul>
              </CardContent>
            </Card>
            <PagerBar
              page={payments.page}
              pageSize={payments.pageSize}
              total={payments.total}
              totalPages={payments.totalPages}
              loading={loading}
              onPageChange={setPaymentsPage}
              noun="payment"
            />
          </>
        )}
      </section>

      {/* ---- Plan activity ----
          Hidden entirely when empty. An empty second list on an account
          that has only ever paid normally is pure noise — there is
          nothing the customer could do to populate it. */}
      {activity.total > 0 ? (
        <section>
          <h3 className="text-foreground mb-2 text-sm font-semibold">
            Plan activity
          </h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Changes to your access that did not come from one of your payments.
          </p>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-border divide-y">
                {activity.items.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </ul>
            </CardContent>
          </Card>
          <PagerBar
            page={activity.page}
            pageSize={activity.pageSize}
            total={activity.total}
            totalPages={activity.totalPages}
            loading={loading}
            onPageChange={setActivityPage}
            noun="change"
          />
        </section>
      ) : null}

      {!hasAnything ? null : (
        <p className="text-muted-foreground text-xs">
          Quote the reference next to a payment when contacting support about
          it.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------

/**
 * "Showing 1–10 of 25 payments" plus the pager.
 *
 * The range counter is not decoration. Paging without it leaves the
 * customer unable to tell whether they have reached the end of their own
 * records — which matters on a billing screen, where "is that all of
 * them?" is a question people actually need answered before they email
 * support. `Pagination` itself renders nothing at one page, so on a
 * short history this collapses to the count line alone.
 */
function PagerBar({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  onPageChange,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  noun: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  // Clamped to `total` so the last page reads "21–25 of 25" rather than
  // "21–30 of 25".
  const last = Math.min(page * pageSize, total);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-muted-foreground text-xs">
        {total <= pageSize ? (
          <>
            {total} {noun}
            {total === 1 ? '' : 's'}
          </>
        ) : (
          <>
            Showing {first}–{last} of {total} {noun}
            {total === 1 ? '' : 's'}
          </>
        )}
      </p>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={loading}
      />
    </div>
  );
}

// ------------------------------------------------------------

/**
 * One payment: a summary line always, full detail on demand.
 *
 * Collapsed by default because the common question is only "did it go
 * through, and what did it cover" — six more fields on every row buries
 * that under detail nobody asked for. Expanded it becomes a receipt:
 * every value the customer submitted, so they can check what we
 * actually received against their bank app without opening a ticket.
 */
function PaymentRow({ payment: p }: { payment: CustomerPaymentRecord }) {
  const [open, setOpen] = useState(false);
  const meta = PAYMENT_STATUS_META[p.status];
  const StatusIcon = meta.icon;

  // The payer's own figure disagreeing with the price in force is worth
  // surfacing, because it is the single most common reason a payment
  // gets rejected. Stated as a fact, without accusing anyone of
  // underpaying: rounding by their bank and deliberate part-payments are
  // both real, which is exactly why a human reviews these.
  const amountMismatch = Math.abs(p.paidAmount - p.expectedAmount) > 0.01;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
      >
        <span
          className={cn(
            'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
            meta.badge
          )}
        >
          <StatusIcon className="size-3.5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {p.planName}
            </span>
            <span className="text-muted-foreground text-xs">
              {p.cycleLabel}
            </span>
            <Badge className={cn('text-[10px]', meta.badge)}>
              {meta.label}
            </Badge>
          </span>

          {/* The coverage period is the answer to "what did this buy
              me", and it is only known once an admin approves — before
              that we show the submission date instead of an em dash,
              which would read as missing data. */}
          <span className="text-muted-foreground mt-1 block text-xs">
            {p.activatedFrom && p.activatedUntil ? (
              <>
                Covers {formatDate(p.activatedFrom)} –{' '}
                {formatDate(p.activatedUntil)}
              </>
            ) : (
              <>Submitted {formatDate(p.createdAt)}</>
            )}
            {' · '}
            <span className="font-mono">{p.reference}</span>
          </span>

          {/* The admin's message to the customer. Pulled up to the
              collapsed row for rejections specifically: it is the one
              case where the customer must act, and hiding "wrong UTR"
              behind a chevron guarantees a support ticket. */}
          {p.status === 'rejected' && p.reviewNote ? (
            <span className="border-destructive/25 bg-destructive/5 text-muted-foreground mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs">
              <AlertTriangle className="text-destructive mt-0.5 size-3 shrink-0" />
              <span>{p.reviewNote}</span>
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2 text-right">
          <span>
            <span className="text-foreground block text-sm font-semibold">
              {formatCurrency(p.paidAmount, p.currency)}
            </span>
            {amountMismatch ? (
              <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                price was {formatCurrency(p.expectedAmount, p.currency)}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              'text-muted-foreground size-4 transition-transform',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>

      {open ? (
        <dl className="border-border bg-muted/30 grid gap-x-6 gap-y-2.5 border-t px-4 py-3 text-xs sm:grid-cols-2">
          <Detail label="Transaction ID" mono value={p.transactionRef} />
          <Detail label="Reference" mono value={p.reference} />
          <Detail label="Paid by" value={p.payerName} />
          <Detail
            label="Paid on"
            value={p.paidAt ? formatDateTime(p.paidAt) : null}
          />
          {p.payerUpiId ? (
            <Detail label="UPI ID" mono value={p.payerUpiId} />
          ) : null}
          {p.payerBank ? <Detail label="Bank" value={p.payerBank} /> : null}
          <Detail
            label="Amount sent"
            value={formatCurrency(p.paidAmount, p.currency)}
          />
          <Detail
            label="Plan price then"
            value={formatCurrency(p.expectedAmount, p.currency)}
          />
          <Detail label="Submitted" value={formatDateTime(p.createdAt)} />
          <Detail
            label={p.status === 'rejected' ? 'Reviewed' : 'Approved'}
            value={p.reviewedAt ? formatDateTime(p.reviewedAt) : null}
          />
          {p.activatedFrom && p.activatedUntil ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Access granted</dt>
              <dd className="text-foreground mt-0.5 inline-flex items-center gap-1.5 font-medium">
                {formatDate(p.activatedFrom)}
                <ArrowRight className="text-muted-foreground size-3 shrink-0" />
                {formatDate(p.activatedUntil)}
              </dd>
            </div>
          ) : null}
          {/* Shown here for approved payments too — an admin can leave a
              note on an approval ("2 extra days for the delay") and the
              customer should see it. The rejected case is already
              surfaced above, so skip it to avoid printing it twice. */}
          {p.reviewNote && p.status !== 'rejected' ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Note from support</dt>
              <dd className="text-foreground mt-0.5">{p.reviewNote}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-foreground mt-0.5 font-medium break-all',
          mono && 'font-mono'
        )}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}

// ------------------------------------------------------------

function ActivityRow({ activity: a }: { activity: CustomerPlanActivity }) {
  const meta = ACTIVITY_META[a.eventType] ?? {
    label: a.eventType,
    icon: History,
    tone: 'text-muted-foreground bg-muted',
  };
  const Icon = meta.icon;
  const granted = formatGranted(a);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
          meta.tone
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-foreground text-sm font-medium">{meta.label}</p>
          {granted ? (
            <Badge
              className={cn(
                'text-[10px]',
                a.windowKind === 'trial'
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              )}
            >
              {granted}
              {a.windowKind === 'trial' ? ' trial' : ''}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {formatDate(a.createdAt)}
          {a.planName ? ` · ${a.planName}` : ''}
          {a.cycleLabel ? ` · ${a.cycleLabel}` : ''}
        </p>
      </div>

      {/* The resulting end date. The single fact a customer wants off
          this row: "so when do I lose access now?" */}
      {a.endsAt ? (
        <div className="shrink-0 text-right">
          <p className="text-muted-foreground text-[10px]">Access until</p>
          <p className="text-foreground text-xs font-medium">
            {formatDate(a.endsAt)}
          </p>
        </div>
      ) : null}
    </li>
  );
}
