'use client';

// ============================================================
// /upgrade-plan — the plan chooser.
//
// SHAPE OF THIS PAGE (changed in migration 055): one product, priced on
// two day-based terms, plus a Custom enquiry card.
//
//   Monthly   ₹30 / day   = ₹900 for 30 days
//   Yearly    ₹25 / day   = ₹9,000 for 360 days   ← recommended
//   Custom    Let's talk  → sales
//
// So a CARD IS A BILLING CYCLE, not a tier. Every paid term includes
// every feature, which is why the feature list is no longer duplicated
// inside each card — it appears once, below them, as a single source of
// truth instead of three lists that drift apart.
//
// The headline is the DAILY rate because that is the number that makes
// the decision easy; the true total is stated directly underneath so the
// page never obscures what will actually be charged.
//
// Invariant: the page sells the FIRST visible plan by position. The
// catalogue can still hold retired plans (hidden, so historical payment
// records keep resolving) without them appearing here.
//
// Every string, price, badge and feature line still comes from the
// database via /api/billing/plans. Nothing here is hardcoded.
//
// Owner-only by product decision. A member who reaches this URL is sent
// to /subscription-required, which tells them who can actually pay.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import { UpgradeHeader } from '@/components/billing/upgrade-header';
import { useSubscription } from '@/hooks/use-subscription';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/currency';
import {
  deriveDaySavings,
  findPrice,
  formatPriceEquals,
  normalisePlanFeatures,
  perDayAmount,
  toAmount,
  visibleCycles,
} from '@/lib/subscription/plans';
import { formatTrialBadge } from '@/lib/subscription/status';
import type { BillingCycle, PlansBundle } from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

/** A cycle resolved into everything the card needs to render. */
interface CycleOffer {
  cycle: BillingCycle;
  /** Full amount charged for the term. */
  total: number;
  /** Headline daily rate. */
  perDay: number;
  days: number;
  /** Total saved over the term vs the priciest daily rate. */
  savings: number | null;
}

function formatCoverageDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * "You already have access until X — buying now adds time on top."
 *
 * Renders only when there is genuinely something to reassure the
 * customer about. Silent for a blocked account (the destructive notice
 * above already owns that case and two stacked banners would bury the
 * pricing) and silent when there is no window at all.
 */
function CurrentCoverageNotice({
  subscription,
}: {
  subscription: ReturnType<typeof useSubscription>['data'];
}) {
  if (!subscription) return null;
  const { state, subscription: plan } = subscription;
  if (state.isBlocked || state.billingDisabled) return null;

  // Silent on a first visit, when the customer has not chosen a plan yet.
  // The trigger grants the trial at signup, so the account is technically
  // already trialing the moment they arrive — but telling them "you are
  // on a free trial, access runs to Sep 8" before they have picked
  // anything reads as "this is settled, nothing to do here", which is the
  // opposite of what the page is asking. It reappears on later visits,
  // when they really are extending live coverage.
  if (subscription.planSelectionRequired) return null;

  const queued = state.pendingWindow;
  // A queued window always outlives the current one, so it is the real
  // end of coverage whenever it exists.
  const accessUntil = formatCoverageDate(queued?.endsAt ?? state.endsAt);
  if (!accessUntil) return null;

  const paidQueued = queued?.type === 'active';
  const paidLabel =
    [plan?.planName, plan?.cycleLabel].filter(Boolean).join(' · ') ||
    'your plan';

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
      <p className="text-foreground flex items-start justify-center gap-2 text-sm">
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        <span>
          {paidQueued ? (
            <>
              <span className="font-medium">{paidLabel}</span> is already paid
              for and starts {formatCoverageDate(queued.startsAt)}.
            </>
          ) : state.isActive ? (
            <>
              You are on <span className="font-medium">{paidLabel}</span>.
            </>
          ) : (
            <>You are on a free trial.</>
          )}{' '}
          <span className="text-muted-foreground">
            Access runs to {accessUntil}.
          </span>
        </span>
      </p>
      {/* The point of the whole notice. Renewing early is safe, and
          nobody should have to take that on faith. */}
      <p className="text-muted-foreground mt-1.5 text-center text-xs">
        Buying now does not replace it — the new term is added on top, starting{' '}
        {accessUntil}.
      </p>
    </div>
  );
}

