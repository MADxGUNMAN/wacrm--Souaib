// ============================================================
// Template analytics: window maths and response normalisation.
//
// Everything in this file is pure. The Graph call itself lives in
// meta-api.ts (`fetchTemplateAnalytics`) alongside its siblings; the
// parsing lives here because it is the part with real rules in it and
// the part worth reasoning about carefully.
//
// Meta's contract (Business Management API → Analytics):
//   GET /{waba-id}/template_analytics
//     start, end        UNIX seconds or YYYY-MM-DD
//     granularity       DAILY (the only accepted value)
//     template_ids      array, MAX 10
//     metric_types      SENT | DELIVERED | READ | CLICKED | COST
//
// Three properties of that API drive the design here:
//
// 1. Daily buckets are UTC and half-open — a point's `start` is 00:00
//    UTC of its day and `end` is 00:00 the next day. A start timestamp
//    that isn't midnight gets snapped BACKWARDS by Meta, so we align
//    explicitly rather than letting the window shift under us.
//
// 2. The lookback window is capped at 90 days. Asking for more is not
//    an error — you simply get less than you asked for, which is how a
//    UI ends up captioned "Last 365 days" over three months of data.
//    `resolveAnalyticsWindow` clamps and reports that it clamped.
//
// 3. `clicked` mixes totals and uniques in ONE array, distinguished
//    only by a `unique_` prefix on `type`:
//      [{ type: 'quick_reply_button', count: 108 },
//       { type: 'unique_url_button',  count: 16  }]
//    Summing the array blindly double-counts every click. That is the
//    single easiest way to get this feature wrong, so the split is
//    handled in exactly one place: `isUniqueClickType`.
//
// https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
// ============================================================

/** Meta's hard cap on how far back template analytics reach. */
export const TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS = 90;

/**
 * How long Meta retains read/click events for a sent message.
 *
 * After this, the read and click counts for those messages reset to zero
 * and never update again — sent/delivered stay put. So an old window can
 * legitimately show 500 delivered and 0 read, which looks like a broken
 * integration and is not one. The UI cites this rather than letting the
 * operator conclude nobody opened anything.
 */
export const TEMPLATE_ANALYTICS_ENGAGEMENT_RETENTION_DAYS = 7;

/** Meta's cap on template_ids per request. */
export const TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS = 10;

export type TemplateAnalyticsMetric =
  'SENT' | 'DELIVERED' | 'READ' | 'CLICKED' | 'COST';

export const DEFAULT_TEMPLATE_ANALYTICS_METRICS: TemplateAnalyticsMetric[] = [
  'SENT',
  'DELIVERED',
  'READ',
  'CLICKED',
  'COST',
];

// ── Raw shapes, exactly as Meta sends them ──────────────────

export interface RawClickEntry {
  /** e.g. `quick_reply_button`, `url_button`, `unique_url_button`. */
  type?: string;
  /** The button's visible label. Absent on some responses. */
  button_content?: string;
  count?: number;
}

export interface RawCostEntry {
  /** `amount_spent`, `cost_per_delivered`, `cost_per_url_button_click`. */
  type?: string;
  value?: number;
}

export interface RawTemplateAnalyticsDataPoint {
  template_id?: string | number;
  /** UNIX seconds, 00:00 UTC of the bucket's day. */
  start?: number;
  end?: number;
  sent?: number;
  delivered?: number;
  read?: number;
  clicked?: RawClickEntry[];
  cost?: RawCostEntry[];
}

export interface RawTemplateAnalyticsResponse {
  data?: {
    granularity?: string;
    product_type?: string;
    waba_timezone?: string;
    data_points?: RawTemplateAnalyticsDataPoint[];
  }[];
}

// ── Normalised shapes the UI consumes ───────────────────────

export interface TemplateAnalyticsTotals {
  sent: number;
  delivered: number;
  read: number;
  /** Total button taps. */
  clicked: number;
  /** Distinct people who tapped a button. */
  uniqueClicked: number;
}

