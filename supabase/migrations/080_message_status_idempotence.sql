-- ============================================================
-- Migration 080: make inbound status webhooks idempotent
--
-- THE BUG
-- `handleStatusUpdate` in the webhook wrote the lifecycle timestamps
-- unconditionally:
--
--   if (status.status === 'delivered') statusPatch.delivered_at = tsIso;
--
-- Meta redelivers status webhooks (at-least-once delivery) and does not
-- guarantee order. So a replayed `delivered` overwrote the ORIGINAL
-- delivered_at with a later clock reading, and a replayed `sent` arriving
-- after `read` dragged `messages.status` back down to 'sent' — a message
-- the customer had already read showed a single tick.
--
-- Both are silently wrong rather than broken: the Message Info panel
-- built on these columns displayed a confident, incorrect timestamp.
-- `broadcast_recipients` already had a ladder guard for exactly this
-- reason; `messages` never got one.
--
-- WHY THIS IS SQL AND NOT A READ-THEN-WRITE IN THE ROUTE
-- Two overlapping webhook deliveries would both read "delivered_at is
-- null" and both write. The check and the write have to be one
-- statement. `COALESCE` is that statement: first writer wins, every
-- replay is a no-op.
--
-- It also has to be set-based. `messages.message_id` is NOT unique
-- (migration 009 — Meta ids repeat across phone numbers), so this
-- updates 0..N rows and cannot assume a single row to read back.
-- ============================================================

-- ---------------------------------------------------------------
-- Success-ladder rank for a message status.
--
-- Mirrors RECIPIENT_STATUS_LADDER in the webhook, minus the two
-- broadcast-only states ('pending', 'replied').
--
-- 'failed' deliberately returns -1 rather than a rank. It is not a point
-- on the ladder, it is a side branch: a send can fail and then be
-- retried successfully, and that later success must be allowed to
-- overwrite the failure. Giving it rank -1 means any real status beats
-- it, which is the behaviour the route already had.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION message_status_rank(p_status TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_status
           WHEN 'sending'   THEN 0
           WHEN 'sent'      THEN 1
           WHEN 'delivered' THEN 2
           WHEN 'read'      THEN 3
           ELSE -1
         END;
$$;

COMMENT ON FUNCTION message_status_rank(TEXT) IS
  'Forward-only rank for messages.status. Returns -1 for failed/unknown so a later real status can overwrite a failure.';

-- ---------------------------------------------------------------
-- Apply one Meta status webhook to every matching message row.
--
-- Returns the number of rows touched so the caller can log a miss
-- (a status for a wamid we never stored) distinctly from a failure.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_message_status(
  p_message_id    TEXT,
  p_status        TEXT,
  p_ts            TIMESTAMPTZ,
  p_error_code    TEXT    DEFAULT NULL,
  p_error_message TEXT    DEFAULT NULL,
  p_error_details JSONB   DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE messages m
  SET
    -- Never regress. An out-of-order or replayed webhook that ranks at or
    -- below what we already have leaves the status alone.
    status = CASE
               WHEN p_status = 'failed'
                 THEN 'failed'
               WHEN message_status_rank(p_status) > message_status_rank(m.status)
                 THEN p_status
               ELSE m.status
             END,

    -- First writer wins on each timestamp. A replay is a no-op, so the
    -- Message Info panel keeps the moment Meta ACTUALLY reported.
    sent_at = CASE
                WHEN p_status = 'sent' THEN COALESCE(m.sent_at, p_ts)
                ELSE m.sent_at
              END,
    delivered_at = CASE
                     WHEN p_status = 'delivered' THEN COALESCE(m.delivered_at, p_ts)
                     ELSE m.delivered_at
                   END,
    read_at = CASE
                WHEN p_status = 'read' THEN COALESCE(m.read_at, p_ts)
                ELSE m.read_at
              END,

    -- Failure detail is replaced when this IS a failure carrying detail,
    -- and cleared on any non-failure so a retried-then-delivered message
    -- stops showing a stale red reason underneath it.
    --
    -- COALESCE on the failed branch matters: Meta sometimes sends a
    -- `failed` status with an empty `errors` array. Assigning p_error_code
    -- straight through would then WIPE the reason we captured from the
    -- first delivery of the same failure, which is the only place that
    -- reason ever exists.
    error_code    = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_code, m.error_code)       ELSE NULL END,
    error_message = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_message, m.error_message) ELSE NULL END,
    error_details = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_details, m.error_details) ELSE NULL END
  WHERE m.message_id = p_message_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION fn_apply_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) IS
  'Idempotently applies a Meta status webhook to messages: forward-only status, COALESCE on lifecycle timestamps. Service role only.';

-- Only the webhook (service role) may move message status. Left callable
-- by `authenticated` this would let any signed-in user mark an arbitrary
-- wamid as read.
REVOKE ALL ON FUNCTION fn_apply_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_apply_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION fn_apply_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_apply_message_status(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO service_role;
