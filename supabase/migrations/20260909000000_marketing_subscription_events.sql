-- ============================================================
-- 20260909000000_marketing_subscription_events
--
-- Gives the opt-out feature a HISTORY, so "Subscribed" can carry a date
-- and a reason instead of being inferred from an absence.
--
-- WHY THIS EXISTS
--
-- `marketing_opt_outs` (migration 20260831000000) is a negative index:
-- a row means suppressed, no row means sendable. That is the right shape
-- for enforcement — one batched query answers a whole broadcast — but it
-- destroys the record on re-subscribe, because removeMarketingOptOut()
-- DELETEs the row. After that delete there is no way to answer any of:
--
--   * when did this customer subscribe?
--   * did they ever unsubscribe, or were they always subscribed?
--   * who re-subscribed them, and did the customer ask for it?
--
-- The last one matters most. Re-subscribing somebody who asked to be
-- left alone is the exact harm the opt-out feature exists to prevent, and
-- until now it left no trace at all.
--
-- DESIGN DECISIONS WORTH KEEPING
--
-- This table is ADDITIVE and enforcement does NOT read it. Nothing in the
-- send paths changes: `marketing_opt_outs` remains the only thing
-- filterOptedOutPhones() consults. Deriving "is this number suppressed?"
-- by finding each phone's newest event would turn one indexed IN() lookup
-- into a per-phone ordered scan on the hottest query in the broadcast
-- path, and would make suppression depend on the audit log being
-- complete. The index stays authoritative; this is the paper trail.
--
-- Consequence, stated plainly because it is the one thing that could
-- mislead a future reader: the two CAN disagree. If an event write fails
-- while the suppression write succeeded, the customer is still correctly
-- suppressed and only the history is short a row. That is the safe
-- direction, and it is why the event writes are best-effort in
-- TypeScript rather than wrapped in a transaction with the index write.
--
-- Keyed on phone_normalized, matching marketing_opt_outs, for the same
-- load-bearing reason: opt-outs must survive contact deletion and CSV
-- re-import. contact_id is audit convenience only.
--
-- APPEND-ONLY. There are SELECT and INSERT policies and deliberately no
-- UPDATE or DELETE policy, so RLS refuses both for every client. A
-- consent record that can be edited afterwards is not evidence of
-- anything.
--
-- Idempotent — safe to run multiple times. Written without reliance on a
-- surrounding transaction, because docker/supabase/migrate.sh applies
-- each file with autocommit per statement.
-- ============================================================


-- ------------------------------------------------------------
-- The lifecycle log.
--
-- One row per transition. 'unsubscribed' and 'subscribed' are the only
-- two states a number can be in, so the newest row for a phone is its
-- current status and its `occurred_at` is the date the UI shows.
--
-- Repeat events are NOT recorded: a customer sending STOP twice produces
-- one row, because recordMarketingOptOut() only writes an event when the
-- claim-insert actually created the suppression row. Logging the second
-- STOP would imply their consent changed twice when it changed once.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_subscription_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Digits-only phone. Mirrors marketing_opt_outs.phone_normalized and
  -- contacts.phone_normalized (migration 022). It is the identity.
  phone_normalized text NOT NULL,

  -- Audit convenience only, nullable on purpose: a contact deleted and
  -- re-imported gets a new id but keeps the same number, and the history
  -- must survive that.
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- The transition. Named for the customer-facing words the CRM shows
  -- ("Subscribed" / "Unsubscribed") rather than opt_in/opt_out, so the
  -- column reads the same as the UI it drives.
  event            text NOT NULL CHECK (event IN ('subscribed', 'unsubscribed')),

  -- Same vocabulary as marketing_opt_outs.source so the two tables can be
  -- reported on together. Note meta_131050 can only ever accompany an
  -- 'unsubscribed' event — Meta never tells us somebody opted back IN —
  -- but that is left to the application rather than a CHECK, because a
  -- constraint pairing every source with an event would have to be
  -- rewritten every time a source is added.
  source           text NOT NULL CHECK (source IN (
                     'customer_keyword',  -- replied STOP / START
                     'customer_button',   -- tapped an opt-out / re-subscribe button
                     'meta_131050',       -- Meta reported it on a send attempt
                     'agent',             -- a human in the CRM
                     'api',               -- the public API
                     'import'             -- bulk-loaded list
                   )),

  -- WHO did it, when a person did. NULL for customer-driven and
  -- Meta-driven events, which is most of them. ON DELETE SET NULL: a
  -- departed team member must not take the consent record with them.
  actor_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  occurred_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketing_subscription_events_phone_not_blank
    CHECK (phone_normalized <> '')
);

