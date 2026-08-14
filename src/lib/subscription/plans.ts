// ============================================================
// Plan catalogue derivation — pure, no I/O.
//
// Everything the pricing UI shows beyond the raw stored values is
// computed here: the per-month equivalent, the "Save X" figure, the
// default cycle, and the feature list normalisation. Keeping it out of
// the components means the super admin preview, /upgrade-plan, and the
// server-side quote all agree on the arithmetic.
// ============================================================

import type {
  BillingCycle,
  PlanFeature,
  PlansBundle,
  PlanWithPrice,
  SubscriptionPlan,
  SubscriptionPlanPrice,
} from './types';

/**
 * Coerce a PostgREST numeric into a JS number.
 *
 * `NUMERIC(12,2)` comes back as a STRING over the wire (PostgREST does
 * this deliberately, to avoid float precision loss). Every read path
 * must funnel through here or prices silently become `"2700.00"` and
 * string-concatenate in arithmetic.
 */
export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Same coercion, but preserving a genuine null (for `compare_at_amount`). */
export function toNullableAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = toAmount(value);
  return n;
}

/**
 * The `subscription_settings` columns that describe the Custom / enquiry
 * card on /upgrade-plan.
 *
 * Named here so the two admin panels that touch this row agree on who
 * owns what: the Plans & Pricing tab writes exactly these, and the Page
 * & UPI tab strips exactly these before saving. Left as a convention in
 * each file, the lists would drift and whichever tab saved last would
 * quietly revert the other.
 */
export const CUSTOM_CARD_SETTING_KEYS = [
  'show_custom_plan',
  'custom_plan_label',
  'custom_plan_price_text',
  'custom_plan_body',
  'custom_plan_cta_text',
  'custom_plan_cta_link',
  'custom_plan_features',
] as const;

/**
 * Widen a stored `features` JSONB blob into a uniform array.
 *
 * Accepts three shapes so hand-edited data and the seeded data both
 * work, and a malformed blob degrades to an empty list instead of
 * throwing inside a render:
 *   ["Feature A", "Feature B"]
 *   [{ "label": "Feature A", "emphasis": true }]
 *   null / {} / "garbage"   -> []
 */
export function normalisePlanFeatures(raw: unknown): PlanFeature[] {
  if (!Array.isArray(raw)) return [];

  const out: PlanFeature[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (label) out.push({ label });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const label =
        typeof record.label === 'string'
          ? record.label.trim()
          : typeof record.text === 'string'
            ? record.text.trim()
            : '';
      if (!label) continue;
      out.push({
        label,
        emphasis: record.emphasis === true || record.is_emphasis === true,
      });
    }
  }
  return out;
}

/** Serialise back to the JSONB object shape for writes. */
export function serialisePlanFeatures(features: PlanFeature[]): PlanFeature[] {
  return features
    .map((f) => ({ label: f.label.trim(), emphasis: f.emphasis === true }))
    .filter((f) => f.label.length > 0);
}

/**
 * Which cycle should be pre-selected. Falls back through: the flagged
 * default -> the first visible one -> null (no cycles configured).
 */
export function resolveDefaultCycle(
  cycles: BillingCycle[],
): BillingCycle | null {
  const visible = cycles.filter((c) => c.is_visible);
  return visible.find((c) => c.is_default) ?? visible[0] ?? null;
}

/** Look up the price row for one (plan, cycle) pair. */
export function findPrice(
  prices: SubscriptionPlanPrice[],
  planId: string,
  cycleId: string,
): SubscriptionPlanPrice | null {
  return (
    prices.find((p) => p.plan_id === planId && p.cycle_id === cycleId) ?? null
  );
}

/**
 * The plan's 1-month rate, used as the baseline for the savings
 * figure. Identified by the cycle with `months === 1` rather than by
 * `cycle_key === 'monthly'`, so a renamed or re-keyed cycle still
 * works.
 */
export function findMonthlyBaseline(
  bundle: Pick<PlansBundle, 'cycles' | 'prices'>,
  planId: string,
): number | null {
  const monthly = bundle.cycles.find(
    (c) => c.months === 1 && !c.duration_days,
  );
  if (!monthly) return null;
  const price = findPrice(bundle.prices, planId, monthly.id);
  return price ? toAmount(price.amount) : null;
}

/**
 * Per-month equivalent of a multi-month price — the "Equals X/month"
 * line under the headline figure. Null for 1-month cycles (where it
 * would just restate the headline) and for day-based cycles (where a
 * monthly figure is meaningless).
 */
export function perMonthAmount(
  amount: number,
  cycle: Pick<BillingCycle, 'months' | 'duration_days'>,
): number | null {
  if (cycle.duration_days) return null;
  if (!cycle.months || cycle.months <= 1) return null;
  return amount / cycle.months;
}

/**
 * The headline per-day rate for a priced cycle.
 *
 * DERIVED from the real total by default, so the big number on the card
 * can never contradict what the customer is actually charged — the two
 * are the same fact expressed differently. `perDayOverride` exists only
 * for the case where the true division is a recurring decimal (950 / 30 =
 * 31.666…) and the operator wants a round headline; it changes the
 * DISPLAY only, never the amount charged.
 *
 * Returns null for a cycle with no day-based term, because a daily rate
 * derived from a calendar month would drift with February.
 */
