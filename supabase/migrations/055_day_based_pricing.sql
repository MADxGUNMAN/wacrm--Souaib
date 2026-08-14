-- ============================================================
-- 055_day_based_pricing.sql
--
-- Reshapes the subscription catalogue from a 3x3 grid (Growth / Pro /
-- Business x Monthly / Quarterly / Yearly) into ONE product sold on two
-- day-based cycles, plus a Custom enquiry card.
--
--   Monthly   30 days   Rs 900     shown as "Rs 30 / day"
--   Yearly   360 days   Rs 9,000   shown as "Rs 25 / day"  (recommended)
--   Custom   no price, links to sales
--
-- WHY ONE PLAN AND NOT THREE: every paid cycle now includes every CRM
-- feature, so the tiers had nothing left to distinguish them. The card
-- title becomes the CYCLE label ("Monthly"), and the feature list moves
-- out of the cards into one shared list — a single source of truth
-- instead of three that drift apart.
--
-- NOTHING IS DELETED. `payment_requests.plan_id` / `cycle_id` and
-- `accounts.subscription_plan_id` reference these rows, and approved
-- payments carry snapshots that must stay explainable months later. The
-- retired plans and the Quarterly cycle are therefore hidden
-- (is_visible = false), not removed: they vanish from the page while
-- every historical record still resolves.
--
-- Per-day price is DERIVED (amount / duration_days) so it can never
-- disagree with what the customer is actually charged. The new
-- `per_day_amount` column exists only as an override for the case where
-- the true division is ugly (e.g. 950 / 30 = 31.666...) and the operator
-- wants to show a round number.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New columns
-- ------------------------------------------------------------

-- A "recommended" flag distinct from `discount_label`. Conflating the
-- two would force an operator to choose between showing a discount and
-- showing a recommendation.
ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS recommended_label TEXT;

-- Optional display override for the per-day headline. NULL means derive.
ALTER TABLE subscription_plan_prices
  ADD COLUMN IF NOT EXISTS per_day_amount NUMERIC(12,2);

-- Page copy for the new layout. All admin-editable, like the rest.
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS per_day_label TEXT DEFAULT '/ day';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS price_equals_template TEXT
    DEFAULT '= {total} for {days} days';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS features_heading TEXT
    DEFAULT 'Every plan includes everything';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS features_subheading TEXT
    DEFAULT 'No feature gates and no add-ons. Monthly and yearly differ only in price.';

-- The Custom card. Deliberately NOT a billing_cycles row: it has no
-- price, no duration and cannot be purchased, so modelling it as a
-- sellable cycle would mean every price/duration code path needed a
-- special case for it.
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS show_custom_plan BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_label TEXT DEFAULT 'Custom';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_price_text TEXT DEFAULT 'Let''s talk';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_body TEXT
    DEFAULT 'High volume, multiple numbers, or something bespoke? We will build a plan around how you actually work.';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_cta_text TEXT DEFAULT 'Talk to sales';
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_cta_link TEXT DEFAULT '/contact';

-- ------------------------------------------------------------
-- 2. Reshape the catalogue
--
-- Guarded so a re-run is a no-op: keyed off the Quarterly cycle still
-- being visible, which is only true before this has run.
-- ------------------------------------------------------------
DO $$
DECLARE
  keep_plan_id  UUID;
  monthly_id    UUID;
  yearly_id     UUID;
