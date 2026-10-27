-- ============================================================
-- Site-wide marketing copy becomes CMS-managed.
--
-- site_settings.marketing_copy holds text that isn't tied to one landing
-- section: the login / signup showcase, the navbar Login / Get Started
-- buttons and the footer newsletter block. Shape and defaults live in
-- src/lib/cms/marketing-copy.ts; an empty object means "use defaults",
-- so no seed is needed and existing rows are unaffected.
--
-- Additive and idempotent. The remaining new copy (Google Sheets page,
-- landing hero chips, testimonials overlay, pricing button) goes into
-- existing jsonb columns (integration_pages.content,
-- landing_sections.extra_data) and needs no schema change.
-- ============================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS marketing_copy jsonb NOT NULL DEFAULT '{}'::jsonb;
