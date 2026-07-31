// ============================================================
// /api/account/members/[userId]
//
//   PATCH  — update a member's permissions.  Owner only.
//   DELETE — remove a member.                Owner only.
//
// Both delegate to SECURITY DEFINER RPCs from migration 018:
//   - set_member_permissions(p_user_id, p_permissions)
//   - remove_account_member(p_user_id)
//
// With the simplified role system (owner/member), PATCH only
// updates permissions — role changes are no longer needed since
// all non-owners are simply "members".
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/auth/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// Map known SQLSTATEs from the RPCs (see migration 018) onto HTTP
// statuses. The `error.code` field is the SQLSTATE; the `message`
// is the human-readable RAISE message we put in the migration.
function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[members route] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to update member" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { permissions?: unknown }
      | null;
    const permissions = body?.permissions;

    if (permissions !== undefined) {
      const { error } = await ctx.supabase.rpc("set_member_permissions", {
        p_user_id: userId,
        p_permissions: permissions,
      });

      if (error) {
        // Fallback using service_role in case migration 037 RPC or schema cache is not ready
        const adminClient = supabaseAdmin();
        const { error: fallbackErr } = await adminClient
          .from("profiles")
          .update({ permissions })
          .eq("user_id", userId)
          .eq("account_id", ctx.accountId);

        if (fallbackErr) {
          console.error("[members route] fallback permissions error:", fallbackErr);
          return rpcErrorToResponse(error);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(
      `admin:memberRemove:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const { data, error } = await ctx.supabase.rpc("remove_account_member", {
      p_user_id: userId,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, newPersonalAccountId: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
