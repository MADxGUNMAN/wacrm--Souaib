// ============================================================
// Account-level WhatsApp insights: window maths + parsing.
//
// Pure. The Graph calls live in meta-api.ts. This is the part with the
// rules in it, so it is separated to be reasoned about (and verified)
// without a network round trip.
//
// Meta exposes account analytics as FOUR different fields on the WABA
// node, each with its own filter vocabulary:
//
//   analytics              sent/delivered message counts
//   conversation_analytics 24-hour conversation counts + cost
//   pricing_analytics      per-message volume + cost, by category/tier
//   call_analytics         call count, cost, average duration
//
// ─── The trap: the granularity enums are NOT the same ─────────────
//
//   analytics              HALF_HOUR | DAY    | MONTH
//   conversation_analytics HALF_HOUR | DAILY  | MONTHLY
//   pricing_analytics      HALF_HOUR | DAILY  | MONTHLY
//   call_analytics         HALF_HOUR | DAILY  | MONTHLY
//
// `DAY` vs `DAILY` is a one-word difference that Meta rejects outright,
// and it is invisible in review. `granularityFor()` is the only place
// that choice is made.
//
// ─── The other trap: response nesting differs per field ───────────
//
//   analytics       → { data_points: [...] }
//   call_analytics  → { data_points: [...] }
//   conversation_*  → { data: [ { data_points: [...] } ] }
//   pricing_*       → { data: [ { data_points: [...] } ] }
//
// `collectDataPoints` flattens both shapes so callers cannot get it
// wrong for one field and right for another.
//
// Cost is `null`, never 0, when Meta declined to report it — Meta omits
// cost entirely for WABAs billed through a Solution Partner's credit
// line, and rendering that as "free" would be a lie about money.
//
// https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
// ============================================================

/**
 * Meta's lookback cap for messaging, conversation and pricing analytics.
 *
 * Was 10 years; cut to 1 year on 1 December 2025. Template analytics is
 * a separate, shorter 90-day cap — see template-analytics.ts.
 */
export const ACCOUNT_INSIGHTS_MAX_LOOKBACK_DAYS = 365;

/** Above this many days we switch to monthly buckets. */
const MONTHLY_THRESHOLD_DAYS = 92;

const SECONDS_PER_DAY = 86_400;

// ── Window ──────────────────────────────────────────────────

export interface InsightsWindow {
  /** UNIX seconds, 00:00 UTC of the first day included. */
  startSec: number;
  /** UNIX seconds, exclusive — 00:00 UTC of the day after the last. */
  endSec: number;
  days: number;
  startDate: string;
  endDate: string;
  /** True when the request asked for more than Meta's lookback. */
  clamped: boolean;
  /** True when buckets are months rather than days. */
  monthly: boolean;
}

export class InsightsWindowError extends Error {}

function startOfUtcDaySec(date: Date): number {
  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
    1000
  );
}

export function utcDateKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** YYYY-MM, for monthly buckets. */
export function utcMonthKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 7);
}

export function parseUtcDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const sec = Date.UTC(Number(y), Number(m) - 1, Number(d)) / 1000;
  if (utcDateKey(sec) !== `${y}-${m}-${d}`) return null;
  return sec;
}

/**
 * Resolve the window to request, clamped to Meta's lookback.
 *
 * Reports the window it actually resolved rather than the one asked for,
 * so the UI can label itself honestly instead of captioning three months
 * of data "last year".
 */
