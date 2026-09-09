-- ============================================================
-- 024b_presence_status_enum.sql
--
-- Adds `presence_status_enum` and switches `member_presence.status` and
-- `touch_presence()` onto it.
--
-- ─── WHY THIS FILE EXISTS ───────────────────────────────────
--
-- Schema drift, same class as 081b. Production has:
--
--   presence_status_enum  = ('online','busy','away','offline')
--   member_presence.status  presence_status_enum NOT NULL DEFAULT 'offline'
--   touch_presence(presence_status_enum, text)
--
-- ...and NO migration in this repo creates any of it. 024_member_presence
-- created a `text`-based version, and the enum conversion was applied
-- directly against the hosted database afterwards.
--
-- It surfaced when the history was replayed against an empty Postgres:
-- 082_security_advisor_hardening.sql line 198 revokes EXECUTE on
-- `touch_presence(presence_status_enum, text)` and died with
--
--   ERROR: type "presence_status_enum" does not exist
--
-- The local database had `touch_presence(text)` instead — a genuinely
-- different function signature from production. Left unfixed, local and
-- prod would disagree about the presence API, and
-- src/components/presence/presence-heartbeat.tsx calls
-- `.rpc('touch_presence', { p_status, p_custom_status })` with two
-- arguments, so the one-arg local version would fail at runtime.
--
-- Definitions below are read back out of production verbatim.
--
-- Filename: `_` (0x5F) sorts before `b` (0x62), so this lands after
-- 024_member_presence.sql and well before 082.
--
-- Fully idempotent — a no-op against production, which already has all
-- of this.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'presence_status_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.presence_status_enum AS ENUM
      ('online', 'busy', 'away', 'offline');
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 2. Convert member_presence.status from text to the enum
--
-- Guarded on the column's current type so re-running is safe. The
-- default has to be dropped before the type change and re-added after —
-- Postgres cannot cast an existing text default to the new enum in
-- place.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.member_presence') IS NULL THEN
    RAISE NOTICE 'member_presence not present — skipping status conversion';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_presence'
      AND column_name = 'status'
      AND udt_name <> 'presence_status_enum'
  ) THEN
    -- Drop the text CHECK constraint FIRST.
    --
    -- 024_member_presence.sql line 34 declares
    --   status TEXT NOT NULL DEFAULT 'online'
    --     CHECK (status IN ('online', 'away'))
    --
    -- Once the column becomes an enum that predicate compares
    -- presence_status_enum to text and the ALTER fails with
    --   ERROR: operator does not exist: presence_status_enum = text
    --
    -- It also only permitted 2 of the 4 values production actually uses
    -- ('busy' and 'offline' would both be rejected), so the enum
    -- replaces it outright rather than it being recreated. Looked up by
    -- definition rather than by name so an auto-generated constraint name
    -- does not matter.
    DECLARE
      c record;
    BEGIN
      FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'
          AND rel.relname = 'member_presence'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      LOOP
        EXECUTE format(
          'ALTER TABLE public.member_presence DROP CONSTRAINT %I', c.conname
        );
      END LOOP;
    END;

    ALTER TABLE public.member_presence ALTER COLUMN status DROP DEFAULT;

    -- Any value outside the enum becomes 'offline' rather than failing
    -- the cast. There should be none, but a hand-edited row must not
    -- block the migration.
    ALTER TABLE public.member_presence
      ALTER COLUMN status TYPE public.presence_status_enum
      USING (
        CASE lower(status::text)
          WHEN 'online'  THEN 'online'
          WHEN 'busy'    THEN 'busy'
          WHEN 'away'    THEN 'away'
          WHEN 'offline' THEN 'offline'
          ELSE 'offline'
        END::public.presence_status_enum
      );

    ALTER TABLE public.member_presence
      ALTER COLUMN status SET DEFAULT 'offline'::public.presence_status_enum;

    ALTER TABLE public.member_presence
      ALTER COLUMN status SET NOT NULL;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. touch_presence on the enum
--
-- Drops the old text-based overload first. Without this the database
-- would carry BOTH signatures, and a two-argument call from
-- presence-heartbeat.tsx would be ambiguous.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.touch_presence(text);
DROP FUNCTION IF EXISTS public.touch_presence(text, text);

CREATE OR REPLACE FUNCTION public.touch_presence(
  p_status public.presence_status_enum DEFAULT 'online'::public.presence_status_enum,
  p_custom_status text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
  FROM profiles
  WHERE user_id = v_user_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO member_presence (user_id, account_id, status, custom_status, last_seen_at)
  VALUES (
    v_user_id,
    v_account_id,
    COALESCE(p_status, 'online'),
    p_custom_status,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = COALESCE(EXCLUDED.status, member_presence.status),
    custom_status = CASE
      -- If NULL passed, preserve existing custom_status
      WHEN p_custom_status IS NULL THEN member_presence.custom_status
      -- If empty string passed, clear custom_status
      WHEN p_custom_status = '' THEN NULL
      -- Otherwise update to new value
      ELSE p_custom_status
    END,
    last_seen_at = NOW(),
    -- Keep account_id in sync just in case user switched accounts
    account_id = EXCLUDED.account_id;
END;
$function$;

ALTER FUNCTION public.touch_presence(public.presence_status_enum, text)
  OWNER TO postgres;

-- Called from the browser by the logged-in user, so `authenticated`
-- keeps EXECUTE. 082 revokes PUBLIC + anon.
GRANT EXECUTE ON FUNCTION public.touch_presence(public.presence_status_enum, text)
  TO authenticated;
