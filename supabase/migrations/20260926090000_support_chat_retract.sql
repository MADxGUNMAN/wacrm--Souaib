-- ============================================================
-- Support chat: let a retracted message hold no payload.
--
-- `support_messages_payload_check` (20260925120000) requires a text row to
-- carry non-blank text and a media row to carry a key. That is right for a
-- live message and wrong for a retracted one.
--
-- Retracting has to actually REMOVE the content, not just flag it. The
-- table carries RLS SELECT for both audiences and its replica identity is
-- FULL, so Realtime emits every column on UPDATE — a flag alone would
-- leave the retracted text readable straight off the change payload, or
-- through a direct PostgREST read. The realistic reason someone retracts a
-- support message is "I just pasted a live API key", so leaving the text
-- behind defeats the entire feature.
--
-- Which meant the original constraint had to be satisfied somehow, and the
-- options were a placeholder value or this. A placeholder loses: writing
-- '.' or ' ' into content_text to get past a CHECK is a lie stored in the
-- column, and the next person to query "messages containing text" gets it
-- back. `btrim` also makes ' ' fail outright, so the placeholder would have
-- had to be a visible character.
--
-- So: exempt soft-deleted rows. The row itself is kept (replies point at
-- it, and the other side must see that something was withdrawn rather than
-- watch a message silently vanish), but it is no longer required to carry
-- anything.
-- ============================================================

ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_payload_check;

ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_payload_check
  CHECK (
    -- A retracted message carries nothing, on purpose.
    deleted_at IS NOT NULL
    OR (content_type = 'text' AND content_text IS NOT NULL AND length(btrim(content_text)) > 0)
    OR (content_type <> 'text' AND media_key IS NOT NULL)
  );

COMMENT ON COLUMN public.support_messages.deleted_at IS
  'Soft delete. The row survives so replies do not dangle and the other side sees that a message was withdrawn, but the payload CHECK is relaxed for these rows because retracting clears content_text and the S3 object is deleted outright.';
