-- ============================================================
-- Remember that template insights were switched on.
--
-- THE BUG
-- An operator pressed "Enable template insights", got the success toast
-- ("Insights are on. Meta starts collecting from now"), the page reloaded
-- itself — and the panel still read "Template insights aren't switched on for
-- this account", still offering the same button. Pressing it again produced
-- the same success and the same unchanged panel.
--
-- WHY
-- Meta contradicts itself on this account. The WABA node reports
--
--   is_enabled_for_insights: true
--
-- while `GET /{waba-id}/template_analytics` on the same account answers with
-- code 1 and "Template Insights have not been enabled for this WhatsApp
-- Business account."
--
-- The read path resolves that disagreement by asking the WABA directly, which
-- is the right precedence — but `fetchInsightsEnabled` returns null whenever
-- the CUSTOMER's stored token cannot read the field, and null falls back to
-- classifying Meta's error text. So the misleading sentence won, and the panel
-- recommended an action that had already been completed.
--
-- THE FIX
-- Record the moment we know insights were enabled, on our own side. This is a
-- FACT WE OBSERVED — Meta accepted the enable call, or told us it was already
-- on — and unlike either Meta signal it cannot later contradict itself.
--
-- Once set, the "switch this on" panel is never shown again for that account.
-- An empty section then reports the honest thing instead: insights are on and
-- Meta has not sent any template data yet. That distinction matters because
-- the two states need opposite responses — one is a button to press, the other
-- is a reason to wait.
--
-- Meta only collects from the moment it is enabled and never backfills, so the
-- timestamp is also what lets the UI say how long ago collection started
-- rather than implying the numbers should already be there.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS insights_enabled_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_config.insights_enabled_at IS
  'When template insights were confirmed enabled for this account''s WABA — either because our enable call succeeded or because Meta reported it was already on. Set once and never cleared: Meta has no way to disable insights again. Exists because Meta''s two signals disagree (the WABA field can read true while template_analytics still claims insights are off), which left the UI recommending an action already completed. Also the start of Meta''s collection window, since it does not backfill.';
