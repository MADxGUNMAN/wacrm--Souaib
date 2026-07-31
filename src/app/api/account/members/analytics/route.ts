// ============================================================
// GET /api/account/members/analytics
//
// Fetches data for the Members Analytics dashboard card.
// Only the account owner is allowed to access this endpoint.
// Returns members with their assigned conversation counts.
// ============================================================

import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    if (ctx.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden — owner only" },
        { status: 403 }
      );
    }

    const { data: profiles, error: profileError } = await ctx.supabase
      .from("profiles")
      .select("id, user_id, full_name, email, avatar_url, account_role, permissions, is_active, created_at")
      .eq("account_id", ctx.accountId)
      .eq("account_role", "member")
      .order("created_at", { ascending: false });

    if (profileError) {
      console.error("[GET /api/account/members/analytics] profile fetch error:", profileError);
      return NextResponse.json(
        { error: "Failed to load members analytics" },
        { status: 500 }
      );
    }

    // For each member, count their assigned conversations
    const membersWithStats = await Promise.all(
      (profiles ?? []).map(async (member) => {
        const { count, error: countError } = await ctx.supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("account_id", ctx.accountId)
          .eq("assigned_agent_id", member.user_id);

        if (countError) {
          console.warn(`[analytics] count error for user ${member.user_id}:`, countError);
        }

        return {
          ...member,
          assigned_conversations_count: count ?? 0,
        };
      })
    );

    return NextResponse.json(membersWithStats);
  } catch (err: any) {
    return toErrorResponse(err);
  }
}
