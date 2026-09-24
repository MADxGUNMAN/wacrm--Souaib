import Link from 'next/link';
import { ArrowRight, Check, MessageSquare, Sparkles } from 'lucide-react';
import type { LandingSection } from '@/types/super-admin';
import type { PlansBundle } from '@/lib/subscription/types';
import {
  deriveDaySavings,
  findPrice,
  formatPriceEquals,
  normalisePlanFeatures,
  perDayAmount,
  toAmount,
  visibleCycles,
} from '@/lib/subscription/plans';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface PricingSectionProps {
  section: LandingSection | null;
  bundle: PlansBundle;
}

/**
 * LANDING-PAGE-ONLY price display overrides, managed in the CMS.
 *
 * Real prices come from Plans & Pricing and drive the checkout page and
 * the UPI amount. These optional overrides change ONLY what the marketing
 * page displays — so a value here deliberately does NOT match what a
 * customer is charged. That is the point (advertising in another
 * currency), and it is also the risk, which is why the CMS editor warns
 * about it rather than presenting it as an ordinary field.
 *
 * Stored on the pricing section's `extra_data`:
 *   price_currency:  "USD"
 *   price_overrides: { "Monthly": { per_day: "2", total: "60" }, … }
 *
 * Keyed by the billing cycle's label. Anything missing or unparseable
 * falls back to the real price, so a bad value shows the truth rather
 * than a broken card.
 */
interface LandingPriceOverride {
  per_day?: string;
  total?: string;
}

function readOverride(
  section: LandingSection | null,
  cycleLabel: string
): { perDay?: number; total?: number } {
  const all = section?.extra_data?.price_overrides as
    Record<string, LandingPriceOverride> | undefined;
  const row = all?.[cycleLabel];
  if (!row) return {};
  const perDay = Number.parseFloat(row.per_day ?? '');
  const total = Number.parseFloat(row.total ?? '');
  return {
    perDay: Number.isFinite(perDay) && perDay > 0 ? perDay : undefined,
    total: Number.isFinite(total) && total > 0 ? total : undefined,
  };
}

