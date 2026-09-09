// ============================================================
// Message-usage alerts — pure derivation, no I/O.
//
// The operator sets a message budget for a calendar week or month plus
// threshold percentages, and gets notified as each one is crossed. The
// shape is deliberately an AWS-style budget alarm: warn on the way up,
// never block. Nothing here stops a send — a CRM that silently refuses to
// message customers because a number in Settings was set too low would be
// far worse than an overspend.
//
// WHY CALENDAR PERIODS AND NOT ROLLING WINDOWS
// "10,000 a month" means the calendar month. A rolling 30-day window
// makes the figure drift daily and the reset impossible to explain — an
// operator looking at "9,800 used" cannot tell when it will go down.
// Weeks are ISO weeks (Monday start), matching `date_trunc('week')` so
// the SQL and this file agree.
//
// WHY UTC
// The period boundary has to be computed identically in Postgres (which
// is UTC here) and in the browser (which is not). Deriving both from UTC
// is the only way "the month resets at midnight" means one moment rather
// than one per user. Documented in the UI so a Kolkata operator is not
// surprised by a reset at 05:30 local.
// ============================================================

/** How often the budget resets. */
export type UsageAlertPeriod = 'weekly' | 'monthly';

export interface UsageAlertConfig {
  enabled: boolean;
  period: UsageAlertPeriod;
  /** Messages allowed per period. Always > 0 (enforced by the DB). */
  messageLimit: number;
  /** Percentages of the limit that trigger a notification. */
  thresholds: number[];
}

/** Severity of the highest threshold crossed. Drives copy and colour. */
export type UsageAlertLevel = 'ok' | 'warning' | 'critical';

export interface UsageAlertStatus {
  level: UsageAlertLevel;
  used: number;
  limit: number;
  /** Rounded, and NOT clamped — going over the budget is the point. */
  percent: number;
  /** Thresholds already crossed at this usage, ascending. */
  crossed: number[];
  /** The next threshold not yet reached, or null when all are crossed. */
  next: number | null;
  /** Messages left before `next`, or null when there is no next. */
  remainingToNext: number | null;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
}

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 200;
export const MAX_THRESHOLD_COUNT = 5;

/** Defaults for a fresh alert: an early warning, then the breach. */
export const DEFAULT_THRESHOLDS = [80, 100];
export const DEFAULT_PERIOD: UsageAlertPeriod = 'monthly';

/**
 * Start of the current period, in UTC.
 *
 * Monthly → the 1st at 00:00. Weekly → the most recent Monday at 00:00,
 * because `Date.getUTCDay()` returns 0 for Sunday and ISO weeks start on
 * Monday; the `(day + 6) % 7` shift is what converts one to the other.
 */
export function periodStart(
  period: UsageAlertPeriod,
  now: Date = new Date()
): Date {
  if (period === 'monthly') {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );
  }
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday;
}

