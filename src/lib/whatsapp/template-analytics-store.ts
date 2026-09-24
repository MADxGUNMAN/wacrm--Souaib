// ============================================================
// Template analytics: durable snapshots.
//
// Meta's template analytics is a short window, not a record. Two
// documented behaviours destroy history:
//
//   • read and click counts are kept for 7 DAYS after a send, then reset
//     to zero and never reported again,
//   • the whole lookback is capped at 90 days.
//
// So the only way an operator can ever see a true long-run figure is if
// we keep what Meta told us the first time it told us. This module owns
// that: one row per template per UTC day in `template_analytics_daily`,
// merged with the live response on every read.
//
// ─── The merge rule, and why it is MAX and not "latest" ───────────
//
// Because reads and clicks decay, the newest observation is frequently
// the WORST one: a fetch made 8 days after a send truthfully reports 0
// reads. Letting that overwrite a stored 40 would delete the only copy
// of the real number. So each metric keeps the highest value ever seen.
//
// For stable metrics (sent, delivered, spend) max is identical to latest,
// and it additionally protects against a partial fetch — which is not
// hypothetical: an unpaginated response under-reported a window badly
// enough that a 30-day total came out below the 7-day total.
//
// ─── The no-double-count rule ─────────────────────────────────────
//
// Every write is an upsert on UNIQUE (template_id, day). Refreshing the
// dialog updates the row that day owns; it can never append a second row
// for the same day, and can never add a day's numbers to themselves.
// Aggregates over this table are therefore safe to sum.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';

import type {
  ButtonClickStat,
  DailyTemplateMetrics,
} from './template-analytics';

/** A stored snapshot row, in the same shape the normaliser produces. */
export interface StoredDailyRow extends DailyTemplateMetrics {
  currency: string | null;
}

/**
 * Merge two observations of the same day.
 *
 * ARGUMENT ORDER IS PART OF THE CONTRACT: `live` is the newer observation
 * (a fresh Meta response, or the gap-filled skeleton on the read path)
 * and `stored` is the snapshot already on disk. Both call sites pass them
 * that way — `mergeSeries` and `persistDailySnapshots`.
 *
 * Counts take the max, for the decay reason documented at the top of this
 * file. RATES take the newer value instead, because they are prices, not
 * counts: they never decay, and Meta does re-price. Keeping the max of an
 * old and a new rate would pin a template to the highest price it was
 * ever charged and quietly ignore every reduction after it.
 *
 * Exported and pure so both rules are testable without a database.
 */
export function mergeDailyRow(
  live: DailyTemplateMetrics,
  stored: DailyTemplateMetrics
): DailyTemplateMetrics {
  return {
    date: live.date,
    sent: Math.max(live.sent, stored.sent),
    delivered: Math.max(live.delivered, stored.delivered),
    read: Math.max(live.read, stored.read),
    clicked: Math.max(live.clicked, stored.clicked),
    uniqueClicked: Math.max(live.uniqueClicked, stored.uniqueClicked),
    // Spend for a past day is a historical fact, not a price, so it keeps
    // the max: that is what protects a stored total from a truncated
    // response, which has happened here before.
    amountSpent: higher(live.amountSpent, stored.amountSpent),
    // Rates: Meta's latest word wins, so a re-price flows through on the
    // next refresh instead of being maxed away.
    costPerDelivered: fresher(live.costPerDelivered, stored.costPerDelivered),
    costPerUrlClick: fresher(live.costPerUrlClick, stored.costPerUrlClick),
    buttons: mergeButtons(live.buttons, stored.buttons),
  };
}

/**
 * Merge two per-day button breakdowns, keeping the higher count per
 * button — the same decay-protection rule as reads and clicks.
 */
export function mergeButtons(
  a: ButtonClickStat[] | null,
  b: ButtonClickStat[] | null
): ButtonClickStat[] | null {
  if (!a) return b;
  if (!b) return a;
  const byKey = new Map<string, ButtonClickStat>();
  for (const stat of [...a, ...b]) {
    const key = `${stat.type}::${stat.label}`;
    const prior = byKey.get(key);
    byKey.set(
      key,
      prior
        ? {
            label: stat.label,
            type: stat.type,
            clicks: Math.max(prior.clicks, stat.clicks),
            uniqueClicks: Math.max(prior.uniqueClicks, stat.uniqueClicks),
          }
        : stat
    );
  }
  return [...byKey.values()];
}

