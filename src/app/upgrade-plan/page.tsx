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
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import { UpgradeHeader } from '@/components/billing/upgrade-header';
import { useSubscription } from '@/hooks/use-subscription';
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

export default function UpgradePlanPage() {
  const router = useRouter();
  const { data: subscription } = useSubscription();

  const [bundle, setBundle] = useState<PlansBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/billing/plans', { cache: 'no-store' });
        if (!res.ok) {
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

  /** The product being sold. See the invariant in the file header. */
  const plan = useMemo(
    () =>
      bundle?.plans
        .filter((p) => p.is_visible)
        .sort((a, b) => a.position - b.position)[0] ?? null,
    [bundle],
  );

  const features = useMemo(
    () => (plan ? normalisePlanFeatures(plan.features) : []),
    [plan],
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
    [settings?.custom_plan_features],
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
      null,
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
    [offers, cycleId],
  );

  const handleContinue = useCallback(() => {
    if (!selected || !plan) return;
    router.push(
      `/upgrade-plan/payment?plan=${encodeURIComponent(plan.id)}&cycle=${encodeURIComponent(selected.cycle.id)}`,
    );
  }, [selected, plan, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <UpgradeHeader 
          backButton={
            !subscription?.state.isBlocked 
              ? { href: '/dashboard', label: 'Back to dashboard' } 
              : null
          } 
        />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <TriangleAlert className="mx-auto size-8 text-destructive" />
          <p className="mt-4 text-sm text-destructive">{error}</p>
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
      <UpgradeHeader 
        backButton={
          !subscription?.state.isBlocked 
            ? { href: '/dashboard', label: 'Back to dashboard' } 
            : null
        } 
      />

      {/* pb-32 clears the sticky summary bar. */}
      <main className="flex-1 px-4 pb-32 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* ---- Heading ---- */}
          <div className="pt-6 pb-10 text-center sm:pt-12">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              {settings?.page_heading ?? 'Choose your plan'}
            </h1>
            {settings?.page_subheading ? (
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {settings.page_subheading}
              </p>
            ) : null}

            {subscription?.state.isBlocked ? (
              <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-destructive/25 bg-destructive/[0.07] px-4 py-1.5">
                <TriangleAlert className="size-3.5 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  {subscription.copy.expiredHeading ??
                    'Your access has ended. Choose a plan to continue.'}
                </span>
              </div>
            ) : null}
          </div>

          {/* ---- Cards ---- */}
          {offers.length === 0 ? (
            <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No plans are available right now. Please contact support.
              </p>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Billing term"
              className={cn(
                'grid gap-5 w-full items-start',
                columns >= 3
                  ? 'md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[auto_1fr]'
                  : 'sm:grid-cols-2',
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
                      'relative flex flex-col h-full rounded-2xl border bg-card p-6 text-left transition-all',
                      isSelected
                        ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                        : 'border-border hover:border-primary/40',
                      // Lift the recommended card so the eye lands on it
                      // before reading any prices.
                      offer.cycle.is_recommended ? 'sm:-mt-2 sm:pb-8' : '',
                      columns >= 3 && index === 0 ? "lg:col-start-1 lg:row-start-1" : "",
                      columns >= 3 && index === 1 ? "lg:col-start-2 lg:row-start-1" : ""
                    )}
                  >
                    {recommended ? (
                      <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold tracking-wide text-primary-foreground uppercase">
                        <Sparkles className="size-3" />
                        {offer.cycle.recommended_label}
                      </span>
                    ) : null}

                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-bold tracking-tight text-foreground">
                        {offer.cycle.label}
                      </h2>
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-border bg-transparent',
                        )}
                      >
                        {isSelected ? (
                          <Check
                            className="size-3 text-primary-foreground"
                            strokeWidth={3}
                          />
                        ) : null}
                      </span>
                    </div>

                    {/* Daily rate is the headline; the true total sits
                        directly under it so nothing is obscured. */}
                    <div className="mt-5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-bold tracking-tight text-foreground">
                          {formatCurrency(offer.perDay, currency)}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {settings?.per_day_label ?? '/ day'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
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
                    "group flex flex-col rounded-2xl border border-dashed border-border bg-card/60 p-6 text-left transition-colors hover:border-primary/40 h-fit self-start sticky top-24",
                    columns >= 3 ? "lg:col-start-3 lg:row-start-1 lg:row-span-2" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                      {settings?.custom_plan_label ?? 'Custom'}
                    </h2>
                    <MessageSquare className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="mt-5">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {settings?.custom_plan_price_text ?? "Let's talk"}
                    </span>
                  </div>

                  {settings?.custom_plan_body ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {settings.custom_plan_body}
                    </p>
                  ) : null}

                  {customFeatures.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {customFeatures.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/12">
                            <Check
                              className="size-2.5 text-primary"
                              strokeWidth={3.5}
                            />
                          </span>
                          <span
                            className={cn(
                              'text-sm leading-snug',
                              feature.emphasis
                                ? 'font-semibold text-foreground'
                                : 'text-muted-foreground',
                            )}
                          >
                            {feature.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
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
                <section className={cn(
                  "rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col h-full",
                  columns >= 3 ? "lg:col-span-2 lg:col-start-1 lg:row-start-2 mt-0" : "mt-14 col-span-full"
                )}>
                  <div className="text-center">
                    <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                      {settings?.features_heading ?? 'Every plan includes everything'}
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                      {settings?.features_subheading ??
                        'No feature gates and no add-ons. Monthly and yearly differ only in price.'}
                    </p>
                  </div>

                  <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-2 flex-1">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/12">
                      <Check className="size-2.5 text-primary" strokeWidth={3.5} />
                    </span>
                    <span
                      className={cn(
                        'text-sm leading-snug',
                        feature.emphasis
                          ? 'font-semibold text-foreground'
                          : 'text-muted-foreground',
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
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {settings?.selected_plan_label ?? 'Selected plan'}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {plan.name}
                  <span className="font-normal text-muted-foreground">
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

            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <div className="text-right">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {settings?.total_label ?? 'Total'}
                </p>
                <p className="text-xl font-bold tracking-tight text-foreground">
                  {formatCurrency(selected.total, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {settings?.continue_label ?? 'Continue to payment'}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
