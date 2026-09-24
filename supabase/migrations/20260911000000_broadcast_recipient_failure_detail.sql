-- ============================================================
-- Preserve Meta's failure reason on a broadcast recipient.
--
-- ─── The bug this closes ──────────────────────────────────────────
--
-- A broadcast recipient could sit at status 'failed' with a `sent_at`
-- timestamp, a wamid, and NOTHING in `error_message` — a red "Failed"
-- badge next to an empty Error column, with no way to find out why.
--
-- The reason was reaching us and then being thrown away. The status
-- webhook already parses Meta's `errors[]` properly (code, title,
-- error_data.details, href) and hands it to `fn_apply_message_status`,
-- which writes it onto `messages`. But a BROADCAST send never creates a
-- `messages` row — the fan-out calls Meta directly and records progress
-- only on `broadcast_recipients` — so that RPC matched zero rows and the
-- detail was discarded. The recipient mirror right below it copied only
-- `status` and a timestamp.
--
-- That matters because of WHEN the reason exists. Meta can accept a
-- message (returning a wamid, so it is stored as sent) and only report
-- the failure minutes later. The status webhook is then the sole carrier
-- of the cause, and it arrives exactly once.
--
-- `error_message` already exists on this table and is written by the
-- send-time path. These two columns bring the webhook path up to the
-- same fidelity as `messages`, so the two failure sources are equally
-- diagnosable.
-- ============================================================

-- Meta's numeric code as text ('131049'), or a sentinel like
-- 'delivery_failed' when Meta reports a failure with no code. Text
-- rather than integer to match `messages.error_code` and to leave room
-- for those non-numeric sentinels.
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS error_code TEXT;

COMMENT ON COLUMN broadcast_recipients.error_code IS
  'Meta error code for a failed send, as text (e.g. 131049), or a sentinel such as delivery_failed. NULL when the send did not fail or Meta reported no code.';

-- The whole failure payload, kept verbatim: code, title, raw_message,
-- details, href, plus `source` distinguishing a send-time rejection from
-- a later delivery failure. Those two have different causes and
-- different fixes, and this row is the only place that distinction
-- survives.
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS error_details JSONB;

COMMENT ON COLUMN broadcast_recipients.error_details IS
  'Verbatim Meta failure payload: { code, title, raw_message, details, href, source }. source=status_webhook means Meta accepted the send then reported failure later; send_time means Meta rejected it outright.';

-- Failed rows are a small minority of any broadcast, so a partial index
-- keeps this cheap while making "show me what went wrong" queries and
-- per-code aggregation fast.
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_failed_code
  ON broadcast_recipients (error_code)
  WHERE status = 'failed';
