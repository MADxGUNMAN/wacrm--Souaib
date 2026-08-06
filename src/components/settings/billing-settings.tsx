'use client';

// ============================================================
// Settings → Billing & plan.
//
// Shows the current plan state and, for the owner, the way to upgrade or
// renew. Mirrors the reference design: a soft gradient plan card with the
// plan name and a one-line status, then the action below a divider.
//
// Labels come from `subscription_settings` (`free_plan_label`,
// `free_plan_subtitle`) so an operator can rename "Free Plan" without a
// deploy. Members see the same status but no purchase action, since
// buying is owner-only.
// ============================================================

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { useSubscription } from '@/hooks/use-subscription';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function BillingSettings() {
  const { data, loading, error, refresh } = useSubscription();

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
        >
          <RefreshCw className="size-4" />
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { state, subscription, copy, isOwner, pendingPayment, lastPayment } = data;

  // Three presentations, chosen by live state rather than the stored
  // status column (which goes stale — see resolveSubscriptionState).
  const isPaid = state.isActive && !state.billingDisabled;
  const planTitle = isPaid
    ? (subscription?.planName ?? 'Active plan')
    : copy.freePlanLabel;

  const planSubtitle = state.billingDisabled
    ? 'Billing is not enabled on this platform'
    : isPaid
      ? subscription?.cycleLabel
        ? `${subscription.cycleLabel} · renews ${formatDate(state.endsAt)}`
        : `Active until ${formatDate(state.endsAt)}`
      : state.isExpired
        ? (copy.expiredHeading ?? 'Your access has ended')
        : copy.freePlanSubtitle;

  return (
    <div className="space-y-5">
      <SettingsPanelHead
        title="Billing & plan"
        description="Your workspace subscription, renewal date, and payment history."
      />

      {/* ---- Plan card ---- */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          className={cn(
            'bg-gradient-to-r p-6',
            isPaid
              ? 'from-emerald-500/[0.08] via-primary/[0.05] to-transparent'
              : state.isExpired
                ? 'from-destructive/[0.08] via-destructive/[0.03] to-transparent'
                : 'from-primary/[0.07] via-primary/[0.03] to-transparent',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {planTitle}
                </h3>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Active
                  </span>
                ) : state.isExpired ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                    <AlertTriangle className="size-3" />
                    Expired
                  </span>
                ) : state.isTrialing ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Clock className="size-3" />
                    Trial
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{planSubtitle}</p>
            </div>

            {state.isTrialing && state.daysLeft !== null ? (
              <div className="text-right">
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {state.daysLeft}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.daysLeft === 1 ? 'day left' : 'days left'}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* ---- Action row ---- */}
        <div className="border-t border-border p-6">
          {pendingPayment ? (
            // A payment awaiting manual verification: suppress the
            // upgrade CTA so the customer doesn't pay twice while we
            // check the first transfer.
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Payment under review
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {copy.pendingReviewMessage ??
                      'We are verifying your payment and will activate your subscription shortly.'}
                  </p>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-2 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium text-foreground">
                    {pendingPayment.planName} · {pendingPayment.cycleLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Amount paid</dt>
                  <dd className="font-medium text-foreground">
                    {formatCurrency(pendingPayment.paidAmount, pendingPayment.currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Transaction ID</dt>
                  <dd className="font-mono text-xs text-foreground">
                    {pendingPayment.transactionRef}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(pendingPayment.submittedAt)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
                Refresh status
              </button>
            </div>
          ) : isOwner ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/upgrade-plan"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Sparkles className="size-4" />
                {isPaid ? 'Change or renew plan' : 'Upgrade Plan'}
              </Link>
              {state.billingDisabled ? (
                <span className="text-xs text-muted-foreground">
                  Billing is currently disabled platform-wide.
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only the workspace owner can change the subscription.
            </p>
          )}

          {/* Rejection feedback. Without this a customer whose payment
              bounced has no idea why and opens a support ticket. */}
          {!pendingPayment && lastPayment?.status === 'rejected' ? (
            <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" />
                Your last payment could not be verified
              </p>
              {lastPayment.reviewNote ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {lastPayment.reviewNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- Support note ---- */}
      {copy.supportNote ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
          {copy.supportNote}
        </p>
      ) : null}
    </div>
  );
}