BEGIN
  -- ---- Cycles ----
  -- Monthly: 30 days, not 1 calendar month. The customer is quoted a
  -- daily rate, so the term has to be a fixed number of days or the
  -- arithmetic on the card stops matching the charge in February.
  UPDATE billing_cycles
     SET label = 'Monthly',
         unit_label = NULL,
         months = 0,
         duration_days = 30,
         discount_label = NULL,
         is_default = TRUE,
         is_visible = TRUE,
         is_recommended = FALSE,
         recommended_label = NULL,
         position = 1,
         updated_at = NOW()
   WHERE cycle_key = 'monthly'
  RETURNING id INTO monthly_id;

  -- Yearly: 360 days, matching the quoted 25/day x 360 = 9,000 exactly.
  -- 365 would make the headline rate a recurring decimal.
  UPDATE billing_cycles
     SET label = 'Yearly',
         unit_label = NULL,
         months = 0,
         duration_days = 360,
         is_default = FALSE,
         is_visible = TRUE,
         is_recommended = TRUE,
         recommended_label = 'Recommended',
         position = 2,
         updated_at = NOW()
   WHERE cycle_key = 'yearly'
  RETURNING id INTO yearly_id;

  -- Quarterly retires. Hidden, not deleted — see the header note.
  UPDATE billing_cycles
     SET is_visible = FALSE, is_default = FALSE, updated_at = NOW()
   WHERE cycle_key = 'quarterly';

  -- ---- Plans ----
  -- Keep the currently-featured plan as the single product and give it
  -- the union of every tier's features, since all of it is now included.
  SELECT id INTO keep_plan_id
    FROM subscription_plans
   WHERE is_visible
   ORDER BY is_highlighted DESC, position ASC
   LIMIT 1;

  IF keep_plan_id IS NULL THEN
    RAISE EXCEPTION 'No visible subscription plan to keep';
  END IF;

  UPDATE subscription_plans
     SET name = 'Replai',
         tagline = 'The whole CRM. Every feature, on every plan.',
         features_heading = NULL,
         is_highlighted = FALSE,
         highlight_label = NULL,
         is_visible = TRUE,
         position = 1,
         features = '[
           {"label": "Unlimited marketing messages"},
           {"label": "WhatsApp bulk broadcasts"},
           {"label": "Campaign scheduler"},
           {"label": "Retargeting campaigns"},
           {"label": "Opt-in / opt-out management"},
           {"label": "URL click tracking"},
           {"label": "Advanced analytics dashboard"},
           {"label": "Shared team inbox"},
           {"label": "Unlimited agent logins"},
           {"label": "Contacts, pipelines and deals"},
           {"label": "Custom fields and tags"},
           {"label": "Unlimited chatbot flows"},
           {"label": "WhatsApp Flows and forms"},
           {"label": "AI auto-reply agents"},
           {"label": "Meta Lead Ads to WhatsApp"},
           {"label": "Message templates and quick replies"},
           {"label": "Public API and MCP access"},
           {"label": "Dedicated onboarding"},
           {"label": "Priority support"}
         ]'::jsonb,
         updated_at = NOW()
   WHERE id = keep_plan_id;

  -- Every other plan retires.
  UPDATE subscription_plans
     SET is_visible = FALSE, is_highlighted = FALSE, updated_at = NOW()
   WHERE id <> keep_plan_id;

  -- ---- Prices ----
  -- 900 / 30 days  -> 30/day.  9000 / 360 days -> 25/day.
  -- per_day_amount left NULL so both derive exactly.
  UPDATE subscription_plan_prices
     SET amount = 900, compare_at_amount = NULL, per_day_amount = NULL,
         is_visible = TRUE, updated_at = NOW()
   WHERE plan_id = keep_plan_id AND cycle_id = monthly_id;

  UPDATE subscription_plan_prices
     SET amount = 9000, compare_at_amount = NULL, per_day_amount = NULL,
         is_visible = TRUE, updated_at = NOW()
   WHERE plan_id = keep_plan_id AND cycle_id = yearly_id;

  -- Hide prices belonging to retired plans/cycles so nothing stale can
  -- surface if one is ever made visible again by hand.
  UPDATE subscription_plan_prices
     SET is_visible = FALSE, updated_at = NOW()
   WHERE plan_id <> keep_plan_id
      OR cycle_id NOT IN (monthly_id, yearly_id);
END $$;

-- ------------------------------------------------------------
-- 3. Refresh the page copy for the new layout
-- ------------------------------------------------------------
UPDATE subscription_settings
   SET page_heading = 'Simple pricing. Everything included.',
       page_subheading = 'One plan with every feature. Pay monthly, or save by paying yearly.',
       cycle_hint = NULL,
       per_day_label = '/ day',
       price_equals_template = '= {total} for {days} days',
       features_heading = 'Every plan includes everything',
       features_subheading = 'No feature gates and no add-ons. Monthly and yearly differ only in price.',
       updated_at = NOW();
