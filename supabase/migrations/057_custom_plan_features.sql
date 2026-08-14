-- ============================================================
-- 057_custom_plan_features.sql
--
-- Bullet points for the Custom enquiry card on /upgrade-plan.
--
-- Without them the Custom card sits visibly emptier than the two priced
-- cards beside it — it has no price, no equals line and no savings pill,
-- so it read as unfinished rather than as a deliberate third option.
--
-- Deliberately the SAME JSONB shape as `subscription_plans.features`
-- (`[{"label": "..."}]`, bare strings also tolerated), so it reuses
-- `normalisePlanFeatures` on read and `serialisePlanFeatures` on write.
-- A second, slightly-different feature format would be one more thing to
-- keep in step for no benefit.
-- ============================================================

ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS custom_plan_features JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Seed only when untouched, so a re-run cannot overwrite edited copy.
UPDATE subscription_settings
   SET custom_plan_features = '[
         {"label": "Everything in the standard plan"},
         {"label": "Multiple WhatsApp numbers"},
         {"label": "Volume pricing"},
         {"label": "Dedicated account manager"}
       ]'::jsonb,
       updated_at = NOW()
 WHERE custom_plan_features = '[]'::jsonb;
