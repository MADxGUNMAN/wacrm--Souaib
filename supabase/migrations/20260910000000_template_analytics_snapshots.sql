-- ============================================================
-- Template analytics snapshots.
--
-- WHY THIS TABLE EXISTS
--
-- Meta's template analytics is not a durable record, it is a short
-- window onto recent activity, and it loses data in two documented ways:
--
--   1. Read and click events are retained for only 7 DAYS after a
--      message is sent. After that Meta resets those counts to zero and
--      never reports them again. So a template that was opened by 40
--      people last month reads as 0 reads today, forever.
--
--   2. The whole lookback is capped at 90 days. Older activity is simply
--      gone, so there is no way to answer "how did this template perform
--      last quarter" by asking Meta.
--
-- Both mean the only way an operator can ever see a true long-run figure
-- is if WE keep what Meta told us the first time it told us. This table
-- is that record: one row per template per UTC day, written whenever a
-- live fetch reveals a day we have not stored yet, or reveals higher
-- numbers than we stored before.
--
-- THE DEDUPLICATION GUARANTEE
--
-- UNIQUE (template_id, day) is the whole safety mechanism. Every write
-- is an upsert against it, so opening the insights dialog ten times
-- cannot produce ten rows or add a day's numbers to themselves — it
-- updates the one row that day owns. Aggregates read from this table can
-- therefore never double count, no matter how often analytics is
-- refreshed.
--
-- WHY MERGES TAKE THE MAXIMUM, NOT THE LATEST
--
-- Because of retention decay above, "latest" is the WRONG rule: a fetch
-- made 8 days after a send legitimately reports 0 reads, and letting
-- that overwrite a stored 40 would destroy the only copy of the truth.
-- The merge keeps the highest figure ever observed for each metric,
-- which for stable metrics (sent, delivered, spend) is identical to the
-- latest value, and for decaying ones preserves the real peak. The
-- comparison lives in application code (template-analytics-store.ts) so
-- the reasoning sits beside the retention rules it depends on.
-- ============================================================

CREATE TABLE IF NOT EXISTS template_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Our row id. Cascades so snapshots die with the template they
  -- describe rather than lingering as unattributable numbers.
  template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,

  -- Meta's id, kept alongside ours: a template can be deleted and
  -- recreated locally, and this is what ties a snapshot back to the
  -- thing Meta was actually reporting on.
  meta_template_id TEXT NOT NULL,

  -- The UTC day these figures belong to. Meta buckets daily in UTC and
  -- snaps request boundaries to 00:00 UTC, so a DATE is the exact
  -- resolution of the source data — storing a timestamp would imply a
  -- precision Meta does not provide.
  day DATE NOT NULL,

  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0),
  delivered INTEGER NOT NULL DEFAULT 0 CHECK (delivered >= 0),
  read INTEGER NOT NULL DEFAULT 0 CHECK (read >= 0),
  clicked INTEGER NOT NULL DEFAULT 0 CHECK (clicked >= 0),
  unique_clicked INTEGER NOT NULL DEFAULT 0 CHECK (unique_clicked >= 0),

  -- NULL means "Meta did not report a cost", which is NOT the same as
  -- zero. Meta withholds cost entirely for accounts billed through a
  -- Solution Partner's credit line, and rendering that as free would be
  -- a lie about money.
  amount_spent NUMERIC(14, 6) CHECK (amount_spent IS NULL OR amount_spent >= 0),

  -- The WABA's billing currency at the time of capture. Denormalised on
  -- purpose: a workspace can change currency, and a historic figure must
  -- keep the unit it was actually charged in.
  currency TEXT,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per template per day, forever. See the header.
  CONSTRAINT template_analytics_daily_unique UNIQUE (template_id, day)
);

-- The only read pattern: "this account's snapshots for these templates
-- across a date range".
CREATE INDEX IF NOT EXISTS idx_template_analytics_daily_account_day
  ON template_analytics_daily (account_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_template_analytics_daily_template_day
  ON template_analytics_daily (template_id, day DESC);

ALTER TABLE template_analytics_daily ENABLE ROW LEVEL SECURITY;

-- Members of the account can read their own numbers.
DROP POLICY IF EXISTS template_analytics_daily_select ON template_analytics_daily;
CREATE POLICY template_analytics_daily_select
  ON template_analytics_daily FOR SELECT
  USING (is_account_member(account_id));

-- No client INSERT/UPDATE/DELETE policy, deliberately, matching
-- automation_logs and flow_runs: these rows are a server-side cache of
-- what Meta reported, written only by the service role. A client that
-- could write here could fabricate its own billing history.
