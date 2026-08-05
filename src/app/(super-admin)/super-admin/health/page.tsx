"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Users,
  Building2,
  Brain,
  Zap,
  RefreshCw,
  AlertCircle,
  Clock,
  Megaphone,
  Database,
  TrendingUp,
  Bot,
  UserPlus,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  HealthDashboardData,
  ActivityLogEntry,
  TableStat,
} from "@/types/super-admin";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = Math.max(0, now - then);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function activityIcon(type: ActivityLogEntry["type"]) {
  switch (type) {
    case "account_created":
      return <UserPlus className="h-4 w-4 text-emerald-500" />;
    case "broadcast_sent":
      return <Megaphone className="h-4 w-4 text-blue-500" />;
    case "automation_triggered":
      return <Bot className="h-4 w-4 text-purple-500" />;
    default:
      return <MessageSquare className="h-4 w-4 text-slate-400" />;
  }
}

function activityBadgeColor(type: ActivityLogEntry["type"]) {
  switch (type) {
    case "account_created":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "broadcast_sent":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "automation_triggered":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip for charts
// ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-xs font-medium text-slate-500 mb-1">
        {new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      <p className="text-sm font-bold text-slate-900">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    try {
      const res = await fetch("/api/super-admin/health");
      if (!res.ok) throw new Error("Failed to fetch health data");
      const json = await res.json();
      setData(json.data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-red-400">
        <AlertCircle className="mr-2 h-5 w-5" />
        Failed to load health data. Ensure you have super admin access.
      </div>
    );
  }

  const m = data?.metrics;

  // ──────────────────────────────────────────────────────────
  // KPI Cards Configuration
  // ──────────────────────────────────────────────────────────
  const kpis = [
    {
      title: "Total Messages",
      value: m?.total_messages ?? 0,
      sub: `${formatNumber(m?.messages_today ?? 0)} today`,
      icon: MessageSquare,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50",
    },
    {
      title: "Total Contacts",
      value: m?.total_contacts ?? 0,
      sub: `${formatNumber(m?.total_conversations ?? 0)} conversations`,
      icon: Users,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
    },
    {
      title: "Active Accounts",
      value: m?.active_accounts ?? 0,
      sub: `${m?.banned_accounts ?? 0} banned · ${m?.connected_whatsapp ?? 0} WhatsApp connected`,
      icon: Building2,
      iconColor: "text-violet-500",
      iconBg: "bg-violet-50",
    },
    {
      title: "AI Tokens Used",
      value: m?.total_ai_tokens ?? 0,
      sub: `${formatNumber(m?.ai_requests_today ?? 0)} requests today`,
      icon: Brain,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      title: "Automations Run",
      value: m?.total_automation_runs ?? 0,
      sub: `${formatNumber(m?.automation_runs_today ?? 0)} today`,
      icon: Zap,
      iconColor: "text-pink-500",
      iconBg: "bg-pink-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            System Health & Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time platform performance and activity monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>


      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className="bg-white border-slate-200 shadow-sm">
              <CardContent className="pt-0 pb-0">
                {isLoading ? (
                  <div className="space-y-3">
                    <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                    <div className="h-8 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {kpi.title}
                      </p>
                      <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                        <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight">
                      {formatNumber(kpi.value)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Volume Chart */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Message Volume
            </CardTitle>
            <CardDescription className="text-slate-500">
              Messages processed per day (last 30 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[280px] animate-pulse rounded bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data?.message_volume ?? []}>
                  <defs>
                    <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#25D366"
                    strokeWidth={2.5}
                    fill="url(#msgGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#25D366", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Signups Chart (reuse growth API) */}
        <SignupsChart />
      </div>

      {/* Bottom Row: Activity Feed + Table Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Recent Activity
            </CardTitle>
            <CardDescription className="text-slate-500">
              Latest platform events across all accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto pr-2 -mr-2 space-y-1">
                {(data?.activity_feed ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No recent activity to display.
                  </p>
                ) : (
                  (data?.activity_feed ?? []).map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="mt-0.5 p-1.5 rounded-full bg-slate-100 flex-shrink-0">
                        {activityIcon(entry.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 leading-snug truncate">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${activityBadgeColor(entry.type)}`}
                          >
                            {entry.type.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {entry.account_name}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 mt-1">
                        {relativeTime(entry.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Table Stats */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-500" />
              Database Tables
            </CardTitle>
            <CardDescription className="text-slate-500">
              Row counts for all core tables
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[400px] animate-pulse rounded bg-slate-100" />
            ) : (
              <div className="max-h-[400px] overflow-y-auto pr-2 -mr-2">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-4">
                        Table
                      </th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-4">
                        Rows
                      </th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.table_stats ?? [])
                      .sort((a: TableStat, b: TableStat) => b.row_count - a.row_count)
                      .map((t: TableStat) => (
                        <tr
                          key={t.table_name}
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="py-2 pr-4">
                            <code className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {t.table_name}
                            </code>
                          </td>
                          <td className="text-right py-2 pr-4">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">
                              {t.row_count.toLocaleString()}
                            </span>
                          </td>
                          <td className="text-right py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="h-2 w-2 rounded-full bg-emerald-400" />
                              <span className="text-[10px] text-emerald-600 font-medium">OK</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Signups Chart (reuses existing /api/super-admin/growth)
// ────────────────────────────────────────────────────────────

function SignupsChart() {
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchGrowth() {
      try {
        const res = await fetch("/api/super-admin/growth?days=30");
        if (!res.ok) return;
        const json = await res.json();
        setGrowthData(json.growth ?? []);
      } catch {
        // Silently fail - this chart is supplementary
      } finally {
        setIsLoading(false);
      }
    }
    fetchGrowth();
  }, []);

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-500" />
          Account Signups
        </CardTitle>
        <CardDescription className="text-slate-500">
          New accounts created per day (last 30 days)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[280px] animate-pulse rounded bg-slate-100" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="new_accounts"
                fill="#0F172A"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
