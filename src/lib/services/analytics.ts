// ============================================================
// Analytics read services (Phase 5).
//
// The dashboard numbers come from the SAME loaders the Dashboard page
// uses (src/lib/dashboard/queries.ts), passed the workspace timezone so
// "today" means the user's day and not the server's UTC day. Template
// performance reads the stored daily snapshots the Templates page shows
// (template_analytics_daily) — never Meta live.
// ============================================================

import {
  loadConversationsSeries,
  loadMetrics,
  loadResponseTime,
} from '@/lib/dashboard/queries';
import {
  DOW_SHORT_MON_FIRST,
  localDayKey,
  daysAgoStart,
  type DayOpts,
} from '@/lib/dashboard/date-utils';
import { ServiceError, type ServiceContext } from './context';

export const TREND_RANGES = [7, 30, 90] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

export interface DashboardSummary {
  date: string;
  timezone: string;
  active_conversations: {
    current: number;
    new_today_minus_new_yesterday: number;
  };
  new_contacts: { today: number; yesterday: number };
  open_deals: { count: number; value: number };
  messages_sent: { today: number; yesterday: number };
}

export async function getDashboardSummary(
  ctx: ServiceContext,
  opts: Required<Pick<DayOpts, 'timeZone'>> & DayOpts
): Promise<DashboardSummary> {
  try {
    const m = await loadMetrics(ctx.db, opts);
    return {
      date: localDayKey(opts.now ?? new Date(), opts.timeZone),
      timezone: opts.timeZone,
      active_conversations: {
        current: m.activeConversations.current,
        new_today_minus_new_yesterday: m.activeConversations.previous,
      },
      new_contacts: {
        today: m.newContactsToday.current,
        yesterday: m.newContactsToday.previous,
      },
      open_deals: { count: m.openDealsCount, value: m.openDealsValue },
      messages_sent: {
        today: m.messagesSentToday.current,
        yesterday: m.messagesSentToday.previous,
      },
    };
  } catch {
    throw new ServiceError('internal', 'Could not load the dashboard numbers');
  }
}

export async function getConversationTrend(
  ctx: ServiceContext,
  days: TrendRange,
  opts: Required<Pick<DayOpts, 'timeZone'>> & DayOpts
) {
  if (!TREND_RANGES.includes(days))
    throw new ServiceError('invalid_input', 'days must be 7, 30 or 90');
  try {
    const series = await loadConversationsSeries(ctx.db, days, opts);
    return {
      timezone: opts.timeZone,
      days: series.map((p) => ({
        date: p.day,
        inbound: p.incoming,
        outbound: p.outgoing,
      })),
      totals: series.reduce(
        (t, p) => ({
          inbound: t.inbound + p.incoming,
          outbound: t.outbound + p.outgoing,
        }),
        { inbound: 0, outbound: 0 }
      ),
    };
  } catch {
    throw new ServiceError('internal', 'Could not load the conversation trend');
  }
}

export async function getResponseTimes(
  ctx: ServiceContext,
  opts: Required<Pick<DayOpts, 'timeZone'>> & DayOpts
) {
  try {
    const r = await loadResponseTime(ctx.db, opts);
    const round = (v: number | null) =>
      v === null ? null : Math.round(v * 10) / 10;
    return {
      timezone: opts.timeZone,
      window_days: 14,
      by_weekday: r.buckets.map((b) => ({
        weekday: DOW_SHORT_MON_FIRST[b.dow],
        avg_minutes: round(b.avgMinutes),
        samples: b.samples,
      })),
      this_week_avg_minutes: round(r.thisWeekAvg),
      last_week_avg_minutes: round(r.lastWeekAvg),
    };
  } catch {
    throw new ServiceError('internal', 'Could not load response times');
  }
}

export interface TemplatePerformanceRow {
  template_id: string;
  name: string;
  language: string | null;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  replied: number;
  spent: { amount: number; currency: string } | null;
}

type DailyRow = {
  template_id: string;
  sent: number | null;
  delivered: number | null;
  read: number | null;
  clicked: number | null;
  replied: number | null;
  amount_spent: number | string | null;
  currency: string | null;
};

/** Sum daily snapshot rows per template. Pure. */
export function sumTemplateDays(rows: DailyRow[]) {
  const by = new Map<
    string,
    Omit<TemplatePerformanceRow, 'name' | 'language' | 'template_id'> & {
      spentRaw: number | null;
      currency: string | null;
    }
  >();
  for (const r of rows) {
    const t = by.get(r.template_id) ?? {
      sent: 0,
      delivered: 0,
      read: 0,
      clicked: 0,
      replied: 0,
      spent: null,
      spentRaw: null,
      currency: null,
    };
    t.sent += r.sent ?? 0;
    t.delivered += r.delivered ?? 0;
    t.read += r.read ?? 0;
    t.clicked += r.clicked ?? 0;
    t.replied += r.replied ?? 0;
    if (r.amount_spent !== null && r.amount_spent !== undefined) {
      t.spentRaw = (t.spentRaw ?? 0) + Number(r.amount_spent);
      t.currency = t.currency ?? r.currency;
    }
    by.set(r.template_id, t);
  }
  return by;
}

export async function getTemplatePerformance(
  ctx: ServiceContext,
  days: TrendRange,
  opts: Required<Pick<DayOpts, 'timeZone'>> & DayOpts
): Promise<{
  timezone: string;
  from: string;
  to: string;
  templates: TemplatePerformanceRow[];
  note: string;
}> {
  if (!TREND_RANGES.includes(days))
    throw new ServiceError('invalid_input', 'days must be 7, 30 or 90');
  const from = localDayKey(daysAgoStart(days - 1, opts), opts.timeZone);
  const to = localDayKey(opts.now ?? new Date(), opts.timeZone);
  const [daily, templates] = await Promise.all([
    ctx.db
      .from('template_analytics_daily')
      .select(
        'template_id, sent, delivered, read, clicked, replied, amount_spent, currency'
      )
      .eq('account_id', ctx.accountId)
      .gte('day', from)
      .lte('day', to)
      .limit(20000),
    ctx.db
      .from('message_templates')
      .select('id, name, language')
      .eq('account_id', ctx.accountId)
      .limit(500),
  ]);
  if (daily.error || templates.error)
    throw new ServiceError('internal', 'Could not load template performance');
  const names = new Map(
    (
      (templates.data ?? []) as {
        id: string;
        name: string;
        language: string | null;
      }[]
    ).map((t) => [t.id, t])
  );
  const sums = sumTemplateDays((daily.data ?? []) as DailyRow[]);
  const rows: TemplatePerformanceRow[] = [...sums.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, s]) => ({
      template_id: id,
      name: names.get(id)!.name,
      language: names.get(id)!.language,
      sent: s.sent,
      delivered: s.delivered,
      read: s.read,
      clicked: s.clicked,
      replied: s.replied,
      spent:
        s.spentRaw === null
          ? null
          : {
              amount: Math.round(s.spentRaw * 100) / 100,
              currency: s.currency ?? '',
            },
    }))
    .sort((a, b) => b.sent - a.sent);
  return {
    timezone: opts.timeZone,
    from,
    to,
    templates: rows,
    note: 'From the daily figures Meta reports, as shown on the Templates page. The latest day can lag by a few hours.',
  };
}
