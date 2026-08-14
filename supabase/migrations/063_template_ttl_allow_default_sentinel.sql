-- ============================================================
-- 063 — Allow message_send_ttl_seconds = -1.
--
-- Migration 061 constrained this to 30..2592000, which is the sane range
-- for a real duration. But Meta uses -1 as a SENTINEL meaning "24 hours"
-- — it is how you explicitly reset an authentication template's
-- time-to-live back to the default after overriding it.
--
-- Left as-is, the constraint would have made "Sync from Meta" fail on any
-- template carrying -1, and the failure would surface as a per-template
-- error row rather than anything pointing at the real cause. That is a
-- bug that only appears once a customer has such a template, which is
-- the worst time to find it.
--
-- Authentication templates additionally accept only 60..600 for a real
-- value (Meta's own narrower window). That is enforced in the validators
-- rather than here, because the limit depends on the category and a CHECK
-- across two columns would be harder to read than the error it replaces.
-- ============================================================

ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_ttl_range_check;

ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_ttl_range_check
  CHECK (
    message_send_ttl_seconds IS NULL
    OR message_send_ttl_seconds = -1
    OR (message_send_ttl_seconds BETWEEN 30 AND 2592000)
  );
