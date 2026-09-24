-- ============================================================
-- Make a broadcast send a real inbox message.
--
-- ─── The gap this closes ──────────────────────────────────────────
--
-- Sending a broadcast produced NOTHING in the Inbox. The fan-out
-- (`/api/whatsapp/broadcast` and `deliverBroadcast`) calls Meta directly
-- and records progress only on `broadcast_recipients` — it never writes a
-- `messages` row. So a customer received a message from the business,
-- replied, and the agent opening that thread saw the reply with no idea
-- what it was replying TO. The outbound half of the conversation simply
-- did not exist on our side.
--
-- That also had a second, quieter cost: the status webhook mirrors Meta's
-- failure reason onto `messages`, so with no row to attach to, the reason
-- for a failed broadcast send was discarded (addressed separately by
-- copying it onto the recipient row too).
--
-- ─── Why a column on `messages` rather than a separate table ───────
--
-- A broadcast message IS a message: same conversation, same thread, same
-- bubble, same delivery ladder, same webhook. Modelling it separately
-- would mean the Inbox reading two sources and merging them by timestamp,
-- and every future message feature having to be built twice.
--
-- `broadcast_id` therefore just answers "which campaign produced this
-- message, if any" — NULL for the overwhelming majority (inbound,
-- one-to-one, automation and flow sends).
-- ============================================================

-- ON DELETE SET NULL, not CASCADE. Deleting a campaign record must never
-- delete the messages customers actually received — that is real
-- conversation history and the agent still needs to see what was sent.
-- The message simply stops being attributed to a campaign.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS broadcast_id UUID
  REFERENCES broadcasts(id) ON DELETE SET NULL;

COMMENT ON COLUMN messages.broadcast_id IS
  'The broadcast campaign that produced this outbound message, or NULL for inbound, one-to-one, automation and flow messages. Set by the broadcast fan-out so campaign sends appear in the Inbox thread and can be filtered by campaign.';

-- Partial index: broadcast messages are a small slice of the table, and
-- the only query shape is "messages belonging to this campaign" (or to
-- any campaign, for the Inbox's Broadcasts view). Excluding NULLs keeps
-- the index proportional to broadcast volume rather than total messages.
CREATE INDEX IF NOT EXISTS idx_messages_broadcast_id
  ON messages (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

-- Serves the Broadcasts view directly: "the most recent broadcast message
-- per conversation", which is how the filtered conversation list is
-- ordered and de-duplicated.
CREATE INDEX IF NOT EXISTS idx_messages_broadcast_conversation
  ON messages (broadcast_id, conversation_id, created_at DESC)
  WHERE broadcast_id IS NOT NULL;
