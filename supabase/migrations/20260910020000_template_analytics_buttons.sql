-- ============================================================
-- Make template analytics servable entirely from our own database.
--
-- WHY THIS IS NEEDED
--
-- The templates list was taking ~2 minutes to show its Spend column,
-- because the request fetched live from Meta on every page load. Meta
-- paginates template_analytics at 25 data points per page, so 8
-- templates x 90 days is roughly 240 points => ~10 pages per 30-day
-- slice x 3 slices ~= 30 sequential Graph requests before the column
-- could render.
--
-- The fix is to answer from `template_analytics_daily` and refresh Meta
-- in the background. That only works if EVERYTHING the screen shows is
-- stored, and two things were still being read straight off the live
-- response: the per-button click breakdown, and freshness.
--
-- COLUMNS
--
-- buttons      JSONB array of { label, type, clicks, uniqueClicks } —
--              exactly the ButtonClickStat shape the parser already
--              produces, so nothing is translated on the way in or out.
--              NULL means "Meta reported no button data for this day",
--              which is NOT the same as an empty array (a template whose
--              buttons nobody tapped).
--
-- replied      Meta reports this beside sent/delivered/read and it was
--              being discarded. Cheap to capture while the column list is
--              being touched.
--
-- refreshed_at When Meta was last successfully asked about this template.
--              Drives "how fresh is this" in the UI and lets a background
--              refresh skip what it just updated, instead of re-walking
--              30 pages on every page view.
-- ============================================================

ALTER TABLE template_analytics_daily
  ADD COLUMN IF NOT EXISTS buttons JSONB;

ALTER TABLE template_analytics_daily
  ADD COLUMN IF NOT EXISTS replied INTEGER NOT NULL DEFAULT 0
    CHECK (replied >= 0);

ALTER TABLE template_analytics_daily
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;
