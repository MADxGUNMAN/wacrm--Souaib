-- ============================================================
-- 079 — WhatsApp message usage alerts
--
-- "Tell me before I blow through my message budget." One alert per
-- account: a limit, a period, and threshold percentages. Modelled on an
-- AWS billing alarm, because that shape is already familiar and it is the
-- right one — a budget with warning steps, not a hard block.
--
-- Design decisions worth keeping:
--
--   CALENDAR periods, not rolling windows. An operator who types
--   "10,000 a month" means the calendar month, and a rolling 30-day
--   window would make the number drift and the reset unexplainable.
--   Week starts Monday (ISO), which is what `date_trunc('week')` does.
--
--   Thresholds are PERCENTAGES of the limit, so changing the limit does
--   not require re-entering them.
--
--   Each (period, threshold) fires exactly ONCE, enforced by a UNIQUE
--   index rather than by application logic. The cron runs every five
--   minutes; without that constraint a 100%-breached account would be
--   notified 288 times a day. Same reasoning as `record_webhook_failure`
--   in migration 028: do the state transition in SQL, because two
--   overlapping ticks would each read "not yet fired" and both insert.
-- ============================================================

-- Every element of an int array within [lo, hi]. IMMUTABLE so it can be
-- used from a CHECK constraint, which cannot contain a subquery itself.
CREATE OR REPLACE FUNCTION int_array_between(
  vals INTEGER[],
  lo INTEGER,
  hi INTEGER
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT vals IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(vals) AS v WHERE v < lo OR v > hi);
$$;

-- ── The alert configuration ─────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_usage_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- One per account. UNIQUE rather than a list: the question "how many
  -- messages may this workspace send this month" has one answer, and
  -- multiple overlapping budgets would need conflict rules nobody asked
  -- for.
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT false,

  -- 'weekly' | 'monthly'. Text + CHECK rather than an enum so a third
  -- period is a one-line migration (the enum pattern in 017 needed a
  -- separate ALTER TYPE and cannot be done inside a transaction).
  period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (period IN ('weekly', 'monthly')),

  -- Messages allowed in one period. NOT a Meta limit — Meta caps unique
  -- customers per 24h, which is a different thing entirely (see
  -- src/lib/whatsapp/usage.ts). This is the operator's own budget.
  message_limit INTEGER NOT NULL CHECK (message_limit > 0),

  -- Percentages of `message_limit` at which to notify, ascending.
  -- Defaults mirror a typical AWS budget: an early warning and the
  -- breach itself.
  thresholds INTEGER[] NOT NULL DEFAULT ARRAY[80, 100],

  -- Observability only. The UNIQUE index below is what guarantees
  -- correctness; this just answers "is the cron actually running?"
  last_evaluated_at TIMESTAMPTZ,
  last_usage_count INTEGER,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Guard rails on the array. Postgres cannot express "ascending" in a
  -- CHECK cheaply, but it can reject the shapes that break the UI.
  --
  -- The range test goes through an IMMUTABLE function because a CHECK
  -- constraint may not contain a subquery (0A000) — and element-wise
  -- comparison on an array is not something the operators give you:
  -- `thresholds >= ARRAY[1]` compares lexicographically, not per element,
  -- which would silently accept ARRAY[500].
  CONSTRAINT thresholds_not_empty CHECK (array_length(thresholds, 1) BETWEEN 1 AND 5),
  CONSTRAINT thresholds_in_range CHECK (int_array_between(thresholds, 1, 200))
);

DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_usage_alerts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_usage_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── One row per threshold actually fired ────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_usage_alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES whatsapp_usage_alerts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- '2026-08' for a month, '2026-W34' for an ISO week. Computed
  -- identically in SQL and TypeScript; see periodKey() in
  -- src/lib/alerts/usage-alerts.ts.
  period_key TEXT NOT NULL,
  threshold INTEGER NOT NULL,

  -- What the counter read when this fired. Kept so the history explains
  -- itself later, when the limit may have changed.
  usage_count INTEGER NOT NULL,
  message_limit INTEGER NOT NULL,
  notified_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE correctness guarantee. Everything else about firing is best-effort.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_alert_events_once
  ON whatsapp_usage_alert_events(alert_id, period_key, threshold);

CREATE INDEX IF NOT EXISTS idx_usage_alert_events_account
  ON whatsapp_usage_alert_events(account_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
--
-- Read: any member of the account. The SETTINGS SECTION is owner-only by
-- default, but that is a UI decision; a member who has been granted the
-- permission must be able to read the row, and hiding it from the others
-- buys nothing because the numbers are their own workspace's.
--
-- Write: owner only, in the database as well as the API. The API check
-- alone would be one forgotten `if` away from letting a member raise
-- their own budget.
ALTER TABLE whatsapp_usage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_usage_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_alerts_select ON whatsapp_usage_alerts;
CREATE POLICY usage_alerts_select ON whatsapp_usage_alerts FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS usage_alerts_write ON whatsapp_usage_alerts;
CREATE POLICY usage_alerts_write ON whatsapp_usage_alerts FOR ALL
  USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));

DROP POLICY IF EXISTS usage_alert_events_select ON whatsapp_usage_alert_events;
CREATE POLICY usage_alert_events_select ON whatsapp_usage_alert_events FOR SELECT
  USING (is_account_member(account_id));
-- No client write path at all: only the cron (service role) inserts.

-- ============================================================
-- Counting outbound messages for one account
--
-- `messages` has NO account_id — it has never had one — so every
-- per-account count must join through `conversations`. Doing that in SQL
-- rather than in the route matters here: the existing usage code in
-- /api/whatsapp/account-info pulls rows with `.limit(20000)` and counts
-- them in JS, which silently under-reports the moment a workspace sends
-- more than that in a period. A COUNT(*) has no such ceiling.
--
-- Counts every OUTBOUND message: 'agent' (a human here), 'bot' (an
-- automation or the AI) and 'business_app' (typed on the phone under
-- Coexistence). Deliberately different from the Meta-allowance figure in
-- src/lib/whatsapp/usage.ts, which excludes business_app because those
-- are free. This alert answers "how much did we send", not "what will
-- Meta bill", so everything the workspace sent counts.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_account_outbound_message_count(
  target_account_id UUID,
  since TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.account_id = target_account_id
    AND m.created_at >= since
    AND m.sender_type IN ('agent', 'bot', 'business_app');
$$;

ALTER FUNCTION fn_account_outbound_message_count(UUID, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION fn_account_outbound_message_count(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_account_outbound_message_count(UUID, TIMESTAMPTZ)
  TO authenticated, service_role;

-- Supports the join above. Without it, counting a month of messages for
-- one account scans every message on the platform.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_sender
  ON messages(conversation_id, created_at)
  WHERE sender_type IN ('agent', 'bot', 'business_app');

-- ============================================================
-- notifications — a second type, and somewhere to send the click
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'usage_threshold'));

-- Until now every notification was about a conversation, so the click
-- target could be derived from conversation_id. A usage alert has no
-- conversation, and a notification you cannot act on is just noise.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link TEXT;

COMMENT ON COLUMN notifications.link IS
  'In-app path to open when the notification is clicked, e.g. '
  '/settings?tab=alerts. NULL for conversation notifications, which route '
  'from conversation_id instead.';
