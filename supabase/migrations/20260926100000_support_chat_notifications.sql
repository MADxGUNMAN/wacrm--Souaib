-- ============================================================
-- Tell the operators when a customer writes in.
--
-- Without this the Live Chat feature only works if somebody happens to be
-- looking at /super-admin/live-chat. A customer with a broken integration
-- types a message, sees it delivered, and waits — while nothing anywhere
-- in the admin panel indicates it arrived. That is worse than not having
-- the channel, because the customer now believes they have reached us.
--
-- ─── Why a trigger and not the send route ─────────────────────
--
-- `fn_sa_notify` has EXECUTE revoked from PUBLIC, anon AND authenticated;
-- every existing notification in this system is created by a SECURITY
-- DEFINER trigger, and there is no TypeScript helper for it at all. Adding
-- one would mean either a new RPC or a service-role insert that bypasses
-- the `type` CHECK's only enforcement point. Following the six triggers
-- already in 20260827000000 keeps one creation path.
--
-- ─── Why only the customer's messages ────────────────────────
--
-- `sender_kind = 'admin'` is an operator replying. Notifying the operators
-- about their own replies would make the bell a mirror.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Admit the new type
-- ------------------------------------------------------------
-- Recreated rather than altered: Postgres has no ALTER CONSTRAINT for a
-- CHECK body, which is the same reason every constraint in the support
-- chat migrations is dropped and re-added.
ALTER TABLE public.super_admin_notifications
  DROP CONSTRAINT IF EXISTS super_admin_notifications_type_check;

ALTER TABLE public.super_admin_notifications
  ADD CONSTRAINT super_admin_notifications_type_check
  CHECK (type IN (
    'account_created',
    'account_banned',
    'payment_requested',
    'payment_verified',
    'payment_rejected',
    'contact_submitted',
    'newsletter_subscribed',
    'template_rejected',
    'subscription_expiring',
    -- New: a workspace sent a message in the in-app support chat.
    'support_message_received'
  ));

-- ------------------------------------------------------------
-- 2. How long one conversation stays "already reported"
-- ------------------------------------------------------------
-- A support conversation is a CONVERSATION: somebody describing a problem
-- sends four messages in ninety seconds. One notification per message
-- would bury the other nine notification types and train operators to
-- ignore the bell, which is the failure mode this whole system was built
-- to fix.
--
-- Throttling on "has this conversation notified recently" rather than on
-- the unread counter is deliberate. The counter is bumped by
-- `fn_support_chat_after_send` AFTER the row is inserted, so at trigger
-- time it still holds its previous value — a rule written against it
-- would silently depend on the order of two statements in a route
-- handler, and would start double-notifying the day someone reorders
-- them. A time window depends on nothing.
CREATE OR REPLACE FUNCTION public.sa_notify_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_name TEXT;
  v_preview TEXT;
  v_recent BOOLEAN;
BEGIN
  -- Operators replying to themselves is not news.
  IF NEW.sender_kind <> 'account' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM super_admin_notifications n
    WHERE n.entity_type = 'support_conversation'
      AND n.entity_id = NEW.conversation_id
      AND n.created_at > NOW() - INTERVAL '15 minutes'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_account_name FROM accounts WHERE id = NEW.account_id;

  -- Mirrors buildSupportPreview in src/lib/support-chat/validation.ts: the
  -- caption wins when an attachment has one, otherwise a named label so a
  -- notification never reads as an empty message.
  v_preview := CASE
    WHEN NEW.content_type = 'text' THEN NEW.content_text
    WHEN NULLIF(BTRIM(COALESCE(NEW.content_text, '')), '') IS NOT NULL
      THEN NEW.content_text
    WHEN NEW.content_type = 'image' THEN 'Sent a photo'
    WHEN NEW.content_type = 'document' THEN 'Sent a document'
    WHEN NEW.content_type = 'audio' THEN 'Sent a voice note'
    ELSE 'Sent an attachment'
  END;

  -- Collapsed to one line and clipped. The bell renders this with
  -- line-clamp-2, but a 4 KB pasted stack trace has no business sitting in
  -- a notifications table.
  v_preview := REGEXP_REPLACE(COALESCE(v_preview, ''), '\s+', ' ', 'g');
  IF LENGTH(v_preview) > 160 THEN
    v_preview := LEFT(v_preview, 159) || '…';
  END IF;

  PERFORM public.fn_sa_notify(
    'support_message_received',
    -- `warning`, matching contact_submitted: in both cases a real person
    -- is waiting on a human reply. Not `critical` — that is reserved for
    -- money sitting unverified.
    'warning',
    'New support chat message',
    COALESCE(v_account_name, 'A workspace') ||
      COALESCE(' — ' || NULLIF(v_preview, ''), ''),
    NEW.account_id,
    v_account_name,
    'support_conversation',
    NEW.conversation_id,
    '/super-admin/live-chat'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Same contract as every other trigger here. A customer must be able to
  -- report a problem even if the notification machinery is broken —
  -- especially then.
  RAISE WARNING 'sa_notify_support_message failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_support_message() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_sa_notify_support_message ON public.support_messages;
CREATE TRIGGER trg_sa_notify_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_support_message();

COMMENT ON FUNCTION public.sa_notify_support_message() IS
  'Raises one super-admin notification per support conversation per 15 minutes, for customer-sent messages only. Throttled on its own notification history rather than on unread_for_admin, because that counter is bumped after the insert and a rule reading it would depend on statement order in the send route.';