/** Roll a series' per-day button stats up into one ranked breakdown. */
export function buttonsFromSeries(
  rows: DailyTemplateMetrics[]
): ButtonClickStat[] {
  const byKey = new Map<string, ButtonClickStat>();
  for (const row of rows) {
    for (const stat of row.buttons ?? []) {
      const key = `${stat.type}::${stat.label}`;
      const prior = byKey.get(key);
      byKey.set(
        key,
        prior
          ? {
              label: stat.label,
              type: stat.type,
              // Across DIFFERENT days these are additive, unlike the
              // same-day merge above which de-duplicates one observation.
              clicks: prior.clicks + stat.clicks,
              uniqueClicks: prior.uniqueClicks + stat.uniqueClicks,
            }
          : { ...stat }
      );
    }
  }
  return [...byKey.values()].sort(
    (x, y) => y.clicks - x.clicks || x.label.localeCompare(y.label)
  );
}

/** Max of two optional numbers, where null means "never reported". */
function higher(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Take the newer observation, falling back to the stored one.
 *
 * For prices this is the only merge that can track Meta. `null` means
 * "not reported in this response" — common, since the read path merges an
 * all-null skeleton against storage — so it must never erase a rate we
 * already hold.
 */
function fresher(live: number | null, stored: number | null): number | null {
  return live ?? stored;
}

/** True when a day carries nothing worth storing. */
export function isEmptyDay(row: DailyTemplateMetrics): boolean {
  return (
    row.sent === 0 &&
    row.delivered === 0 &&
    row.read === 0 &&
    row.clicked === 0 &&
    row.uniqueClicked === 0 &&
    (row.amountSpent === null || row.amountSpent === 0) &&
    row.costPerDelivered === null &&
    row.costPerUrlClick === null &&
    !(row.buttons ?? []).some((b) => b.clicks > 0 || b.uniqueClicks > 0)
  );
}

/**
 * Merge a live series with stored snapshots, keyed by date.
 *
 * The live series defines the window (it is already gap-filled for every
 * day in range), so stored days outside it are ignored — the caller asked
 * about a specific period and must not be handed extra days.
 */
export function mergeSeries(
  live: DailyTemplateMetrics[],
  stored: DailyTemplateMetrics[]
): DailyTemplateMetrics[] {
  const storedByDate = new Map(stored.map((row) => [row.date, row]));
  return live.map((row) => {
    const match = storedByDate.get(row.date);
    return match ? mergeDailyRow(row, match) : row;
  });
}

/**
 * Meta's click type for a website (URL) button.
 *
 * Quick-reply taps arrive under a different type and must never count
 * toward a per-URL-click rate — mixing them is what made "cost per link
 * click" report a figure nobody could reconcile.
 */
export const URL_BUTTON_CLICK_TYPE = 'url_button';

/** Total website-button taps across a series, quick replies excluded. */
export function urlClicksFromSeries(rows: DailyTemplateMetrics[]): number {
  let total = 0;
  for (const row of rows) {
    for (const stat of row.buttons ?? []) {
      if (stat.type === URL_BUTTON_CLICK_TYPE) total += stat.clicks;
    }
  }
  return total;
}

/** Recompute totals from a merged series so they cannot disagree with it. */
export function totalsFromSeries(rows: DailyTemplateMetrics[]): {
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  uniqueClicked: number;
  /** Website-button taps only. */
  urlClicks: number;
  amountSpent: number | null;
  /**
   * Cost per message delivered, by Meta's own formula: amount spent ÷
   * messages delivered.
   *
   * Matches WhatsApp Manager on every template checked where Manager's
   * aggregation is intact — ₹4.32 / 5 = ₹0.86, ₹0.69 / 25 = ₹0.03.
   *
   * Dividing real spend by real deliveries is also what makes free sends
   * come out right without special-casing them. Meta bills some messages
   * at nothing — service replies inside the 24-hour customer service
   * window come back as `FREE_CUSTOMER_SERVICE` with cost 0 in
   * `pricing_analytics` — and those pull this average down on their own.
   * A flat per-message rate could not express that.
   *
   * Falls back to Meta's per-day rate when Meta withholds spend.
   */
  costPerDelivered: number | null;
  /**
   * Meta's own per-day `cost_per_delivered`, weighted by each day's
   * deliveries. Kept for display next to the window figure.
   */
  metaCostPerDelivered: number | null;
  /**
   * Cost per website button click for the window, by Meta's own published
   * definition: amount spent ÷ number of button clicks.
   *
   * Both inputs are Meta's, unmodified — the spend is the sum of the
   * per-day `amount_spent` values Meta reported, and the taps are the
   * per-day `url_button` counts. Verified against WhatsApp Manager on a
   * template where Manager's own aggregation is intact: Meta reported
   * 2.59 on one day and 1.73 on another, and Manager's "Amount spent"
   * card read 4.32.
   *
   * Because the spend comes straight from Meta, a re-price needs no
   * change here: the next refresh lowers the spend and the rate follows.
   *
   * Falls back to `metaCostPerUrlClick` when Meta withholds spend, which
   * it does for WABAs billed through a partner's credit line.
   */
  costPerUrlClick: number | null;
  /**
   * Meta's own per-day `cost_per_url_button_click`, tap-weighted.
   *
   * Kept for display next to the window figure rather than as the
   * headline. Meta only publishes this per day, and a per-day rate cannot
   * see spend on any OTHER day, so on a window where one day earned the
   * taps and another day spent money without earning any, it is lower
   * than the window rate. Both are correct answers to different
   * questions, and showing them together is what makes the difference
   * legible instead of looking like a bug.
   */
  metaCostPerUrlClick: number | null;
} {
  let amountSpent: number | null = null;
  // Rates are weighted by the volume each day's rate applied to, which is
  // how a per-unit price aggregates. A plain mean would let a single
  // one-message day count as much as a thousand-message one.
  let rateDeliveredWeighted = 0;
  let rateDeliveredWeight = 0;
  let rateClickWeighted = 0;
  let rateClickWeight = 0;

  const urlClicks = urlClicksFromSeries(rows);

  const totals = rows.reduce(
    (acc, row) => {
      if (row.amountSpent !== null) {
        amountSpent = (amountSpent ?? 0) + row.amountSpent;
      }
      if (row.costPerDelivered !== null && row.delivered > 0) {
        rateDeliveredWeighted += row.costPerDelivered * row.delivered;
        rateDeliveredWeight += row.delivered;
      }
      // Weighted by that day's URL clicks, NOT row.clicked. `clicked`
      // counts every button tap including quick replies, so weighting a
      // URL-click rate by it is meaningless.
      const rowUrlClicks = (row.buttons ?? []).reduce(
        (sum, stat) =>
          stat.type === URL_BUTTON_CLICK_TYPE ? sum + stat.clicks : sum,
        0
      );
      if (row.costPerUrlClick !== null && rowUrlClicks > 0) {
        rateClickWeighted += row.costPerUrlClick * rowUrlClicks;
        rateClickWeight += rowUrlClicks;
      }
      return {
        sent: acc.sent + row.sent,
        delivered: acc.delivered + row.delivered,
        read: acc.read + row.read,
        clicked: acc.clicked + row.clicked,
        uniqueClicked: acc.uniqueClicked + row.uniqueClicked,
      };
    },
    { sent: 0, delivered: 0, read: 0, clicked: 0, uniqueClicked: 0 }
  );

  return {
    ...totals,
    urlClicks,
    amountSpent,
    // Meta's formula, over the window: amount spent ÷ delivered. Using
    // the same numerator as the two figures around it is what lets an
    // operator reconcile all three cards against each other and against
    // the daily table, which a mix of summed spend and averaged per-day
    // rates never allowed.
    costPerDelivered:
      amountSpent !== null && totals.delivered > 0
        ? amountSpent / totals.delivered
        : rateDeliveredWeight > 0
          ? rateDeliveredWeighted / rateDeliveredWeight
          : null,
    metaCostPerDelivered:
      rateDeliveredWeight > 0
        ? rateDeliveredWeighted / rateDeliveredWeight
        : null,
    // ─── Meta's definition, applied to Meta's data ──────────────────
    //
    // "Cost per website button click is calculated as the amount spent
    // divided by the number of button clicks" — Meta's own tooltip in
    // WhatsApp Manager. So that is the arithmetic, over the window the
    // operator selected, on numbers Meta supplied.
    //
    // Meta publishes no window aggregate of its own: `template_analytics`
    // rejects every granularity except DAILY (error 100, confirmed
    // against the live Graph API), so a window figure has to be built
    // from the daily rows no matter who builds it.
    //
    // Note for anyone reconciling against WhatsApp Manager: Manager's own
    // cost cards drop any day that reported a `cost_per_url_button_click`.
    // On a template where every day lacks that metric its total matches
    // this one exactly; on a template with a link tap it silently omits
    // precisely the days the taps happened on, and every one of its three
    // cost cards comes out low. The daily rows below are Meta's, so the
    // sum can be checked by hand.
    costPerUrlClick:
      amountSpent !== null && urlClicks > 0
        ? amountSpent / urlClicks
        : // Credit-line WABAs get no spend from Meta. Meta's per-day rate
          // is then the only cost signal there is, so it stands in.
          rateClickWeight > 0
          ? rateClickWeighted / rateClickWeight
          : null,
    // Meta's per-day figure, weighted by each day's link taps — NOT by
    // `row.clicked`, which counts quick replies too and would tilt the
    // blend toward whichever day happened to collect the most of them.
    metaCostPerUrlClick:
      rateClickWeight > 0 ? rateClickWeighted / rateClickWeight : null,
  };
}

// ── Database access ─────────────────────────────────────────

interface DbRow {
  template_id: string;
  day: string;
  sent: number | null;
  delivered: number | null;
  read: number | null;
  clicked: number | null;
  unique_clicked: number | null;
  amount_spent: string | number | null;
  cost_per_delivered?: string | number | null;
  cost_per_url_click?: string | number | null;
  buttons?: unknown;
  currency: string | null;
  refreshed_at?: string | null;
}

/** NUMERIC arrives as a string from PostgREST; null must stay null. */
function toOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDaily(row: DbRow): DailyTemplateMetrics {
  return {
    date: row.day,
    sent: row.sent ?? 0,
    delivered: row.delivered ?? 0,
    read: row.read ?? 0,
    clicked: row.clicked ?? 0,
    uniqueClicked: row.unique_clicked ?? 0,
    amountSpent: toOptionalNumber(row.amount_spent),
    costPerDelivered: toOptionalNumber(row.cost_per_delivered),
    costPerUrlClick: toOptionalNumber(row.cost_per_url_click),
    buttons: Array.isArray(row.buttons)
      ? (row.buttons as ButtonClickStat[])
      : null,
  };
}

/** Columns every snapshot read needs, kept in one place. */
const SNAPSHOT_COLUMNS =
  'template_id, day, sent, delivered, read, clicked, unique_clicked, amount_spent, cost_per_delivered, cost_per_url_click, buttons, currency, refreshed_at';

/**
 * The earliest day we have ever stored for these templates.
 *
 * This is what makes an "All time" range possible at all: Meta cannot
 * answer beyond 90 days, so the true start of history is whatever our
 * own snapshots reach back to. Null when nothing is stored yet, in which
 * case all-time falls back to Meta's own maximum lookback.
 */
export async function readEarliestStoredDay(args: {
  accountId: string;
  templateIds: string[];
}): Promise<string | null> {
  if (args.templateIds.length === 0) return null;
  try {
    const { data, error } = await supabaseAdmin()
      .from('template_analytics_daily')
      .select('day')
      .eq('account_id', args.accountId)
      .in('template_id', args.templateIds)
      .order('day', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.day === 'string' ? data.day : null;
  } catch (err) {
    console.error('[template analytics] earliest-day lookup failed:', err);
    return null;
  }
}

/**
 * Read stored snapshots for one or more templates over a date range.
 *
 * Returns a map keyed by OUR template id. Best-effort: a failure here
 * degrades to live-only figures rather than failing the request, because
 * a cache miss must never take the screen down.
 */
export async function readStoredDaily(args: {
  accountId: string;
  templateIds: string[];
  startDate: string;
  endDate: string;
}): Promise<Map<string, DailyTemplateMetrics[]>> {
  const out = new Map<string, DailyTemplateMetrics[]>();
  if (args.templateIds.length === 0) return out;

  try {
    const { data, error } = await supabaseAdmin()
      .from('template_analytics_daily')
      .select(SNAPSHOT_COLUMNS)
      .eq('account_id', args.accountId)
      .in('template_id', args.templateIds)
      .gte('day', args.startDate)
      .lte('day', args.endDate);

    if (error || !data) return out;

    for (const raw of data as DbRow[]) {
      const list = out.get(raw.template_id) ?? [];
      list.push(toDaily(raw));
      out.set(raw.template_id, list);
    }
  } catch (err) {
    console.error('[template analytics] reading snapshots failed:', err);
  }
  return out;
}

/**
 * Everything stored for an account, aggregated per template, with no
 * Meta call at all.
 *
 * This is what makes the templates list instant. It used to fetch live on
 * every page load, and because Meta paginates at 25 data points per page,
 * 8 templates over 90 days meant ~30 sequential Graph requests before the
 * Spend column could render — about two minutes.
 *
 * `startDate`/`endDate` are optional: omitted means all time, which is
 * what the list shows.
 */
export async function readStoredSummary(args: {
  accountId: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  byTemplate: Map<
    string,
    {
      sent: number;
      delivered: number;
      spent: number | null;
      currency: string | null;
    }
  >;
  /** Most recent successful Meta refresh across the account. */
  refreshedAt: string | null;
  earliestDay: string | null;
}> {
  const byTemplate = new Map<
    string,
    {
      sent: number;
      delivered: number;
      spent: number | null;
      currency: string | null;
    }
  >();
  let refreshedAt: string | null = null;
  let earliestDay: string | null = null;

  try {
    let query = supabaseAdmin()
      .from('template_analytics_daily')
      .select(SNAPSHOT_COLUMNS)
      .eq('account_id', args.accountId);
    if (args.startDate) query = query.gte('day', args.startDate);
    if (args.endDate) query = query.lte('day', args.endDate);

    const { data, error } = await query;
    if (error || !data) return { byTemplate, refreshedAt, earliestDay };

    for (const raw of data as DbRow[]) {
      const daily = toDaily(raw);
      const prior = byTemplate.get(raw.template_id) ?? {
        sent: 0,
        delivered: 0,
        spent: null as number | null,
        currency: null as string | null,
      };
      prior.sent += daily.sent;
      prior.delivered += daily.delivered;
      if (daily.amountSpent !== null) {
        prior.spent = (prior.spent ?? 0) + daily.amountSpent;
      }
      prior.currency = prior.currency ?? raw.currency ?? null;
      byTemplate.set(raw.template_id, prior);

      if (
        raw.refreshed_at &&
        (!refreshedAt || raw.refreshed_at > refreshedAt)
      ) {
        refreshedAt = raw.refreshed_at;
      }
      if (!earliestDay || raw.day < earliestDay) earliestDay = raw.day;
    }
  } catch (err) {
    console.error('[template analytics] summary read failed:', err);
  }

  return { byTemplate, refreshedAt, earliestDay };
}

/**
 * True when stored analytics are old enough to be worth re-fetching.
 *
 * Meta reports daily and can lag hours, so refreshing on every page view
 * buys nothing and costs ~30 Graph requests. Null (never refreshed)
 * always counts as stale.
 */
export function isStale(
  refreshedAt: string | null,
  maxAgeMinutes = 15
): boolean {
  if (!refreshedAt) return true;
  const at = new Date(refreshedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > maxAgeMinutes * 60_000;
}

/**
 * Persist the non-empty days of a live series.
 *
 * Upserts on (template_id, day), so this is safe to call on every view:
 * the same day observed twice updates one row instead of adding a second.
 * Empty days are skipped so the table does not fill with zero rows for
 * every template on every date in every window anyone ever opens.
 *
 * Values are merged against what is already stored BEFORE writing, so a
 * decayed read count cannot overwrite a healthy one. Best-effort by
 * contract: analytics must still render if the cache write fails.
 */
export async function persistDailySnapshots(args: {
  accountId: string;
  templateId: string;
  metaTemplateId: string;
  currency: string | null;
  series: DailyTemplateMetrics[];
}): Promise<void> {
  const candidates = args.series.filter((row) => !isEmptyDay(row));
  if (candidates.length === 0) return;

  try {
    const admin = supabaseAdmin();

    // Read the days we are about to touch so the write can keep the
    // higher of the two observations. Doing this per-call rather than in
    // SQL keeps the retention reasoning in one place, at the cost of one
    // extra round trip on a screen that already makes a Meta call.
    const { data: existing } = await admin
      .from('template_analytics_daily')
      .select(SNAPSHOT_COLUMNS)
      .eq('template_id', args.templateId)
      .in(
        'day',
        candidates.map((row) => row.date)
      );

    const storedByDate = new Map(
      ((existing ?? []) as DbRow[]).map((row) => [row.day, toDaily(row)])
    );

    const now = new Date().toISOString();
    const payload = candidates.map((row) => {
      const prior = storedByDate.get(row.date);
      const merged = prior ? mergeDailyRow(row, prior) : row;
      return {
        account_id: args.accountId,
        template_id: args.templateId,
        meta_template_id: args.metaTemplateId,
        day: merged.date,
        sent: merged.sent,
        delivered: merged.delivered,
        read: merged.read,
        clicked: merged.clicked,
        unique_clicked: merged.uniqueClicked,
        amount_spent: merged.amountSpent,
        cost_per_delivered: merged.costPerDelivered,
        cost_per_url_click: merged.costPerUrlClick,
        buttons: merged.buttons,
        currency: args.currency,
        last_seen_at: now,
        refreshed_at: now,
      };
    });

    const { error } = await admin
      .from('template_analytics_daily')
      .upsert(payload, { onConflict: 'template_id,day' });

    if (error) {
      console.error('[template analytics] snapshot upsert failed:', error);
    }
  } catch (err) {
    console.error('[template analytics] persisting snapshots failed:', err);
  }
}
