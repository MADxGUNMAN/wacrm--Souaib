-- ============================================================
-- 065 — The in-app starter template library.
--
-- Two things called "library" now exist and they are NOT the same:
--
--   * META'S Template Library (/api/whatsapp/template-library) — Meta's
--     own pre-written, pre-categorised templates, fetched live from the
--     WABA. Fixed wording, and not offered to every account.
--
--   * THIS one — starter templates WE write, grouped by industry, that an
--     operator copies into the wizard and edits freely before submitting.
--     Always available, works before a WABA is even connected.
--
-- Platform-global on purpose: these are curated content maintained by the
-- operator of this app, not per-account data. Hence no account_id, and RLS
-- that lets any signed-in user READ while only a super admin writes.
--
-- The seed data lives in 066 (categories) and 067/068 (templates).
-- ============================================================

CREATE TABLE IF NOT EXISTS template_library_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable, human-readable key used in URLs and in seed data, so a rename
  -- of `name` never breaks a link or a re-run of the seed.
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  -- Emoji rather than an icon component name: the set is operator-editable
  -- from the super admin panel, and a free-text emoji cannot reference a
  -- component that does not exist in the bundle.
  emoji       text NOT NULL DEFAULT '📄',
  description text,
  position    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_library_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES template_library_categories(id) ON DELETE CASCADE,
  slug        text NOT NULL UNIQUE,

  -- What the operator sees while browsing.
  title       text NOT NULL,
  description text,
  emoji       text,

  -- ---- The template itself, mirroring TemplatePayload ----
  -- Deliberately the SAME field names the wizard and the submit API use,
  -- so "Use template" is a straight copy rather than a translation step
  -- that could drift from what actually gets submitted.
  meta_category  text NOT NULL DEFAULT 'UTILITY'
                 CHECK (meta_category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  template_type  text NOT NULL DEFAULT 'default',
  language       text NOT NULL DEFAULT 'en_US',
  header_type    text CHECK (header_type IN ('text','image','video','document','location')),
  header_content text,
  body_text      text NOT NULL,
  footer_text    text,
  -- Legacy-shaped button array: quick reply / url / phone / copy code.
  buttons        jsonb,
  -- { body: string[], header: string[] } — the example values Meta's
  -- reviewers read. A library template ships with good ones because vague
  -- samples are a common rejection reason.
  sample_values  jsonb,

  tags       text[] NOT NULL DEFAULT '{}',
  position   integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_library_templates_category_idx
  ON template_library_templates (category_id, position);
CREATE INDEX IF NOT EXISTS template_library_categories_position_idx
  ON template_library_categories (position);

-- Search across the browsable text. The library is small enough that a
-- trigram index would be overkill, but the browser searches title,
-- description and body, so this keeps that honest as the set grows.
CREATE INDEX IF NOT EXISTS template_library_templates_search_idx
  ON template_library_templates
  USING gin (to_tsvector('english', title || ' ' || COALESCE(description,'') || ' ' || body_text));

ALTER TABLE template_library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_library_templates ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user. This is curated catalogue content, not tenant
-- data, and every account is meant to browse the same set.
DROP POLICY IF EXISTS template_library_categories_select ON template_library_categories;
CREATE POLICY template_library_categories_select
  ON template_library_categories FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS template_library_templates_select ON template_library_templates;
CREATE POLICY template_library_templates_select
  ON template_library_templates FOR SELECT
  TO authenticated
  USING (true);

-- Write: super admins only, checked against the caller's own profile.
-- The API routes also go through requireSuperAdmin with the service-role
-- client, so this is defence in depth rather than the only gate — but
-- without it an ordinary authenticated user could edit the catalogue with
-- a direct PostgREST call.
DROP POLICY IF EXISTS template_library_categories_write ON template_library_categories;
CREATE POLICY template_library_categories_write
  ON template_library_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS template_library_templates_write ON template_library_templates;
CREATE POLICY template_library_templates_write
  ON template_library_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_super_admin = true
    )
  );

-- Keep updated_at honest without every caller remembering to set it.
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS template_library_categories_touch ON template_library_categories;
CREATE TRIGGER template_library_categories_touch
  BEFORE UPDATE ON template_library_categories
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS template_library_templates_touch ON template_library_templates;
CREATE TRIGGER template_library_templates_touch
  BEFORE UPDATE ON template_library_templates
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
