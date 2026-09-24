'use client';

// ============================================================
// WhatsApp account insights — the in-CRM replacement for Meta's
// WhatsApp Manager → Insights screen.
//
// Backed by GET /api/whatsapp/insights, which reads four separate
// analytics fields off the WABA node plus a template leaderboard.
//
// ─── Why this exists rather than a link ───────────────────────────
//
// The setup panel used to send people to business.facebook.com. That
// works, but it drops the operator into a different product with a
// different account switcher, and everything they were looking at in the
// CRM is gone. Meta publishes all of it over the API, so it can live
// here — beside the templates and broadcasts the numbers are about. The
// link out is kept as a deliberate escape hatch, not the default.
//
// ─── Three honesty rules this page follows ────────────────────────
//
// 1. Every section renders its own failure. Meta withholds cost from
//    partner-billed accounts, calling analytics need calling enabled,
//    and template analytics need insights confirmed — so a missing
//    section is normal and gets explained where it sits, rather than
//    replacing the page with one error.
//
// 2. Cost is "—" when Meta did not report it, never 0. Showing free for
//    withheld is a lie about money.
//
// 3. The window shown is the window the SERVER resolved, not the button
//    that was pressed. Meta caps the lookback at a year and silently
//    returns less.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCheck,
  CircleAlert,
  ExternalLink,
  Eye,
  Gauge,
  Globe2,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  MousePointerClick,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Skeleton } from '@/components/dashboard/skeleton';
import { BarChart } from '@/components/tremor/bar-chart';
import { readApiResponse } from '@/lib/http/read-api-response';
import { formatCompactNumber } from '@/lib/currency';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type {
  BreakdownRow,
  CallSummary,
  ConversationSummary,
  MessagingSummary,
  PricingSummary,
} from '@/lib/whatsapp/account-insights';

// ── Response contract (mirrors the route) ───────────────────

type Section<T> =
  { ok: true; data: T } | { ok: false; error: string; code?: string };

interface TemplateLeaderboardRow {
  id: string;
  name: string;
  category: string;
  language: string | null;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
}

interface InsightsResponse {
  window: {
    start: string;
    end: string;
    days: number;
    clamped: boolean;
    monthly: boolean;
  };
  waba: {
    id: string;
    name: string | null;
    currency: string | null;
    timezone_id: string | null;
    review_status: string | null;
  };
  sections: {
    messaging: Section<MessagingSummary>;
    conversations: Section<ConversationSummary>;
    pricing: Section<PricingSummary>;
    calls: Section<CallSummary>;
    templates: Section<{
      window: { start: string; end: string; days: number };
      rows: TemplateLeaderboardRow[];
    }>;
  };
  notices: {
    max_lookback_days: number;
    template_max_lookback_days: number;
    approximate: boolean;
  };
}

const PRESETS = [7, 30, 90, 365] as const;

// ── Formatting ──────────────────────────────────────────────

function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Money in the WABA's own currency, formatted the way Meta formats it.
 *
 * Two decimals, matching WhatsApp Manager exactly — Meta shows
 * "₹ 2.59 INR" for the same figure this used to render as "₹2.5893".
 * Both are the same number, but the extra digits read as invented
 * precision and made a correct total look fabricated.
 *
 * The one exception is a real charge small enough to round to zero at two
 * decimals: there we widen rather than print a non-zero cost as free.
 */
function money(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const code = (currency ?? '').trim();
  const magnitude = Math.abs(value);
  const digits = magnitude > 0 && magnitude < 0.005 ? 4 : 2;
  try {
    if (!code) throw new Error('no currency');
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(value);
    return code ? `${code} ${formatted}` : formatted;
  }
}

/** `AUTHENTICATION_INTERNATIONAL` → `Authentication international`. */
function humanise(value: string): string {
  const clean = value.replace(/_/g, ' ').trim().toLowerCase();
  if (!clean) return 'Unknown';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Bucket keys are YYYY-MM-DD or YYYY-MM depending on granularity. */
function formatBucket(bucket: string): string {
  const parts = bucket.split('-').map(Number);
  if (parts.length === 3) {
    return new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2])
    ).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  }
  if (parts.length === 2) {
    return new Date(Date.UTC(parts[0], parts[1] - 1, 1)).toLocaleDateString(
      undefined,
      { month: 'short', year: '2-digit', timeZone: 'UTC' }
    );
  }
  return bucket;
}

