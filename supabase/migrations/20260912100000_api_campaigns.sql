-- ============================================================
-- API Campaigns — reusable, recipient-less campaigns that an
-- external system (the Google Sheets add-on, a customer's own
-- backend) can send through repeatedly.
--
-- ─── Why this is not a column on `broadcasts` ─────────────────────
--
-- The obvious cheaper move is `broadcasts.campaign_type = 'api'` plus
-- relaxing the "recipients required" rule. That breaks three invariants
-- `broadcasts` currently holds, and each break is silent:
--
--   1. `total_recipients` is written at INSERT time. An API campaign has
--      no audience when it is created and accumulates recipients for as
--      long as it exists.
--
--   2. The per-status count columns (sent/delivered/read/replied/failed)
--      are owned by a DB aggregate trigger (migrations 003/005) derived
--      from `broadcast_recipients`. On a campaign that runs forever those
--      become lifetime totals with no denominator — meaningless sitting
--      in the same column as a one-shot broadcast's counts.
--
--   3. `status` has terminal states ('sent'/'failed') that the scheduled
--      sweep and the CHECK constraint both reason about. An API campaign
--      is 'active'/'paused' and never terminal.
--
-- So the definition lives here, and every send THROUGH a campaign still
-- creates a real `broadcasts` row pointing back at it. That way counts,
-- opt-out suppression, Inbox linkage (`messages.broadcast_id`), delivery
-- webhook status matching and the recipient failure dialog all keep
-- working with no changes at all — because an API campaign run *is* a
-- broadcast.
--
-- The campaigns list in the dashboard is then a union of `api_campaigns`
-- and `broadcasts WHERE api_campaign_id IS NULL`.
--
-- Plan: docs/google-sheets-addon-plan.md §5
-- ============================================================

-- ------------------------------------------------------------
-- 1. The campaign definition
-- ------------------------------------------------------------
--
-- Deliberately tiny: a name bound to a template. That is the entire
-- model the reference product exposes, and anything more would be
-- guessing at requirements.

CREATE TABLE IF NOT EXISTS api_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name              text NOT NULL,
  template_name     text NOT NULL,
  template_language text NOT NULL DEFAULT 'en_US',
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- The add-on's rule wizard picks a campaign BY NAME from a dropdown.
  -- Two campaigns sharing a name inside one account would make a stored
  -- rule ambiguous forever, and the add-on has no way to disambiguate.
  CONSTRAINT api_campaigns_name_unique_per_account UNIQUE (account_id, name)
);

-- Every list query is "this account's campaigns, newest first".
CREATE INDEX IF NOT EXISTS api_campaigns_account_idx
  ON api_campaigns (account_id, created_at DESC);

ALTER TABLE api_campaigns ENABLE ROW LEVEL SECURITY;

-- Mirrors the `broadcasts` policies from 017: any member can see the
-- roster, agent+ can change it. A campaign is operational, not
-- settings-class, so it is not admin-gated.
DROP POLICY IF EXISTS api_campaigns_select ON api_campaigns;
CREATE POLICY api_campaigns_select ON api_campaigns FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS api_campaigns_insert ON api_campaigns;
CREATE POLICY api_campaigns_insert ON api_campaigns FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS api_campaigns_update ON api_campaigns;
CREATE POLICY api_campaigns_update ON api_campaigns FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS api_campaigns_delete ON api_campaigns;
CREATE POLICY api_campaigns_delete ON api_campaigns FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Keep `updated_at` honest using the trigger function from 001.
DROP TRIGGER IF EXISTS set_updated_at ON api_campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 2. Link each run back to its campaign
-- ------------------------------------------------------------
--
-- ON DELETE SET NULL, not CASCADE — the same reasoning already applied
-- to `messages.broadcast_id`. Deleting a campaign definition is an
-- administrative tidy-up; it must never delete the record of messages
-- actually sent to real customers, nor the conversations they started.
-- A run whose campaign was deleted simply becomes a standalone
-- broadcast in the history.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS api_campaign_id uuid
    REFERENCES api_campaigns(id) ON DELETE SET NULL;

-- Partial: the overwhelming majority of broadcasts are dashboard sends
-- with no campaign, and they should not pay for this index. Ordered by
-- created_at DESC because the only query is "this campaign's runs,
-- newest first" on the campaign detail screen.
CREATE INDEX IF NOT EXISTS idx_broadcasts_api_campaign
  ON broadcasts (api_campaign_id, created_at DESC)
  WHERE api_campaign_id IS NOT NULL;

COMMENT ON COLUMN broadcasts.api_campaign_id IS
  'Set when this broadcast is one run of an API campaign (external trigger, e.g. the Google Sheets add-on). NULL for ordinary dashboard broadcasts. ON DELETE SET NULL so removing a campaign never deletes send history.';

-- ------------------------------------------------------------
-- 3. Idempotency for externally triggered sends
-- ------------------------------------------------------------
--
-- The hardest correctness problem in this feature, and the one that
-- costs money when it is wrong.
--
-- A Google Sheets `onChange` trigger can fire more than once for what
-- the user experienced as a single edit. A paste, a fill-down, or an
-- undo all generate change events. A daily reminder sweep re-examines
-- every row it examined yesterday. Any of these can present the same
-- logical send twice.
--
-- A duplicate is not a cosmetic bug: it is a second paid WhatsApp
-- message arriving on a customer's phone, and at sheet scale it happens
-- hundreds of times before anyone notices.
--
-- So the caller computes a deterministic key and this table's UNIQUE
-- constraint is what enforces it — a claim-insert, the same pattern
-- `recordMarketingOptOut` and the usage-alert cron already use. The
-- database refuses the duplicate; the application does not have to win
-- a race to prevent it.
--
-- Key recipe (computed add-on side, see plan §5.3):
--   sha256(spreadsheetId | sheetId | ruleId | rowIdentity | fireDate?)
-- `fireDate` is present for time-based reminders (so a row may send once
-- per day) and ABSENT for row-added / on-change rules (so a row sends
-- exactly once, ever).

CREATE TABLE IF NOT EXISTS api_campaign_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  api_campaign_id uuid NOT NULL REFERENCES api_campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  -- Which run satisfied this key. Lets a replay return the original
  -- broadcast id instead of a bare "duplicate" with nothing to poll.
  broadcast_id    uuid REFERENCES broadcasts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT api_campaign_sends_key_unique
    UNIQUE (api_campaign_id, idempotency_key)
);

-- Scoped per campaign rather than per account on purpose: the same sheet
-- row legitimately sends through two different campaigns (an order
-- confirmation and, later, a review request).

CREATE INDEX IF NOT EXISTS api_campaign_sends_account_idx
  ON api_campaign_sends (account_id, created_at DESC);

ALTER TABLE api_campaign_sends ENABLE ROW LEVEL SECURITY;

-- Read-only to the dashboard. Rows are written exclusively by the
-- public API using the service-role client, which bypasses RLS — so
-- there is deliberately no INSERT/UPDATE/DELETE policy. A client with a
-- session has no legitimate reason to forge an idempotency claim, and
-- being able to would let it suppress a send it should not.
DROP POLICY IF EXISTS api_campaign_sends_select ON api_campaign_sends;
CREATE POLICY api_campaign_sends_select ON api_campaign_sends FOR SELECT
  USING (is_account_member(account_id));

COMMENT ON TABLE api_campaign_sends IS
  'Idempotency ledger for externally triggered campaign sends. UNIQUE (api_campaign_id, idempotency_key) is the duplicate-send guard; a claim-insert that violates it means "already sent" and must NOT send again. Written only by /api/v1 via the service-role client.';
