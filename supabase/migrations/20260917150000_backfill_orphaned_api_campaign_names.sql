-- ============================================================
-- Finish the job migration 20260916100000 started.
--
-- THE GAP
-- That migration added `broadcasts.api_campaign_name` and backfilled it,
-- but the application code that populates it on new runs shipped in a
-- LATER deploy. Every API campaign run created in the window between the
-- two therefore has a live `api_campaign_id` and a NULL
-- `api_campaign_name`. Four such rows existed in production.
--
-- WHY IT MATTERED
-- `api_campaign_name` is the discriminator for "this run belongs to an API
-- campaign" (the id cannot be, because it is ON DELETE SET NULL). Rows
-- missing it were classified as ordinary broadcasts, so a single campaign
-- appeared in the Inbox's campaign filter TWICE:
--
--   ⚡ api camping                    <- runs that had the snapshot
--   ⚡ api camping (google_sheets)    <- runs that did not
--
-- The second entry is the raw generated run name, which is exactly the
-- "looks like something a person typed" problem 20260916100000 set out to
-- remove.
--
-- The reading code has also been hardened to fall back to
-- `api_campaign_id` and strip the suffix itself (see
-- resolveBroadcastOrigin), because a self-hosted instance can sit at any
-- migration point. This migration fixes the stored data so the fallback is
-- a safety net rather than the normal path.
-- ============================================================

-- Runs whose campaign still exists: take the name from the campaign.
UPDATE broadcasts b
   SET api_campaign_name = c.name
  FROM api_campaigns c
 WHERE b.api_campaign_id = c.id
   AND b.api_campaign_name IS NULL;

-- Orphaned equivalents: the campaign is gone, so the generated run name is
-- the only source left.
--
-- Anchored to the two literal source kinds rather than a general "(word)"
-- pattern, for the same reason as the original migration: a person is
-- entitled to name a real broadcast "Autumn sale (final)" and that must not
-- be relabelled as a campaign run. A missed orphan is recoverable; a
-- mislabelled broadcast quietly misleads.
UPDATE broadcasts
   SET api_campaign_name = regexp_replace(
         name, '\s*\((google_sheets|api)\)$', ''
       )
 WHERE api_campaign_name IS NULL
   AND api_campaign_id IS NULL
   AND name ~ '\s\((google_sheets|api)\)$'
   AND length(regexp_replace(name, '\s*\((google_sheets|api)\)$', '')) > 0;
