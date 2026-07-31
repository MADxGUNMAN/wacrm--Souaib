"use server";

import { supabaseAdmin } from "@/lib/auth/admin-client";
import { revalidatePath } from "next/cache";

export async function updateSiteSettings(data: {
  site_name: string;
  tagline: string;
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  canonical_url: string;
  no_index: boolean;
  json_ld_schema: string;
  support_email: string;
  copyright_text: string;
}) {
  const admin = supabaseAdmin();

  // The site_settings table is meant to be a singleton, so we update the first row
  const { data: current } = await admin
    .from("site_settings")
    .select("id")
    .limit(1)
    .single();

  if (!current) {
    // If it doesn't exist, insert
    const { error } = await admin.from("site_settings").insert([data]);
    if (error) {
      console.error("[cms] updateSiteSettings insert error:", error);
      return { error: error.message };
    }
  } else {
    // Update existing
    const { error } = await admin
      .from("site_settings")
      .update(data)
      .eq("id", current.id);
    if (error) {
      console.error("[cms] updateSiteSettings update error:", error);
      return { error: error.message };
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/super-admin/cms", "layout");
  return { success: true };
}
