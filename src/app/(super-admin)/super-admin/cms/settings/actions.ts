'use server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { revalidatePath } from 'next/cache';
import { requireSuperAdminAction } from '@/lib/super-admin/action-guard';
import { obj } from '@/lib/cms/content-helpers';
import type { MarketingCopy } from '@/lib/cms/marketing-copy';

const MAX_COPY_LENGTH = 2000;

/**
 * Keep only the known marketing-copy groups and string fields, trimmed to
 * a sane length, so the jsonb column can't collect arbitrary payloads.
 */
function sanitizeMarketingCopy(raw: unknown): Record<string, unknown> {
  const groups: (keyof MarketingCopy)[] = ['auth', 'navbar', 'newsletter'];
  const out: Record<string, Record<string, string>> = {};
  for (const group of groups) {
    const src = obj(obj(raw)[group]);
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(src)) {
      if (typeof value === 'string' && /^[a-z_]{1,40}$/.test(key)) {
        clean[key] = value.slice(0, MAX_COPY_LENGTH);
      }
    }
    out[group] = clean;
  }
  return out;
}

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
  marketing_copy?: Partial<MarketingCopy>;
}) {
  const guard = await requireSuperAdminAction();
  if (!guard.ok) return { error: guard.error };

  const admin = supabaseAdmin();
  const { marketing_copy, ...rest } = data;
  const payload: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (marketing_copy !== undefined) {
    payload.marketing_copy = sanitizeMarketingCopy(marketing_copy);
  }

  // The site_settings table is meant to be a singleton, so we update the first row
  const { data: current } = await admin
    .from('site_settings')
    .select('id')
    .limit(1)
    .single();

  if (!current) {
    // If it doesn't exist, insert
    const { error } = await admin.from('site_settings').insert([payload]);
    if (error) {
      console.error('[cms] updateSiteSettings insert error:', error);
      return { error: error.message };
    }
  } else {
    // Update existing
    const { error } = await admin
      .from('site_settings')
      .update(payload)
      .eq('id', current.id);
    if (error) {
      console.error('[cms] updateSiteSettings update error:', error);
      return { error: error.message };
    }
  }

  revalidatePath('/', 'layout');
  revalidatePath('/super-admin/cms', 'layout');
  revalidatePath('/robots.txt');
  revalidatePath('/sitemap.xml');
  return { success: true };
}
