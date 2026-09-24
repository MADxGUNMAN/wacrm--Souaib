-- ============================================================
-- Deleting an API campaign now deletes its runs.
--
-- THIS REVERSES A DELIBERATE EARLIER DECISION, on the product owner's
-- instruction. Migration 20260912100000 chose ON DELETE SET NULL with
-- this reasoning: "Deleting a campaign definition is an administrative
-- tidy-up; it must never delete the record of messages actually sent to
-- real customers."
--
-- WHY IT IS BEING CHANGED
-- In practice SET NULL did not preserve that record, it stranded it. A
-- run's whole identity is its campaign: it has no audience of its own, no
-- name a person chose, and its only report lives on the campaign's page.
-- Detached, it became a row in the Broadcasts list called
-- "api camping (google_sheets)" that looked hand-made, belonged to
-- nothing, and could not be opened anywhere meaningful. Keeping it was
-- not keeping history, it was keeping litter.
--
-- WHAT IS ACTUALLY LOST vs KEPT — the important part
--   LOST: the `broadcasts` run rows and their `broadcast_recipients`
--         rows, i.e. the per-run delivery report (sent/delivered/read
--         timestamps, failure reasons, the values each recipient got).
--   KEPT: every real WhatsApp message and conversation. `messages`
--         references `broadcasts` with ON DELETE SET NULL (migration
--         20260911010000), so the Inbox thread survives intact and simply
--         stops being attributed to a campaign.
--
-- That split is what makes this safe: the customer-facing record — what
-- was said to whom, and their replies — is untouched. Only the reporting
-- layer for a campaign the operator chose to remove goes with it.
--
-- `broadcast_recipients.broadcast_id` is already ON DELETE CASCADE, so
-- one FK change propagates the whole way down; nothing else needs
-- altering. `api_campaign_sends.api_campaign_id` is likewise already
-- CASCADE, so the idempotency ledger for the deleted campaign goes too —
-- correct, since those keys are scoped per campaign and can never match
-- again once the campaign id is gone.
-- ============================================================

ALTER TABLE broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_api_campaign_id_fkey;

ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_api_campaign_id_fkey
  FOREIGN KEY (api_campaign_id)
  REFERENCES api_campaigns(id)
  ON DELETE CASCADE;

COMMENT ON COLUMN broadcasts.api_campaign_id IS
  'Set when this broadcast is one run of an API campaign (external trigger, e.g. the Google Sheets add-on). NULL for ordinary dashboard broadcasts. ON DELETE CASCADE: removing a campaign removes its runs and their per-recipient delivery reports. The messages themselves survive — messages.broadcast_id is ON DELETE SET NULL — so Inbox conversations are never lost.';