export interface DailyTemplateMetrics {
  /** YYYY-MM-DD, UTC. */
  date: string;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  /** Distinct recipients who tapped, for this day. */
  uniqueClicked: number;
  /**
   * Spend for this day, or null when Meta reported no cost for it.
   *
   * Null rather than 0 so a day Meta said nothing about is
   * distinguishable from a day that genuinely cost nothing — the
   * difference matters when these rows are persisted and later merged.
   */
  amountSpent: number | null;
  /**
   * Meta's OWN per-delivered rate, as reported — not amount / delivered.
   *
   * Kept separate from any local arithmetic on purpose. Recomputing this
   * from amount_spent produced a number that disagreed with the identical
   * label in WhatsApp Manager, because Meta's reported rate and a locally
   * derived one are different quantities that look the same.
   */
  costPerDelivered: number | null;
  /** Meta's own per-URL-button-click rate. Null when no URL button. */
  costPerUrlClick: number | null;
  /**
   * Per-button clicks for this day.
   *
   * Stored per day rather than only aggregated, because the screen is
   * served from our database: anything not persisted disappears when the
   * live Meta call is moved to a background refresh.
   *
   * Null means Meta reported no button data for the day; an empty array
   * means it reported buttons that nobody tapped.
   */
  buttons: ButtonClickStat[] | null;
}

export interface ButtonClickStat {
  /** Meta's `button_content`, or a fallback describing the button type. */
  label: string;
  /** Base type with any `unique_` prefix removed. */
  type: string;
  clicks: number;
  uniqueClicks: number;
}

export interface TemplateAnalyticsCost {
  /**
   * Total spend across the window, in the WABA's currency.
   *
   * Null — not zero — when Meta returned no COST metric at all. Meta
   * omits cost for WABAs on a Solution Partner's credit line, and "we
   * were not told" must not render as "it was free".
   */
  amountSpent: number | null;
  /** Derived from totals so it can never disagree with what's displayed. */
  costPerDelivered: number | null;
}

export interface NormalizedTemplateAnalytics {
  totals: TemplateAnalyticsTotals;
  daily: DailyTemplateMetrics[];
  buttons: ButtonClickStat[];
  cost: TemplateAnalyticsCost;
  granularity: string | null;
  productType: string | null;
  /** True when Meta returned at least one data point for this template. */
  hasData: boolean;
}

// ── Window resolution ───────────────────────────────────────

export interface AnalyticsWindow {
  /** UNIX seconds, 00:00 UTC of the first day included. */
  startSec: number;
  /**
   * UNIX seconds, 00:00 UTC of the day AFTER the last day included.
   *
   * Exclusive because Meta's buckets are. Using today's midnight as the
   * end would silently drop today.
   */
  endSec: number;
  /** Days actually covered, after clamping. */
  days: number;
  startDate: string;
  endDate: string;
  /** True when the request asked for more than Meta's 90-day lookback. */
  clamped: boolean;
}

const SECONDS_PER_DAY = 86_400;

/** Midnight UTC of the day containing `date`, in UNIX seconds. */
function startOfUtcDaySec(date: Date): number {
  return (
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    ) / 1000
  );
}

/** YYYY-MM-DD for a UNIX-seconds instant, in UTC. */
export function utcDateKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as midnight UTC. Null when not that exact shape. */
export function parseUtcDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const sec = Date.UTC(year, month - 1, day) / 1000;
  // Reject impossible dates that Date.UTC silently rolls over (Feb 31).
  if (utcDateKey(sec) !== `${y}-${m}-${d}`) return null;
  return sec;
}

export class AnalyticsWindowError extends Error {}

/**
 * Work out the exact window to ask Meta for.
 *
 * Accepts either a rolling `days` count or an explicit `start`/`end`
 * pair of YYYY-MM-DD dates. Always day-aligned to UTC, always clamped to
 * Meta's 90-day lookback, and always reports the window it actually
 * resolved so the caller can label the UI with the truth rather than
 * with the request.
 */
