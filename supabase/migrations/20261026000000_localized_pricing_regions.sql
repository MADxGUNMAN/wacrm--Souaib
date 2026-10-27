-- ============================================================
-- Localized pricing: country regions for plans and Razorpay plans.
--
-- Report: docs/razopay/localized-pricing-report.md.
--
-- ADDITIVE AND IDEMPOTENT. One new table, three new columns with constant
-- defaults, three CHECK constraints and one index. Nothing here updates or
-- deletes an existing row and nothing touches `subscription_settings`.
--
-- Global (Universal) pricing is implicit: it is exactly today's data, the
-- `subscription_settings` singleton plus every cycle whose region is
-- 'global'. The constant DEFAULT 'global' is the backfill: every existing
-- `billing_cycles` and `billing_provider_plans` row reads 'global' without
-- being rewritten.
--
-- Dev and production share this database, and production may run code that
-- predates regions. That code has no region filter, so a regional cycle must
-- never look visible to it. The CHECK `region = 'global' OR is_visible =
-- FALSE` guarantees that: a regional cycle keeps `is_visible = FALSE` and
-- uses `is_visible_in_region` instead, which only region-aware code reads.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Country pricing regions
--
-- One row per configured country (ISO 3166-1 alpha-2). No row for Global.
-- `settings` holds whitelisted page-copy overrides only; blank keys fall
-- back to the Global wording. `currency` is fixed while enabled.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_regions (
  code               TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  currency           CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  is_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  settings           JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_at         TIMESTAMPTZ,
  enabled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_regions_settings_object CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT pricing_regions_enabled_needs_currency CHECK (NOT is_enabled OR currency IS NOT NULL)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.pricing_regions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pricing_regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server routes only (service role). No client policies.
ALTER TABLE public.pricing_regions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pricing_regions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pricing_regions TO service_role;

COMMENT ON TABLE public.pricing_regions IS
  'Country pricing regions. Global is implicit (subscription_settings + billing_cycles.region = ''global''). A country is shown to customers only when is_enabled and complete.';
COMMENT ON COLUMN public.pricing_regions.settings IS
  'Whitelisted page-copy overrides. Blank or missing keys use the Global value. Never holds platform-wide settings.';
COMMENT ON COLUMN public.pricing_regions.currency IS
  'ISO 4217 code charged for this region. Cannot change while the region is enabled (enforced by the API).';

-- ------------------------------------------------------------
-- 2. Cycles carry the region; prices inherit it through cycle_id
-- ------------------------------------------------------------
ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS is_visible_in_region BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_region_check;
ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_region_check
  CHECK (region = 'global' OR region ~ '^[A-Z]{2}$');

ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_region_hidden_from_legacy;
ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_region_hidden_from_legacy
  CHECK (region = 'global' OR is_visible = FALSE);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_region_position
  ON public.billing_cycles (region, position);

COMMENT ON COLUMN public.billing_cycles.region IS
  '''global'' or an ISO alpha-2 country code. Existing rows read ''global'' through the column default.';
COMMENT ON COLUMN public.billing_cycles.is_visible_in_region IS
  'Customer visibility for a regional cycle. Regional cycles keep is_visible = FALSE so code without region support never shows or sells them.';

-- ------------------------------------------------------------
-- 3. Razorpay plans record the region they were created for
--
-- The unique index billing_provider_plans_current_key (mode, plan_id,
-- cycle_id) is unchanged: each region owns its cycles, so a USD plan for a
-- US cycle never collides with the INR plan for a Global cycle.
-- ------------------------------------------------------------
ALTER TABLE public.billing_provider_plans
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global';

ALTER TABLE public.billing_provider_plans DROP CONSTRAINT IF EXISTS billing_provider_plans_region_check;
ALTER TABLE public.billing_provider_plans ADD CONSTRAINT billing_provider_plans_region_check
  CHECK (region = 'global' OR region ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.billing_provider_plans.region IS
  'Pricing region of the cycle this Razorpay plan was created for. Existing rows read ''global''.';
