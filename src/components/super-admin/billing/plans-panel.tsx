'use client';

// ============================================================
// Plans & prices tab — the cards on the pricing page.
//
// The matrix is the important part: one editable cell per (plan × cycle).
// Whatever is saved here is what `resolveQuote` reads on the next quote,
// so editing a cell changes the very next UPI QR generated. There is no
// cache to bust and no publish step — which is exactly the requirement,
// but it also means a typo is live immediately. Hence: cells save on
// blur (not per keystroke), show an explicit saved/failed state, and
// revert on failure so the UI never shows a price the DB rejected.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  EyeOff,
  Loader2,
  MessageSquare,
  Save,
  Sparkles,
  X,
} from 'lucide-react';

import { FeatureRows } from '@/components/super-admin/billing/feature-rows';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/currency';
import {
  CUSTOM_CARD_SETTING_KEYS,
  deriveDaySavings,
  formatPriceEquals,
  normalisePlanFeatures,
  perDayAmount,
  toAmount,
  visibleCycles,
} from '@/lib/subscription/plans';
import type {
  BillingCycle,
  PlanFeature,
  PlansBundle,
  PublicSubscriptionSettings,
  SubscriptionPlan,
  SubscriptionPlanPrice,
} from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

export function PlansPanel() {
  const [bundle, setBundle] = useState<PlansBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/billing/plans');
      if (!res.ok) throw new Error('Failed to load plans');
      setBundle((await res.json()) as PlansBundle);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !bundle) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
      </div>
    );
  }

  const cycles = bundle ? visibleCycles(bundle.cycles) : [];
  // Hidden cycles still need a column, otherwise their prices become
  // uneditable once hidden — an easy way to lose data silently.
  const allCycles = bundle
    ? [...bundle.cycles].sort((a, b) => a.position - b.position)
    : [];

  // The product being sold — the same first-visible-by-position rule
  // /upgrade-plan uses. Retired plans stay hidden in the catalogue so old
  // payment records keep resolving; they are not cards and are not shown.
  const plan =
    bundle?.plans
      .filter((p) => p.is_visible)
      .sort((a, b) => a.position - b.position)[0] ?? null;

  // Savings are compared against the DEAREST daily rate on offer, matching
  // /upgrade-plan exactly — a preview computed a different way would be a
  // preview of nothing.
  const baselinePerDay = allCycles.reduce<number | null>((max, cycle) => {
    if (!plan || !cycle.is_visible) return max;
    const price = bundle?.prices.find(
      (p) => p.plan_id === plan.id && p.cycle_id === cycle.id,
    );
    if (!price || !price.is_visible) return max;
    const perDay = perDayAmount({
      amount: toAmount(price.amount),
      cycle,
      perDayOverride: price.per_day_amount,
    });
    if (perDay === null) return max;
    return max === null || perDay > max ? perDay : max;
  }, null);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        {cycles.length} card{cycles.length === 1 ? '' : 's'} on the pricing page.
        The shared feature list is edited under{' '}
        <strong className="text-slate-600">Page &amp; UPI settings</strong>.
      </p>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {allCycles.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No billing cycles exist yet. Add at least one on the{' '}
            <strong>Billing cycles</strong> tab — without one there is nothing to
            price and customers cannot buy anything.
          </p>
        </div>
      ) : null}

      {bundle && !plan ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No visible plan exists, so the pricing page has nothing to sell and
            shows an error to customers. This needs fixing in the database — the
            catalogue expects exactly one visible product.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        {plan ? (
          <div>
            <p className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Cards on the pricing page
            </p>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {allCycles.map((cycle) => (
                <CycleCard
                  key={`${plan.id}-${cycle.id}`}
                  plan={plan}
                  cycle={cycle}
                  settings={bundle?.settings ?? null}
                  baselinePerDay={baselinePerDay}
                  price={
                    bundle?.prices.find(
                      (p) => p.plan_id === plan.id && p.cycle_id === cycle.id,
                    ) ?? null
                  }
                  onSaved={load}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* The last card on the pricing page. It belongs to the settings
            singleton rather than to a plan, so it has its own save. */}
        <CustomCardEditor settings={bundle?.settings ?? null} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------

/**
 * One billing term, drawn as the card a customer will actually see.
 *
 * This used to be a small input labelled with the cycle name, sitting in
 * a row of inputs inside the plan card. That layout implied the plan was
 * the card and the terms were just numbers on it — the opposite of how
 * /upgrade-plan works, where each term IS a card with its own headline
 * price and badge. Previewing the real card removes the guesswork about
 * what a total turns into once it is divided into a daily rate.
 */
function CycleCard({
  plan,
  cycle,
  price,
  settings,
  baselinePerDay,
  onSaved,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  price: SubscriptionPlanPrice | null;
  settings: PublicSubscriptionSettings | null;
  /** Dearest daily rate across this plan's terms, for the savings pill. */
  baselinePerDay: number | null;
  onSaved: () => void | Promise<void>;
}) {
  const currency = settings?.currency ?? 'INR';
  const initial = price ? String(toAmount(price.amount)) : '';
  const initialPerDay =
    price?.per_day_amount != null ? String(price.per_day_amount) : '';

  const [value, setValue] = useState(initial);
  const [perDay, setPerDay] = useState(initialPerDay);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Re-sync when the parent reloads (another cell's save refetches all).
  useEffect(() => {
    setValue(initial);
    setPerDay(initialPerDay);
  }, [initial, initialPerDay]);

  /**
   * The daily rate this price will advertise on /upgrade-plan.
   *
   * Shown live because the daily figure is the headline customers read,
   * so an operator typing a total needs to see what it turns into — an
   * awkward total like 950 over 30 days becomes ₹31.67/day, which is
   * exactly when they'd want the override below.
   */
  const derivedPerDay = (() => {
    const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return perDayAmount({
      amount,
      cycle,
      perDayOverride: Number.parseFloat(perDay) || null,
    });
  })();

  const commit = async () => {
    const trimmed = value.trim();
    const trimmedPerDay = perDay.trim();
    if (
      trimmed === initial.trim() &&
      trimmedPerDay === initialPerDay.trim()
    ) {
      return;
    }

    setState('saving');
    setMessage(null);

    try {
      // Empty means "not sold on this cycle" — delete rather than store 0,
      // which would generate a ₹0 UPI intent.
      if (!trimmed) {
        if (!price) {
          setState('idle');
          return;
        }
        const res = await fetch(
          `/api/super-admin/billing/prices?planId=${plan.id}&cycleId=${cycle.id}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error('Could not remove the price');
      } else {
        const res = await fetch('/api/super-admin/billing/prices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: plan.id,
            cycle_id: cycle.id,
            amount: trimmed,
            // Blank sends null, which means "derive it" server-side.
            per_day_amount: trimmedPerDay || null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'Could not save the price');
      }

      setState('saved');
      setTimeout(() => setState('idle'), 1600);
      await onSaved();
    } catch (err) {
      // Revert so the field never displays a value the DB refused.
      setValue(initial);
      setPerDay(initialPerDay);
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const total = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  const hasTotal = Number.isFinite(total) && total > 0;

  // Mirrors /upgrade-plan: the pill only appears when this term genuinely
  // beats the dearest daily rate, so it can never advertise a saving of
  // zero or a negative.
  const savings =
    derivedPerDay !== null && cycle.duration_days
      ? deriveDaySavings({
          perDay: derivedPerDay,
          baselinePerDay,
          days: cycle.duration_days,
        })
      : null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-white shadow-sm',
        cycle.is_visible
          ? 'border-slate-200'
          : 'border-dashed border-slate-300 bg-slate-50/60',
      )}
    >
      {/* ---- Header: what the card is called on the page ---- */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-bold text-slate-900">
              {cycle.label}
            </h4>
            {cycle.is_recommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                <Sparkles className="h-2.5 w-2.5" />
                {cycle.recommended_label || 'Recommended'}
              </span>
            ) : null}
            {cycle.is_default ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                Pre-selected
              </span>
            ) : null}
            {!cycle.is_visible ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                <EyeOff className="h-2.5 w-2.5" />
                Hidden
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {cycle.duration_days
              ? `${cycle.duration_days} days of access`
              : `${cycle.months} month${cycle.months === 1 ? '' : 's'} of access`}
          </p>
        </div>

        {state === 'saving' ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-slate-400" />
        ) : state === 'saved' ? (
          <Check className="mt-1 h-4 w-4 shrink-0 text-green-600" />
        ) : state === 'error' ? (
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-red-500" />
        ) : null}
      </div>

      {/* ---- Live preview of the customer-facing card ---- */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        {hasTotal && derivedPerDay !== null ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-slate-900">
                {formatCurrency(derivedPerDay, currency)}
              </span>
              <span className="text-sm font-medium text-slate-500">
                {settings?.per_day_label ?? '/ day'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {formatPriceEquals(settings?.price_equals_template, {
                total: formatCurrency(total, currency),
                days: cycle.duration_days ?? 0,
              })}
            </p>
            {savings ? (
              <span className="mt-2.5 inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {settings?.save_label ?? 'Save'}{' '}
                {formatCurrency(savings, currency)}
              </span>
            ) : null}
            {perDay.trim() ? (
              <p className="mt-2 text-[11px] text-amber-600">
                Daily rate is overridden. The customer is still charged{' '}
                {formatCurrency(total, currency)}.
              </p>
            ) : null}
          </>
        ) : hasTotal ? (
          // A total with no day-based term cannot show a daily rate, and
          // /upgrade-plan skips such a card entirely. Say so rather than
          // rendering a preview the page will never draw.
          <p className="text-sm text-amber-700">
            {formatCurrency(total, currency)} total. This term has no day count,
            so the pricing page cannot show a daily rate and will skip this
            card. Set its duration in days on{' '}
            <strong>Billing cycles</strong>.
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            No price set — this card does not appear on the pricing page.
          </p>
        )}
      </div>

      {/* ---- The editable numbers ---- */}
      <div className="space-y-3 px-5 py-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">
            Total charged ({currency})
          </p>
          <Input
            inputMode="decimal"
            value={value}
            placeholder="Not sold"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="h-9 border-slate-200 bg-white text-sm text-slate-900"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            What the UPI QR asks for. Clear it to stop selling this term.
          </p>
        </div>

        {/* The override only makes sense for day-based terms, because a
            daily rate derived from a calendar month drifts with February. */}
        {cycle.duration_days ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Daily rate shown (optional)
            </p>
            <Input
              inputMode="decimal"
              value={perDay}
              placeholder={`auto — ${
                hasTotal && derivedPerDay !== null
                  ? formatCurrency(derivedPerDay, currency)
                  : 'calculated'
              }`}
              onChange={(e) => setPerDay(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="h-9 border-slate-200 bg-white text-sm text-slate-900"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Leave blank to divide the total by {cycle.duration_days}. Only set
              this to round an ugly result — it changes the display, never the
              charge.
            </p>
          </div>
        ) : null}

        <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          Rename this card, change its length, or move the{' '}
          {cycle.recommended_label || 'Recommended'} badge on the{' '}
          <strong className="text-slate-500">Billing cycles</strong> tab.
        </p>

        {message ? <p className="text-[11px] text-red-600">{message}</p> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

/**
 * The Custom / enquiry card.
 *
 * It sits on this tab rather than under page copy because an operator
 * thinking about pricing thinks about all three cards at once — and its
 * bullet list needs the same row editor the plans use, which page copy's
 * flat field map cannot express.
 *
 * Unlike the settings tab, this PUTs only its own keys. Sending the whole
 * settings row from two tabs would let whichever saved last silently
 * revert the other's edits.
 */
function CustomCardEditor({
  settings,
}: {
  settings: PublicSubscriptionSettings | null;
}) {
  const [show, setShow] = useState(settings?.show_custom_plan ?? false);
  const [label, setLabel] = useState(settings?.custom_plan_label ?? '');
  const [priceText, setPriceText] = useState(settings?.custom_plan_price_text ?? '');
  const [body, setBody] = useState(settings?.custom_plan_body ?? '');
  const [ctaText, setCtaText] = useState(settings?.custom_plan_cta_text ?? '');
  const [ctaLink, setCtaLink] = useState(settings?.custom_plan_cta_link ?? '');
  const [features, setFeatures] = useState<PlanFeature[]>(() =>
    normalisePlanFeatures(settings?.custom_plan_features),
  );

  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/super-admin/billing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show_custom_plan: show,
          custom_plan_label: label || null,
          custom_plan_price_text: priceText || null,
          custom_plan_body: body || null,
          custom_plan_cta_text: ctaText || null,
          custom_plan_cta_link: ctaLink || null,
          custom_plan_features: features.filter((f) => f.label.trim()),
          // `satisfies` makes the compiler reject a body that misses a
          // key the other panel strips — otherwise that column becomes
          // uneditable from anywhere, silently.
        } satisfies Record<(typeof CUSTOM_CARD_SETTING_KEYS)[number], unknown>),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not save the Custom card');
        setState('idle');
        return;
      }
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setError('Could not save the Custom card');
      setState('idle');
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            <h3 className="text-lg font-bold text-slate-900">
              {label || 'Custom'} card
            </h3>
            {!show ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                <EyeOff className="h-2.5 w-2.5" />
                Hidden
              </span>
            ) : null}
          </div>
          <p className="mt-1 ml-6 text-sm text-slate-500">
            An enquiry card beside the priced terms. It has no price and cannot
            be bought — it links to sales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Show</span>
          <Switch checked={show} onCheckedChange={(v: boolean) => setShow(v)} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Card title">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Custom"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
          <Field label="Text where a price would be">
            <Input
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="Let's talk"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
        </div>

        <Field label="Body">
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="For larger teams that need more than the standard plan."
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-[#25D366] focus:outline-none"
          />
        </Field>

        <FeatureRows
          label="Bullet list on the card"
          hint="What an enquiry adds on top of the standard plan. Leave empty to show no bullets."
          placeholder="e.g. Dedicated account manager"
          features={features}
          onChange={setFeatures}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Button text">
            <Input
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Talk to sales"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
          <Field label="Button link">
            <Input
              value={ctaLink}
              onChange={(e) => setCtaLink(e.target.value)}
              placeholder="/contact"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={state === 'saving'}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#20b958] disabled:opacity-60"
          >
            {state === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Custom card
          </button>
          {state === 'saved' ? (
            <p className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Saved — live immediately
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </p>
      {children}
    </div>
  );
}
