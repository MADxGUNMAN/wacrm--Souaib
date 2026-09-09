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
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { BillingHistory } from '@/components/settings/billing-history';
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
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="bg-muted h-5 w-32 animate-pulse rounded" />
        <div className="bg-muted mt-3 h-4 w-48 animate-pulse rounded" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="border-destructive/25 bg-destructive/5 rounded-xl border p-6">
        <p className="text-destructive text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-foreground mt-3 inline-flex items-center gap-2 text-sm font-medium hover:underline"
        >
          <RefreshCw className="size-4" />
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const {
    state,
    subscription,
    copy,
    isOwner,
    pendingPayment,
    lastPayment,
    selectedPlan,
  } = data;

  // ------------------------------------------------------------
  // COVERAGE, not "the plan".
  //
  // The old version asked one question — `state.isActive` — and titled
  // the card from the answer. That is wrong whenever an account holds
  // TWO windows at once, which is the whole point of the Aug 2026
  // window-stacking design: a customer who pays DURING their trial keeps
  // the trial and gets the paid window queued behind it, so
  // `state.isActive` stays false and the card announced "Free Plan · You
  // are on a free trial" to someone who had just paid ₹44,160 and had an
  // Extended Yearly plan sitting in `subscription_ends_at`. It then
  // offered them an "Upgrade Plan" button.
  //
  // So the card is now built from the two windows the resolver already
  // gives us, in order: what is running NOW, and what comes NEXT.
  // ------------------------------------------------------------
  const isPaid = state.isActive && !state.billingDisabled;
  const queued = state.pendingWindow;

  /** Title + subtitle for the window running right now. */
  const nowTitle = state.billingDisabled
    ? copy.freePlanLabel
    : isPaid
      ? (subscription?.planName ?? 'Active plan')
      : state.isTrialing
        ? copy.freePlanLabel
        : (subscription?.planName ?? copy.freePlanLabel);

  const nowSubtitle = state.billingDisabled
    ? 'Billing is not enabled on this platform'
    : isPaid
      ? subscription?.cycleLabel
        ? // "renews" is a promise this app cannot keep — there is no
          // recurring billing, every period is a manual UPI transfer. Say
          // what is actually true.
          `${subscription.cycleLabel} · runs until ${formatDate(state.endsAt)}`
        : `Active until ${formatDate(state.endsAt)}`
      : state.isTrialing
        ? `Free trial · ends ${formatDate(state.endsAt)}`
        : state.isExpired
          ? (copy.expiredHeading ?? 'Your access has ended')
          : copy.freePlanSubtitle;

  /**
   * The last date this workspace has access, across BOTH windows.
   *
   * The single most useful fact on the screen and the one that was
   * impossible to find before: with two windows, neither `state.endsAt`
   * (the current one) nor the queued one answers "when do I actually
   * lose access?" on its own. A queued window only exists when it ends
   * later than the current one, so it wins whenever it is present.
   */
  const accessUntil = queued?.endsAt ?? state.endsAt;

  /**
   * Is the workspace covered by something already paid for or granted?
   *
   * Drives both the CTA wording and whether an old rejection is worth
   * shouting about. Someone with a queued paid plan is not "upgrading",
   * they are already a customer.
   */
  const hasPaidCoverage = isPaid || queued?.type === 'active';

  return (
    <div className="space-y-5">
      {/* "renewal date" was a promise this app cannot keep — there is no
          recurring billing, every period is a manual UPI transfer that an
          admin verifies. Saying "when it ends" is both accurate and more
          useful, because ending is the thing the customer must act on. */}
      <SettingsPanelHead
        title="Billing & plan"
        description="What your workspace has access to, when it ends, and every payment you have made."
      />

      {/* ---- Plan card ---- */}
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <div
          className={cn(
            'bg-gradient-to-r p-6',
            isPaid
              ? 'via-primary/[0.05] from-emerald-500/[0.08] to-transparent'
              : state.isExpired
                ? 'from-destructive/[0.08] via-destructive/[0.03] to-transparent'
                : 'from-primary/[0.07] via-primary/[0.03] to-transparent'
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
                Current
              </p>
              <div className="flex items-center gap-2">
                <h3 className="text-foreground text-lg font-semibold tracking-tight">
                  {nowTitle}
                </h3>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Active
                  </span>
                ) : state.isExpired ? (
                  <span className="bg-destructive/15 text-destructive inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <AlertTriangle className="size-3" />
                    Expired
                  </span>
                ) : state.isTrialing ? (
                  <span className="bg-primary/15 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <Clock className="size-3" />
                    Trial
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {nowSubtitle}
              </p>
            </div>

            {/* The countdown now covers the paid window too, not just the
                trial. "31 days left" is exactly as useful to someone on a
                plan as to someone on a trial, and hiding it was why a
                paid customer had to do date arithmetic in their head. */}
            {state.daysLeft !== null && !state.billingDisabled ? (
              <div className="text-right">
                <p className="text-foreground text-2xl font-bold tracking-tight">
                  {state.daysLeft}
                </p>
                <p className="text-muted-foreground text-xs">
                  {state.daysLeft === 1 ? 'day left' : 'days left'}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* ---- UP NEXT: the queued window ----
            THE FIX for "billing shows only the free tier, not the
            upcoming paid one". This whole row did not exist, so a
            customer who paid during their trial had no way to see the
            plan they had bought — the data was in `subscription_ends_at`
            the entire time and simply never rendered. */}
        {queued ? (
          <div className="border-border bg-muted/30 border-t px-6 py-4">
            <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
              Up next
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
                    queued.type === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {queued.type === 'active' ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">
                    {queued.type === 'active'
                      ? [subscription?.planName, subscription?.cycleLabel]
                          .filter(Boolean)
                          .join(' · ') || 'Paid plan'
                      : `${queued.durationDays} bonus trial ${
                          queued.durationDays === 1 ? 'day' : 'days'
                        }`}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Starts {formatDate(queued.startsAt)} · runs until{' '}
                    {formatDate(queued.endsAt)}
                  </p>
                </div>
              </div>

              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                  queued.type === 'active'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-primary/15 text-primary'
                )}
              >
                {queued.type === 'active' ? 'Already paid' : 'Free bonus'}
              </span>
            </div>

            <p className="text-muted-foreground mt-3 text-xs">
              {queued.type === 'active'
                ? 'Your trial runs to the end first — nothing is wasted. The plan takes over automatically, with no action needed from you.'
                : 'These extra days start automatically once your paid plan ends.'}
            </p>
          </div>
        ) : null}

        {/* ---- The one date that matters ----
            Only worth its own row when the two windows disagree.
            Otherwise it would just repeat the line above it. */}
        {queued && accessUntil ? (
          <div className="border-border flex flex-wrap items-center gap-2 border-t px-6 py-3">
            <CalendarCheck className="text-muted-foreground size-4 shrink-0" />
            <p className="text-foreground text-sm">
              You have access until{' '}
              <span className="font-semibold">{formatDate(accessUntil)}</span>
            </p>
          </div>
        ) : null}

        {/* ---- Action row ---- */}
        <div className="border-border border-t p-6">
          {pendingPayment ? (
            // A payment awaiting manual verification: suppress the
            // upgrade CTA so the customer doesn't pay twice while we
            // check the first transfer.
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">
                    Payment under review
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {copy.pendingReviewMessage ??
                      'We are verifying your payment and will activate your subscription shortly.'}
                  </p>
                </div>
              </div>
              <dl className="bg-muted/40 grid gap-x-6 gap-y-2 rounded-lg p-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="text-foreground font-medium">
                    {pendingPayment.planName} · {pendingPayment.cycleLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Amount paid</dt>
                  <dd className="text-foreground font-medium">
                    {formatCurrency(
                      pendingPayment.paidAmount,
                      pendingPayment.currency
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Transaction ID</dt>
                  <dd className="text-foreground font-mono text-xs">
                    {pendingPayment.transactionRef}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="text-foreground font-medium">
                    {formatDate(pendingPayment.submittedAt)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void refresh()}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
              >
                <RefreshCw className="size-3.5" />
                Refresh status
              </button>
            </div>
          ) : isOwner ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/upgrade-plan"
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                  // Someone already covered is not being sold to. A
                  // primary-filled "Upgrade Plan" aimed at a customer who
                  // paid an hour ago reads as "your payment didn't
                  // count", so once coverage exists this drops to a
                  // secondary control.
                  hasPaidCoverage
                    ? 'border-border text-foreground hover:bg-muted border bg-transparent'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                <Sparkles className="size-4" />
                {hasPaidCoverage ? 'Change or extend plan' : 'Upgrade Plan'}
              </Link>
              {state.billingDisabled ? (
                <span className="text-muted-foreground text-xs">
                  Billing is currently disabled platform-wide.
                </span>
              ) : hasPaidCoverage ? (
                <span className="text-muted-foreground text-xs">
                  Nothing to do — you are covered until{' '}
                  {formatDate(accessUntil)}.
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only the workspace owner can change the subscription.
            </p>
          )}

          {/* Rejection feedback. Without this a customer whose payment
              bounced has no idea why and opens a support ticket.
              
              Suppressed once the workspace HAS coverage. `lastPayment` is
              simply the most recent row, so a customer who submitted a
              bad UTR, got it rejected, then paid again successfully was
              shown a red "your last payment could not be verified" box
              directly under a plan they had already bought — the
              rejection outranked the approval purely by being newer. It
              still appears in Payment history below with its note, which
              is the right place for a settled, superseded attempt. */}
          {!pendingPayment &&
          !hasPaidCoverage &&
          lastPayment?.status === 'rejected' ? (
            <div className="border-destructive/25 bg-destructive/5 mt-4 rounded-lg border p-4">
              <p className="text-destructive flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4" />
                Your last payment could not be verified
              </p>
              {lastPayment.reviewNote ? (
                <p className="text-muted-foreground mt-1.5 text-sm">
                  {lastPayment.reviewNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- UPCOMING PLAN, NOT YET PAID ----
          The plan the customer picked at signup and chose to trial rather
          than buy. It is an intention, not coverage, which is why it gets
          its own card below the live one instead of a row inside it —
          mixing "what you have" with "what you owe" in one card is how a
          customer ends up believing they have already paid.

          Deliberately narrow visibility:
            selectedPlan      there is a choice on record, and it still
                              resolves to a visible, priced cycle
            !hasPaidCoverage  once they pay, the real subscription rows
                              take over and this would be a stale echo
            !pendingPayment   a submitted payment is already summarised in
                              the card above; a "Pay now" button beside it
                              invites paying twice
            isOwner           a member cannot pay, so for them this would
                              be an unpayable bill

          The amount is shown because "Not paid" without a figure is a
          worry, not information. */}
      {isOwner && selectedPlan && !hasPaidCoverage && !pendingPayment ? (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-primary/10 text-primary mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full">
                <CalendarCheck className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  {copy.upcomingPlanLabel ?? 'Upcoming plan'}
                </p>
                <p className="text-foreground mt-1 text-base font-semibold">
                  {[selectedPlan.planName, selectedPlan.cycleLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {formatCurrency(selectedPlan.amount, selectedPlan.currency)}
                  {accessUntil ? (
                    <> · due by {formatDate(accessUntil)}</>
                  ) : null}
                </p>
              </div>
            </div>

            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3" />
              {copy.upcomingUnpaidLabel ?? 'Not paid'}
            </span>
          </div>

          <p className="text-muted-foreground px-6 pt-3 text-xs">
            {accessUntil
              ? `This is the plan we will bill you for. Pay any time before ${formatDate(accessUntil)} to keep your workspace running without a gap.`
              : 'This is the plan we will bill you for. Pay any time to activate it.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 px-6 pb-5">
            <Link
              href={`/upgrade-plan/payment?plan=${encodeURIComponent(selectedPlan.planId)}&cycle=${encodeURIComponent(selectedPlan.cycleId)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <CreditCard className="size-4" />
              {copy.payNowLabel ?? 'Pay now'}
            </Link>
            {/* Straight to the chooser, not preselected: changing the plan
                is the whole point, so landing on the current one with no
                alternatives visible would defeat it. */}
            <Link
              href="/upgrade-plan"
              className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <RefreshCw className="size-3.5" />
              {copy.changePlanLabel ?? 'Change plan'}
            </Link>
          </div>
        </div>
      ) : null}

      {/* ---- History ----
          Its own component with its own fetch rather than more fields on
          the `useSubscription` snapshot: that store is shared with the
          trial banner and the app shell, which mount on nearly every
          page and must not start pulling a payment list they never
          render. This loads only when the billing tab is open. */}
      <BillingHistory />

      {/* ---- Support note ---- */}
      {copy.supportNote ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
          {copy.supportNote}
        </p>
      ) : null}
    </div>
  );
}
