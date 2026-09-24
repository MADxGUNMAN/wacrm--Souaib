'use client';

// ============================================================
// "View insights" — per-template analytics from Meta.
//
// Backed by GET /api/whatsapp/templates/{id}/analytics, which wraps
// Meta's `/{waba-id}/template_analytics`. Three properties of that API
// shape almost every decision in this file:
//
//   • The lookback window is capped at 90 days, and asking for more
//     silently returns less. The server echoes the window it actually
//     used and this dialog labels itself from THAT, never from the
//     button the operator pressed.
//
//   • Read and click events are only retained for 7 days after a send.
//     An older window can legitimately report plenty delivered and zero
//     read, which looks exactly like a broken integration. When the
//     window reaches past that retention we say so, rather than letting
//     the operator conclude nobody opens their messages.
//
//   • Nothing is collected at all until template insights are confirmed
//     on the WABA. That is a specific, fixable state (Meta error
//     200005 / 4182002) so it gets its own panel with the switch on it
//     instead of a generic failure.
//
// Rates render as an em dash when the denominator is zero. A template
// with nothing sent has an UNKNOWN open rate, and "0%" reads as a
// failure rather than an absence.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCheck,
  Clock,
  Eye,
  Info,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useInsightsSupport } from '@/hooks/use-insights-support';
import { templateStatusConfig } from '@/lib/template-status';
import { formatCompactNumber } from '@/lib/currency';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { MessageTemplate, MessageTemplateStatus } from '@/types';

// ── Response contract (mirrors the route) ───────────────────

interface AnalyticsResponse {
  window: {
    start: string;
    end: string;
    days: number;
    clamped: boolean;
    all_time: boolean;
  };
  template: {
    id: string;
    name: string;
    status: string;
    category: string;
    language: string | null;
    header_type: string | null;
    quality_score: string | null;
    meta_template_id: string | null;
    rejection_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
    last_submitted_at: string | null;
  };
  totals: {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    uniqueClicked: number;
  };
  rates: {
    deliveryRate: number | null;
    openRate: number | null;
    clickRate: number | null;
    readThroughRate: number | null;
    clickThroughRate: number | null;
  };
  daily: {
    date: string;
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    /**
     * Meta's per-day cost figures, exactly as it reported them. Shown
     * unaggregated in the daily table so the window totals above can be
     * checked by hand, and so days priced differently are visible — Meta
     * prices per day, and the rate does move between days.
     */
    amountSpent?: number | null;
    costPerDelivered?: number | null;
    costPerUrlClick?: number | null;
  }[];
  buttons: {
    label: string;
    type: string;
    clicks: number;
    uniqueClicks: number;
  }[];
  cost: {
    amountSpent: number | null;
    /** Amount spent ÷ messages delivered, Meta's own formula. */
    costPerDelivered: number | null;
    /**
     * Meta's own per-day rate. Optional because older responses omit it.
     */
    metaCostPerDelivered?: number | null;
    /**
     * Meta's definition applied to Meta's data: amount spent ÷ website
     * button clicks, over the selected window.
     */
    costPerUrlClick: number | null;
    /**
     * Meta's own per-day figure, shown next to the window one. Optional
     * because older responses omit it.
     */
    metaCostPerUrlClick?: number | null;
    /** The denominator behind the rate. Optional: older responses omit it. */
    urlClicks?: number;
  };
  /** The WABA's billing currency, so cost figures carry their unit. */
  currency: string | null;
  meta: {
    granularity: string | null;
    product_type: string | null;
    has_data: boolean;
  };
  notices: {
    engagement_retention_days: number;
    exceeds_engagement_retention: boolean;
    max_lookback_days: number;
    click_metrics_supported: boolean;
  };
}

/** A route failure we can act on, rather than just report. */
type FailureCode =
  | 'insights_disabled'
  /**
   * Meta refuses template analytics on a Coexistence number ("SMB business
   * type"). Distinct from `insights_disabled` because it must NOT render an
   * Enable button — no one can turn it on, so offering the switch teaches the
   * operator to retry a permanent limit.
   */
  | 'insights_unsupported_smb'
  /**
   * Insights are on and Meta simply has nothing yet. Must NOT render the
   * Enable button — offering it in this state is what made the switch reappear
   * after it had already been thrown.
   */
  | 'insights_no_data_yet'
  | 'not_submitted'
  | 'not_configured'
  | 'token_unreadable'
  | 'meta_error'
  | 'unknown';

