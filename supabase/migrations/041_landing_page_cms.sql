-- ============================================================
-- 041_landing_page_cms.sql
-- CMS tables for the dynamic landing page
-- ============================================================

-- 1. SITE SETTINGS — global config (singleton row)
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name TEXT NOT NULL DEFAULT 'Replai',
  tagline TEXT NOT NULL DEFAULT 'AI-Powered WhatsApp CRM',
  site_description TEXT DEFAULT 'Self-hostable CRM platform for WhatsApp with AI replies, automations, and team collaboration.',
  logo_url TEXT,
  favicon_url TEXT,
  meta_title TEXT DEFAULT 'Replai — AI-Powered WhatsApp CRM',
  meta_description TEXT,
  og_image_url TEXT,
  canonical_url TEXT DEFAULT 'https://replai.junkiescoder.com',
  social_twitter TEXT,
  social_linkedin TEXT,
  social_github TEXT,
  social_instagram TEXT,
  social_youtube TEXT,
  support_email TEXT DEFAULT 'support@junkiescoder.com',
  sales_email TEXT DEFAULT 'sales@junkiescoder.com',
  privacy_email TEXT DEFAULT 'privacy@junkiescoder.com',
  legal_email TEXT DEFAULT 'legal@junkiescoder.com',
  copyright_text TEXT DEFAULT '2026 Junkies Coder. All rights reserved.',
  show_social_icons BOOLEAN DEFAULT TRUE,
  show_newsletter BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. LANDING SECTIONS — ordered content blocks
CREATE TABLE IF NOT EXISTS landing_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_key TEXT NOT NULL UNIQUE,  -- e.g. 'hero', 'features', 'pricing', 'how_it_works', 'ai_highlight', 'integrations', 'testimonials', 'cta_banner', 'social_proof'
  title TEXT,
  subtitle TEXT,
  body_text TEXT,                     -- main content / description
  cta_primary_text TEXT,
  cta_primary_link TEXT,
  cta_secondary_text TEXT,
  cta_secondary_link TEXT,
  background_style TEXT DEFAULT 'default',  -- 'default', 'gradient', 'image'
  background_image_url TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  extra_data JSONB DEFAULT '{}',     -- flexible field for section-specific data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_sections_position ON landing_sections(position);

-- 3. LANDING FEATURES — individual feature cards
CREATE TABLE IF NOT EXISTS landing_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  icon_name TEXT NOT NULL DEFAULT 'MessageSquare',  -- Lucide icon name
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_features_position ON landing_features(position);

-- 4. LANDING TESTIMONIALS
CREATE TABLE IF NOT EXISTS landing_testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT,
  author_company TEXT,
  author_avatar_url TEXT,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. LANDING PRICING TIERS
CREATE TABLE IF NOT EXISTS landing_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                -- e.g. 'Starter', 'Professional', 'Enterprise'
  price_monthly TEXT,                -- e.g. '$29', '$79', 'Custom'
  price_yearly TEXT,                 -- e.g. '$290', '$790', 'Custom'
  price_subtitle TEXT,               -- e.g. 'per month', 'billed annually'
  features JSONB NOT NULL DEFAULT '[]',  -- array of strings: ["Feature 1", "Feature 2"]
  is_highlighted BOOLEAN DEFAULT FALSE,  -- "Most Popular" badge
  highlight_label TEXT DEFAULT 'Most Popular',
  cta_text TEXT DEFAULT 'Get Started',
  cta_link TEXT DEFAULT '/signup',
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. LANDING INTEGRATIONS — badge cards
CREATE TABLE IF NOT EXISTS landing_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,           -- URL to integration logo in Supabase Storage
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. LEGAL PAGES — markdown content
CREATE TABLE IF NOT EXISTS legal_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,          -- 'privacy-policy', 'terms-of-service', etc.
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. LANDING IMAGES — reusable image assets
CREATE TABLE IF NOT EXISTS landing_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_key TEXT NOT NULL UNIQUE,    -- e.g. 'hero_mockup', 'hero_bg', 'og_image'
  url TEXT NOT NULL,                 -- Supabase Storage URL
  alt_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS on CMS tables — public read, write only via service role in API routes
