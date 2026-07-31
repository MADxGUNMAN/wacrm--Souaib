"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Clock,
  Contact,
  Megaphone,
  Zap,
  Wifi,
  WifiOff,
  ShieldBan,
  DollarSign,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import type { PlatformMetrics, SignupDataPoint } from "@/types/super-admin";
import type { MessageVolumePoint } from "@/types/super-admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

function relativeTime(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip
// ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-slate-500 mb-0.5">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Dashboard
// ────────────────────────────────────────────────────────────

export default function SuperAdminDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [growth, setGrowth] = useState<SignupDataPoint[]>([]);
  const [msgVolume, setMsgVolume] = useState<MessageVolumePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const [metricsRes, growthRes, healthRes] = await Promise.all([
        fetch("/api/super-admin/metrics"),
        fetch("/api/super-admin/growth?days=30"),
        fetch("/api/super-admin/health"),
      ]);

      if (!metricsRes.ok) throw new Error("Failed to fetch metrics");

      const metricsData = await metricsRes.json();
      setMetrics(metricsData.metrics);

      if (growthRes.ok) {
        const growthData = await growthRes.json();
        setGrowth(growthData.growth ?? []);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setMsgVolume(healthData.data?.message_volume ?? []);
      }

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
    fetchAll();
    const interval = setInterval(() => fetchAll(), 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (error && !metrics) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-red-400">
        <AlertCircle className="mr-2 h-5 w-5" />
        Failed to load metrics. Ensure you have super admin access.
      </div>
    );
  }

  const m = metrics;

  // ──────────────────────────────────────────────────────────
  // KPI Cards
  // ──────────────────────────────────────────────────────────
  const kpis = [
    {
      title: "Total Accounts",
      value: m?.total_accounts ?? 0,
      change: m?.new_accounts_30d ?? 0,
      changeLabel: "this month",
      icon: Building2,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      title: "Total Users",
      value: m?.total_users ?? 0,
      change: m?.active_7d ?? 0,
      changeLabel: "active 7d",
      icon: Users,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50",
    },
    {
      title: "Messages (7d)",
      value: m?.messages_7d ?? 0,
      change: m?.messages_today ?? 0,
      changeLabel: "today",
      icon: MessageSquare,
      iconColor: "text-violet-500",
      iconBg: "bg-violet-50",
    },
    {
      title: "Contacts",
      value: m?.total_contacts ?? 0,
      change: null,
      changeLabel: "across all accounts",
      icon: Contact,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
    },
    {
      title: "Broadcasts",
      value: m?.total_broadcasts ?? 0,
      change: null,
      changeLabel: "campaigns sent",
      icon: Megaphone,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      title: "Automations",
      value: m?.total_automations ?? 0,
      change: null,
      changeLabel: "active workflows",
      icon: Zap,
      iconColor: "text-pink-500",
      iconBg: "bg-pink-50",
    },
  ];

  // ──────────────────────────────────────────────────────────
  // Platform Health Stats
  // ──────────────────────────────────────────────────────────
  const healthItems = [
    {
      label: "Connected WABA",
      value: m?.connected_whatsapp ?? 0,
      icon: Wifi,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      label: "Disconnected WABA",
      value: m?.disconnected_whatsapp ?? 0,
      icon: WifiOff,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "Banned Accounts",
      value: m?.banned_accounts ?? 0,
      icon: ShieldBan,
      color: "text-red-500",
      bg: "bg-red-50",
    },
    {
      label: "Deals Pipeline",
      value: m?.total_deals_value ?? 0,
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
      isCurrency: true,
    },
  ];

  // ──────────────────────────────────────────────────────────
  // Quick Stats
  // ──────────────────────────────────────────────────────────
  const quickStats = [
    { label: "Active Today", value: m?.active_today ?? 0, icon: Zap },
    { label: "Active 7d", value: m?.active_7d ?? 0, icon: CalendarDays },
    { label: "Active 30d", value: m?.active_30d ?? 0, icon: TrendingUp },
    { label: "New Today", value: m?.new_accounts_today ?? 0, icon: UserPlus },
    { label: "New 7d", value: m?.new_accounts_7d ?? 0, icon: UserPlus },
    { label: "New 30d", value: m?.new_accounts_30d ?? 0, icon: UserPlus },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time overview of your Replai platform
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Removed last updated timestamp */}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAll(true)}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.title}
              className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <CardContent className="pt-0 pb-0">
                {isLoading ? (
                  <div className="space-y-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="h-7 w-12 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                        {kpi.title}
                      </span>
                      <div className={`p-1.5 rounded-lg ${kpi.iconBg}`}>
                        <Icon className={`h-3.5 w-3.5 ${kpi.iconColor}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight">
                      {formatNum(kpi.value)}
                    </p>
                    <div className="mt-1 flex items-center text-xs text-slate-500">
                      {kpi.change !== null ? (
                        <>
                          <TrendingUp className="mr-1 h-3 w-3 text-primary" />
                          <span className="text-primary font-semibold mr-1">
                            +{formatNum(kpi.change)}
                          </span>
                          {kpi.changeLabel}
                        </>
                      ) : (
                        <span>{kpi.changeLabel}</span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Growth Chart */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Account Growth
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              New accounts & users per day (30 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[260px] animate-pulse rounded bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={growth}>
                  <defs>
                    <linearGradient id="gradAccounts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="new_accounts"
                    name="Accounts"
                    stroke="#25D366"
                    strokeWidth={2}
                    fill="url(#gradAccounts)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: "#25D366",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="new_users"
                    name="Users"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradUsers)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: "#3b82f6",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Message Volume Chart */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-500" />
              Message Volume
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Messages per day across all accounts (30 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[260px] animate-pulse rounded bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={msgVolume}>
                  <defs>
                    <linearGradient id="gradMsg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Messages"
                    fill="url(#gradMsg)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Platform Health + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Platform Health */}
        <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Platform Health
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              WhatsApp connections, bans & pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {healthItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-100"
                    >
                      <div className={`p-2 rounded-lg ${item.bg}`}>
                        <Icon className={`h-4 w-4 ${item.color}`} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 flex-1">
                        {item.label}
                      </span>
                      <span className={`text-lg font-bold tabular-nums ${item.color}`}>
                        {item.isCurrency
                          ? `$${formatNum(item.value)}`
                          : formatNum(item.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats Grid */}
        <Card className="lg:col-span-3 bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Quick Stats
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Activity & growth at a glance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {quickStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-slate-400 mb-1.5" />
                      <p className="text-xl font-bold text-slate-900 tabular-nums">
                        {formatNum(stat.value)}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5 text-center">
                        {stat.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
