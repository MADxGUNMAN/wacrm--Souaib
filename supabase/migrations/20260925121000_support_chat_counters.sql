-- ============================================================
-- Support chat: atomic counter + read-receipt helpers.
--
-- WHY THESE ARE SQL FUNCTIONS AND NOT ROUTE CODE
--
-- Both operations are read-modify-write on a shared counter. Doing
-- `select unread, then update unread + 1` from the route is a
-- lost-update race the moment two messages land in the same instant:
-- both reads see the same value and the second write erases the first.
-- The same trap is already documented in this repo for
-- `record_webhook_failure` and for the usage-alert dedupe, both of which
-- were moved to set-based SQL for exactly this reason.
--
-- Expressed as a single UPDATE so Postgres's row lock does the
-- serialising, with no explicit transaction needed in the caller.
--
-- Called only by the service-role client from the send / read routes, so
-- EXECUTE is revoked from PUBLIC and never granted to `authenticated`:
-- a browser must not be able to zero its own unread counter or forge a
-- read receipt at /rest/v1/rpc. Follows the GRANT HARDENING section of
-- 20260827000000_super_admin_notifications.sql, which found that
-- REVOKE FROM PUBLIC alone was insufficient in this project.
-- ============================================================

-- ------------------------------------------------------------
-- After a send: refresh the list row, bump the OTHER side's unread
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_support_chat_after_send(
  p_conversation_id UUID,
  p_from_admin BOOLEAN,
  p_preview TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE support_conversations
  SET
    last_message_at      = NOW(),
    last_message_preview = p_preview,
    -- Only the recipient's counter moves. The sender has, by
    -- definition, read their own message.
    unread_for_account = CASE
      WHEN p_from_admin THEN unread_for_account + 1
      ELSE unread_for_account
    END,
    unread_for_admin = CASE
      WHEN p_from_admin THEN unread_for_admin
      ELSE unread_for_admin + 1
    END,
    updated_at = NOW()
  WHERE id = p_conversation_id;
$$;

ALTER FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  FROM PUBLIC;

COMMENT ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT) IS
  'Called by the send route on the service-role client. One UPDATE so the counter increment cannot lose an update against a concurrent send. Not granted to authenticated: a browser must not be able to move these counters.';

-- ------------------------------------------------------------
-- On open: clear my unread, stamp read_at on what I just read
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_support_chat_mark_read(
  p_conversation_id UUID,
  p_as_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stamp only messages from the OTHER side, and only those not already
  -- stamped. `read_at IS NULL` keeps the FIRST read time rather than
  -- overwriting it every time the pane is reopened — otherwise "read at"
  -- would really mean "last looked at".
  UPDATE support_messages
  SET read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND read_at IS NULL
    AND sender_kind = CASE WHEN p_as_admin THEN 'account' ELSE 'admin' END;

  UPDATE support_conversations
  SET
    unread_for_admin = CASE WHEN p_as_admin THEN 0 ELSE unread_for_admin END,
    unread_for_account = CASE WHEN p_as_admin THEN unread_for_account ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$;

ALTER FUNCTION public.fn_support_chat_mark_read(UUID, BOOLEAN)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_support_chat_mark_read(UUID, BOOLEAN)
  FROM PUBLIC;

COMMENT ON FUNCTION public.fn_support_chat_mark_read(UUID, BOOLEAN) IS
  'Called by the read route on the service-role client. Stamps read_at on the other side''s unread messages and zeroes only the caller''s counter.';
