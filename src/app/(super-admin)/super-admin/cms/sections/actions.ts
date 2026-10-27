"use server";

import { supabaseAdmin } from "@/lib/auth/admin-client";
import { revalidatePath } from "next/cache";
import { requireSuperAdminAction } from "@/lib/super-admin/action-guard";

export async function updateLandingSection(
  id: string,
  data: {
    title?: string;
    subtitle?: string | null;
    body_text?: string | null;
    cta_primary_text?: string | null;
    cta_primary_link?: string | null;
    cta_secondary_text?: string | null;
    cta_secondary_link?: string | null;
    image_url?: string | null;
    images?: string[];
    images_secondary?: string[];
    is_visible?: boolean;
    style_variant?: string;
    extra_data?: Record<string, unknown>;
  }
) {
  const guard = await requireSuperAdminAction();
  if (!guard.ok) return { error: guard.error };

  const admin = supabaseAdmin();

  const { error } = await admin
    .from("landing_sections")
    .update(data)
    .eq("id", id);

  if (error) {
    console.error("[cms] updateLandingSection error:", error);
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/super-admin/cms/sections", "page");
  return { success: true };
}
