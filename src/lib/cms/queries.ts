// ============================================================
// CMS public data fetching — server-side, no auth required.
//
// Used by the public landing page and legal pages to render
// content from the CMS database tables. All reads use the
// service-role client since CMS tables have no RLS.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import type {
  SiteSettings,
  LandingSection,
  LandingFeature,
  LandingTestimonial,
  LandingPricingTier,
  LandingIntegration,
  LegalPage,
  LandingImage,
  LandingFaq,
} from '@/types/super-admin';

/**
 * Fetch the singleton site settings row.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('site_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[cms] getSiteSettings error:', error);
    return null;
  }

  return data as SiteSettings | null;
}

/**
 * Fetch all visible landing sections, ordered by position.
 */
export async function getLandingSections(): Promise<LandingSection[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_sections')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingSections error:', error);
    return [];
  }

  return (data ?? []) as LandingSection[];
}

/**
 * Fetch a single landing section by its key.
 */
export async function getLandingSectionByKey(
  key: string
): Promise<LandingSection | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_sections')
    .select('*')
    .eq('section_key', key)
    .maybeSingle();

  if (error) {
    console.error('[cms] getLandingSectionByKey error:', error);
    return null;
  }

  return data as LandingSection | null;
}

/**
 * Fetch all visible landing features, ordered by position.
 */
export async function getLandingFeatures(): Promise<LandingFeature[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_features')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingFeatures error:', error);
    return [];
  }

  return (data ?? []) as LandingFeature[];
}

/**
 * Fetch all visible testimonials, ordered by position.
 */
export async function getLandingTestimonials(): Promise<LandingTestimonial[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_testimonials')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingTestimonials error:', error);
    return [];
  }

  return (data ?? []) as LandingTestimonial[];
}

/**
 * Fetch all visible pricing tiers, ordered by position.
 */
export async function getLandingPricing(): Promise<LandingPricingTier[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_pricing_tiers')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingPricing error:', error);
    return [];
  }

  return (data ?? []) as LandingPricingTier[];
}

/**
 * Fetch all visible integrations, ordered by position.
 */
export async function getLandingIntegrations(): Promise<LandingIntegration[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_integrations')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingIntegrations error:', error);
    return [];
  }

  return (data ?? []) as LandingIntegration[];
}

/**
 * Fetch a published legal page by slug.
 */
export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('legal_pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('[cms] getLegalPage error:', error);
    return null;
  }

  return data as LegalPage | null;
}

/**
 * Fetch all published legal pages (slug + title only, for footer links).
 */
export async function getLegalPagesList(): Promise<
  Pick<LegalPage, 'slug' | 'title'>[]
> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('legal_pages')
    .select('slug, title')
    .eq('is_published', true)
    .order('slug', { ascending: true });

  if (error) {
    console.error('[cms] getLegalPagesList error:', error);
    return [];
  }

  return (data ?? []) as Pick<LegalPage, 'slug' | 'title'>[];
}

/**
 * Fetch a landing image by its key.
 */
export async function getLandingImage(
  imageKey: string
): Promise<LandingImage | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_images')
    .select('*')
    .eq('image_key', imageKey)
    .maybeSingle();

  if (error) {
    console.error('[cms] getLandingImage error:', error);
    return null;
  }

  return data as LandingImage | null;
}

/**
 * Fetch all landing images.
 */
export async function getAllLandingImages(): Promise<LandingImage[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_images')
    .select('*')
    .order('image_key', { ascending: true });

  if (error) {
    console.error('[cms] getAllLandingImages error:', error);
    return [];
  }

  return (data ?? []) as LandingImage[];
}

/**
 * Fetch all visible FAQs ordered by position.
 */
export async function getLandingFaqs(): Promise<LandingFaq[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('landing_faqs')
    .select('*')
    .eq('is_visible', true)
    .order('position', { ascending: true });

  if (error) {
    console.error('[cms] getLandingFaqs error:', error);
    return [];
  }

  return (data ?? []) as LandingFaq[];
}
