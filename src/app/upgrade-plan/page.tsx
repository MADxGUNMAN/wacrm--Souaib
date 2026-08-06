'use client';

// ============================================================
// /upgrade-plan — the plan chooser.
//
// Every string, price, plan, cycle, discount pill and feature line comes
// from the database via /api/billing/plans. Nothing here is hardcoded, so
// the whole page is editable from the super admin panel without a deploy.
//
// Owner-only by product decision. A member who reaches this URL is sent
// to /subscription-required, which tells them who can actually pay.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, TriangleAlert } from 'lucide-react';

import { UpgradeHeader } from '@/components/billing/upgrade-header';
import { useSubscription } from '@/hooks/use-subscription';
import { formatCurrency } from '@/lib/currency';
import {
  buildPlanRows,
  deriveSavings,
  findMonthlyBaseline,
  findPrice,
  perMonthAmount,
  resolveDefaultCycle,
  toAmount,
  visibleCycles,
} from '@/lib/subscription/plans';
import type { PlansBundle } from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

export default function UpgradePlanPage() {
  const router = useRouter();
  const { data: subscription } = useSubscription();

  const [bundle, setBundle] = useState<PlansBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cycleId, setCycleId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

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

        // Seed the selection from the admin's configured defaults so the
        // page opens on the tier they want to sell.
        const defaultCycle = resolveDefaultCycle(data.cycles);
        setCycleId(defaultCycle?.id ?? null);

        const visible = data.plans.filter((p) => p.is_visible);
        const highlighted = visible.find((p) => p.is_highlighted);
        setPlanId(highlighted?.id ?? visible[0]?.id ?? null);
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

  const cycles = useMemo(
    () => (bundle ? visibleCycles(bundle.cycles) : []),
    [bundle],
  );
  const activeCycle = useMemo(
    () => cycles.find((c) => c.id === cycleId) ?? null,
    [cycles, cycleId],
  );
  const rows = useMemo(
    () => (bundle && cycleId ? buildPlanRows(bundle, cycleId) : []),
    [bundle, cycleId],
  );

  const currency = bundle?.settings.currency ?? 'INR';

  const selected = useMemo(() => {
    if (!bundle || !planId || !cycleId || !activeCycle) return null;
    const price = findPrice(bundle.prices, planId, cycleId);
    if (!price) return null;
    const plan = bundle.plans.find((p) => p.id === planId);
    if (!plan) return null;

    const amount = toAmount(price.amount);
    return {
      plan,
      amount,
      savings: deriveSavings({
        amount,
        compareAtAmount: price.compare_at_amount,
        monthlyBaseline: findMonthlyBaseline(bundle, planId),
        cycle: activeCycle,
      }),
    };
  }, [bundle, planId, cycleId, activeCycle]);

  const handleContinue = useCallback(() => {
    if (!selected || !cycleId) return;
    router.push(
      `/upgrade-plan/payment?plan=${encodeURIComponent(selected.plan.id)}&cycle=${encodeURIComponent(cycleId)}`,
    );
  }, [selected, cycleId, router]);

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
        <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <TriangleAlert className="mx-auto size-8 text-destructive" />
          <p className="mt-4 text-sm text-destructive">{error}</p>
        </div>
      </>
    );
  }

  const settings = bundle?.settings;
  const hasSellablePlans = rows.some((r) => r.price !== null);

  return (
    <div className="flex min-h-screen flex-col">
      <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />

      {/* pb-32 clears the sticky summary bar so the last card's features
          are never hidden behind it. */}
      <main className="flex-1 px-4 pb-32 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* ---- Heading ---- */}
          <div className="pt-6 pb-8 text-center sm:pt-10">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              {settings?.page_heading ?? 'Choose Your Plan'}
            </h1>
            {settings?.page_subheading ? (
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {settings.page_subheading}
              </p>
            ) : null}

            {/* Expiry banner — states plainly why they're here. */}
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

          {/* ---- Cycle toggle ---- */}
          {cycles.length > 1 ? (
            <div className="flex flex-col items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Billing cycle"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
              >
                {cycles.map((cycle) => {
                  const isActive = cycle.id === cycleId;
                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setCycleId(cycle.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {cycle.label}
                      {cycle.discount_label ? (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            isActive
                              ? 'bg-primary-foreground/20 text-primary-foreground'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {cycle.discount_label}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {settings?.cycle_hint ? (
                <p className="text-xs text-muted-foreground">{settings.cycle_hint}</p>
              ) : null}
            </div>
          ) : null}

          {/* ---- Plan cards ---- */}
          {!hasSellablePlans ? (
            <div className="mx-auto mt-12 max-w-md rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No plans are available on this billing cycle yet. Try another
                cycle, or contact support.
              </p>
            </div>
          ) : (
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {rows.map(({ plan, features, price }) => {
                const isSelected = plan.id === planId;
                const amount = price ? toAmount(price.amount) : null;
                const monthly =
                  amount !== null && activeCycle
                    ? perMonthAmount(amount, activeCycle)
                    : null;
                const unavailable = price === null;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={unavailable}
                    onClick={() => setPlanId(plan.id)}
                    className={cn(
                      'relative flex flex-col rounded-2xl border bg-card p-6 text-left transition-all',
                      unavailable
                        ? 'cursor-not-allowed border-border opacity-55'
                        : 'hover:border-primary/40',
                      isSelected
                        ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                        : 'border-border',
                    )}
                  >
                    {/* Header row: name + badge, radio on the right */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-bold tracking-tight text-foreground">
                            {plan.name}
                          </h2>
                          {plan.is_highlighted && plan.highlight_label ? (
                            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {plan.highlight_label}
                            </span>
                          ) : null}
                        </div>
                        {plan.tagline ? (
                          <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                            {plan.tagline}
                          </p>
                        ) : null}
                      </div>

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
                          <Check className="size-3 text-primary-foreground" strokeWidth={3} />
                        ) : null}
                      </span>
                    </div>

                    {/* Price block */}
                    <div className="mt-5">
                      {unavailable ? (
                        <p className="text-sm text-muted-foreground">
                          Not available on {activeCycle?.label ?? 'this cycle'}
                        </p>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-bold tracking-tight text-foreground">
                              {formatCurrency(amount ?? 0, currency)}
                            </span>
                            {activeCycle?.unit_label ? (
                              <span className="text-sm text-muted-foreground">
                                {activeCycle.unit_label}
                              </span>
                            ) : null}
                          </div>
                          {monthly !== null ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {settings?.equals_label ?? 'Equals'}{' '}
                              {formatCurrency(monthly, currency)}/month
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>

                    {/* Features */}
                    {features.length > 0 ? (
                      <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
                        {features.map((feature, i) => (
                          <li
                            key={`${plan.id}-${i}`}
                            className="flex items-start gap-2.5"
                          >
                            <Check
                              className={cn(
                                'mt-0.5 size-3.5 shrink-0',
                                isSelected ? 'text-primary' : 'text-emerald-500',
                              )}
                              strokeWidth={3}
                            />
                            <span
                              className={cn(
                                'text-sm leading-snug',
                                // `emphasis` marks the "All <lower tier>
                                // Features +" lead-in that introduces an
                                // inherited tier.
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
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ---- Sticky summary bar ---- */}
      {selected ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {settings?.selected_plan_label ?? 'Selected Plan'}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {selected.plan.name}
                  {activeCycle ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {activeCycle.label}
                    </span>
                  ) : null}
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
                  {formatCurrency(selected.amount, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {settings?.continue_label ?? 'Continue to Payment'}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
