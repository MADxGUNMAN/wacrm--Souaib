-- Contact search: match phone numbers regardless of spacing/punctuation.
--
-- `phone ILIKE '%term%'` misses when the user types "+222 4855 0082" but
-- the row stores "+22248550082" (or vice versa). When the search term
-- looks like a phone number (only digits and + ( ) . - / spaces), also
-- compare its digits against the generated `phone_normalized` column.
-- Leading zeros are dropped so a trunk-0 / 00-prefixed entry still
-- matches the stored international form. Mirrors
-- src/lib/contacts/search.ts, which does the same for the non-tag path.
--
-- Same signature as 20260916130000, so grants and ownership are kept.

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
  WITH term AS (
    SELECT
      NULLIF(BTRIM(p_search), '') AS q,
      CASE
        WHEN BTRIM(p_search) ~ '^[0-9\s+().\-/]+$'
          THEN NULLIF(LTRIM(regexp_replace(p_search, '\D', '', 'g'), '0'), '')
      END AS digits
  ),
  matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    CROSS JOIN term t
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        t.q IS NULL
        OR c.name ILIKE '%' || t.q || '%'
        OR c.phone ILIKE '%' || t.q || '%'
        OR c.email ILIKE '%' || t.q || '%'
        OR (t.digits IS NOT NULL AND c.phone_normalized LIKE '%' || t.digits || '%')
      )
      AND (
        p_sources IS NULL
        OR cardinality(p_sources) = 0
        OR c.source = ANY(p_sources)
      )
  ),
  page AS (
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