export default function UpgradePlanPage() {
  const router = useRouter();
  // `refresh` matters on the trial path: the shell shares one snapshot,
  // and if it still says a plan choice is outstanding the dashboard will
  // bounce straight back here.
  const { data: subscription, refresh } = useSubscription();

  const [bundle, setBundle] = useState<PlansBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // 1. Check session immediately on mount
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.replace('/login');
      }
    });

    // 2. Listen to auth state transitions (e.g. sign-out in this or another tab)
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.replace('/login');
      }
    });

    // 3. Handle Back-Forward Cache (bfcache) restorations when navigating back
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            window.location.replace('/login');
          }
        });
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => {
      authSub.unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/billing/plans', { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 401) {
            window.location.replace('/login');
            return;
          }
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? 'Could not load plans');
        }
        const data = (await res.json()) as PlansBundle;
        if (!active) return;
        setBundle(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load plans');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // A member can't transact; send them somewhere they can act.
  useEffect(() => {
    if (subscription && !subscription.isOwner) {
      router.replace('/subscription-required');
    }
  }, [subscription, router]);

  // If a payment is already awaiting verification, choosing another plan
  // invites a duplicate transfer. Push them to the status view instead.
  useEffect(() => {
    if (subscription?.pendingPayment) {
      router.replace('/upgrade-plan/payment?status=pending');
    }
  }, [subscription, router]);

  const settings = bundle?.settings;
  const currency = settings?.currency ?? 'INR';

  /**
   * Should the trial be offered on this visit?
   *
   * Three things all have to hold, and each rules out a case where the
   * button would be a lie:
   *
   *   show_trial_badges  the operator has the trial flow switched on
   *   trial_days > 0     there is actually a trial to give
   *   !isBlocked         their trial (or plan) has already run out — the
   *                      only way forward now is to pay, so offering to
   *                      "start with trial" would be a dead end
   *
   * `hasPaidCoverage` is checked too: someone who already paid is
   * extending a plan, not starting a trial.
   */
  const trialDays = settings?.trial_days ?? 0;
  const hasPaidCoverage =
    subscription?.state.isActive === true ||
    subscription?.state.pendingWindow?.type === 'active';
  const showTrialOffer =
    settings?.show_trial_badges === true &&
    trialDays > 0 &&
    !subscription?.state.isBlocked &&
    !subscription?.state.billingDisabled &&
    !hasPaidCoverage;

  /**
   * Badge text, `{days}` filled from `trial_days`.
   *
   * Substituted here rather than stored literal so the card can never
   * advertise a 14-day trial while the panel two tabs away grants 7.
   */
  const trialBadge = formatTrialBadge(
    settings?.trial_badge_template ?? '{days} days free trial',
    trialDays
  );
  const noCardLabel =
    settings?.no_card_label ?? 'No card or payment required';

  /**
   * The escape hatch back into the CRM — or the deliberate absence of one.
   *
   * Withheld in two cases, both because the link would be a trap that
   * Proxy bounces straight back here:
   *
   *   isBlocked              access has lapsed; there is nothing to go
   *                          back to until they pay
   *   planSelectionRequired  a first visit. The choice IS the gate, so
   *                          "Back to dashboard" would sidestep the one
   *                          thing this page exists to collect, and land
   *                          the user in a redirect loop.
   *
   * Waits for `subscription` to resolve rather than defaulting to shown:
   * on a first visit the link would be dead for exactly as long as it was
   * visible, and flashing it then yanking it away is worse than having it
   * arrive a beat late.
   *
   * "Start with trial" is the real way past this page, and it sits next
   * to Continue where a decision belongs — not in the corner.
   */
  const backButton =
    subscription &&
    !subscription.state.isBlocked &&
    !subscription.planSelectionRequired
      ? { href: '/dashboard', label: 'Back to dashboard' }
      : null;

  /** The product being sold. See the invariant in the file header. */
  const plan = useMemo(
    () =>
      bundle?.plans
        .filter((p) => p.is_visible)
        .sort((a, b) => a.position - b.position)[0] ?? null,
    [bundle]
  );

  const features = useMemo(
    () => (plan ? normalisePlanFeatures(plan.features) : []),
    [plan]
  );

  /**
   * The Custom card's own bullets.
   *
   * Kept separate from `features` because the shared list below the cards
   * describes what every priced term includes; these describe what an
   * enquiry gets you *on top of* that, so they cannot be the same list.
   */
  const customFeatures = useMemo(
    () => normalisePlanFeatures(settings?.custom_plan_features),
    [settings?.custom_plan_features]
  );

  /**
   * Priced, visible cycles with their per-day rate and savings.
   *
   * The savings baseline is the DEAREST daily rate on offer, computed
   * across the set rather than hardcoded to "monthly" — so if an operator
   * adds a weekly term, the comparison still means something.
   */
  const offers = useMemo<CycleOffer[]>(() => {
    if (!bundle || !plan) return [];

    const priced = visibleCycles(bundle.cycles).flatMap((cycle) => {
      const price = findPrice(bundle.prices, plan.id, cycle.id);
      if (!price || !price.is_visible) return [];

      const total = toAmount(price.amount);
      const perDay = perDayAmount({
        amount: total,
        cycle,
        perDayOverride: price.per_day_amount,
      });
      // A cycle with no day-based term cannot show a daily rate, and this
      // layout has nothing else to show. Skipped rather than rendered
      // half-empty.
      if (perDay === null || !cycle.duration_days) return [];

      return [{ cycle, total, perDay, days: cycle.duration_days }];
    });

    const baseline = priced.reduce<number | null>(
      (max, o) => (max === null || o.perDay > max ? o.perDay : max),
      null
    );

    return priced.map((o) => ({
      ...o,
      savings: deriveDaySavings({
        perDay: o.perDay,
        baselinePerDay: baseline,
        days: o.days,
      }),
    }));
  }, [bundle, plan]);

  // Seed the selection from the admin's configured default once offers
  // are known, so the page opens on the term they want to sell.
  useEffect(() => {
    if (cycleId || offers.length === 0) return;
    const preferred =
      offers.find((o) => o.cycle.is_default) ??
      offers.find((o) => o.cycle.is_recommended) ??
      offers[0];
    setCycleId(preferred.cycle.id);
  }, [offers, cycleId]);

  const selected = useMemo(
    () => offers.find((o) => o.cycle.id === cycleId) ?? null,
    [offers, cycleId]
  );

  /**
   * Persist the choice, then go wherever the caller asked.
   *
   * Both CTAs route through here because in BOTH cases we now know what
   * the customer wants, and remembering it is what makes the rest of the
   * flow work:
   *
   *   - "Start with trial" needs it so that when the trial lapses we can
   *     send them to the term they picked instead of a fresh price list.
   *   - "Continue to payment" needs it so an abandoned checkout is
   *     recoverable, and so Billing can show an unpaid upcoming plan.
   *
   * It also clears `plan_selection_required`, which is what releases a
   * new signup into the CRM.
   *
   * A save failure on the PAY path is deliberately NOT fatal: the payment
   * screen prices itself from the query params, so the customer can still
   * pay. Blocking a purchase because a convenience column would not write
   * is the wrong trade. On the TRIAL path it IS fatal — without the saved
   * flag the proxy would bounce them straight back here, which would look
   * like the button did nothing.
   */
  const [saving, setSaving] = useState<'pay' | 'trial' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const choosePlan = useCallback(
    async (intent: 'pay' | 'trial') => {
      if (!selected || !plan || saving) return;
      setSaving(intent);
      setSaveError(null);

      const paymentHref = `/upgrade-plan/payment?plan=${encodeURIComponent(plan.id)}&cycle=${encodeURIComponent(selected.cycle.id)}`;

      let saved = false;
      try {
        const res = await fetch('/api/billing/select-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id, cycleId: selected.cycle.id }),
        });
        saved = res.ok;
        if (!res.ok && intent === 'trial') {
          const body = await res.json().catch(() => ({}));
          setSaveError(
            body?.error ?? 'Could not start your trial. Please try again.'
          );
          setSaving(null);
          return;
        }
      } catch {
        if (intent === 'trial') {
          setSaveError('Could not reach the server. Please try again.');
          setSaving(null);
          return;
        }
      }

      if (intent === 'pay') {
        router.push(paymentHref);
        return;
      }

      // Trial: straight into the CRM. `refresh()` first so the shell's
      // shared snapshot no longer says a plan choice is outstanding —
      // without it the dashboard would render against stale state that
      // still wants to redirect here.
      if (saved) await refresh();
      router.push('/dashboard');
    },
    [selected, plan, saving, router, refresh]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary size-7 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <UpgradeHeader backButton={backButton} />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <TriangleAlert className="text-destructive mx-auto size-8" />
          <p className="text-destructive mt-4 text-sm">{error}</p>
        </div>
      </>
    );
  }

  const showCustom = settings?.show_custom_plan === true;
  // Three across only when there is genuinely a third card, otherwise two
  // cards stretched over a 3-column grid look like something failed.
  const columns = offers.length + (showCustom ? 1 : 0);

  return (
    <div className="flex min-h-screen flex-col">
      <UpgradeHeader backButton={backButton} />

      {/* pb-32 clears the sticky summary bar. */}
      <main className="flex-1 px-4 pb-32 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* ---- Heading ---- */}
          <div className="pt-6 pb-10 text-center sm:pt-12">
            <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-4xl">
              {settings?.page_heading ?? 'Choose your plan'}
            </h1>
            {settings?.page_subheading ? (
              <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-sm sm:text-base">
                {settings.page_subheading}
              </p>
            ) : null}

            {subscription?.state.isBlocked ? (
              <div className="border-destructive/25 bg-destructive/[0.07] mx-auto mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <TriangleAlert className="text-destructive size-3.5" />
                <span className="text-destructive text-sm font-medium">
                  {subscription.copy.expiredHeading ??
                    'Your access has ended. Choose a plan to continue.'}
                </span>
              </div>
            ) : null}

            {/* ---- What you already have ----
                This page previously said nothing about existing coverage,
                which is a money problem rather than a cosmetic one: a
                customer who had already paid saw a bare pricing grid with
                no acknowledgement of it, and the obvious reading of that
                is "my payment didn't register". The genuinely reassuring
                fact — that buying again EXTENDS from the end of what they
                already hold rather than replacing it — is what
                `activateSubscription` actually does, and it was never
                stated anywhere the customer could see. */}
            <CurrentCoverageNotice subscription={subscription} />
          </div>

          {/* ---- Cards ---- */}
          {offers.length === 0 ? (
            <div className="border-border bg-card mx-auto max-w-md rounded-xl border p-6 text-center">
              <p className="text-muted-foreground text-sm">
                No plans are available right now. Please contact support.
              </p>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Billing term"
              className={cn(
                'grid w-full items-start gap-5',
                columns >= 3
                  ? 'md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[auto_1fr]'
                  : 'sm:grid-cols-2'
              )}
            >
              {offers.map((offer, index) => {
                const isSelected = offer.cycle.id === cycleId;
                const recommended =
                  offer.cycle.is_recommended && offer.cycle.recommended_label;

                return (
                  <button
                    key={offer.cycle.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setCycleId(offer.cycle.id)}
                    className={cn(
                      'bg-card relative flex h-full flex-col rounded-2xl border p-6 text-left transition-all',
                      isSelected
                        ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                        : 'border-border hover:border-primary/40',
                      // Lift the recommended card so the eye lands on it
                      // before reading any prices.
                      offer.cycle.is_recommended ? 'sm:-mt-2 sm:pb-8' : '',
                      columns >= 3 && index === 0
                        ? 'lg:col-start-1 lg:row-start-1'
                        : '',
                      columns >= 3 && index === 1
                        ? 'lg:col-start-2 lg:row-start-1'
                        : ''
                    )}
                  >
                    {recommended ? (
                      <span className="bg-primary text-primary-foreground absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">
                        <Sparkles className="size-3" />
                        {offer.cycle.recommended_label}
                      </span>
                    ) : null}

                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-foreground text-lg font-bold tracking-tight">
                        {offer.cycle.label}
                      </h2>
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-border bg-transparent'
                        )}
                      >
                        {isSelected ? (
                          <Check
                            className="text-primary-foreground size-3"
                            strokeWidth={3}
                          />
                        ) : null}
                      </span>
                    </div>

                    {/* Daily rate is the headline; the true total sits
                        directly under it so nothing is obscured. */}
                    <div className="mt-5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-foreground text-4xl font-bold tracking-tight">
                          {formatCurrency(offer.perDay, currency)}
                        </span>
                        <span className="text-muted-foreground text-sm font-medium">
                          {settings?.per_day_label ?? '/ day'}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-sm">
                        {formatPriceEquals(settings?.price_equals_template, {
                          total: formatCurrency(offer.total, currency),
                          days: offer.days,
                        })}
                      </p>
                    </div>

                    {offer.savings ? (
                      <span className="mt-4 inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {settings?.save_label ?? 'Save'}{' '}
                        {formatCurrency(offer.savings, currency)}
                      </span>
                    ) : (
                      <div className="mt-4 h-6" /> // spacer to keep cards aligned
                    )}

                    {/* ---- What choosing this actually commits you to ----
                        Sits at the FOOT of the card, under the price, because
                        that is the moment the question "am I about to be
                        charged?" occurs. `mt-auto` pins it to the bottom so
                        the two cards' badges line up even when one has a
                        savings pill and the other does not.

                        The trial length is substituted from `trial_days`
                        rather than written into the copy, so this can never
                        contradict the trial an account actually receives. */}
                    {showTrialOffer ? (
                      <div className="border-border/70 mt-auto space-y-1.5 border-t pt-4">
                        <p className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                          <Sparkles className="size-3.5 shrink-0 text-emerald-500" />
                          {trialBadge}
                        </p>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <ShieldCheck className="size-3.5 shrink-0" />
                          {noCardLabel}
                        </p>
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {/* Custom — an enquiry, not a purchase. Rendered as an
                  anchor rather than a radio so it can never be mistaken
                  for a selectable priced term. */}
              {showCustom ? (
                <a
                  href={settings?.custom_plan_cta_link ?? '/contact'}
                  className={cn(
                    'group border-border bg-card/60 hover:border-primary/40 sticky top-24 flex h-fit flex-col self-start rounded-2xl border border-dashed p-6 text-left transition-colors',
                    columns >= 3
                      ? 'lg:col-start-3 lg:row-span-2 lg:row-start-1'
                      : ''
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-foreground text-lg font-bold tracking-tight">
                      {settings?.custom_plan_label ?? 'Custom'}
                    </h2>
                    <MessageSquare className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  </div>

                  <div className="mt-5">
                    <span className="text-foreground text-3xl font-bold tracking-tight">
                      {settings?.custom_plan_price_text ?? "Let's talk"}
                    </span>
                  </div>

                  {settings?.custom_plan_body ? (
                    <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                      {settings.custom_plan_body}
                    </p>
                  ) : null}

                  {customFeatures.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {customFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="bg-primary/12 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
                            <Check
                              className="text-primary size-2.5"
                              strokeWidth={3.5}
                            />
                          </span>
                          <span
                            className={cn(
                              'text-sm leading-snug',
                              feature.emphasis
                                ? 'text-foreground font-semibold'
                                : 'text-muted-foreground'
                            )}
                          >
                            {feature.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <span className="text-primary mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
                    {settings?.custom_plan_cta_text ?? 'Talk to sales'}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              ) : null}

              {/* ---- One shared feature list ----
                  Lives here, not inside the cards, because every paid term
                  includes all of it. Duplicating it per card would invite the
                  three copies to drift apart. */}
              {features.length > 0 ? (
                <section
                  className={cn(
                    'border-border bg-card flex h-full flex-col rounded-2xl border p-6 sm:p-8',
                    columns >= 3
                      ? 'mt-0 lg:col-span-2 lg:col-start-1 lg:row-start-2'
                      : 'col-span-full mt-14'
                  )}
                >
                  <div className="text-center">
                    <h2 className="text-foreground text-lg font-bold tracking-tight sm:text-xl">
                      {settings?.features_heading ??
                        'Every plan includes everything'}
                    </h2>
                    <p className="text-muted-foreground mx-auto mt-2 max-w-2xl text-sm">
                      {settings?.features_subheading ??
                        'No feature gates and no add-ons. Monthly and yearly differ only in price.'}
                    </p>
                  </div>

                  <ul className="mt-7 grid flex-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-2">
                    {features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="bg-primary/12 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
                          <Check
                            className="text-primary size-2.5"
                            strokeWidth={3.5}
                          />
                        </span>
                        <span
                          className={cn(
                            'text-sm leading-snug',
                            feature.emphasis
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground'
                          )}
                        >
                          {feature.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {/* ---- Sticky summary bar ---- */}
      {selected && plan ? (
        <div className="border-border bg-card/95 supports-backdrop-filter:bg-card/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div>
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
                  {settings?.selected_plan_label ?? 'Selected plan'}
                </p>
                <p className="text-foreground text-sm font-semibold">
                  {plan.name}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {selected.cycle.label}
                  </span>
                </p>
              </div>
              {selected.savings ? (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {settings?.save_label ?? 'Save'}{' '}
                  {formatCurrency(selected.savings, currency)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
              <div className="text-right">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
                  {settings?.total_label ?? 'Total'}
                </p>
                <p className="text-foreground text-xl font-bold tracking-tight">
                  {formatCurrency(selected.total, currency)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* ---- Take the trial instead ----
                    Secondary styling on purpose: paying is the outcome the
                    business wants, and a filled button next to a filled
                    button makes neither the obvious next step.

                    Hidden entirely once the trial cannot honestly be
                    offered — see `showTrialOffer`. A button that starts a
                    trial the account is not eligible for would be worse
                    than no button. */}
                {showTrialOffer ? (
                  <button
                    type="button"
                    disabled={saving !== null}
                    onClick={() => void choosePlan('trial')}
                    className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    {saving === 'trial' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4 text-emerald-500" />
                    )}
                    {settings?.trial_cta_label ?? 'Start with trial'}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void choosePlan('pay')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {settings?.continue_label ?? 'Continue to payment'}
                  {saving === 'pay' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Small print + the one failure worth surfacing here.
              A trial that could not be started must say so: the customer
              pressed a button and would otherwise be left on the same
              screen with no explanation. */}
          {saveError ? (
            <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
              <p className="text-destructive text-xs">{saveError}</p>
            </div>
          ) : showTrialOffer && settings?.trial_cta_note ? (
            <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
              <p className="text-muted-foreground text-xs">
                {settings.trial_cta_note}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
