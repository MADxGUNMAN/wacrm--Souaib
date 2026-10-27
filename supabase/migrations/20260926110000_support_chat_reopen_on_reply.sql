-- ============================================================
-- A closed support thread reopens when the customer writes again.
--
-- `status` exists so an operator can clear a handled thread out of their
-- view. Without this, closing one is a trap: the customer replies "that
-- didn't work", the thread stays closed, and it sits filtered out of the
-- inbox while they wait. The unread counter would still tick up, but an
-- operator filtering to Open — which is the entire reason to have the
-- filter — would never see it.
--
-- ─── Why here and not in the route ───────────────────────────
--
-- `fn_support_chat_after_send` is already the single place every send
-- passes through to bump the unread counters, and it already knows which
-- side sent. Putting the reopen anywhere else means a second code path
-- that has to stay in agreement with this one.
--
-- Only a CUSTOMER message reopens. An operator replying to a thread they
-- just closed is finishing up, not restarting.
-- ============================================================

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
    -- A customer message reopens a closed thread; an operator's does not.
    status = CASE
      WHEN NOT p_from_admin THEN 'open'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = p_conversation_id;
$$;

ALTER FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  OWNER TO postgres;

-- CREATE OR REPLACE preserves the existing ACL, but re-stating it costs
-- nothing and means this migration is correct in isolation. See
-- 20260925122000 for why naming the roles is required: the schema's
-- default privileges hand EXECUTE to anon and authenticated at creation,
-- and REVOKE ... FROM PUBLIC does not take it back.
REVOKE ALL ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT) IS
  'Called by the send route on the service-role client. One UPDATE so the counter increment cannot lose an update against a concurrent send. Also reopens a closed thread when the sender is the customer, so closing a thread can never bury a follow-up.';
