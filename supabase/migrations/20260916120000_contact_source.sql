-- ============================================================
-- contacts.source — how each contact entered the CRM.
--
-- A contact can arrive nine different ways in this product (someone
-- types it in, a CSV, an inbound WhatsApp message, the public API, a
-- campaign send resolving an unknown number, the phone's address book
-- via Coexistence…). Until now they were indistinguishable once saved,
-- so "where did this person come from?" had no answer — which matters
-- most for the numbers a campaign creates as a side effect of sending,
-- since nobody deliberately added those at all.
--
-- WHY A CONSTRAINED TEXT COLUMN RATHER THAN AN ENUM
-- Matching `marketing_opt_outs.source` (migration 20260831000000),
-- which set the precedent here. A Postgres enum needs ALTER TYPE to add
-- a value and cannot drop one, whereas this is a list that will grow
-- every time the product gains an integration. A CHECK is equally
-- strict, and Postgres has no ALTER CHECK — hence the DROP/ADD pair
-- below, which is what makes this migration re-runnable.
--
-- WHY THE DEFAULT IS 'unknown' AND NOT 'manual'
-- The default only ever applies to a write that FORGOT to set a source —
-- a future insert path, or a hand-written SQL fix. Defaulting such a row
-- to 'manual' would state as fact that a person typed it in, which the
-- operator has no way to check. 'unknown' is the honest answer and is
-- visibly different in the UI, so a forgotten path shows up as a gap
-- instead of quietly masquerading as manual entry.
--
-- ⚠ NOT A SECURITY BOUNDARY. Three of the nine insert paths run in the
-- browser under the anon key (the Add Contact form, CSV import, and the
-- broadcast CSV audience), and `contacts` has no column-level RLS — so a
-- crafted request could claim any source. That is acceptable: the same
-- client can already set name, phone and email freely, so this column is
-- provenance for humans, not an audit control. The server-side paths
-- (webhook, public API, campaign sends, Coexistence) set it
-- authoritatively and cannot be influenced by a caller.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_source_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_source_check CHECK (
    source IN (
      'manual',      -- typed into the Add Contact form
      'import',      -- CSV import on the Contacts page
      'whatsapp',    -- messaged the business first; created by the webhook
      'api',         -- POST /api/v1/contacts or /api/v1/messages
      'campaign',    -- created while sending a broadcast / API campaign
      'phone_sync',  -- WhatsApp Coexistence address-book import
      'unknown'      -- provenance not recorded
    )
  );

COMMENT ON COLUMN contacts.source IS
  'How this contact entered the CRM. Set explicitly by every insert path; ''unknown'' means the path did not record one (legacy rows, or a future path that forgot). Provenance for humans, NOT an audit control — the browser-side insert paths can claim any value.';

-- Filtering is always "this account's contacts with these sources", so
-- the account leads the index. Not partial: unlike the API-campaign
-- columns, every row has a value here, and 'unknown' is one of the
-- values people will most want to filter FOR.
CREATE INDEX IF NOT EXISTS idx_contacts_account_source
  ON contacts (account_id, source);

-- ------------------------------------------------------------
-- Backfill from evidence, most conclusive signal first
-- ------------------------------------------------------------
--
-- Every rule below is anchored on a 120-second window between the
-- contact's `created_at` and the event, because the question is not "did
-- this contact ever appear in a campaign / ever send a message" — almost
-- everyone eventually does — but "did that event CREATE it". The two
-- timestamps are written within the same request, so real creations land
-- sub-second apart; 120s is slack for a slow fan-out, not a guess.
--
-- Anything left unproven stays 'unknown'. Guessing 'manual' for the
-- remainder would have relabelled thousands of rows with a claim no one
-- could verify or correct.

-- 1) Coexistence address book. An explicit FK, so no window needed —
--    this row IS the record of the import.
UPDATE contacts c
   SET source = 'phone_sync'
 WHERE c.source = 'unknown'
   AND EXISTS (
     SELECT 1 FROM coexistence_staged_contacts s
      WHERE s.contact_id = c.id
   );

-- 2) Created by a send. Catches both the Google Sheets API campaign and
--    a dashboard broadcast given a CSV audience, which is correct: in
--    both cases the number was not in the CRM until a send needed it.
UPDATE contacts c
   SET source = 'campaign'
 WHERE c.source = 'unknown'
   AND EXISTS (
     SELECT 1
       FROM broadcast_recipients br
       JOIN broadcasts b ON b.id = br.broadcast_id
      WHERE br.contact_id = c.id
        AND b.created_at <= c.created_at + INTERVAL '120 seconds'
   );

-- 3) Created by an inbound WhatsApp message. 'customer' is a message
--    from the person; 'business_app' is one the operator sent from the
--    WhatsApp app on their phone under Coexistence — both are activity
--    the CRM observed rather than initiated, and either can be the event
--    that first created the contact.
UPDATE contacts c
   SET source = 'whatsapp'
 WHERE c.source = 'unknown'
   AND EXISTS (
     SELECT 1
       FROM messages m
       JOIN conversations cv ON cv.id = m.conversation_id
      WHERE cv.contact_id = c.id
        AND m.sender_type IN ('customer', 'business_app')
        AND m.created_at <= c.created_at + INTERVAL '120 seconds'
   );
