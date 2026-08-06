// ============================================================
// Subscription state resolution — pure, no I/O, no React.
//
// One rule underpins this module: the stored
// `accounts.subscription_status` is a HINT, never the verdict. There
// is no cron flipping `trialing` -> `expired` the moment a trial
// lapses, so a row can read `trialing` days after its
// `trial_ends_at`. Every consumer therefore derives the live state
// from the timestamps, and the stored column exists only to say which
// timestamp matters (trial vs paid) and to let an operator force
// `none` / `expired`.
//
// Kept dependency-free so Proxy (edge runtime), server routes,
// and client components can all share exactly one implementation of
// "is this account blocked".
// ============================================================

import type {
  AccountSubscriptionRow,
  SubscriptionStatus,
} from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** What the app should do about an account, right now. */
export interface SubscriptionState {
  /**
   * Live status derived from the timestamps — may differ from the
   * stored `subscription_status` when a window has lapsed.
   */
  status: SubscriptionStatus;
  /** True when billing is switched off globally; nothing is gated. */
  billingDisabled: boolean;
  isTrialing: boolean;
  isActive: boolean;
  isExpired: boolean;
  /**
   * The single date that matters for this account: `trial_ends_at`
   * while trialing, `subscription_ends_at` once paid. Null when the
   * account is ungated (`none`) or has no window at all.
   */
  endsAt: Date | null;
  /**
   * Whole days remaining until `endsAt`, rounded UP so a few hours
   * left still reads as "1 day". 0 once the window has closed. Null
   * when there is no window.
   *
   * Rounding up is deliberate: telling someone "0 days left" while
   * they still have access is worse than a day of optimism.
   */
  daysLeft: number | null;
  /**
   * THE gate. True means: redirect to /upgrade-plan and refuse CRM
   * access. Accounts for the grace period.
   */
  isBlocked: boolean;
  /** Grace days still being consumed past `endsAt`. */
  inGracePeriod: boolean;
}

/**
 * Config slice this module needs. Accepting a narrow shape (rather
 * than the whole settings row) keeps Proxy free to select just
 * these two columns.
 */
export interface SubscriptionGateConfig {
  is_enabled: boolean;
  grace_days: number;
}

