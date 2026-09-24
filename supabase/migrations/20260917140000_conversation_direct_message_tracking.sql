-- ============================================================
-- Keep bulk sends out of the All chats view.
--
-- THE PROBLEM
-- A broadcast send is stored as a real message (migration 20260911010000)
-- and, like every other message, it bumps the conversation preview:
--
--   last_message_text = the template body
--   last_message_at   = now()
--
-- The Inbox list orders by `last_message_at DESC`, so every recipient of
-- a campaign jumps to the top of All chats with campaign copy as its
-- preview. One Google Sheets rule firing against a few hundred contacts
-- buries the actual conversations an agent needs to answer, and creates
-- inbox rows for people nobody has ever spoken to.
--
-- Removing the bump is not an option either: the Broadcasts view orders
-- by the same column, and a campaign's own threads have to sort sensibly
-- there.
--
-- THE FIX
-- Track the two timelines separately.
--
--   last_message_at / last_message_text
--     UNCHANGED. Newest message of ANY kind, broadcasts included. Still
--     what the Broadcasts view orders and previews by, and still what
--     every existing consumer reads (the public API, dashboards, the
--     forward dialog, deal-form's most-recent-conversation lookup). Its
--     meaning is deliberately untouched so nothing else has to change.
--
--   last_direct_message_at / last_direct_message_text   (NEW)
--     Newest NON-broadcast message. "Direct" covers everything that is
--     not a bulk send: an inbound customer message, an agent reply, an AI
--     or automation send, a flow send, a one-to-one template, an echo
--     from the WhatsApp Business app. NULL means this conversation has
--     only ever received bulk sends.
--
-- All chats then filters on `last_direct_message_at IS NOT NULL` and
-- orders by it, so a broadcast neither creates a row there nor reorders
-- one. The moment a customer replies, the reply is a direct message, the
-- column populates, and the thread appears normally.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE
-- Ten separate code paths write the conversation preview today:
-- send-message.ts, flows/meta-send.ts (three places), automations/
-- meta-send.ts, broadcast-inbox.ts, use-broadcast-sending.ts, and four
-- branches of the webhook (inbound, echo, history backfill, edit). Adding
-- a second pair of columns to each is ten chances to miss one, and a
-- missed path fails silently in the worst direction — a conversation that
-- never appears in All chats at all, i.e. messages that look lost.
--
-- The discriminator is a single column on the row being inserted
-- (`messages.broadcast_id IS NULL`), so the database can decide it once,
-- for every writer, including ones added later.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_direct_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_direct_message_text TEXT;

COMMENT ON COLUMN conversations.last_direct_message_at IS
  'Timestamp of the newest message on this conversation that was NOT part of a broadcast (messages.broadcast_id IS NULL). NULL means the conversation has only ever received bulk sends, which is how the Inbox''s All chats view knows to hide it. Maintained by trigger trg_messages_sync_direct_preview, never by application code.';

COMMENT ON COLUMN conversations.last_direct_message_text IS
  'Preview text of the newest non-broadcast message, so All chats shows the last real exchange instead of campaign copy. Maintained by trigger trg_messages_sync_direct_preview.';

-- ------------------------------------------------------------
-- Preview text, derived the same way for the trigger and the backfill
-- ------------------------------------------------------------
--
-- Media messages have no body, so they fall back to a bracketed type.
-- That matches the shape the application already uses for the same case
-- (`[image]`, `[template:name]`), and the Inbox renders a bracketed
-- preview as a system note rather than as literal text the customer sent.
--
-- IMMUTABLE + no table access, so it is safe to call from an index-free
-- trigger on a hot insert path.
CREATE OR REPLACE FUNCTION conversation_preview_text(
  content_text TEXT,
  content_type TEXT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(BTRIM(COALESCE(content_text, '')), ''),
    '[' || COALESCE(NULLIF(BTRIM(COALESCE(content_type, '')), ''), 'message') || ']'
  );
$$;

-- ------------------------------------------------------------
-- The trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_conversation_direct_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_at TIMESTAMPTZ;
BEGIN
  -- A broadcast send is the one thing this column must NOT follow.
  IF NEW.broadcast_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  msg_at := COALESCE(NEW.created_at, now());

  -- Guarded on the timestamp so an out-of-order write cannot move the
  -- preview backwards. This is not hypothetical: the coexistence history
  -- import inserts up to six months of past messages in arbitrary chunk
  -- order, and without this guard the last chunk to arrive would set the
  -- preview to whatever old message happened to be in it.
  UPDATE conversations
     SET last_direct_message_at = msg_at,
         last_direct_message_text =
           conversation_preview_text(NEW.content_text, NEW.content_type)
   WHERE id = NEW.conversation_id
     AND (last_direct_message_at IS NULL OR last_direct_message_at <= msg_at);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_conversation_direct_preview() IS
  'Maintains conversations.last_direct_message_at/_text from every non-broadcast message insert. Lives in the database rather than in the ten application paths that write the ordinary preview, so a new writer cannot forget it — and a forgotten writer would silently hide a conversation from the Inbox.';

DROP TRIGGER IF EXISTS trg_messages_sync_direct_preview ON messages;

CREATE TRIGGER trg_messages_sync_direct_preview
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_conversation_direct_preview();

-- ------------------------------------------------------------
-- Backfill
-- ------------------------------------------------------------
--
-- Computed from the messages table rather than copied from
-- `last_message_at`, because copying would carry the broadcast bump
-- across and defeat the whole change — every conversation a campaign
-- touched would keep its campaign preview and stay at the top of All
-- chats.
--
-- Conversations whose messages are ALL broadcasts correctly get NULL and
-- disappear from All chats. Conversations with no messages at all also
-- get NULL; they have nothing to preview and already showed as empty.
WITH newest_direct AS (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.created_at,
         conversation_preview_text(m.content_text, m.content_type) AS preview
    FROM messages m
   WHERE m.broadcast_id IS NULL
     AND m.conversation_id IS NOT NULL
   ORDER BY m.conversation_id, m.created_at DESC
)
UPDATE conversations c
   SET last_direct_message_at = nd.created_at,
       last_direct_message_text = nd.preview
  FROM newest_direct nd
 WHERE nd.conversation_id = c.id
   AND c.last_direct_message_at IS NULL;

-- ------------------------------------------------------------
-- Index
-- ------------------------------------------------------------
--
-- Mirrors the existing idx_conversations_pending_review shape: the All
-- chats query is "account + import_state = 'live' ORDER BY
-- last_direct_message_at DESC". Partial on non-NULL, which is also the
-- filter itself, so the index covers exactly the rows the view reads and
-- excludes the broadcast-only ones it is meant to skip.
CREATE INDEX IF NOT EXISTS idx_conversations_last_direct_message
  ON conversations (account_id, last_direct_message_at DESC)
  WHERE last_direct_message_at IS NOT NULL;