function formatRange(start: string, end: string): string {
  return start === end
    ? formatBucket(start)
    : `${formatBucket(start)} – ${formatBucket(end)}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ── Building blocks ─────────────────────────────────────────

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  slate: 'bg-muted text-muted-foreground',
} as const;

function KpiCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'emerald',
}: {
  label: string;
  value: string;
  caption?: string;
  icon: typeof Send;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="border-border bg-card relative overflow-hidden rounded-xl border p-4 transition-shadow hover:shadow-sm">
      <div className="from-primary/5 absolute -top-6 -right-6 size-20 rounded-full bg-gradient-to-br to-transparent blur-xl" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </p>
        <div className={cn('rounded-lg p-2', TONES[tone])}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-foreground relative mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
      {caption ? (
        <p className="text-muted-foreground relative mt-0.5 text-xs">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  aside,
}: {
  title: string;
  description?: string;
  icon: typeof Send;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card overflow-hidden rounded-xl border">
      <header className="border-border flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="text-primary size-4" />
            {title}
          </h2>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {description}
            </p>
          ) : null}
        </div>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * What a section shows when Meta declined to answer for it.
 *
 * Report-only, on purpose. Every remaining case here is something the
 * operator cannot act on from the CRM — cost withheld on partner
 * billing, calling not registered — so there is nothing to offer but
 * Meta's reason. The one refusal that IS actionable has its own block
 * with the switch in it; see `TemplateInsightsDisabled`.
 */
function SectionUnavailable({ error }: { error: string }) {
  return (
    <div className="border-border bg-muted/30 flex items-start gap-2 rounded-lg border border-dashed px-3 py-3">
      <CircleAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-foreground text-xs font-medium">Not available</p>
        <p className="text-muted-foreground text-xs">{error}</p>
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-xs">{children}</p>
  );
}

/**
 * Template insights are off — the one unavailable section with a fix.
 *
 * Gets its own block rather than reusing `SectionUnavailable` because
 * this is the only refusal on the page the operator can do anything
 * about, and the previous treatment sent them somewhere else to do it
 * ("open any template's Insights on the Templates page"). That is a
 * pointless errand: the switch is account-wide, so the page already
 * showing the consequence is the right place to press it.
 *
 * The switch is irreversible and widens what Meta may collect, so the
 * consequences sit next to the button and the guide is one click away
 * rather than the button standing alone.
 */
/**
 * Coexistence numbers: Meta refuses template analytics outright.
 *
 * No Enable button, and no link to the guide about switching it on. Meta
 * answers the enable call with "(#10) This operation can not be performed on
 * SMB business type" every time, so a button here would only teach the
 * operator to keep retrying a permanent product limit — which is exactly what
 * happened before this existed.
 *
 * Neutral styling rather than a warning: nothing has gone wrong and there is
 * no action to take. The message names the two places these numbers ARE
 * available, because "not supported" alone reads as a dead end when the data
 * genuinely exists elsewhere.
 */
function TemplateInsightsUnsupported({ error }: { error: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-lg border p-4">
      <div className="flex items-start gap-2.5">
        <span className="bg-muted text-muted-foreground mt-0.5 rounded-md p-1.5">
          <Info className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            Not available for WhatsApp Business app numbers
          </p>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-xs">
            {error}
          </p>
        </div>
      </div>
    </div>
  );
}

function TemplateInsightsDisabled({
  error,
  isOwner,
  enabling,
  onEnable,
}: {
  error: string;
  isOwner: boolean;
  enabling: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="border-primary/25 bg-primary-soft/40 rounded-lg border border-dashed p-4">
      <div className="flex items-start gap-2.5">
        <span className="bg-primary/10 text-primary mt-0.5 rounded-md p-1.5">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            Template insights aren&apos;t switched on for this account
          </p>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-xs">
            Meta records no read or click data until this is confirmed, so this
            section stays empty whichever period you pick. It is a per-account
            setting, which is why another WhatsApp Business account can be
            showing these numbers already.
          </p>

          <ul className="text-muted-foreground mt-2.5 space-y-1.5 text-[11.5px]">
            <li className="flex gap-1.5">
              <Lock className="mt-0.5 size-3 shrink-0" />
              <span>
                Permanent — Meta has no way to switch it back off, and it also
                enables link tracking and anonymised chat analysis.
              </span>
            </li>
            <li className="flex gap-1.5">
              <CalendarRange className="mt-0.5 size-3 shrink-0" />
              <span>
                Not backfilled — collection starts now, so expect this to stay
                empty until your next template send.
              </span>
            </li>
          </ul>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {isOwner ? (
              <Button size="sm" onClick={onEnable} disabled={enabling}>
                {enabling ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Enabling…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Enable template insights
                  </>
                )}
              </Button>
            ) : null}
            <Link
              href="/settings/whatsapp-insights/guide"
              className="border-border text-foreground hover:bg-muted inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors"
            >
              <BookOpen className="size-3.5" />
              Read the guide
            </Link>
          </div>

          {!isOwner ? (
            <p className="text-muted-foreground mt-2.5 text-[11px]">
              Only the workspace owner can turn this on, because Meta makes it
              permanent for the whole business.
            </p>
          ) : null}

          <p className="text-muted-foreground/80 mt-2.5 text-[11px] italic">
            Meta said: {error}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A ranked breakdown with proportional bars.
 *
 * Bars are scaled against the LARGEST row rather than the total, so a
 * long tail of small categories stays visible instead of collapsing into
 * invisible slivers.
 */
function BreakdownList({
  rows,
  currency,
  showCost = true,
  emptyLabel,
  tone = 'emerald',
}: {
  rows: BreakdownRow[];
  currency: string | null;
  showCost?: boolean;
  emptyLabel: string;
  tone?: 'emerald' | 'blue' | 'violet' | 'amber';
}) {
  const max = Math.max(...rows.map((r) => r.volume), 0);
  const total = rows.reduce((sum, r) => sum + r.volume, 0);
  const barTone = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    amber: 'bg-amber-500',
  }[tone];

  if (rows.length === 0) return <EmptyHint>{emptyLabel}</EmptyHint>;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-foreground min-w-0 truncate text-xs font-medium">
              {humanise(row.key)}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
              <span className="text-foreground font-semibold">
                {row.volume.toLocaleString()}
              </span>
              {total > 0 ? (
                <span className="text-muted-foreground text-[11px]">
                  {percent(row.volume / total, 0)}
                </span>
              ) : null}
              {showCost ? (
                <span className="text-muted-foreground w-20 text-right text-[11px]">
                  {money(row.cost, currency)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', barTone)}
              style={{ width: max > 0 ? `${(row.volume / max) * 100}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Page ────────────────────────────────────────────────────

export function WhatsAppInsights() {
  const [days, setDays] = useState<number>(30);
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    hint: string | null;
    code?: string;
  } | null>(null);
  const loadedRef = useRef<string | null>(null);

  // Enabling insights is owner-only on the server too — this only decides
  // whether to show the button or explain who can press it.
  const { isOwner } = useAuth();
  const [enabling, setEnabling] = useState(false);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minIso = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 364);
    return d.toISOString().slice(0, 10);
  }, []);

  const query = useMemo(
    () =>
      applied ? `start=${applied.start}&end=${applied.end}` : `days=${days}`,
    [applied, days]
  );

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/insights?${search}`, {
        cache: 'no-store',
      });
      const result = await readApiResponse<
        InsightsResponse & { code?: string }
      >(res, 'loaded');
      if (!result.ok) {
        setData(null);
        setFailure({
          message: result.error ?? 'Could not load insights.',
          hint: result.hint,
          code: result.data?.code,
        });
        return;
      }
      setFailure(null);
      setData(result.data);
    } catch {
      setData(null);
      setFailure({
        message: 'Could not reach the server to load insights.',
        hint: 'Check your connection and try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current === query) return;
    loadedRef.current = query;
    void load(query);
  }, [query, load]);

  const refresh = () => {
    loadedRef.current = null;
    void load(query);
  };

  /**
   * Confirm template analytics for the WABA, then reload.
   *
   * Same owner-only endpoint the templates dialog uses — this is a second
   * entry point to one account-wide switch, not a second switch. Reloading
   * afterwards is what replaces this block with the (initially empty)
   * leaderboard, so the operator sees the state actually changed.
   */
  const enableInsights = async () => {
    setEnabling(true);
    try {
      const res = await fetch('/api/whatsapp/templates/insights', {
        method: 'POST',
      });
      const result = await readApiResponse<{ note?: string }>(res, 'enabled');
      if (!result.ok) {
        toast.error(result.error ?? 'Could not enable insights.');
        return;
      }
      toast.success(result.data?.note ?? 'Template insights enabled.');
      refresh();
    } catch {
      toast.error('Could not enable insights.');
    } finally {
      setEnabling(false);
    }
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) {
      toast.error('Pick both a start and an end date.');
      return;
    }
    if (customEnd < customStart) {
      toast.error('The end date cannot be before the start date.');
      return;
    }
    setApplied({ start: customStart, end: customEnd });
  };

  const currency = data?.waba.currency ?? null;
  const messaging = data?.sections.messaging;
  const pricing = data?.sections.pricing;
  const conversations = data?.sections.conversations;
  const calls = data?.sections.calls;
  const templateSection = data?.sections.templates;

  /**
   * The template section refused for the one reason that has a button.
   * Narrowed to a value rather than tested inline, because `Section<T>`
   * is a union and `code` only exists on the failure arm.
   */
  const templatesDisabled =
    templateSection && !templateSection.ok
      ? templateSection.code === 'insights_disabled'
        ? templateSection
        : null
      : null;

  /**
   * Coexistence: Meta will not serve template analytics for this connection
   * type at all. Kept separate from `templatesDisabled` because that one
   * renders an Enable button, and here there is nothing to enable.
   */
  const templatesUnsupported =
    templateSection && !templateSection.ok
      ? templateSection.code === 'insights_unsupported_smb'
        ? templateSection
        : null
      : null;

  /**
   * Insights ARE on; Meta simply has nothing yet. Kept apart from
   * `templatesDisabled` because that one renders a button to press, and
   * offering it here is what made the switch reappear after being thrown.
   */
  const templatesNoDataYet =
    templateSection && !templateSection.ok
      ? templateSection.code === 'insights_no_data_yet'
        ? templateSection
        : null
      : null;

  const metaUrl = data
    ? `https://business.facebook.com/latest/whatsapp_manager/insights?business_id=${encodeURIComponent(data.waba.id)}&asset_id=${encodeURIComponent(data.waba.id)}`
    : 'https://business.facebook.com/latest/whatsapp_manager/insights';

  // Aggregate engagement across the templates in the leaderboard. This is
  // the "read rate / click rate" headline Meta shows, which is a
  // template-level metric — plain messaging analytics carries no reads.
  const templateTotals = useMemo(() => {
    const rows = templateSection?.ok
      ? templateSection.data.rows
      : ([] as TemplateLeaderboardRow[]);
    return rows.reduce(
      (acc, row) => ({
        sent: acc.sent + row.sent,
        delivered: acc.delivered + row.delivered,
        read: acc.read + row.read,
        clicked: acc.clicked + row.clicked,
      }),
      { sent: 0, delivered: 0, read: 0, clicked: 0 }
    );
  }, [templateSection]);

  const messagingChart = useMemo(
    () =>
      messaging?.ok
        ? messaging.data.series.map((point) => ({
            bucket: formatBucket(point.bucket),
            Sent: point.sent,
            Delivered: point.delivered,
          }))
        : [],
    [messaging]
  );

  const spendChart = useMemo(
    () =>
      pricing?.ok
        ? pricing.data.series.map((point) => ({
            bucket: formatBucket(point.bucket),
            Messages: point.volume,
          }))
        : [],
    [pricing]
  );

  /**
   * The headline row, built from what Meta actually reported.
   *
   * Cards are omitted rather than rendered with an em dash. A tile
   * reading "—" looks like a broken integration, and on an account where
   * Meta withholds cost, or where nothing has been sent through a
   * template yet, that absence is permanent and normal — so the slot is
   * given to a figure that does exist instead.
   */
  const headlineKpis = useMemo(() => {
    if (!data) return [];
    const cards: {
      label: string;
      value: string;
      caption?: string;
      icon: typeof Send;
      tone: 'emerald' | 'blue' | 'violet' | 'amber';
    }[] = [];

    if (messaging?.ok && messaging.data.hasData) {
      cards.push({
        label: 'Messages sent',
        value: formatCompactNumber(messaging.data.sent),
        caption: `${messaging.data.delivered.toLocaleString()} delivered`,
        icon: Send,
        tone: 'emerald',
      });
    }
    if (messaging?.ok && messaging.data.deliveryRate !== null) {
      cards.push({
        label: 'Delivery rate',
        value: percent(messaging.data.deliveryRate),
        caption: 'Delivered / sent',
        icon: CheckCheck,
        tone: 'blue',
      });
    }
    if (
      pricing?.ok &&
      pricing.data.costReported &&
      pricing.data.cost !== null
    ) {
      cards.push({
        label: 'Approx. spend',
        value: money(pricing.data.cost, currency),
        caption: `${pricing.data.paidVolume.toLocaleString()} billable of ${pricing.data.volume.toLocaleString()} delivered`,
        icon: Wallet,
        tone: 'amber',
      });
    } else if (pricing?.ok && pricing.data.hasData) {
      // Cost withheld (partner credit line). Volume is still exact.
      cards.push({
        label: 'Billable messages',
        value: formatCompactNumber(pricing.data.paidVolume),
        caption: `of ${pricing.data.volume.toLocaleString()} delivered`,
        icon: Wallet,
        tone: 'amber',
      });
    }
    if (templateTotals.delivered > 0) {
      cards.push({
        label: 'Read rate',
        value: percent(templateTotals.read / templateTotals.delivered),
        caption: 'Template messages read',
        icon: Eye,
        tone: 'violet',
      });
    } else if (pricing?.ok && pricing.data.hasData) {
      cards.push({
        label: 'Free messages',
        value: formatCompactNumber(pricing.data.freeVolume),
        caption: 'Not charged by Meta',
        icon: Sparkles,
        tone: 'violet',
      });
    }
    return cards;
  }, [data, messaging, pricing, templateTotals, currency]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-3">
        <Link
          href="/settings?tab=whatsapp"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to WhatsApp settings
        </Link>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="bg-primary/10 text-primary rounded-lg p-1.5">
                <BarChart3 className="size-5" />
              </span>
              WhatsApp account insights
            </h1>
            <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm">
              Everything Meta reports about this WhatsApp Business account —
              volume, delivery, engagement and spend — without leaving the CRM.
            </p>
            {data ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {data.waba.name ? (
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {data.waba.name}
                  </Badge>
                ) : null}
                {data.waba.currency ? (
                  <Badge variant="outline" className="text-[11px] font-normal">
                    Billed in {data.waba.currency}
                  </Badge>
                ) : null}
                {data.waba.review_status ? (
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {humanise(data.waba.review_status)}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex w-fit shrink-0 flex-wrap items-center gap-2">
            {/* Reachable before anything fails. Half the questions this
                page produces ("why is that section empty") are answered
                by settings the operator has not been told exist. */}
            <Link
              href="/settings/whatsapp-insights/guide"
              className="border-border text-foreground hover:bg-muted inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
            >
              <BookOpen className="size-3.5" />
              Insights guide
            </Link>

            {/* The escape hatch. Kept explicit — some things (billing
                disputes, benchmarks) only exist in Meta's own tooling. */}
            <a
              href={metaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-foreground hover:bg-muted inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
            >
              View in Meta dashboard
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* ---- Period controls ---- */}
      <div className="border-border bg-card space-y-2.5 rounded-xl border p-4">
        <div className="flex items-center gap-1.5">
          <CalendarRange className="text-muted-foreground size-3.5" />
          <p className="text-foreground text-xs font-semibold">Time period</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const active = !applied && days === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setApplied(null);
                  setCustomMode(false);
                  setDays(preset);
                }}
                className={cn(
                  'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {preset === 365
                  ? 'Last 12 months (max)'
                  : `Last ${preset} days`}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customMode || applied !== null}
            onClick={() => setCustomMode((v) => !v)}
            className={cn(
              'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
              customMode || applied
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            Custom range
          </button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 gap-1.5 px-2.5 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {customMode ? (
          <div className="border-border bg-muted/30 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <p className="text-muted-foreground text-[11px] font-medium">
                From
              </p>
              <DatePickerField
                value={customStart}
                onChange={setCustomStart}
                min={minIso}
                max={todayIso}
                placeholder="Start date"
              />
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-[11px] font-medium">
                To
              </p>
              <DatePickerField
                value={customEnd}
                onChange={setCustomEnd}
                min={customStart || minIso}
                max={todayIso}
                placeholder="End date"
              />
            </div>
            <Button size="sm" onClick={applyCustom} disabled={loading}>
              Apply
            </Button>
          </div>
        ) : null}

        {data ? (
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Showing{' '}
              <span className="text-foreground font-medium">
                {formatRange(data.window.start, data.window.end)}
              </span>{' '}
              · {data.window.days} {data.window.days === 1 ? 'day' : 'days'} ·{' '}
              {data.window.monthly ? 'monthly' : 'daily'} buckets
            </span>
            {data.window.clamped ? (
              <span className="text-amber-600 dark:text-amber-400">
                Clamped to Meta&apos;s {data.notices.max_lookback_days}-day
                lookback
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ---- Body ---- */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-16" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-[280px] w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      ) : failure ? (
        <div className="border-destructive/30 bg-destructive/[0.06] rounded-xl border p-5">
          <div className="flex items-start gap-2">
            <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-destructive text-sm font-medium">
                {failure.message}
              </p>
              {failure.hint ? (
                <p className="text-destructive/80 mt-1 text-xs">
                  {failure.hint}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
            {failure.code === 'not_configured' ||
            failure.code === 'token_unreadable' ? (
              <Link
                href="/settings?tab=whatsapp"
                className="border-border text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
              >
                Open WhatsApp settings
              </Link>
            ) : null}
          </div>
        </div>
      ) : data ? (
        <>
          {/* ---- Headline KPIs: only what Meta reported ---- */}
          {headlineKpis.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {headlineKpis.map((card) => (
                <KpiCard key={card.label} {...card} />
              ))}
            </div>
          ) : null}

          {/* ---- Volume trend ---- */}
          <SectionCard
            title="Message volume"
            description={`Sent and delivered per ${data.window.monthly ? 'month' : 'day'}, from Meta's messaging analytics.`}
            icon={TrendingUp}
            aside={
              messaging?.ok && messaging.data.phoneNumbers.length > 0 ? (
                <Badge variant="outline" className="text-[11px] font-normal">
                  {messaging.data.phoneNumbers.length} business{' '}
                  {messaging.data.phoneNumbers.length === 1
                    ? 'number'
                    : 'numbers'}
                </Badge>
              ) : undefined
            }
          >
            {!messaging?.ok ? (
              <SectionUnavailable error={messaging?.error ?? 'Unavailable.'} />
            ) : !messaging.data.hasData ? (
              <EmptyHint>
                Meta reported no messages in this period. Send a broadcast or
                reply from the inbox, then check back — Meta can lag a few
                hours.
              </EmptyHint>
            ) : (
              <BarChart
                data={messagingChart}
                index="bucket"
                categories={['Sent', 'Delivered']}
                colors={['emerald', 'blue']}
                valueFormatter={(v) => formatCompactNumber(v)}
                yAxisWidth={48}
                className="h-[260px]"
              />
            )}
          </SectionCard>

          {/* ---- Template engagement ---- */}
          <SectionCard
            title="Template performance"
            description={
              templateSection?.ok
                ? `Read and click engagement for your most recent templates, over the last ${templateSection.data.window.days} days.`
                : 'Read and click engagement per template.'
            }
            icon={Sparkles}
            aside={
              <Link
                href="/templates"
                className="text-primary text-xs font-medium hover:underline"
              >
                Manage templates
              </Link>
            }
          >
            {templatesUnsupported ? (
              <TemplateInsightsUnsupported error={templatesUnsupported.error} />
            ) : templatesNoDataYet ? (
              /* On, just nothing collected yet — an EmptyHint, not a call to
                 action. Rendering the Enable panel in this state is the bug
                 that made the button reappear after it had been pressed. */
              <EmptyHint>{templatesNoDataYet.error}</EmptyHint>
            ) : templatesDisabled ? (
              <TemplateInsightsDisabled
                error={templatesDisabled.error}
                isOwner={isOwner}
                enabling={enabling}
                onEnable={() => void enableInsights()}
              />
            ) : !templateSection?.ok ? (
              <SectionUnavailable
                error={templateSection?.error ?? 'Unavailable.'}
              />
            ) : templateSection.data.rows.length === 0 ? (
              <EmptyHint>
                No template sends in this period. Reads and clicks are only
                reported for template messages, not free-form replies.
              </EmptyHint>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <KpiCard
                    label="Template sends"
                    value={formatCompactNumber(templateTotals.sent)}
                    caption={`${templateTotals.delivered.toLocaleString()} delivered`}
                    icon={MessageSquare}
                    tone="emerald"
                  />
                  <KpiCard
                    label="Read"
                    value={formatCompactNumber(templateTotals.read)}
                    caption={
                      templateTotals.delivered > 0
                        ? `${percent(templateTotals.read / templateTotals.delivered)} of delivered`
                        : '—'
                    }
                    icon={Eye}
                    tone="blue"
                  />
                  <KpiCard
                    label="Button clicks"
                    value={formatCompactNumber(templateTotals.clicked)}
                    caption={
                      templateTotals.delivered > 0
                        ? `${percent(templateTotals.clicked / templateTotals.delivered)} of delivered`
                        : '—'
                    }
                    icon={MousePointerClick}
                    tone="violet"
                  />
                </div>

                <div className="border-border overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="h-9 text-xs">Template</TableHead>
                        <TableHead className="h-9 text-xs">Category</TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Sent
                        </TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Delivered
                        </TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Read rate
                        </TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Click rate
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templateSection.data.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="max-w-[16rem]">
                            <Link
                              href="/templates"
                              className="hover:text-primary block truncate font-mono text-xs font-medium transition-colors"
                              title={row.name}
                            >
                              {row.name}
                            </Link>
                            {row.language ? (
                              <span className="text-muted-foreground text-[10px] uppercase">
                                {row.language}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {row.category}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.sent.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.delivered.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {percent(row.openRate)}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.category === 'Authentication'
                              ? '—'
                              : percent(row.clickRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Meta caps template analytics at{' '}
                  {data.notices.template_max_lookback_days} days and keeps read
                  and click events for only 7 days after a send, so longer
                  periods understate engagement. Click rates are not reported
                  for Authentication templates.
                </p>
              </div>
            )}
          </SectionCard>

          {/* ---- Spend ---- */}
          <SectionCard
            title="Message pricing"
            description="Per-message volume and approximate charges, broken down the way Meta bills them."
            icon={Wallet}
          >
            {!pricing?.ok ? (
              <SectionUnavailable error={pricing?.error ?? 'Unavailable.'} />
            ) : !pricing.data.hasData ? (
              <EmptyHint>
                Meta reported no billable activity in this period.
              </EmptyHint>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="Messages delivered"
                    value={formatCompactNumber(pricing.data.volume)}
                    caption="All pricing categories"
                    icon={CheckCheck}
                    tone="emerald"
                  />
                  <KpiCard
                    label="Free"
                    value={formatCompactNumber(pricing.data.freeVolume)}
                    caption={
                      pricing.data.volume > 0
                        ? `${percent(pricing.data.freeVolume / pricing.data.volume, 0)} of delivered`
                        : '—'
                    }
                    icon={Sparkles}
                    tone="blue"
                  />
                  <KpiCard
                    label="Billable"
                    value={formatCompactNumber(pricing.data.paidVolume)}
                    caption={
                      pricing.data.costReported
                        ? money(pricing.data.cost, currency)
                        : 'Cost withheld by Meta'
                    }
                    icon={Wallet}
                    tone="amber"
                  />
                  {/* Only meaningful once Meta has reported both a cost
                      and something billable to divide it by. */}
                  {pricing.data.costReported &&
                  pricing.data.cost !== null &&
                  pricing.data.paidVolume > 0 ? (
                    <KpiCard
                      label="Avg. cost / message"
                      value={money(
                        pricing.data.cost / pricing.data.paidVolume,
                        currency
                      )}
                      caption="Spend / billable messages"
                      icon={Gauge}
                      tone="violet"
                    />
                  ) : null}
                </div>

                {!pricing.data.costReported ? (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Meta does not report cost for accounts billed through a
                      Solution Partner&apos;s credit line. Volumes below are
                      still exact; charges come from your partner&apos;s
                      invoice.
                    </span>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      By pricing category
                    </p>
                    <BreakdownList
                      rows={pricing.data.byCategory}
                      currency={currency}
                      emptyLabel="No category breakdown reported."
                      tone="amber"
                    />
                  </div>
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      By pricing type
                    </p>
                    <BreakdownList
                      rows={pricing.data.byType}
                      currency={currency}
                      emptyLabel="No type breakdown reported."
                      tone="emerald"
                    />
                  </div>
                </div>

                {spendChart.length > 0 ? (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      Delivered messages over time
                    </p>
                    <BarChart
                      data={spendChart}
                      index="bucket"
                      categories={['Messages']}
                      colors={['amber']}
                      valueFormatter={(v) => formatCompactNumber(v)}
                      yAxisWidth={48}
                      showLegend={false}
                      className="h-[200px]"
                    />
                  </div>
                ) : null}

                {pricing.data.byCountry.length > 0 ? (
                  <div>
                    <p className="text-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold">
                      <Globe2 className="text-muted-foreground size-3.5" />
                      By country
                    </p>
                    <BreakdownList
                      rows={pricing.data.byCountry.slice(0, 8)}
                      currency={currency}
                      emptyLabel="No country breakdown reported."
                      tone="blue"
                    />
                  </div>
                ) : null}

                {/* Volume tiers: the one number here that changes what an
                    operator should DO, since crossing a tier lowers the
                    per-message rate for that country and category. */}
                {pricing.data.tiers.length > 0 ? (
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      Volume tier progress
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {pricing.data.tiers.slice(0, 4).map((tier) => (
                        <div
                          key={`${tier.country}-${tier.category}`}
                          className="border-border bg-muted/30 rounded-lg border p-3"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-foreground text-xs font-medium">
                              {tier.country} · {humanise(tier.category)}
                            </span>
                            <span className="text-muted-foreground text-[11px] tabular-nums">
                              {tier.volume.toLocaleString()} /{' '}
                              {tier.upper?.toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full"
                              style={{
                                width: tier.upper
                                  ? `${Math.min(100, (tier.volume / tier.upper) * 100)}%`
                                  : '0%',
                              }}
                            />
                          </div>
                          <p className="text-muted-foreground mt-1.5 text-[11px]">
                            {tier.remaining !== null
                              ? `${tier.remaining.toLocaleString()} more to the next price tier`
                              : 'No further tiers'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>

          {/* ---- Conversations ---- */}
          {/* ---- Conversations ----
              Rendered ONLY when Meta actually returns conversation data.
              Meta moved most accounts to per-message pricing in 2025, so
              on a current account this section is permanently empty — and
              an empty card explaining a legacy billing model is noise, not
              information. */}
          {conversations?.ok && conversations.data.hasData ? (
            <SectionCard
              title="Conversations"
              description="24-hour conversation counts, as reported by Meta's conversation analytics."
              icon={MessageSquare}
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <KpiCard
                    label="Conversations"
                    value={formatCompactNumber(
                      conversations.data.conversations
                    )}
                    caption="24-hour threads opened"
                    icon={MessageSquare}
                    tone="emerald"
                  />
                  {conversations.data.costReported ? (
                    <KpiCard
                      label="Conversation cost"
                      value={money(conversations.data.cost, currency)}
                      caption="Approximate charges"
                      icon={Wallet}
                      tone="amber"
                    />
                  ) : null}
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      By category
                    </p>
                    <BreakdownList
                      rows={conversations.data.byCategory}
                      currency={currency}
                      showCost={conversations.data.costReported}
                      emptyLabel="Not reported."
                      tone="violet"
                    />
                  </div>
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      By type
                    </p>
                    <BreakdownList
                      rows={conversations.data.byType}
                      currency={currency}
                      showCost={conversations.data.costReported}
                      emptyLabel="Not reported."
                      tone="emerald"
                    />
                  </div>
                  <div>
                    <p className="text-foreground mb-2 text-xs font-semibold">
                      Who started it
                    </p>
                    <BreakdownList
                      rows={conversations.data.byDirection}
                      currency={currency}
                      showCost={false}
                      emptyLabel="Not reported."
                      tone="blue"
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* ---- Calls: only worth a card once calling is actually in use ---- */}
          {calls?.ok && calls.data.hasData ? (
            <SectionCard
              title="Calling"
              description="WhatsApp Business Calling volume, cost and call length."
              icon={Phone}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Calls"
                  value={formatCompactNumber(calls.data.count)}
                  caption="Placed and received"
                  icon={Phone}
                  tone="emerald"
                />
                {calls.data.costReported ? (
                  <KpiCard
                    label="Call cost"
                    value={money(calls.data.cost, currency)}
                    caption="Approximate charges"
                    icon={Wallet}
                    tone="amber"
                  />
                ) : null}
                <KpiCard
                  label="Average length"
                  value={formatDuration(calls.data.averageDuration)}
                  caption="Weighted by call volume"
                  icon={Gauge}
                  tone="violet"
                />
              </div>
            </SectionCard>
          ) : null}

          {/* ---- Footer disclaimer, in Meta's own terms ---- */}
          <p className="text-muted-foreground text-center text-[11px]">
            All figures come straight from Meta&apos;s analytics API and are
            approximate — Meta notes they can differ from invoices because of
            variations in data processing. Timestamps are UTC
            {data.waba.timezone_id ? '; billing uses your WABA timezone' : ''}.
          </p>
        </>
      ) : null}
    </div>
  );
}
