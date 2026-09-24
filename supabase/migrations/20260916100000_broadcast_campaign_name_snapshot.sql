-- ============================================================
-- A run must never forget which campaign it came from.
--
-- THE BUG THIS FIXES
-- `broadcasts.api_campaign_id` is ON DELETE SET NULL (migration
-- 20260912100000). That was the right call for the data — deleting a
-- campaign definition must never delete the record of messages sent to
-- real customers — but it left the UI lying.
--
-- Delete a campaign and its runs instantly stop being runs: the Type
-- column flips from API to Broadcast, they vanish from the "API campaign
-- runs" filter, and they reappear among ordinary dashboard sends carrying
-- a name like "api camping (google_sheets)" that looks like something a
-- person typed. The delete confirmation promises "its send history is
-- kept", and the rows do survive — but stripped of any way to tell what
-- they were, which is not what the promise means.
--
-- `source_ref` (migration 20260915130000) was a partial answer: it
-- survives the delete and proves a run was externally triggered, but it
-- cannot name the campaign, so the history is still unattributable.
--
-- THE FIX
-- Snapshot the campaign's name onto the run when the run is created. A
-- snapshot rather than a join because the whole point is to outlive the
-- row it was copied from. Renaming a campaign therefore does NOT rewrite
-- its past runs, which is correct: a run records what it was sent as, in
-- the same spirit as `broadcast_recipients.send_params` freezing the
-- values a recipient actually received.
-- ============================================================

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS api_campaign_name TEXT;

COMMENT ON COLUMN broadcasts.api_campaign_name IS
  'Name of the API campaign this run belongs to, snapshotted at run creation so it survives the campaign being deleted (api_campaign_id is ON DELETE SET NULL). Not kept in sync with api_campaigns.name on purpose: a run records what it was sent as. NULL for ordinary dashboard broadcasts.';

-- ------------------------------------------------------------
-- Backfill 1: runs whose campaign still exists
-- ------------------------------------------------------------
UPDATE broadcasts b
   SET api_campaign_name = c.name
  FROM api_campaigns c
 WHERE b.api_campaign_id = c.id
   AND b.api_campaign_name IS NULL;

-- ------------------------------------------------------------
-- Backfill 2: runs already orphaned before this migration
-- ------------------------------------------------------------
--
-- Recoverable because the run's name was generated as
-- "<campaign name> (<source kind>)" in
-- src/app/api/v1/campaigns/[id]/send/route.ts, and `source.kind` is only
-- ever 'google_sheets' (the add-on) or the literal 'api' fallback. So the
-- campaign name is the part before that exact suffix.
--
-- Anchored to those two literal kinds rather than a general "(word)"
-- pattern, because a person is perfectly entitled to name a real
-- broadcast "Autumn sale (final)" and that must not be mistaken for a
-- run. A false positive here would relabel a genuine dashboard send as
-- an API run, so the pattern is deliberately narrow: a missed orphan is
-- recoverable, a mislabelled broadcast quietly misleads.
UPDATE broadcasts
   SET api_campaign_name = regexp_replace(
         name, '\s*\((google_sheets|api)\)$', ''
       )
 WHERE api_campaign_name IS NULL
   AND api_campaign_id IS NULL
   AND name ~ '\s\((google_sheets|api)\)$'
   -- Guard against a name that is nothing BUT the suffix, which would
   -- leave an empty campaign name and read worse than no label at all.
   AND length(regexp_replace(name, '\s*\((google_sheets|api)\)$', '')) > 0;

-- Partial: only runs carry this, and only the campaign-history screens
-- ask for it.
CREATE INDEX IF NOT EXISTS idx_broadcasts_api_campaign_name
  ON broadcasts (api_campaign_name)
  WHERE api_campaign_name IS NOT NULL;
