-- ============================================================
-- filter_contacts_by_tags gains a source filter.
--
-- WHY THIS MIGRATION IS NECESSARY AND NOT COSMETIC
-- The Contacts page has two mutually exclusive query paths: a plain table
-- select, and this RPC whenever a tag filter is active (migration 025 —
-- the join has to happen in SQL or a popular tag silently truncates at
-- PostgREST's row cap).
--
-- Adding a source filter only to the table select would mean selecting a
-- tag QUIETLY DISCARDS the source filter, while the chips above the table
-- still claim both are applied, and `total_count` — which this function
-- computes with count(*) OVER() before LIMIT — would page a different
-- result set than the one described. Worse, the same two-branch shape
-- backs "select all matching" for bulk delete, so the confirmed count and
-- the rows actually deleted would disagree.
--
-- So the filter has to exist in both branches or in neither.
--
-- Signature note: `p_sources` is added with a DEFAULT so any caller still
-- passing four arguments keeps working. The old function is DROPPED rather
-- than left alongside the new one, because CREATE OR REPLACE with an extra
-- parameter creates an OVERLOAD, and PostgREST would then have two
-- candidates for a 4-argument call — with the stale one silently ignoring
-- sources, which is the exact bug this migration exists to prevent.
-- ============================================================

-- ------------------------------------------------------------
-- FIRST: remove an orphaned overload that has been breaking the tag
-- filter in production.
-- ------------------------------------------------------------
--
-- A second `filter_contacts_by_tags` exists in the live database that is
-- in NO migration file:
--
--   filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean DEFAULT false,
--                           p_search text DEFAULT NULL, p_limit int DEFAULT 50,
--                           p_offset int DEFAULT 0) RETURNS SETOF contacts
--
-- It appears in `supabase/Production db backups/24-08-plain.sql`, so it is
-- an old hand-applied version that migration 025 was meant to supersede but
-- never dropped, because 025 created a DIFFERENT signature instead of
-- replacing it.
--
-- The damage: every parameter after the first has a default, so a call with
-- (p_tag_ids, p_search, p_limit, p_offset) — exactly what the Contacts page
-- sends — matches BOTH functions, and Postgres refuses it:
--
--   ERROR 42725: function ... is not unique
--   HINT: Could not choose a best candidate function.
--
-- So the RPC path has been failing on every tag filter and silently taking
-- the client-side fallback in `fetchContacts`, which is capped by PostgREST
-- at ~1000 rows — reintroducing the exact truncation migration 025 was
-- written to eliminate. It also returns SETOF contacts with no
-- `total_count`, so the pagination total read as 0.
--
-- Nothing references it: `p_match_all` appears nowhere in src/, and the app
-- has always read `total_count`. Dropping it is what makes the intended
-- function reachable again.
DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(
  UUID[], BOOLEAN, TEXT, INT, INT
);

DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_sources TEXT[] DEFAULT NULL
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    -- Distinct contacts having ANY of the selected tags (OR),
    -- narrowed by the same name/phone/email search as the list.
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
      -- NULL and empty both mean "no source filter", so the client can send
      -- an empty array without having to special-case it into a NULL.
      AND (
        p_sources IS NULL
        OR cardinality(p_sources) = 0
        OR c.source = ANY(p_sources)
      )
  ),
  page AS (
    -- count(*) OVER() is evaluated before LIMIT, so it is the full
    -- match total regardless of the page being returned.
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, TEXT[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, TEXT[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, TEXT[])
  TO authenticated;
