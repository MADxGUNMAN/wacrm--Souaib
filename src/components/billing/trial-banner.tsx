'use client';

// ============================================================
// Trial banner — the strip above dashboard content that counts down the
// free trial and offers an upgrade.
//
// Renders nothing unless the account is genuinely in trial with nothing
// lined up behind it. Five states deliberately produce no banner:
//   - initial load (avoids a flash of "null days left")
//   - billing disabled platform-wide
//   - already blocked (Proxy is redirecting to /upgrade-plan, so a
//     banner would be noise on a page that's about to unmount)
//   - active paid user
//   - ANY queued second window — the customer is already covered, so
//     there is no action to prompt. See the guard below.
//
// The wording comes from `subscription_settings.trial_banner_template`
// and is resolved server-side, so an operator can reword or translate it
// without a deploy.
// ============================================================

import Link from 'next/link';
import { Clock, AlertTriangle } from 'lucide-react';

import { useSubscription } from '@/hooks/use-subscription';
import { cn } from '@/lib/utils';

export function TrialBanner() {
  const { data, showTrialBanner } = useSubscription();

  // A member can't pay, so pointing them at the pricing page would be a
  // dead end. They still see the countdown — it's their workspace too —
  // just without the CTA.
  const isOwner = data?.isOwner ?? false;
  const daysLeft = data?.state.daysLeft ?? null;
  const pendingPayment = data?.pendingPayment ?? null;
  const pendingWindow = data?.state.pendingWindow ?? null;

  // A submitted payment awaiting verification outranks the countdown:
  // the useful message is "we're checking", not "you have 3 days left".
  if (pendingPayment && data) {
    return (
      <div className="mx-4 mt-3 flex shrink-0 flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5 sm:items-center">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-500 sm:mt-0" />
          <p className="text-foreground text-sm">
            {data.copy.pendingReviewMessage ??
              'Your payment is under review. We will activate your subscription once it is verified.'}
          </p>
        </div>
        <span className="shrink-0 self-start rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 sm:self-auto dark:text-amber-400">
          {pendingPayment.planName} · {pendingPayment.cycleLabel}
        </span>
      </div>
    );
  }

  // ---- A second window is already queued: NO BANNER ----
  //
  // This bar exists to create urgency and drive an upgrade. Once a
  // second window is queued there is no urgency left to create: the
  // customer has already paid (trial -> paid queued) or has already been
  // given bonus time (paid -> trial queued), and access continues
  // without them lifting a finger.
  //
  // It used to render "7 days trial · Subscription starts Aug 29 / ✓
  // Plan activated" here, which is a status report, not a call to
  // action — and it sat on top of every single page in the app telling
  // someone who had just paid that they were still on a trial. That is
  // exactly the moment a customer wonders whether their money went
  // through. The full picture (both windows, dates, what happens when)
  // belongs on the Billing & plan screen and on /upgrade-plan, where
  // someone has gone LOOKING for it — and that is where it now lives.
  if (pendingWindow) return null;

  // ---- Standard trial banner (no queued window) ----
  if (!showTrialBanner || !data || daysLeft === null) return null;

  // Escalate the styling as the deadline closes in. Three days is the
  // point where an owner realistically needs to act to avoid an
  // interruption.
  const isUrgent = daysLeft <= 3;

  return (
    <div
      className={cn(
        'mx-4 mt-3 flex shrink-0 flex-col gap-3 rounded-xl border px-4 py-2.5 sm:mx-6 sm:flex-row sm:items-center sm:justify-between',
        isUrgent
          ? 'border-destructive/25 bg-destructive/[0.06]'
          : 'border-border bg-muted/40'
      )}
    >
      <div className="flex items-start gap-2.5 sm:items-center">
        {isUrgent ? (
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0 sm:mt-0" />
        ) : (
          <Clock className="text-primary mt-0.5 size-4 shrink-0 sm:mt-0" />
        )}
        <p className="text-foreground text-sm font-medium">
          {data.copy.trialBanner}
        </p>
      </div>

      {isOwner ? (
        <Link
          href="/upgrade-plan"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
            isUrgent
              ? 'bg-destructive hover:bg-destructive/90 text-white'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {data.copy.trialBannerCta}
        </Link>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">
          Ask your workspace owner to upgrade
        </span>
      )}
    </div>
  );
}
