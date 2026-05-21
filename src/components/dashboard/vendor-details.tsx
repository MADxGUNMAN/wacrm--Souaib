"use client"

import { useEffect, useState } from "react"
import { Shield, Users, MessageSquare, Check, X, AlertTriangle } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { Skeleton } from "@/components/dashboard/skeleton"

interface VendorProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: {
    inbox: boolean;
    dashboard: boolean;
    contacts: boolean;
    pipelines: boolean;
    broadcasts: boolean;
    automations: boolean;
    settings: boolean;
  };
  is_active: boolean;
  created_at: string;
  assigned_conversations_count: number;
}

export function VendorDetailsCard() {
  const { isAdmin, isVendor, profile } = useAuth()
  const [vendors, setVendors] = useState<VendorProfile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [assignedCount, setAssignedCount] = useState<number | null>(null)

  // Fetch all vendors if admin
  useEffect(() => {
    if (!isAdmin) return
    setLoading(true)
    fetch("/api/vendors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load vendors")
        return res.json()
      })
      .then((data) => setVendors(data))
      .catch((err) => console.error("[dashboard] failed to load vendors:", err))
      .finally(() => setLoading(false))
  }, [isAdmin])

  // Fetch assigned conversations count if vendor
  useEffect(() => {
    if (!isVendor || !profile?.id) return
    const db = createClient()
    db.from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("assigned_agent_id", profile.id)
      .then(({ count, error }) => {
        if (error) console.error("[dashboard] failed to fetch assigned count:", error)
        else setAssignedCount(count ?? 0)
      })
  }, [isVendor, profile?.id])

  if (!isAdmin && !isVendor) {
    return null // Hide for standard 'user' role without vendor/admin configuration
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-5 tech-border shadow-sm flex flex-col h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAdmin ? "System Vendor Registry" : "Vendor Node Telemetry"}
          </h2>
        </div>
        <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary">
          {isAdmin ? "[SYS_VENDORS]" : "[VENDOR_MODE]"}
        </span>
      </div>

      {/* Admin Mode - Vendor Registry */}
      {isAdmin && (
        <div className="flex-1 flex flex-col justify-between">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !vendors || vendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-border rounded-md bg-background/20">
              <Users className="h-8 w-8 text-slate-600 mb-2" />
              <p className="font-mono text-xs text-muted-foreground uppercase">[NO_VENDORS_PROVISIONED]</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px]">
                Create vendor profiles in system settings to delegate conversation assignments.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between p-2.5 rounded border border-border/60 bg-background/20 hover:bg-background/40 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-medium text-foreground truncate">{vendor.full_name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{vendor.email}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      [{vendor.assigned_conversations_count}_CONVS]
                    </span>
                    <span
                      className={`font-mono text-[9px] px-1 py-0.5 rounded border ${
                        vendor.is_active
                          ? "border-primary/20 bg-primary/5 text-primary"
                          : "border-red-500/20 bg-red-500/5 text-red-600"
                      }`}
                    >
                      {vendor.is_active ? "ACTIVE" : "SUSPENDED"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vendor Mode - My Credentials & Privileges */}
      {isVendor && profile && (
        <div className="flex-1 space-y-4">
          {/* Active Vendor Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded border border-border/60 bg-background/20">
              <p className="font-heading text-[10px] text-muted-foreground uppercase tracking-wider">Node Operator</p>
              <p className="text-sm font-bold text-foreground truncate mt-1">{profile.full_name}</p>
            </div>
            <div className="p-3 rounded border border-border/60 bg-background/20">
              <p className="font-heading text-[10px] text-muted-foreground uppercase tracking-wider">Assigned Inbox</p>
              <p className="font-mono text-sm font-bold text-primary mt-1">
                {assignedCount !== null ? `[${assignedCount}_CONVS]` : "[-]"}
              </p>
            </div>
          </div>

          {/* Permissions / Privileges list */}
          <div className="space-y-2">
            <p className="font-heading text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/60 pb-1.5">
              Access Permissions
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {profile.permissions &&
                Object.entries(profile.permissions).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/10 p-1.5 rounded border border-border/40"
                  >
                    {value ? (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="uppercase tracking-wider text-[10px]">{key}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
