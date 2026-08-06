-- ============================================================
-- 053_cms_rls_lockdown.sql
--
-- SECURITY FIX: enable Row Level Security on the CMS tables.
--
-- ─── The problem ────────────────────────────────────────────
-- Migrations 041 and 046 created these tables with the comment
-- "public read, write only via service role" — but never enabled RLS to
-- enforce the second half. Supabase exposes every table in the `public`
-- schema over PostgREST, so with RLS off, anyone holding the publishable
-- (anon) key — which ships in the browser bundle and is therefore public
-- — could READ AND WRITE all of them. In practice that meant a stranger
-- could rewrite the landing page copy, alter advertised pricing, edit the
-- privacy policy, or read every contact-form submission ever received.
--
-- ─── Why zero policies is the correct fix ───────────────────
-- Enabling RLS with NO policies denies everything to `anon` and
-- `authenticated`, while the service-role key bypasses RLS entirely.
-- Every reader of this content already uses the service role:
--
--   * src/lib/cms/queries.ts — the ONLY path the public landing page,
--     /contact and /legal/[slug] use. Every function calls
--     supabaseAdmin(). Verified function by function.
--   * src/app/api/contact/route.ts — the public contact form POSTs here
--     and the INSERT runs on the service role, so no anon INSERT policy
--     is needed (and none is granted: an anon-writable submissions table
--     is an open spam relay).
--   * src/app/api/super-admin/cms/* and the CMS server actions — all
--     service role.
--
-- So the public site keeps working unchanged and the write hole closes.
-- Supabase's linter will report `rls_enabled_no_policy` (INFO) for these
-- tables. That is the intended end state, not an oversight: it replaces
-- an ERROR-level `rls_disabled_in_public` finding.
--
-- ─── The one exception ──────────────────────────────────────-
-- Two super-admin CLIENT components read `site_settings` with the
-- browser anon key, so RLS does apply to them:
--   src/app/(super-admin)/super-admin/cms/settings/page.tsx
--   src/app/(super-admin)/super-admin/cms/navigation/page.tsx
-- They get a SELECT policy restricted to super admins. This grants no
-- new capability — those users already read the same row through the
-- service-role admin API — it just keeps the existing pages working.
--
-- ─── Maintenance warning ────────────────────────────────────
-- If anyone later switches a public CMS read from supabaseAdmin() to the
-- anon client, that read will silently return ZERO ROWS and the section
-- will vanish from the page. Keep public CMS reads in
-- src/lib/cms/queries.ts on the service role, or add an explicit
-- `FOR SELECT USING (is_visible)` policy for the table concerned.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---- Landing page content ----------------------------------
ALTER TABLE site_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_sections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_features        ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_testimonials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pricing_tiers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_integrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_images          ENABLE ROW LEVEL SECURITY;

-- ---- Legal pages -------------------------------------------
ALTER TABLE legal_pages             ENABLE ROW LEVEL SECURITY;

-- ---- Contact page + inbound submissions --------------------
-- `contact_submissions` holds third-party PII (names, emails, phone
-- numbers, message bodies). It must never be client-readable.
ALTER TABLE contact_page_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- site_settings — super-admin SELECT
--
-- The EXISTS subquery reads `profiles`, which has its own RLS. That is
-- safe and non-recursive: it targets a different table, and the existing
-- `profiles_select` policy always lets a user read their own row
-- (auth.uid() = user_id), which is exactly the row being checked here.
--
-- Deliberately SELECT-only. Saves go through the CMS server actions on
-- the service role, so no client write path is needed and none is opened.
-- ============================================================
DROP POLICY IF EXISTS site_settings_super_admin_select ON site_settings;
CREATE POLICY site_settings_super_admin_select ON site_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_super_admin = TRUE
    )
  );