export function resolveInsightsWindow(input: {
  days?: number | null;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): InsightsWindow {
  const now = input.now ?? new Date();
  const todayStart = startOfUtcDaySec(now);
  const floor =
    todayStart - (ACCOUNT_INSIGHTS_MAX_LOOKBACK_DAYS - 1) * SECONDS_PER_DAY;

  const finish = (startSec: number, lastDay: number, clamped: boolean) => {
    const endSec = lastDay + SECONDS_PER_DAY;
    const days = Math.round((endSec - startSec) / SECONDS_PER_DAY);
    return {
      startSec,
      endSec,
      days,
      startDate: utcDateKey(startSec),
      endDate: utcDateKey(lastDay),
      clamped,
      monthly: days > MONTHLY_THRESHOLD_DAYS,
    };
  };

  if (input.start || input.end) {
    if (!input.start || !input.end) {
      throw new InsightsWindowError(
        'A custom range needs both a start and an end date.'
      );
    }
    const rawStart = parseUtcDateOnly(input.start);
    const rawEnd = parseUtcDateOnly(input.end);
    if (rawStart === null || rawEnd === null) {
      throw new InsightsWindowError('Dates must be in YYYY-MM-DD format.');
    }
    if (rawEnd < rawStart) {
      throw new InsightsWindowError(
        'The end date cannot be before the start date.'
      );
    }
    if (rawStart > todayStart) {
      throw new InsightsWindowError('The start date cannot be in the future.');
    }
    const startSec = Math.max(rawStart, floor);
    const lastDay = Math.min(rawEnd, todayStart);
    return finish(
      startSec,
      lastDay,
      startSec !== rawStart || lastDay !== rawEnd
    );
  }

  const requested = Math.trunc(input.days ?? 30);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new InsightsWindowError('The number of days must be 1 or more.');
  }
  const days = Math.min(requested, ACCOUNT_INSIGHTS_MAX_LOOKBACK_DAYS);
  return finish(
    todayStart - (days - 1) * SECONDS_PER_DAY,
    todayStart,
    days !== requested
  );
}

/**
 * The right granularity token for a given field.
 *
 * `analytics` is the odd one out: it wants DAY where every other
 * analytics field wants DAILY. Meta rejects the wrong spelling rather
 * than coercing it.
 *
 * ─── Why this ALWAYS asks for daily, never monthly ────────────────
 *
 * It used to request MONTHLY for windows over ~3 months, which produced
 * totals that disagreed with themselves: a 12-month window reported LESS
 * spend than a 30-day window over the same account, because Meta's
 * monthly buckets do not cover the in-progress month the same way daily
 * buckets do. A wider window returning a smaller total is indefensible,
 * and it is the kind of wrongness that quietly destroys trust in every
 * other number on the page.
 *
 * Daily is requested for every window length and rolled up on our side
 * for readability (see `foldToMonths`). Totals are then always the sum
 * of the same daily truths regardless of the period selected.
 */
export function granularityFor(
  field: 'analytics' | 'conversation' | 'pricing' | 'call'
): string {
  return field === 'analytics' ? 'DAY' : 'DAILY';
}

/**
 * Bucket key for a data point.
 *
 * Always a day. Month rollup happens after the fact so that bucketing
 * can never change a total.
 */
export function bucketKey(unixSeconds: number): string {
  return utcDateKey(unixSeconds);
}

/** Every day in the window, so charts show quiet days too. */
export function enumerateBuckets(window: InsightsWindow): string[] {
  const keys: string[] = [];
  for (let sec = window.startSec; sec < window.endSec; sec += SECONDS_PER_DAY) {
    keys.push(utcDateKey(sec));
  }
  return keys;
}

/**
 * Collapse a daily series into calendar months for display.
 *
 * Sums every numeric field it finds, so it works unchanged for the
 * messaging, conversation, pricing and call series without four
 * near-identical helpers. Display-only: totals are computed from the raw
 * data points, never from these buckets.
 */
export function foldToMonths<T extends { bucket: string }>(rows: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = row.bucket.slice(0, 7);
    const existing = out.get(key);
    if (!existing) {
      out.set(key, { ...row, bucket: key });
      continue;
    }
    const target = existing as unknown as Record<string, unknown>;
    for (const [field, value] of Object.entries(row)) {
      if (field === 'bucket' || typeof value !== 'number') continue;
      target[field] = ((target[field] as number) ?? 0) + value;
    }
  }
  return [...out.values()];
}

/** Daily series, rolled up to months when the window is long. */
function seriesForWindow<T extends { bucket: string }>(
  rows: T[],
  window: InsightsWindow
): T[] {
  return window.monthly ? foldToMonths(rows) : rows;
}

// ── Shared raw-shape handling ───────────────────────────────

interface RawPointBase {
  start?: number;
  end?: number;
}

