'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  BarChart3,
  Bot,
  Zap,
  TrendingUp,
  Minus,
  Activity,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/dashboard/skeleton';
import { BarChart } from '@/components/tremor/bar-chart';
import { formatCompactNumber } from '@/lib/currency';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface UsageResponse {
  window_days: number;
  truncated: boolean;
  totals: {
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  by_mode: {
    auto_reply: { calls: number; tokens: number };
    draft: { calls: number; tokens: number };
  };
  by_model: {
    model: string;
    provider: string;
    calls: number;
    tokens: number;
  }[];
  daily: { date: string; tokens: number; calls: number }[];
}

const WINDOWS = [7, 30, 90] as const;

// ────────────────────────────────────────────────────────────────
// KPI stat card
// ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: typeof Bot;
  trend?: 'up' | 'down' | 'flat';
  accentClass?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      {/* Decorative corner gradient */}
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-lg" />
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn('rounded-lg p-2', accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend === 'up' && (
            <>
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-500">Active</span>
            </>
          )}
          {trend === 'down' && (
            <>
              <ArrowDownRight className="h-3 w-3 text-amber-500" />
              <span className="text-amber-500">Declining</span>
            </>
          )}
          {trend === 'flat' && (
            <>
              <Minus className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Steady</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Mode split visual (mini bar)
// ────────────────────────────────────────────────────────────────

function ModeSplitBar({
  autoReply,
  draft,
}: {
  autoReply: { calls: number; tokens: number };
  draft: { calls: number; tokens: number };
}) {
  const total = autoReply.tokens + draft.tokens;
  const autoPercent = total > 0 ? Math.round((autoReply.tokens / total) * 100) : 0;
  const draftPercent = total > 0 ? 100 - autoPercent : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Usage by Mode
        </CardTitle>
        <CardDescription className="text-xs">
          Token distribution between auto-replies and drafts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visual bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {autoPercent > 0 && (
            <div
              className="flex items-center justify-center rounded-l-full bg-emerald-500 text-[9px] font-bold text-white transition-all duration-500"
              style={{ width: `${autoPercent}%` }}
            >
              {autoPercent > 10 ? `${autoPercent}%` : ''}
            </div>
          )}
          {draftPercent > 0 && (
            <div
              className="flex items-center justify-center rounded-r-full bg-violet-500 text-[9px] font-bold text-white transition-all duration-500"
              style={{ width: `${draftPercent}%` }}
            >
              {draftPercent > 10 ? `${draftPercent}%` : ''}
            </div>
          )}
        </div>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs font-medium text-foreground">Auto-reply</p>
              <p className="text-xs text-muted-foreground">
                {formatCompactNumber(autoReply.tokens)} tokens · {autoReply.calls}{' '}
                {autoReply.calls === 1 ? 'call' : 'calls'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
            <div className="h-3 w-3 rounded-full bg-violet-500" />
            <div>
              <p className="text-xs font-medium text-foreground">Drafts</p>
              <p className="text-xs text-muted-foreground">
                {formatCompactNumber(draft.tokens)} tokens · {draft.calls}{' '}
                {draft.calls === 1 ? 'call' : 'calls'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// Model breakdown table
// ────────────────────────────────────────────────────────────────

function ModelBreakdown({
  models,
  totalTokens,
}: {
  models: UsageResponse['by_model'];
  totalTokens: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-4 w-4 text-primary" />
          Model Breakdown
        </CardTitle>
        <CardDescription className="text-xs">
          Token usage per AI model
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs">Model</TableHead>
              <TableHead className="h-9 text-xs">Provider</TableHead>
              <TableHead className="h-9 text-right text-xs">Calls</TableHead>
              <TableHead className="h-9 text-right text-xs">Tokens</TableHead>
              <TableHead className="h-9 text-right text-xs">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => {
              const pct =
                totalTokens > 0
                  ? Math.round((m.tokens / totalTokens) * 100)
                  : 0;
              return (
                <TableRow key={`${m.provider}:${m.model}`}>
                  <TableCell className="font-medium">{m.model}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {m.provider}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.calls.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(m.tokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// Daily breakdown table
// ────────────────────────────────────────────────────────────────

function DailyTable({ daily }: { daily: UsageResponse['daily'] }) {
  // Show only days with activity, most recent first
  const activeDays = useMemo(
    () =>
      [...daily]
        .filter((d) => d.tokens > 0 || d.calls > 0)
        .reverse(),
    [daily],
  );

  if (activeDays.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4 text-primary" />
          Daily Activity Log
        </CardTitle>
        <CardDescription className="text-xs">
          Day-by-day breakdown of AI token usage
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-64 overflow-y-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs">Date</TableHead>
              <TableHead className="h-9 text-right text-xs">Calls</TableHead>
              <TableHead className="h-9 text-right text-xs">Tokens</TableHead>
              <TableHead className="h-9 text-right text-xs">
                Avg tokens/call
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeDays.map((d) => (
              <TableRow key={d.date}>
                <TableCell className="font-medium">
                  {format(parseISO(d.date), 'EEE, MMM d')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.calls.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCompactNumber(d.tokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {d.calls > 0
                    ? formatCompactNumber(Math.round(d.tokens / d.calls))
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────

function EmptyState({ days }: { days: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 py-16">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative rounded-full bg-primary/10 p-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-foreground">
          No AI usage in the last {days} days
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Usage data will appear here as the AI assistant drafts replies and
          auto-responds to customer messages. Try sending a test message in the
          Playground to get started.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Skeleton loading state
// ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[260px] w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────

export function AiUsageCard() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canView = accountRole ? canEditSettings(accountRole) : false;

  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageResponse | null>(null);
  const loadedRef = useRef<string | null>(null);

  const fetchUsage = useCallback(
    async (windowDays: number, force = false) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ai/usage?days=${windowDays}`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(json?.error ?? 'Failed to load usage');
          setData(null);
          return;
        }
        setData(json as UsageResponse);
      } catch {
        toast.error('Failed to load usage');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canView || !accountId) return;
    const key = `${accountId}:${days}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    void fetchUsage(days);
  }, [canView, accountId, days, fetchUsage]);

  if (profileLoading || !canView) return null;

  const hasSpend = (data?.totals.total_tokens ?? 0) > 0;

  // Compute trend from daily data
  const trend = useMemo<'up' | 'down' | 'flat'>(() => {
    if (!data?.daily || data.daily.length < 2) return 'flat';
    const half = Math.floor(data.daily.length / 2);
    const firstHalf = data.daily.slice(0, half).reduce((s, d) => s + d.tokens, 0);
    const secondHalf = data.daily.slice(half).reduce((s, d) => s + d.tokens, 0);
    if (secondHalf > firstHalf * 1.1) return 'up';
    if (secondHalf < firstHalf * 0.9) return 'down';
    return 'flat';
  }, [data]);

  // Chart data
  const chartData = useMemo(
    () =>
      data?.daily.map((d) => ({
        day: format(parseISO(d.date), 'MMM d'),
        Tokens: d.tokens,
        Calls: d.calls,
      })) ?? [],
    [data],
  );

  // Average tokens per call
  const avgTokensPerCall = useMemo(() => {
    if (!data || data.totals.calls === 0) return 0;
    return Math.round(data.totals.total_tokens / data.totals.calls);
  }, [data]);

  // Peak day
  const peakDay = useMemo(() => {
    if (!data?.daily.length) return null;
    return data.daily.reduce((best, d) => (d.tokens > best.tokens ? d : best), data.daily[0]);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            AI Usage Analytics
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Token usage from your AI provider key — auto-replies and drafts.
            No message content is stored.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-border bg-transparent text-muted-foreground hover:bg-muted"
            onClick={() => {
              loadedRef.current = null;
              void fetchUsage(days, true);
            }}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Select
            value={String(days)}
            onValueChange={(v) => {
              loadedRef.current = null;
              setDays(Number(v));
            }}
          >
            <SelectTrigger className="w-36 flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Last {w} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : !data || !hasSpend ? (
        <EmptyState days={data?.window_days ?? days} />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label="Total Tokens"
              value={formatCompactNumber(data.totals.total_tokens)}
              subtitle={`${formatCompactNumber(data.totals.prompt_tokens)} prompt · ${formatCompactNumber(data.totals.completion_tokens)} completion`}
              icon={Zap}
              trend={trend}
              accentClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <KpiCard
              label="LLM Calls"
              value={data.totals.calls.toLocaleString()}
              subtitle={`~${avgTokensPerCall.toLocaleString()} tokens/call`}
              icon={Activity}
              accentClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              label="Auto-Replies"
              value={formatCompactNumber(data.by_mode.auto_reply.tokens)}
              subtitle={`${data.by_mode.auto_reply.calls} ${data.by_mode.auto_reply.calls === 1 ? 'call' : 'calls'}`}
              icon={Bot}
              accentClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            />
            <KpiCard
              label="Peak Day"
              value={
                peakDay && peakDay.tokens > 0
                  ? formatCompactNumber(peakDay.tokens)
                  : '—'
              }
              subtitle={
                peakDay && peakDay.tokens > 0
                  ? format(parseISO(peakDay.date), 'EEE, MMM d')
                  : 'No peak yet'
              }
              icon={TrendingUp}
              accentClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
          </div>

          {/* Token chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-primary" />
                Tokens per Day
              </CardTitle>
              <CardDescription className="text-xs">
                Daily token consumption over the last {data.window_days} days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                data={chartData}
                index="day"
                categories={['Tokens']}
                colors={['emerald']}
                valueFormatter={(v) => formatCompactNumber(v)}
                showLegend={false}
                yAxisWidth={48}
                className="h-[240px]"
              />
            </CardContent>
          </Card>

          {/* Two-column: Mode split + Model breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            <ModeSplitBar
              autoReply={data.by_mode.auto_reply}
              draft={data.by_mode.draft}
            />

            {data.by_model.length > 0 ? (
              <ModelBreakdown
                models={data.by_model}
                totalTokens={data.totals.total_tokens}
              />
            ) : (
              <Card className="flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No model data yet
                </p>
              </Card>
            )}
          </div>

          {/* Daily table */}
          <DailyTable daily={data.daily} />

          {/* Truncation notice */}
          {data.truncated && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠ Showing a partial window — usage is high enough that only the
              most recent records are summarized here.
            </p>
          )}
        </>
      )}
    </div>
  );
}
