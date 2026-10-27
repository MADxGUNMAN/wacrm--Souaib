-- ============================================================
-- AI connector — Phase 7 (messaging, broadcasts, automations).
--
-- messages.via_ai records that a message was sent by a connected AI
-- app on a member's behalf: { "platform": "claude" | "chatgpt",
-- "connection_id": "<uuid>" }. NULL for every other send. The inbox
-- reads it to show a "via Claude" badge, and the AI send tools read it
-- for the duplicate-send guard (same text to the same conversation
-- within two minutes).
--
-- Additive and nullable: no rewrite of existing rows, no change for
-- any existing writer.
-- ============================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS via_ai jsonb;

COMMENT ON COLUMN public.messages.via_ai IS
  'Set when a connected AI app (Claude/ChatGPT) sent this message: {platform, connection_id}. NULL otherwise.';

-- Partial: only AI-sent rows are indexed, so this stays tiny.
CREATE INDEX IF NOT EXISTS messages_via_ai_conversation_idx
  ON public.messages (conversation_id, created_at DESC)
  WHERE via_ai IS NOT NULL;
