// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. The owner sees all
// members; members see the roster too (for UI like the assign
// dropdown in inbox).
//
// Field visibility
//   Sensitive fields (email) are returned only to the owner.
//   Members see name + avatar + role + joined date only.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { normalizeRole } from "@/lib/auth/roles";
import type { AccountMember, MemberPermissions } from "@/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  permissions: MemberPermissions | null;
  is_active: boolean;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    let { data, error } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, account_role, permissions, is_active, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    // Fallback for when migration 039 hasn't been applied yet or PostgREST schema cache is stale
    if (error) {
      const fallback = await ctx.supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url, account_role, permissions, created_at")
        .eq("account_id", ctx.accountId)
        .order("created_at", { ascending: true });
      if (!fallback.error && fallback.data) {
        data = fallback.data.map((row: Omit<ProfileRow, "is_active">) => ({ ...row, is_active: true })) as ProfileRow[];
        error = null;
      }
    }

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const isOwner = ctx.role === "owner";

    const members: AccountMember[] = (data as ProfileRow[]).map((row) => {
      return {
        user_id: row.user_id,
        full_name: row.full_name ?? "",
        email: isOwner ? row.email : null,
        avatar_url: row.avatar_url,
        // Normalize legacy roles (admin/agent/viewer) into 'member'
        role: normalizeRole(row.account_role),
        permissions: row.permissions ?? null,
        is_active: row.is_active ?? true,
        joined_at: row.created_at,
      };
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
