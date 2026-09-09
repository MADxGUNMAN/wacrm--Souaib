-- ============================================================
-- Coexistence contact names, enforced in the DATABASE.
--
-- ─── Why this exists as well as the application fix ───────────
--
-- 20260824000000 backfilled the names that were already stranded, and the
-- webhook code was changed to apply them going forward. Then a fresh
-- number was connected and every contact came in named after itself
-- again — because the application fix only helps once it is BUILT AND
-- DEPLOYED, and the running build predates it.
--
-- Measured on that connection: 1,792 staged contacts, all 1,792 carrying
-- a name, and all 69 CRM contacts named after their own phone number. The
-- data was correct and complete; nothing was reading it.
--
-- Two triggers fix that independently of which version of the app is
-- running, which matters because the two webhooks race and BOTH orders
-- happen:
--
--   contact first, name later   -> trg_coex_apply_name_to_contacts
--                                  (history creates the contact, then the
--                                   address book arrives)
--   name first, contact later   -> trg_contacts_take_staged_name
--                                  (address book arrives, then history or
--                                   a live message creates the contact)
--
-- Covering only one direction is why the old behaviour looked
-- intermittent: whichever webhook happened to land first decided whether
-- a customer ever got a name.
--
-- ─── The safety rule, in both directions ──────────────────────
--
-- A name is only ever written over a PLACEHOLDER — blank, or containing
-- no letters at all. `919716747472`, `+91 97167 47472` and `(919)
-- 716-7472` are placeholders; "Sabzi Wala" and "सब्ज़ी वाला" are not.
-- A name typed by a human, or taken from a live message's WhatsApp
-- profile, is never overwritten: the phone's address book is not more
-- authoritative than a person.
--
-- The incoming name must ALSO contain a letter. That is not symmetry for
-- its own sake — people genuinely save contacts under a bare number, so
-- staged full_name legitimately holds values like '+917698639401' and
-- '9428554786'. Without the check, one of those would have "fixed"
-- 919428554786 into 9428554786: a truncated number, strictly worse than
-- what it replaced. That was caught by dry-running the earlier backfill.
--
-- Deliberately mirrors `isPlaceholderName` in
-- src/lib/contacts/placeholder-name.ts. Two implementations of one rule is
-- a real cost, accepted here because the trigger has to work when the app
-- does not. If the rule changes, change both.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Shared predicate, so the two triggers cannot disagree.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_placeholder_contact_name(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  -- `[[:alpha:]]` is Unicode-aware under a UTF-8 collation, so Devanagari,
  -- Arabic and Malayalam names count as names. An ASCII-only test would
  -- classify them as placeholders and let a phone number overwrite them.
  SELECT candidate IS NULL
      OR btrim(candidate) = ''
      OR candidate !~ '[[:alpha:]]';
$$;

COMMENT ON FUNCTION public.fn_is_placeholder_contact_name(text) IS
  'True when a contact name carries no information — blank, or no letters, i.e. it is really a phone number. Mirrors isPlaceholderName() in src/lib/contacts/placeholder-name.ts.';

-- ------------------------------------------------------------
-- 1. Lookup index.
--
-- Both triggers resolve a staged row by (account_id, phone_normalized) and
-- neither existing index covers that: 071 indexes (account_id, status) and
-- the unique constraint is (config_id, phone). Without this the contacts
-- trigger turns a bulk CSV import into one sequential scan per row.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coex_staged_account_phone
  ON coexistence_staged_contacts (account_id, phone_normalized);

-- ------------------------------------------------------------
-- 2. Address book arrives AFTER the contact already exists.
--
-- The common case: history ingestion has already created a contact for
-- every number that ever had a conversation, named after the number
-- because the history payload carries no name.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coex_apply_name_to_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  incoming text;
  key      text;
BEGIN
  incoming := btrim(coalesce(nullif(btrim(NEW.full_name), ''),
                             nullif(btrim(NEW.first_name), '')));

  -- Nothing usable arrived. Note a REMOVE event sends no name at all, so
  -- this is also what stops a deletion from blanking a good name.
  IF public.fn_is_placeholder_contact_name(incoming) THEN
    RETURN NEW;
  END IF;

  key := coalesce(nullif(NEW.phone_normalized, ''),
                  regexp_replace(NEW.phone, '[^0-9]', '', 'g'));
  IF key IS NULL OR key = '' THEN
    RETURN NEW;
  END IF;

  UPDATE contacts c
     SET name = incoming,
         updated_at = now()
   WHERE c.account_id = NEW.account_id
     AND c.phone_normalized = key
     AND public.fn_is_placeholder_contact_name(c.name);

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_coex_apply_name_to_contacts
  ON coexistence_staged_contacts;

-- Fires on INSERT, and on UPDATE only when a name column actually moved.
-- The import step updates status/contact_id/reviewed_at on these rows
-- constantly; without the column list every one of those would re-run the
-- UPDATE above for no reason.
CREATE TRIGGER trg_coex_apply_name_to_contacts
  AFTER INSERT OR UPDATE OF full_name, first_name
  ON coexistence_staged_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_coex_apply_name_to_contacts();

-- ------------------------------------------------------------
-- 3. Contact is created AFTER the name was already staged.
--
-- BEFORE INSERT and it edits NEW directly, rather than issuing an UPDATE
-- afterwards. That keeps it to a single row write and means it cannot
-- recurse into itself.
--
-- The placeholder test comes FIRST so the lookup is skipped entirely for
-- the ordinary cases — a CSV import or a manual add already has a real
-- name, and pays nothing here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_contacts_take_staged_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  staged_name text;
  key         text;
BEGIN
  IF NOT public.fn_is_placeholder_contact_name(NEW.name) THEN
    RETURN NEW;
  END IF;

  -- phone_normalized is generated, so on BEFORE INSERT it is not populated
  -- yet — derive the key from the raw phone instead of reading a column
  -- that is still null.
  key := regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g');
  IF key = '' THEN
    RETURN NEW;
  END IF;

  SELECT btrim(coalesce(nullif(btrim(s.full_name), ''),
                        nullif(btrim(s.first_name), '')))
    INTO staged_name
    FROM coexistence_staged_contacts s
   WHERE s.account_id = NEW.account_id
     AND coalesce(nullif(s.phone_normalized, ''),
                  regexp_replace(s.phone, '[^0-9]', '', 'g')) = key
     AND NOT public.fn_is_placeholder_contact_name(
           coalesce(nullif(btrim(s.full_name), ''), nullif(btrim(s.first_name), ''))
         )
   -- Newest wins: a reconnect creates a new whatsapp_config, so the same
   -- number can be staged more than once and the later row reflects what
   -- the phone calls them now.
   ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
   LIMIT 1;

  IF staged_name IS NOT NULL THEN
    NEW.name := staged_name;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_contacts_take_staged_name ON contacts;

CREATE TRIGGER trg_contacts_take_staged_name
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_contacts_take_staged_name();

-- ------------------------------------------------------------
-- 4. Catch up everything currently stranded.
--
-- Same shape as the backfill in 20260824000000, re-run because a number
-- connected after that migration and produced 69 more number-named
-- contacts. From now on the triggers keep it from happening again, so this
-- is the last time it needs doing by hand.
-- ------------------------------------------------------------
DO $$
DECLARE
  fixed integer;
BEGIN
  WITH best_staged AS (
    SELECT DISTINCT ON (s.account_id, coalesce(nullif(s.phone_normalized, ''), regexp_replace(s.phone, '[^0-9]', '', 'g')))
      s.account_id,
      coalesce(nullif(s.phone_normalized, ''), regexp_replace(s.phone, '[^0-9]', '', 'g')) AS key,
      btrim(coalesce(nullif(btrim(s.full_name), ''), nullif(btrim(s.first_name), ''))) AS resolved_name
    FROM coexistence_staged_contacts s
    ORDER BY
      s.account_id,
      coalesce(nullif(s.phone_normalized, ''), regexp_replace(s.phone, '[^0-9]', '', 'g')),
      s.updated_at DESC NULLS LAST,
      s.created_at DESC
  )
  UPDATE contacts c
     SET name = b.resolved_name,
         updated_at = now()
    FROM best_staged b
   WHERE c.account_id = b.account_id
     AND c.phone_normalized = b.key
     AND public.fn_is_placeholder_contact_name(c.name)
     AND NOT public.fn_is_placeholder_contact_name(b.resolved_name);

  GET DIAGNOSTICS fixed = ROW_COUNT;
  RAISE NOTICE 'coexistence: % more contact name(s) recovered', fixed;
END
$$;
