import { supabaseAdmin } from "@/lib/auth/admin-client";
import { SectionsClient } from "./sections-client";

export const dynamic = "force-dynamic";

export default async function SectionsPage() {
  const admin = supabaseAdmin();
  
  const { data: sections, error } = await admin
    .from("landing_sections")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <div>Error loading sections: {error.message}</div>;
  }

  return <SectionsClient initialSections={sections || []} />;
}

