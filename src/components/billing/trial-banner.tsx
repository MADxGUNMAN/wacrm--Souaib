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
import { Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

import { renewHref } from '@/lib/billing/razorpay/links';
import { useSubscription } from '@/hooks/use-subscription';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import { fromMinor } from '@/lib/billing/razorpay/money';
import { formatPlanAmount } from '@/lib/billing/money-format';
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

  // ---- AutoPay needs attention (plan section 4, rows 8 and 11) ----
  //
  // Shown on every page, ahead of everything below, because the customer
  // is still in the CRM (grace or paid time remaining) and this is the
  // moment acting is cheap. Members see the facts without the CTA.
  const autopay = data?.autopay ?? null;
  if (
    data &&
    autopay &&
    !data.state.isBlocked &&
    (autopay.display.key === 'payment_failed_retrying' ||
      autopay.display.key === 'action_needed')
  ) {
    const stopped = autopay.display.key === 'action_needed';
    const until = formatBillingDate(data.state.endsAt);
    return (
      <div
        role="status"
        className="border-destructive/25 bg-destructive/[0.06] mx-4 mt-3 flex shrink-0 flex-col gap-3 rounded-xl border px-4 py-2.5 sm:mx-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2.5 sm:items-center">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0 sm:mt-0" />
          <p className="text-foreground text-sm">
            {stopped
              ? `AutoPay stopped after failed payments.${until ? ` Renew before ${until} to keep access.` : ' Renew to keep access.'}`
              : `AutoPay payment failed${autopay.lastFailure ? `: ${autopay.lastFailure}` : '.'} Razorpay will retry automatically.`}
          </p>
        </div>
        {isOwner ? (
          <Link
            href={stopped ? renewHref(autopay) : '/settings?tab=billing'}
            className="bg-destructive hover:bg-destructive/90 inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-colors"
          >
            {stopped ? 'Renew now' : 'Manage billing'}
          </Link>
        ) : (
          <span className="text-muted-foreground shrink-0 text-xs">
            Ask your workspace owner to check billing
          </span>
        )}
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

  // ---- Trial with AutoPay already authorised ----
  // There is nothing to upgrade to: the first charge is booked for the
  // trial's end. A countdown with an "Upgrade" button would suggest the
  // set-up did not work. Calm, informational, no CTA.
  if (autopay?.display.key === 'autopay_authorised') {
    const ends = formatBillingDate(data.state.endsAt);
    const first = formatBillingDate(
      autopay.firstChargeAt ?? autopay.nextChargeAt
    );
    let amount = '';
    try {
      amount = formatPlanAmount(
        fromMinor(autopay.amountMinor, autopay.currency),
        autopay.currency
      );
    } catch {
      amount = '';
    }
    return (
      <div className="border-border bg-muted/40 mx-4 mt-3 flex shrink-0 items-start gap-2.5 rounded-xl border px-4 py-2.5 sm:mx-6 sm:items-center">
        <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p className="text-foreground text-sm">
          {ends ? `Trial ends ${ends}` : 'Free trial'} · AutoPay set up
          {first
            ? ` (${amount ? `${amount} on ` : 'first charge '}${first})`
            : ''}
        </p>
      </div>
    );
  }

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
