-- Migration: 20260915120000_integration_pages.sql
-- Integration landing pages, dedicated privacy policy, and terms of service.

CREATE TABLE IF NOT EXISTS public.integration_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  badge_text text NOT NULL DEFAULT '',
  primary_cta_text text NOT NULL DEFAULT 'Install from Marketplace',
  primary_cta_url text NOT NULL DEFAULT '',
  secondary_cta_text text NOT NULL DEFAULT 'Get Started Free',
  secondary_cta_url text NOT NULL DEFAULT '/register',
  prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  how_it_works jsonb NOT NULL DEFAULT '[]'::jsonb,
  faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  privacy_markdown text NOT NULL DEFAULT '',
  terms_markdown text NOT NULL DEFAULT '',
  seo_meta_title text NOT NULL DEFAULT '',
  seo_meta_description text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_pages ENABLE ROW LEVEL SECURITY;

-- Public Read Policy
DROP POLICY IF EXISTS "Public can view published integration pages" ON public.integration_pages;
CREATE POLICY "Public can view published integration pages"
  ON public.integration_pages
  FOR SELECT
  USING (is_published = true OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_super_admin = true
  ));

-- Super Admin Write Policy
DROP POLICY IF EXISTS "Super admins can manage integration pages" ON public.integration_pages;
CREATE POLICY "Super admins can manage integration pages"
  ON public.integration_pages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

GRANT ALL ON public.integration_pages TO service_role;
GRANT SELECT ON public.integration_pages TO anon, authenticated;
