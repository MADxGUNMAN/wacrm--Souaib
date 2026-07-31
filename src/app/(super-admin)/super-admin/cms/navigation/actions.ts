"use server";

import { supabaseAdmin } from "@/lib/auth/admin-client";
import { revalidatePath } from "next/cache";
import type { NavLink, FooterColumn } from "@/types/super-admin";

export async function updateNavigationLinks(data: {
  header_links: NavLink[];
  footer_links: FooterColumn[];
  site_description: string | null;
}) {
  const admin = supabaseAdmin();

  // The site_settings table is meant to be a singleton
  const { data: current } = await admin
    .from("site_settings")
    .select("id")
    .limit(1)
    .single();

  if (!current) {
    return { error: "Site settings not initialized. Please save Global Settings first." };
  }

  const { error } = await admin
    .from("site_settings")
    .update({
      header_links: data.header_links,
      footer_links: data.footer_links,
      site_description: data.site_description,
    })
    .eq("id", current.id);

  if (error) {
    console.error("[cms] updateNavigationLinks error:", error);
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/super-admin/cms/navigation", "page");
  return { success: true };
}
