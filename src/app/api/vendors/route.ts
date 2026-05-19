import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { VendorPermissions } from "@/types";

const DEFAULT_VENDOR_PERMISSIONS: VendorPermissions = {
  inbox: true,
  dashboard: false,
  contacts: false,
  pipelines: false,
  broadcasts: false,
  automations: false,
  settings: true,
};

/** Verify the caller is an admin. Returns the admin's profile or a Response error. */
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

// ─── GET /api/vendors ───────────────────────────────────────────
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, avatar_url, role, permissions, is_active, created_at, updated_at")
    .eq("role", "vendor")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For each vendor, count their assigned conversations
  const vendorsWithStats = await Promise.all(
    (data ?? []).map(async (vendor) => {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("assigned_agent_id", vendor.id);

      return {
        ...vendor,
        assigned_conversations_count: count ?? 0,
      };
    })
  );

  return NextResponse.json(vendorsWithStats);
}

// ─── POST /api/vendors ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { full_name, email, password, permissions } = body as {
    full_name: string;
    email: string;
    password: string;
    permissions?: Partial<VendorPermissions>;
  };

  if (!full_name || !email || !password) {
    return NextResponse.json(
      { error: "full_name, email, and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  // Use the service-role client to create the auth user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1) Create the auth user
  const { data: newUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm so the vendor can login immediately
      user_metadata: { full_name },
    });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // 2) Insert vendor profile
  const vendorPermissions = {
    ...DEFAULT_VENDOR_PERMISSIONS,
    ...(permissions ?? {}),
  };

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .upsert(
      {
        user_id: newUser.user.id,
        full_name,
        email,
        role: "vendor",
        permissions: vendorPermissions,
        is_active: true,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (profileError) {
    // Rollback: delete the auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json(profile, { status: 201 });
}
