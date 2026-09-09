-- ============================================================
-- Local Supabase bootstrap — runs ONCE, before anything else.
--
-- Creates the roles, schemas, extensions and auth helper functions that
-- hosted Supabase provides for you and that this app's 86 migrations
-- assume already exist.
--
-- Everything here is idempotent. The supabase/postgres image already
-- creates most of it; this script exists so the stack does not depend on
-- which exact image tag you pulled, and so a missing piece fails loudly
-- here rather than 40 migrations later.
--
-- Ordering matters and is enforced by the filename prefix:
--   01-bootstrap.sql   roles + schemas + extensions + auth.uid()
--   (then GoTrue starts and creates auth.users)
--   (then docker/supabase/migrate.sh applies supabase/migrations/*.sql)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Roles
--
-- `anon`, `authenticated` and `service_role` are the three roles the
-- app's RLS policies and grants reference by name — migration 082 in
-- particular REVOKEs EXECUTE from them explicitly, so they must exist
-- with these exact names.
--
-- NOLOGIN on purpose: nothing connects AS these roles. PostgREST logs in
-- as `authenticator` and switches into them per request based on the JWT.
-- ------------------------------------------------------------
DO $$
DECLARE
  placeholder_role text;
BEGIN
  -- `postgres` FIRST, and it is not optional.
  --
  -- The supabase/postgres image runs initdb as `supabase_admin`, so
  -- unlike the plain postgres image there is NO `postgres` role at all.
  -- But the app's migrations reference it by name — e.g. migration 050's
  -- `ALTER FUNCTION public.accounts_set_trial_defaults() OWNER TO
  -- postgres` and the view owner checks in 082 — and the migration runner
  -- connects as it. Without this, every such statement fails with
  -- 'role "postgres" does not exist'.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION
      PASSWORD 'postgres';
  ELSE
    ALTER ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION
      PASSWORD 'postgres';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  -- BYPASSRLS is what makes the service role able to read past every
  -- policy. src/lib/auth/admin-client.ts depends on this, and so does the
  -- super-admin panel's v_platform_accounts_summary view (which migration
  -- 082 switched to security_invoker precisely because service_role
  -- bypasses RLS).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE service_role BYPASSRLS;
  END IF;

  -- PostgREST's login role.
  --
  -- INHERIT, even though hosted Supabase uses NOINHERIT (verified) and
  -- every PostgREST tutorial says NOINHERIT. Without it this stack is
  -- subtly, confusingly broken:
  --
  --   PostgREST builds its schema cache ONCE, as `authenticator`, before
  --   any SET ROLE. A NOINHERIT authenticator holds no table privileges
  --   of its own, so information_schema shows it nothing and the log
  --   reads "Schema cache loaded 0 Relations". Reads still work — they
  --   are planned straight from the URL — but every INSERT/UPDATE/DELETE
  --   returns `404 {}`, because mutations need the cached relation.
  --
  --   The failure mode is nasty: GET works, POST 404s, and PostgREST
  --   returns an EMPTY error body, so supabase-js surfaces it as
  --   `error: {}` with no message. Nothing points at privileges.
  --
  -- Why this is safe: PostgREST issues `SET LOCAL ROLE` (anon /
  -- authenticated / service_role, from the JWT) for every request, so
  -- request-time privileges are completely unaffected. The inherited
  -- privileges only apply to queries PostgREST runs OUTSIDE a SET ROLE,
  -- which is just introspection. And BYPASSRLS is a role ATTRIBUTE, not a
  -- privilege — attributes are never inherited, so authenticator does not
  -- pick up service_role's RLS bypass.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN INHERIT PASSWORD 'postgres';
  ELSE
    ALTER ROLE authenticator LOGIN INHERIT PASSWORD 'postgres';
  END IF;

  -- GoTrue's own login role; owns the auth schema.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD 'postgres';
  ELSE
    ALTER ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD 'postgres';
  END IF;

  -- Realtime connects as this and needs REPLICATION to read the WAL.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN SUPERUSER REPLICATION PASSWORD 'postgres';
  ELSE
    ALTER ROLE supabase_admin LOGIN SUPERUSER REPLICATION PASSWORD 'postgres';
  END IF;

  -- ----------------------------------------------------------
  -- Roles that exist ONLY to satisfy a production restore.
  --
  -- Nothing in this stack logs in as any of these. They are here because
  -- pg_dump emits `ALTER ... OWNER TO <role>` and `GRANT ... TO <role>`
  -- for every object in the source project, and pg_dump does NOT dump
  -- roles (that is `pg_dumpall --roles-only`). A plain-SQL restore
  -- therefore fails on the first reference to a role that does not exist
  -- locally, and with ON_ERROR_STOP it fails hard.
  --
  -- Taken from the actual dump by extracting every role named in an
  -- OWNER TO / GRANT statement, so this list is measured, not guessed.
  -- NOLOGIN: they are name placeholders for ownership, not accounts.
  -- ----------------------------------------------------------
  FOREACH placeholder_role IN ARRAY ARRAY[
    'dashboard_user',
    'pgbouncer',
    'supabase_functions_admin',
    'supabase_realtime_admin',
    'supabase_storage_admin'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = placeholder_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT', placeholder_role);
    END IF;
  END LOOP;
END
$$;

-- `authenticator` must be able to become each of the three request roles.
GRANT anon, authenticated, service_role TO authenticator;

-- ------------------------------------------------------------
-- 2. Schemas
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth      AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS extensions;
-- Realtime keeps its Ecto tables here (DB_AFTER_CONNECT_QUERY points at it).
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

-- The OTHER realtime schema, and the one that actually matters for the
-- inbox. Two different things share the word "realtime":
--
--   _realtime  Realtime's own bookkeeping (tenants, extensions).
--              Created above; DB_AFTER_CONNECT_QUERY points here.
--   realtime   The CDC machinery: realtime.subscription,
--              realtime.list_changes(), realtime.apply_rls().
--
-- Realtime creates the CONTENTS of `realtime` itself, via per-tenant Ecto
-- migrations that run with `prefix: "realtime"` on first connection. But
-- Ecto does not create the prefix schema — it assumes it exists. Hosted
-- Supabase provisions it out of band and the supabase/postgres image does
-- not, so without this line the tenant migrations abort with
-- 'schema "realtime" does not exist', `realtime.subscription` is never
-- created, and every `.channel(...).subscribe()` reports SUBSCRIBED while
-- silently delivering nothing. The websocket even handshakes with 101, so
-- this failure is invisible from the client side.
--
-- Owner must be supabase_admin: that is the role Realtime connects as, and
-- Ecto needs CREATE on the schema.
CREATE SCHEMA IF NOT EXISTS realtime  AUTHORIZATION supabase_admin;

GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA realtime   TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Extensions
--
-- Placement mirrors PRODUCTION exactly, because migration 082's advisor
-- work depends on it:
--   uuid-ossp + pgcrypto -> extensions schema
--   vector               -> public schema
--
-- `vector` in public is flagged by Supabase's own linter, and I
-- deliberately left it there in prod because moving it would rewrite
-- ai_knowledge_chunks.embedding. Matching that here means local and prod
-- resolve `vector` identically instead of diverging.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector      WITH SCHEMA public;

-- Migration 001 calls `uuid_generate_v4()` unqualified, and every table
-- defaults to it. Put `extensions` on the search path for every role that
-- runs SQL so those bare calls resolve.
ALTER DATABASE postgres SET search_path TO public, extensions;
ALTER ROLE anon           SET search_path TO public, extensions;
ALTER ROLE authenticated  SET search_path TO public, extensions;
ALTER ROLE service_role   SET search_path TO public, extensions;
ALTER ROLE authenticator  SET search_path TO public, extensions;
ALTER ROLE postgres       SET search_path TO public, extensions;

-- ------------------------------------------------------------
-- 4. auth.uid() — deliberately NOT created here.
--
-- It was, and it broke GoTrue on startup:
--
--   ERROR: must be owner of function uid (SQLSTATE 42501)
--
-- GoTrue's own 00_init_auth_schema migration does
-- `create or replace function auth.uid()`. This script runs as
-- `supabase_admin`, so the function ended up owned by supabase_admin,
-- and GoTrue (which connects as `supabase_auth_admin`) is not the owner
-- and cannot replace it. GoTrue then crash-looped forever and auth.users
-- was never created.
--
-- So GoTrue creates its own versions first, and
-- docker/supabase/migrate.sh replaces them afterwards as `postgres` — a
-- superuser, which bypasses the ownership check. That ordering also lets
-- us install the JSON-claims-aware versions the app actually needs; see
-- the comment in migrate.sh for why GoTrue's own ones are not enough.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5. Default privileges
--
-- The migrations create ~66 tables without explicit grants, relying on
-- hosted Supabase's default-privilege setup. Replicate it so PostgREST
-- can see them. RLS still governs the rows — these are table-level
-- grants only, which is exactly the model the app already runs under.
-- ------------------------------------------------------------
-- FOR ROLE postgres — and that clause is the whole point.
--
-- Without it these read as "for objects created by the role running THIS
-- script", i.e. supabase_admin. But the 89 migrations are applied as
-- `postgres`, so every table they created got no grants at all and
-- PostgREST returned:
--
--   {"code":"42501","message":"permission denied for table accounts"}
--
-- ...for anon AND service_role alike. Worth noting service_role failed
-- too despite having BYPASSRLS: that attribute skips RLS POLICIES, it
-- does not grant table PRIVILEGES.
--
-- Setting the defaults per creating-role here means each object picks up
-- its grants at CREATE time during the migration run — which also
-- preserves ordering, so migration 082's REVOKEs at the end of the
-- history still have the final say. A blanket
-- `GRANT EXECUTE ON ALL FUNCTIONS` afterwards would have silently undone
-- 082's hardening.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- Belt and braces for anything created by supabase_admin.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5b. A minimal `storage` schema STUB.
--
-- This stack deliberately does NOT run Supabase Storage: grepping the
-- app for `supabase.storage` returns zero call sites, because uploads
-- were moved to S3 (@aws-sdk/client-s3 + the AWS_S3_* vars). Running
-- the storage + imgproxy containers would be two services handling no
-- traffic.
--
-- But three HISTORICAL migrations still configure it:
--   008_profile_avatars_storage.sql  avatars bucket + 4 policies
--   016_flow_media.sql               flow-media bucket + 4 policies
--   020_account_sharing_followups.sql drops 3 of 016's policies
--
-- They are dead configuration for this deployment, yet they are part of
-- the migration history and must replay in order. Without the tables
-- below, 008 fails on line 27 with 'relation "storage.buckets" does not
-- exist' and migrations 008-086 never run at all.
--
-- So: create just enough of the real shape for those statements to
-- succeed. Nothing reads these tables at runtime. If you ever DO want
-- real Supabase Storage locally, drop this stub and add the official
-- storage service instead — the stub would shadow it.
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  public             boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id               uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  bucket_id        text REFERENCES storage.buckets(id),
  name             text,
  owner            uuid,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata         jsonb,
  path_tokens      text[],
  version          text,
  owner_id         text
);

-- The migrations create RLS policies on this table, which requires RLS
-- to be enabled for them to have any meaning.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Referenced by every one of those policies as
-- `(storage.foldername(name))[1]` to pull the owning user's uid out of
-- the object path. Same behaviour as Supabase's: all path segments
-- except the final filename.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts[1 : array_length(parts, 1) - 1];
END
$$;

GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 6. The `supabase_realtime` publication — EMPTY, but it must exist.
--
-- Hosted Supabase creates this for you. The app's migrations then add
-- their own tables to it:
--
--   001 -> messages, conversations      024 -> member_presence
--   009 -> message_reactions            027 -> notifications
--   010 -> flow_runs
--
-- Each does a bare `ALTER PUBLICATION supabase_realtime ADD TABLE ...`,
-- so without this line migration 001 dies on line 413 with
-- 'publication "supabase_realtime" does not exist' and nothing else
-- runs. Creating it empty here lets all six migrations populate it
-- exactly as they do against hosted Supabase.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 7. Logical replication, for Realtime
--
-- Realtime reads the WAL, which needs wal_level=logical. The
-- supabase/postgres image already sets this; asserted here so a wrong
-- base image fails with a clear message instead of a silent dead inbox.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF current_setting('wal_level') <> 'logical' THEN
    RAISE WARNING
      'wal_level is "%" but Realtime needs "logical". Live inbox updates will not work.',
      current_setting('wal_level');
  END IF;
END
$$;
