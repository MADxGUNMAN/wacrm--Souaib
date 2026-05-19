import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

/** Verify the caller is an admin. */
async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 }) };
  }

  return { user, profile };
}

// ─── PATCH /api/vendors/[id] ────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const { full_name, email, permissions, is_active, password } = body;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the vendor's user_id to update auth record
  const { data: vendor } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("id", id)
    .eq("role", "vendor")
    .single();

  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  // Update auth user if email or password changed
  const authUpdates: Record<string, unknown> = {};
  if (email) authUpdates.email = email;
  if (password) authUpdates.password = password;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      vendor.user_id,
      authUpdates
    );
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  // Build profile updates
  const profileUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (full_name !== undefined) profileUpdates.full_name = full_name;
  if (email !== undefined) profileUpdates.email = email;
  if (permissions !== undefined) profileUpdates.permissions = permissions;
  if (is_active !== undefined) profileUpdates.is_active = is_active;

  const { data, error } = await adminClient
    .from("profiles")
    .update(profileUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ─── DELETE /api/vendors/[id] ───────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the vendor
  const { data: vendor } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("id", id)
    .eq("role", "vendor")
    .single();

  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  // Unassign all conversations from this vendor
  await adminClient
    .from("conversations")
    .update({ assigned_agent_id: null })
    .eq("assigned_agent_id", id);

  // Delete the profile
  await adminClient.from("profiles").delete().eq("id", id);

  // Delete the auth user
  await adminClient.auth.admin.deleteUser(vendor.user_id);

  return NextResponse.json({ success: true });
}