/** First instant of the NEXT period — i.e. when the counter resets. */
export function periodEnd(
  period: UsageAlertPeriod,
  now: Date = new Date()
): Date {
  const start = periodStart(period, now);
  if (period === 'monthly') {
    return new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

/**
 * Stable identifier for the current period: `2026-08` or `2026-W34`.
 *
 * This is the dedupe key — the UNIQUE index on
 * `whatsapp_usage_alert_events(alert_id, period_key, threshold)` is what
 * stops a five-minute cron notifying 288 times a day about the same
 * breach. It MUST be derived only from the period boundary, never from
 * "now", or a tick a second later would produce a different key and fire
 * again.
 */
export function periodKey(
  period: UsageAlertPeriod,
  now: Date = new Date()
): string {
  const start = periodStart(period, now);
  if (period === 'monthly') {
    const month = String(start.getUTCMonth() + 1).padStart(2, '0');
    return `${start.getUTCFullYear()}-${month}`;
  }
  // ISO week number: Thursday of the current week decides the year, which
  // is why 1 Jan can legitimately fall in week 52 of the previous year.
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  const week =
    1 +
    Math.round(
      (thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Human label for the current period, for UI copy. */
export function periodLabel(
  period: UsageAlertPeriod,
  now: Date = new Date()
): string {
  const start = periodStart(period, now);
  if (period === 'monthly') {
    return start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const end = new Date(periodEnd(period, now).getTime() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Clean a user-supplied threshold list: integers only, in range, unique,
 * ascending, capped in count.
 *
 * Sorting is not cosmetic. "Which thresholds have I crossed" and "what is
 * the next one" both assume ascending order, and an operator typing
 * `100, 50` should get a working alert rather than a subtly wrong one.
 */
export function normalizeThresholds(input: unknown): number[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned = raw
    .map((v) => (typeof v === 'number' ? v : Number.parseInt(String(v), 10)))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.round(v))
    .filter((v) => v >= MIN_THRESHOLD && v <= MAX_THRESHOLD);

  const unique = Array.from(new Set(cleaned)).sort((a, b) => a - b);
  return unique.slice(0, MAX_THRESHOLD_COUNT);
}

/**
 * Where this account stands right now.
 *
 * `percent` is deliberately NOT clamped to 100: at 12,000 of 10,000 the
 * useful fact is "120%", and clamping would make a serious overshoot look
 * identical to landing exactly on budget.
 */
export function evaluateUsage(
  config: UsageAlertConfig,
  used: number,
  now: Date = new Date()
): UsageAlertStatus {
  const limit = config.messageLimit;
  const thresholds = normalizeThresholds(config.thresholds);
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  const crossed = thresholds.filter((t) => percent >= t);
  const next = thresholds.find((t) => percent < t) ?? null;

  // Ceil, because the message that TIPS you over the threshold is the one
  // after the fraction — 0.2 of a message left means one more send does it.
  const remainingToNext =
    next === null ? null : Math.max(0, Math.ceil((next / 100) * limit) - used);

  const highestCrossed =
    crossed.length > 0 ? crossed[crossed.length - 1] : null;
  const level: UsageAlertLevel =
    highestCrossed === null
      ? 'ok'
      : highestCrossed >= 100
        ? 'critical'
        : 'warning';

  return {
    level,
    used,
    limit,
    percent,
    crossed,
    next,
    remainingToNext,
    periodKey: periodKey(config.period, now),
    periodStart: periodStart(config.period, now),
    periodEnd: periodEnd(config.period, now),
  };
}

/**
 * Which thresholds need a notification, given what already fired.
 *
 * Returns them ascending. Firing every newly-crossed threshold rather
 * than only the highest is deliberate: an account that jumps from 40% to
 * 130% between two ticks should still produce the 80% record, so the
 * history reads as a sequence rather than skipping a step.
 */
export function pendingThresholds(
  status: UsageAlertStatus,
  alreadyFired: readonly number[]
): number[] {
  const fired = new Set(alreadyFired);
  return status.crossed.filter((t) => !fired.has(t));
}

/** Notification copy for one crossed threshold. */
export function thresholdNotification(
  threshold: number,
  status: UsageAlertStatus,
  period: UsageAlertPeriod,
  label: string
): { title: string; body: string } {
  const scope = period === 'monthly' ? 'monthly' : 'weekly';
  const used = status.used.toLocaleString('en-US');
  const limit = status.limit.toLocaleString('en-US');

  if (threshold >= 100) {
    return {
      title: `WhatsApp ${scope} message limit reached`,
      body:
        `${used} of ${limit} messages sent in ${label} — that is ${status.percent}% of the limit you set. ` +
        `Sending is not blocked; this is a heads-up. The counter resets automatically at the start of the next ${scope === 'monthly' ? 'month' : 'week'}.`,
    };
  }

  return {
    title: `WhatsApp ${scope} messages at ${threshold}%`,
    body:
      `${used} of ${limit} messages sent in ${label}. ` +
      (status.remainingToNext !== null && status.next !== null
        ? `About ${status.remainingToNext.toLocaleString('en-US')} more would reach ${status.next}%.`
        : 'Nothing is blocked — this is a heads-up.'),
  };
}
