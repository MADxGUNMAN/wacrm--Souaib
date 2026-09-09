-- ============================================================
-- 075 — who sent this message?
--
-- `messages.sender_id` has existed since migration 001 and has NEVER
-- been written by any code path. Verified against live data: every row
-- is NULL. So the inbox could say a message came from "us" but not from
-- WHOM — on a shared account, an agent reading a thread had no way to
-- tell a colleague's reply from their own, from the owner's, or from an
-- automation's.
--
-- This migration does not add the column (it is already there). It adds
-- the two things it never got: referential integrity and an index.
-- ============================================================

-- ON DELETE SET NULL, deliberately. Removing a team member must NOT
-- delete the messages they sent — the conversation history belongs to
-- the account, not to the employee. The label simply falls back to no
-- attribution, the same as a pre-075 row.
--
-- Safe to add without validation cost: every existing value is NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_id_fkey'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial: the overwhelming majority of rows are inbound or bot-sent and
-- will stay NULL forever, so indexing them wastes space. Supports the
-- per-agent reporting this attribution makes possible ("messages sent by
-- each member this week").
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON messages(sender_id)
  WHERE sender_id IS NOT NULL;

COMMENT ON COLUMN messages.sender_id IS
  'auth.users.id of the human who sent this from the CRM. Set only for '
  'sender_type = ''agent'' sends made through an authenticated session. '
  'NULL for inbound, bot/AI, phone (Coexistence), public-API sends, and '
  'every row written before migration 075.';
