-- ============================================================
-- 058_site_settings_brand_assets.sql
-- Add full_logo_url and meta_partner_badge_url columns to site_settings
-- ============================================================

ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS full_logo_url TEXT,
ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
ADD COLUMN IF NOT EXISTS meta_partner_badge_url TEXT;