/**
 * Pull data points out of either response shape.
 *
 * `analytics` and `call_analytics` put them at the top level;
 * `conversation_analytics` and `pricing_analytics` wrap them in a
 * `data[]` array of groups.
 */
export function collectDataPoints<T extends RawPointBase>(raw: unknown): T[] {
  if (!raw || typeof raw !== 'object') return [];
  const root = raw as Record<string, unknown>;

  if (Array.isArray(root.data_points)) return root.data_points as T[];

  if (Array.isArray(root.data)) {
    const out: T[] = [];
    for (const group of root.data) {
      if (!group || typeof group !== 'object') continue;
      const points = (group as Record<string, unknown>).data_points;
      if (Array.isArray(points)) out.push(...(points as T[]));
    }
    return out;
  }
  return [];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Present only when Meta actually sent a numeric cost. */
function optionalNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One row of a categorical breakdown. */
export interface BreakdownRow {
  key: string;
  volume: number;
  cost: number | null;
}

function addToBreakdown(
  map: Map<string, BreakdownRow>,
  key: string | undefined,
  volume: number,
  cost: number | null
) {
  const label = (key ?? '').trim() || 'UNKNOWN';
  const row = map.get(label) ?? { key: label, volume: 0, cost: null };
  row.volume += volume;
  if (cost !== null) row.cost = (row.cost ?? 0) + cost;
  map.set(label, row);
}

function sortBreakdown(map: Map<string, BreakdownRow>): BreakdownRow[] {
  return [...map.values()].sort(
    (a, b) => b.volume - a.volume || (b.cost ?? 0) - (a.cost ?? 0)
  );
}

// ── Messaging analytics ─────────────────────────────────────

export interface MessagingBucket {
  bucket: string;
  sent: number;
  delivered: number;
}

export interface MessagingSummary {
  sent: number;
  delivered: number;
  /** Fraction 0–1, or null when nothing was sent. */
  deliveryRate: number | null;
  series: MessagingBucket[];
  phoneNumbers: string[];
  countryCodes: string[];
  hasData: boolean;
}

export function normalizeMessagingAnalytics(
  raw: unknown,
  window: InsightsWindow
): MessagingSummary {
  const points = collectDataPoints<
    RawPointBase & { sent?: number; delivered?: number }
  >(raw);

  const buckets = new Map<string, MessagingBucket>();
  for (const key of enumerateBuckets(window)) {
    buckets.set(key, { bucket: key, sent: 0, delivered: 0 });
  }

  let sent = 0;
  let delivered = 0;
  let counted = 0;
  for (const point of points) {
    // ─── The invariant: totals count exactly what the chart shows ───
    //
    // A point with no bucket in the requested window is skipped for the
    // TOTALS as well as the series. Meta snaps boundary timestamps
    // backwards, so a response can carry a point just outside the range
    // asked for; counting it in the headline while it has nowhere to
    // appear below makes the summary disagree with its own chart, and
    // there is no way for a reader to tell which one is wrong.
    if (typeof point.start !== 'number') continue;
    const slot = buckets.get(bucketKey(point.start));
    if (!slot) continue;

    const s = num(point.sent);
    const d = num(point.delivered);
    sent += s;
    delivered += d;
    slot.sent += s;
    slot.delivered += d;
    counted++;
  }

  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;

  return {
    sent,
    delivered,
    deliveryRate: sent > 0 ? delivered / sent : null,
    series: seriesForWindow([...buckets.values()], window),
    phoneNumbers: Array.isArray(root.phone_numbers)
      ? root.phone_numbers.map(String)
      : [],
    countryCodes: Array.isArray(root.country_codes)
      ? root.country_codes.map(String)
      : [],
    hasData: counted > 0,
  };
}

// ── Conversation analytics ──────────────────────────────────

export interface ConversationSummary {
  conversations: number;
  cost: number | null;
  byCategory: BreakdownRow[];
  byType: BreakdownRow[];
  byDirection: BreakdownRow[];
  byCountry: BreakdownRow[];
  series: { bucket: string; conversations: number; cost: number }[];
  hasData: boolean;
  /** True when at least one point carried a cost figure. */
  costReported: boolean;
}

export function normalizeConversationAnalytics(
  raw: unknown,
  window: InsightsWindow
): ConversationSummary {
  const points = collectDataPoints<
    RawPointBase & {
      conversation?: number;
      cost?: number;
      conversation_category?: string;
      conversation_type?: string;
      conversation_direction?: string;
      country?: string;
      phone_number?: string;
    }
  >(raw);

  const byCategory = new Map<string, BreakdownRow>();
  const byType = new Map<string, BreakdownRow>();
  const byDirection = new Map<string, BreakdownRow>();
  const byCountry = new Map<string, BreakdownRow>();
  const buckets = new Map<
    string,
    { bucket: string; conversations: number; cost: number }
  >();
  for (const key of enumerateBuckets(window)) {
    buckets.set(key, { bucket: key, conversations: 0, cost: 0 });
  }

  let conversations = 0;
  let cost: number | null = null;
  let costReported = false;
  let counted = 0;

  for (const point of points) {
    // Same invariant as messaging: no bucket, no count. See there.
    if (typeof point.start !== 'number') continue;
    const slot = buckets.get(bucketKey(point.start));
    if (!slot) continue;
    counted++;

    const count = num(point.conversation);
    const pointCost = optionalNum(point.cost);
    conversations += count;
    if (pointCost !== null) {
      cost = (cost ?? 0) + pointCost;
      costReported = true;
    }

    addToBreakdown(byCategory, point.conversation_category, count, pointCost);
    addToBreakdown(byType, point.conversation_type, count, pointCost);
    addToBreakdown(byDirection, point.conversation_direction, count, pointCost);
    if (point.country) {
      addToBreakdown(byCountry, point.country, count, pointCost);
    }

    slot.conversations += count;
    slot.cost += pointCost ?? 0;
  }

  return {
    conversations,
    cost,
    byCategory: sortBreakdown(byCategory),
    byType: sortBreakdown(byType),
    byDirection: sortBreakdown(byDirection),
    byCountry: sortBreakdown(byCountry),
    series: seriesForWindow([...buckets.values()], window),
    hasData: counted > 0,
    costReported,
  };
}

// ── Pricing analytics ───────────────────────────────────────

/** Progress toward the next volume-tier price break. */
export interface TierProgress {
  country: string;
  category: string;
  /** Meta's raw `tier`, e.g. "0:750000". */
  raw: string;
  /** Upper bound, or null for the open-ended `MAX` tier. */
  upper: number | null;
  volume: number;
  /** Messages still needed to cross into the next tier. */
  remaining: number | null;
}

export interface PricingSummary {
  volume: number;
  cost: number | null;
  /** Messages Meta charged nothing for. */
  freeVolume: number;
  paidVolume: number;
  byCategory: BreakdownRow[];
  byType: BreakdownRow[];
  byCountry: BreakdownRow[];
  series: { bucket: string; volume: number; cost: number }[];
  tiers: TierProgress[];
  hasData: boolean;
  costReported: boolean;
}

/** `"0:750000"` → 750000; `"0:MAX"` → null. */
function parseTierUpper(raw: string): number | null {
  const upper = raw.split(':')[1]?.trim().toUpperCase();
  if (!upper || upper === 'MAX') return null;
  const value = Number(upper);
  return Number.isFinite(value) ? value : null;
}

export function normalizePricingAnalytics(
  raw: unknown,
  window: InsightsWindow
): PricingSummary {
  const points = collectDataPoints<
    RawPointBase & {
      volume?: number;
      cost?: number;
      country?: string;
      phone_number?: string;
      tier?: string;
      pricing_type?: string;
      pricing_category?: string;
    }
  >(raw);

  const byCategory = new Map<string, BreakdownRow>();
  const byType = new Map<string, BreakdownRow>();
  const byCountry = new Map<string, BreakdownRow>();
  const buckets = new Map<
    string,
    { bucket: string; volume: number; cost: number }
  >();
  for (const key of enumerateBuckets(window)) {
    buckets.set(key, { bucket: key, volume: 0, cost: 0 });
  }

  /** Tier is per country+category; the latest point wins. */
  const tierMap = new Map<string, TierProgress>();

  let volume = 0;
  let cost: number | null = null;
  let freeVolume = 0;
  let paidVolume = 0;
  let costReported = false;
  let counted = 0;

  for (const point of points) {
    // Same invariant as messaging: no bucket, no count. See there.
    if (typeof point.start !== 'number') continue;
    const slot = buckets.get(bucketKey(point.start));
    if (!slot) continue;
    counted++;

    const vol = num(point.volume);
    const pointCost = optionalNum(point.cost);
    volume += vol;
    if (pointCost !== null) {
      cost = (cost ?? 0) + pointCost;
      costReported = true;
    }

    // FREE_* pricing types are Meta's own classification of "not
    // charged", which is more reliable than inferring from cost === 0
    // (a paid message can round to zero in some currencies).
    const type = (point.pricing_type ?? '').toUpperCase();
    if (type.startsWith('FREE')) freeVolume += vol;
    else if (type) paidVolume += vol;

    addToBreakdown(byCategory, point.pricing_category, vol, pointCost);
    addToBreakdown(byType, point.pricing_type, vol, pointCost);
    if (point.country) addToBreakdown(byCountry, point.country, vol, pointCost);

    // Tier is omitted for free messages, and marketing is always 0:MAX.
    if (point.tier && point.country && point.pricing_category) {
      const key = `${point.country}::${point.pricing_category}`;
      const upper = parseTierUpper(point.tier);
      const existing = tierMap.get(key);
      const runningVolume = (existing?.volume ?? 0) + vol;
      tierMap.set(key, {
        country: point.country,
        category: point.pricing_category,
        raw: point.tier,
        upper,
        volume: runningVolume,
        remaining: upper !== null ? Math.max(0, upper - runningVolume) : null,
      });
    }

    slot.volume += vol;
    slot.cost += pointCost ?? 0;
  }

  return {
    volume,
    cost,
    freeVolume,
    paidVolume,
    byCategory: sortBreakdown(byCategory),
    byType: sortBreakdown(byType),
    byCountry: sortBreakdown(byCountry),
    series: seriesForWindow([...buckets.values()], window),
    // Only tiers that actually cap something are actionable.
    tiers: [...tierMap.values()]
      .filter((t) => t.upper !== null)
      .sort((a, b) => b.volume - a.volume),
    hasData: counted > 0,
    costReported,
  };
}

// ── Call analytics ──────────────────────────────────────────

export interface CallSummary {
  count: number;
  cost: number | null;
  /** Seconds, weighted by call count rather than a mean of means. */
  averageDuration: number | null;
  series: { bucket: string; count: number; cost: number }[];
  hasData: boolean;
  costReported: boolean;
}

export function normalizeCallAnalytics(
  raw: unknown,
  window: InsightsWindow
): CallSummary {
  const points = collectDataPoints<
    RawPointBase & {
      count?: number;
      cost?: number;
      average_duration?: number;
    }
  >(raw);

  const buckets = new Map<
    string,
    { bucket: string; count: number; cost: number }
  >();
  for (const key of enumerateBuckets(window)) {
    buckets.set(key, { bucket: key, count: 0, cost: 0 });
  }

  let count = 0;
  let cost: number | null = null;
  let costReported = false;
  let counted = 0;
  /** Sum of duration × calls, so the average is weighted correctly. */
  let durationWeighted = 0;
  let durationCalls = 0;

  for (const point of points) {
    // Same invariant as messaging: no bucket, no count. See there.
    if (typeof point.start !== 'number') continue;
    const slot = buckets.get(bucketKey(point.start));
    if (!slot) continue;
    counted++;

    const c = num(point.count);
    const pointCost = optionalNum(point.cost);
    count += c;
    if (pointCost !== null) {
      cost = (cost ?? 0) + pointCost;
      costReported = true;
    }
    const duration = optionalNum(point.average_duration);
    if (duration !== null && c > 0) {
      durationWeighted += duration * c;
      durationCalls += c;
    }

    slot.count += c;
    slot.cost += pointCost ?? 0;
  }

  return {
    count,
    cost,
    averageDuration:
      durationCalls > 0 ? durationWeighted / durationCalls : null,
    series: seriesForWindow([...buckets.values()], window),
    hasData: counted > 0,
    costReported,
  };
}