/** Fallback when settings haven't loaded or the row is missing. */
export const DEFAULT_GATE_CONFIG: SubscriptionGateConfig = {
  is_enabled: true,
  grace_days: 0,
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve an account's live subscription state.
 *
 * @param row      Subscription columns from `accounts`. Null/partial is
 *                 tolerated — a missing row resolves to a blocked
 *                 `expired` state ONLY if billing is enabled and there
 *                 is no trial window, which is the fail-closed choice.
 * @param config   Global gate config (`is_enabled`, `grace_days`).
 * @param now      Injectable clock, for testing and for callers that
 *                 already have a request timestamp.
 */
export function resolveSubscriptionState(
  row: Partial<AccountSubscriptionRow> | null | undefined,
  config: SubscriptionGateConfig = DEFAULT_GATE_CONFIG,
  now: Date = new Date(),
): SubscriptionState {
  // Billing switched off platform-wide: nothing is gated, no trial
  // countdown anywhere. Short-circuit before touching any dates.
  if (!config.is_enabled) {
    return {
      status: 'none',
      billingDisabled: true,
      isTrialing: false,
      isActive: true,
      isExpired: false,
      endsAt: null,
      daysLeft: null,
      isBlocked: false,
      inGracePeriod: false,
    };
  }

  const stored = (row?.subscription_status ?? 'trialing') as SubscriptionStatus;

  // Operator escape hatch — permanently open account.
  if (stored === 'none') {
    return {
      status: 'none',
      billingDisabled: false,
      isTrialing: false,
      isActive: true,
      isExpired: false,
      endsAt: null,
      daysLeft: null,
      isBlocked: false,
      inGracePeriod: false,
    };
  }

  const subscriptionEndsAt = toDate(row?.subscription_ends_at);
  const trialEndsAt = toDate(row?.trial_ends_at);

  // Which window governs? A paid window always wins once one exists —
  // an account that subscribed then let it lapse must not fall back
  // to a stale (and possibly still-open) trial date.
  const paidWindowExists = stored === 'active' || subscriptionEndsAt !== null;
  const endsAt = paidWindowExists ? subscriptionEndsAt : trialEndsAt;

  const graceMs = Math.max(0, config.grace_days) * MS_PER_DAY;

  // No window at all. Either the trial trigger never ran (pre-050 row
  // that dodged the backfill) or an operator cleared the dates. Trust
  // the stored status rather than inventing access.
  if (!endsAt) {
    const expired = stored === 'expired';
    return {
      status: expired ? 'expired' : stored,
      billingDisabled: false,
      isTrialing: stored === 'trialing',
      isActive: stored === 'active',
      isExpired: expired,
      endsAt: null,
      daysLeft: null,
      isBlocked: expired,
      inGracePeriod: false,
    };
  }

  const msLeft = endsAt.getTime() - now.getTime();
  const windowOpen = msLeft > 0;
  // An operator who forces `expired` overrides an open window — that's
  // how a manual revoke takes effect immediately.
  const forcedExpired = stored === 'expired';

  const live: SubscriptionStatus = forcedExpired
    ? 'expired'
    : windowOpen
      ? paidWindowExists
        ? 'active'
        : 'trialing'
      : 'expired';

  const pastGrace = msLeft + graceMs <= 0;
  const isBlocked = forcedExpired || pastGrace;
  const inGracePeriod = !forcedExpired && !windowOpen && !pastGrace;

  return {
    status: live,
    billingDisabled: false,
    isTrialing: live === 'trialing',
    isActive: live === 'active',
    isExpired: live === 'expired',
    endsAt,
    daysLeft: Math.max(0, Math.ceil(msLeft / MS_PER_DAY)),
    isBlocked,
    inGracePeriod,
  };
}

/**
 * Fill the `{days}` placeholder in the admin-editable trial banner
 * template, pluralising "day"/"days" when the template uses the
 * default wording.
 *
 * Tolerates a template with no placeholder — the operator may prefer a
 * fixed sentence, in which case it's returned untouched.
 */
export function formatTrialBanner(template: string, daysLeft: number): string {
  const safe = Math.max(0, daysLeft);
  let out = template.replace(/\{days\}/g, String(safe));
  // Only fix up the noun when we actually substituted a 1.
  if (safe === 1) {
    out = out.replace(/\b1 days\b/g, '1 day');
  }
  return out;
}

/**
 * Add a billing duration to a date, calendar-accurately.
 *
 * `days` wins when supplied (cycles that aren't whole months).
 * Otherwise `months` is added with end-of-month clamping: 1 month from
 * Jan 31 is Feb 28/29, not Mar 3. Plain `setMonth` overflows into the
 * next month, which would silently hand out extra days every time
 * someone subscribed on a 31st.
 */
export function addDuration(
  from: Date,
  duration: { months?: number | null; days?: number | null },
): Date {
  const days = duration.days ?? null;
  if (days && days > 0) {
    return new Date(from.getTime() + days * MS_PER_DAY);
  }

  const months = duration.months ?? 0;
  if (months <= 0) return new Date(from.getTime());

  const result = new Date(from.getTime());
  const targetMonth = result.getMonth() + months;
  const dayOfMonth = result.getDate();

  // Land on the 1st first so the month shift can't overflow, then
  // clamp the day to whatever the target month actually holds.
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));

  return result;
}

/**
 * Where a renewal window should start.
 *
 * Renewing while still active must EXTEND from the current end date,
 * not from today — otherwise paying early throws away the remaining
 * time. Once lapsed, the new window starts now.
 */
export function resolveRenewalStart(
  currentEndsAt: string | Date | null | undefined,
  now: Date = new Date(),
): Date {
  const current = toDate(currentEndsAt ?? null);
  if (current && current.getTime() > now.getTime()) return current;
  return now;
}

/**
 * Resolve a cycle's duration into the shape `addDuration` wants.
 * Centralised so the "days override months" precedence is stated once.
 */
export function resolveCycleDuration(cycle: {
  months?: number | null;
  duration_days?: number | null;
}): { months: number; days: number | null } {
  return {
    months: cycle.months ?? 0,
    days: cycle.duration_days ?? null,
  };
}
