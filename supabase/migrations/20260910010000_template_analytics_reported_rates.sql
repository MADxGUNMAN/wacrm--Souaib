-- ============================================================
-- Store the cost RATES Meta reports, not just the amount.
--
-- Meta's template analytics `cost` array carries three documented
-- entry types:
--
--   amount_spent               total charged for the bucket
--   cost_per_delivered         Meta's own per-delivered rate
--   cost_per_url_button_click  Meta's own per-click rate
--
-- Only `amount_spent` was being captured, and the per-delivered rate was
-- DERIVED as amount_spent / delivered. That derivation is why the CRM and
-- WhatsApp Manager printed different numbers under the same words: Meta
-- reports its own rate, and a locally recomputed one is a different
-- quantity that merely looks like it.
--
-- These columns let the app display Meta's figures verbatim, which is the
-- whole requirement — the CRM should echo Meta, not recompute it.
--
-- Nullable because Meta omits cost entirely for accounts billed through a
-- Solution Partner's credit line, and omits the click rate for templates
-- with no URL button. NULL means "not reported", never zero.
-- ============================================================

ALTER TABLE template_analytics_daily
  ADD COLUMN IF NOT EXISTS cost_per_delivered NUMERIC(14, 6)
    CHECK (cost_per_delivered IS NULL OR cost_per_delivered >= 0);

ALTER TABLE template_analytics_daily
  ADD COLUMN IF NOT EXISTS cost_per_url_click NUMERIC(14, 6)
    CHECK (cost_per_url_click IS NULL OR cost_per_url_click >= 0);