export function resolveAnalyticsWindow(input: {
  days?: number | null;
  start?: string | null;
  end?: string | null;
  /**
   * All-time mode: cover everything we have ever recorded.
   *
   * Only possible because snapshots are stored (see
   * template-analytics-store.ts). Meta itself cannot answer beyond 90
   * days, so an all-time window is deliberately WIDER than what the
   * Graph request will cover — `metaRequestStart` clamps the request
   * while the window keeps its full span for bucketing and display.
   */
  allTime?: boolean;
  /** Earliest stored day, YYYY-MM-DD. Bounds all-time mode. */
  earliestDay?: string | null;
  now?: Date;
}): AnalyticsWindow {
  const now = input.now ?? new Date();
  const todayStart = startOfUtcDaySec(now);
  /** Oldest day Meta will answer for. */
  const floor =
    todayStart - (TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS - 1) * SECONDS_PER_DAY;

  if (input.allTime) {
    const earliest = input.earliestDay
      ? parseUtcDateOnly(input.earliestDay)
      : null;
    // With no stored history yet, all-time is simply everything Meta can
    // still answer for — never an empty range.
    const startSec = earliest !== null ? Math.min(earliest, floor) : floor;
    const endSec = todayStart + SECONDS_PER_DAY;
    return {
      startSec,
      endSec,
      days: Math.round((endSec - startSec) / SECONDS_PER_DAY),
      startDate: utcDateKey(startSec),
      endDate: utcDateKey(todayStart),
      // Nothing was truncated: this IS everything there is.
      clamped: false,
    };
  }

  if (input.start || input.end) {
    if (!input.start || !input.end) {
      throw new AnalyticsWindowError(
        'A custom range needs both a start and an end date.'
      );
    }
    const rawStart = parseUtcDateOnly(input.start);
    const rawEnd = parseUtcDateOnly(input.end);
    if (rawStart === null || rawEnd === null) {
      throw new AnalyticsWindowError('Dates must be in YYYY-MM-DD format.');
    }
    if (rawEnd < rawStart) {
      throw new AnalyticsWindowError(
        'The end date cannot be before the start date.'
      );
    }
    if (rawStart > todayStart) {
      throw new AnalyticsWindowError('The start date cannot be in the future.');
    }

    // Clamp both ends: too far back is Meta's limit, past today is
    // simply not knowable yet.
    const startSec = Math.max(rawStart, floor);
    const lastDay = Math.min(rawEnd, todayStart);
    const endSec = lastDay + SECONDS_PER_DAY;
    return {
      startSec,
      endSec,
      days: Math.round((endSec - startSec) / SECONDS_PER_DAY),
      startDate: utcDateKey(startSec),
      endDate: utcDateKey(lastDay),
      clamped: startSec !== rawStart || lastDay !== rawEnd,
    };
  }

  const requested = Math.trunc(input.days ?? 7);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new AnalyticsWindowError('The number of days must be 1 or more.');
  }
  const days = Math.min(requested, TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS);
  const startSec = todayStart - (days - 1) * SECONDS_PER_DAY;
  const endSec = todayStart + SECONDS_PER_DAY;
  return {
    startSec,
    endSec,
    days,
    startDate: utcDateKey(startSec),
    endDate: utcDateKey(todayStart),
    clamped: days !== requested,
  };
}

/**
 * The `start` to actually send Meta for a given window.
 *
 * Meta refuses (or silently empties) anything beyond its 90-day
 * lookback, so an all-time window — which can reach back years once
 * snapshots accumulate — must not be sent verbatim. The window keeps its
 * full span for bucketing and labelling; only the request is clamped,
 * and the older part of the range is served from stored history.
 */
export function metaRequestStart(window: AnalyticsWindow, now?: Date): number {
  const todayStart =
    Math.floor((now ?? new Date()).getTime() / 1000 / SECONDS_PER_DAY) *
    SECONDS_PER_DAY;
  const floor =
    todayStart - (TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS - 1) * SECONDS_PER_DAY;
  return Math.max(window.startSec, floor);
}

/** Every YYYY-MM-DD in the window, so a chart shows quiet days too. */
export function enumerateWindowDates(window: AnalyticsWindow): string[] {
  const dates: string[] = [];
  for (let sec = window.startSec; sec < window.endSec; sec += SECONDS_PER_DAY) {
    dates.push(utcDateKey(sec));
  }
  return dates;
}

// ── Response normalisation ──────────────────────────────────

