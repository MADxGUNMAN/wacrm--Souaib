-- ============================================================
-- WhatsApp Coexistence, part 1 of 2 — the `messages` table.
--
-- Coexistence lets one number run on the WhatsApp Business App (on a
-- phone) AND the Cloud API (this CRM) at the same time. Meta then sends
-- us an `smb_message_echoes` webhook for every message the business
-- types on the phone, so the CRM can mirror it.
--
-- Three things in `messages` block that:
--
--   1. There is no sender_type for "the business sent this from their
--      phone". The CHECK from migration 001 allows only customer /
--      agent / bot.
--   2. Nothing stops the same message being stored twice. An echo of a
--      message the CRM ITSELF sent arrives carrying the same wamid we
--      already stored, and there is no uniqueness or pre-insert check
--      anywhere on messages.message_id.
--   3. Coexistence surfaces `edit` and `revoke` message types, which
--      change or delete a message that already exists. There is nowhere
--      to record either.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. sender_type: add 'business_app'
--
-- A DISTINCT value rather than reusing 'agent'. Two reasons:
--   * The inbox has to be able to say "sent from the phone" — an agent
--     seeing an unexplained outbound message they did not write will
--     assume a teammate sent it, or that the CRM sent it twice.
--   * Nothing attributes it to a CRM user, because no CRM user sent it.
--     Folding it into 'agent' would credit it to whoever happens to be
--     looked up, and quietly corrupt per-agent reporting.
--
-- Same drop-and-re-add shape migration 010 used to widen
-- content_type — Postgres has no "ALTER CHECK".
-- ============================================================
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('customer', 'agent', 'bot', 'business_app'));

-- ============================================================
-- 2. Per-conversation wamid uniqueness
--
-- Scoped to (conversation_id, message_id) ON PURPOSE, not to
-- message_id alone. Migrations 009 and 036 both record the reason
-- global uniqueness is wrong: Meta's ids are not unique across phone
-- numbers, so two tenants can legitimately hold the same wamid. Within
-- ONE conversation, though, a repeated wamid is always a duplicate.
--
-- This is what lets the echo handler upsert instead of insert: when the
-- CRM sends a message, Meta echoes it straight back, and without this
-- the operator would see their own message twice — once as theirs, once
-- as if it came from the phone.
--
-- Partial (WHERE message_id IS NOT NULL) because locally-composed rows
-- can exist before Meta assigns an id, and NULLs must not collide.
--
-- Verified against the live database before adding: zero
-- (conversation_id, message_id) groups had more than one row, so this
-- cannot fail on existing data.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_wamid_key
  ON messages (conversation_id, message_id)
  WHERE message_id IS NOT NULL;

-- ============================================================
-- 3. Edit + revoke support
--
-- Editing and deleting are ordinary things to do on a phone, so
-- coexistence makes these common rather than exotic. Today the webhook
-- maps any unrecognised type to 'text', which means an edit would land
-- as a BRAND NEW message containing the corrected text (so the thread
-- shows both versions), and a delete would land as an empty one.
--
-- `edited_at` is a marker, not history: the row's content_text is
-- overwritten in place, matching what WhatsApp itself shows.
--
-- `deleted_at` is a SOFT delete. The row stays so the thread can render
-- "This message was deleted" where it happened — removing it outright
-- would silently reflow the conversation and lose the fact that
-- something was there. It also keeps reply_to_message_id references
-- from dangling.
-- ============================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN messages.edited_at IS
  'Set when the sender edited this message (WhatsApp edit event). content_text holds the latest version.';
COMMENT ON COLUMN messages.deleted_at IS
  'Soft delete — set when the sender deleted this message for everyone (WhatsApp revoke event). Row is kept so the thread can show a placeholder.';
