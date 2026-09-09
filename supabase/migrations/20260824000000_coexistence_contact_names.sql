-- ============================================================
-- Coexistence: capture contact names properly, and make the sync
-- describable.
--
-- ─── The bug this fixes ───────────────────────────────────────
--
-- A coexistence account ends up with an inbox full of rows labelled
-- "919716747472" even though Meta told us the contact is called
-- "Sabzi Wala". Two independent paths conspire:
--
--   1. `history` arrives and ingestHistoryThread creates the contact
--      with `name = phone`, because the history payload carries no
--      profile name at all.
--   2. `smb_app_state_sync` arrives separately and stages the REAL name
--      in coexistence_staged_contacts.full_name — a column nothing ever
--      joins back to contacts.
--
-- Then the import step finds the contact already exists, so it only
-- LINKS the staged row and leaves the phone-number name in place. The
-- name was sitting in the database the whole time, one join away.
--
-- Whichever of the two webhooks lands first decides whether a name is
-- ever seen, which is why it looks intermittent.
--
-- ─── What this migration does ─────────────────────────────────
--
--   1. Adds `raw` so nothing Meta sends is discarded again.
--   2. Adds state-sync progress columns, so the UI can say how much of
--      the address book has arrived and when.
--   3. Backfills every contact currently named after its own number.
--   4. Adds the index the bulk-import drain actually needs.
--
-- Idempotent throughout: safe to re-run, and safe on a database restored
-- from production where some of this may already be present.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Keep everything Meta sends about a contact.
--
-- The parser reads phone_number, full_name and first_name into a closed
-- 4-field interface and drops the rest of the object. That was fine until
-- the question became "why is the name missing" — at which point the one
-- thing we needed was the payload we had thrown away.
--
-- JSONB rather than more columns on purpose: Meta adds fields to this
-- object without warning, and a schema change per field is a migration
-- per field. Anything genuinely useful gets promoted to a real column
-- later, with the historical data already present to backfill from.
-- ------------------------------------------------------------
ALTER TABLE coexistence_staged_contacts
  ADD COLUMN IF NOT EXISTS raw jsonb;

COMMENT ON COLUMN coexistence_staged_contacts.raw IS
  'The verbatim `contact` object from smb_app_state_sync. Stored so a field Meta starts sending is not lost before we know we want it — full_name/first_name are promoted to real columns, everything else lives here.';

-- ------------------------------------------------------------
-- 2. Address-book sync progress.
--
-- IMPORTANT, and the reason there is no `state_sync_total` column:
-- Meta sends NO total, no chunk index and no "last batch" flag on
-- smb_app_state_sync. Unlike `history` — which carries
-- metadata.progress and metadata.chunk_order and therefore supports a
-- genuine percentage — the address book arrives as an open-ended stream
-- of adds and removes.
--
-- So an honest UI can say "1,417 contacts received, last one 2 minutes
-- ago" but CANNOT say "1,417 of 3,000". Inventing a denominator would
-- mean inventing a progress bar that finishes at the wrong time, which is
-- worse than no bar. These two columns are exactly what Meta's payload
-- can support and nothing more.
-- ------------------------------------------------------------
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS state_sync_last_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS state_sync_contacts_seen INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN whatsapp_config.state_sync_last_at IS
  'When an smb_app_state_sync webhook last arrived. The only way to tell "the address book is still streaming" from "it finished" — Meta sends no completion signal.';
COMMENT ON COLUMN whatsapp_config.state_sync_contacts_seen IS
  'Cumulative count of contact entries received from smb_app_state_sync, adds and removes alike. NOT a total to divide by: Meta never tells us how many are coming.';

-- ------------------------------------------------------------
-- 3. Index for the bulk-import drain.
--
-- The existing index is (account_id, status). The drain filters on
-- account + status then ORDER BY created_at LIMIT 200, repeatedly, so it
-- sorts the whole matching set on every one of those calls. At 3,694
-- staged rows that is ~19 sorts of thousands of rows to import one
-- address book.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coex_staged_account_status_created
  ON coexistence_staged_contacts (account_id, status, created_at);

-- ------------------------------------------------------------
-- 4. Backfill: give the phone-number-named contacts their real names.
--
-- Only touches contacts whose name carries NO letters — i.e. it is the
-- number, or a formatted version of it, or blank. A name a human typed,
-- or one that came from a live inbound message's profile, is left alone:
-- the address book is not more authoritative than a person, and
-- overwriting real names is not something a migration gets to do.
--
-- DISTINCT ON because the same number can be staged under two configs
-- (a reconnect creates a new whatsapp_config row), which would otherwise
-- make this a non-deterministic multi-row update. Newest staged row wins.
-- ------------------------------------------------------------
DO $$
DECLARE
  updated_count integer;
BEGIN
  -- Belt-and-braces only. Migration 071 creates this table and sorts far
  -- ahead of this file, and the ALTER TABLE at the top already hard-depends
  -- on it — so if the table were genuinely missing we would have failed
  -- before reaching this block. Kept so the intent is explicit rather than
  -- implied by statement order.
  IF to_regclass('public.coexistence_staged_contacts') IS NULL THEN
    RAISE NOTICE 'coexistence_staged_contacts absent — nothing to backfill';
    RETURN;
  END IF;

  WITH best_staged AS (
    SELECT DISTINCT ON (s.account_id, coalesce(s.phone_normalized, regexp_replace(s.phone, '[^0-9]', '', 'g')))
      s.account_id,
      coalesce(s.phone_normalized, regexp_replace(s.phone, '[^0-9]', '', 'g')) AS key,
      btrim(coalesce(nullif(btrim(s.full_name), ''), nullif(btrim(s.first_name), ''))) AS resolved_name
    FROM coexistence_staged_contacts s
    WHERE coalesce(nullif(btrim(s.full_name), ''), nullif(btrim(s.first_name), '')) IS NOT NULL
    ORDER BY
      s.account_id,
      coalesce(s.phone_normalized, regexp_replace(s.phone, '[^0-9]', '', 'g')),
      s.updated_at DESC NULLS LAST,
      s.created_at DESC
  )
  UPDATE contacts c
     SET name = b.resolved_name,
         updated_at = now()
    FROM best_staged b
   WHERE c.account_id = b.account_id
     AND c.phone_normalized = b.key
     AND b.resolved_name IS NOT NULL
     -- "Has no letters" is the test for a placeholder name. Covers
     -- '919716747472', '+91 97167 47472', '(919) 716-7472' and ''.
     AND (
       c.name IS NULL
       OR btrim(c.name) = ''
       OR c.name !~ '[[:alpha:]]'
     )
     -- ...and the INCOMING name has to be a real name too.
     --
     -- Found by dry-running this against production before applying it, and
     -- it is not hypothetical: people save contacts under a bare number, so
     -- coexistence_staged_contacts.full_name legitimately contains values
     -- like '+917698639401' and '9428554786'. Without this clause two of the
     -- 38 rows would have been "fixed" into
     --
     --   917698639401 -> +917698639401   (pointless churn)
     --   919428554786 -> 9428554786      (a TRUNCATED number — worse)
     --
     -- The TypeScript twin, betterContactName(), already rejected these via
     -- isPlaceholderName(incoming). The SQL did not, which is precisely the
     -- drift the note above warns about — so it is now symmetrical: both
     -- sides require the old name to be a placeholder AND the new one not
     -- to be.
     AND b.resolved_name ~ '[[:alpha:]]';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'coexistence backfill: % contact name(s) recovered from staged address book', updated_count;
END
$$;