const PRESETS = [7, 30, 60, 90] as const;

/**
 * The period the dialog opens on.
 *
 * All time, not 7 days: the question an operator brings to a template is
 * "how has this performed", and a 7-day default answers a much narrower
 * one — on a template sent monthly it opens on an empty screen. All time
 * is only answerable because snapshots are stored; Meta itself forgets
 * reads after 7 days and everything after 90.
 */
const DEFAULT_PERIOD = 'all' as const;

// ── Small formatting helpers ────────────────────────────────

/** Rates are fractions or null; null means "no denominator", not zero. */
function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatRange(start: string, end: string): string {
  return start === end
    ? formatDay(start)
    : `${formatDay(start)} – ${formatDay(end)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Money the way Meta prints it: two decimals.
 *
 * Was four decimals for sub-unit amounts, which rendered a correct
 * ₹2.59 as "2.5893" and a real cost-per-message as "0.8633" — the same
 * number Meta reports, but with invented-looking precision.
 */
function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const code = (currency ?? '').trim();
  try {
    if (!code) throw new Error('no currency');
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return code ? `${code} ${formatted}` : formatted;
  }
}

const QUALITY_TONE: Record<string, string> = {
  GREEN: 'text-emerald-600 dark:text-emerald-400',
  YELLOW: 'text-amber-600 dark:text-amber-400',
  RED: 'text-red-600 dark:text-red-400',
};

// ── Metric card ─────────────────────────────────────────────

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Send;
  tone: { bg: string; text: string; ring: string };
}) {
  return (
    <div
      className={cn(
        'bg-card relative overflow-hidden rounded-xl border p-3.5 transition-shadow hover:shadow-sm',
        tone.ring
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          {label}
        </p>
        <div className={cn('rounded-md p-1.5', tone.bg, tone.text)}>
          <Icon className="size-3.5" />
        </div>
      </div>
      <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">{caption}</p>
    </div>
  );
}

function RateTile({
  label,
  value,
  formula,
  tone,
}: {
  label: string;
  value: string;
  formula: string;
  tone: string;
}) {
  return (
    <div className="text-center">
      <p className={cn('text-xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="text-foreground mt-0.5 text-xs font-medium">{label}</p>
      <p className="text-muted-foreground text-[10px]">{formula}</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right text-xs font-medium">
        {children}
      </span>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'amber' | 'blue';
  icon: typeof Info;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        tone === 'amber'
          ? 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300'
          : 'border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300'
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

// ── Main dialog ─────────────────────────────────────────────

export function TemplateInsightsDialog({
  template,
  open,
  onOpenChange,
}: {
  template: MessageTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Enabling insights is owner-only on the server too — this only decides
  // whether to show the button or explain who can press it.
  const { isOwner } = useAuth();

  /** `'all'` or a rolling day count. */
  const [period, setPeriod] = useState<number | 'all'>(DEFAULT_PERIOD);
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    hint: string | null;
    code: FailureCode;
  } | null>(null);

  /**
   * Whether Meta can serve analytics for this account at all.
   *
   * Two sources, deliberately. `useInsightsSupport` knows before any request
   * is made — the connection mode was recorded when the number was onboarded —
   * which is what lets the period picker be absent on first paint rather than
   * appearing and then being contradicted. The failure code is the backstop
   * for the case where the stored mode is stale and only Meta's answer reveals
   * it.
   */
  const { supported: accountSupportsInsights } = useInsightsSupport();
  const insightsUnsupported =
    accountSupportsInsights === false ||
    failure?.code === 'insights_unsupported_smb';

  // Keyed cache so re-renders don't refetch, and so Refresh can force one.
  const loadedRef = useRef<string | null>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minIso = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 89);
    return d.toISOString().slice(0, 10);
  }, []);

  const query = useMemo(() => {
    if (appliedCustom) {
      return `start=${appliedCustom.start}&end=${appliedCustom.end}`;
    }
    return period === 'all' ? 'range=all' : `days=${period}`;
  }, [appliedCustom, period]);

  const load = useCallback(
    async (templateId: string, search: string, force = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/whatsapp/templates/${templateId}/analytics?${search}${force ? '&force=1' : ''}`,
          { cache: 'no-store' }
        );
        const result = await readApiResponse<
          AnalyticsResponse & { code?: FailureCode }
        >(res, 'loaded');

        if (!result.ok) {
          setData(null);
          setFailure({
            message: result.error ?? 'Could not load insights.',
            hint: result.hint,
            code: (result.data?.code as FailureCode) ?? 'unknown',
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
          code: 'unknown',
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Reset per-template state when a different template is opened, so the
  // previous template's numbers never flash under the new name.
  useEffect(() => {
    if (!open) return;
    loadedRef.current = null;
    setData(null);
    setFailure(null);
    setPeriod(DEFAULT_PERIOD);
    setCustomMode(false);
    setAppliedCustom(null);
    setCustomStart('');
    setCustomEnd('');
  }, [open, template?.id]);

  useEffect(() => {
    if (!open || !template?.id) return;
    const key = `${template.id}:${query}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    void load(template.id, query);
  }, [open, template?.id, query, load]);

  /**
   * Explicit Refresh forces a Meta re-fetch.
   *
   * Normal opens are served from our table and only refresh Meta when the
   * stored figures are stale, which is what makes the dialog open
   * instantly. Pressing Refresh is the operator saying "I know, go and
   * ask anyway".
   */
  const refresh = () => {
    if (!template?.id) return;
    loadedRef.current = null;
    void load(template.id, query, true);
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
    setAppliedCustom({ start: customStart, end: customEnd });
  };

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

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        day: formatDay(d.date),
        Sent: d.sent,
        Delivered: d.delivered,
        Read: d.read,
        Clicked: d.clicked,
      })),
    [data]
  );

  const activeDays = useMemo(
    () => (data?.daily ?? []).filter((d) => d.sent > 0).reverse(),
    [data]
  );

  const peakDay = useMemo(() => {
    const withSends = (data?.daily ?? []).filter((d) => d.sent > 0);
    if (withSends.length === 0) return null;
    return withSends.reduce((best, d) => (d.sent > best.sent ? d : best));
  }, [data]);

  if (!template) return null;

  const statusKey = (data?.template.status ??
    template.status ??
    'DRAFT') as MessageTemplateStatus;
  const status = templateStatusConfig[statusKey] ?? templateStatusConfig.DRAFT;
  const totals = data?.totals;
  const hasSends = (totals?.sent ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* ---- Header ---- */}
        {/* Tight vertical padding on purpose: the header, the badges and
            the period picker are one continuous control strip, and the
            default dialog spacing left a visibly empty band between the
            template name and the first thing you can click. */}
        <DialogHeader className="border-border border-b px-5 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary rounded-md p-1.5">
              <BarChart3 className="size-4" />
            </span>
            Template insights
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground truncate font-mono text-xs font-medium">
              {template.name}
            </span>
            <Badge className={cn('border text-[10px]', status.classes)}>
              {status.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal">
              {data?.template.category ?? template.category}
            </Badge>
            {template.language ? (
              <Badge
                variant="outline"
                className="text-[10px] font-normal uppercase"
              >
                {template.language}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-7.5rem)] space-y-4 overflow-y-auto px-5 pt-3 pb-4">
          {/*
            ---- Period picker ----

            Hidden entirely when Meta cannot serve this account's analytics at
            all (Coexistence). Every control in this block — six period tabs, a
            custom range picker, a Refresh button — asks Meta a question it will
            always refuse, so leaving them on screen invites the operator to
            work through all of them before discovering that none can help.
          */}
          {insightsUnsupported ? null : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <CalendarRange className="text-muted-foreground size-3.5" />
                <p className="text-foreground text-xs font-semibold">
                  Select time period
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {/* All time first, and selected by default. */}
                <button
                  type="button"
                  aria-pressed={!appliedCustom && period === 'all'}
                  onClick={() => {
                    setAppliedCustom(null);
                    setCustomMode(false);
                    setPeriod('all');
                  }}
                  className={cn(
                    'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                    !appliedCustom && period === 'all'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  All time
                </button>
                {PRESETS.map((preset) => {
                  const active = !appliedCustom && period === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setAppliedCustom(null);
                        setCustomMode(false);
                        setPeriod(preset);
                      }}
                      className={cn(
                        'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      Last {preset} days
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={customMode || appliedCustom !== null}
                  onClick={() => setCustomMode((v) => !v)}
                  className={cn(
                    'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                    customMode || appliedCustom
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  Custom range
                </button>
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

              <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <p className="text-foreground text-xs font-medium">
                  {!data
                    ? 'Showing…'
                    : data.window.all_time
                      ? 'Showing all time'
                      : `Showing ${data.window.days} ${data.window.days === 1 ? 'day' : 'days'}`}
                </p>
                <div className="flex items-center gap-2">
                  {data ? (
                    <p className="text-muted-foreground text-xs">
                      {formatRange(data.window.start, data.window.end)}
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={refresh}
                    disabled={loading}
                  >
                    <RefreshCw
                      className={cn('size-3', loading && 'animate-spin')}
                    />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ---- Body ---- */}
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-xl border p-3.5">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="mt-3 h-7 w-12" />
                    <Skeleton className="mt-2 h-3 w-16" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-[220px] w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : failure ? (
            <div className="space-y-3">
              {failure.code === 'insights_no_data_yet' ? (
                /*
                  On, just nothing collected yet. Neutral and buttonless —
                  offering Enable here is what made the switch reappear after
                  it had already been thrown, because Meta's WABA flag and its
                  analytics endpoint disagree on some accounts.
                */
                <div className="border-border bg-muted/30 rounded-xl border p-5 text-center">
                  <div className="bg-muted text-muted-foreground mx-auto flex size-11 items-center justify-center rounded-full">
                    <Clock className="size-5" />
                  </div>
                  <p className="text-foreground mt-3 text-sm font-semibold">
                    No data from Meta yet
                  </p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-[54ch] text-xs">
                    {failure.message}
                  </p>
                </div>
              ) : failure.code === 'insights_unsupported_smb' ? (
                /*
                  Coexistence. Deliberately NO Enable button and no guide link
                  to an irreversible switch — Meta rejects the call every time
                  with "(#10) This operation can not be performed on SMB
                  business type", so the only useful thing to say is where the
                  numbers DO exist. Informational styling rather than
                  destructive: nothing is broken and nothing needs fixing.
                */
                <div className="border-border bg-muted/30 rounded-xl border p-5 text-center">
                  <div className="bg-muted text-muted-foreground mx-auto flex size-11 items-center justify-center rounded-full">
                    <Info className="size-5" />
                  </div>
                  <p className="text-foreground mt-3 text-sm font-semibold">
                    Not available for WhatsApp Business app numbers
                  </p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-[54ch] text-xs">
                    {failure.message}
                  </p>
                </div>
              ) : failure.code === 'insights_disabled' ? (
                <div className="border-border bg-card rounded-xl border p-5 text-center">
                  <div className="bg-primary/10 text-primary mx-auto flex size-11 items-center justify-center rounded-full">
                    <Sparkles className="size-5" />
                  </div>
                  <p className="text-foreground mt-3 text-sm font-semibold">
                    Template insights aren&apos;t switched on yet
                  </p>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-[52ch] text-xs">
                    Meta collects no per-template metrics until insights are
                    confirmed for your WhatsApp Business account. Turning them
                    on also enables Meta&apos;s link tracking and anonymised
                    chat analysis, and it cannot be switched off again.
                  </p>
                  <p className="text-muted-foreground mx-auto mt-2 max-w-[52ch] text-xs">
                    Collection starts from the moment it is enabled — earlier
                    sends are not backfilled.
                  </p>
                  {isOwner ? (
                    <Button
                      className="mt-4"
                      onClick={() => void enableInsights()}
                      disabled={enabling}
                    >
                      {enabling ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Enabling…
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          Enable template insights
                        </>
                      )}
                    </Button>
                  ) : (
                    <p className="text-muted-foreground mt-4 text-xs">
                      Ask the workspace owner to enable it — Meta makes this
                      permanent, so only the owner can.
                    </p>
                  )}
                  {/* Opens in a new tab on purpose: reading about an
                      irreversible switch should not close the dialog
                      holding the switch. */}
                  <p className="mt-3 text-xs">
                    <Link
                      href="/settings/whatsapp-insights/guide"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      <BookOpen className="size-3.5" />
                      What this changes, and how to enable it in Meta instead
                    </Link>
                  </p>
                  <p className="text-muted-foreground/80 mt-3 text-[11px] italic">
                    Meta said: {failure.message}
                  </p>
                </div>
              ) : (
                <div className="border-destructive/30 bg-destructive/[0.06] rounded-xl border p-4">
                  <div className="flex items-start gap-2">
                    {failure.code === 'not_submitted' ||
                    failure.code === 'not_configured' ||
                    failure.code === 'token_unreadable' ? (
                      <ShieldAlert className="text-destructive mt-0.5 size-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                    )}
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
                  {failure.code === 'meta_error' ||
                  failure.code === 'unknown' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={refresh}
                    >
                      <RefreshCw className="size-3.5" />
                      Try again
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : data && totals && !data.meta.has_data ? (
            /* ---- Meta returned nothing for this window ----
               Deliberately NOT rendered as a row of zeroes and dashed
               rates. Meta reports no data points at all for a window it
               has no records for, and a "0" tile beside a "0.0% delivery
               rate" reads as a measurement — which is how a 60-day view
               ends up appearing to contradict the 7-day view sitting one
               click away. Nothing measured means nothing shown. */
            <div className="border-border bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-10 text-center">
              <div className="bg-muted text-muted-foreground rounded-full p-3">
                <CalendarRange className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-foreground text-sm font-medium">
                  Meta has no data for{' '}
                  {formatRange(data.window.start, data.window.end)}
                </p>
                <p className="text-muted-foreground mx-auto max-w-[54ch] text-xs">
                  Template analytics only cover the period since insights were
                  switched on for this WhatsApp Business account — Meta does not
                  backfill earlier activity. Try a shorter period.
                </p>
                <p className="text-xs">
                  <Link
                    href="/settings/whatsapp-insights/guide"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                  >
                    <BookOpen className="size-3.5" />
                    Why a period can come back empty
                  </Link>
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {PRESETS.filter((p) => p < (data.window.days || 0)).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAppliedCustom(null);
                        setCustomMode(false);
                        setPeriod(preset);
                      }}
                      className="border-border text-muted-foreground hover:bg-muted hover:text-foreground h-7 rounded-md border px-2.5 text-xs font-medium transition-colors"
                    >
                      Last {preset} days
                    </button>
                  )
                )}
              </div>
            </div>
          ) : data && totals ? (
            <>
              {/* ---- Metric cards ---- */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Sent"
                  value={formatCompactNumber(totals.sent)}
                  caption="Total messages"
                  icon={Send}
                  tone={{
                    bg: 'bg-amber-500/10',
                    text: 'text-amber-600 dark:text-amber-400',
                    ring: 'border-amber-500/25',
                  }}
                />
                <MetricCard
                  label="Delivered"
                  value={formatCompactNumber(totals.delivered)}
                  caption={percent(data.rates.deliveryRate) + ' of sent'}
                  icon={CheckCheck}
                  tone={{
                    bg: 'bg-emerald-500/10',
                    text: 'text-emerald-600 dark:text-emerald-400',
                    ring: 'border-emerald-500/25',
                  }}
                />
                <MetricCard
                  label="Read"
                  value={formatCompactNumber(totals.read)}
                  caption={percent(data.rates.openRate) + ' of delivered'}
                  icon={Eye}
                  tone={{
                    bg: 'bg-blue-500/10',
                    text: 'text-blue-600 dark:text-blue-400',
                    ring: 'border-blue-500/25',
                  }}
                />
                <MetricCard
                  label="Clicked"
                  value={
                    data.notices.click_metrics_supported
                      ? formatCompactNumber(totals.clicked)
                      : '—'
                  }
                  caption={
                    !data.notices.click_metrics_supported
                      ? 'Not reported for this category'
                      : totals.uniqueClicked > 0
                        ? `${formatCompactNumber(totals.uniqueClicked)} unique`
                        : // Meta only reports a unique count once there is
                          // one; "0 unique" beside real clicks looks broken.
                          'Total taps'
                  }
                  icon={MousePointerClick}
                  tone={{
                    bg: 'bg-violet-500/10',
                    text: 'text-violet-600 dark:text-violet-400',
                    ring: 'border-violet-500/25',
                  }}
                />
              </div>

              {/* ---- Engagement rates ---- */}
              <div className="border-border bg-card rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <TrendingUp className="text-primary size-3.5" />
                  <p className="text-foreground text-xs font-semibold">
                    Engagement rates
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <RateTile
                    label="Delivery rate"
                    value={percent(data.rates.deliveryRate)}
                    formula="Delivered / sent"
                    tone="text-emerald-600 dark:text-emerald-400"
                  />
                  <RateTile
                    label="Open rate"
                    value={percent(data.rates.openRate)}
                    formula="Read / delivered"
                    tone="text-blue-600 dark:text-blue-400"
                  />
                  <RateTile
                    label="Click rate"
                    value={
                      data.notices.click_metrics_supported
                        ? percent(data.rates.clickRate)
                        : '—'
                    }
                    formula="Clicked / delivered"
                    tone="text-violet-600 dark:text-violet-400"
                  />
                  <RateTile
                    label="Read-through"
                    value={percent(data.rates.readThroughRate)}
                    formula="Read / sent"
                    tone="text-foreground"
                  />
                </div>
              </div>

              {/* ---- Notices ---- */}
              {data.window.clamped ? (
                <Notice tone="blue" icon={Info}>
                  Meta only keeps {data.notices.max_lookback_days} days of
                  template analytics, so this shows{' '}
                  {formatRange(data.window.start, data.window.end)} rather than
                  the full range requested.
                </Notice>
              ) : null}

              {data.notices.exceeds_engagement_retention && hasSends ? (
                <Notice tone="amber" icon={Clock}>
                  Meta keeps read and click events for only{' '}
                  {data.notices.engagement_retention_days} days after a message
                  is sent, then resets them to zero. Sent and delivered counts
                  stay accurate for the whole window, but reads and clicks older
                  than that are no longer reported — so longer windows
                  understate engagement.
                </Notice>
              ) : null}

              {!data.notices.click_metrics_supported ? (
                <Notice tone="blue" icon={Info}>
                  Meta reports button clicks for Marketing and Utility templates
                  only, so click metrics are unavailable for this{' '}
                  {data.template.category} template.
                </Notice>
              ) : null}

              {/* ---- Daily chart ---- */}
              {hasSends ? (
                <div className="border-border bg-card rounded-xl border p-4">
                  <div className="mb-1 flex items-center gap-1.5">
                    <BarChart3 className="text-primary size-3.5" />
                    <p className="text-foreground text-xs font-semibold">
                      Daily performance
                    </p>
                  </div>
                  <p className="text-muted-foreground mb-3 text-[11px]">
                    Sent, delivered, read and clicked per day (UTC).
                  </p>
                  <BarChart
                    data={chartData}
                    index="day"
                    categories={['Sent', 'Delivered', 'Read', 'Clicked']}
                    colors={['amber', 'emerald', 'blue', 'violet']}
                    valueFormatter={(v) => formatCompactNumber(v)}
                    yAxisWidth={44}
                    className="h-[220px]"
                  />
                </div>
              ) : (
                <div className="border-border bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-10 text-center">
                  <div className="bg-primary/10 text-primary rounded-full p-3">
                    <Send className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-foreground text-sm font-medium">
                      No sends in this period
                    </p>
                    <p className="text-muted-foreground mx-auto max-w-[46ch] text-xs">
                      {statusKey === 'APPROVED'
                        ? 'Use this template in a broadcast or from the inbox, then come back — Meta reports daily and can lag a few hours.'
                        : `Meta only records analytics for templates it has approved. This one is ${status.label.toLowerCase()}.`}
                    </p>
                  </div>
                </div>
              )}

              {/* ---- Button breakdown ---- */}
              {data.buttons.length > 0 ? (
                <div className="border-border bg-card overflow-hidden rounded-xl border">
                  <div className="border-border border-b px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <MousePointerClick className="text-primary size-3.5" />
                      <p className="text-foreground text-xs font-semibold">
                        Button performance
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      Taps per button. Unique counts each recipient once.
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">Button</TableHead>
                        <TableHead className="h-9 text-xs">Type</TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Clicks
                        </TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Unique
                        </TableHead>
                        <TableHead className="h-9 text-right text-xs">
                          Of delivered
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.buttons.map((b) => (
                        <TableRow key={`${b.type}-${b.label}`}>
                          <TableCell className="max-w-[16rem] truncate text-xs font-medium">
                            {b.label}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {b.type.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {b.clicks.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {b.uniqueClicks > 0
                              ? b.uniqueClicks.toLocaleString()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                            {totals.delivered > 0
                              ? percent(b.clicks / totals.delivered)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {/* ---- Summary + template facts ---- */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border-border bg-card rounded-xl border p-4">
                  <p className="text-foreground mb-2 text-xs font-semibold">
                    Performance summary
                  </p>
                  <div className="divide-border divide-y">
                    <InfoRow label="Messages sent">
                      {totals.sent.toLocaleString()}
                    </InfoRow>
                    <InfoRow label="Reached recipients">
                      {totals.delivered.toLocaleString()}
                    </InfoRow>
                    <InfoRow label="Undelivered">
                      {Math.max(
                        0,
                        totals.sent - totals.delivered
                      ).toLocaleString()}
                    </InfoRow>
                    <InfoRow label="Busiest day">
                      {peakDay
                        ? `${formatDay(peakDay.date)} · ${peakDay.sent.toLocaleString()} sent`
                        : '—'}
                    </InfoRow>
                    <InfoRow label="Days with sends">
                      {activeDays.length.toLocaleString()} of {data.window.days}
                    </InfoRow>
                    {data.cost.amountSpent !== null ? (
                      <>
                        {/* The three cards WhatsApp Manager shows, with
                            Manager's labels and Manager's formulas, in
                            Manager's order. All three share one numerator
                            — Meta's spend for the window — so they
                            reconcile against each other and against the
                            daily table below. */}
                        <InfoRow label="Amount spent">
                          <span
                            className="inline-flex items-center gap-1"
                            title={`Billed by Meta across ${activeDays.length} ${
                              activeDays.length === 1 ? 'day' : 'days'
                            } with sends. Messages Meta bills at nothing count as zero, not as a rate.`}
                          >
                            <Wallet className="size-3" />
                            {formatMoney(data.cost.amountSpent, data.currency)}
                          </span>
                        </InfoRow>
                        {data.cost.costPerDelivered !== null ? (
                          <InfoRow label="Cost per message delivered">
                            <span
                              title={[
                                'Amount spent divided by messages delivered, Meta’s own formula.',
                                data.cost.metaCostPerDelivered != null &&
                                Math.abs(
                                  data.cost.metaCostPerDelivered -
                                    data.cost.costPerDelivered
                                ) >= 0.01
                                  ? `Meta reports ${formatMoney(
                                      data.cost.metaCostPerDelivered,
                                      data.currency
                                    )} per day.`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {formatMoney(
                                data.cost.costPerDelivered,
                                data.currency
                              )}
                            </span>
                          </InfoRow>
                        ) : null}
                        {data.cost.costPerUrlClick !== null ? (
                          <InfoRow label="Cost per website button click">
                            {/* Meta's wording, so the row is findable in
                                WhatsApp Manager, and Meta's formula, so the
                                figure is reproducible from the daily table
                                below. The tooltip also carries Meta's own
                                per-day rate, because a per-day rate cannot
                                see spend from any other day and the two
                                differ for legitimate reasons. */}
                            <span
                              title={[
                                'Amount spent divided by website button taps, Meta’s own formula.',
                                data.cost.urlClicks
                                  ? `${data.cost.urlClicks} ${
                                      data.cost.urlClicks === 1 ? 'tap' : 'taps'
                                    } in this period.`
                                  : null,
                                data.cost.metaCostPerUrlClick != null &&
                                data.cost.costPerUrlClick != null &&
                                Math.abs(
                                  data.cost.metaCostPerUrlClick -
                                    data.cost.costPerUrlClick
                                ) >= 0.01
                                  ? `Meta reports ${formatMoney(
                                      data.cost.metaCostPerUrlClick,
                                      data.currency
                                    )} per day, which counts only the days a link was tapped.`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {formatMoney(
                                data.cost.costPerUrlClick,
                                data.currency
                              )}
                              {data.cost.urlClicks ? (
                                <span className="text-muted-foreground ml-1 text-[11px]">
                                  / {data.cost.urlClicks} tap
                                  {data.cost.urlClicks === 1 ? '' : 's'}
                                </span>
                              ) : null}
                            </span>
                          </InfoRow>
                        ) : null}
                      </>
                    ) : (
                      <InfoRow label="Cost">
                        <span
                          className="text-muted-foreground"
                          title="Meta omits cost for accounts billed through a partner's credit line."
                        >
                          Not reported by Meta
                        </span>
                      </InfoRow>
                    )}
                  </div>
                </div>

                <div className="border-border bg-card rounded-xl border p-4">
                  <p className="text-foreground mb-2 text-xs font-semibold">
                    Template details
                  </p>
                  <div className="divide-border divide-y">
                    <InfoRow label="Status">
                      <Badge
                        className={cn('border text-[10px]', status.classes)}
                      >
                        {status.label}
                      </Badge>
                    </InfoRow>
                    <InfoRow label="Category">{data.template.category}</InfoRow>
                    <InfoRow label="Language">
                      <span className="uppercase">
                        {data.template.language ?? '—'}
                      </span>
                    </InfoRow>
                    <InfoRow label="Header">
                      <span className="capitalize">
                        {data.template.header_type ?? 'None'}
                      </span>
                    </InfoRow>
                    {/* Quality rating appears only once Meta has actually
                        issued one. Meta withholds it until a template has
                        enough delivery volume to be rated, so a permanent
                        "Not rated yet" row was filling a slot with a
                        non-answer. */}
                    {data.template.quality_score ? (
                      <InfoRow label="Quality rating">
                        <span
                          className={cn(
                            'font-semibold uppercase',
                            QUALITY_TONE[data.template.quality_score]
                          )}
                        >
                          {data.template.quality_score}
                        </span>
                      </InfoRow>
                    ) : null}
                    <InfoRow label="Last submitted">
                      {formatDateTime(data.template.last_submitted_at)}
                    </InfoRow>
                    <InfoRow label="Last updated">
                      {formatDateTime(data.template.updated_at)}
                    </InfoRow>
                    <InfoRow label="Created">
                      {formatDateTime(data.template.created_at)}
                    </InfoRow>
                  </div>
                  {data.template.rejection_reason ? (
                    <p className="text-destructive mt-2 text-[11px]">
                      {data.template.rejection_reason}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground mt-2 text-[10px]">
                    Status and quality come from the last sync with Meta. Use
                    Sync from Meta on the list to refresh them.
                  </p>
                </div>
              </div>

              {/* ---- Daily log ---- */}
              {activeDays.length > 0 ? (
                <div className="border-border bg-card overflow-hidden rounded-xl border">
                  <div className="border-border border-b px-4 py-3">
                    <p className="text-foreground text-xs font-semibold">
                      Daily breakdown
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      Days with at least one send, most recent first. Spend is
                      Meta&rsquo;s figure for that day.
                    </p>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 text-xs">Date</TableHead>
                          <TableHead className="h-9 text-right text-xs">
                            Sent
                          </TableHead>
                          <TableHead className="h-9 text-right text-xs">
                            Delivered
                          </TableHead>
                          <TableHead className="h-9 text-right text-xs">
                            Read
                          </TableHead>
                          <TableHead className="h-9 text-right text-xs">
                            Clicked
                          </TableHead>
                          <TableHead className="h-9 text-right text-xs">
                            Spend
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeDays.map((d) => (
                          <TableRow key={d.date}>
                            <TableCell className="text-xs font-medium">
                              {formatDay(d.date)}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {d.sent.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {d.delivered.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {d.read.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {data.notices.click_metrics_supported
                                ? d.clicked.toLocaleString()
                                : '—'}
                            </TableCell>
                            {/* Meta's own per-day rates ride along in the
                                title, so a day priced differently from its
                                neighbours can be spotted without another
                                column. */}
                            <TableCell
                              className="text-right text-xs tabular-nums"
                              title={
                                [
                                  d.costPerDelivered != null
                                    ? `${formatMoney(d.costPerDelivered, data.currency)} per delivered`
                                    : null,
                                  d.costPerUrlClick != null
                                    ? `${formatMoney(d.costPerUrlClick, data.currency)} per website button tap`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || undefined
                              }
                            >
                              {d.amountSpent != null
                                ? formatMoney(d.amountSpent, data.currency)
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              <p className="text-muted-foreground text-center text-[10px]">
                Meta reports template analytics daily in UTC, with up to a{' '}
                {data.notices.max_lookback_days}-day lookback. Recent activity
                can take a few hours to appear.
              </p>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
