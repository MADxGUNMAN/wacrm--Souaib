'use client';

// ============================================================
// Trial banner — the strip above dashboard content that counts down the
// free trial and offers an upgrade.
//
// Renders nothing unless the account is genuinely in trial. Three states
// deliberately produce no banner:
//   - initial load (avoids a flash of "null days left")
//   - billing disabled platform-wide
//   - already blocked (Proxy is redirecting to /upgrade-plan, so a
//     banner would be noise on a page that's about to unmount)
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

  // A submitted payment awaiting verification outranks the countdown:
  // the useful message is "we're checking", not "you have 3 days left".
  if (pendingPayment && data) {
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5 sm:items-center">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-500 sm:mt-0" />
          <p className="text-sm text-foreground">
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

  if (!showTrialBanner || !data || daysLeft === null) return null;

  // Escalate the styling as the deadline closes in. Three days is the
  // point where an owner realistically needs to act to avoid an
  // interruption.
  const isUrgent = daysLeft <= 3;

  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        isUrgent
          ? 'border-destructive/25 bg-destructive/[0.06]'
          : 'border-border bg-muted/40',
      )}
    >
      <div className="flex items-start gap-2.5 sm:items-center">
        {isUrgent ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive sm:mt-0" />
        ) : (
          <Clock className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" />
        )}
        <p className="text-sm font-medium text-foreground">
          {data.copy.trialBanner}
        </p>
      </div>

      {isOwner ? (
        <Link
          href="/upgrade-plan"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            isUrgent
              ? 'bg-destructive text-white hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {data.copy.trialBannerCta}
        </Link>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          Ask your workspace owner to upgrade
        </span>
      )}
    </div>
  );
}
