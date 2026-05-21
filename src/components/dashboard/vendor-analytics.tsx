"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { Skeleton } from "@/components/dashboard/skeleton"
import { cn } from "@/lib/utils"

/* ─── Types ─────────────────────────────────────────────────────── */

interface VendorWithStats {
  id: string
  user_id: string
  full_name: string
  email: string
  avatar_url?: string
  role: string
  permissions: {
    inbox: boolean
    dashboard: boolean
    contacts: boolean
    pipelines: boolean
    broadcasts: boolean
    automations: boolean
    settings: boolean
  }
  is_active: boolean
  created_at: string
  assigned_conversations_count: number
}

interface AssignedConversation {
  id: string
  contact_name: string | null
  contact_phone: string
  status: string
  last_message_text: string | null
  last_message_at: string | null
  unread_count: number
}

type SortKey = "name" | "conversations" | "status" | "date"
type SortDir = "asc" | "desc"
type StatusFilter = "all" | "active" | "suspended"

/* ─── Helpers ───────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2_592_000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const PERMISSION_LABELS: Record<string, string> = {
  inbox: "Inbox",
  dashboard: "Dashboard",
  contacts: "Contacts",
  pipelines: "Pipelines",
  broadcasts: "Broadcasts",
  automations: "Automations",
  settings: "Settings",
}

/* ─── Main Component ────────────────────────────────────────────── */