export function PricingSection({ section, bundle }: PricingSectionProps) {
  const title = section?.title || 'Simple pricing. Everything included.';
  const subtitle =
    section?.subtitle ||
    'One plan with every feature. Pay monthly, or save by paying yearly.';

  const settings = bundle?.settings;
  // A CMS currency override applies to the priced cards only; the Custom
  // card and the shared feature list always read real settings.
  const overrideCurrency = (
    section?.extra_data?.price_currency as string | undefined
  )?.trim();
  const currency = overrideCurrency || settings?.currency || 'INR';

  // The product being sold
  const plan =
    bundle?.plans
      .filter((p) => p.is_visible)
      .sort((a, b) => a.position - b.position)[0] ?? null;

  const features = plan ? normalisePlanFeatures(plan.features) : [];
  const customFeatures = normalisePlanFeatures(settings?.custom_plan_features);

  // Compute offers
  const pricedCycles = visibleCycles(bundle.cycles).flatMap((cycle) => {
    if (!plan) return [];
    const price = findPrice(bundle.prices, plan.id, cycle.id);
    if (!price || !price.is_visible) return [];

    const realTotal = toAmount(price.amount);
    const realPerDay = perDayAmount({
      amount: realTotal,
      cycle,
      perDayOverride: price.per_day_amount,
    });
    if (realPerDay === null || !cycle.duration_days) return [];

    // CMS override — see readOverride at the top of this file.
    const override = readOverride(section, cycle.label);
    const total = override.total ?? realTotal;
    const perDay = override.perDay ?? realPerDay;

    return [{ cycle, total, perDay, days: cycle.duration_days }];
  });

  const baseline = pricedCycles.reduce<number | null>(
    (max, o) => (max === null || o.perDay > max ? o.perDay : max),
    null
  );

  const offers = pricedCycles.map((o) => ({
    ...o,
    savings: deriveDaySavings({
      perDay: o.perDay,
      baselinePerDay: baseline,
      days: o.days,
    }),
  }));

  const showCustom = settings?.show_custom_plan === true;
  const columns = offers.length + (showCustom ? 1 : 0);

  return (
    <section
      className="relative overflow-clip bg-gradient-to-b from-[#edf7f2] via-[#e5f2ea] to-[#edf7f2] px-6 py-24"
      id="pricing"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[600px] w-[600px] -translate-x-1/2 translate-y-1/3 rounded-full bg-[#25D366]/20 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
            {title.split('pricing').length > 1 ? (
              <>
                {title.split('pricing')[0]}
                <span className="text-[#25D366]">pricing</span>
                {title.split('pricing')[1]}
              </>
            ) : (
              title
            )}
          </h2>
          <p className="text-lg text-slate-600">{subtitle}</p>
        </div>

        {/* ---- Cards ---- */}
        {offers.length === 0 ? (
          <div className="mx-auto max-w-md rounded-xl border border-emerald-900/10 bg-white/80 p-6 text-center shadow-sm backdrop-blur-sm">
            <p className="text-sm text-slate-500">
              No plans are available right now. Please check back later.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              'grid w-full items-start gap-6',
              columns >= 3
                ? 'md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[auto_1fr]'
                : 'mx-auto max-w-3xl sm:grid-cols-2'
            )}
          >
            {offers.map((offer) => {
              const recommended =
                offer.cycle.is_recommended && offer.cycle.recommended_label;

              return (
                <div
                  key={offer.cycle.id}
                  className={cn(
                    'relative flex h-full flex-col rounded-2xl border p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:shadow-md',
                    recommended
                      ? 'border-[#25D366] bg-white/95 shadow-[0_0_25px_rgba(37,211,102,0.18)] ring-1 ring-[#25D366]'
                      : 'border-emerald-900/10 bg-white/85 hover:border-[#25D366]/40',
                    recommended ? 'sm:-mt-2 sm:pb-8' : '',
                    columns >= 3 && offers.indexOf(offer) === 0
                      ? 'lg:col-start-1 lg:row-start-1'
                      : '',
                    columns >= 3 && offers.indexOf(offer) === 1
                      ? 'lg:col-start-2 lg:row-start-1'
                      : ''
                  )}
                >
                  {recommended ? (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1 text-[11px] font-bold tracking-wide text-white uppercase shadow-sm">
                      <Sparkles className="size-3" />
                      {offer.cycle.recommended_label}
                    </span>
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">
                      {offer.cycle.label}
                    </h3>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-bold tracking-tight text-slate-900">
                        {formatCurrency(offer.perDay, currency)}
                      </span>
                      <span className="text-sm font-medium text-slate-500">
                        {settings?.per_day_label ?? '/ day'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">
                      {formatPriceEquals(settings?.price_equals_template, {
                        total: formatCurrency(offer.total, currency),
                        days: offer.days,
                      })}
                    </p>
                  </div>

                  {offer.savings ? (
                    <span className="mt-4 inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {settings?.save_label ?? 'Save'}{' '}
                      {formatCurrency(offer.savings, currency)}
                    </span>
                  ) : (
                    <div className="mt-4 h-6" /> // spacer to keep cards aligned
                  )}

                  <Link
                    href="/signup"
                    className={cn(
                      'mt-8 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-all',
                      recommended
                        ? 'bg-[#25D366] text-white shadow-md hover:bg-[#20b958]'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    )}
                  >
                    Start Free Trial
                  </Link>
                </div>
              );
            })}

            {showCustom ? (
              <div
                className={cn(
                  'group sticky top-24 flex h-fit flex-col self-start rounded-2xl border border-dashed border-emerald-900/20 bg-white/70 p-6 text-left backdrop-blur-sm transition-colors hover:border-[#25D366]/40',
                  columns >= 3
                    ? 'lg:col-start-3 lg:row-span-2 lg:row-start-1'
                    : ''
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">
                    {settings?.custom_plan_label ?? 'Custom'}
                  </h3>
                  <MessageSquare className="mt-0.5 size-5 shrink-0 text-slate-400" />
                </div>

                <div className="mt-5">
                  <span className="text-3xl font-bold tracking-tight text-slate-900">
                    {settings?.custom_plan_price_text ?? "Let's talk"}
                  </span>
                </div>

                {settings?.custom_plan_body ? (
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    {settings.custom_plan_body}
                  </p>
                ) : null}

                {customFeatures.length > 0 ? (
                  <ul className="mt-6 mb-6 space-y-3">
                    {customFeatures.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
                          <Check
                            className="size-2.5 text-[#25D366]"
                            strokeWidth={3.5}
                          />
                        </span>
                        <span
                          className={cn(
                            'text-sm leading-snug',
                            feature.emphasis
                              ? 'font-semibold text-slate-900'
                              : 'text-slate-600'
                          )}
                        >
                          {feature.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-6 mb-6 flex-1" />
                )}

                <Link
                  href={settings?.custom_plan_cta_link ?? '/contact'}
                  className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[#25D366]"
                >
                  {settings?.custom_plan_cta_text ?? 'Talk to sales'}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            ) : null}
            {features.length > 0 ? (
              <div
                className={cn(
                  'relative z-10 flex h-full flex-col rounded-3xl border border-emerald-900/10 bg-white/85 p-8 shadow-sm backdrop-blur-sm sm:p-10',
                  columns >= 3
                    ? 'lg:col-span-2 lg:col-start-1 lg:row-start-2'
                    : 'col-span-full mt-10'
                )}
              >
                <div className="mb-10 text-center">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {settings?.features_heading ??
                      'Every plan includes everything'}
                  </h3>
                  <p className="mx-auto mt-3 max-w-2xl text-base text-slate-500">
                    {settings?.features_subheading ??
                      'No feature gates and no add-ons. Monthly and yearly differ only in price.'}
                  </p>
                </div>

                <ul className="grid flex-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-2">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
                        <Check
                          className="size-3 text-[#25D366]"
                          strokeWidth={3.5}
                        />
                      </span>
                      <span
                        className={cn(
                          'text-sm leading-relaxed',
                          feature.emphasis
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-600'
                        )}
                      >
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
