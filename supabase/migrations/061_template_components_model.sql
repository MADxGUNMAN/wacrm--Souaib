-- ============================================================
-- 061 — A real components model for message templates.
--
-- WHY THIS EXISTS
--
-- The table stores a template as flat columns: header_type,
-- header_content, body_text, footer_text, buttons. That shape can
-- express exactly one kind of template — a single header, one body, one
-- footer, one flat button list.
--
-- It cannot express what Meta actually supports:
--   * carousel      — up to 10 CARDS, each with its own header, body
--                     and up to 2 buttons. Nested repetition; there is
--                     no flat column that holds ten of anything.
--   * limited-time offer — an extra LIMITED_TIME_OFFER component with
--                     its own expiration semantics.
--   * order details / order status — components with structured payloads.
--   * authentication — an OTP button with expiration + security options.
--
-- So `components` is added as Meta's OWN shape, verbatim. That choice is
-- deliberate: it is exactly what we POST on create and exactly what we
-- GET back on sync, which means round-tripping a template through Meta
-- can be lossless instead of squeezing it through a lossy local dialect.
-- Today's sync silently DROPS button types it doesn't model (OTP, FLOW,
-- MPM, CATALOG); storing the raw array stops that data loss even before
-- the UI can render it.
--
-- THE FLAT COLUMNS ARE NOT REMOVED, ON PURPOSE
--
-- `template-row-guard.ts` throws if body_text is missing, and the
-- broadcast engine plus template-send-builder read the flat columns on
-- every send. Dropping them would break sending for every existing
-- customer. They are kept as a DERIVED VIEW of `components` — a cache,
-- not a second source of truth.
--
-- Invariant, enforced in code (src/lib/whatsapp/template-definition.ts):
--   `components` is authoritative. The flat columns are written ONLY by
--   deriveFlatColumns(). Never write one without the other.
--
-- Rows created before this migration have components backfilled below,
-- so an empty array never means "not set yet" — it means a template with
-- no components, which is invalid and visible as such.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New columns
-- ------------------------------------------------------------

ALTER TABLE message_templates
  -- Meta's components array, verbatim. Source of truth.
  ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Which wizard flow produced this template. Meta doesn't store this
  -- as a field — it's implied by the component mix — but the UI needs to
  -- know which editor to reopen, and inferring it from components every
  -- time is guesswork we'd rather not repeat.
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'default',

  -- POSITIONAL = {{1}}, NAMED = {{order_id}}. Meta requires this to be
  -- declared at create time and it cannot be mixed within a template.
  ADD COLUMN IF NOT EXISTS parameter_format TEXT NOT NULL DEFAULT 'POSITIONAL',

  -- Message validity period ("Set custom validity period" in Meta's UI).
  -- NULL = use Meta's default. Utility/auth templates only.
  ADD COLUMN IF NOT EXISTS message_send_ttl_seconds INTEGER,

  -- Set when the template was created from Meta's pre-approved Template
  -- Library rather than written from scratch.
  ADD COLUMN IF NOT EXISTS library_template_name TEXT;

-- ------------------------------------------------------------
-- 2. Constraints
-- ------------------------------------------------------------

-- components must be a JSON array. Per-component validation lives in TS
-- (Postgres CHECKs can't express "a HEADER may have at most one of
-- header_handle / header_url", and error messages there can name the
-- offending component).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_components_is_array'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_components_is_array
      CHECK (jsonb_typeof(components) = 'array');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_template_type_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_template_type_check
      CHECK (template_type IN (
        'default',
        'carousel',
        'limited_time_offer',
        'order_details',
        'order_status',
        'authentication',
        'calling_permission_request',
        'catalogue',
        'multi_product'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_parameter_format_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_parameter_format_check
      CHECK (parameter_format IN ('POSITIONAL', 'NAMED'));
  END IF;
END $$;

-- Meta accepts 30 seconds to 30 days for the validity period. Rejecting
-- out-of-range values here means a bad number fails on save rather than
-- surfacing later as an opaque Meta rejection.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_ttl_range_check'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_ttl_range_check
      CHECK (
        message_send_ttl_seconds IS NULL
        OR (message_send_ttl_seconds BETWEEN 30 AND 2592000)
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Allow LOCATION headers.
--
-- The CHECK from migration 001 is auto-named, so find it by definition
-- rather than guessing the name (same technique 014 used for status).
-- ------------------------------------------------------------
DO $$
DECLARE
  target_name TEXT;
BEGIN
  SELECT conname INTO target_name
  FROM pg_constraint
  WHERE conrelid = 'message_templates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%header_type%'
    AND pg_get_constraintdef(oid) ILIKE '%document%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%location%'
  LIMIT 1;

  IF target_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE message_templates DROP CONSTRAINT %I',
      target_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_header_type_check2'
      AND conrelid = 'message_templates'::regclass
  ) THEN
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_header_type_check2
      CHECK (
        header_type IS NULL
        OR header_type IN ('text', 'image', 'video', 'document', 'location')
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Backfill `components` from the flat columns.
--
-- Canonical Meta order: HEADER → BODY → FOOTER → BUTTONS. jsonb_strip_nulls
-- keeps absent fields out of the JSON entirely rather than storing
-- explicit nulls, which is what Meta's own responses look like.
--
-- Guarded on components = '[]' so re-running is a no-op and a row that
-- has already been written by the new code path is never clobbered.
-- ------------------------------------------------------------
UPDATE message_templates
SET components =
  -- HEADER (optional)
  CASE
    WHEN header_type IS NULL THEN '[]'::jsonb
    ELSE jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'type', 'HEADER',
        'format', upper(header_type),
        'text', CASE WHEN header_type = 'text' THEN header_content END,
        'example', CASE
          WHEN header_type = 'text' AND sample_values -> 'header' IS NOT NULL
            THEN jsonb_build_object('header_text', sample_values -> 'header')
          WHEN header_type <> 'text' AND header_handle IS NOT NULL
            THEN jsonb_build_object('header_handle', jsonb_build_array(header_handle))
          WHEN header_type <> 'text' AND header_media_url IS NOT NULL
            THEN jsonb_build_object('header_url', jsonb_build_array(header_media_url))
        END
      ))
    )
  END
  -- BODY (always present)
  || jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object(
      'type', 'BODY',
      'text', body_text,
      'example', CASE
        WHEN sample_values -> 'body' IS NOT NULL
          THEN jsonb_build_object('body_text', jsonb_build_array(sample_values -> 'body'))
      END
    ))
  )
  -- FOOTER (optional)
  || CASE
    WHEN footer_text IS NULL OR btrim(footer_text) = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(
      jsonb_build_object('type', 'FOOTER', 'text', footer_text)
    )
  END
  -- BUTTONS (optional)
  || CASE
    WHEN buttons IS NULL OR jsonb_array_length(buttons) = 0 THEN '[]'::jsonb
    ELSE jsonb_build_array(
      jsonb_build_object('type', 'BUTTONS', 'buttons', buttons)
    )
  END
WHERE components = '[]'::jsonb;

-- Existing AUTHENTICATION rows (only reachable via Sync from Meta today)
-- are tagged so the wizard reopens them in the right editor.
UPDATE message_templates
SET template_type = 'authentication'
WHERE category = 'Authentication'
  AND template_type = 'default';

-- ------------------------------------------------------------
-- 5. Index for "show me all carousels" style filters in the new UI.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_message_templates_account_type
  ON message_templates (account_id, template_type);