export function VendorAnalyticsCard() {
  const { isAdmin } = useAuth()
  const [vendors, setVendors] = useState<VendorWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("conversations")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Record<string, AssignedConversation[]>>({})
  const [convLoading, setConvLoading] = useState<string | null>(null)

  // Only admins see this card
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    fetch("/api/vendors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load vendors")
        return res.json()
      })
      .then((data: VendorWithStats[]) => setVendors(data))
      .catch((err) => console.error("[vendor-analytics] failed:", err))
      .finally(() => setLoading(false))
  }, [isAdmin])

  // Load conversations for a vendor when expanded
  const loadConversations = useCallback(
    async (vendorId: string) => {
      if (conversations[vendorId]) return
      setConvLoading(vendorId)
      try {
        const db = createClient()
        const { data, error } = await db
          .from("conversations")
          .select("id, status, last_message_text, last_message_at, unread_count, contact:contacts(name, phone)")
          .eq("assigned_agent_id", vendorId)
          .order("last_message_at", { ascending: false })
          .limit(20)

        if (error) throw error

        const mapped: AssignedConversation[] = (data ?? []).map((c: any) => ({
          id: c.id,
          contact_name: c.contact?.name ?? null,
          contact_phone: c.contact?.phone ?? "",
          status: c.status,
          last_message_text: c.last_message_text,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count ?? 0,
        }))
        setConversations((prev) => ({ ...prev, [vendorId]: mapped }))
      } catch (err) {
        console.error("[vendor-analytics] conversations load failed:", err)
      } finally {
        setConvLoading(null)
      }
    },
    [conversations],
  )

  const toggleExpand = useCallback(
    (vendorId: string) => {
      if (expandedVendorId === vendorId) {
        setExpandedVendorId(null)
      } else {
        setExpandedVendorId(vendorId)
        loadConversations(vendorId)
      }
    },
    [expandedVendorId, loadConversations],
  )

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortKey(key)
        setSortDir(key === "name" ? "asc" : "desc")
      }
    },
    [sortKey],
  )

  // Filtered + sorted vendors
  const filteredVendors = useMemo(() => {
    let result = [...vendors]

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (v) =>
          v.full_name.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q),
      )
    }

    // Status filter
    if (statusFilter === "active") result = result.filter((v) => v.is_active)
    if (statusFilter === "suspended") result = result.filter((v) => !v.is_active)

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name":
          cmp = a.full_name.localeCompare(b.full_name)
          break
        case "conversations":
          cmp = a.assigned_conversations_count - b.assigned_conversations_count
          break
        case "status":
          cmp = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)
          break
        case "date":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return result
  }, [vendors, searchQuery, statusFilter, sortKey, sortDir])

  // Summary stats
  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.is_active).length
    const suspended = vendors.filter((v) => !v.is_active).length
    const totalConversations = vendors.reduce((sum, v) => sum + v.assigned_conversations_count, 0)
    const avgConversations = vendors.length > 0 ? Math.round(totalConversations / vendors.length) : 0
    return { total: vendors.length, active, suspended, totalConversations, avgConversations }
  }, [vendors])

  if (!isAdmin) return null

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 border border-slate-200/60">
              <Users className="h-4.5 w-4.5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Vendor Analytics</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Comprehensive overview of vendor assignments, conversations, and permissions
              </p>
            </div>
          </div>
        </div>

        {/* Summary stat pills */}
        {!loading && vendors.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            <StatPill label="Total Vendors" value={stats.total} icon={Users} />
            <StatPill label="Active" value={stats.active} icon={UserCheck} color="emerald" />
            <StatPill label="Suspended" value={stats.suspended} icon={UserX} color="red" />
            <StatPill label="Total Assigned Chats" value={stats.totalConversations} icon={MessageSquare} color="blue" />
            <StatPill label="Avg per Vendor" value={stats.avgConversations} icon={ArrowUpDown} color="amber" />
          </div>
        )}
      </header>

      {/* Filters bar */}
      {!loading && vendors.length > 0 && (
        <div className="flex flex-col gap-3 border-b border-border px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vendors by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/20 transition-colors"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Status:</span>
            {(["all", "active", "suspended"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  statusFilter === f
                    ? "bg-slate-800 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
            <Users className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-foreground">No vendors found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
            Create vendor profiles in Settings to start assigning conversations.
          </p>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
            <SortableHeader
              label="Vendor"
              sortKey="name"
              currentKey={sortKey}
              dir={sortDir}
              onClick={handleSort}
              className="col-span-4"
            />
            <SortableHeader
              label="Assigned Chats"
              sortKey="conversations"
              currentKey={sortKey}
              dir={sortDir}
              onClick={handleSort}
              className="col-span-2"
            />
            <SortableHeader
              label="Status"
              sortKey="status"
              currentKey={sortKey}
              dir={sortDir}
              onClick={handleSort}
              className="col-span-2"
            />
            <SortableHeader
              label="Created"
              sortKey="date"
              currentKey={sortKey}
              dir={sortDir}
              onClick={handleSort}
              className="col-span-2"
            />
            <div className="col-span-2 text-right">Details</div>
          </div>

          {/* Vendor rows */}
          <div className="divide-y divide-border">
            {filteredVendors.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No vendors match your filters
              </div>
            ) : (
              filteredVendors.map((vendor) => (
                <VendorRow
                  key={vendor.id}
                  vendor={vendor}
                  isExpanded={expandedVendorId === vendor.id}
                  onToggle={() => toggleExpand(vendor.id)}
                  conversations={conversations[vendor.id]}
                  convLoading={convLoading === vendor.id}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
            Showing {filteredVendors.length} of {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}
          </footer>
        </>
      )}
    </section>
  )
}

/* ─── Sub-components ────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  icon: Icon,
  color = "slate",
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color?: "slate" | "emerald" | "red" | "blue" | "amber"
}) {
  const colorMap = {
    slate: "bg-slate-50 border-slate-200/60 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200/60 text-emerald-700",
    red: "bg-red-50 border-red-200/60 text-red-700",
    blue: "bg-blue-50 border-blue-200/60 text-blue-700",
    amber: "bg-amber-50 border-amber-200/60 text-amber-700",
  }
  const iconColorMap = {
    slate: "text-slate-500",
    emerald: "text-emerald-500",
    red: "text-red-500",
    blue: "text-blue-500",
    amber: "text-amber-500",
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", colorMap[color])}>
      <Icon className={cn("h-3.5 w-3.5", iconColorMap[color])} />
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold tabular-nums">{value}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
    </div>
  )
}

function SortableHeader({
  label,
  sortKey: key,
  currentKey,
  dir,
  onClick,
  className,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: SortDir
  onClick: (key: SortKey) => void
  className?: string
}) {
  const isActive = currentKey === key
  return (
    <button
      type="button"
      onClick={() => onClick(key)}
      className={cn(
        "flex items-center gap-1 text-left transition-colors hover:text-foreground",
        isActive && "text-foreground",
        className,
      )}
    >
      {label}
      {isActive ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

function VendorRow({
  vendor,
  isExpanded,
  onToggle,
  conversations,
  convLoading,
}: {
  vendor: VendorWithStats
  isExpanded: boolean
  onToggle: () => void
  conversations?: AssignedConversation[]
  convLoading: boolean
}) {
  const initials = vendor.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className={cn("transition-colors", isExpanded && "bg-muted/20")}>
      {/* Main row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-6 py-3.5 hover:bg-muted/30 transition-colors"
      >
        {/* Mobile layout */}
        <div className="sm:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200/60 text-xs font-bold text-slate-600">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{vendor.full_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{vendor.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {vendor.assigned_conversations_count} {vendor.assigned_conversations_count === 1 ? "chat" : "chats"}
              </span>
              <StatusBadge isActive={vendor.is_active} />
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
              />
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
          <div className="col-span-4 flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200/60 text-[11px] font-bold text-slate-600">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{vendor.full_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{vendor.email}</p>
            </div>
          </div>
          <div className="col-span-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              {vendor.assigned_conversations_count}
            </span>
          </div>
          <div className="col-span-2">
            <StatusBadge isActive={vendor.is_active} />
          </div>
          <div className="col-span-2 text-xs text-muted-foreground">
            {formatDate(vendor.created_at)}
          </div>
          <div className="col-span-2 flex justify-end">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Eye className="h-3.5 w-3.5" />
              {isExpanded ? "Hide" : "View"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
              />
            </span>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/60 px-6 py-4 bg-muted/10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Permissions */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Permissions
              </h4>
              <div className="grid grid-cols-2 gap-1.5">
                {vendor.permissions &&
                  Object.entries(vendor.permissions).map(([key, allowed]) => (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                        allowed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-slate-50 text-slate-400 border border-slate-100",
                      )}
                    >
                      {allowed ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <X className="h-3 w-3 text-slate-300" />
                      )}
                      {PERMISSION_LABELS[key] || key}
                    </div>
                  ))}
              </div>
            </div>

            {/* Vendor info */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Vendor Details
              </h4>
              <div className="space-y-2.5">
                <InfoRow icon={Mail} label="Email" value={vendor.email} />
                <InfoRow icon={Calendar} label="Joined" value={formatDate(vendor.created_at)} />
                <InfoRow
                  icon={MessageSquare}
                  label="Assigned Chats"
                  value={`${vendor.assigned_conversations_count} conversation${vendor.assigned_conversations_count !== 1 ? "s" : ""}`}
                />
                <InfoRow
                  icon={vendor.is_active ? UserCheck : UserX}
                  label="Status"
                  value={vendor.is_active ? "Active" : "Suspended"}
                  valueClassName={vendor.is_active ? "text-emerald-600" : "text-red-600"}
                />
              </div>
            </div>

            {/* Assigned conversations */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Assigned Conversations
              </h4>
              {convLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !conversations || conversations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background/50 py-5 text-center">
                  <MessageSquare className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No conversations assigned</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-foreground truncate">
                            {conv.contact_name || conv.contact_phone}
                          </p>
                          {conv.unread_count > 0 && (
                            <span className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        {conv.last_message_text && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5 max-w-[180px]">
                            {conv.last_message_text}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <ConversationStatusBadge status={conv.status} />
                        {conv.last_message_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {relativeTime(conv.last_message_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border",
        isActive
          ? "bg-emerald-50 border-emerald-200/60 text-emerald-700"
          : "bg-red-50 border-red-200/60 text-red-700",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-red-500")} />
      {isActive ? "Active" : "Suspended"}
    </span>
  )
}

function ConversationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-emerald-50 border-emerald-100 text-emerald-700",
    pending: "bg-amber-50 border-amber-100 text-amber-700",
    closed: "bg-slate-50 border-slate-200 text-slate-500",
  }
  return (
    <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold capitalize", styles[status] ?? styles.closed)}>
      {status}
    </span>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
        <p className={cn("text-xs font-medium text-foreground truncate", valueClassName)}>{value}</p>
      </div>
    </div>
  )
}
