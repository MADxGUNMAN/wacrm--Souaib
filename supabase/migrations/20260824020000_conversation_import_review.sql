-- ============================================================
-- Gate imported chats behind a review step.
--
-- ─── The problem ──────────────────────────────────────────────
--
-- Connecting a coexistence number dumps the phone's entire chat history
-- straight into the inbox. On the reference account that was 69
-- conversations and 7,533 messages appearing unannounced, including
-- personal chats — "Mummy", a six-week 6,920-message thread — with no
-- indication of what was happening, how much was coming, or any way to
-- choose.
--
-- ─── Why this cannot be "fetch in batches" ────────────────────
--
-- Meta PUSHES history. It is sent once, inside a 24-hour window after
-- onboarding, and it cannot be requested incrementally or replayed. So
-- there is no version of this where we ask for 10 chats at a time —
-- refusing a chunk loses it permanently.
--
-- The only honest design is therefore: accept everything Meta sends (so
-- nothing is lost), but do not let it into the inbox until a human says
-- so. `import_state` is that gate. Nothing is deleted and nothing is
-- hidden forever; approving is one click and rejecting is reversible.
--
-- ─── Deliberately a no-op for every existing row ──────────────
--
-- DEFAULT 'live' and no backfill. This is a shared production database
-- with three other coexistence accounts on it, and silently emptying
-- somebody else's inbox to fix a complaint about this one would be a far
-- worse bug than the one being fixed. Existing conversations stay exactly
-- as visible as they are today; only imports that arrive AFTER the app is
-- deployed are gated, plus whatever an operator explicitly chooses to move
-- via the review screen.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS import_state text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_import_state_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_import_state_check
      CHECK (import_state IN ('live', 'pending_review', 'rejected'));
  END IF;
END
$$;

COMMENT ON COLUMN conversations.import_state IS
  'Inbox visibility for chats that arrived via coexistence history import. live = shown normally (default, and what every pre-existing row is). pending_review = received and stored but hidden from the inbox until approved. rejected = the operator does not want it in the inbox; kept, not deleted, because Meta only sends history once and cannot replay it.';

-- ------------------------------------------------------------
-- Index for the two queries this adds.
--
-- The inbox list becomes "account + import_state = live ORDER BY
-- last_message_at DESC", and the review screen is the same with
-- pending_review. Partial on the non-default states so it stays small:
-- the overwhelming majority of rows are 'live' and are already served by
-- the existing account/last_message_at indexes.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_pending_review
  ON conversations (account_id, last_message_at DESC)
  WHERE import_state <> 'live';

-- ------------------------------------------------------------
-- Counters on the history import row, so the review screen can say how
-- much arrived versus how much is still waiting on a decision without
-- counting conversations every time the page loads.
--
-- No percentage for the CONTACT sync exists anywhere and that is
-- intentional (Meta sends no total for the address book), but history is
-- different: Meta does send metadata.progress, which is why
-- coexistence_history_imports.progress is trustworthy and is the number
-- the UI should show for "how much is left".
-- ------------------------------------------------------------
ALTER TABLE coexistence_history_imports
  ADD COLUMN IF NOT EXISTS threads_pending_review integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN coexistence_history_imports.threads_pending_review IS
  'Conversations this import created that are still waiting for a human decision. Distinct from threads_seen, which counts thread appearances across chunks and can exceed the number of distinct conversations.';
