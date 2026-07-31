import { NextRequest, NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/account";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await getCurrentAccount();

    if (ctx.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden — owner only" },
        { status: 403 }
      );
    }

    const { userId } = await params;
    const body = await request.json();

    if (typeof body.is_active !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid is_active field" },
        { status: 400 }
      );
    }

    const { error } = await ctx.supabase.rpc("set_member_status", {
      p_user_id: userId,
      p_is_active: body.is_active,
    });

    if (error) {
      console.error("[PATCH /api/account/members/[userId]/status] RPC error:", error);
      
      // Map RPC exception codes to HTTP status if possible
      if (error.code === "42501") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.code === "22023") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Failed to update member status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PATCH /api/account/members/[userId]/status] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