export function perDayAmount(params: {
  amount: number;
  cycle: Pick<BillingCycle, 'duration_days'>;
  perDayOverride?: number | null;
}): number | null {
  const { amount, cycle, perDayOverride } = params;

  if (perDayOverride && perDayOverride > 0) return perDayOverride;

  const days = cycle.duration_days ?? 0;
  if (days <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return amount / days;
}

/**
 * Total saved over the term versus the most expensive daily rate on offer.
 *
 * Day-based cycles need their own savings calculation: {@link deriveSavings}
 * reasons in whole months, which a 360-day term is not. Comparing daily
 * rates instead is both exact and the comparison the customer is already
 * making, since the daily rate is the headline.
 *
 *   (30/day - 25/day) x 360 days = 1,800 saved
 *
 * Returns null when there is nothing to boast about, so the UI can simply
 * omit the pill rather than render "Save ₹0".
 */
export function deriveDaySavings(params: {
  /** This cycle's per-day rate. */
  perDay: number;
  /** The highest per-day rate across all visible cycles (the baseline). */
  baselinePerDay: number | null;
  /** This cycle's term length. */
  days: number;
}): number | null {
  const { perDay, baselinePerDay, days } = params;

  if (!baselinePerDay || baselinePerDay <= perDay) return null;
  if (!Number.isFinite(days) || days <= 0) return null;

  const saving = Math.round((baselinePerDay - perDay) * days);
  return saving > 0 ? saving : null;
}

/**
 * Fill `{total}` and `{days}` in the admin-authored equals line.
 *
 * Deliberately forgiving, matching `fillTemplate` in copy.ts: the input
 * is typed into a CMS field, and a typo must not be able to blank the
 * line or leak a raw brace into a customer's view. An unrecognised
 * placeholder is left visible so whoever made the typo can see it.
 */
export function formatPriceEquals(
  template: string | null | undefined,
  values: { total: string; days: number },
): string {
  const fallback = `= ${values.total} for ${values.days} days`;
  if (!template || !template.trim()) return fallback;

  return template
    .replace(/\{total\}/g, values.total)
    .replace(/\{days\}/g, String(values.days))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * The "Save X" figure.
 *
 * Prefers an explicit `compare_at_amount` when the admin set one;
 * otherwise derives it as (1-month rate x months) - actual, i.e. what
 * paying monthly for the same span would have cost. Returns null when
 * there is nothing to boast about, so the UI can simply omit the pill.
 */
export function deriveSavings(params: {
  amount: number;
  compareAtAmount?: number | null;
  monthlyBaseline?: number | null;
  cycle: Pick<BillingCycle, 'months' | 'duration_days'>;
}): number | null {
  const { amount, compareAtAmount, monthlyBaseline, cycle } = params;

  const reference =
    compareAtAmount && compareAtAmount > 0
      ? compareAtAmount
      : !cycle.duration_days && cycle.months > 1 && monthlyBaseline
        ? monthlyBaseline * cycle.months
        : null;

  if (!reference) return null;
  const saving = reference - amount;
  // Round to whole units — the page renders currency without decimals,
  // so an unrounded 836.9999 would display as "837" while failing a
  // `> 0` check by a hair in edge cases.
  const rounded = Math.round(saving);
  return rounded > 0 ? rounded : null;
}

/**
 * Assemble the plan cards for one selected cycle: visible plans in
 * order, each with normalised features and its resolved price.
 *
 * Plans with no price row for the selected cycle are KEPT (with
 * `price: null`) rather than dropped — the card renders a "not
 * available on this cycle" state, which is far easier for an admin to
 * diagnose than a card that silently vanishes.
 */
export function buildPlanRows(
  bundle: Pick<PlansBundle, 'plans' | 'prices'>,
  cycleId: string,
): PlanWithPrice[] {
  return bundle.plans
    .filter((p) => p.is_visible)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((plan) => {
      const price = findPrice(bundle.prices, plan.id, cycleId);
      return {
        plan,
        features: normalisePlanFeatures(plan.features),
        price: price && price.is_visible ? price : null,
      };
    });
}

/** Visible cycles in display order. */
export function visibleCycles(cycles: BillingCycle[]): BillingCycle[] {
  return cycles
    .filter((c) => c.is_visible)
    .slice()
    .sort((a, b) => a.position - b.position);
}

/**
 * Human duration for a cycle, e.g. "3 months", "1 month", "14 days".
 * Used in the payment summary and the admin approval dialog, where the
 * marketing label ("Quarterly") is less useful than the actual span.
 */
export function describeCycleDuration(
  cycle: Pick<BillingCycle, 'months' | 'duration_days'>,
): string {
  if (cycle.duration_days) {
    return `${cycle.duration_days} day${cycle.duration_days === 1 ? '' : 's'}`;
  }
  const m = cycle.months ?? 0;
  return `${m} month${m === 1 ? '' : 's'}`;
}

/**
 * Normalise a raw DB plan row. Currently a pass-through for the shape
 * plus feature widening, but centralised so future column additions
 * only need handling in one place.
 */
export function hydratePlan(row: SubscriptionPlan): SubscriptionPlan & {
  featureList: PlanFeature[];
} {
  return { ...row, featureList: normalisePlanFeatures(row.features) };
}
