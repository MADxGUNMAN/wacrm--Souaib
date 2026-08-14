-- ============================================================
-- 064 — Landing-page price display overrides.
--
-- The landing pricing section used to be driven by `extra_data.tiers`
-- (Starter / Professional / Enterprise at $29 / $79 / Custom). The
-- section was rewritten to render the REAL subscription catalogue —
-- Monthly and Yearly with a day-based headline — so those tiers stopped
-- being read months ago, while the CMS editor kept offering fields for
-- them. Editing them changed nothing, which is exactly what the operator
-- reported.
--
-- Replaced with two fields the landing page actually reads:
--
--   price_currency   — e.g. 'USD'. Applies to the priced cards only.
--   price_overrides  — per billing-cycle label:
--                      { "Monthly": { "per_day": "2", "total": "60" } }
--
-- These change the MARKETING DISPLAY ONLY. The real amounts stay in
-- subscription_plan_prices and continue to drive /upgrade-plan and the
-- UPI amount, so anything set here deliberately disagrees with what a
-- customer is charged. The CMS editor says so in an amber warning; this
-- comment exists so the same is obvious from the database side.
--
-- The old tiers are moved to `legacy_tiers` rather than deleted — no code
-- reads them, but they are the only copy of that marketing copy and
-- throwing it away to tidy a JSON blob is not a trade worth making.
-- ============================================================

UPDATE landing_sections
SET extra_data =
  -- Keep everything except `tiers`, park those under legacy_tiers.
  (COALESCE(extra_data, '{}'::jsonb) - 'tiers')
  || CASE
       WHEN extra_data ? 'tiers'
         THEN jsonb_build_object('legacy_tiers', extra_data -> 'tiers')
       ELSE '{}'::jsonb
     END
  || jsonb_build_object(
       'price_currency', 'USD',
       'price_overrides', jsonb_build_object(
         'Monthly', jsonb_build_object('per_day', '2', 'total', '60'),
         'Yearly',  jsonb_build_object('per_day', '1', 'total', '360')
       )
     )
WHERE section_key = 'pricing';
