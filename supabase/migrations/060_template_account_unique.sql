-- ============================================================
-- 060 — Scope template uniqueness to the ACCOUNT, not the user.
--
-- Migration 014 added a unique index on (user_id, name, language) back
-- when a template belonged to one person. Migration 017 made templates
-- account-scoped (account_id NOT NULL, RLS by is_account_member) but
-- left that index alone, and the submit route still upserts with
-- `onConflict: 'user_id,name,language'`.
--
-- The consequence is a genuine bug, not just untidiness: two teammates
-- in the same workspace can each create a template called
-- `order_update` in `en_US`. Both rows pass the unique index because
-- their user_ids differ, but Meta only has ONE template by that name
-- per WABA. So the second submit overwrites the first on Meta's side
-- while both rows survive locally, and from then on the two rows fight
-- over one Meta template — the status webhook matches whichever row
-- holds the meta_template_id and the other is stale forever.
--
-- Broadcasts make it worse: they reference templates by name +
-- language (not id), so a send can resolve to either row.
--
-- Fix: one template per (account, name, language). That mirrors Meta's
-- own uniqueness rule, which is what the local table should reflect.
--
-- `user_id` is KEPT as authorship/audit only. It is still NOT NULL and
-- `template-row-guard.ts` asserts its presence, so it must not be
-- dropped here.
-- ============================================================

-- 1. Refuse to run if the new key would collide.
--    Fail loudly rather than silently deleting someone's template —
--    the operator picks which row to keep. Same pattern as 014.
DO $$
DECLARE
  dupe_count INT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO dupe_count
  FROM (
    SELECT account_id, name, language
    FROM message_templates
    GROUP BY account_id, name, language
    HAVING count(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    SELECT string_agg(
      account_id::text || ' / ' || name || ' / ' || COALESCE(language, '(null)') ||
        ' (' || count || ' rows)',
      E'\n  '
    )
    INTO sample
    FROM (
      SELECT account_id, name, language, count(*) AS count
      FROM message_templates
      GROUP BY account_id, name, language
      HAVING count(*) > 1
    ) d;

    RAISE EXCEPTION
      'Cannot add the account-scoped unique index: % duplicate (account_id, name, language) group(s) exist. Delete the redundant rows first, keeping the one whose meta_template_id is set:%s  %',
      dupe_count, E'\n  ', sample;
  END IF;
END $$;

-- 2. Add the new index BEFORE dropping the old one, so there is never a
--    window with no uniqueness guarantee at all.
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_name_language_key
  ON message_templates (account_id, name, language);

-- 3. Drop the legacy user-scoped index. The new index is strictly
--    stronger for our purposes (an account owns the name), so nothing
--    that used to be rejected is now allowed.
DROP INDEX IF EXISTS message_templates_user_name_language_key;
