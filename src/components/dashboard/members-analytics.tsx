"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  MessageSquare,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Filter,
  UserCheck,
  UserX,
  Shield,
  Eye,
  Mail,
  Phone,
  Calendar,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/dashboard/skeleton";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/* ─── Types ─────────────────────────────────────────────────────── */

interface MemberWithStats {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string;
  account_role: string;
  permissions: {
    inbox: boolean;
    dashboard: boolean;
    contacts: boolean;
    pipelines: boolean;
    broadcasts: boolean;
    automations: boolean;
    settings: boolean;
  } | null;
  is_active: boolean;
  created_at: string;
  assigned_conversations_count: number;
}

interface AssignedConversation {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  status: string;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
}

type SortKey = "name" | "conversations" | "status" | "date";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "suspended";

/* ─── Helpers ───────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2_592_000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PERMISSION_LABELS: Record<string, string> = {
  inbox: "Inbox",
  dashboard: "Dashboard",
  contacts: "Contacts",
  pipelines: "Pipelines",
  broadcasts: "Broadcasts",
  automations: "Automations",
  settings: "Settings",
};

/* ─── Main Component ────────────────────────────────────────────── */

export function MembersAnalyticsCard() {
  const { isOwner } = useAuth();
  const t = useTranslations("Dashboard.membersAnalytics");
  const [members, setMembers] = useState<MemberWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("conversations");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, AssignedConversation[]>>({});
  const [convLoading, setConvLoading] = useState<string | null>(null);

  // Only owners see this card
  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    fetch("/api/account/members/analytics")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load members analytics");
        return res.json();
      })
      .then((data: MemberWithStats[]) => setMembers(data))
      .catch((err) => console.error("[members-analytics] failed:", err))
      .finally(() => setLoading(false));
  }, [isOwner]);

  // Load conversations for a member when expanded
  const loadConversations = useCallback(
    async (memberUserId: string) => {
      if (conversations[memberUserId]) return;
      setConvLoading(memberUserId);
      try {
        const db = createClient();
        const { data, error } = await db
          .from("conversations")
          .select("id, status, last_message_text, last_message_at, unread_count, contact:contacts(name, phone)")
          .eq("assigned_agent_id", memberUserId)
          .order("last_message_at", { ascending: false })
          .limit(20);

        if (error) throw error;

        const mapped: AssignedConversation[] = (data ?? []).map((c: any) => ({
          id: c.id,
          contact_name: c.contact?.name ?? null,
          contact_phone: c.contact?.phone ?? "",
          status: c.status,
          last_message_text: c.last_message_text,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count ?? 0,
        }));
        setConversations((prev) => ({ ...prev, [memberUserId]: mapped }));
      } catch (err) {
        console.error("Failed to load member conversations", err);
      } finally {
        setConvLoading(null);
      }
    },
    [conversations]
  );

  const toggleExpand = useCallback(
    (memberUserId: string) => {
      if (expandedMemberId === memberUserId) {
        setExpandedMemberId(null);
      } else {
        setExpandedMemberId(memberUserId);
        loadConversations(memberUserId);
      }
    },
    [expandedMemberId, loadConversations]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (m.full_name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && m.is_active) ||
        (statusFilter === "suspended" && !m.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [members, searchQuery, statusFilter]);

  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return (a.full_name || "").localeCompare(b.full_name || "") * dir;
        case "conversations":
          return (a.assigned_conversations_count - b.assigned_conversations_count) * dir;
        case "status":
          return (Number(a.is_active) - Number(b.is_active)) * dir;
        case "date":
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        default:
          return 0;
      }
    });
  }, [filteredMembers, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.is_active).length;
    const suspended = total - active;
    const totalChats = members.reduce((sum, m) => sum + m.assigned_conversations_count, 0);
    const avgChats = total > 0 ? (totalChats / total).toFixed(1) : "0";

    return { total, active, suspended, totalChats, avgChats };
  }, [members]);

  if (!isOwner) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6 mb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 flex-1 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Metrics Row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Users className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("totalMembers")}
                </p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-emerald-500/5 p-3">
              <UserCheck className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t("active")}
                </p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.active}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-rose-500/5 p-3">
              <UserX className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {t("suspended")}
                </p>
                <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                  {stats.suspended}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-blue-500/5 p-3">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {t("totalAssignedChats")}
                </p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.totalChats}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-amber-500/5 p-3 sm:col-span-3 lg:col-span-1">
              <ArrowUpDown className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {t("avgPerMember")}
                </p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {stats.avgChats}
                </p>
              </div>
            </div>
          </div>

          {/* Filters Row */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-md border border-input bg-transparent py-2 pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("status")}:</span>
              <div className="flex rounded-md border border-border p-0.5">
                {(["all", "active", "suspended"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-medium transition-colors",
                      statusFilter === f
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {f === "all" ? t("statusAll") : f === "active" ? t("statusActive") : t("statusSuspended")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th
                    className="cursor-pointer px-4 py-3 font-medium transition-colors hover:text-foreground"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      {t("member")}
                      {sortKey === "name" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 font-medium transition-colors hover:text-foreground"
                    onClick={() => handleSort("conversations")}
                  >
                    <div className="flex items-center gap-1">
                      {t("assignedChats")}
                      {sortKey === "conversations" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 font-medium transition-colors hover:text-foreground"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      {t("status")}
                      {sortKey === "status" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 font-medium transition-colors hover:text-foreground"
                    onClick={() => handleSort("date")}
                  >
                    <div className="flex items-center gap-1">
                      {t("created")}
                      {sortKey === "date" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium text-right">{t("details")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      {searchQuery || statusFilter !== "all"
                        ? t("noMembersMatch")
                        : "No members available."}
                    </td>
                  </tr>
                ) : (
                  sortedMembers.map((member) => {
                    const isExpanded = expandedMemberId === member.user_id;
                    const memberConvs = conversations[member.user_id] || [];
                    const initial = (member.full_name || member.email || "M").charAt(0).toUpperCase();

                    return (
                      <React.Fragment key={member.id}>
                        {/* Main Row */}
                        <tr
                          className={cn(
                            "transition-colors hover:bg-muted/30",
                            isExpanded ? "bg-muted/30" : ""
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {member.avatar_url ? (
                                <img
                                  src={member.avatar_url}
                                  alt="avatar"
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {initial}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-foreground">
                                  {member.full_name || "Unnamed"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {member.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{member.assigned_conversations_count}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                                member.is_active
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              )}
                            >
                              <div
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  member.is_active ? "bg-emerald-500" : "bg-rose-500"
                                )}
                              />
                              {member.is_active ? t("statusActive") : t("statusSuspended")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatDate(member.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => toggleExpand(member.user_id)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Eye className="h-3 w-3" />
                              {t("view")}
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Details Panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="bg-muted/10 p-0">
                              <div className="animate-in slide-in-from-top-2 flex flex-col gap-6 p-4 sm:flex-row sm:p-6 lg:gap-8">
                                {/* Left Col: Permissions & Details */}
                                <div className="flex-shrink-0 sm:w-64">
                                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                    <Shield className="h-4 w-4 text-primary" />
                                    {t("permissions")}
                                  </h4>
                                  <div className="space-y-2">
                                    {member.permissions ? (
                                      Object.entries(member.permissions).map(([key, val]) => (
                                        <div key={key} className="flex items-center justify-between text-sm">
                                          <span className="text-muted-foreground capitalize">
                                            {PERMISSION_LABELS[key] || key}
                                          </span>
                                          {val ? (
                                            <Check className="h-4 w-4 text-emerald-500" />
                                          ) : (
                                            <X className="h-4 w-4 text-muted-foreground/50" />
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No permissions defined.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Right Col: Recent Chats */}
                                <div className="flex-1">
                                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                    <MessageSquare className="h-4 w-4 text-primary" />
                                    Recent Assigned Chats
                                  </h4>

                                  {convLoading === member.user_id ? (
                                    <div className="space-y-2">
                                      {Array.from({ length: 3 }).map((_, i) => (
                                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                                      ))}
                                    </div>
                                  ) : memberConvs.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                      No conversations assigned to this member yet.
                                    </div>
                                  ) : (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {memberConvs.map((conv) => (
                                        <div
                                          key={conv.id}
                                          className="flex flex-col gap-1 rounded-md border border-border bg-card p-3 shadow-sm"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="truncate text-sm font-medium">
                                              {conv.contact_name || conv.contact_phone || "Unknown Contact"}
                                            </span>
                                            {conv.unread_count > 0 && (
                                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                                                {conv.unread_count}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span className="truncate">
                                              {conv.last_message_text || "No message"}
                                            </span>
                                            <span className="shrink-0">
                                              {conv.last_message_at ? relativeTime(conv.last_message_at) : ""}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>{t("showingMembers", { count: sortedMembers.length, total: members.length })}</p>
          </div>
        </>
      )}
    </div>
  );
}