/**
 * Meta reports uniques as separate entries in the same array, marked by
 * a `unique_` prefix. This is the only place that prefix is interpreted.
 */
export function isUniqueClickType(type: string | undefined): boolean {
  return (type ?? '').toLowerCase().startsWith('unique_');
}

function baseClickType(type: string | undefined): string {
  const t = (type ?? '').toLowerCase();
  return t.startsWith('unique_') ? t.slice('unique_'.length) : t;
}

/** `quick_reply_button` → `Quick reply button`. */
function humaniseClickType(type: string): string {
  if (!type) return 'Button';
  return type
    .split('_')
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Present only when Meta actually sent a number. */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Fold Meta's response into totals, a gap-free daily series, and a
 * per-button breakdown.
 *
 * `templateId` filters the data points. Meta echoes back every template
 * asked for in one flat array, and this app asks about one at a time —
 * but filtering rather than trusting the shape means a future batched
 * call cannot quietly attribute another template's clicks to this one.
 */
export function normalizeTemplateAnalytics(
  raw: RawTemplateAnalyticsResponse,
  templateId: string,
  window: AnalyticsWindow
): NormalizedTemplateAnalytics {
  const groups = Array.isArray(raw?.data) ? raw.data : [];

  const byDate = new Map<string, DailyTemplateMetrics>();
  for (const date of enumerateWindowDates(window)) {
    byDate.set(date, {
      date,
      sent: 0,
      delivered: 0,
      read: 0,
      clicked: 0,
      uniqueClicked: 0,
      amountSpent: null,
      costPerDelivered: null,
      costPerUrlClick: null,
      buttons: null,
    });
  }

  const totals: TemplateAnalyticsTotals = {
    sent: 0,
    delivered: 0,
    read: 0,
    clicked: 0,
    uniqueClicked: 0,
  };

  const buttonMap = new Map<string, ButtonClickStat>();
  let amountSpent: number | null = null;
  let granularity: string | null = null;
  let productType: string | null = null;
  let hasData = false;

  for (const group of groups) {
    granularity = group?.granularity ?? granularity;
    productType = group?.product_type ?? productType;
    const points = Array.isArray(group?.data_points) ? group.data_points : [];

    for (const point of points) {
      // Meta returns ids as strings, but has been known to send numbers.
      if (String(point?.template_id ?? '') !== templateId) continue;
      hasData = true;

      const sent = numberOrZero(point.sent);
      const delivered = numberOrZero(point.delivered);
      const read = numberOrZero(point.read);

      totals.sent += sent;
      totals.delivered += delivered;
      totals.read += read;

      let dayClicks = 0;
      let dayUniqueClicks = 0;
      /** Same aggregation as `buttonMap`, but scoped to this one day. */
      const dayButtons = new Map<string, ButtonClickStat>();
      for (const entry of Array.isArray(point.clicked) ? point.clicked : []) {
        const count = numberOrZero(entry?.count);
        if (count === 0) continue;
        const unique = isUniqueClickType(entry?.type);
        const type = baseClickType(entry?.type);
        const label = entry?.button_content?.trim() || humaniseClickType(type);

        if (unique) {
          totals.uniqueClicked += count;
          dayUniqueClicks += count;
        } else {
          totals.clicked += count;
          dayClicks += count;
        }

        const key = `${type}::${label}`;
        const existing = buttonMap.get(key) ?? {
          label,
          type,
          clicks: 0,
          uniqueClicks: 0,
        };
        if (unique) existing.uniqueClicks += count;
        else existing.clicks += count;
        buttonMap.set(key, existing);

        const perDay = dayButtons.get(key) ?? {
          label,
          type,
          clicks: 0,
          uniqueClicks: 0,
        };
        if (unique) perDay.uniqueClicks += count;
        else perDay.clicks += count;
        dayButtons.set(key, perDay);
      }

      let dayCost: number | null = null;
      let dayRatePerDelivered: number | null = null;
      let dayRatePerClick: number | null = null;
      for (const entry of Array.isArray(point.cost) ? point.cost : []) {
        const value = optionalNumber(entry?.value);
        if (value === null) continue;
        switch (entry?.type) {
          case 'amount_spent':
            // Additive: each bucket's own charge.
            amountSpent = (amountSpent ?? 0) + value;
            dayCost = (dayCost ?? 0) + value;
            break;
          case 'cost_per_delivered':
            // A RATE, so never summed. A day can carry several points
            // (Meta splits by template version), so keep the highest
            // reported rate rather than letting order decide.
            dayRatePerDelivered = Math.max(dayRatePerDelivered ?? 0, value);
            break;
          case 'cost_per_url_button_click':
            dayRatePerClick = Math.max(dayRatePerClick ?? 0, value);
            break;
          default:
            break;
        }
      }

      // A point outside the requested window (Meta snapping a boundary)
      // still counts toward totals, but has no column to land in.
      const date =
        typeof point.start === 'number' ? utcDateKey(point.start) : null;
      const bucket = date ? byDate.get(date) : undefined;
      if (bucket) {
        bucket.sent += sent;
        bucket.delivered += delivered;
        bucket.read += read;
        bucket.clicked += dayClicks;
        bucket.uniqueClicked += dayUniqueClicks;
        if (dayCost !== null) {
          bucket.amountSpent = (bucket.amountSpent ?? 0) + dayCost;
        }
        if (dayRatePerDelivered !== null) {
          bucket.costPerDelivered = Math.max(
            bucket.costPerDelivered ?? 0,
            dayRatePerDelivered
          );
        }
        if (dayRatePerClick !== null) {
          bucket.costPerUrlClick = Math.max(
            bucket.costPerUrlClick ?? 0,
            dayRatePerClick
          );
        }
        if (dayButtons.size > 0) {
          // Several data points can land on one day (Meta splits by
          // template version), so merge rather than overwrite.
          const combined = new Map(
            (bucket.buttons ?? []).map((b) => [`${b.type}::${b.label}`, b])
          );
          for (const [key, stat] of dayButtons) {
            const prior = combined.get(key);
            combined.set(
              key,
              prior
                ? {
                    label: stat.label,
                    type: stat.type,
                    clicks: prior.clicks + stat.clicks,
                    uniqueClicks: prior.uniqueClicks + stat.uniqueClicks,
                  }
                : stat
            );
          }
          bucket.buttons = [...combined.values()];
        }
      }
    }
  }

  return {
    totals,
    daily: [...byDate.values()],
    buttons: [...buttonMap.values()].sort(
      (a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label)
    ),
    cost: {
      amountSpent,
      costPerDelivered:
        amountSpent !== null && totals.delivered > 0
          ? amountSpent / totals.delivered
          : null,
    },
    granularity,
    productType,
    hasData,
  };
}

// ── Derived rates ───────────────────────────────────────────

export interface EngagementRates {
  /** delivered / sent */
  deliveryRate: number | null;
  /** read / delivered */
  openRate: number | null;
  /** clicked / delivered */
  clickRate: number | null;
  /** read / sent — the end-to-end view */
  readThroughRate: number | null;
  /** clicked / read — did the ones who opened it act */
  clickThroughRate: number | null;
}

/**
 * Rates as fractions (0–1), or null when the denominator is zero.
 *
 * Null rather than 0 deliberately: a template with nothing sent has an
 * UNKNOWN delivery rate, and rendering "0%" for it reads as a failure.
 * The UI shows an em dash for null.
 */
export function computeEngagementRates(
  totals: TemplateAnalyticsTotals
): EngagementRates {
  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : null;
  return {
    deliveryRate: ratio(totals.delivered, totals.sent),
    openRate: ratio(totals.read, totals.delivered),
    clickRate: ratio(totals.clicked, totals.delivered),
    readThroughRate: ratio(totals.read, totals.sent),
    clickThroughRate: ratio(totals.clicked, totals.read),
  };
}

/**
 * True when the window reaches back beyond Meta's read/click retention,
 * i.e. when zero reads may mean "expired" rather than "not opened".
 */
export function windowExceedsEngagementRetention(
  window: AnalyticsWindow
): boolean {
  return window.days > TEMPLATE_ANALYTICS_ENGAGEMENT_RETENTION_DAYS;
}