COMMENT ON TABLE marketing_subscription_events IS
  'Append-only subscription lifecycle log. The newest row per (account_id, phone_normalized) is that number''s current status and the date shown in the CRM. Deliberately NOT read by enforcement — marketing_opt_outs remains the authoritative suppression index.';
COMMENT ON COLUMN marketing_subscription_events.phone_normalized IS
  'Digits-only phone, mirroring marketing_opt_outs.phone_normalized. The identity, so history survives contact deletion and CSV re-import.';
COMMENT ON COLUMN marketing_subscription_events.event IS
  'The transition: subscribed or unsubscribed. Repeat events in the same direction are not logged, so a customer sending STOP twice yields one row.';
COMMENT ON COLUMN marketing_subscription_events.actor_user_id IS
  'The team member responsible, when a person acted. NULL for customer-driven (keyword/button) and Meta-reported events.';

-- The status lookup: newest event for one number. Ordered DESC in the
-- index so "current status" is an index-only read of the first row rather
-- than a sort over a number's whole history.
CREATE INDEX IF NOT EXISTS idx_marketing_subscription_events_phone
  ON marketing_subscription_events (account_id, phone_normalized, occurred_at DESC);

COMMENT ON INDEX idx_marketing_subscription_events_phone IS
  'Serves "current status and since-date for this number" as a first-row read. occurred_at DESC so no sort is needed.';

-- The account-wide history feed and the date-ranged trend counts.
CREATE INDEX IF NOT EXISTS idx_marketing_subscription_events_account_time
  ON marketing_subscription_events (account_id, occurred_at DESC);

ALTER TABLE marketing_subscription_events ENABLE ROW LEVEL SECURITY;

-- Reads: any member. Knowing that a contact unsubscribed last Tuesday is
-- ordinary inbox context, and the same tier already reads
-- marketing_opt_outs.
DROP POLICY IF EXISTS marketing_subscription_events_select ON marketing_subscription_events;
CREATE POLICY marketing_subscription_events_select ON marketing_subscription_events FOR SELECT
  USING (is_account_member(account_id));

-- Inserts: agent tier, matching marketing_opt_outs_write — an agent who
-- can re-subscribe a contact must be able to log that they did.
--
-- INSERT only, and there is intentionally no UPDATE or DELETE policy.
-- With RLS enabled, an operation without a permissive policy is refused,
-- which is what makes this table append-only for every client. The
-- webhook and send paths use the service role and bypass RLS entirely.
DROP POLICY IF EXISTS marketing_subscription_events_insert ON marketing_subscription_events;
CREATE POLICY marketing_subscription_events_insert ON marketing_subscription_events FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));


-- ------------------------------------------------------------
-- Backfill: give every number already on the suppression list one
-- 'unsubscribed' event.
--
-- Without this, an existing opted-out contact would show "Unsubscribed"
-- with no date while the suppression row plainly knows when it happened —
-- the status line would look broken on exactly the contacts the feature
-- is about.
--
-- `opted_out_at` is carried over rather than defaulting to now(), so the
-- backfilled history is accurate and not a timestamp of when this
-- migration ran. NOT EXISTS keeps a re-run from doubling the rows.
--
-- Numbers that never opted out get NO row, deliberately. Inventing a
-- 'subscribed' event dated now() would assert a consent moment that did
-- not happen; the application treats "no events and no suppression row"
-- as subscribed-with-no-recorded-date and falls back to the contact's
-- own created_at for display.
-- ------------------------------------------------------------
INSERT INTO marketing_subscription_events (
  account_id, phone_normalized, contact_id, event, source, occurred_at, created_at
)
SELECT
  o.account_id,
  o.phone_normalized,
  o.contact_id,
  'unsubscribed',
  o.source,
  o.opted_out_at,
  o.created_at
FROM marketing_opt_outs o
WHERE NOT EXISTS (
  SELECT 1
  FROM marketing_subscription_events e
  WHERE e.account_id = o.account_id
    AND e.phone_normalized = o.phone_normalized
);
