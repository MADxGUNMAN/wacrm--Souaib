--
-- PostgreSQL database dump
--

\restrict S6IwNCV2OHEWuEbepwiAnzcY13lguelQoXBnzausmwNqWgY6IKJMFT0qjwr6dfl

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

-- Started on 2026-08-05 18:41:56

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 26 (class 2615 OID 16498)
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO supabase_admin;

--
-- TOC entry 17 (class 2615 OID 16392)
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- TOC entry 25 (class 2615 OID 16578)
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql;


ALTER SCHEMA graphql OWNER TO supabase_admin;

--
-- TOC entry 24 (class 2615 OID 16567)
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql_public;


ALTER SCHEMA graphql_public OWNER TO supabase_admin;

--
-- TOC entry 11 (class 2615 OID 16390)
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--

CREATE SCHEMA pgbouncer;


ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

--
-- TOC entry 10 (class 2615 OID 16559)
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA realtime;


ALTER SCHEMA realtime OWNER TO supabase_admin;

--
-- TOC entry 27 (class 2615 OID 16546)
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO supabase_admin;

--
-- TOC entry 13 (class 2615 OID 17478)
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA supabase_migrations;


ALTER SCHEMA supabase_migrations OWNER TO postgres;

--
-- TOC entry 23 (class 2615 OID 16607)
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO supabase_admin;

--
-- TOC entry 2 (class 3079 OID 16393)
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- TOC entry 5566 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- TOC entry 4 (class 3079 OID 16447)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- TOC entry 5567 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 5 (class 3079 OID 16608)
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- TOC entry 5568 (class 0 OID 0)
-- Dependencies: 5
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- TOC entry 3 (class 3079 OID 16436)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- TOC entry 5569 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 6 (class 3079 OID 18610)
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- TOC entry 5570 (class 0 OID 0)
-- Dependencies: 6
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- TOC entry 1271 (class 1247 OID 16744)
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE auth.aal_level OWNER TO supabase_auth_admin;

--
-- TOC entry 1295 (class 1247 OID 16885)
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


ALTER TYPE auth.code_challenge_method OWNER TO supabase_auth_admin;

--
-- TOC entry 1268 (class 1247 OID 16738)
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE auth.factor_status OWNER TO supabase_auth_admin;

--
-- TOC entry 1265 (class 1247 OID 16732)
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin;

--
-- TOC entry 1313 (class 1247 OID 16988)
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


ALTER TYPE auth.oauth_authorization_status OWNER TO supabase_auth_admin;

--
-- TOC entry 1325 (class 1247 OID 17061)
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


ALTER TYPE auth.oauth_client_type OWNER TO supabase_auth_admin;

--
-- TOC entry 1307 (class 1247 OID 16966)
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


ALTER TYPE auth.oauth_registration_type OWNER TO supabase_auth_admin;

--
-- TOC entry 1316 (class 1247 OID 16998)
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


ALTER TYPE auth.oauth_response_type OWNER TO supabase_auth_admin;

--
-- TOC entry 1301 (class 1247 OID 16927)
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE auth.one_time_token_type OWNER TO supabase_auth_admin;

--
-- TOC entry 1469 (class 1247 OID 18157)
-- Name: account_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_role_enum AS ENUM (
    'owner',
    'admin',
    'agent',
    'viewer',
    'member'
);


ALTER TYPE public.account_role_enum OWNER TO postgres;

--
-- TOC entry 1478 (class 1247 OID 18434)
-- Name: presence_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.presence_status_enum AS ENUM (
    'online',
    'busy',
    'away',
    'offline'
);


ALTER TYPE public.presence_status_enum OWNER TO postgres;

--
-- TOC entry 1340 (class 1247 OID 17177)
-- Name: action; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


ALTER TYPE realtime.action OWNER TO supabase_realtime_admin;

--
-- TOC entry 1343 (class 1247 OID 17188)
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


ALTER TYPE realtime.equality_op OWNER TO supabase_realtime_admin;

--
-- TOC entry 1346 (class 1247 OID 17217)
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


ALTER TYPE realtime.user_defined_filter OWNER TO supabase_realtime_admin;

--
-- TOC entry 1349 (class 1247 OID 17220)
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


ALTER TYPE realtime.wal_column OWNER TO supabase_realtime_admin;

--
-- TOC entry 1352 (class 1247 OID 17223)
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


ALTER TYPE realtime.wal_rls OWNER TO supabase_realtime_admin;

--
-- TOC entry 1379 (class 1247 OID 17408)
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE storage.buckettype OWNER TO supabase_storage_admin;

--
-- TOC entry 427 (class 1255 OID 16544)
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

--
-- TOC entry 5609 (class 0 OID 0)
-- Dependencies: 427
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- TOC entry 440 (class 1255 OID 16714)
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;

--
-- TOC entry 426 (class 1255 OID 16543)
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

--
-- TOC entry 5612 (class 0 OID 0)
-- Dependencies: 426
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- TOC entry 425 (class 1255 OID 16542)
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

--
-- TOC entry 5614 (class 0 OID 0)
-- Dependencies: 425
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- TOC entry 428 (class 1255 OID 16551)
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO supabase_admin;

--
-- TOC entry 5630 (class 0 OID 0)
-- Dependencies: 428
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- TOC entry 432 (class 1255 OID 16572)
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


ALTER FUNCTION extensions.grant_pg_graphql_access() OWNER TO supabase_admin;

--
-- TOC entry 5632 (class 0 OID 0)
-- Dependencies: 432
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- TOC entry 429 (class 1255 OID 16553)
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO supabase_admin;

--
-- TOC entry 5634 (class 0 OID 0)
-- Dependencies: 429
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- TOC entry 430 (class 1255 OID 16563)
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO supabase_admin;

--
-- TOC entry 431 (class 1255 OID 16564)
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO supabase_admin;

--
-- TOC entry 433 (class 1255 OID 16574)
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


ALTER FUNCTION extensions.set_graphql_placeholder() OWNER TO supabase_admin;

--
-- TOC entry 5663 (class 0 OID 0)
-- Dependencies: 433
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- TOC entry 439 (class 1255 OID 16665)
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: supabase_admin
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


ALTER FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) OWNER TO supabase_admin;

--
-- TOC entry 375 (class 1255 OID 16391)
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: supabase_admin
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO supabase_admin;

--
-- TOC entry 476 (class 1255 OID 17874)
-- Name: _bcast_bump(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public._bcast_bump(bid uuid, col text, delta integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE broadcasts SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',
    col, col
  ) USING delta, bid;
END;
$_$;


ALTER FUNCTION public._bcast_bump(bid uuid, col text, delta integer) OWNER TO postgres;

--
-- TOC entry 477 (class 1255 OID 17875)
-- Name: _bcast_cols_for_status(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public._bcast_cols_for_status(s text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- 'pending' contributes to nothing.
  IF s = 'pending' THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;
  IF s = 'delivered' THEN RETURN ARRAY['sent_count','delivered_count']; END IF;
  IF s = 'read'      THEN RETURN ARRAY['sent_count','delivered_count','read_count']; END IF;
  IF s = 'replied'   THEN RETURN ARRAY['sent_count','delivered_count','read_count','replied_count']; END IF;
  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$;


ALTER FUNCTION public._bcast_cols_for_status(s text) OWNER TO postgres;

--
-- TOC entry 475 (class 1255 OID 17862)
-- Name: broadcast_recipient_aggregate_trigger(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.broadcast_recipient_aggregate_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  old_cols TEXT[];
  new_cols TEXT[];
  c TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(OLD.broadcast_id, c, -1);
    END LOOP;
    RETURN OLD;
  END IF;

  -- UPDATE: only care if status changed.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    new_cols := _bcast_cols_for_status(NEW.status);
    -- Subtract the old contributions, add the new.
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, -1);
    END LOOP;
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.broadcast_recipient_aggregate_trigger() OWNER TO postgres;

--
-- TOC entry 493 (class 1255 OID 18608)
-- Name: claim_ai_reply_slot(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_ai_reply_slot(conversation_id uuid, max_replies integer) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH claimed AS (
    UPDATE conversations
    SET ai_reply_count = ai_reply_count + 1
    WHERE id = conversation_id
      AND ai_reply_count < max_replies
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;


ALTER FUNCTION public.claim_ai_reply_slot(conversation_id uuid, max_replies integer) OWNER TO postgres;

--
-- TOC entry 611 (class 1255 OID 19031)
-- Name: enforce_profile_privilege_columns(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_profile_privilege_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role and account_id cannot be changed directly; use the account member/invitation RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 308 (class 1259 OID 17509)
-- Name: contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    phone text NOT NULL,
    name text,
    email text,
    company text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL,
    phone_normalized text GENERATED ALWAYS AS (regexp_replace(phone, '\D'::text, ''::text, 'g'::text)) STORED
);


ALTER TABLE public.contacts OWNER TO postgres;

--
-- TOC entry 489 (class 1255 OID 18469)
-- Name: filter_contacts_by_tags(uuid[], boolean, text, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean DEFAULT false, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS SETOF public.contacts
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tag_count INTEGER;
  v_limit INTEGER;
  v_offset INTEGER;
BEGIN
  -- Validate and bound pagination
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- If no tags specified, fallback to simple search/list (still account-scoped by RLS)
  IF p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL THEN
    RETURN QUERY
    SELECT c.*
    FROM contacts c
    WHERE (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset;
    RETURN;
  END IF;

  v_tag_count := array_length(p_tag_ids, 1);

  IF p_match_all THEN
    -- AND filter: Contact must have ALL specified tags.
    -- We join contact_tags, filter by tag_ids, group by contact,
    -- and ensure the distinct tag count matches array length.
    RETURN QUERY
    SELECT c.*
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
    GROUP BY c.id
    HAVING COUNT(DISTINCT ct.tag_id) = v_tag_count
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset;
  ELSE
    -- OR filter: Contact must have AT LEAST ONE of the specified tags.
    RETURN QUERY
    SELECT DISTINCT c.*
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset;
  END IF;
END;
$$;


ALTER FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- TOC entry 616 (class 1255 OID 19384)
-- Name: fn_account_deep_dive(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_account_deep_dive(target_account_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'account', (SELECT row_to_json(a.*) FROM accounts a WHERE a.id = target_account_id),
    'members', (
      SELECT json_agg(json_build_object(
        'user_id', p.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'avatar_url', p.avatar_url,
        'account_role', p.account_role,
        'permissions', p.permissions,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'last_seen_at', (SELECT mp.last_seen_at FROM member_presence mp WHERE mp.user_id = p.user_id),
        'is_online', (SELECT mp.last_seen_at > NOW() - INTERVAL '5 minutes' FROM member_presence mp WHERE mp.user_id = p.user_id)
      ))
      FROM profiles p WHERE p.account_id = target_account_id
    ),
    'stats', json_build_object(
      'contact_count', (SELECT COUNT(*) FROM contacts WHERE account_id = target_account_id),
      'conversation_count', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id),
      'active_conversations', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id AND status = 'open'),
      'messages_total', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id),
      'messages_30d', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id AND m.created_at > NOW() - INTERVAL '30 days'),
      'active_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id AND is_active = TRUE),
      'total_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id),
      'broadcasts_sent', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id AND status = 'sent'),
      'deals_open_value', (SELECT COALESCE(SUM(value), 0) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open'),
      'deals_open_count', (SELECT COUNT(*) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open')
    ),
    'whatsapp_config', (
      SELECT row_to_json(wc.*)
      FROM whatsapp_config wc WHERE wc.account_id = target_account_id
      LIMIT 1
    )
  ) INTO result;
  RETURN result;
END;
$$;


ALTER FUNCTION public.fn_account_deep_dive(target_account_id uuid) OWNER TO postgres;

--
-- TOC entry 618 (class 1255 OID 19466)
-- Name: fn_health_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_health_metrics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
  v_metrics jsonb;
  v_message_volume jsonb;
  v_activity_feed jsonb;
  v_table_stats jsonb;
BEGIN
  -- 1. KPI Metrics
  SELECT jsonb_build_object(
    'total_messages', (SELECT count(*) FROM messages),
    'messages_today', (SELECT count(*) FROM messages WHERE created_at >= CURRENT_DATE),
    'messages_7d', (SELECT count(*) FROM messages WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'total_contacts', (SELECT count(*) FROM contacts),
    'total_conversations', (SELECT count(*) FROM conversations),
    'total_accounts', (SELECT count(*) FROM accounts),
    'active_accounts', (SELECT count(*) FROM accounts WHERE is_banned = false),
    'banned_accounts', (SELECT count(*) FROM accounts WHERE is_banned = true),
    'total_ai_tokens', COALESCE((SELECT sum(total_tokens) FROM ai_usage_log), 0),
    'ai_requests_today', (SELECT count(*) FROM ai_usage_log WHERE created_at >= CURRENT_DATE),
    'total_automation_runs', (SELECT count(*) FROM automation_logs),
    'automation_runs_today', (SELECT count(*) FROM automation_logs WHERE created_at >= CURRENT_DATE),
    'total_broadcasts', (SELECT count(*) FROM broadcasts),
    'total_users', (SELECT count(*) FROM profiles),
    'connected_whatsapp', (SELECT count(*) FROM whatsapp_config WHERE status = 'connected')
  ) INTO v_metrics;

  -- 2. Message volume per day (last 30 days)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('date', d.day::text, 'count', COALESCE(m.cnt, 0))
    ORDER BY d.day
  ), '[]'::jsonb)
  INTO v_message_volume
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') AS d(day)
  LEFT JOIN (
    SELECT date_trunc('day', created_at)::date AS msg_day, count(*) AS cnt
    FROM messages
    WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY msg_day
  ) m ON m.msg_day = d.day::date;

  -- 3. Recent activity feed (last 50 events combined)
  WITH combined AS (
    (SELECT 'account_created' AS event_type,
            'New account created: ' || a.name AS description,
            a.name AS account_name,
            a.created_at AS ts
     FROM accounts a
     ORDER BY a.created_at DESC LIMIT 15)
    UNION ALL
    (SELECT 'broadcast_sent',
            'Broadcast "' || b.name || '" sent to ' || COALESCE(b.total_recipients, 0) || ' recipients',
            COALESCE((SELECT name FROM accounts WHERE id = b.account_id), 'Unknown'),
            b.created_at
     FROM broadcasts b
     ORDER BY b.created_at DESC LIMIT 15)
    UNION ALL
    (SELECT 'automation_triggered',
            'Automation triggered: ' || COALESCE(al.trigger_event, 'unknown') || ' (' || COALESCE(al.status, 'unknown') || ')',
            COALESCE((SELECT name FROM accounts WHERE id = al.account_id), 'Unknown'),
            al.created_at
     FROM automation_logs al
     ORDER BY al.created_at DESC LIMIT 20)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', event_type,
      'description', description,
      'account_name', account_name,
      'timestamp', ts
    ) ORDER BY ts DESC
  ), '[]'::jsonb)
  INTO v_activity_feed
  FROM combined;

  -- 4. Table stats
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table_name', t.table_name,
      'row_count', COALESCE(s.n_live_tup, 0)
    ) ORDER BY t.table_name
  ), '[]'::jsonb)
  INTO v_table_stats
  FROM (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) t
  LEFT JOIN pg_stat_user_tables s ON s.schemaname = 'public' AND s.relname = t.table_name;

  -- Combine
  result := jsonb_build_object(
    'metrics', v_metrics,
    'message_volume', v_message_volume,
    'activity_feed', v_activity_feed,
    'table_stats', v_table_stats
  );

  RETURN result;
END;
$$;


ALTER FUNCTION public.fn_health_metrics() OWNER TO postgres;

--
-- TOC entry 615 (class 1255 OID 19383)
-- Name: fn_platform_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_platform_metrics() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_accounts', (SELECT COUNT(*) FROM accounts),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'active_today', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '24 hours'),
    'active_7d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '7 days'),
    'active_30d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '30 days'),
    'messages_today', (SELECT COUNT(*) FROM messages WHERE created_at > CURRENT_DATE),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_accounts_today', (SELECT COUNT(*) FROM accounts WHERE created_at > CURRENT_DATE),
    'new_accounts_7d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_accounts_30d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '30 days'),
    'banned_accounts', (SELECT COUNT(*) FROM accounts WHERE is_banned = TRUE),
    'total_contacts', (SELECT COUNT(*) FROM contacts),
    'total_broadcasts', (SELECT COUNT(*) FROM broadcasts),
    'total_automations', (SELECT COUNT(*) FROM automations WHERE is_active = TRUE),
    'total_deals_value', (SELECT COALESCE(SUM(value), 0) FROM deals WHERE status = 'open'),
    'connected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'connected'),
    'disconnected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'disconnected')
  ) INTO result;
  RETURN result;
END;
$$;


ALTER FUNCTION public.fn_platform_metrics() OWNER TO postgres;

--
-- TOC entry 617 (class 1255 OID 19385)
-- Name: fn_signups_over_time(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_signups_over_time(days_back integer DEFAULT 30) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT 
      d::date AS date,
      (SELECT COUNT(*) FROM accounts WHERE created_at::date = d::date) AS new_accounts,
      (SELECT COUNT(*) FROM profiles WHERE created_at::date = d::date) AS new_users
    FROM generate_series(
      CURRENT_DATE - (days_back || ' days')::INTERVAL,
      CURRENT_DATE,
      '1 day'::INTERVAL
    ) AS d
    ORDER BY d
  ) t;
  RETURN result;
END;
$$;


ALTER FUNCTION public.fn_signups_over_time(days_back integer) OWNER TO postgres;

--
-- TOC entry 481 (class 1255 OID 18394)
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- TOC entry 478 (class 1255 OID 17992)
-- Name: increment_automation_execution_count(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_automation_execution_count(p_automation_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE automations
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;


ALTER FUNCTION public.increment_automation_execution_count(p_automation_id uuid) OWNER TO postgres;

--
-- TOC entry 479 (class 1255 OID 18145)
-- Name: increment_flow_execution_count(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_flow_execution_count(p_flow_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE flows
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_flow_id;
$$;


ALTER FUNCTION public.increment_flow_execution_count(p_flow_id uuid) OWNER TO postgres;

--
-- TOC entry 480 (class 1255 OID 18216)
-- Name: is_account_member(uuid, public.account_role_enum); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_account_member(target_account_id uuid, min_role public.account_role_enum DEFAULT 'member'::public.account_role_enum) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 2
            WHEN 'member' THEN 1
            -- Legacy values (should not exist post-migration, but be safe)
            WHEN 'admin'  THEN 1
            WHEN 'agent'  THEN 1
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 2
            WHEN 'member' THEN 1
            WHEN 'admin'  THEN 1
            WHEN 'agent'  THEN 1
            WHEN 'viewer' THEN 1
          END
  );
$$;


ALTER FUNCTION public.is_account_member(target_account_id uuid, min_role public.account_role_enum) OWNER TO postgres;

--
-- TOC entry 609 (class 1255 OID 18994)
-- Name: match_ai_knowledge_fts(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) RETURNS TABLE(id uuid, content text, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$;


ALTER FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) OWNER TO postgres;

--
-- TOC entry 610 (class 1255 OID 18995)
-- Name: match_ai_knowledge_semantic(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) RETURNS TABLE(id uuid, content text, distance real)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT c.id,
         c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$;


ALTER FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) OWNER TO postgres;

--
-- TOC entry 487 (class 1255 OID 18425)
-- Name: merge_duplicate_contacts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.merge_duplicate_contacts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group   RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           phone_normalized,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE phone_normalized <> ''
    GROUP BY account_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    -- Plain re-point: these tables have no contact-scoped unique
    -- constraint. `conversations` is ON DELETE CASCADE, so this
    -- re-point is what saves its rows (and their messages) from
    -- being deleted with the loser contact.
    UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

    -- Conflict-guarded re-point for UNIQUE(contact_id, tag_id):
    -- move only tags the survivor doesn't already have, drop the rest.
    UPDATE contact_tags ct SET contact_id = v_survivor
      WHERE ct.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_tags s
          WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id
        );
    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

    -- Same guard for UNIQUE(contact_id, custom_field_id). Survivor's
    -- own value wins on conflict.
    UPDATE contact_custom_values cv SET contact_id = v_survivor
      WHERE cv.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_custom_values s
          WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id
        );
    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

    -- flow_runs has a partial UNIQUE on active runs per contact.
    -- Re-point only NON-active runs (exempt from the partial index)
    -- to preserve history; any active loser run is left to be
    -- NULLed by its FK's ON DELETE SET NULL when the loser is
    -- removed below — avoids colliding with the survivor's active run.
    UPDATE flow_runs SET contact_id = v_survivor
      WHERE contact_id = ANY(v_losers) AND status <> 'active';

    DELETE FROM contacts WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;


ALTER FUNCTION public.merge_duplicate_contacts() OWNER TO postgres;

--
-- TOC entry 612 (class 1255 OID 19064)
-- Name: merge_duplicate_conversations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.merge_duplicate_conversations() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group    RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_all      UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           contact_id,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids,
           COALESCE(SUM(unread_count), 0)                AS total_unread
    FROM conversations
    GROUP BY account_id, contact_id
    HAVING count(*) > 1
  LOOP
    v_all      := v_group.ids;
    v_survivor := v_all[1];
    v_losers   := v_all[2:array_length(v_all, 1)];

    -- Re-point every conversation-scoped child from the losers onto
    -- the survivor. None of these carry a conversation-scoped unique
    -- constraint (message_id is intentionally non-unique — see
    -- migration 009), so a plain UPDATE is safe. Doing this BEFORE the
    -- delete is what saves the ON DELETE CASCADE children (messages,
    -- message_reactions, notifications) from being removed with the
    -- loser conversations.
    UPDATE messages          SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE deals             SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE flow_runs         SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE notifications     SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE ai_usage_log      SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    -- Roll the merged unread counts onto the survivor and re-derive
    -- its last-message summary from the now-complete message set, so
    -- the surviving thread reflects the full history.
    UPDATE conversations c
    SET unread_count      = v_group.total_unread,
        last_message_text = lm.content_text,
        last_message_at   = lm.created_at,
        updated_at        = NOW()
    FROM (
      SELECT content_text, created_at
      FROM messages
      WHERE conversation_id = v_survivor
      ORDER BY created_at DESC
      LIMIT 1
    ) lm
    WHERE c.id = v_survivor;

    -- Survivor may have no messages at all (edge case). Still fold in
    -- the merged unread count in that case.
    UPDATE conversations
    SET unread_count = v_group.total_unread,
        updated_at   = NOW()
    WHERE id = v_survivor
      AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_survivor);

    DELETE FROM conversations WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;


ALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;

--
-- TOC entry 490 (class 1255 OID 18540)
-- Name: notify_conversation_assigned(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_conversation_assigned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Skip self-assignment — nothing to notify the agent about.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'New conversation assigned',
    COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '
      || COALESCE(v_contact_name, 'a contact')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block the assignment itself.
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_conversation_assigned() OWNER TO postgres;

--
-- TOC entry 485 (class 1255 OID 18401)
-- Name: peek_invitation(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.peek_invitation(p_token_hash text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inv account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name
  FROM accounts
  WHERE id = v_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
END;
$$;


ALTER FUNCTION public.peek_invitation(p_token_hash text) OWNER TO postgres;

--
-- TOC entry 474 (class 1255 OID 17861)
-- Name: recompute_broadcast_counts(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.recompute_broadcast_counts(bid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$;


ALTER FUNCTION public.recompute_broadcast_counts(bid uuid) OWNER TO postgres;

--
-- TOC entry 491 (class 1255 OID 18571)
-- Name: record_webhook_failure(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_webhook_failure(endpoint_id uuid, max_failures integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE webhook_endpoints
  SET failure_count = failure_count + 1,
      is_active = CASE
        WHEN failure_count + 1 >= max_failures THEN false
        ELSE is_active
      END
  WHERE id = endpoint_id;
$$;


ALTER FUNCTION public.record_webhook_failure(endpoint_id uuid, max_failures integer) OWNER TO postgres;

--
-- TOC entry 486 (class 1255 OID 18402)
-- Name: redeem_invitation(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.redeem_invitation(p_token_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Caller's current account + its owner.
  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    -- Defensive — every authenticated user has a profile post-017.
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  -- Edge case: the inviter sent themselves a link, or the
  -- caller is somehow already in the inviter's account.
  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  -- Safety: the caller must be the SOLE OWNER of their current
  -- account (i.e. their fresh personal account from signup or a
  -- prior removal). Any other state means they're either:
  --   - a member of another shared account (joining a second
  --     would silently orphan their access to the first), or
  --   - the owner of an account with teammates (they'd abandon
  --     their team to join the inviter's).
  -- Either way, the safe answer is "make a different login".
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Belt: even if they own their account, refuse if it has any
  -- domain data — joining would orphan their contacts, deals,
  -- broadcasts, automations, flows, templates, etc.
  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Move the profile first so the cascade-on-delete of the old
  -- account doesn't try to nuke this user's profile too.
  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Clean up the orphan personal account. Empty by the checks
  -- above, so this is purely housekeeping — no cascades fire
  -- because no other rows reference it.
  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;


ALTER FUNCTION public.redeem_invitation(p_token_hash text) OWNER TO postgres;

--
-- TOC entry 483 (class 1255 OID 18398)
-- Name: remove_account_member(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.remove_account_member(p_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  -- Spin up a fresh personal account for the removed user. Mirror
  -- of handle_new_user's logic — keep them whole, just relocated.
  INSERT INTO accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),
    p_user_id
  )
  RETURNING id INTO v_new_account_id;

  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;


ALTER FUNCTION public.remove_account_member(p_user_id uuid) OWNER TO postgres;

--
-- TOC entry 613 (class 1255 OID 19179)
-- Name: set_member_permissions(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's account + role.
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+.
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve target.
  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Target must be in caller's account.
  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Cannot modify owner permissions.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot modify permissions of the account owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET permissions = p_permissions
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) OWNER TO postgres;

--
-- TOC entry 482 (class 1255 OID 18397)
-- Name: set_member_role(uuid, public.account_role_enum); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's account + role.
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+.
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  -- Can't change own role via this endpoint.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve target.
  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Target must be in caller's account.
  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Owner role changes go through transfer_account_ownership.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET account_role = p_new_role
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) OWNER TO postgres;

--
-- TOC entry 614 (class 1255 OID 19196)
-- Name: set_member_status(uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_member_status(p_user_id uuid, p_is_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's account + role.
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+.
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  -- Can't suspend self via this endpoint.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend or activate your own account'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve target.
  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Target must be in caller's account.
  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Owners cannot be suspended.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot suspend the account owner'
      USING ERRCODE = '22023';
  END IF;

  -- Commit the update
  UPDATE profiles
  SET 
    is_active = p_is_active,
    updated_at = NOW()
  WHERE user_id = p_user_id;

END;
$$;


ALTER FUNCTION public.set_member_status(p_user_id uuid, p_is_active boolean) OWNER TO postgres;

--
-- TOC entry 488 (class 1255 OID 18466)
-- Name: touch_presence(public.presence_status_enum, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.touch_presence(p_status public.presence_status_enum DEFAULT 'online'::public.presence_status_enum, p_custom_status text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


ALTER FUNCTION public.touch_presence(p_status public.presence_status_enum, p_custom_status text) OWNER TO postgres;

--
-- TOC entry 484 (class 1255 OID 18399)
-- Name: transfer_account_ownership(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You are already the owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_new_owner_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Demote current owner first so the temporary state where the
  -- account has zero owners is never visible — both writes happen
  -- in the same function transaction.
  UPDATE profiles SET account_role = 'admin'
  WHERE user_id = auth.uid();

  UPDATE profiles SET account_role = 'owner'
  WHERE user_id = p_new_owner_user_id;

  UPDATE accounts SET owner_user_id = p_new_owner_user_id
  WHERE id = v_caller_account_id;
END;
$$;


ALTER FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) OWNER TO postgres;

--
-- TOC entry 492 (class 1255 OID 18604)
-- Name: update_ai_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ai_configs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ai_configs_updated_at() OWNER TO postgres;

--
-- TOC entry 608 (class 1255 OID 18963)
-- Name: update_ai_knowledge_documents_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ai_knowledge_documents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ai_knowledge_documents_updated_at() OWNER TO postgres;

--
-- TOC entry 473 (class 1255 OID 17836)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- TOC entry 441 (class 1255 OID 17224)
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


ALTER FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) OWNER TO supabase_realtime_admin;

--
-- TOC entry 442 (class 1255 OID 17227)
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


ALTER FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) OWNER TO supabase_realtime_admin;

--
-- TOC entry 443 (class 1255 OID 17228)
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


ALTER FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) OWNER TO supabase_realtime_admin;

--
-- TOC entry 444 (class 1255 OID 17229)
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


ALTER FUNCTION realtime."cast"(val text, type_ regtype) OWNER TO supabase_realtime_admin;

--
-- TOC entry 445 (class 1255 OID 17230)
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) OWNER TO supabase_realtime_admin;

--
-- TOC entry 446 (class 1255 OID 17231)
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) OWNER TO supabase_realtime_admin;

--
-- TOC entry 447 (class 1255 OID 17232)
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


ALTER FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) OWNER TO supabase_realtime_admin;

--
-- TOC entry 448 (class 1255 OID 17233)
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


ALTER FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) OWNER TO supabase_realtime_admin;

--
-- TOC entry 449 (class 1255 OID 17234)
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


ALTER FUNCTION realtime.quote_wal2json(entity regclass) OWNER TO supabase_realtime_admin;

--
-- TOC entry 450 (class 1255 OID 17235)
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) OWNER TO supabase_realtime_admin;

--
-- TOC entry 451 (class 1255 OID 17236)
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) OWNER TO supabase_realtime_admin;

--
-- TOC entry 452 (class 1255 OID 17237)
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


ALTER FUNCTION realtime.subscription_check_filters() OWNER TO supabase_realtime_admin;

--
-- TOC entry 453 (class 1255 OID 17240)
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


ALTER FUNCTION realtime.to_regrole(role_name text) OWNER TO supabase_realtime_admin;

--
-- TOC entry 454 (class 1255 OID 17241)
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


ALTER FUNCTION realtime.topic() OWNER TO supabase_realtime_admin;

--
-- TOC entry 455 (class 1255 OID 17242)
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


ALTER FUNCTION realtime.wal2json_escape_identifier(name text) OWNER TO supabase_realtime_admin;

--
-- TOC entry 472 (class 1255 OID 17474)
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION storage.allow_any_operation(expected_operations text[]) OWNER TO supabase_storage_admin;

--
-- TOC entry 471 (class 1255 OID 17473)
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION storage.allow_only_operation(expected_operation text) OWNER TO supabase_storage_admin;

--
-- TOC entry 462 (class 1255 OID 17349)
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) OWNER TO supabase_storage_admin;

--
-- TOC entry 465 (class 1255 OID 17405)
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION storage.enforce_bucket_name_length() OWNER TO supabase_storage_admin;

--
-- TOC entry 458 (class 1255 OID 17324)
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION storage.extension(name text) OWNER TO supabase_storage_admin;

--
-- TOC entry 457 (class 1255 OID 17323)
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION storage.filename(name text) OWNER TO supabase_storage_admin;

--
-- TOC entry 456 (class 1255 OID 17322)
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION storage.foldername(name text) OWNER TO supabase_storage_admin;

--
-- TOC entry 466 (class 1255 OID 17462)
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) OWNER TO supabase_storage_admin;

--
-- TOC entry 459 (class 1255 OID 17336)
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION storage.get_size_by_bucket() OWNER TO supabase_storage_admin;

--
-- TOC entry 463 (class 1255 OID 17388)
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, next_key_token text, next_upload_token text) OWNER TO supabase_storage_admin;

--
-- TOC entry 467 (class 1255 OID 17463)
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text, sort_order text) OWNER TO supabase_storage_admin;

--
-- TOC entry 464 (class 1255 OID 17404)
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION storage.operation() OWNER TO supabase_storage_admin;

--
-- TOC entry 470 (class 1255 OID 17469)
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.protect_delete() OWNER TO supabase_storage_admin;

--
-- TOC entry 460 (class 1255 OID 17338)
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- TOC entry 469 (class 1255 OID 17467)
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) OWNER TO supabase_storage_admin;

--
-- TOC entry 468 (class 1255 OID 17466)
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text, sort_order text, sort_column text, sort_column_after text) OWNER TO supabase_storage_admin;

--
-- TOC entry 461 (class 1255 OID 17339)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION storage.update_updated_at_column() OWNER TO supabase_storage_admin;

--
-- TOC entry 269 (class 1259 OID 16529)
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin;

--
-- TOC entry 5809 (class 0 OID 0)
-- Dependencies: 269
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- TOC entry 288 (class 1259 OID 17084)
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


ALTER TABLE auth.custom_oauth_providers OWNER TO supabase_auth_admin;

--
-- TOC entry 282 (class 1259 OID 16889)
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;

--
-- TOC entry 5812 (class 0 OID 0)
-- Dependencies: 282
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- TOC entry 273 (class 1259 OID 16686)
-- Name: identities; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE auth.identities OWNER TO supabase_auth_admin;

--
-- TOC entry 5814 (class 0 OID 0)
-- Dependencies: 273
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- TOC entry 5815 (class 0 OID 0)
-- Dependencies: 273
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- TOC entry 268 (class 1259 OID 16522)
-- Name: instances; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.instances OWNER TO supabase_auth_admin;

--
-- TOC entry 5817 (class 0 OID 0)
-- Dependencies: 268
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- TOC entry 277 (class 1259 OID 16776)
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


ALTER TABLE auth.mfa_amr_claims OWNER TO supabase_auth_admin;

--
-- TOC entry 5819 (class 0 OID 0)
-- Dependencies: 277
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- TOC entry 276 (class 1259 OID 16764)
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


ALTER TABLE auth.mfa_challenges OWNER TO supabase_auth_admin;

--
-- TOC entry 5821 (class 0 OID 0)
-- Dependencies: 276
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- TOC entry 275 (class 1259 OID 16751)
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


ALTER TABLE auth.mfa_factors OWNER TO supabase_auth_admin;

--
-- TOC entry 5823 (class 0 OID 0)
-- Dependencies: 275
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- TOC entry 5824 (class 0 OID 0)
-- Dependencies: 275
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- TOC entry 285 (class 1259 OID 17001)
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


ALTER TABLE auth.oauth_authorizations OWNER TO supabase_auth_admin;

--
-- TOC entry 287 (class 1259 OID 17074)
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE auth.oauth_client_states OWNER TO supabase_auth_admin;

--
-- TOC entry 5827 (class 0 OID 0)
-- Dependencies: 287
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- TOC entry 284 (class 1259 OID 16971)
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


ALTER TABLE auth.oauth_clients OWNER TO supabase_auth_admin;

--
-- TOC entry 286 (class 1259 OID 17034)
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


ALTER TABLE auth.oauth_consents OWNER TO supabase_auth_admin;

--
-- TOC entry 283 (class 1259 OID 16939)
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


ALTER TABLE auth.one_time_tokens OWNER TO supabase_auth_admin;

--
-- TOC entry 267 (class 1259 OID 16511)
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;

--
-- TOC entry 5832 (class 0 OID 0)
-- Dependencies: 267
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- TOC entry 266 (class 1259 OID 16510)
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: supabase_auth_admin
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.refresh_tokens_id_seq OWNER TO supabase_auth_admin;

--
-- TOC entry 5834 (class 0 OID 0)
-- Dependencies: 266
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: supabase_auth_admin
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- TOC entry 280 (class 1259 OID 16818)
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


ALTER TABLE auth.saml_providers OWNER TO supabase_auth_admin;

--
-- TOC entry 5836 (class 0 OID 0)
-- Dependencies: 280
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- TOC entry 281 (class 1259 OID 16836)
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


ALTER TABLE auth.saml_relay_states OWNER TO supabase_auth_admin;

--
-- TOC entry 5838 (class 0 OID 0)
-- Dependencies: 281
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- TOC entry 270 (class 1259 OID 16537)
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;

--
-- TOC entry 5840 (class 0 OID 0)
-- Dependencies: 270
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- TOC entry 274 (class 1259 OID 16716)
-- Name: sessions; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;

--
-- TOC entry 5842 (class 0 OID 0)
-- Dependencies: 274
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- TOC entry 5843 (class 0 OID 0)
-- Dependencies: 274
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- TOC entry 5844 (class 0 OID 0)
-- Dependencies: 274
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- TOC entry 5845 (class 0 OID 0)
-- Dependencies: 274
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- TOC entry 279 (class 1259 OID 16803)
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


ALTER TABLE auth.sso_domains OWNER TO supabase_auth_admin;

--
-- TOC entry 5847 (class 0 OID 0)
-- Dependencies: 279
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- TOC entry 278 (class 1259 OID 16794)
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


ALTER TABLE auth.sso_providers OWNER TO supabase_auth_admin;

--
-- TOC entry 5849 (class 0 OID 0)
-- Dependencies: 278
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- TOC entry 5850 (class 0 OID 0)
-- Dependencies: 278
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- TOC entry 265 (class 1259 OID 16499)
-- Name: users; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


ALTER TABLE auth.users OWNER TO supabase_auth_admin;

--
-- TOC entry 5852 (class 0 OID 0)
-- Dependencies: 265
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- TOC entry 5853 (class 0 OID 0)
-- Dependencies: 265
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- TOC entry 290 (class 1259 OID 17149)
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


ALTER TABLE auth.webauthn_challenges OWNER TO supabase_auth_admin;

--
-- TOC entry 289 (class 1259 OID 17126)
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


ALTER TABLE auth.webauthn_credentials OWNER TO supabase_auth_admin;

--
-- TOC entry 333 (class 1259 OID 18182)
-- Name: account_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_invitations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    account_id uuid NOT NULL,
    token_hash text NOT NULL,
    role public.account_role_enum NOT NULL,
    created_by_user_id uuid,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by_user_id uuid,
    CONSTRAINT account_invitations_role_check CHECK ((role <> 'owner'::public.account_role_enum))
);


ALTER TABLE public.account_invitations OWNER TO postgres;

--
-- TOC entry 332 (class 1259 OID 18165)
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    owner_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_currency text DEFAULT 'USD'::text NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    banned_at timestamp with time zone,
    banned_reason text,
    banned_by_user_id uuid,
    CONSTRAINT accounts_default_currency_format CHECK ((default_currency ~ '^[A-Z]{3}$'::text))
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- TOC entry 338 (class 1259 OID 18573)
-- Name: ai_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    created_by uuid,
    provider text NOT NULL,
    model text NOT NULL,
    api_key text NOT NULL,
    system_prompt text,
    is_active boolean DEFAULT false NOT NULL,
    auto_reply_enabled boolean DEFAULT false NOT NULL,
    auto_reply_max_per_conversation integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embeddings_api_key text,
    handoff_agent_id uuid,
    CONSTRAINT ai_configs_auto_reply_max_per_conversation_check CHECK (((auto_reply_max_per_conversation >= 1) AND (auto_reply_max_per_conversation <= 20))),
    CONSTRAINT ai_configs_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'anthropic'::text, 'gemini'::text, 'nvidia'::text, 'cloudflare'::text, 'openrouter'::text, 'groq'::text, 'xai'::text])))
);


ALTER TABLE public.ai_configs OWNER TO postgres;

--
-- TOC entry 340 (class 1259 OID 18965)
-- Name: ai_knowledge_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    account_id uuid NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    fts tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_knowledge_chunks OWNER TO postgres;

--
-- TOC entry 339 (class 1259 OID 18938)
-- Name: ai_knowledge_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    created_by uuid,
    title text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_knowledge_documents OWNER TO postgres;

--
-- TOC entry 341 (class 1259 OID 19004)
-- Name: ai_usage_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    conversation_id uuid,
    mode text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_log_mode_check CHECK ((mode = ANY (ARRAY['auto_reply'::text, 'draft'::text]))),
    CONSTRAINT ai_usage_log_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'anthropic'::text, 'gemini'::text, 'nvidia'::text, 'cloudflare'::text, 'openrouter'::text, 'groq'::text, 'xai'::text])))
);


ALTER TABLE public.ai_usage_log OWNER TO postgres;

--
-- TOC entry 335 (class 1259 OID 18471)
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    created_by uuid,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.api_keys OWNER TO postgres;

--
-- TOC entry 325 (class 1259 OID 17923)
-- Name: automation_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    automation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid,
    trigger_event text NOT NULL,
    steps_executed jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id uuid NOT NULL,
    CONSTRAINT automation_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'partial'::text, 'failed'::text])))
);


ALTER TABLE public.automation_logs OWNER TO postgres;

--
-- TOC entry 326 (class 1259 OID 17952)
-- Name: automation_pending_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_pending_executions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    automation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid,
    log_id uuid,
    parent_step_id uuid,
    branch text,
    next_step_position integer NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    run_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id uuid NOT NULL,
    CONSTRAINT automation_pending_executions_branch_check CHECK ((branch = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT automation_pending_executions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


ALTER TABLE public.automation_pending_executions OWNER TO postgres;

--
-- TOC entry 324 (class 1259 OID 17899)
-- Name: automation_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_steps (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    automation_id uuid NOT NULL,
    parent_step_id uuid,
    branch text,
    step_type text NOT NULL,
    step_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_steps_branch_check CHECK ((branch = ANY (ARRAY['yes'::text, 'no'::text])))
);


ALTER TABLE public.automation_steps OWNER TO postgres;

--
-- TOC entry 323 (class 1259 OID 17877)
-- Name: automations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    last_executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id uuid NOT NULL
);


ALTER TABLE public.automations OWNER TO postgres;

--
-- TOC entry 322 (class 1259 OID 17813)
-- Name: broadcast_recipients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.broadcast_recipients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    broadcast_id uuid NOT NULL,
    contact_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    replied_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    whatsapp_message_id text,
    CONSTRAINT broadcast_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'replied'::text, 'failed'::text])))
);


ALTER TABLE public.broadcast_recipients OWNER TO postgres;

--
-- TOC entry 321 (class 1259 OID 17788)
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    template_name text NOT NULL,
    template_language text DEFAULT 'en_US'::text NOT NULL,
    template_variables jsonb,
    audience_filter jsonb,
    scheduled_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    total_recipients integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    replied_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL,
    CONSTRAINT broadcasts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.broadcasts OWNER TO postgres;

--
-- TOC entry 312 (class 1259 OID 17581)
-- Name: contact_custom_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_custom_values (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    contact_id uuid NOT NULL,
    custom_field_id uuid NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.contact_custom_values OWNER TO postgres;

--
-- TOC entry 313 (class 1259 OID 17603)
-- Name: contact_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    note_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL
);


ALTER TABLE public.contact_notes OWNER TO postgres;

--
-- TOC entry 360 (class 1259 OID 19587)
-- Name: contact_page_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_page_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    heading text DEFAULT 'Get in Touch'::text NOT NULL,
    subheading text DEFAULT 'Have a question or need help? We''d love to hear from you.'::text NOT NULL,
    office_address text DEFAULT '123 Business Hub, Mumbai, Maharashtra, India'::text,
    phone_number text DEFAULT '+91 8828891029'::text,
    email_address text DEFAULT 'info@junkiescoder.com'::text,
    working_hours text DEFAULT 'Mon – Fri, 9:00 AM – 6:00 PM IST'::text,
    form_heading text DEFAULT 'Send us a message'::text,
    form_subheading text DEFAULT 'Fill out the form below and our team will get back to you within 24 hours.'::text,
    map_embed_url text,
    extra_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.contact_page_settings OWNER TO postgres;

--
-- TOC entry 362 (class 1259 OID 19623)
-- Name: contact_replies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    sent_by text DEFAULT 'Super Admin'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.contact_replies OWNER TO postgres;

--
-- TOC entry 361 (class 1259 OID 19606)
-- Name: contact_submissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_submissions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    subject text,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    company text,
    CONSTRAINT contact_submissions_status_check CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'replied'::text, 'archived'::text])))
);


ALTER TABLE public.contact_submissions OWNER TO postgres;

--
-- TOC entry 310 (class 1259 OID 17543)
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.contact_tags OWNER TO postgres;

--
-- TOC entry 314 (class 1259 OID 17623)
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_agent_id uuid,
    last_message_text text,
    last_message_at timestamp with time zone,
    unread_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL,
    ai_autoreply_disabled boolean DEFAULT false NOT NULL,
    ai_reply_count integer DEFAULT 0 NOT NULL,
    ai_handoff_summary text,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'closed'::text])))
);


ALTER TABLE public.conversations OWNER TO postgres;

--
-- TOC entry 311 (class 1259 OID 17565)
-- Name: custom_fields; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.custom_fields (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    field_name text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    field_options jsonb,
    created_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL
);


ALTER TABLE public.custom_fields OWNER TO postgres;

--
-- TOC entry 320 (class 1259 OID 17747)
-- Name: deals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    title text NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text,
    notes text,
    expected_close_date date,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_to uuid,
    account_id uuid NOT NULL,
    CONSTRAINT deals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
);


ALTER TABLE public.deals OWNER TO postgres;

--
-- TOC entry 329 (class 1259 OID 18057)
-- Name: flow_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flow_nodes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    flow_id uuid NOT NULL,
    node_key text NOT NULL,
    node_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    position_x integer DEFAULT 0 NOT NULL,
    position_y integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flow_nodes_node_type_check CHECK ((node_type = ANY (ARRAY['start'::text, 'send_buttons'::text, 'send_list'::text, 'send_message'::text, 'send_media'::text, 'collect_input'::text, 'condition'::text, 'set_tag'::text, 'handoff'::text, 'http_fetch'::text, 'ai_agent'::text, 'end'::text])))
);


ALTER TABLE public.flow_nodes OWNER TO postgres;

--
-- TOC entry 331 (class 1259 OID 18122)
-- Name: flow_run_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flow_run_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    flow_run_id uuid NOT NULL,
    event_type text NOT NULL,
    node_key text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flow_run_events_event_type_check CHECK ((event_type = ANY (ARRAY['started'::text, 'node_entered'::text, 'message_sent'::text, 'reply_received'::text, 'fallback_fired'::text, 'handoff'::text, 'timeout'::text, 'error'::text, 'completed'::text])))
);


ALTER TABLE public.flow_run_events OWNER TO postgres;

--
-- TOC entry 330 (class 1259 OID 18079)
-- Name: flow_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flow_runs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    flow_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    current_node_key text,
    last_prompt_message_id uuid,
    vars jsonb DEFAULT '{}'::jsonb NOT NULL,
    reprompt_count integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_advanced_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    end_reason text,
    account_id uuid NOT NULL,
    CONSTRAINT flow_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'handed_off'::text, 'timed_out'::text, 'paused_by_agent'::text, 'failed'::text])))
);


ALTER TABLE public.flow_runs OWNER TO postgres;

--
-- TOC entry 328 (class 1259 OID 18034)
-- Name: flows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flows (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    entry_node_id text,
    fallback_policy jsonb DEFAULT '{"on_exhaust": "handoff", "max_reprompts": 2, "on_timeout_hours": 24, "on_unknown_reply": "reprompt"}'::jsonb NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    last_executed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id uuid NOT NULL,
    CONSTRAINT flows_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))),
    CONSTRAINT flows_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'first_inbound_message'::text, 'manual'::text])))
);


ALTER TABLE public.flows OWNER TO postgres;

--
-- TOC entry 353 (class 1259 OID 19447)
-- Name: landing_faqs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.landing_faqs OWNER TO postgres;

--
-- TOC entry 345 (class 1259 OID 19291)
-- Name: landing_features; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_features (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    icon_name text DEFAULT 'MessageSquare'::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.landing_features OWNER TO postgres;

--
-- TOC entry 350 (class 1259 OID 19363)
-- Name: landing_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_images (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    image_key text NOT NULL,
    url text NOT NULL,
    alt_text text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.landing_images OWNER TO postgres;

--
-- TOC entry 348 (class 1259 OID 19336)
-- Name: landing_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_integrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    icon_url text,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.landing_integrations OWNER TO postgres;

--
-- TOC entry 347 (class 1259 OID 19319)
-- Name: landing_pricing_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_pricing_tiers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    price_monthly text,
    price_yearly text,
    price_subtitle text,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_highlighted boolean DEFAULT false,
    highlight_label text DEFAULT 'Most Popular'::text,
    cta_text text DEFAULT 'Get Started'::text,
    cta_link text DEFAULT '/signup'::text,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.landing_pricing_tiers OWNER TO postgres;

--
-- TOC entry 344 (class 1259 OID 19274)
-- Name: landing_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section_key text NOT NULL,
    title text,
    subtitle text,
    body_text text,
    cta_primary_text text,
    cta_primary_link text,
    cta_secondary_text text,
    cta_secondary_link text,
    background_style text DEFAULT 'default'::text,
    background_image_url text,
    is_visible boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    extra_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    images text[] DEFAULT '{}'::text[],
    images_secondary text[] DEFAULT '{}'::text[]
);


ALTER TABLE public.landing_sections OWNER TO postgres;

--
-- TOC entry 346 (class 1259 OID 19305)
-- Name: landing_testimonials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.landing_testimonials (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    quote text NOT NULL,
    author_name text NOT NULL,
    author_role text,
    author_company text,
    author_avatar_url text,
    rating integer DEFAULT 5,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT landing_testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.landing_testimonials OWNER TO postgres;

--
-- TOC entry 349 (class 1259 OID 19348)
-- Name: legal_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.legal_pages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    content_markdown text DEFAULT ''::text NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.legal_pages OWNER TO postgres;

--
-- TOC entry 334 (class 1259 OID 18443)
-- Name: member_presence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_presence (
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    status public.presence_status_enum DEFAULT 'offline'::public.presence_status_enum NOT NULL,
    custom_status text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.member_presence OWNER TO postgres;

--
-- TOC entry 327 (class 1259 OID 18004)
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_reactions_actor_type_check CHECK ((actor_type = ANY (ARRAY['customer'::text, 'agent'::text])))
);


ALTER TABLE public.message_reactions OWNER TO postgres;

--
-- TOC entry 317 (class 1259 OID 17692)
-- Name: message_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'Marketing'::text NOT NULL,
    language text DEFAULT 'en_US'::text,
    header_type text,
    header_content text,
    body_text text NOT NULL,
    footer_text text,
    buttons jsonb,
    status text DEFAULT 'DRAFT'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sample_values jsonb,
    meta_template_id text,
    rejection_reason text,
    quality_score text,
    header_handle text,
    header_media_url text,
    submission_error text,
    last_submitted_at timestamp with time zone,
    account_id uuid NOT NULL,
    CONSTRAINT message_templates_buttons_shape_check CHECK (((buttons IS NULL) OR ((jsonb_typeof(buttons) = 'array'::text) AND (jsonb_array_length(buttons) <= 10)))),
    CONSTRAINT message_templates_category_check CHECK ((category = ANY (ARRAY['Marketing'::text, 'Utility'::text, 'Authentication'::text]))),
    CONSTRAINT message_templates_header_type_check CHECK ((header_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'document'::text]))),
    CONSTRAINT message_templates_quality_score_check CHECK (((quality_score IS NULL) OR (quality_score = ANY (ARRAY['GREEN'::text, 'YELLOW'::text, 'RED'::text])))),
    CONSTRAINT message_templates_status_meta_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'PAUSED'::text, 'DISABLED'::text, 'IN_APPEAL'::text, 'PENDING_DELETION'::text])))
);


ALTER TABLE public.message_templates OWNER TO postgres;

--
-- TOC entry 315 (class 1259 OID 17649)
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    content_type text DEFAULT 'text'::text NOT NULL,
    content_text text,
    media_url text,
    template_name text,
    message_id text,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    reply_to_message_id uuid,
    interactive_reply_id text,
    ai_generated boolean DEFAULT false NOT NULL,
    interactive_payload jsonb,
    CONSTRAINT messages_content_type_check CHECK ((content_type = ANY (ARRAY['text'::text, 'image'::text, 'document'::text, 'audio'::text, 'video'::text, 'location'::text, 'template'::text, 'interactive'::text]))),
    CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'agent'::text, 'bot'::text]))),
    CONSTRAINT messages_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- TOC entry 336 (class 1259 OID 18500)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text DEFAULT 'conversation_assigned'::text NOT NULL,
    conversation_id uuid,
    contact_id uuid,
    actor_user_id uuid,
    title text NOT NULL,
    body text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = 'conversation_assigned'::text))
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 319 (class 1259 OID 17729)
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.pipeline_stages OWNER TO postgres;

--
-- TOC entry 318 (class 1259 OID 17714)
-- Name: pipelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL
);


ALTER TABLE public.pipelines OWNER TO postgres;

--
-- TOC entry 307 (class 1259 OID 17488)
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    beta_features text[] DEFAULT ARRAY[]::text[] NOT NULL,
    account_id uuid NOT NULL,
    account_role public.account_role_enum NOT NULL,
    permissions jsonb,
    is_active boolean DEFAULT true NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- TOC entry 342 (class 1259 OID 19036)
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quick_replies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    content_text text,
    interactive_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quick_replies_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'interactive'::text])))
);


ALTER TABLE public.quick_replies OWNER TO postgres;

--
-- TOC entry 343 (class 1259 OID 19252)
-- Name: site_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    site_name text DEFAULT 'Replai'::text NOT NULL,
    tagline text DEFAULT 'AI-Powered WhatsApp CRM'::text NOT NULL,
    site_description text DEFAULT 'Self-hostable CRM platform for WhatsApp with AI replies, automations, and team collaboration.'::text,
    logo_url text,
    favicon_url text,
    meta_title text DEFAULT 'Replai — AI-Powered WhatsApp CRM'::text,
    meta_description text,
    og_image_url text,
    canonical_url text DEFAULT 'https://replai.junkiescoder.com'::text,
    social_twitter text,
    social_linkedin text,
    social_github text,
    social_instagram text,
    social_youtube text,
    support_email text DEFAULT 'support@junkiescoder.com'::text,
    sales_email text DEFAULT 'sales@junkiescoder.com'::text,
    privacy_email text DEFAULT 'privacy@junkiescoder.com'::text,
    legal_email text DEFAULT 'legal@junkiescoder.com'::text,
    copyright_text text DEFAULT '2026 Junkies Coder. All rights reserved.'::text,
    show_social_icons boolean DEFAULT true,
    show_newsletter boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    no_index boolean DEFAULT false,
    json_ld_schema text,
    header_links jsonb DEFAULT '[]'::jsonb,
    footer_links jsonb DEFAULT '[]'::jsonb,
    contact_notification_email text DEFAULT 'info@junkiescoder.com'::text
);


ALTER TABLE public.site_settings OWNER TO postgres;

--
-- TOC entry 309 (class 1259 OID 17527)
-- Name: tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL
);


ALTER TABLE public.tags OWNER TO postgres;

--
-- TOC entry 316 (class 1259 OID 17672)
-- Name: whatsapp_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_config (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    phone_number_id text NOT NULL,
    waba_id text,
    access_token text NOT NULL,
    verify_token text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    connected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid NOT NULL,
    registered_at timestamp with time zone,
    subscribed_apps_at timestamp with time zone,
    last_registration_error text,
    connection_source text DEFAULT 'manual'::text,
    CONSTRAINT whatsapp_config_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text])))
);


ALTER TABLE public.whatsapp_config OWNER TO postgres;

--
-- TOC entry 351 (class 1259 OID 19378)
-- Name: v_platform_accounts_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_platform_accounts_summary AS
 SELECT a.id AS account_id,
    a.name AS account_name,
    a.is_banned,
    a.banned_at,
    a.banned_reason,
    a.created_at AS account_created_at,
    p_owner.user_id AS owner_user_id,
    p_owner.full_name AS owner_name,
    p_owner.email AS owner_email,
    p_owner.avatar_url AS owner_avatar_url,
    ( SELECT count(*) AS count
           FROM public.profiles p2
          WHERE (p2.account_id = a.id)) AS member_count,
    ( SELECT count(*) AS count
           FROM public.contacts c
          WHERE (c.account_id = a.id)) AS contact_count,
    ( SELECT count(*) AS count
           FROM public.conversations cv
          WHERE (cv.account_id = a.id)) AS conversation_count,
    ( SELECT count(*) AS count
           FROM (public.messages m
             JOIN public.conversations cv2 ON ((cv2.id = m.conversation_id)))
          WHERE ((cv2.account_id = a.id) AND (m.created_at > (now() - '30 days'::interval)))) AS messages_30d,
    ( SELECT wc.status
           FROM public.whatsapp_config wc
          WHERE (wc.account_id = a.id)
         LIMIT 1) AS whatsapp_status,
    ( SELECT max(m2.created_at) AS max
           FROM (public.messages m2
             JOIN public.conversations cv3 ON ((cv3.id = m2.conversation_id)))
          WHERE (cv3.account_id = a.id)) AS last_activity_at
   FROM (public.accounts a
     JOIN public.profiles p_owner ON ((p_owner.user_id = a.owner_user_id)));


ALTER VIEW public.v_platform_accounts_summary OWNER TO postgres;

--
-- TOC entry 337 (class 1259 OID 18544)
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    created_by uuid,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_delivery_at timestamp with time zone,
    failure_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.webhook_endpoints OWNER TO postgres;

--
-- TOC entry 294 (class 1259 OID 17243)
-- Name: messages; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


ALTER TABLE realtime.messages OWNER TO supabase_realtime_admin;

--
-- TOC entry 352 (class 1259 OID 19434)
-- Name: messages_2026_08_02; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_02 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_02 OWNER TO supabase_realtime_admin;

--
-- TOC entry 354 (class 1259 OID 19473)
-- Name: messages_2026_08_03; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_03 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_03 OWNER TO supabase_realtime_admin;

--
-- TOC entry 355 (class 1259 OID 19507)
-- Name: messages_2026_08_04; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_04 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_04 OWNER TO supabase_realtime_admin;

--
-- TOC entry 356 (class 1259 OID 19520)
-- Name: messages_2026_08_05; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_05 OWNER TO supabase_realtime_admin;

--
-- TOC entry 357 (class 1259 OID 19533)
-- Name: messages_2026_08_06; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_06 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_06 OWNER TO supabase_realtime_admin;

--
-- TOC entry 358 (class 1259 OID 19548)
-- Name: messages_2026_08_07; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_07 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_07 OWNER TO supabase_realtime_admin;

--
-- TOC entry 359 (class 1259 OID 19574)
-- Name: messages_2026_08_08; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_08_08 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_08_08 OWNER TO supabase_realtime_admin;

--
-- TOC entry 295 (class 1259 OID 17250)
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone DEFAULT now()
);


ALTER TABLE realtime.schema_migrations OWNER TO supabase_admin;

--
-- TOC entry 296 (class 1259 OID 17253)
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE realtime.subscription OWNER TO supabase_realtime_admin;

--
-- TOC entry 297 (class 1259 OID 17263)
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 299 (class 1259 OID 17294)
-- Name: buckets; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;

--
-- TOC entry 5919 (class 0 OID 0)
-- Dependencies: 299
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 303 (class 1259 OID 17414)
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE storage.buckets_analytics OWNER TO supabase_storage_admin;

--
-- TOC entry 304 (class 1259 OID 17427)
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.buckets_vectors OWNER TO supabase_storage_admin;

--
-- TOC entry 298 (class 1259 OID 17286)
-- Name: migrations; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;

--
-- TOC entry 300 (class 1259 OID 17304)
-- Name: objects; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


ALTER TABLE storage.objects OWNER TO supabase_storage_admin;

--
-- TOC entry 5923 (class 0 OID 0)
-- Dependencies: 300
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 301 (class 1259 OID 17353)
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


ALTER TABLE storage.s3_multipart_uploads OWNER TO supabase_storage_admin;

--
-- TOC entry 302 (class 1259 OID 17367)
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.s3_multipart_uploads_parts OWNER TO supabase_storage_admin;

--
-- TOC entry 305 (class 1259 OID 17437)
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.vector_indexes OWNER TO supabase_storage_admin;

--
-- TOC entry 306 (class 1259 OID 17479)
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: postgres
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;

--
-- TOC entry 4128 (class 0 OID 0)
-- Name: messages_2026_08_02; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_02 FOR VALUES FROM ('2026-08-02 00:00:00') TO ('2026-08-03 00:00:00');


--
-- TOC entry 4129 (class 0 OID 0)
-- Name: messages_2026_08_03; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_03 FOR VALUES FROM ('2026-08-03 00:00:00') TO ('2026-08-04 00:00:00');


--
-- TOC entry 4130 (class 0 OID 0)
-- Name: messages_2026_08_04; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_04 FOR VALUES FROM ('2026-08-04 00:00:00') TO ('2026-08-05 00:00:00');


--
-- TOC entry 4131 (class 0 OID 0)
-- Name: messages_2026_08_05; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_05 FOR VALUES FROM ('2026-08-05 00:00:00') TO ('2026-08-06 00:00:00');


--
-- TOC entry 4132 (class 0 OID 0)
-- Name: messages_2026_08_06; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_06 FOR VALUES FROM ('2026-08-06 00:00:00') TO ('2026-08-07 00:00:00');


--
-- TOC entry 4133 (class 0 OID 0)
-- Name: messages_2026_08_07; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_07 FOR VALUES FROM ('2026-08-07 00:00:00') TO ('2026-08-08 00:00:00');


--
-- TOC entry 4134 (class 0 OID 0)
-- Name: messages_2026_08_08; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_08 FOR VALUES FROM ('2026-08-08 00:00:00') TO ('2026-08-09 00:00:00');


--
-- TOC entry 4144 (class 2604 OID 16514)
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- TOC entry 5468 (class 0 OID 16529)
-- Dependencies: 269
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) FROM stdin;
\.


--
-- TOC entry 5485 (class 0 OID 17084)
-- Dependencies: 288
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.custom_oauth_providers (id, provider_type, identifier, name, client_id, client_secret, acceptable_client_ids, scopes, pkce_enabled, attribute_mapping, authorization_params, enabled, email_optional, issuer, discovery_url, skip_nonce_check, cached_discovery, discovery_cached_at, authorization_url, token_url, userinfo_url, jwks_uri, created_at, updated_at, custom_claims_allowlist) FROM stdin;
\.


--
-- TOC entry 5479 (class 0 OID 16889)
-- Dependencies: 282
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, provider_access_token, provider_refresh_token, created_at, updated_at, authentication_method, auth_code_issued_at, invite_token, referrer, oauth_client_state_id, linking_target_id, email_optional) FROM stdin;
e53c3096-7337-4a3b-8b92-61317725a3dd	2b7a9798-3044-440f-80be-68952f57d708	3fb99e5d-0dec-4e33-a064-011b6bf7060c	s256	zJ-MWbUZAucxRHwkZBWRAoXCiFD3GTIPZ1ZfdB7pLiw	email			2026-07-25 11:46:49.305883+00	2026-07-25 11:47:36.774286+00	email/signup	2026-07-25 11:47:36.774234+00	\N	\N	\N	\N	f
ce42156e-2405-4376-88bb-6b6168b9df78	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	320fb1bc-6897-4d6c-bc5f-c1552afafbbc	s256	Q-wWpSpVVXZfDbKtiypQYwrLMiV6BB5wbAb0lLFskYA	email			2026-07-25 11:58:32.69225+00	2026-07-25 12:11:22.441933+00	email/signup	2026-07-25 12:11:22.441848+00	\N	\N	\N	\N	f
e32ec399-a35e-4ed7-9f65-21229049a108	e20d391e-7272-48b6-aa16-e5eeb4011939	16a62bee-a712-4a24-901c-fdd8ccf55072	s256	U0peN_BQ7oMkNMo3voyJ0kofB2l-IEg8KaDptfOyJZw	email			2026-07-28 13:27:51.924608+00	2026-07-28 13:28:08.233056+00	email/signup	2026-07-28 13:28:08.233007+00	\N	\N	\N	\N	f
e4d5e434-cae6-4cf4-92cd-d17fbeccb033	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	31e0d1db-ce43-4876-824c-afd0fdbc59b9	s256	tqCosngTNQZGc1RxQ-KNwsGtDCpPDQGWVxjajcw6lQ4	email			2026-07-29 11:19:17.915292+00	2026-07-29 11:22:06.48108+00	email/signup	2026-07-29 11:22:06.481015+00	\N	\N	\N	\N	f
d6f4e0d1-92af-4014-b8a2-409327d5d1df	3dbf0236-b75e-4805-a8c9-405fdfd259a5	676a01ff-bc4d-4f87-8983-2eee0df6111e	s256	YPUCxDhs1pTnW4enMUBtc65hIqjwjU_IDlhmn10s3RY	email			2026-08-04 08:07:48.79444+00	2026-08-04 08:08:17.678041+00	email/signup	2026-08-04 08:08:17.677981+00	\N	\N	\N	\N	f
\.


--
-- TOC entry 5470 (class 0 OID 16686)
-- Dependencies: 273
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
2b7a9798-3044-440f-80be-68952f57d708	2b7a9798-3044-440f-80be-68952f57d708	{"sub": "2b7a9798-3044-440f-80be-68952f57d708", "email": "souaib@junkiescoder.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}	email	2026-07-25 11:46:49.298772+00	2026-07-25 11:46:49.298808+00	2026-07-25 11:46:49.298808+00	40cce1e2-fcc0-49cf-a8d8-d0fbf4694526
fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	{"sub": "fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc", "email": "ansarisoyab635@gmail.com", "full_name": "Junkies Coder", "email_verified": true, "phone_verified": false}	email	2026-07-25 11:58:32.687894+00	2026-07-25 11:58:32.688018+00	2026-07-25 11:58:32.688018+00	5e105a9c-042a-47ad-a41d-7c9f86fe24ac
e20d391e-7272-48b6-aa16-e5eeb4011939	e20d391e-7272-48b6-aa16-e5eeb4011939	{"sub": "e20d391e-7272-48b6-aa16-e5eeb4011939", "email": "gunmandev@gmail.com", "full_name": "Gun Man", "email_verified": true, "phone_verified": false}	email	2026-07-28 13:27:51.91843+00	2026-07-28 13:27:51.918475+00	2026-07-28 13:27:51.918475+00	3678cd0f-ca31-4b35-b4fb-6bba81498bcf
d29cff75-25aa-4a5d-82cf-8d8923e0abdb	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{"sub": "d29cff75-25aa-4a5d-82cf-8d8923e0abdb", "email": "junkiescoder@gmail.com", "full_name": "Junkies Coder", "email_verified": true, "phone_verified": false}	email	2026-07-29 11:19:17.910115+00	2026-07-29 11:19:17.910164+00	2026-07-29 11:19:17.910164+00	bc76f310-e7d9-4c86-9c31-2f35fa2eeba0
3dbf0236-b75e-4805-a8c9-405fdfd259a5	3dbf0236-b75e-4805-a8c9-405fdfd259a5	{"sub": "3dbf0236-b75e-4805-a8c9-405fdfd259a5", "email": "ansarisoyab908@gmail.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}	email	2026-08-04 08:07:48.787612+00	2026-08-04 08:07:48.787658+00	2026-08-04 08:07:48.787658+00	f0c5b36a-875a-4cd0-8a80-652080fcfd95
\.


--
-- TOC entry 5467 (class 0 OID 16522)
-- Dependencies: 268
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5474 (class 0 OID 16776)
-- Dependencies: 277
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) FROM stdin;
78c080f8-d399-4d8e-b37f-7516f45dac24	2026-07-25 12:13:12.124979+00	2026-07-25 12:13:12.124979+00	password	06c91c56-e0c7-4b02-95f4-487867daa75b
2a17fb74-50d8-4019-a9ea-93b9e3ef5371	2026-07-27 08:16:49.710039+00	2026-07-27 08:16:49.710039+00	password	df3957db-6c2f-440f-aa75-f680453c014b
cb94b86a-654e-4b57-8ce6-84dcfeee7be8	2026-08-03 05:37:26.779752+00	2026-08-03 05:37:26.779752+00	password	e4cc1885-af21-4dbc-882b-f137e449a7c5
d9006edf-4928-4017-bbbe-65750b94d8b6	2026-08-04 07:05:56.706375+00	2026-08-04 07:05:56.706375+00	password	80e6f5c8-1ba9-47c6-b3fd-aea1b4fef5c5
114964d8-a227-401f-a450-ed31400ce5c8	2026-08-04 07:52:55.887765+00	2026-08-04 07:52:55.887765+00	password	39e27266-cb85-48ba-8728-7dff7b065489
c3710762-f60f-48c3-b979-a6c0c2850afb	2026-08-05 10:51:57.333078+00	2026-08-05 10:51:57.333078+00	password	9ea44df2-62ad-4e2c-bc1c-5afb84411613
\.


--
-- TOC entry 5473 (class 0 OID 16764)
-- Dependencies: 276
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_challenges (id, factor_id, created_at, verified_at, ip_address, otp_code, web_authn_session_data) FROM stdin;
\.


--
-- TOC entry 5472 (class 0 OID 16751)
-- Dependencies: 275
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone, last_challenged_at, web_authn_credential, web_authn_aaguid, last_webauthn_challenge_data) FROM stdin;
\.


--
-- TOC entry 5482 (class 0 OID 17001)
-- Dependencies: 285
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, state, resource, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) FROM stdin;
\.


--
-- TOC entry 5484 (class 0 OID 17074)
-- Dependencies: 287
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_client_states (id, provider_type, code_verifier, created_at) FROM stdin;
\.


--
-- TOC entry 5481 (class 0 OID 16971)
-- Dependencies: 284
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_clients (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type, token_endpoint_auth_method) FROM stdin;
\.


--
-- TOC entry 5483 (class 0 OID 17034)
-- Dependencies: 286
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) FROM stdin;
\.


--
-- TOC entry 5480 (class 0 OID 16939)
-- Dependencies: 283
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5466 (class 0 OID 16511)
-- Dependencies: 267
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) FROM stdin;
00000000-0000-0000-0000-000000000000	114	tqdvb6v4fbwh	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-05 10:22:48.782048+00	2026-08-05 11:21:57.71957+00	zl2tykuc7dvh	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	2	tqgixibzy7zn	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-25 12:13:12.100899+00	2026-07-25 13:11:42.907334+00	\N	78c080f8-d399-4d8e-b37f-7516f45dac24
00000000-0000-0000-0000-000000000000	4	w46d5eiwouju	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	f	2026-07-25 13:11:42.922406+00	2026-07-25 13:11:42.922406+00	tqgixibzy7zn	78c080f8-d399-4d8e-b37f-7516f45dac24
00000000-0000-0000-0000-000000000000	117	oezrd73syh4a	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	t	2026-08-05 10:51:57.312869+00	2026-08-05 11:50:18.866286+00	\N	c3710762-f60f-48c3-b979-a6c0c2850afb
00000000-0000-0000-0000-000000000000	118	oumqcahhmln4	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-05 11:21:57.738563+00	2026-08-05 12:20:57.533608+00	tqdvb6v4fbwh	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	120	qa5bxhbofmym	2b7a9798-3044-440f-80be-68952f57d708	f	2026-08-05 12:20:57.548664+00	2026-08-05 12:20:57.548664+00	oumqcahhmln4	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	119	ghdn6hhkw457	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	t	2026-08-05 11:50:18.880829+00	2026-08-05 12:48:57.493661+00	oezrd73syh4a	c3710762-f60f-48c3-b979-a6c0c2850afb
00000000-0000-0000-0000-000000000000	6	isyx7jlmqrqi	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-27 08:16:49.682972+00	2026-07-27 09:52:30.521956+00	\N	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	121	f4mwe5s42q3j	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	f	2026-08-05 12:48:57.513129+00	2026-08-05 12:48:57.513129+00	ghdn6hhkw457	c3710762-f60f-48c3-b979-a6c0c2850afb
00000000-0000-0000-0000-000000000000	8	oifbll7lccar	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-27 09:52:30.546332+00	2026-07-27 10:51:01.55479+00	isyx7jlmqrqi	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	86	rhjq6bqd7tqd	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-03 05:37:26.777257+00	2026-08-03 06:36:35.10771+00	\N	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	11	65fux5u362f5	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-27 10:51:01.565142+00	2026-07-27 11:50:01.507159+00	oifbll7lccar	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	13	t2cedyshjpey	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-27 11:50:01.508378+00	2026-07-27 12:48:07.699235+00	65fux5u362f5	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	88	ldkmi4kfys67	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-03 06:36:35.117936+00	2026-08-03 07:35:35.329026+00	rhjq6bqd7tqd	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	15	amsezk2sjhvc	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	t	2026-07-27 12:48:07.700028+00	2026-07-27 13:47:37.502281+00	t2cedyshjpey	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	17	jl2g24htb6oo	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	f	2026-07-27 13:47:37.511424+00	2026-07-27 13:47:37.511424+00	amsezk2sjhvc	2a17fb74-50d8-4019-a9ea-93b9e3ef5371
00000000-0000-0000-0000-000000000000	90	z3ygbkvegy3p	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-03 07:35:35.351123+00	2026-08-03 08:34:35.356645+00	ldkmi4kfys67	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	94	ganxhu4yjnoq	2b7a9798-3044-440f-80be-68952f57d708	f	2026-08-04 07:05:56.686382+00	2026-08-04 07:05:56.686382+00	\N	d9006edf-4928-4017-bbbe-65750b94d8b6
00000000-0000-0000-0000-000000000000	95	jf2gdtxnodf7	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-04 07:52:55.844902+00	2026-08-04 08:52:19.861129+00	\N	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	97	hgnnoa2htqan	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-04 08:52:19.874928+00	2026-08-04 10:15:30.118716+00	jf2gdtxnodf7	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	98	uuq3q4oybg5t	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-04 10:15:30.139513+00	2026-08-04 11:14:19.80071+00	hgnnoa2htqan	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	100	sin57o5nlffb	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-04 11:14:19.810649+00	2026-08-04 12:12:33.743658+00	uuq3q4oybg5t	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	103	qjicru7hqgtg	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-04 12:12:33.764077+00	2026-08-04 13:11:19.899372+00	sin57o5nlffb	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	107	6cq745bo5b52	2b7a9798-3044-440f-80be-68952f57d708	f	2026-08-04 13:11:19.913929+00	2026-08-04 13:11:19.913929+00	qjicru7hqgtg	114964d8-a227-401f-a450-ed31400ce5c8
00000000-0000-0000-0000-000000000000	92	r5bnxknxdr2d	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-03 08:34:35.41679+00	2026-08-05 07:42:28.291493+00	z3ygbkvegy3p	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	108	u6evezkte274	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-05 07:42:28.317565+00	2026-08-05 08:41:57.45023+00	r5bnxknxdr2d	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
00000000-0000-0000-0000-000000000000	110	zl2tykuc7dvh	2b7a9798-3044-440f-80be-68952f57d708	t	2026-08-05 08:41:57.462191+00	2026-08-05 10:22:48.771762+00	u6evezkte274	cb94b86a-654e-4b57-8ce6-84dcfeee7be8
\.


--
-- TOC entry 5477 (class 0 OID 16818)
-- Dependencies: 280
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_providers (id, sso_provider_id, entity_id, metadata_xml, metadata_url, attribute_mapping, created_at, updated_at, name_id_format) FROM stdin;
\.


--
-- TOC entry 5478 (class 0 OID 16836)
-- Dependencies: 281
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_relay_states (id, sso_provider_id, request_id, for_email, redirect_to, created_at, updated_at, flow_state_id) FROM stdin;
\.


--
-- TOC entry 5469 (class 0 OID 16537)
-- Dependencies: 270
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
20260115000000
20260121000000
20260219120000
20260302000000
20260625000000
\.


--
-- TOC entry 5471 (class 0 OID 16716)
-- Dependencies: 274
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) FROM stdin;
78c080f8-d399-4d8e-b37f-7516f45dac24	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	2026-07-25 12:13:12.062948+00	2026-07-25 13:11:42.952346+00	\N	aal1	\N	2026-07-25 13:11:42.952245	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	27.54.191.66	\N	\N	\N	\N	\N
2a17fb74-50d8-4019-a9ea-93b9e3ef5371	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	2026-07-27 08:16:49.652629+00	2026-07-27 13:47:37.530762+00	\N	aal1	\N	2026-07-27 13:47:37.530667	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	27.54.191.94	\N	\N	\N	\N	\N
114964d8-a227-401f-a450-ed31400ce5c8	2b7a9798-3044-440f-80be-68952f57d708	2026-08-04 07:52:55.81739+00	2026-08-04 13:11:19.938336+00	\N	aal1	\N	2026-08-04 13:11:19.938059	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	122.183.32.123	\N	\N	\N	\N	\N
cb94b86a-654e-4b57-8ce6-84dcfeee7be8	2b7a9798-3044-440f-80be-68952f57d708	2026-08-03 05:37:26.769411+00	2026-08-05 12:20:57.580054+00	\N	aal1	\N	2026-08-05 12:20:57.579934	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	27.54.191.93	\N	\N	\N	\N	\N
c3710762-f60f-48c3-b979-a6c0c2850afb	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-08-05 10:51:57.270681+00	2026-08-05 12:48:57.549766+00	\N	aal1	\N	2026-08-05 12:48:57.549669	Next.js Middleware	27.54.191.93	\N	\N	\N	\N	\N
d9006edf-4928-4017-bbbe-65750b94d8b6	2b7a9798-3044-440f-80be-68952f57d708	2026-08-04 07:05:56.679419+00	2026-08-04 07:05:56.679419+00	\N	aal1	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	27.54.191.93	\N	\N	\N	\N	\N
\.


--
-- TOC entry 5476 (class 0 OID 16803)
-- Dependencies: 279
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_domains (id, sso_provider_id, domain, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5475 (class 0 OID 16794)
-- Dependencies: 278
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_providers (id, resource_id, created_at, updated_at, disabled) FROM stdin;
\.


--
-- TOC entry 5464 (class 0 OID 16499)
-- Dependencies: 265
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	2b7a9798-3044-440f-80be-68952f57d708	authenticated	authenticated	souaib@junkiescoder.com	$2a$10$tUn6fLNLtnqeq.D5gMifxe7ij6XEF8sRDNLnRmC60vMBySwlpHWhq	2026-07-25 11:47:36.763708+00	\N		2026-07-25 11:46:49.312007+00		\N			\N	2026-08-04 07:52:55.816712+00	{"provider": "email", "providers": ["email"]}	{"sub": "2b7a9798-3044-440f-80be-68952f57d708", "email": "souaib@junkiescoder.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}	\N	2026-07-25 11:46:49.250071+00	2026-08-05 12:20:57.563301+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	authenticated	authenticated	junkiescoder@gmail.com	$2a$10$enAaSDMfLkQXxZAO/v12eulPdlbJSwjwSZ1cNY2P2ivxtkpUnhZHK	2026-07-29 11:22:06.454288+00	\N		2026-07-29 11:19:17.921989+00		\N			\N	2026-08-05 10:51:57.269986+00	{"provider": "email", "providers": ["email"]}	{"sub": "d29cff75-25aa-4a5d-82cf-8d8923e0abdb", "email": "junkiescoder@gmail.com", "full_name": "Junkies Coder", "email_verified": true, "phone_verified": false}	\N	2026-07-29 11:19:17.864823+00	2026-08-05 12:48:57.529606+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	3dbf0236-b75e-4805-a8c9-405fdfd259a5	authenticated	authenticated	ansarisoyab908@gmail.com	$2a$10$77hWwSuPcovJh.yQ1id.XOghfJRkMUR/PXrtr0h3O8U5HsQK4xqwa	2026-08-04 08:08:17.668256+00	\N		2026-08-04 08:07:48.803047+00		\N			\N	2026-08-04 12:48:53.332189+00	{"provider": "email", "providers": ["email"]}	{"sub": "3dbf0236-b75e-4805-a8c9-405fdfd259a5", "email": "ansarisoyab908@gmail.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}	\N	2026-08-04 08:07:48.749316+00	2026-08-05 10:27:34.430981+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	authenticated	authenticated	ansarisoyab635@gmail.com	$2a$10$lcZylkmOmrN3BD5LXDqmseOIT8u5A6N4AMRfWVAmUH2sNEigbIjPq	2026-07-25 12:11:22.401458+00	\N		2026-07-25 11:58:32.700646+00		\N			\N	2026-07-27 08:16:49.649578+00	{"provider": "email", "providers": ["email"]}	{"sub": "fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc", "email": "ansarisoyab635@gmail.com", "full_name": "Junkies Coder", "email_verified": true, "phone_verified": false}	\N	2026-07-25 11:58:32.651558+00	2026-07-27 13:47:37.515138+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	e20d391e-7272-48b6-aa16-e5eeb4011939	authenticated	authenticated	gunmandev@gmail.com	$2a$10$z2FMGaFtMGJWnMWSgosGIeEd5YKcimGNPVa8WsWR72ij2hJhq3ilW	2026-07-28 13:28:08.22553+00	\N		2026-07-28 13:27:51.933229+00		\N			\N	2026-07-29 10:52:00.132796+00	{"provider": "email", "providers": ["email"]}	{"sub": "e20d391e-7272-48b6-aa16-e5eeb4011939", "email": "gunmandev@gmail.com", "full_name": "Gun Man", "email_verified": true, "phone_verified": false}	\N	2026-07-28 13:27:51.861319+00	2026-07-29 11:59:30.424902+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- TOC entry 5487 (class 0 OID 17149)
-- Dependencies: 290
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.webauthn_challenges (id, user_id, challenge_type, session_data, created_at, expires_at) FROM stdin;
\.


--
-- TOC entry 5486 (class 0 OID 17126)
-- Dependencies: 289
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.webauthn_credentials (id, user_id, credential_id, public_key, attestation_type, aaguid, sign_count, transports, backup_eligible, backed_up, friendly_name, created_at, updated_at, last_used_at) FROM stdin;
\.


--
-- TOC entry 5526 (class 0 OID 18182)
-- Dependencies: 333
-- Data for Name: account_invitations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_invitations (id, account_id, token_hash, role, created_by_user_id, label, created_at, expires_at, accepted_at, accepted_by_user_id) FROM stdin;
098d4bff-5efd-4f77-82a7-ee8cc8097108	3430edae-763b-4aac-9b82-1c2364936d79	57c8c337c2ec83251050643130d3e11ae61ef16bcbe7955c8e08661035642adb	member	2b7a9798-3044-440f-80be-68952f57d708	Gunman-Vendor	2026-07-25 11:55:55.638481+00	2026-08-24 11:19:52.1+00	2026-07-25 12:13:14.292302+00	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc
\.


--
-- TOC entry 5525 (class 0 OID 18165)
-- Dependencies: 332
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, name, owner_user_id, created_at, updated_at, default_currency, is_banned, banned_at, banned_reason, banned_by_user_id) FROM stdin;
3430edae-763b-4aac-9b82-1c2364936d79	Souaib Ansari	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 11:46:49.249028+00	2026-07-27 10:09:42.470495+00	INR	f	\N	\N	\N
8f6aa43c-0b0b-4c1c-b8c9-2a85213be21c	Gun Man	e20d391e-7272-48b6-aa16-e5eeb4011939	2026-07-28 13:27:51.859667+00	2026-07-28 13:27:51.859667+00	USD	f	\N	\N	\N
1ff3bc55-f5a7-4f5e-a7c9-857aec91a655	Junkies Coder	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 11:19:17.863964+00	2026-07-29 11:19:17.863964+00	USD	f	\N	\N	\N
eb378216-3e5b-4acd-874b-978cf65bd0d3	Souaib Ansari	3dbf0236-b75e-4805-a8c9-405fdfd259a5	2026-08-04 08:07:48.747558+00	2026-08-04 08:07:48.747558+00	USD	f	\N	\N	\N
\.


--
-- TOC entry 5531 (class 0 OID 18573)
-- Dependencies: 338
-- Data for Name: ai_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_configs (id, account_id, created_by, provider, model, api_key, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, created_at, updated_at, embeddings_api_key, handoff_agent_id) FROM stdin;
22b39256-eae1-4577-859b-85d6df21b36b	3430edae-763b-4aac-9b82-1c2364936d79	2b7a9798-3044-440f-80be-68952f57d708	gemini	gemini-3.1-flash-lite-preview	996037b9eac96495683b2605:f9bb69a55eb6b73c29c1f0b1cd94e0ccdc47ef9dc0326f5bc07c5e8a2e529b355e68367d153f80:dc2298f182bb0eed19fec2ed42705b06	You are Alexa, the professional and helpful customer service AI for Amazon.com.\nMaintain a polite, extremely professional, and solution-oriented tone at all times.\nNever promise specific delivery dates unless verified in the system.\nIf a customer asks about refunds, refer to our 30-day return policy.\nFor any complex issues or inquiries you cannot resolve, gracefully hand off the conversation to a human associate.	t	t	20	2026-07-27 12:19:43.390107+00	2026-08-03 05:50:11.052782+00	\N	2b7a9798-3044-440f-80be-68952f57d708
\.


--
-- TOC entry 5533 (class 0 OID 18965)
-- Dependencies: 340
-- Data for Name: ai_knowledge_chunks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_knowledge_chunks (id, document_id, account_id, chunk_index, content, embedding, created_at) FROM stdin;
\.


--
-- TOC entry 5532 (class 0 OID 18938)
-- Dependencies: 339
-- Data for Name: ai_knowledge_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_knowledge_documents (id, account_id, created_by, title, content, created_at, updated_at) FROM stdin;
0a1b2e93-72b0-4805-b988-51930f218e55	3430edae-763b-4aac-9b82-1c2364936d79	\N	Amazon Return Policy	Amazon's return policy allows customers to return most new, unopened items sold and fulfilled by Amazon within 30 days of delivery for a full refund. Items must be returned in their original condition. For defective or damaged items, we offer replacements or full refunds. Digital purchases like Kindle books and Appstore apps are generally non-refundable unless otherwise specified.	2026-07-31 12:55:20.537953+00	2026-07-31 12:55:20.537953+00
8971bbbb-6c32-4749-b3ec-a61388d03652	3430edae-763b-4aac-9b82-1c2364936d79	\N	Amazon Prime Shipping	Amazon Prime members receive fast, free delivery on millions of eligible items. Same-Day, One-Day, and Two-Day shipping speeds are available depending on the item and the delivery zip code. Non-Prime members receive free standard shipping on eligible orders over $35. We cannot guarantee specific delivery times of day.	2026-07-31 12:55:20.537953+00	2026-07-31 12:55:20.537953+00
d9a53169-a4bc-4975-8105-3de4547718fd	3430edae-763b-4aac-9b82-1c2364936d79	\N	Customer Service Mission	Amazon is guided by four principles: customer obsession rather than competitor focus, passion for invention, commitment to operational excellence, and long-term thinking. We strive to be Earth's most customer-centric company. If a customer is unsatisfied, we must do everything in our power to resolve the issue swiftly and professionally.	2026-07-31 12:55:20.537953+00	2026-07-31 12:55:20.537953+00
\.


--
-- TOC entry 5534 (class 0 OID 19004)
-- Dependencies: 341
-- Data for Name: ai_usage_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_usage_log (id, account_id, conversation_id, mode, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at) FROM stdin;
7a26bb65-aefb-437a-ad62-947810cc4313	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	293	27	320	2026-07-31 12:31:10.823742+00
36461146-60aa-46c4-a9c1-65a7cec175a5	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	331	33	364	2026-07-31 12:31:33.504757+00
ecdb9aad-30d8-4bf9-9ecd-0eba066a582a	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	372	22	394	2026-07-31 12:31:54.00061+00
10180e65-3cb1-45e1-a7d2-ab70e1fa06f6	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	403	4	407	2026-07-31 12:32:12.627257+00
219f1708-aab0-4ed4-ab0f-9cbad8e40497	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	406	4	410	2026-07-31 12:41:28.272118+00
83e3e606-c8e3-45fb-9081-e4723f43c0b2	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	414	4	418	2026-07-31 12:49:47.690863+00
b666923f-df2a-4c53-a620-68d3d3f5a220	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	424	16	440	2026-07-31 12:50:29.562751+00
7678fe8f-aa52-4b92-9ba7-4eabcab4217a	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	535	9	544	2026-08-03 05:45:56.001278+00
f9b684e2-ba6c-436d-add8-2a763d1286e2	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	574	4	578	2026-08-03 05:50:34.039357+00
f1babc8c-4111-4368-9371-acb8e7499097	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	410	15	425	2026-08-03 06:01:32.02943+00
1463a39e-7a4a-4e89-ac6a-8c033810d5f3	3430edae-763b-4aac-9b82-1c2364936d79	\N	auto_reply	gemini	gemini-3.1-flash-lite-preview	476	17	493	2026-08-03 07:55:00.225778+00
5d1c71b8-dc5a-4e3e-95cf-1b957d6246d3	3430edae-763b-4aac-9b82-1c2364936d79	223671d9-9d0c-4e10-a42d-afcb766c197b	auto_reply	gemini	gemini-3.1-flash-lite-preview	498	25	523	2026-08-03 08:16:07.734061+00
1f769a47-332a-42fd-9f49-8eca605a6855	3430edae-763b-4aac-9b82-1c2364936d79	223671d9-9d0c-4e10-a42d-afcb766c197b	auto_reply	gemini	gemini-3.1-flash-lite-preview	526	17	543	2026-08-04 08:06:17.871019+00
cf94d218-595e-4419-9a7e-efd072b49518	3430edae-763b-4aac-9b82-1c2364936d79	223671d9-9d0c-4e10-a42d-afcb766c197b	auto_reply	gemini	gemini-3.1-flash-lite-preview	549	19	568	2026-08-04 11:03:04.588679+00
\.


--
-- TOC entry 5528 (class 0 OID 18471)
-- Dependencies: 335
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.api_keys (id, account_id, created_by, name, key_prefix, key_hash, scopes, last_used_at, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- TOC entry 5518 (class 0 OID 17923)
-- Dependencies: 325
-- Data for Name: automation_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_logs (id, automation_id, user_id, contact_id, trigger_event, steps_executed, status, error_message, created_at, account_id) FROM stdin;
\.


--
-- TOC entry 5519 (class 0 OID 17952)
-- Dependencies: 326
-- Data for Name: automation_pending_executions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_pending_executions (id, automation_id, user_id, contact_id, log_id, parent_step_id, branch, next_step_position, context, status, run_at, created_at, account_id) FROM stdin;
\.


--
-- TOC entry 5517 (class 0 OID 17899)
-- Dependencies: 324
-- Data for Name: automation_steps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_steps (id, automation_id, parent_step_id, branch, step_type, step_config, "position", created_at) FROM stdin;
\.


--
-- TOC entry 5516 (class 0 OID 17877)
-- Dependencies: 323
-- Data for Name: automations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automations (id, user_id, name, description, trigger_type, trigger_config, is_active, execution_count, last_executed_at, created_at, updated_at, account_id) FROM stdin;
\.


--
-- TOC entry 5515 (class 0 OID 17813)
-- Dependencies: 322
-- Data for Name: broadcast_recipients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.broadcast_recipients (id, broadcast_id, contact_id, status, sent_at, delivered_at, read_at, replied_at, error_message, created_at, whatsapp_message_id) FROM stdin;
94b7975b-28f5-435b-be8e-712351a29085	b456dd92-d94f-4b5d-91bc-a3be3d834b8b	\N	replied	2026-07-25 13:04:26.348+00	2026-07-25 13:04:28+00	2026-07-25 13:04:38+00	2026-07-25 13:04:47.203+00	\N	2026-07-25 13:04:23.751224+00	wamid.HBgMOTE3ODYxOTAyMzQxFQIAERgSQ0VDRDUwMTU3OEExRDU3NTZBAA==
\.


--
-- TOC entry 5514 (class 0 OID 17788)
-- Dependencies: 321
-- Data for Name: broadcasts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.broadcasts (id, user_id, name, template_name, template_language, template_variables, audience_filter, scheduled_at, status, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, created_at, updated_at, account_id) FROM stdin;
b456dd92-d94f-4b5d-91bc-a3be3d834b8b	2b7a9798-3044-440f-80be-68952f57d708	Test 1	jaspers_market_order_confirmation_v1	en_US	{"1": {"type": "field", "value": "phone"}, "2": {"type": "field", "value": "phone"}, "3": {"type": "field", "value": "phone"}}	{"type": "tags", "tagIds": ["84be16de-01da-47f8-b3e5-727f0486ad2c"]}	\N	sent	1	1	1	1	1	0	2026-07-25 13:04:23.674227+00	2026-07-25 13:04:47.230196+00	3430edae-763b-4aac-9b82-1c2364936d79
\.


--
-- TOC entry 5505 (class 0 OID 17581)
-- Dependencies: 312
-- Data for Name: contact_custom_values; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_custom_values (id, contact_id, custom_field_id, value, created_at) FROM stdin;
\.


--
-- TOC entry 5506 (class 0 OID 17603)
-- Dependencies: 313
-- Data for Name: contact_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_notes (id, contact_id, user_id, note_text, created_at, account_id) FROM stdin;
\.


--
-- TOC entry 5552 (class 0 OID 19587)
-- Dependencies: 360
-- Data for Name: contact_page_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_page_settings (id, heading, subheading, office_address, phone_number, email_address, working_hours, form_heading, form_subheading, map_embed_url, extra_data, created_at, updated_at) FROM stdin;
a46bbb06-e747-4fa5-9557-04d226c2da1d	Contact Replai.	Reach out for product support, billing questions, or WhatsApp automation help.	Junkies Coder, Mumbai, Maharashtra, India	+91 8828891026	info@junkiescoder.com	Mon to Fri, 10:00 AM to 7:00 PM IST	Send us a message	We usually respond within 24 business hours.	\N	{}	2026-08-05 08:05:12.158324+00	2026-08-05 11:03:57.284+00
\.


--
-- TOC entry 5554 (class 0 OID 19623)
-- Dependencies: 362
-- Data for Name: contact_replies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_replies (id, submission_id, subject, body, sent_by, created_at) FROM stdin;
71c54255-5c68-48f5-a72b-bd34f84be707	1012b95a-654d-41b9-baec-67a69e6952f4	Test 2	hi	Super Admin	2026-08-05 11:54:21.325678+00
1eb2fcf7-9768-46f5-9c79-32e034cc16ed	1012b95a-654d-41b9-baec-67a69e6952f4	hi 	hi this is the test message can you find this 	Super Admin	2026-08-05 12:06:06.06149+00
c2190423-840a-435e-a9fa-2a89fb83f91c	1012b95a-654d-41b9-baec-67a69e6952f4	hi test 4	this is the test 4	Super Admin	2026-08-05 12:13:35.436434+00
c2f58abe-4f3a-4303-97a3-4132c032b2cd	1012b95a-654d-41b9-baec-67a69e6952f4	hi test 5	Hi this tes tthe test 5\n	Super Admin	2026-08-05 12:17:59.737256+00
\.


--
-- TOC entry 5553 (class 0 OID 19606)
-- Dependencies: 361
-- Data for Name: contact_submissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_submissions (id, name, email, subject, message, status, created_at, updated_at, phone, company) FROM stdin;
1012b95a-654d-41b9-baec-67a69e6952f4	Souaib Ansari	souaib@junkiescoder.com	\N	I want to buy the crm whats is the price	replied	2026-08-05 11:35:41.819656+00	2026-08-05 12:17:53.637+00	+91 7867867861	Junkiescoder
\.


--
-- TOC entry 5503 (class 0 OID 17543)
-- Dependencies: 310
-- Data for Name: contact_tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_tags (id, contact_id, tag_id, created_at) FROM stdin;
\.


--
-- TOC entry 5501 (class 0 OID 17509)
-- Dependencies: 308
-- Data for Name: contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contacts (id, user_id, phone, name, email, company, avatar_url, created_at, updated_at, account_id) FROM stdin;
ce88c37f-fcff-4938-ad0e-64f69038945c	2b7a9798-3044-440f-80be-68952f57d708	919624582036	Samaan Memon	\N	\N	\N	2026-07-27 11:19:20.185535+00	2026-07-27 11:19:20.185535+00	3430edae-763b-4aac-9b82-1c2364936d79
25847e1d-bbb3-4702-bee5-15d98d7213ad	2b7a9798-3044-440f-80be-68952f57d708	916359463987	Sohaib	ansarisoyab908@gmail.com	Junkies Coder	\N	2026-08-03 08:14:45.582442+00	2026-08-03 08:16:05.916026+00	3430edae-763b-4aac-9b82-1c2364936d79
34bd2db6-97ce-4131-982b-469a3a177d7b	3dbf0236-b75e-4805-a8c9-405fdfd259a5	+916359463987	Sohaib	\N	\N	\N	2026-08-04 13:14:27.116733+00	2026-08-04 13:15:17.018272+00	eb378216-3e5b-4acd-874b-978cf65bd0d3
\.


--
-- TOC entry 5507 (class 0 OID 17623)
-- Dependencies: 314
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversations (id, user_id, contact_id, status, assigned_agent_id, last_message_text, last_message_at, unread_count, created_at, updated_at, account_id, ai_autoreply_disabled, ai_reply_count, ai_handoff_summary) FROM stdin;
223671d9-9d0c-4e10-a42d-afcb766c197b	2b7a9798-3044-440f-80be-68952f57d708	25847e1d-bbb3-4702-bee5-15d98d7213ad	open	\N	I am Alexa, your professional customer service assistant for Amazon. How can I help you today?	2026-08-04 11:03:06.865+00	0	2026-08-03 08:14:45.899387+00	2026-08-04 11:03:07.404948+00	3430edae-763b-4aac-9b82-1c2364936d79	f	3	\N
2a030957-3f05-4ebf-bea7-f51fa05f8262	2b7a9798-3044-440f-80be-68952f57d708	ce88c37f-fcff-4938-ad0e-64f69038945c	open	\N	Handle	2026-07-27 11:58:38.803+00	0	2026-07-27 11:19:20.346773+00	2026-07-29 12:10:29.548071+00	3430edae-763b-4aac-9b82-1c2364936d79	f	0	\N
91da856a-a921-4e55-97aa-b753014b7e99	3dbf0236-b75e-4805-a8c9-405fdfd259a5	34bd2db6-97ce-4131-982b-469a3a177d7b	open	\N	hi i am	2026-08-04 13:15:32.69+00	0	2026-08-04 13:14:38.412605+00	2026-08-04 13:15:32.800549+00	eb378216-3e5b-4acd-874b-978cf65bd0d3	f	0	\N
\.


--
-- TOC entry 5504 (class 0 OID 17565)
-- Dependencies: 311
-- Data for Name: custom_fields; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.custom_fields (id, user_id, field_name, field_type, field_options, created_at, account_id) FROM stdin;
7cca5826-a055-46d0-92a2-d2adec2d4dbb	2b7a9798-3044-440f-80be-68952f57d708	Lead Source	text	\N	2026-07-25 13:16:54.246987+00	3430edae-763b-4aac-9b82-1c2364936d79
\.


--
-- TOC entry 5513 (class 0 OID 17747)
-- Dependencies: 320
-- Data for Name: deals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deals (id, user_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, currency, notes, expected_close_date, status, created_at, updated_at, assigned_to, account_id) FROM stdin;
\.


--
-- TOC entry 5522 (class 0 OID 18057)
-- Dependencies: 329
-- Data for Name: flow_nodes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y, created_at) FROM stdin;
a9d3b989-ff15-4901-bbd8-6e4922b3baec	bc4c3abb-e3f4-4949-b447-765b1c0dc169	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}."}	0	850	2026-08-03 07:50:12.25649+00
c526c6dc-874e-425a-b676-96c37a0667d6	bc4c3abb-e3f4-4949-b447-765b1c0dc169	intro	send_message	{"text": "Welcome! 👋 I'll ask a few quick questions so we can get you to the right person.", "next_node_key": "ask_name"}	0	170	2026-08-03 07:50:12.25649+00
f54eaf5a-5266-43d6-8573-0d2ee547158b	bc4c3abb-e3f4-4949-b447-765b1c0dc169	ai_agent_bbjrfq	ai_agent	{"prompt_text": "Hi, I'm Alexa, your AI assistant. To help me get you to the right agent, could you please provide your name, email, and company name?", "next_node_key": "handoff", "system_prompt": "You are an AI assistant for Amazon named Alexa. You MUST be professional. Ask the user for their name, email, and company, but be smart enough to extract it from natural language. When you have all three, call the handoff tool. Do not guess delivery dates."}	362	703	2026-08-03 07:50:12.25649+00
58935a91-0c3a-4bcd-a9ff-29f1befc83ad	bc4c3abb-e3f4-4949-b447-765b1c0dc169	start	start	{"next_node_key": "ai_agent_bbjrfq"}	0	0	2026-08-03 07:50:12.25649+00
\.


--
-- TOC entry 5524 (class 0 OID 18122)
-- Dependencies: 331
-- Data for Name: flow_run_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.flow_run_events (id, flow_run_id, event_type, node_key, payload, created_at) FROM stdin;
975d0b6f-fb5f-4f2c-bbf6-1dd2c5159a6c	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNDNkVBM0FFNkZFM0VGMkNENTZDOTk1OTVEQTk1RTgA"}	2026-08-03 05:52:44.925097+00
cdc2e8ff-34bd-4942-b8d0-ccc2c120c588	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	start	{"node_type": "start"}	2026-08-03 05:52:44.995526+00
1b9301ee-d724-472e-a20d-d7d45125465a	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	intro	{"node_type": "send_message"}	2026-08-03 05:52:45.039926+00
124ed557-46bc-415c-80f7-573c1f73ac00	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	message_sent	intro	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQjFBOUYzOTA3MUY3NzkwODNFAA=="}	2026-08-03 05:52:46.342471+00
4e3ab540-ca25-4597-a1ce-ea0e9c77d1af	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_name	{"node_type": "collect_input"}	2026-08-03 05:52:46.372999+00
73a67ea6-e8c0-4e85-9ba2-1d212fdb58dc	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	message_sent	ask_name	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQTZDMTg2QUQxMUZDQTc1QjMxAA=="}	2026-08-03 05:52:47.446979+00
37628e23-1cf2-4814-9039-5344fe59678b	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	reply_received	ask_name	{"reply_id": null, "reply_kind": "text", "text_length": 8, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM2RUU5MEQ5QTJDQUNDRjU1NEVCNEU5NzZFM0E4MTcA"}	2026-08-03 05:53:01.733765+00
d975d47f-b475-4f47-b95c-a6b20537c841	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_name	{"captured_key": "name", "captured_length": 8}	2026-08-03 05:53:02.066283+00
53bc71bd-17b9-4e89-863c-47420e71b5e1	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_email	{"node_type": "collect_input"}	2026-08-03 05:53:02.1093+00
8485cd82-7ee1-4b43-8ce9-2f33e8f1bb3f	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	message_sent	ask_email	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMzdCOTUzQjNGRkRCRTRBQkU2AA=="}	2026-08-03 05:53:02.941378+00
1d5e973c-e783-4651-a4c6-bc29a542f4b7	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	reply_received	ask_email	{"reply_id": null, "reply_kind": "text", "text_length": 21, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM1NEI1NkM1NUQwQUI3NUY0OEJBMzg3NURCQzM3QTEA"}	2026-08-03 05:53:17.35996+00
eab804ec-2a6f-4bf9-a3d2-9e18214880dd	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_email	{"captured_key": "email", "captured_length": 21}	2026-08-03 05:53:17.501912+00
d44434de-9302-4fe0-99a2-94a64bb5c28b	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_company	{"node_type": "collect_input"}	2026-08-03 05:53:17.55132+00
03ee96c4-368e-47e0-ad88-fc60fbe659f9	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	message_sent	ask_company	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQzU2OTlEQTQwMzk1QkEzRDFGAA=="}	2026-08-03 05:53:18.787388+00
e998dca4-293c-4a86-a14c-b8a00e672ca6	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	reply_received	ask_company	{"reply_id": null, "reply_kind": "text", "text_length": 13, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMzRkZEN0EyQjFENTdERTYzQTMyRDdBMDRCQ0RDOTUA"}	2026-08-03 05:53:30.364272+00
3b9d5770-6c1a-4311-a34e-7c3265802da5	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	ask_company	{"captured_key": "company", "captured_length": 13}	2026-08-03 05:53:30.631643+00
f594a32a-78d6-49c4-8869-f23e2c2e3a41	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	node_entered	handoff	{"node_type": "handoff"}	2026-08-03 05:53:30.687004+00
f8fd11e3-37a4-4cd0-ac2f-01e66a3cb22e	be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.", "assigned_to": null}	2026-08-03 05:53:30.775639+00
250038f2-4baa-4a36-80e1-ff3cab2466b2	d44753df-e5f0-4b60-93ee-9fab0aa282bd	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMxNERCOUI0MkNFRjI1RDg1NTMzMkU5NjFGN0NEMzAA"}	2026-08-03 06:01:55.445862+00
ca934ebb-c4be-4912-981d-2d56188af86b	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	start	{"node_type": "start"}	2026-08-03 06:01:55.539131+00
b7254332-2228-4dd3-8bd3-d3d77493501d	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	intro	{"node_type": "send_message"}	2026-08-03 06:01:55.582299+00
b717f538-f39c-4062-bff8-491e7bded364	d44753df-e5f0-4b60-93ee-9fab0aa282bd	message_sent	intro	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNjc3RDJGQUIxODEwQTEwQkVFAA=="}	2026-08-03 06:01:56.918829+00
de2c1d89-821b-4bc3-ba56-0d9af827e166	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_name	{"node_type": "collect_input"}	2026-08-03 06:01:56.971545+00
c4f6f1fd-6d17-48eb-bac1-f1b847464857	d44753df-e5f0-4b60-93ee-9fab0aa282bd	message_sent	ask_name	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRDdCRTMzMzZDN0ZBMjdCMzk2AA=="}	2026-08-03 06:01:57.811721+00
c0c24720-7af6-4e8e-8d3c-35c44dbbc024	d44753df-e5f0-4b60-93ee-9fab0aa282bd	reply_received	ask_name	{"reply_id": null, "reply_kind": "text", "text_length": 13, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM4QUI1MzY1RDRFMUZGMzEyMERFQTc2Mzg2MkM4RTUA"}	2026-08-03 06:02:14.906286+00
6d14cd0d-94f6-4997-be23-12bf327a4705	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_name	{"captured_key": "name", "captured_length": 13}	2026-08-03 06:02:15.022821+00
72209bd2-7ba5-4d71-a5ac-92c7ce571245	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_email	{"node_type": "collect_input"}	2026-08-03 06:02:15.054763+00
f18632fa-def8-49fb-b589-109882af6fbb	d44753df-e5f0-4b60-93ee-9fab0aa282bd	message_sent	ask_email	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMkEwQUI4QTQyMkFFNEM5ODc4AA=="}	2026-08-03 06:02:16.336355+00
7399fb60-3a13-4224-a11a-0904473a9659	d44753df-e5f0-4b60-93ee-9fab0aa282bd	reply_received	ask_email	{"reply_id": null, "reply_kind": "text", "text_length": 24, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMwMjRBQjYyNjREQjFGOTIyMjZGQkM1ODc5NUMzQjcA"}	2026-08-03 06:02:28.133869+00
26ce0f05-1c59-4803-805a-923b22a72271	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_email	{"captured_key": "email", "captured_length": 24}	2026-08-03 06:02:28.292414+00
d137ab4b-5627-4901-be68-d533cb9927b3	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_company	{"node_type": "collect_input"}	2026-08-03 06:02:28.33934+00
65917567-be3d-4ed1-9a3e-8a9edb9a0779	d44753df-e5f0-4b60-93ee-9fab0aa282bd	message_sent	ask_company	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRTA3QkFBMDIzMUY4M0FERDNGAA=="}	2026-08-03 06:02:29.635065+00
8b7ba867-b4be-4c27-831c-d5712ef63023	d44753df-e5f0-4b60-93ee-9fab0aa282bd	reply_received	ask_company	{"reply_id": null, "reply_kind": "text", "text_length": 13, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNCREIzRDBFRTg3Rjk4NzQ5ODNBQjA5NDMwMDlGQzgA"}	2026-08-03 06:02:40.375972+00
85c6fbdf-bef9-4a9e-b319-be367e1e5fe4	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	ask_company	{"captured_key": "company", "captured_length": 13}	2026-08-03 06:02:40.521163+00
bb917bea-8e03-4dc4-9068-574c745506ed	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	farewell	{"node_type": "send_message"}	2026-08-03 06:02:40.567911+00
e0979036-47fd-46cc-91cd-8e39ffb11732	d44753df-e5f0-4b60-93ee-9fab0aa282bd	message_sent	farewell	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSOEY1ODlDREEyOTIwM0M0NjhEAA=="}	2026-08-03 06:02:41.859614+00
87a13019-e014-419e-bd43-c7af1f1119ca	d44753df-e5f0-4b60-93ee-9fab0aa282bd	node_entered	handoff	{"node_type": "handoff"}	2026-08-03 06:02:41.903085+00
7a32f6fb-efea-4217-affd-ef9b2eb182c8	d44753df-e5f0-4b60-93ee-9fab0aa282bd	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.", "assigned_to": null}	2026-08-03 06:02:42.042036+00
6576f7ab-fb23-49af-ad6a-2e98805b0ce2	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_company	{"captured_key": "company", "captured_length": 32}	2026-08-03 06:06:03.404298+00
bd17ef8c-f6fe-41ad-9781-cba312781ab5	70c44ef9-bf5e-4afd-9226-c734f11679ac	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFNzlBQkRGOTZBQkZEQzZENkQ0MUVDNTkwODE5NTEA"}	2026-08-03 06:04:47.906828+00
070468e6-e86b-4f57-92ca-f3f2874df1c7	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	start	{"node_type": "start"}	2026-08-03 06:04:47.983028+00
2a612420-afad-4a1b-bbc5-3a29762d3316	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_name	{"node_type": "collect_input"}	2026-08-03 06:04:49.371602+00
52c337bd-d341-437b-856a-5d34e74a33ee	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_email	{"captured_key": "email", "captured_length": 36}	2026-08-03 06:05:43.24792+00
ef1abd9b-a124-44cd-b5b4-3471a3f11de9	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	farewell	{"node_type": "send_message"}	2026-08-03 06:06:03.447986+00
406eee5d-ae40-4bd2-a186-9b33e8d0ee19	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	intro	{"node_type": "send_message"}	2026-08-03 06:04:48.032034+00
e460f877-c1aa-4cee-b815-b42f2e319e1d	70c44ef9-bf5e-4afd-9226-c734f11679ac	message_sent	intro	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNzkyMTBGOEM4MEI3QzY4RjZFAA=="}	2026-08-03 06:04:49.318187+00
b7d49b1d-04b3-4fae-80a1-61c30ab962f8	70c44ef9-bf5e-4afd-9226-c734f11679ac	reply_received	ask_name	{"reply_id": null, "reply_kind": "text", "text_length": 24, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNBNEYxMTNEQ0JCNzlFQzdCQThFMEJERUM4MEU5N0MA"}	2026-08-03 06:05:03.194689+00
aecbd88e-0fd6-45d4-b4ae-a9c22f3c0875	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_email	{"node_type": "collect_input"}	2026-08-03 06:05:03.376606+00
e86dd73a-f369-4190-9508-d27bbf3b7685	70c44ef9-bf5e-4afd-9226-c734f11679ac	message_sent	ask_email	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRkM2OUYyRDY0RkM1QkJCMjhBAA=="}	2026-08-03 06:05:04.652091+00
424c3e75-b6e6-40b9-b15c-5b0ff2b369d5	70c44ef9-bf5e-4afd-9226-c734f11679ac	reply_received	ask_email	{"reply_id": null, "reply_kind": "text", "text_length": 36, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNBOTJDOTY3RTRCRDA5NDRCNDk4RTdGMjMxNkVGQjIA"}	2026-08-03 06:05:43.107151+00
2730edc6-d099-4d07-8f13-5d22e28d73c3	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_company	{"node_type": "collect_input"}	2026-08-03 06:05:43.294398+00
7e45a343-d0f2-45f6-9715-68da2211d34d	70c44ef9-bf5e-4afd-9226-c734f11679ac	message_sent	ask_company	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMDhFM0I3RTg1RDkxOUUyRjU2AA=="}	2026-08-03 06:05:44.613341+00
7d58d06f-aee8-426b-b05e-b07c60e6170e	70c44ef9-bf5e-4afd-9226-c734f11679ac	reply_received	ask_company	{"reply_id": null, "reply_kind": "text", "text_length": 32, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNCNTgxMUJGQTk4QzMyMDBENzgyRTBEQjhEQ0I4QTUA"}	2026-08-03 06:06:03.278388+00
f260d8b7-e494-4e4e-a0d5-79ea0913d11c	70c44ef9-bf5e-4afd-9226-c734f11679ac	message_sent	farewell	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMERCMjU2M0U4MUJCOUQwMkJFAA=="}	2026-08-03 06:06:04.960303+00
ce6852d6-7198-45c4-8da0-8b61bf477f3d	70c44ef9-bf5e-4afd-9226-c734f11679ac	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.", "assigned_to": null}	2026-08-03 06:06:05.142972+00
653dbe22-f9e9-414d-832a-22cfa0ec490a	70c44ef9-bf5e-4afd-9226-c734f11679ac	message_sent	ask_name	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNjc5RjhDRDY5RjZDM0Q1QzExAA=="}	2026-08-03 06:04:50.199547+00
ab332c6e-c603-4ca5-8fd5-05f00e7d5b09	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	ask_name	{"captured_key": "name", "captured_length": 24}	2026-08-03 06:05:03.333936+00
8eb8a747-474c-4d62-a1cc-b4e128469ab1	70c44ef9-bf5e-4afd-9226-c734f11679ac	node_entered	handoff	{"node_type": "handoff"}	2026-08-03 06:06:04.996734+00
eb285dc1-c4b0-4e78-a938-df18e78d6a0a	ebeb893b-2ffc-413b-a56a-4940814dbb13	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNENjJBODlFMURBNjlCQTNDREY5MzkwQjk4NEZGMjYA"}	2026-08-03 06:10:43.775836+00
c2e88ea5-c117-45d5-be96-f4127fb9af04	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	start	{"node_type": "start"}	2026-08-03 06:10:43.853708+00
7bae647f-e7b0-42b2-a8a4-75512435463c	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	intro	{"node_type": "send_message"}	2026-08-03 06:10:43.894792+00
0c2df938-dec4-4bb0-892f-b9488e0e9dd2	ebeb893b-2ffc-413b-a56a-4940814dbb13	message_sent	intro	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRkNEQzk1M0E1NTI2MTYzQzE5AA=="}	2026-08-03 06:10:45.169722+00
ebde5b5c-82fe-44bb-a2d7-4318c7dbadf8	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_name	{"node_type": "collect_input"}	2026-08-03 06:10:45.207493+00
064d0a07-b092-45e4-8747-df3ee5459bbe	ebeb893b-2ffc-413b-a56a-4940814dbb13	message_sent	ask_name	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSODMxNkM3REUwMDY5NTMwMjM3AA=="}	2026-08-03 06:10:46.111072+00
8c10e3ef-2cb1-40c9-9a74-485b02d70061	ebeb893b-2ffc-413b-a56a-4940814dbb13	reply_received	ask_name	{"reply_id": null, "reply_kind": "text", "text_length": 49, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFNzY2REYxMEIyRDQxMjRFMTdCQzk4REFBQTQ1N0UA"}	2026-08-03 06:11:12.429635+00
35f2f963-bb34-4915-bf06-0534b4a2eb18	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_name	{"captured_key": "name", "captured_length": 49}	2026-08-03 06:11:12.740007+00
f09e6cff-b691-4736-a609-50b167d45650	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_email	{"node_type": "collect_input"}	2026-08-03 06:11:12.78865+00
d7472f82-2f92-403f-b275-3da9061d1664	ebeb893b-2ffc-413b-a56a-4940814dbb13	message_sent	ask_email	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMzk5QzA0Qjg0RjI0MDU3QTg5AA=="}	2026-08-03 06:11:14.042852+00
3dccb39b-3ae7-47e4-ad1b-3e550500bc02	ebeb893b-2ffc-413b-a56a-4940814dbb13	reply_received	ask_email	{"reply_id": null, "reply_kind": "text", "text_length": 64, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNCNzNDOUVEMDU3MTZDMDI1QTQ5RkIzQ0UyNjc0QTUA"}	2026-08-03 06:11:41.980452+00
f397cbf3-b7bf-4d6e-b8d2-67af08e0ff52	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_email	{"captured_key": "email", "captured_length": 24}	2026-08-03 06:11:42.108456+00
31382765-cc82-4fe8-acf1-890813e6f659	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_company	{"node_type": "collect_input"}	2026-08-03 06:11:42.167035+00
a2f50885-53cf-4ae9-80ec-fd2c85a028c4	ebeb893b-2ffc-413b-a56a-4940814dbb13	message_sent	ask_company	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNkUyM0RDRkM5QjJBOENGMjY5AA=="}	2026-08-03 06:11:43.406193+00
0c230eb6-7bf4-4418-a661-471043557176	ebeb893b-2ffc-413b-a56a-4940814dbb13	reply_received	ask_company	{"reply_id": null, "reply_kind": "text", "text_length": 29, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM4NEE5NkQ2REEwMzcxRTc4OTAyRjc4Mjg3MDdFMEYA"}	2026-08-03 06:12:03.29239+00
097907b6-e673-452f-8899-02509becff66	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	ask_company	{"captured_key": "company", "captured_length": 29}	2026-08-03 06:12:03.404643+00
c6dbaece-7814-4da6-9147-89fcf57cbbb6	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	farewell	{"node_type": "send_message"}	2026-08-03 06:12:03.440358+00
0e2fbce7-7afc-4fe2-a22c-3f9bbeebfa70	ebeb893b-2ffc-413b-a56a-4940814dbb13	message_sent	farewell	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNDk2QjI1NDc2MkE0N0ExNTI3AA=="}	2026-08-03 06:12:04.665507+00
9774b607-e764-42f0-bdb5-d3e8743554ec	ebeb893b-2ffc-413b-a56a-4940814dbb13	node_entered	handoff	{"node_type": "handoff"}	2026-08-03 06:12:04.71358+00
3be3cfc7-8930-4277-949e-1db8eb54243a	ebeb893b-2ffc-413b-a56a-4940814dbb13	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.", "assigned_to": null}	2026-08-03 06:12:04.846797+00
ef9b0255-da48-4cf7-b11d-990fc2f49105	61157d9a-d6fd-4de9-b34c-561c457a259e	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFQjlGREI5Q0I2NDU1QUEzMjJCNzlBMTM4QzY1RUEA"}	2026-08-03 07:55:31.055784+00
a9cf977f-cc3d-452d-a504-ca525970e4da	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	start	{"node_type": "start"}	2026-08-03 07:55:31.164192+00
7b30f0a8-5691-4662-a01b-97bd6118f088	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	intro	{"node_type": "send_message"}	2026-08-03 07:55:31.220465+00
faac8cc4-02df-4f68-8cd2-d0f15c59b5a0	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	intro	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMTQ4QzdGNDlENzhGRkY1ODc2AA=="}	2026-08-03 07:55:32.522676+00
b51344c5-98d9-4c8f-b3dd-c40f10cc44e1	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_name	{"node_type": "collect_input"}	2026-08-03 07:55:32.562237+00
dde68045-19e4-4617-9ca9-11fab3579354	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	ask_name	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQ0I4MkVCQ0M3RDM3NjIzMDlGAA=="}	2026-08-03 07:55:33.424709+00
83f8c43b-460e-4fdb-8f10-d85c9495be43	61157d9a-d6fd-4de9-b34c-561c457a259e	reply_received	ask_name	{"reply_id": null, "reply_kind": "text", "text_length": 49, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMyQUEwNzBFMzA2M0ExNEE5ODUzOTYxNTc3QTBBMTAA"}	2026-08-03 07:55:52.736372+00
ce031ef6-ab13-40c6-9b94-93c032db7a1f	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_name	{"captured_key": "name", "captured_length": 13}	2026-08-03 07:55:53.81885+00
e5336e05-950e-4dc6-b18f-ced1820cc9c3	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_email	{"node_type": "collect_input"}	2026-08-03 07:55:53.852932+00
7eafbb1a-5e71-482a-aa94-8923a3e600f9	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	ask_email	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQkYwMUYzQTU0NjAxNjEyNUYwAA=="}	2026-08-03 07:55:55.148666+00
b4fc1cbc-c3c4-47e1-9d96-8284944ff790	61157d9a-d6fd-4de9-b34c-561c457a259e	reply_received	ask_email	{"reply_id": null, "reply_kind": "text", "text_length": 94, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNDODE5QkJERjUzNDkwOTM4MUQ2ODE4RkY5NkRENUQA"}	2026-08-03 07:56:35.827373+00
b2c6372c-a77d-4115-8c2e-8d2b952abdd2	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_email	{"captured_key": "email", "captured_length": 24}	2026-08-03 07:56:36.87224+00
f9561510-662b-4d97-a978-9a1b8054ab6c	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_company	{"node_type": "collect_input"}	2026-08-03 07:56:36.910825+00
8ea38835-bc11-4e36-82c7-31a66278416e	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	ask_company	{"node_type": "collect_input", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRDIwMzZDQzI5QjY5NDVFQzcwAA=="}	2026-08-03 07:56:38.145595+00
65dce90f-71b7-475f-90fe-2aa66d7a6ff8	61157d9a-d6fd-4de9-b34c-561c457a259e	reply_received	ask_company	{"reply_id": null, "reply_kind": "text", "text_length": 20, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNGQTY2NzAyQzYxMUI5OEQ1QTNCRTZDOUVCODFDMzcA"}	2026-08-03 07:56:56.018839+00
7ee63cf8-bcce-43fa-a8c3-64c1da8ab8e5	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ask_company	{"captured_key": "company", "captured_length": 13}	2026-08-03 07:56:57.040634+00
78a69b81-fbdd-4d94-91a0-03a0334235d1	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	farewell	{"node_type": "send_message"}	2026-08-03 07:56:57.082213+00
66c8855f-5eeb-4afc-b74e-10cacd3f412d	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	farewell	{"node_type": "send_message", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMjFCOEY2QUJFOTEwQUVEMjAzAA=="}	2026-08-03 07:56:58.366414+00
0b5cf604-7061-4af2-8d64-5f9595cc49d5	61157d9a-d6fd-4de9-b34c-561c457a259e	node_entered	ai_agent_bbjrfq	{"node_type": "ai_agent"}	2026-08-03 07:56:58.412314+00
68949124-7255-4fcb-b0b1-d98e3174a4b1	61157d9a-d6fd-4de9-b34c-561c457a259e	message_sent	ai_agent_bbjrfq	{"node_type": "ai_agent", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNTVCNEI0NzRDNDg2MDdERkYyAA=="}	2026-08-03 07:56:59.306768+00
d98db466-6b56-47e8-8ed8-384fe3d2c0fc	2ac5b973-864b-46ee-8952-ef3722c52069	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFRTYxREVCRDJCMTY2N0RBNTA1NjU0QzE5QzRCQjYA"}	2026-08-03 08:09:04.651692+00
024c1f46-9e6c-4115-8388-3aab03bb6230	2ac5b973-864b-46ee-8952-ef3722c52069	node_entered	start	{"node_type": "start"}	2026-08-03 08:09:04.74679+00
07ea4e37-ffcd-4f87-bf13-71204c2fcd20	2ac5b973-864b-46ee-8952-ef3722c52069	node_entered	ai_agent_bbjrfq	{"node_type": "ai_agent"}	2026-08-03 08:09:04.791686+00
c7a24f7b-3a72-41c9-a097-38e135fcf889	2ac5b973-864b-46ee-8952-ef3722c52069	message_sent	ai_agent_bbjrfq	{"node_type": "ai_agent", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNkI2NEZFOTNCMzI2OURBNEFFAA=="}	2026-08-03 08:09:06.189769+00
a524d58d-e879-4207-a9e8-a3bbb831ec33	2ac5b973-864b-46ee-8952-ef3722c52069	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 49, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM1NzQ1M0EwMEZGRkYwNjhENDBCRUQ1MzY3QUQwMEMA"}	2026-08-03 08:09:40.086795+00
e99a96a3-e27a-4f13-b282-ddf5806b2f99	2ac5b973-864b-46ee-8952-ef3722c52069	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 94, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM1RENCQ0M4NUNDMUFEOTI3MkIwNDVENDA1RTZBNEQA"}	2026-08-03 08:10:08.805445+00
1139e783-6d2e-48a2-95fd-ddeb114be978	2ac5b973-864b-46ee-8952-ef3722c52069	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 32, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNDQTVBNTQ4OTFCNTg5RjIwRDFGN0E2OUEwRjgwNjMA"}	2026-08-03 08:10:36.583818+00
a93b287b-3c85-4b5d-ad0a-55dd986f4668	2ac5b973-864b-46ee-8952-ef3722c52069	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 12, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM5Q0FENzBGRjkwQ0ZBMDhBODY4MkM1OUU3MUZBNTcA"}	2026-08-03 08:11:01.641363+00
af0be43b-c4da-4b64-8cb6-faf5e1cf5fc4	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	started	start	{"flow_id": "bc4c3abb-e3f4-4949-b447-765b1c0dc169", "trigger_type": "first_inbound_message", "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMyMDI2MTIwMkI4MTJEOUM5MUExNUIxQkM3OTEwQTQA"}	2026-08-03 08:14:46.402507+00
a5939c08-a454-483d-b85d-5c504d514620	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	node_entered	start	{"node_type": "start"}	2026-08-03 08:14:46.495749+00
b5e8dca1-7c1d-4068-afbe-2f780c5b33ea	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	node_entered	ai_agent_bbjrfq	{"node_type": "ai_agent"}	2026-08-03 08:14:46.5361+00
64c25034-9b29-4a68-9528-2a3ba82120c8	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	message_sent	ai_agent_bbjrfq	{"node_type": "ai_agent", "whatsapp_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSOTI0N0ExN0Y5NkZBRkQzMzAyAA=="}	2026-08-03 08:14:47.455936+00
b85783e7-0411-4819-b117-2cecb53d2c5c	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 49, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM2RTE4QUYwNzg4Mjg4Njg4OEVCOUMwQ0NBMTMwNjcA"}	2026-08-03 08:15:08.366498+00
ec3786d8-cebe-4786-b7e3-0c5824e02881	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 64, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM2MkU2REJBQ0YyNzlGQUU0RUQwRjUxQjI1NzgwRTEA"}	2026-08-03 08:15:17.374107+00
6648a79a-541d-40ef-9a11-05153d1fc387	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	reply_received	ai_agent_bbjrfq	{"reply_id": null, "reply_kind": "text", "text_length": 40, "meta_message_id": "wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFRDRBNUYxRDRERjY3MzA4MUZFREUzNTlFNEU4RkUA"}	2026-08-03 08:15:46.178738+00
0cf9d6d6-09b0-478c-90d7-1a802084f3fe	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	node_entered	handoff	{"node_type": "handoff"}	2026-08-03 08:15:48.655021+00
7670ccd6-ff29-4881-a792-b79d1368f599	55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	handoff	handoff	{"note": "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.", "assigned_to": null}	2026-08-03 08:15:48.769674+00
\.


--
-- TOC entry 5523 (class 0 OID 18079)
-- Dependencies: 330
-- Data for Name: flow_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.flow_runs (id, flow_id, user_id, contact_id, conversation_id, status, current_node_key, last_prompt_message_id, vars, reprompt_count, started_at, last_advanced_at, ended_at, end_reason, account_id) FROM stdin;
61157d9a-d6fd-4de9-b34c-561c457a259e	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	active	ai_agent_bbjrfq	\N	{"name": "Souaib Ansari", "email": "ansarisoyab908@gmail.com", "company": "Junkies Coder"}	0	2026-08-03 07:55:31.004845+00	2026-08-03 07:56:56.704+00	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
70c44ef9-bf5e-4afd-9226-c734f11679ac	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	handed_off	ask_company	\N	{"name": "My name is Souaib Ansari", "email": "My email is ansarisoyab908@gmail.com", "company": "My company name is Junkies Coder"}	0	2026-08-03 06:04:47.842975+00	2026-08-03 06:05:42.011+00	2026-08-03 06:06:02.46+00	handoff_node	3430edae-763b-4aac-9b82-1c2364936d79
2ac5b973-864b-46ee-8952-ef3722c52069	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	active	ai_agent_bbjrfq	\N	{}	0	2026-08-03 08:09:04.609842+00	2026-08-03 08:09:03.577+00	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
55a10e47-cf0f-4722-aa2b-cdd1f6b8413d	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	25847e1d-bbb3-4702-bee5-15d98d7213ad	223671d9-9d0c-4e10-a42d-afcb766c197b	handed_off	ai_agent_bbjrfq	5028869e-6395-4724-a96d-d1a5f91cfd62	{"name": "Souaib Ansari", "email": "ansarisoyab908@gmail.com", "company": "Junkies Coder"}	0	2026-08-03 08:14:46.352152+00	2026-08-03 08:14:44.856+00	2026-08-03 08:15:46.082+00	handoff_node	3430edae-763b-4aac-9b82-1c2364936d79
be2d7cb2-388f-4bf7-a3cb-7880ea0080a7	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	handed_off	ask_company	\N	{"name": "Souaib s", "email": "ansarisoyab@gmail.com", "company": "Junkies coder"}	0	2026-08-03 05:52:44.878251+00	2026-08-03 05:53:16.189+00	2026-08-03 05:53:28.091+00	handoff_node	3430edae-763b-4aac-9b82-1c2364936d79
d44753df-e5f0-4b60-93ee-9fab0aa282bd	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	handed_off	ask_company	\N	{"name": "Souaib Ansari", "email": "ansarisoyab908@gmail.com", "company": "Junkies Coder"}	0	2026-08-03 06:01:55.409467+00	2026-08-03 06:02:27.045+00	2026-08-03 06:02:39.377+00	handoff_node	3430edae-763b-4aac-9b82-1c2364936d79
ebeb893b-2ffc-413b-a56a-4940814dbb13	bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	\N	\N	handed_off	ask_company	\N	{"name": "My good name is Souaib Ansari did you understand?", "email": "ansarisoyab908@gmail.com", "company": "My junkiescoder company name?"}	0	2026-08-03 06:10:43.725602+00	2026-08-03 06:11:40.828+00	2026-08-03 06:12:02.16+00	handoff_node	3430edae-763b-4aac-9b82-1c2364936d79
\.


--
-- TOC entry 5521 (class 0 OID 18034)
-- Dependencies: 328
-- Data for Name: flows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.flows (id, user_id, name, description, status, trigger_type, trigger_config, entry_node_id, fallback_policy, execution_count, last_executed_at, created_at, updated_at, account_id) FROM stdin;
bc4c3abb-e3f4-4949-b447-765b1c0dc169	2b7a9798-3044-440f-80be-68952f57d708	Lead capture	Greet first-time inbounds, capture name + email + company, then hand off to sales with the answers in the note.	active	first_inbound_message	{}	start	{"on_exhaust": "handoff", "max_reprompts": 2, "on_timeout_hours": 24, "on_unknown_reply": "reprompt"}	7	2026-08-03 08:14:46.450646+00	2026-08-03 05:51:40.654076+00	2026-08-03 08:14:46.450646+00	3430edae-763b-4aac-9b82-1c2364936d79
\.


--
-- TOC entry 5545 (class 0 OID 19447)
-- Dependencies: 353
-- Data for Name: landing_faqs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_faqs (id, question, answer, "position", is_visible, created_at, updated_at) FROM stdin;
c125d3dc-58ac-4e98-b7c5-ae9b6cf532a7	Do I need a Meta Developer account to use Replai?	No, Replai simplifies the entire onboarding process. We use the embedded signup flow which automatically connects your WhatsApp Business Account to the Meta API without needing technical setup.	1	t	2026-07-30 05:32:23.836819+00	2026-07-30 05:32:23.836819+00
5aff94c8-bb92-447d-9fa2-55e4af99fe1d	How does the AI chatbot handle complex inquiries?	Our AI is trained on your specific business knowledge base. If it encounters a highly complex or sensitive inquiry, it seamlessly routes the conversation to a human agent, ensuring a smooth customer experience.	2	t	2026-07-30 05:32:23.836819+00	2026-07-30 05:32:23.836819+00
c8d62a3c-b65d-43df-8490-bcb597ceab0a	Can I broadcast promotional messages to my contacts?	Yes, you can send bulk broadcasts using pre-approved Meta message templates. Our platform ensures you stay within WhatsApp's quality rating guidelines and compliance policies to protect your account.	3	t	2026-07-30 05:32:23.836819+00	2026-07-30 05:32:23.836819+00
8b409413-de6c-4d28-9396-4aaf96836306	What happens if a customer replies to a broadcast?	When a customer replies, it automatically triggers a 24-hour customer service window. Our CRM routes the message to your shared inbox where you or the AI can reply freely without template restrictions.	4	t	2026-07-30 05:32:23.836819+00	2026-07-30 05:32:23.836819+00
\.


--
-- TOC entry 5538 (class 0 OID 19291)
-- Dependencies: 345
-- Data for Name: landing_features; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_features (id, icon_name, title, description, "position", is_visible, created_at, updated_at) FROM stdin;
35cef6f0-4361-4b5a-926f-b94ccebd0fb8	MessageSquare	Shared Team Inbox	Multiple agents, one WhatsApp number. Assign conversations, track status, add internal notes. Never miss a customer message.	1	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
8d354648-50d1-4e14-8948-1c05d20e47bb	Bot	AI Reply Assistant	AI-drafted replies powered by OpenAI, Anthropic, or Gemini. Add a knowledge base (FAQs, docs) and the AI answers from your own content.	2	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
0d7eade6-0216-482d-937b-77db4da63112	Workflow	Visual Automations	No-code automation builder with triggers, conditions, delays, webhooks, and tag management. Build complex workflows visually.	3	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
5d824589-8234-4dd7-aed0-0367a8af78de	Send	Broadcast Campaigns	Send Meta-approved template messages to thousands. Track delivery, read, and reply rates in real-time.	4	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
df7a4e47-1b5f-4b2b-b57d-4e6306133573	Kanban	Sales Pipelines	Kanban deal boards linked to conversations. Track deal value, stages, and expected close dates.	5	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
0a57081f-a647-48e5-a974-cf411513350c	Users	Contact Management	Tags, custom fields, CSV import, phone deduplication, and full conversation history per contact.	6	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
\.


--
-- TOC entry 5543 (class 0 OID 19363)
-- Dependencies: 350
-- Data for Name: landing_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_images (id, image_key, url, alt_text, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5541 (class 0 OID 19336)
-- Dependencies: 348
-- Data for Name: landing_integrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_integrations (id, name, description, icon_url, "position", is_visible, created_at, updated_at) FROM stdin;
fe149005-24ad-40ed-9770-97e354e25bed	WhatsApp Business API	Official Meta Cloud API integration	\N	1	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
49d28ecd-521a-4ca4-a5fa-43414826ec8b	Supabase	PostgreSQL database with real-time subscriptions	\N	2	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
82c6f79c-7177-45ba-ab38-9757612c86fb	OpenAI	GPT-4 powered AI reply generation	\N	3	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
4b46b82a-c027-4cab-ac62-9fa70bb11e46	Anthropic	Claude AI for intelligent responses	\N	4	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
cd5c941f-390c-44d4-8bd0-6ac9a8bec05d	Google Gemini	Gemini AI provider support	\N	5	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
14a6113c-e781-4127-af23-c73a996e4627	Webhooks	Send data to any external service	\N	6	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
d24a5b90-2956-41dd-b6f1-de6f2287d5b7	REST API	Full public API with scoped keys	\N	7	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
f6c67708-b39d-4f28-bc00-0c3980c208fc	MCP Protocol	Drive your CRM from AI assistants	\N	8	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
\.


--
-- TOC entry 5540 (class 0 OID 19319)
-- Dependencies: 347
-- Data for Name: landing_pricing_tiers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_pricing_tiers (id, name, price_monthly, price_yearly, price_subtitle, features, is_highlighted, highlight_label, cta_text, cta_link, "position", is_visible, created_at, updated_at) FROM stdin;
6bc34831-80e8-4e2f-a3a2-66dcf09f475e	Starter	$29	$290	per month	["Up to 1,000 contacts", "2 team members", "Basic automations", "5,000 messages/month", "Email support", "Community access"]	f	Most Popular	Get Started	/signup	1	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
5081fd30-48f7-4bf7-aabe-7177dbc151c3	Professional	$79	$790	per month	["Up to 10,000 contacts", "10 team members", "Advanced automations & flows", "25,000 messages/month", "AI reply assistant", "Knowledge base (RAG)", "Priority support", "API access"]	t	Most Popular	Start Free Trial	/signup	2	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
4b06f051-0044-459c-b3c0-3e167946b6cf	Enterprise	Custom	Custom	contact us	["Unlimited contacts", "Unlimited team members", "All automations & flows", "Unlimited messages", "Multi-provider AI (OpenAI, Anthropic, Gemini)", "Dedicated account manager", "SLA guarantee", "Custom integrations", "MCP server access"]	f	Most Popular	Contact Sales	/signup	3	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
\.


--
-- TOC entry 5537 (class 0 OID 19274)
-- Dependencies: 344
-- Data for Name: landing_sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_sections (id, section_key, title, subtitle, body_text, cta_primary_text, cta_primary_link, cta_secondary_text, cta_secondary_link, background_style, background_image_url, is_visible, "position", extra_data, created_at, updated_at, image_url, images, images_secondary) FROM stdin;
f3c822a0-2353-4049-8073-007c0b9062a9	pricing	Simple, transparent pricing	Start free. Scale as you grow. No per-seat AI fees.	\N	\N	\N	\N	\N	default	\N	t	7	{"tiers": [{"id": "p1", "name": "Starter", "cta_link": "/signup", "cta_text": "Get Started", "features": "Up to 1,000 contacts\\n2 team members\\nBasic automations\\n5,000 messages/month\\nStandard support", "description": "Essential features for small teams getting started.", "price_monthly": "$29", "is_highlighted": false, "price_subtitle": "per month", "highlight_label": ""}, {"id": "p2", "name": "Professional", "cta_link": "/signup", "cta_text": "Start Free Trial", "features": "Up to 10,000 contacts\\n10 team members\\nAdvanced automations & flows\\n25,000 messages/month\\nPriority support", "description": "Advanced CRM and AI tools for scaling teams.", "price_monthly": "$79", "is_highlighted": true, "price_subtitle": "per month", "highlight_label": "Most Popular"}, {"id": "p3", "name": "Enterprise", "cta_link": "/contact", "cta_text": "Contact Sales", "features": "Unlimited contacts\\nUnlimited team members\\nAll automations & flows\\nUnlimited messages\\nMulti-provider AI (OpenAI, Anthropic, Gemini)\\nDedicated success manager", "description": "Custom solutions for large organizations.", "price_monthly": "Custom", "is_highlighted": false, "price_subtitle": "contact us", "highlight_label": ""}]}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
d40cf707-823a-46c1-8824-7c255771b6e7	ai_highlight	AI That Actually Understands Your Business	Upload your docs, FAQs, and product info. Replai builds a knowledge base and uses hybrid retrieval (full-text + vector search) to give accurate, context-aware replies — not generic chatbot fluff.	\N	Learn More	#features	\N	\N	default	\N	t	5	{}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.5030861991879763.png	{}	{}
bbb30fa8-a064-4341-80e2-c484f144fd49	features	Everything you need to sell on WhatsApp	Replai brings together the tools your team needs to manage customer conversations at scale.	\N	\N	\N	\N	\N	default	\N	t	3	{"features": [{"id": "f1", "title": "Shared Team Inbox", "icon_name": "MessageSquare", "description": "Multiple agents, one WhatsApp number. Assign conversations, track status, add internal notes. Never miss a customer message."}, {"id": "f2", "title": "AI Reply Assistant", "icon_name": "Bot", "description": "AI-drafted replies powered by OpenAI, Anthropic, or Gemini. Add a knowledge base (FAQs, docs) and the AI answers from your own content."}, {"id": "f3", "title": "Visual Automations", "icon_name": "Workflow", "description": "No-code automation builder with triggers, conditions, delays, webhooks, and tag management. Build complex workflows visually."}, {"id": "f4", "title": "Broadcast Campaigns", "icon_name": "Send", "description": "Send Meta-approved template messages to thousands. Track delivery, read, and reply rates in real-time."}, {"id": "f5", "title": "Sales Pipelines", "icon_name": "Kanban", "description": "Kanban deal boards linked to conversations. Track deal value, stages, and expected close dates."}, {"id": "f6", "title": "Contact Management", "icon_name": "Users", "description": "Tags, custom fields, CSV import, phone deduplication, and full conversation history per contact."}]}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
25390d7d-c3ac-440d-8ccb-cef8715edd82	testimonials	Trusted by businesses across the globe.		\N	\N	\N	\N	\N	default	\N	t	8	{"testimonials": [{"id": "t1", "quote": "Very easy and self explanatory platform", "rating": 5, "author_name": "Siddharth Kulkarni", "author_role": "Educate Me"}, {"id": "t2", "quote": "Great app, great service, helps our team a lot.", "rating": 5, "author_name": "Anish Jain", "author_role": "Appstronauts"}, {"id": "t3", "quote": "The best program for sending group messages without getting blocked.", "rating": 5, "author_name": "Anas Yahya", "author_role": "Haya Travel"}, {"id": "t4", "quote": "It really helps me automate things.", "rating": 5, "author_name": "Satish Kumar", "author_role": "Agilon Cables"}, {"id": "t5", "quote": "Integrated Replai chatbot into my platform and the experience has been smooth and reliable. Their team supported me throughout the chatbot setup. It helped automate customer interactions and reduced manual support efforts significantly.", "rating": 5, "author_name": "Aditya Jaiswal", "author_role": "Roomin"}, {"id": "t6", "quote": "Great experience with the Replai platform. It is very simple to use, and the features are very premium.", "rating": 5, "author_name": "Faheem Ahmad", "author_role": "JDA Infra LTD"}, {"id": "t7", "quote": "Great experience, good support. Highly recommended WhatsApp automation service.", "rating": 5, "author_name": "Vishal Vishwakarma", "author_role": "The Work Culture"}, {"id": "t8", "quote": "After using unofficial and official WhatsApp automation tools, I found Replai is more user-friendly and effective. Highly recommend using this in your business.", "rating": 5, "author_name": "Avadhesh Chaurasiya", "author_role": "Starters' CFO"}, {"id": "t9", "quote": "Amazing live support, I really appreciate it!", "rating": 5, "author_name": "Mihai Ciorobitca", "author_role": "Dieti Housing"}, {"id": "t10", "quote": "Amazing support. Easy to use and configure, and price is much cheaper than other WhatsApp marketing websites. 100% recommend.", "rating": 5, "author_name": "Shivam Doharey", "author_role": "Marketing Agency"}, {"id": "t11", "quote": "The features are easy to use, and the automatic functions work well. No coding required. Support is quite good. The price is quite reasonable. Highly recommended.", "rating": 5, "author_name": "Rudy Hadi Purnawan", "author_role": "BKM Logistic Sawit"}, {"id": "t12", "quote": "As a solo therapy practice, I can't be on WhatsApp 24/7. Replai helped me automate client communication so new leads receive instant responses, existing clients can easily rebook sessions, and no one gets missed while I'm in a session.", "rating": 5, "author_name": "Priya Parwani", "author_role": "Insights Wellbeing"}]}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
7a428dff-ba7a-4742-ac0c-68aef920fd58	how_it_works	How Replai Works	From setup to your first AI-powered reply in just a few simple steps.	\N	\N	\N	\N	\N	default	\N	t	4	{"steps": [{"id": "s1", "title": "Connect your number", "icon_name": "Smartphone", "description": "Link your official WhatsApp Business API number seamlessly. Our platform handles the technical setup."}, {"id": "s2", "title": "Add your team", "icon_name": "Users", "description": "Invite agents, set up roles, and assign permissions. Everyone works from the same WhatsApp number simultaneously."}, {"id": "s3", "title": "Build AI workflows", "icon_name": "Workflow", "description": "Design custom auto-replies, keyword triggers, and chat routing rules using our visual flow builder to automate customer support."}, {"id": "s4", "title": "Engage in the Team Inbox", "icon_name": "Inbox", "description": "Collaborate in real-time. Assign chats, add internal private notes, and let our AI assistant draft perfect replies."}, {"id": "s5", "title": "Broadcasts & Pipelines", "icon_name": "Rocket", "description": "Send Meta-approved bulk promotional campaigns, and track resulting sales through visual drag-and-drop deal pipelines."}]}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
8c282e5c-5d3d-4422-a02f-a9500710387f	integrations	Plays well with your stack	Built on open standards. Connect to the tools you already use.	\N	\N	\N	\N	\N	default	\N	t	6	{"integrations": [{"id": "i1", "title": "WhatsApp Business API", "icon_name": "https://cdn.simpleicons.org/whatsapp/25D366", "description": "Official Meta Cloud API Integration"}, {"id": "i2", "title": "Supabase", "icon_name": "https://cdn.simpleicons.org/supabase/3ECF8E", "description": "PostgreSQL database with real-time subscriptions"}, {"id": "i3", "title": "OpenAI", "icon_name": "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg", "description": "GPT-4 powered AI reply generation"}, {"id": "i4", "title": "Anthropic", "icon_name": "https://cdn.simpleicons.org/anthropic/D97757", "description": "Claude AI for intelligent responses"}, {"id": "i5", "title": "Google Gemini", "icon_name": "https://cdn.simpleicons.org/googlegemini/8E75B2", "description": "Gemini AI provider support"}, {"id": "i6", "title": "Webhooks", "icon_name": "Webhook", "description": "Send data to any external service"}, {"id": "i7", "title": "REST API", "icon_name": "Braces", "description": "Full public API with scoped keys"}, {"id": "i8", "title": "MCP Protocol", "icon_name": "Network", "description": "Drive your CRM from AI assistants"}]}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
3e945ecc-9d38-4f9f-aa02-cb3ade7551e6	cta_banner	Ready to transform your WhatsApp sales?	Join 500+ businesses using Replai to engage customers, close deals, and automate conversations.	No credit card required. Setup in 2 minutes.	Get Started Free	/signup	Talk to Sales	/contact	default	\N	t	9	{}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{}	{}
487f23f7-5028-421f-b54e-56fe901319b6	faq	Frequently Asked Questions	Quick way to understand your immediate needs	\N	\N	\N	\N	\N	default	\N	t	70	{"faqs": [{"id": "d26c5607-c067-481f-84f5-b2a5b49b29d0", "answer": "No, Replai simplifies the entire onboarding process. We use the embedded signup flow which automatically connects your WhatsApp Business Account to the Meta API without needing technical setup.", "question": "Do I need a Meta Developer account to use Replai?"}, {"id": "ad67a2cb-e804-44c4-b295-15ef6f796f90", "answer": "Our AI is trained on your specific business knowledge base. If it encounters a highly complex or sensitive inquiry, it seamlessly routes the conversation to a human agent, ensuring a smooth customer experience.", "question": "How does the AI chatbot handle complex inquiries?"}, {"id": "011eaaaf-9cc5-4cc4-8e4d-7186f44c1356", "answer": "Yes, you can send bulk broadcasts using pre-approved Meta message templates. Our platform ensures you stay within WhatsApp's quality rating guidelines and compliance policies to protect your account.", "question": "Can I broadcast promotional messages to my contacts?"}, {"id": "6ed07141-4f70-4cb1-b732-3b5a60e7754a", "answer": "When a customer replies, it automatically triggers a 24-hour customer service window. Our CRM routes the message to your shared inbox where you or the AI can reply freely without template restrictions.", "question": "What happens if a customer replies to a broadcast?"}]}	2026-07-30 05:25:52.169135+00	2026-07-30 05:25:52.169135+00	\N	{}	{}
4c9d6667-05f5-4d77-a7b1-ed302245f958	hero	Your AI-Powered WhatsApp CRM	Shared inbox, smart automations, broadcast campaigns, and AI replies — all in one platform. Built for teams that sell on WhatsApp.	Trusted by 20,000+ teams globally	Start Free Trial	/signup	Watch Demo	#demo	default	\N	t	1	{"badge_text": "Official WhatsApp Business API"}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.8060085165350175.png	{}	{}
5e087d19-4ec4-4b02-8f6e-611eff19e1a3	social_proof	Trusted by 500+ businesses worldwide	\N	\N	\N	\N	\N	\N	default	\N	t	2	{}	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00	\N	{https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.5486094243520065.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.5047397961950877.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.5515516367490317.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.7006376135194761.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.6843913001918743.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.3049871152833369.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.8939347567207169.jpg}	{https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.9124921821511134.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.2697778102682953.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.5761410416610566.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.6339856707446601.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.478368964185767.webp,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.14293040231703247.jpg,https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/public-assets/landing-sections/0.4447899230470006.jpg}
\.


--
-- TOC entry 5539 (class 0 OID 19305)
-- Dependencies: 346
-- Data for Name: landing_testimonials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.landing_testimonials (id, quote, author_name, author_role, author_company, author_avatar_url, rating, "position", is_visible, created_at, updated_at) FROM stdin;
389525d8-c552-44b9-bd7a-25a0d4f82acf	Replai transformed how we handle customer support. AI replies save our team 4 hours every day, and the shared inbox means nothing falls through the cracks.	Sarah Chen	Head of Customer Success	TechStart Solutions	\N	5	1	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
48bb50c8-399f-4a83-baeb-4fdb117afa57	We switched from 3 separate tools to just Replai. The automation builder alone paid for itself in the first week.	Marcus Johnson	CEO	GreenLeaf Commerce	\N	5	2	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
a1f3146e-b788-4b1e-aae2-91aea9713a11	The knowledge base feature is incredible. Our AI assistant actually answers questions accurately because it reads from our own product docs.	Priya Patel	Operations Manager	FastTrack Logistics	\N	5	3	t	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
\.


--
-- TOC entry 5542 (class 0 OID 19348)
-- Dependencies: 349
-- Data for Name: legal_pages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.legal_pages (id, slug, title, content_markdown, is_published, last_updated_at, created_at, updated_at) FROM stdin;
8a81b271-8972-4106-930d-f91013205e3b	privacy-policy	Privacy Policy	## 1. Introduction\n\nReplai (operated by **Junkies Coder**) respects your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our AI-powered WhatsApp CRM platform ("Service").\n\nBy using Replai, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of the Service.\n\n---\n\n## 2. Information We Collect\n\n### 2.1 Account Information\n- Full name and email address provided during registration\n- Password (stored using industry-standard hashing — never in plaintext)\n- Profile avatar (optional)\n- Organization/workspace name\n\n### 2.2 WhatsApp Business API Data\nWhen you connect your WhatsApp Business account, we process:\n- Messages sent and received through the platform\n- Contact information (phone numbers, names) imported or synced\n- Media files shared within conversations (images, documents, audio)\n- Message templates created and submitted for approval\n- Delivery and read receipts\n\n### 2.3 Usage and Analytics Data\n- Browser type, operating system, and device information\n- IP address and approximate location\n- Pages visited and features used within the platform\n- Session duration and interaction patterns\n\n### 2.4 Cookies and Tracking Technologies\nWe use essential cookies for authentication and session management. Please see our [Cookie Policy](/legal/cookie-policy) for full details.\n\n---\n\n## 3. How We Use Your Data\n\nWe use the collected data for the following purposes:\n\n- **Service Delivery** — To provide, operate, and maintain the Replai platform\n- **WhatsApp Messaging** — To send and receive messages on your behalf via the WhatsApp Business API\n- **AI Features** — To power AI-assisted replies, chatbots, and automation workflows\n- **Account Management** — To manage your workspace, team members, and permissions\n- **Customer Support** — To respond to inquiries, troubleshoot issues, and provide assistance\n- **Platform Improvement** — To analyze usage patterns and improve features\n- **Security** — To detect, prevent, and address fraud, abuse, and technical issues\n- **Legal Compliance** — To comply with applicable laws, regulations, and legal processes\n\n---\n\n## 4. Legal Basis for Processing (GDPR)\n\nIf you are located in the European Economic Area (EEA) or United Kingdom, we process your data under the following legal bases:\n\n| Legal Basis | Purpose |\n|---|---|\n| **Contractual necessity** | To provide the Service you signed up for |\n| **Legitimate interest** | Platform security, fraud prevention, and analytics |\n| **Consent** | Marketing communications and optional AI features |\n| **Legal obligation** | Compliance with tax, accounting, and regulatory requirements |\n\n---\n\n## 5. Data Sharing and Third Parties\n\nWe do **not** sell your personal data. We share data only with:\n\n- **Meta Platforms, Inc.** — As required to operate the WhatsApp Business API. Meta acts as a data processor for message delivery. Meta's own [Privacy Policy](https://www.whatsapp.com/legal/privacy-policy) governs their processing.\n- **Supabase** — Our database and authentication infrastructure provider\n- **Hosting Providers** — Cloud infrastructure services (e.g., Vercel) for platform hosting\n- **AI Service Providers** — For AI-powered features (data is processed in accordance with their data processing agreements)\n- **Legal Authorities** — When required by law, court order, or government regulation\n\n---\n\n## 6. Data Retention\n\n| Data Type | Retention Period |\n|---|---|\n| Account information | Duration of your account + 30 days after deletion |\n| WhatsApp messages | As configured by your workspace (default: 12 months) |\n| Contact data | Duration of your account |\n| Usage analytics | 24 months (anonymized after 6 months) |\n| Audit logs | 12 months |\n\nYou may request earlier deletion by contacting us at **privacy@junkiescoder.com**.\n\n---\n\n## 7. Data Security\n\nWe implement industry-standard security measures including:\n\n- End-to-end encryption for WhatsApp messages (provided by Meta)\n- TLS/SSL encryption for all data in transit\n- AES-256 encryption for data at rest\n- Role-based access controls and team permissions\n- Row-level security (RLS) at the database level\n- Regular security audits and vulnerability assessments\n- Secure password hashing using bcrypt\n\n---\n\n## 8. Your Rights\n\nDepending on your jurisdiction, you may have the following rights:\n\n- **Access** — Request a copy of your personal data\n- **Rectification** — Correct inaccurate or incomplete data\n- **Deletion** — Request deletion of your personal data ("right to be forgotten")\n- **Portability** — Receive your data in a portable format\n- **Restriction** — Restrict processing of your data\n- **Objection** — Object to processing based on legitimate interests\n- **Withdraw Consent** — Withdraw consent at any time without affecting prior processing\n\nTo exercise any of these rights, email us at **privacy@junkiescoder.com**. We will respond within 30 days.\n\n---\n\n## 9. International Data Transfers\n\nYour data may be transferred to and processed in countries outside your jurisdiction. When we transfer data internationally, we ensure appropriate safeguards are in place, including Standard Contractual Clauses (SCCs) approved by the European Commission.\n\n---\n\n## 10. Children's Privacy\n\nReplai is not intended for individuals under the age of 18. We do not knowingly collect personal data from children. If we discover that a child has provided us with personal data, we will delete it promptly.\n\n---\n\n## 11. Changes to This Policy\n\nWe may update this Privacy Policy from time to time. When we make material changes, we will notify you via email or through the platform. Your continued use of the Service after changes are posted constitutes acceptance of the revised policy.\n\n---\n\n## 12. Contact Us\n\nIf you have any questions about this Privacy Policy or our data practices, please contact us:\n\n- **Email:** privacy@junkiescoder.com\n- **Company:** Junkies Coder\n- **Website:** [https://junkiescoder.com](https://junkiescoder.com)	t	2026-07-29 11:35:45.319299+00	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
9e01e0a0-4206-440b-8bad-436e1bd93141	terms-of-service	Terms of Service	## 1. Acceptance of Terms\n\nBy accessing or using the Replai platform ("Service"), operated by **Junkies Coder**, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.\n\nThese Terms apply to all users of the Service, including workspace owners, team members, and administrators.\n\n---\n\n## 2. Description of Service\n\nReplai is an AI-powered WhatsApp CRM platform that enables businesses to:\n\n- Manage WhatsApp Business API conversations in a shared team inbox\n- Create and manage contacts, deals, and sales pipelines\n- Build and deploy automated messaging workflows\n- Use AI-assisted features for message drafting and customer engagement\n- Send broadcast messages using pre-approved templates\n- Manage team roles, permissions, and access controls\n\nThe Service integrates with Meta's WhatsApp Business Platform and is subject to Meta's own terms and policies.\n\n---\n\n## 3. Account Registration\n\n### 3.1 Eligibility\nYou must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself or the organization you represent.\n\n### 3.2 Account Security\n- You are responsible for maintaining the confidentiality of your login credentials\n- You must notify us immediately of any unauthorized use of your account\n- You are responsible for all activity that occurs under your account\n- We recommend enabling strong passwords and practicing good security hygiene\n\n### 3.3 Account Information\nYou agree to provide accurate, current, and complete information during registration and to keep this information updated.\n\n---\n\n## 4. WhatsApp Business API Compliance\n\nAs a user of Replai, you agree to comply with:\n\n- **Meta's WhatsApp Business Policy** — Including messaging limits, template guidelines, and prohibited content\n- **Meta's Commerce Policy** — For any commercial transactions conducted through WhatsApp\n- **24-Hour Messaging Window** — You may only send free-form messages within 24 hours of the last customer-initiated message. Outside this window, only pre-approved templates may be used.\n- **Opt-In Requirements** — You must obtain explicit, verifiable consent from customers before sending proactive messages\n- **AI Usage Policy (2026)** — AI features must be used for specific, purpose-driven tasks only. General-purpose AI chatbots are prohibited per Meta's updated policy.\n\nViolation of Meta's policies may result in your WhatsApp Business account being suspended or permanently banned by Meta, which is outside Replai's control.\n\n---\n\n## 5. Acceptable Use\n\nYou agree **not** to use the Service to:\n\n- Send unsolicited bulk messages (spam)\n- Distribute malware, phishing links, or harmful content\n- Impersonate other businesses, organizations, or individuals\n- Violate any applicable laws or regulations\n- Circumvent rate limits, messaging restrictions, or security measures\n- Harvest or scrape contact data without proper consent\n- Use AI features to generate misleading, deceptive, or illegal content\n- Share login credentials with unauthorized parties\n\nSee our full [Acceptable Use Policy](/legal/acceptable-use-policy) for details.\n\n---\n\n## 6. Intellectual Property\n\n### 6.1 Our Rights\nThe Service, including its design, code, features, and branding, is the property of Junkies Coder and is protected by intellectual property laws. You may not copy, modify, distribute, or reverse-engineer any part of the Service.\n\n### 6.2 Your Content\nYou retain ownership of all content you upload, create, or transmit through the Service (messages, contacts, templates, etc.). By using the Service, you grant us a limited license to host, store, and process this content solely for the purpose of providing the Service.\n\n---\n\n## 7. Payment and Billing\n\n- Pricing and billing terms are presented at the time of purchase or subscription\n- All fees are non-refundable unless otherwise stated or required by law\n- We reserve the right to modify pricing with 30 days' advance notice\n- Failure to pay may result in suspension or termination of your account\n\n---\n\n## 8. Service Availability\n\n- We strive to maintain 99.9% uptime but do not guarantee uninterrupted access\n- We may perform scheduled maintenance with reasonable advance notice\n- We are not liable for downtime caused by Meta's WhatsApp Business API, third-party services, or force majeure events\n\n---\n\n## 9. Termination\n\n### 9.1 By You\nYou may terminate your account at any time through the platform settings or by contacting support.\n\n### 9.2 By Us\nWe may suspend or terminate your account if you:\n- Violate these Terms or our Acceptable Use Policy\n- Engage in fraudulent or illegal activity\n- Fail to pay applicable fees\n- Receive repeated policy violations from Meta\n\nUpon termination, your data will be retained for 30 days to allow for export, after which it will be permanently deleted.\n\n---\n\n## 10. Limitation of Liability\n\nTo the maximum extent permitted by law:\n\n- Replai is provided "as is" and "as available" without warranties of any kind\n- We are not liable for any indirect, incidental, special, or consequential damages\n- Our total liability shall not exceed the amount you paid for the Service in the preceding 12 months\n- We are not responsible for actions taken by Meta regarding your WhatsApp Business account\n\n---\n\n## 11. Indemnification\n\nYou agree to indemnify and hold harmless Junkies Coder, its officers, employees, and affiliates from any claims, damages, or expenses arising from your use of the Service, violation of these Terms, or infringement of any third-party rights.\n\n---\n\n## 12. Governing Law\n\nThese Terms are governed by and construed in accordance with the laws of India. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts in India.\n\n---\n\n## 13. Changes to Terms\n\nWe reserve the right to modify these Terms at any time. Material changes will be communicated via email or through the platform at least 30 days before they take effect. Continued use of the Service after changes constitutes acceptance.\n\n---\n\n## 14. Contact Us\n\nFor questions about these Terms of Service:\n\n- **Email:** legal@junkiescoder.com\n- **Company:** Junkies Coder\n- **Website:** [https://junkiescoder.com](https://junkiescoder.com)	t	2026-07-29 11:36:20.511582+00	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
c3a59398-b41e-4626-ae87-603f52c4f385	cookie-policy	Cookie Policy	## 1. What Are Cookies?\n\nCookies are small text files stored on your device (computer, tablet, or mobile) when you visit a website. They help the website recognize your device and remember your preferences, login status, and other information.\n\nThis Cookie Policy explains how **Replai** (operated by Junkies Coder) uses cookies and similar technologies.\n\n---\n\n## 2. How We Use Cookies\n\nWe use cookies for the following purposes:\n\n### 2.1 Essential Cookies (Required)\nThese cookies are necessary for the platform to function and cannot be disabled.\n\n| Cookie Name | Purpose | Duration | Type |\n|---|---|---|---|\n| `sb-auth-token` | Supabase authentication session | Session | Essential |\n| `sb-refresh-token` | Session refresh token | 7 days | Essential |\n| `sb-access-token` | API access authentication | 1 hour | Essential |\n\n### 2.2 Functional Cookies\nThese cookies enhance your experience by remembering your preferences.\n\n| Cookie Name | Purpose | Duration | Type |\n|---|---|---|---|\n| `theme` | User theme preference (light/dark) | 1 year | Functional |\n| `locale` | User language preference | 1 year | Functional |\n| `sidebar-state` | Sidebar collapsed/expanded state | Session | Functional |\n\n### 2.3 Analytics Cookies\nWe may use analytics cookies to understand how users interact with the platform and to improve our Service. These cookies collect anonymized data.\n\n---\n\n## 3. Third-Party Cookies\n\nReplai does **not** use third-party advertising cookies. We do not serve ads on our platform.\n\nThe following third-party services may set cookies:\n\n- **Supabase** — Authentication and session management\n- **Vercel** — Platform hosting and performance analytics\n\nThese services have their own privacy policies governing their use of cookies.\n\n---\n\n## 4. Managing Cookies\n\nYou can manage cookies through your browser settings:\n\n- **Chrome:** Settings → Privacy and Security → Cookies\n- **Firefox:** Settings → Privacy & Security → Cookies and Site Data\n- **Safari:** Preferences → Privacy → Manage Website Data\n- **Edge:** Settings → Privacy, Search, and Services → Cookies\n\n> **Note:** Disabling essential cookies may prevent you from logging in or using core platform features.\n\n---\n\n## 5. Local Storage\n\nIn addition to cookies, we use browser Local Storage for:\n\n- Caching user preferences and UI state\n- Storing draft messages temporarily\n- Maintaining real-time notification state\n\nLocal Storage data is not sent to our servers with each request and remains on your device.\n\n---\n\n## 6. Changes to This Policy\n\nWe may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated date.\n\n---\n\n## 7. Contact Us\n\nFor questions about our use of cookies:\n\n- **Email:** privacy@junkiescoder.com\n- **Company:** Junkies Coder\n- **Website:** [https://junkiescoder.com](https://junkiescoder.com)	t	2026-07-29 11:36:39.76444+00	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
71f58052-0a26-4e98-ae0a-4716d3d98eb5	data-processing-agreement	Data Processing Agreement	## 1. Introduction\n\nThis Data Processing Agreement ("DPA") forms part of the [Terms of Service](/legal/terms-of-service) between **Junkies Coder** ("Processor", "we", "us") and you ("Controller", "Customer") for the use of the Replai platform ("Service").\n\nThis DPA governs the processing of personal data by Replai on behalf of the Customer in accordance with applicable data protection laws, including the General Data Protection Regulation (EU) 2016/679 ("GDPR"), the UK GDPR, and India's Digital Personal Data Protection Act, 2023 ("DPDPA").\n\n---\n\n## 2. Definitions\n\n- **Personal Data** — Any information relating to an identified or identifiable individual, as defined by applicable data protection law\n- **Controller** — The Customer who determines the purposes and means of processing personal data (you)\n- **Processor** — Junkies Coder / Replai, which processes personal data on behalf of the Controller\n- **Sub-processor** — A third party engaged by the Processor to process personal data\n- **Data Subject** — An identified or identifiable individual whose personal data is processed\n\n---\n\n## 3. Scope of Processing\n\n### 3.1 Nature and Purpose\nWe process personal data solely to provide the Replai Service, including:\n\n- Facilitating WhatsApp Business API messaging\n- Storing and managing contacts, conversations, and message history\n- Powering AI-assisted features and automation workflows\n- Providing team collaboration and CRM features\n- Generating analytics and reporting\n\n### 3.2 Types of Personal Data\n- Contact information (names, phone numbers, email addresses)\n- WhatsApp message content and metadata\n- Customer interaction history and preferences\n- Account and team member information\n\n### 3.3 Categories of Data Subjects\n- End users / customers of the Controller (WhatsApp contacts)\n- Team members and employees of the Controller\n\n### 3.4 Duration\nProcessing continues for the duration of the service agreement. Upon termination, data will be deleted within 30 days unless retention is required by law.\n\n---\n\n## 4. Obligations of the Processor\n\nWe shall:\n\n- Process personal data only on documented instructions from the Controller\n- Ensure that personnel authorized to process personal data are bound by confidentiality obligations\n- Implement appropriate technical and organizational security measures\n- Assist the Controller in fulfilling data subject rights requests\n- Assist the Controller with data protection impact assessments where required\n- Delete or return all personal data upon termination of the agreement\n- Make available all information necessary to demonstrate compliance\n- Allow for and contribute to audits conducted by the Controller or an authorized auditor\n\n---\n\n## 5. Sub-processors\n\nThe Controller provides general authorization for the Processor to engage sub-processors. Current sub-processors include:\n\n| Sub-processor | Purpose | Location |\n|---|---|---|\n| **Meta Platforms, Inc.** | WhatsApp Business API messaging | United States / Global |\n| **Supabase, Inc.** | Database, authentication, and storage | United States (AWS) |\n| **Vercel, Inc.** | Application hosting and edge delivery | United States / Global |\n| **OpenAI / AI Provider** | AI-powered features (message drafting, automation) | United States |\n\nWe will notify the Controller of any intended changes to sub-processors at least 30 days in advance, providing the Controller the opportunity to object.\n\n---\n\n## 6. Security Measures\n\nWe implement and maintain the following technical and organizational measures:\n\n### Technical Measures\n- TLS/SSL encryption for data in transit\n- AES-256 encryption for data at rest\n- End-to-end encryption for WhatsApp messages (provided by Meta)\n- Row-level security (RLS) ensuring strict data isolation between tenants\n- Automated backups with point-in-time recovery\n- Vulnerability scanning and dependency monitoring\n\n### Organizational Measures\n- Access limited to authorized personnel on a need-to-know basis\n- Role-based access controls with granular permissions\n- Regular security training for team members\n- Incident response procedures and breach notification protocols\n- Secure development practices including code review\n\n---\n\n## 7. Data Subject Rights\n\nWe will assist the Controller in responding to requests from data subjects exercising their rights under applicable law, including:\n\n- Right of access\n- Right to rectification\n- Right to erasure ("right to be forgotten")\n- Right to data portability\n- Right to restriction of processing\n- Right to object to processing\n\nWe will promptly notify the Controller of any data subject request received directly and will not respond independently unless authorized.\n\n---\n\n## 8. Data Breach Notification\n\nIn the event of a personal data breach, we will:\n\n- Notify the Controller without undue delay and no later than **72 hours** after becoming aware of the breach\n- Provide sufficient information for the Controller to meet its own notification obligations\n- Cooperate with the Controller to investigate, mitigate, and remediate the breach\n- Document all breaches including facts, effects, and remedial actions taken\n\n---\n\n## 9. International Data Transfers\n\nWhere personal data is transferred outside the EEA/UK, we ensure appropriate safeguards are in place, including:\n\n- **Standard Contractual Clauses (SCCs)** approved by the European Commission\n- **EU-U.S. Data Privacy Framework** certification (where applicable)\n- Adequacy decisions recognized by relevant data protection authorities\n\n---\n\n## 10. Audit Rights\n\nThe Controller has the right to audit our compliance with this DPA. Audits may be conducted:\n\n- No more than once per calendar year (unless a data breach has occurred)\n- With at least 30 days' written notice\n- During normal business hours\n- Subject to reasonable confidentiality obligations\n\n---\n\n## 11. Term and Termination\n\nThis DPA is effective as long as the Processor processes personal data on behalf of the Controller. Upon termination of the Service:\n\n- All personal data will be deleted within 30 days\n- The Controller may request a data export prior to deletion\n- Certain data may be retained if required by applicable law\n\n---\n\n## 12. Contact\n\nFor DPA-related inquiries:\n\n- **Email:** privacy@junkiescoder.com\n- **Company:** Junkies Coder\n- **Website:** [https://junkiescoder.com](https://junkiescoder.com)	t	2026-07-29 11:37:16.145574+00	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
88aadd5e-1986-421b-bf08-d9994cf65434	acceptable-use-policy	Acceptable Use Policy	## 1. Purpose\n\nThis Acceptable Use Policy ("AUP") defines the rules and standards for using the Replai platform ("Service"), operated by **Junkies Coder**. By using Replai, you agree to comply with this policy.\n\nThis AUP is designed to protect our users, their customers, and the integrity of the WhatsApp Business ecosystem. Violations may result in account suspension or permanent termination.\n\n---\n\n## 2. Prohibited Activities\n\nYou must **not** use Replai to:\n\n### 2.1 Spam and Unsolicited Messaging\n- Send unsolicited bulk messages (spam) to contacts who have not opted in\n- Send messages to purchased, scraped, or harvested contact lists\n- Send messages without obtaining explicit, verifiable consent from recipients\n- Use deceptive tactics to obtain consent (e.g., pre-checked boxes, hidden clauses)\n\n### 2.2 Harmful or Illegal Content\n- Distribute malware, viruses, or ransomware\n- Send phishing messages or links designed to steal personal information\n- Share content that promotes violence, hatred, discrimination, or terrorism\n- Distribute pornographic, obscene, or sexually explicit material\n- Promote illegal activities, substances, or services\n\n### 2.3 Fraud and Impersonation\n- Impersonate other businesses, organizations, or individuals\n- Send misleading or deceptive messages\n- Conduct fraudulent schemes, scams, or pyramid schemes\n- Misrepresent your identity or the purpose of your communications\n\n### 2.4 Platform Abuse\n- Attempt to circumvent rate limits, messaging restrictions, or security measures\n- Reverse-engineer, decompile, or extract source code from the Service\n- Use automated tools to abuse the platform (bots, scrapers, etc.)\n- Share login credentials with unauthorized parties\n- Create multiple accounts to evade enforcement actions\n\n---\n\n## 3. WhatsApp Business API Compliance\n\nYou must comply with Meta's WhatsApp Business policies at all times:\n\n- **24-Hour Rule** — Send free-form messages only within 24 hours of the last customer-initiated message. Outside this window, use approved message templates only.\n- **Template Guidelines** — Message templates must be accurate, non-deceptive, and comply with Meta's template review criteria.\n- **Opt-In/Opt-Out** — Always honor opt-out requests promptly. Provide clear instructions for customers to unsubscribe.\n- **Quality Rating** — Maintain a healthy quality rating by sending relevant, valuable messages and minimizing customer blocks and reports.\n\n---\n\n## 4. AI Usage Guidelines\n\nIf you use Replai's AI-powered features:\n\n- AI must be used for **specific, task-driven purposes** only (e.g., customer support, order tracking, lead qualification)\n- **General-purpose AI chatbots** (open-ended "ask-me-anything" bots) are prohibited per Meta's 2026 policy update\n- You must review all AI-generated replies before sending to ensure accuracy and appropriateness\n- Do not rely solely on AI for sensitive communications (medical, legal, financial advice)\n- Keep your knowledge base content accurate, up-to-date, and relevant\n- You are responsible for all messages sent through the platform, including AI-generated ones\n\n---\n\n## 5. Data Protection\n\nYou must:\n\n- Comply with all applicable data protection laws (GDPR, CCPA, DPDPA, etc.)\n- Obtain proper consent before collecting and processing personal data\n- Honor data subject requests (access, deletion, portability) in a timely manner\n- Implement appropriate security measures for any data you manage through the platform\n- Not use the platform to process special categories of personal data (health, biometric, etc.) without appropriate legal basis\n\n---\n\n## 6. Enforcement\n\nViolations of this Acceptable Use Policy may result in:\n\n- **Warning** — First-time minor violations may receive a written warning\n- **Temporary Suspension** — Repeated or moderate violations may result in temporary account suspension\n- **Permanent Ban** — Serious or repeated violations will result in permanent account termination\n- **Legal Action** — We reserve the right to pursue legal action for violations that cause harm to Junkies Coder, its users, or third parties\n\nWe will make reasonable efforts to notify you of violations before taking enforcement action, except where immediate action is necessary to protect the platform or its users.\n\n---\n\n## 7. Reporting Violations\n\nIf you become aware of any violation of this AUP, please report it to:\n\n- **Email:** abuse@junkiescoder.com\n- **Company:** Junkies Coder\n\nWe take all reports seriously and will investigate promptly.\n\n---\n\n## 8. Changes to This Policy\n\nWe may update this AUP from time to time. Material changes will be communicated via email or through the platform. Continued use of the Service after changes constitutes acceptance.\n\n---\n\n## 9. Contact Us\n\nFor questions about this Acceptable Use Policy:\n\n- **Email:** abuse@junkiescoder.com\n- **Company:** Junkies Coder\n- **Website:** [https://junkiescoder.com](https://junkiescoder.com)	t	2026-07-29 11:37:48.677621+00	2026-07-29 08:31:32.416843+00	2026-07-29 08:31:32.416843+00
\.


--
-- TOC entry 5527 (class 0 OID 18443)
-- Dependencies: 334
-- Data for Name: member_presence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_presence (user_id, account_id, status, custom_status, last_seen_at, updated_at) FROM stdin;
e20d391e-7272-48b6-aa16-e5eeb4011939	8f6aa43c-0b0b-4c1c-b8c9-2a85213be21c	away	\N	2026-07-29 12:07:56.970418+00	2026-07-29 12:07:56.970418+00
2b7a9798-3044-440f-80be-68952f57d708	3430edae-763b-4aac-9b82-1c2364936d79	away	\N	2026-08-05 13:11:57.591252+00	2026-08-05 13:11:57.591252+00
3dbf0236-b75e-4805-a8c9-405fdfd259a5	eb378216-3e5b-4acd-874b-978cf65bd0d3	away	\N	2026-08-05 10:30:42.969457+00	2026-08-05 10:30:42.969457+00
fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	3430edae-763b-4aac-9b82-1c2364936d79	away	\N	2026-07-27 14:08:37.447131+00	2026-07-27 14:08:37.447131+00
d29cff75-25aa-4a5d-82cf-8d8923e0abdb	1ff3bc55-f5a7-4f5e-a7c9-857aec91a655	away	\N	2026-07-29 11:24:06.524887+00	2026-07-29 11:24:06.524887+00
\.


--
-- TOC entry 5520 (class 0 OID 18004)
-- Dependencies: 327
-- Data for Name: message_reactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.message_reactions (id, message_id, conversation_id, actor_type, actor_id, emoji, created_at) FROM stdin;
\.


--
-- TOC entry 5510 (class 0 OID 17692)
-- Dependencies: 317
-- Data for Name: message_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.message_templates (id, user_id, name, category, language, header_type, header_content, body_text, footer_text, buttons, status, created_at, updated_at, sample_values, meta_template_id, rejection_reason, quality_score, header_handle, header_media_url, submission_error, last_submitted_at, account_id) FROM stdin;
d1c85b45-ec28-4c53-a94d-6af38250f3ca	3dbf0236-b75e-4805-a8c9-405fdfd259a5	jaspers_market_plain_text_v1	Marketing	en_US	\N	\N	Welcome to Jasper’s Market, your local grocery store providing farm-fresh produce and high-quality goods!	\N	\N	APPROVED	2026-08-04 12:55:31.356394+00	2026-08-04 13:06:37.856419+00	\N	1637584651098232	\N	\N	\N	\N	\N	\N	eb378216-3e5b-4acd-874b-978cf65bd0d3
fc3d37da-fe6d-46fc-852b-9bda336e3a75	2b7a9798-3044-440f-80be-68952f57d708	hello_world	Utility	en_US	text	Hello World	Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.	WhatsApp Business Platform sample message	\N	APPROVED	2026-07-25 12:58:01.435109+00	2026-07-25 13:00:17.087976+00	\N	1664357338003346	\N	\N	\N	\N	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
c28f9842-caf9-42a1-b9e8-37b3f35c5bb8	2b7a9798-3044-440f-80be-68952f57d708	jaspers_market_media_carousel_v1	Marketing	en_US	\N	\N	Our in-house chefs have prepared some delicious and fresh summer recipes.	\N	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Get free delivery", "type": "URL"}]	APPROVED	2026-07-25 12:58:01.511472+00	2026-07-25 13:00:17.169796+00	\N	1585703979938678	\N	\N	\N	\N	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
f3cdba5c-f762-4e0d-a1f5-35476c655349	2b7a9798-3044-440f-80be-68952f57d708	jaspers_market_plain_text_v1	Marketing	en_US	\N	\N	Welcome to Jasper’s Market, your local grocery store providing farm-fresh produce and high-quality goods!	\N	\N	APPROVED	2026-07-25 12:58:01.604392+00	2026-07-25 13:00:17.244429+00	\N	1562595288736164	\N	\N	\N	\N	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
32ee3357-4645-4af2-88d9-89814d5949c7	2b7a9798-3044-440f-80be-68952f57d708	jaspers_market_order_confirmation_v1	Utility	en_US	text	Order confirmed	Hi {{1}},\n\nThank you for your purchase! Your order number is {{2}}.\n\nWe'll start getting your farm fresh groceries ready to ship.\n\nEstimated delivery:  {{3}}.\n\nWe will let you know when your order ships.	developers.facebook.com	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Visit order details", "type": "URL"}]	APPROVED	2026-07-25 12:58:01.691456+00	2026-07-25 13:00:17.349106+00	\N	1398488742132394	\N	\N	\N	\N	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
03cce0d4-340c-41bb-b4ca-9f4c1e69f00f	2b7a9798-3044-440f-80be-68952f57d708	jaspers_market_image_cta_v1	Marketing	en_US	image	\N	Free delivery for all online orders with Jasper's Market	developers.facebook.com	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Get free delivery", "type": "URL"}]	APPROVED	2026-07-25 12:58:01.341522+00	2026-07-25 13:07:49.943944+00	\N	1767274157604302	\N	\N	\N	https://raw.githubusercontent.com/fbsamples/whatsapp-node-api-sample-app/master/public/image.png	\N	\N	3430edae-763b-4aac-9b82-1c2364936d79
e41be8fa-b399-48f8-a1e6-1ec5ac8341d8	3dbf0236-b75e-4805-a8c9-405fdfd259a5	order_confirmation_demo	Marketing	en_US	\N	\N	Hi {{1}}, your order #{{2}} has been confirmed and is being prepared. Thank you for shopping with us!	\N	\N	PENDING	2026-08-04 12:52:20.928796+00	2026-08-04 12:52:29.899699+00	{"body": ["test1", "test2"]}	885850750874967	\N	\N	\N	\N	\N	2026-08-04 12:52:20.772+00	eb378216-3e5b-4acd-874b-978cf65bd0d3
9751520f-1437-4d35-92ec-0547d0a1dd85	3dbf0236-b75e-4805-a8c9-405fdfd259a5	jaspers_market_image_cta_v1	Marketing	en_US	image	\N	Free delivery for all online orders with Jasper's Market	developers.facebook.com	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Get free delivery", "type": "URL"}]	APPROVED	2026-08-04 12:55:30.000359+00	2026-08-04 13:06:38.337025+00	\N	1540590514435117	\N	\N	\N	\N	\N	\N	eb378216-3e5b-4acd-874b-978cf65bd0d3
e86a14c0-a6d8-4a83-b083-085a135fa101	3dbf0236-b75e-4805-a8c9-405fdfd259a5	jaspers_market_media_carousel_v1	Marketing	en_US	\N	\N	Our in-house chefs have prepared some delicious and fresh summer recipes.	\N	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Get free delivery", "type": "URL"}]	APPROVED	2026-08-04 12:55:30.915363+00	2026-08-04 13:06:38.783353+00	\N	1530402002157245	\N	\N	\N	\N	\N	\N	eb378216-3e5b-4acd-874b-978cf65bd0d3
96fe306f-b2c9-451b-9438-00b13b64170f	3dbf0236-b75e-4805-a8c9-405fdfd259a5	hello_world	Utility	en_US	text	Hello World	Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.	WhatsApp Business Platform sample message	\N	APPROVED	2026-08-04 12:55:30.478451+00	2026-08-04 13:06:39.446872+00	\N	1040182091935585	\N	\N	\N	\N	\N	\N	eb378216-3e5b-4acd-874b-978cf65bd0d3
4c18ce90-0f4b-4810-8b5d-d47c37a0e982	3dbf0236-b75e-4805-a8c9-405fdfd259a5	jaspers_market_order_confirmation_v1	Utility	en_US	text	Order confirmed	Hi {{1}},\n\nThank you for your purchase! Your order number is {{2}}.\n\nWe'll start getting your farm fresh groceries ready to ship.\n\nEstimated delivery:  {{3}}.\n\nWe will let you know when your order ships.	developers.facebook.com	[{"url": "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates", "text": "Visit order details", "type": "URL"}]	APPROVED	2026-08-04 12:55:31.818845+00	2026-08-04 13:06:40.044398+00	\N	818447678021115	\N	\N	\N	\N	\N	\N	eb378216-3e5b-4acd-874b-978cf65bd0d3
\.


--
-- TOC entry 5508 (class 0 OID 17649)
-- Dependencies: 315
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, conversation_id, sender_type, sender_id, content_type, content_text, media_url, template_name, message_id, status, created_at, reply_to_message_id, interactive_reply_id, ai_generated, interactive_payload) FROM stdin;
de0b77f5-eadd-4d02-9c35-b4a63f50c67f	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	My good name is Souaib Ansari did you understand?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM2RTE4QUYwNzg4Mjg4Njg4OEVCOUMwQ0NBMTMwNjcA	delivered	2026-08-03 08:15:06+00	\N	\N	f	\N
4c05b3ca-afd5-4c5f-a395-a9297b8ac184	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNDNkI4NDU0QTI0QUYwMjIwQUQ1NDU1RkNDOTgyQTIA	delivered	2026-08-04 08:06:07+00	\N	\N	f	\N
f4f8831b-ac7b-4804-80b7-a0e0de4fa61c	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	I understand, Souaib Ansari. It is a pleasure to assist you. To proceed, could you please provide your email address and the name of your company?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSRUZBNjc2MkI2OEQ1OTI4NjY5AA==	read	2026-08-03 08:15:10.602406+00	\N	\N	f	\N
b5198d6a-1829-4383-bb25-7a016c275127	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	My working email is ansarisoyab908@gmail.com did you understand?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM2MkU2REJBQ0YyNzlGQUU0RUQwRjUxQjI1NzgwRTEA	delivered	2026-08-03 08:15:15+00	\N	\N	f	\N
cae71fda-7985-41c1-b28f-915adcd1f98b	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUMyMDI2MTIwMkI4MTJEOUM5MUExNUIxQkM3OTEwQTQA	delivered	2026-08-03 08:14:43+00	\N	\N	f	\N
14211add-edf3-4a10-8939-f2b319c6df6f	2a030957-3f05-4ebf-bea7-f51fa05f8262	agent	\N	text	hii	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAERgSODVEMTVFNzIyMTUxQzcyRTc3AA==	read	2026-07-27 11:52:22.869057+00	\N	\N	f	\N
5028869e-6395-4724-a96d-d1a5f91cfd62	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	Hi, I'm Alexa, your AI assistant. To help me get you to the right agent, could you please provide your name, email, and company name?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSOTI0N0ExN0Y5NkZBRkQzMzAyAA==	read	2026-08-03 08:14:47.372973+00	\N	\N	f	\N
2fc76782-2eee-47eb-a4e3-2a955f72156b	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hello	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0ExMzQ4NzkyMUVBMEJGQjhEQUUA	delivered	2026-07-27 11:52:44+00	\N	\N	f	\N
35e302db-3e94-4b4f-8e48-10f2139e7064	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	How are you	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0E4RUQ2MjU4QjhFQzI4RTk1NDkA	delivered	2026-07-27 11:52:48+00	\N	\N	f	\N
9af22ec7-f0e5-4725-989f-269f4897e8ab	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	I have noted your email address, Souaib. To complete your request, could you please provide the name of the company you represent?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNEU4RkIwQjY3NDFDRkJBQzkxAA==	read	2026-08-03 08:15:18.976508+00	\N	\N	f	\N
fcc43837-d5c2-4d5b-84cc-70c956288c43	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0E4QjU1NUM1NTU3OEIzM0Y2MDIA	delivered	2026-07-27 11:19:17+00	\N	\N	f	\N
41e2ec57-9b6a-4cb5-b024-943ddea7e329	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	Junkies Coder is what I named my company	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFRDRBNUYxRDRERjY3MzA4MUZFREUzNTlFNEU4RkUA	delivered	2026-08-03 08:15:40+00	\N	\N	f	\N
2205c570-43aa-42cd-a2f3-29aa6a3c57e1	2a030957-3f05-4ebf-bea7-f51fa05f8262	agent	\N	text	hi	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAERgSREJEQzkzMDgwQ0Y4QkRDQkZCAA==	read	2026-07-27 11:53:38.441508+00	\N	\N	f	\N
cee4be34-7d8f-45bd-9fea-1d5dde275f7d	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0EzQkRDQjgxRTVCMUZCNEJGRDcA	delivered	2026-07-27 11:57:16+00	\N	\N	f	\N
8eca3d6d-a080-406d-aa40-879177fa7274	2a030957-3f05-4ebf-bea7-f51fa05f8262	agent	\N	image	\N	https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/chat-media/account-3430edae-763b-4aac-9b82-1c2364936d79/1785153176664-17299590868225mmkskns.png	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAERgSRDY3NkYzMUJBMTk0QUY0RjdDAA==	read	2026-07-27 11:53:02.603905+00	\N	\N	f	\N
33f95f74-344b-4cf5-b155-ccf6b703f152	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hello	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0FFRkMxOEExODlEQ0QwMTY5MzgA	delivered	2026-07-27 11:53:29+00	\N	\N	f	\N
633acba0-d8e3-47fc-8dbd-e533d90a3a92	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	image	\N	/api/whatsapp/media/1353155233699544	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0FBQzA3NzRDRENBN0NGNDk4NzEA	delivered	2026-07-27 11:54:09+00	\N	\N	f	\N
94772552-136e-4563-835a-d1013e4a33ce	2a030957-3f05-4ebf-bea7-f51fa05f8262	agent	\N	image	\N	https://dknolotutfiesuhbhmze.supabase.co/storage/v1/object/public/chat-media/account-3430edae-763b-4aac-9b82-1c2364936d79/1785153221466-1729959470847z8c190n6.png	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAERgSODgwMEZCRTJFRDE2N0QzNkIzAA==	read	2026-07-27 11:53:45.442275+00	\N	\N	f	\N
c8b5f6ab-52f0-409e-805f-09d6ac5abffd	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0EzQkU5MDk2OTE1RTlBMEY4NEEA	delivered	2026-07-27 11:54:36+00	\N	\N	f	\N
01efd58f-fa6c-430a-9117-090b87f9e401	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Hello	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0E4NkEzODU5Mjc1NTZFMkE5OTQA	delivered	2026-07-27 11:54:57+00	\N	\N	f	\N
2d63ce20-6321-40a1-ae0a-fc3b1bdc83c7	2a030957-3f05-4ebf-bea7-f51fa05f8262	customer	\N	text	Handle	\N	\N	wamid.HBgMOTE5NjI0NTgyMDM2FQIAEhgUM0FBOUM4RTA0NDExQjBBRTk2MEEA	delivered	2026-07-27 11:58:38+00	\N	\N	f	\N
633110e7-ccf9-4b36-9e5a-b2cae4b85c48	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	Thank you, Souaib. I have successfully gathered all the necessary information.	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMjk2MTkxRUE5RUE4MDI1MTQwAA==	read	2026-08-03 08:15:48.532019+00	\N	\N	f	\N
9d5a324a-7088-434b-82e2-037c1506d2ff	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	Ok now what?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNFNkJENkEwNzlBNEQyMUJCNDExNkJCMjQ0NTJFRjEA	delivered	2026-08-03 08:16:04+00	\N	\N	f	\N
b47c03e9-dc2c-4695-b5a6-5973fbde7a7a	91da856a-a921-4e55-97aa-b753014b7e99	customer	\N	text	Hi	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUM5NTlENDhENkM5MEM3RTlFNUM4RUJGRTQxMjFBOTAA	delivered	2026-08-04 13:15:15+00	\N	\N	f	\N
5df54aee-9204-4a02-92c0-4f762ae8578b	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	How may I assist you today? Please let me know how I can help with your Amazon account or any inquiries you have.	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSOTlBMUJEQzFGOTVBNjVDNjRDAA==	read	2026-08-03 08:16:08.912645+00	\N	\N	t	\N
4c000ef9-d6a1-48f7-8ed9-a15d622f611c	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	Hello again, Souaib. How can I assist you with your Amazon inquiries today?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQ0NBQTY5N0UxNzg5MjM0RjRCAA==	read	2026-08-04 08:06:19.523458+00	\N	\N	t	\N
63a43928-b63f-43a4-92a1-be647212accd	223671d9-9d0c-4e10-a42d-afcb766c197b	customer	\N	text	Who are you?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAEhggQUNEOEM4MjNFNTcxRDc4NDJGQTYzRDU3Q0I1RTk5QTcA	delivered	2026-08-04 11:02:56+00	\N	\N	f	\N
c87ff3f6-5e9c-4569-ab6b-4d6963697588	223671d9-9d0c-4e10-a42d-afcb766c197b	bot	\N	text	I am Alexa, your professional customer service assistant for Amazon. How can I help you today?	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSNDIyMDYyQTFDMzRFRTMyQzg5AA==	read	2026-08-04 11:03:06.753556+00	\N	\N	t	\N
3b00aeab-059a-4c69-b5eb-dbf8ace4e6a5	91da856a-a921-4e55-97aa-b753014b7e99	agent	\N	text	hi i am	\N	\N	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSMzcxQjA4OUQ4OTJERThEREQ4AA==	read	2026-08-04 13:15:32.570963+00	\N	\N	f	\N
52f5e9a1-9928-4028-af67-4fca044fa528	91da856a-a921-4e55-97aa-b753014b7e99	agent	\N	template	\N	\N	hello_world	wamid.HBgMOTE2MzU5NDYzOTg3FQIAERgSQTYyQkY5QzU3RjA5QTNFMkNFAA==	read	2026-08-04 13:14:39.888565+00	\N	\N	f	\N
\.


--
-- TOC entry 5529 (class 0 OID 18500)
-- Dependencies: 336
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, account_id, user_id, type, conversation_id, contact_id, actor_user_id, title, body, read_at, created_at) FROM stdin;
\.


--
-- TOC entry 5512 (class 0 OID 17729)
-- Dependencies: 319
-- Data for Name: pipeline_stages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pipeline_stages (id, pipeline_id, name, "position", color, created_at) FROM stdin;
fc941877-8a00-4f9a-aab0-3a48b0a06fc3	4e478737-781d-4008-b32f-f464d6838f6e	New Lead	0	#3b82f6	2026-07-25 13:12:12.530098+00
515e3745-69d2-4dad-a6ca-c64bb37828e9	4e478737-781d-4008-b32f-f464d6838f6e	Qualified	1	#eab308	2026-07-25 13:12:12.530098+00
e4df6b9c-3ec4-472f-aa18-b2d1fc7368c9	4e478737-781d-4008-b32f-f464d6838f6e	Proposal Sent	2	#f97316	2026-07-25 13:12:12.530098+00
dc15dc7a-7da8-412e-8e9e-c68c8dc10c06	4e478737-781d-4008-b32f-f464d6838f6e	Negotiation	3	#8b5cf6	2026-07-25 13:12:12.530098+00
69091d39-ddcb-4192-9e89-8c6885eef4e7	4e478737-781d-4008-b32f-f464d6838f6e	Won	4	#22c55e	2026-07-25 13:12:12.530098+00
88f41199-a679-4b51-adac-a1cb71d355d7	416002c9-8a1d-4750-8b47-413a8a92a1b1	New Lead	0	#3b82f6	2026-07-25 13:12:27.880649+00
8cc28153-b0ac-4f1d-8f3c-16712b33ef86	416002c9-8a1d-4750-8b47-413a8a92a1b1	Qualified	1	#eab308	2026-07-25 13:12:27.880649+00
76d7c703-7d82-4f7f-95c6-e88c04061d22	416002c9-8a1d-4750-8b47-413a8a92a1b1	Proposal Sent	2	#f97316	2026-07-25 13:12:27.880649+00
d8b50631-25d7-487f-a638-55bb9cf18290	416002c9-8a1d-4750-8b47-413a8a92a1b1	Negotiation	3	#8b5cf6	2026-07-25 13:12:27.880649+00
3c8eeffc-3a3b-4f2d-8c2c-49dde27362e4	416002c9-8a1d-4750-8b47-413a8a92a1b1	Won	4	#22c55e	2026-07-25 13:12:27.880649+00
7ea85732-e0a6-460f-9385-7e6816bb4168	a52a27b8-713c-4228-97bc-ac32a3f8ee3c	New Lead	0	#3b82f6	2026-08-04 12:08:06.136711+00
af368e55-4ac2-4107-a334-ea03a163eb78	a52a27b8-713c-4228-97bc-ac32a3f8ee3c	Qualified	1	#eab308	2026-08-04 12:08:06.136711+00
cac37165-ec9a-4849-b8da-8f48b74fe8d3	a52a27b8-713c-4228-97bc-ac32a3f8ee3c	Proposal Sent	2	#f97316	2026-08-04 12:08:06.136711+00
6e3d0717-03ef-4df8-91f5-81f59e842a7f	a52a27b8-713c-4228-97bc-ac32a3f8ee3c	Negotiation	3	#8b5cf6	2026-08-04 12:08:06.136711+00
8fa07b29-48fe-48ec-a8a5-18a170af0cb8	a52a27b8-713c-4228-97bc-ac32a3f8ee3c	Won	4	#22c55e	2026-08-04 12:08:06.136711+00
\.


--
-- TOC entry 5511 (class 0 OID 17714)
-- Dependencies: 318
-- Data for Name: pipelines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pipelines (id, user_id, name, created_at, account_id) FROM stdin;
4e478737-781d-4008-b32f-f464d6838f6e	2b7a9798-3044-440f-80be-68952f57d708	Sales Pipeline	2026-07-25 13:12:12.454591+00	3430edae-763b-4aac-9b82-1c2364936d79
416002c9-8a1d-4750-8b47-413a8a92a1b1	2b7a9798-3044-440f-80be-68952f57d708	Enterprise Sales	2026-07-25 13:12:27.830461+00	3430edae-763b-4aac-9b82-1c2364936d79
a52a27b8-713c-4228-97bc-ac32a3f8ee3c	3dbf0236-b75e-4805-a8c9-405fdfd259a5	Sales Pipeline	2026-08-04 12:08:05.87587+00	eb378216-3e5b-4acd-874b-978cf65bd0d3
\.


--
-- TOC entry 5500 (class 0 OID 17488)
-- Dependencies: 307
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, user_id, full_name, email, avatar_url, role, created_at, updated_at, beta_features, account_id, account_role, permissions, is_active, is_super_admin) FROM stdin;
3b1bd577-0238-496a-94d6-30f54a183503	3dbf0236-b75e-4805-a8c9-405fdfd259a5	Souaib Ansari	ansarisoyab908@gmail.com	\N	user	2026-08-04 08:07:48.747558+00	2026-08-04 08:07:48.747558+00	{}	eb378216-3e5b-4acd-874b-978cf65bd0d3	owner	\N	t	f
9a3a4a25-5f83-4c4e-9393-93474209bb64	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	Junkies Coder	junkiescoder@gmail.com	\N	user	2026-07-29 11:19:17.863964+00	2026-07-29 11:23:16.874382+00	{}	1ff3bc55-f5a7-4f5e-a7c9-857aec91a655	owner	\N	t	t
0ee06d42-a771-4d49-aa42-161fb22e7486	2b7a9798-3044-440f-80be-68952f57d708	Souaib Ansari	souaib@junkiescoder.com	\N	user	2026-07-25 11:46:49.249028+00	2026-07-29 11:23:31.255956+00	{}	3430edae-763b-4aac-9b82-1c2364936d79	owner	\N	t	f
8dd106b5-5f7f-4cf4-a796-39f93c9063fc	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	Junkies Coder	ansarisoyab635@gmail.com	\N	user	2026-07-25 11:58:32.6508+00	2026-07-29 11:23:31.255956+00	{}	3430edae-763b-4aac-9b82-1c2364936d79	member	{"inbox": true, "contacts": true, "settings": true, "dashboard": true, "pipelines": true, "broadcasts": true, "automations": true, "settings_api": false, "settings_deals": true, "settings_fields": true, "settings_members": true, "settings_whatsapp": false, "settings_templates": true, "settings_quick_replies": true}	t	f
f465a900-fa3c-47f4-b9b8-433f2f7675d5	e20d391e-7272-48b6-aa16-e5eeb4011939	Gun Man	gunmandev@gmail.com	\N	user	2026-07-28 13:27:51.859667+00	2026-07-29 11:23:31.255956+00	{}	8f6aa43c-0b0b-4c1c-b8c9-2a85213be21c	owner	\N	t	f
\.


--
-- TOC entry 5535 (class 0 OID 19036)
-- Dependencies: 342
-- Data for Name: quick_replies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.quick_replies (id, account_id, user_id, title, kind, content_text, interactive_payload, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5536 (class 0 OID 19252)
-- Dependencies: 343
-- Data for Name: site_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_settings (id, site_name, tagline, site_description, logo_url, favicon_url, meta_title, meta_description, og_image_url, canonical_url, social_twitter, social_linkedin, social_github, social_instagram, social_youtube, support_email, sales_email, privacy_email, legal_email, copyright_text, show_social_icons, show_newsletter, created_at, updated_at, no_index, json_ld_schema, header_links, footer_links, contact_notification_email) FROM stdin;
3452cef5-b4fd-4277-9614-4ee6ef3f83a0	Replai	AI-Powered WhatsApp CRM	As an official Meta Business Partner, we deliver secure, reliable, and enterprise-grade WhatsApp solutions trusted by businesses globally.	\N	\N	Replai — AI-Powered WhatsApp CRM			https://replai.junkiescoder.com	\N	\N	\N	\N	\N	support@junkiescoder.com	sales@junkiescoder.com	privacy@junkiescoder.com	legal@junkiescoder.com	2026 Junkies Coder. All rights reserved.|||Made with ❤️ in India	f	f	2026-07-29 08:31:32.416843+00	2026-08-05 11:32:25.326+00	f		[{"href": "#pricing", "label": "Pricing"}, {"href": "#features", "label": "Features"}, {"href": "#how-it-works", "label": "How it Works"}, {"href": "#integrations", "label": "Integrations"}]	[{"links": [{"href": "#features", "label": "Features"}, {"href": "#integrations", "label": "Integrations"}, {"href": "#pricing", "label": "Pricing"}, {"href": "#changelog", "label": "Changelog"}, {"href": "#docs", "label": "Docs"}], "title": "Product"}, {"links": [{"href": "/about", "label": "About"}, {"href": "/contact", "label": "Contact"}], "title": "Company"}, {"links": [{"href": "/legal/privacy-policy", "label": "Privacy Policy"}, {"href": "/legal/terms-of-service", "label": "Terms of Service"}, {"href": "/legal/cookie-policy", "label": "Cookie Policy"}, {"href": "/legal/data-processing-agreement", "label": "Data Processing Agreement"}, {"href": "/legal/acceptable-use-policy", "label": "Acceptable Use Policy"}], "title": "Legal"}]	ansarisoyab908@gmail.com
\.


--
-- TOC entry 5502 (class 0 OID 17527)
-- Dependencies: 309
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tags (id, user_id, name, color, created_at, account_id) FROM stdin;
84be16de-01da-47f8-b3e5-727f0486ad2c	2b7a9798-3044-440f-80be-68952f57d708	News	#10b981	2026-07-25 13:02:49.102728+00	3430edae-763b-4aac-9b82-1c2364936d79
\.


--
-- TOC entry 5530 (class 0 OID 18544)
-- Dependencies: 337
-- Data for Name: webhook_endpoints; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_endpoints (id, account_id, created_by, url, secret, events, is_active, last_delivery_at, failure_count, created_at) FROM stdin;
\.


--
-- TOC entry 5509 (class 0 OID 17672)
-- Dependencies: 316
-- Data for Name: whatsapp_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_config (id, user_id, phone_number_id, waba_id, access_token, verify_token, status, connected_at, created_at, updated_at, account_id, registered_at, subscribed_apps_at, last_registration_error, connection_source) FROM stdin;
541f5a90-7808-4446-8f85-dea1e2f63d7b	3dbf0236-b75e-4805-a8c9-405fdfd259a5	1179252328613873	1795351414786360	d51ed13295128f7eae4e3e57:066188031982d709dc9252679e7068cad24a4ff723ab50a7b1afeb1fe2636c0a7fe5755026bce37e79856d1e7e6d1ebec0858a9a556564e21048cb6792b0d1117494c7612797c9ed33a97f9a8d13b657b788cb94803e8edfc94ed4726aca4d34509dc21564c2a11f8ca0cd3d785e6c73c83a81d9f0280b96404bdb3a8edd2db11ebad92523e5cb4f8c2314ad511dd2520d425a8387cbf43cb3405bc725f2e0d0fbca645ed95043963dac52ebc20fbbaceb8798bd6318290a1fd337780d88ef33ddc4e809bd936f6df1474ffad28fbb67d1f9aea2:8d2c805d116bedcffe4b23de46929bdb	\N	connected	2026-08-04 13:06:19.12+00	2026-08-04 13:06:19.235854+00	2026-08-04 13:06:19.12+00	eb378216-3e5b-4acd-874b-978cf65bd0d3	\N	2026-08-04 13:06:19.12+00	\N	manual
1457cca1-844d-4dd7-9118-40545b2baf0d	2b7a9798-3044-440f-80be-68952f57d708	1249598581570707	1662120174853370	3e8b3f1f2033ff76587cd8e1:5bd9d0b230f3f5ad6d301234bd9d5b0e8ebcc9808fe21aa2d82a8d0936d014d14f15b724e9782ba7d43745ed9f39ae1cdb572ab4264eb3cb02c255ee97eabfb5d3bb6d3e751961c0c341f638c1b3d2ff2ab0a98e2246aadc3fb7f9da8f183ba1cbe92aba99fa7929a75fd5c6838e1cd0a09fa8649ac5b90281d002fa3ec56f22a62e9070c7ba8d0324d43e094383e305cadb963732c4b9be91de3abb86d68fbadf082fb5eec04d603c06f047eb25e9a58dd912585cd2432a4688dc3d67544bfc7d819623928ccbc14dcf16092654a5b0c840d2f449789ca013e06479884e2a6d1195bad8f80106934b0e1f268de3793ea8b78a8d9dd0fe99dd1be5f40f9e4f30a7e15e43b05d9951e3343ff92a24c8355fe38e8106f9cf6bde070eb46c48df86f467df7f6f9071f5e2a650ee1c52f4a3fffe742b9803efe04cef7092e46b0c12b9c29d4b40bfb3f8dabea7346bb40d77a80950262fa1787f7fcaa734bfa26abf3023884c83beb5bfc7fd7bbf47f051fb36314ae7deb2935a6200989d848f149f983c90e55d010f8ad517b3681c3e8d:86c09ec559ce888e95b0ffb55b09de91	\N	connected	2026-08-04 12:33:06.625+00	2026-08-04 12:11:30.448975+00	2026-08-04 12:33:06.76388+00	3430edae-763b-4aac-9b82-1c2364936d79	\N	\N	\N	embedded_signup
\.


--
-- TOC entry 5544 (class 0 OID 19434)
-- Dependencies: 352
-- Data for Name: messages_2026_08_02; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_02 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5546 (class 0 OID 19473)
-- Dependencies: 354
-- Data for Name: messages_2026_08_03; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_03 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5547 (class 0 OID 19507)
-- Dependencies: 355
-- Data for Name: messages_2026_08_04; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_04 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5548 (class 0 OID 19520)
-- Dependencies: 356
-- Data for Name: messages_2026_08_05; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_05 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5549 (class 0 OID 19533)
-- Dependencies: 357
-- Data for Name: messages_2026_08_06; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_06 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5550 (class 0 OID 19548)
-- Dependencies: 358
-- Data for Name: messages_2026_08_07; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_07 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5551 (class 0 OID 19574)
-- Dependencies: 359
-- Data for Name: messages_2026_08_08; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_08_08 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- TOC entry 5488 (class 0 OID 17250)
-- Dependencies: 295
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.schema_migrations (version, inserted_at) FROM stdin;
20211116024918	2026-07-25 10:02:57
20211116045059	2026-07-25 10:02:57
20211116050929	2026-07-25 10:02:57
20211116051442	2026-07-25 10:02:57
20211116212300	2026-07-25 10:02:57
20211116213355	2026-07-25 10:02:57
20211116213934	2026-07-25 10:02:57
20211116214523	2026-07-25 10:02:57
20211122062447	2026-07-25 10:02:57
20211124070109	2026-07-25 10:02:57
20211202204204	2026-07-25 10:02:57
20211202204605	2026-07-25 10:02:57
20211210212804	2026-07-25 10:02:57
20211228014915	2026-07-25 10:02:57
20220107221237	2026-07-25 10:02:57
20220228202821	2026-07-25 10:02:57
20220312004840	2026-07-25 10:02:57
20220603231003	2026-07-25 10:02:57
20220603232444	2026-07-25 10:02:57
20220615214548	2026-07-25 10:02:57
20220712093339	2026-07-25 10:02:57
20220908172859	2026-07-25 10:02:57
20220916233421	2026-07-25 10:02:57
20230119133233	2026-07-25 10:02:57
20230128025114	2026-07-25 10:02:57
20230128025212	2026-07-25 10:02:57
20230227211149	2026-07-25 10:02:57
20230228184745	2026-07-25 10:02:57
20230308225145	2026-07-25 10:02:57
20230328144023	2026-07-25 10:02:57
20231018144023	2026-07-25 10:02:57
20231204144023	2026-07-25 10:02:57
20231204144024	2026-07-25 10:02:57
20231204144025	2026-07-25 10:02:57
20240108234812	2026-07-25 10:02:57
20240109165339	2026-07-25 10:02:57
20240227174441	2026-07-25 10:02:57
20240311171622	2026-07-25 10:02:57
20240321100241	2026-07-25 10:02:57
20240401105812	2026-07-25 10:02:57
20240418121054	2026-07-25 10:02:57
20240523004032	2026-07-25 10:02:57
20240618124746	2026-07-25 10:02:57
20240801235015	2026-07-25 10:02:57
20240805133720	2026-07-25 10:02:57
20240827160934	2026-07-25 10:02:57
20240919163303	2026-07-25 10:02:57
20240919163305	2026-07-25 10:02:57
20241019105805	2026-07-25 10:02:57
20241030150047	2026-07-25 10:02:57
20241108114728	2026-07-25 10:02:57
20241121104152	2026-07-25 10:02:57
20241130184212	2026-07-25 10:02:57
20241220035512	2026-07-25 10:02:57
20241220123912	2026-07-25 10:02:57
20241224161212	2026-07-25 10:02:57
20250107150512	2026-07-25 10:02:57
20250110162412	2026-07-25 10:02:57
20250123174212	2026-07-25 10:02:57
20250128220012	2026-07-25 10:02:57
20250506224012	2026-07-25 10:02:57
20250523164012	2026-07-25 10:02:57
20250714121412	2026-07-25 10:02:57
20250905041441	2026-07-25 10:02:57
20251103001201	2026-07-25 10:02:57
20251120212548	2026-07-25 10:02:57
20251120215549	2026-07-25 10:02:57
20260218120000	2026-07-25 10:02:57
20260326120000	2026-07-25 10:02:57
20260514120000	2026-07-25 10:02:57
20260527120000	2026-07-25 10:02:57
20260528120000	2026-07-25 10:02:57
20260603120000	2026-07-25 10:02:57
20260605120000	2026-07-25 10:02:57
20260606110000	2026-07-25 10:02:57
20260616120000	2026-07-25 10:02:57
20260624120000	2026-07-25 10:02:57
20260626120000	2026-07-25 10:02:57
20260706120000	2026-07-25 10:02:57
20260707120000	2026-07-25 10:02:57
20260709120000	2026-07-25 10:02:57
\.


--
-- TOC entry 5489 (class 0 OID 17253)
-- Dependencies: 296
-- Data for Name: subscription; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.subscription (id, subscription_id, entity, filters, claims, created_at, action_filter, selected_columns) FROM stdin;
3632	9c2c7c1e-90c8-11f1-ac46-0a58a9feac02	public.conversations	{}	{"aal": "aal1", "amr": [{"method": "password", "timestamp": 1785735446}], "aud": "authenticated", "exp": 1785936057, "iat": 1785932457, "iss": "https://dknolotutfiesuhbhmze.supabase.co/auth/v1", "sub": "2b7a9798-3044-440f-80be-68952f57d708", "role": "authenticated", "email": "souaib@junkiescoder.com", "phone": "", "session_id": "cb94b86a-654e-4b57-8ce6-84dcfeee7be8", "app_metadata": {"provider": "email", "providers": ["email"]}, "is_anonymous": false, "user_metadata": {"sub": "2b7a9798-3044-440f-80be-68952f57d708", "email": "souaib@junkiescoder.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}}	2026-08-05 12:24:31.484599	*	\N
3633	9c2ced7a-90c8-11f1-8afd-0a58a9feac02	public.notifications	{}	{"aal": "aal1", "amr": [{"method": "password", "timestamp": 1785735446}], "aud": "authenticated", "exp": 1785936057, "iat": 1785932457, "iss": "https://dknolotutfiesuhbhmze.supabase.co/auth/v1", "sub": "2b7a9798-3044-440f-80be-68952f57d708", "role": "authenticated", "email": "souaib@junkiescoder.com", "phone": "", "session_id": "cb94b86a-654e-4b57-8ce6-84dcfeee7be8", "app_metadata": {"provider": "email", "providers": ["email"]}, "is_anonymous": false, "user_metadata": {"sub": "2b7a9798-3044-440f-80be-68952f57d708", "email": "souaib@junkiescoder.com", "full_name": "Souaib Ansari", "email_verified": true, "phone_verified": false}}	2026-08-05 12:24:31.485463	*	\N
\.


--
-- TOC entry 5492 (class 0 OID 17294)
-- Dependencies: 299
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) FROM stdin;
avatars	avatars	\N	2026-07-25 11:31:18.956217+00	2026-07-25 11:31:18.956217+00	t	f	2097152	{image/png,image/jpeg,image/webp,image/gif}	\N	STANDARD
flow-media	flow-media	\N	2026-07-25 12:40:12.292358+00	2026-07-25 12:40:12.292358+00	t	f	16777216	{image/png,image/jpeg,image/webp,video/mp4,video/3gpp,application/pdf,application/vnd.ms-powerpoint,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain}	\N	STANDARD
chat-media	chat-media	\N	2026-07-25 11:36:39.536515+00	2026-07-25 11:36:39.536515+00	t	f	16777216	{image/jpeg,image/png,image/gif,image/webp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/webm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,video/mp4,video/3gpp}	\N	STANDARD
landing-assets	landing-assets	\N	2026-07-29 08:47:20.45754+00	2026-07-29 08:47:20.45754+00	t	f	\N	\N	\N	STANDARD
public-assets	public-assets	\N	2026-07-29 12:03:40.07286+00	2026-07-29 12:03:40.07286+00	t	f	\N	\N	\N	STANDARD
\.


--
-- TOC entry 5496 (class 0 OID 17414)
-- Dependencies: 303
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_analytics (name, type, format, created_at, updated_at, id, deleted_at) FROM stdin;
\.


--
-- TOC entry 5497 (class 0 OID 17427)
-- Dependencies: 304
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_vectors (id, type, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5491 (class 0 OID 17286)
-- Dependencies: 298
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
0	create-migrations-table	e18db593bcde2aca2a408c4d1100f6abba2195df	2026-07-25 10:03:01.119309
1	initialmigration	6ab16121fbaa08bbd11b712d05f358f9b555d777	2026-07-25 10:03:01.169972
2	storage-schema	f6a1fa2c93cbcd16d4e487b362e45fca157a8dbd	2026-07-25 10:03:01.174711
3	pathtoken-column	2cb1b0004b817b29d5b0a971af16bafeede4b70d	2026-07-25 10:03:01.206809
4	add-migrations-rls	427c5b63fe1c5937495d9c635c263ee7a5905058	2026-07-25 10:03:01.229225
5	add-size-functions	79e081a1455b63666c1294a440f8ad4b1e6a7f84	2026-07-25 10:03:01.238242
6	change-column-name-in-get-size	ded78e2f1b5d7e616117897e6443a925965b30d2	2026-07-25 10:03:01.247256
7	add-rls-to-buckets	e7e7f86adbc51049f341dfe8d30256c1abca17aa	2026-07-25 10:03:01.25777
8	add-public-to-buckets	fd670db39ed65f9d08b01db09d6202503ca2bab3	2026-07-25 10:03:01.264931
9	fix-search-function	af597a1b590c70519b464a4ab3be54490712796b	2026-07-25 10:03:01.273194
10	search-files-search-function	b595f05e92f7e91211af1bbfe9c6a13bb3391e16	2026-07-25 10:03:01.28069
11	add-trigger-to-auto-update-updated_at-column	7425bdb14366d1739fa8a18c83100636d74dcaa2	2026-07-25 10:03:01.287477
12	add-automatic-avif-detection-flag	8e92e1266eb29518b6a4c5313ab8f29dd0d08df9	2026-07-25 10:03:01.295275
13	add-bucket-custom-limits	cce962054138135cd9a8c4bcd531598684b25e7d	2026-07-25 10:03:01.306898
14	use-bytes-for-max-size	941c41b346f9802b411f06f30e972ad4744dad27	2026-07-25 10:03:01.333799
15	add-can-insert-object-function	934146bc38ead475f4ef4b555c524ee5d66799e5	2026-07-25 10:03:01.368718
16	add-version	76debf38d3fd07dcfc747ca49096457d95b1221b	2026-07-25 10:03:01.378899
17	drop-owner-foreign-key	f1cbb288f1b7a4c1eb8c38504b80ae2a0153d101	2026-07-25 10:03:01.386684
18	add_owner_id_column_deprecate_owner	e7a511b379110b08e2f214be852c35414749fe66	2026-07-25 10:03:01.418219
19	alter-default-value-objects-id	02e5e22a78626187e00d173dc45f58fa66a4f043	2026-07-25 10:03:01.425864
20	list-objects-with-delimiter	cd694ae708e51ba82bf012bba00caf4f3b6393b7	2026-07-25 10:03:01.434095
21	s3-multipart-uploads	8c804d4a566c40cd1e4cc5b3725a664a9303657f	2026-07-25 10:03:01.442291
22	s3-multipart-uploads-big-ints	9737dc258d2397953c9953d9b86920b8be0cdb73	2026-07-25 10:03:01.461158
23	optimize-search-function	9d7e604cddc4b56a5422dc68c9313f4a1b6f132c	2026-07-25 10:03:01.478897
24	operation-function	8312e37c2bf9e76bbe841aa5fda889206d2bf8aa	2026-07-25 10:03:01.484824
25	custom-metadata	d974c6057c3db1c1f847afa0e291e6165693b990	2026-07-25 10:03:01.490486
26	objects-prefixes	215cabcb7f78121892a5a2037a09fedf9a1ae322	2026-07-25 10:03:01.495204
27	search-v2	859ba38092ac96eb3964d83bf53ccc0b141663a6	2026-07-25 10:03:01.49879
28	object-bucket-name-sorting	c73a2b5b5d4041e39705814fd3a1b95502d38ce4	2026-07-25 10:03:01.503507
29	create-prefixes	ad2c1207f76703d11a9f9007f821620017a66c21	2026-07-25 10:03:01.512591
30	update-object-levels	2be814ff05c8252fdfdc7cfb4b7f5c7e17f0bed6	2026-07-25 10:03:01.52306
31	objects-level-index	b40367c14c3440ec75f19bbce2d71e914ddd3da0	2026-07-25 10:03:01.535416
32	backward-compatible-index-on-objects	e0c37182b0f7aee3efd823298fb3c76f1042c0f7	2026-07-25 10:03:01.539367
33	backward-compatible-index-on-prefixes	b480e99ed951e0900f033ec4eb34b5bdcb4e3d49	2026-07-25 10:03:01.54519
34	optimize-search-function-v1	ca80a3dc7bfef894df17108785ce29a7fc8ee456	2026-07-25 10:03:01.551727
35	add-insert-trigger-prefixes	458fe0ffd07ec53f5e3ce9df51bfdf4861929ccc	2026-07-25 10:03:01.558344
36	optimise-existing-functions	6ae5fca6af5c55abe95369cd4f93985d1814ca8f	2026-07-25 10:03:01.564665
37	add-bucket-name-length-trigger	3944135b4e3e8b22d6d4cbb568fe3b0b51df15c1	2026-07-25 10:03:01.571965
38	iceberg-catalog-flag-on-buckets	02716b81ceec9705aed84aa1501657095b32e5c5	2026-07-25 10:03:01.579945
39	add-search-v2-sort-support	6706c5f2928846abee18461279799ad12b279b78	2026-07-25 10:03:01.592401
40	fix-prefix-race-conditions-optimized	7ad69982ae2d372b21f48fc4829ae9752c518f6b	2026-07-25 10:03:01.599606
41	add-object-level-update-trigger	07fcf1a22165849b7a029deed059ffcde08d1ae0	2026-07-25 10:03:01.605294
42	rollback-prefix-triggers	771479077764adc09e2ea2043eb627503c034cd4	2026-07-25 10:03:01.609415
43	fix-object-level	84b35d6caca9d937478ad8a797491f38b8c2979f	2026-07-25 10:03:01.614744
44	vector-bucket-type	99c20c0ffd52bb1ff1f32fb992f3b351e3ef8fb3	2026-07-25 10:03:01.636223
45	vector-buckets	049e27196d77a7cb76497a85afae669d8b230953	2026-07-25 10:03:01.642056
46	buckets-objects-grants	fedeb96d60fefd8e02ab3ded9fbde05632f84aed	2026-07-25 10:03:01.658242
47	iceberg-table-metadata	649df56855c24d8b36dd4cc1aeb8251aa9ad42c2	2026-07-25 10:03:01.681052
48	iceberg-catalog-ids	e0e8b460c609b9999ccd0df9ad14294613eed939	2026-07-25 10:03:01.685671
49	buckets-objects-grants-postgres	072b1195d0d5a2f888af6b2302a1938dd94b8b3d	2026-07-25 10:03:01.710002
50	search-v2-optimised	6323ac4f850aa14e7387eb32102869578b5bd478	2026-07-25 10:03:01.714049
51	index-backward-compatible-search	2ee395d433f76e38bcd3856debaf6e0e5b674011	2026-07-25 10:03:01.808885
52	drop-not-used-indexes-and-functions	5cc44c8696749ac11dd0dc37f2a3802075f3a171	2026-07-25 10:03:01.810842
53	drop-index-lower-name	d0cb18777d9e2a98ebe0bc5cc7a42e57ebe41854	2026-07-25 10:03:01.835067
54	drop-index-object-level	6289e048b1472da17c31a7eba1ded625a6457e67	2026-07-25 10:03:01.843197
55	prevent-direct-deletes	262a4798d5e0f2e7c8970232e03ce8be695d5819	2026-07-25 10:03:01.859351
56	fix-optimized-search-function	b823ed1e418101032fa01374edc9a436e54e3ed4	2026-07-25 10:03:01.888345
57	s3-multipart-uploads-metadata	f127886e00d1b374fadbc7c6b31e09336aad5287	2026-07-25 10:03:01.93803
58	operation-ergonomics	00ca5d483b3fe0d522133d9002ccc5df98365120	2026-07-25 10:03:01.986472
59	drop-unused-functions	38456f13e39691c2bbb4b5151d0d1cdbabd4a8c4	2026-07-25 10:03:01.997786
60	optimize-existing-functions-again	db35e1c91a9201e59f4fef8d972c2f277d68b157	2026-07-25 10:03:02.005269
\.


--
-- TOC entry 5493 (class 0 OID 17304)
-- Dependencies: 300
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version, owner_id, user_metadata) FROM stdin;
ec2919a6-a4c4-45d9-989f-a79132a08642	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784981291419-81MuxoxCnzL__AC_UF350_350_QL80_.jpg	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 12:44:15.169392+00	2026-07-25 12:44:15.169392+00	2026-07-25 12:44:15.169392+00	{"eTag": "\\"ddefffac2b4798483f7131df33825034\\"", "size": 17125, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:44:16.000Z", "contentLength": 17125, "httpStatusCode": 200}	ff0f1741-625d-4f3f-9fd2-039e7b4f001b	2b7a9798-3044-440f-80be-68952f57d708	{}
edb6f625-46f3-46b6-a827-377db0c206fd	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784981632528-37368.jpg	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 12:49:56.150155+00	2026-07-25 12:49:56.150155+00	2026-07-25 12:49:56.150155+00	{"eTag": "\\"36e41797a651857949b31aa69519e825\\"", "size": 253806, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:49:57.000Z", "contentLength": 253806, "httpStatusCode": 200}	a0590748-5bd5-438c-bb71-a6498f79cf82	2b7a9798-3044-440f-80be-68952f57d708	{}
6b403dc6-fe46-4231-96f3-411709ce10b0	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784981827097-1729959470847z8c190n6.png	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	2026-07-25 12:53:10.727388+00	2026-07-25 12:53:10.727388+00	2026-07-25 12:53:10.727388+00	{"eTag": "\\"cb0fe344575dffe57eb303d3b2f27cfe\\"", "size": 128252, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:53:11.000Z", "contentLength": 128252, "httpStatusCode": 200}	bb3c0b4d-c5e8-4d18-a841-e7822aaefc2b	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	{}
0977f73c-0a74-4a11-884c-ce70ee891d9b	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784981996364-AI_Coding_Tools_Report.pdf	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 12:56:00.20709+00	2026-07-25 12:56:00.20709+00	2026-07-25 12:56:00.20709+00	{"eTag": "\\"87b2bb96c48861ab2c77c4f003b6cdf2\\"", "size": 62783, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:56:01.000Z", "contentLength": 62783, "httpStatusCode": 200}	5fe7c19f-3b94-4496-b716-b3728f0a8233	2b7a9798-3044-440f-80be-68952f57d708	{}
9e608240-245d-4017-a99f-ebe7fd87cafb	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784982008953-ITACHI.mp4	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 12:56:12.869706+00	2026-07-25 12:56:12.869706+00	2026-07-25 12:56:12.869706+00	{"eTag": "\\"a347814512797ac7742b1e5d982aff3b\\"", "size": 3995070, "mimetype": "video/mp4", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:56:13.000Z", "contentLength": 3995070, "httpStatusCode": 200}	07bda8aa-8713-409a-a872-c9034c3ddaed	2b7a9798-3044-440f-80be-68952f57d708	{}
d788760e-ec0b-4559-abcc-64f93d112d31	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1784982027512-voice-1784982027428.ogg	2b7a9798-3044-440f-80be-68952f57d708	2026-07-25 12:56:31.093383+00	2026-07-25 12:56:31.093383+00	2026-07-25 12:56:31.093383+00	{"eTag": "\\"104a8cd91098653d7d835a2bb2aa4f09\\"", "size": 14300, "mimetype": "audio/ogg", "cacheControl": "max-age=3600", "lastModified": "2026-07-25T12:56:32.000Z", "contentLength": 14300, "httpStatusCode": 200}	3232a5a4-8af1-4cb9-bea5-294ee5c9eb28	2b7a9798-3044-440f-80be-68952f57d708	{}
ef72d50a-48a0-4861-b2c6-3a6a831bdabf	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1785149272148-37368.jpg	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	2026-07-27 10:47:53.532246+00	2026-07-27 10:47:53.532246+00	2026-07-27 10:47:53.532246+00	{"eTag": "\\"36e41797a651857949b31aa69519e825\\"", "size": 253806, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-27T10:47:54.000Z", "contentLength": 253806, "httpStatusCode": 200}	9ae7419e-0997-4ea7-b14c-7e883bf49ee6	fcb647c4-fbed-4cd7-ba5f-49c4a653f1dc	{}
bda1e754-0f55-4e0e-9cc8-9fefc8e8f159	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1785153176664-17299590868225mmkskns.png	2b7a9798-3044-440f-80be-68952f57d708	2026-07-27 11:52:58.194128+00	2026-07-27 11:52:58.194128+00	2026-07-27 11:52:58.194128+00	{"eTag": "\\"6daae415796974d0299b11ec01113566\\"", "size": 112767, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-27T11:52:59.000Z", "contentLength": 112767, "httpStatusCode": 200}	015ba0b3-1795-439c-b2c9-f010dd46a891	2b7a9798-3044-440f-80be-68952f57d708	{}
4f289465-0aae-4418-ab5d-3444aa527c8f	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1785153221466-1729959470847z8c190n6.png	2b7a9798-3044-440f-80be-68952f57d708	2026-07-27 11:53:42.73362+00	2026-07-27 11:53:42.73362+00	2026-07-27 11:53:42.73362+00	{"eTag": "\\"cb0fe344575dffe57eb303d3b2f27cfe\\"", "size": 128252, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-27T11:53:43.000Z", "contentLength": 128252, "httpStatusCode": 200}	09664eb5-4baf-44bc-b663-3a4dc7ca970a	2b7a9798-3044-440f-80be-68952f57d708	{}
784b2029-418f-4a1b-a822-e5e56efe81d1	public-assets	landing-sections/0.7327766960919538.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:09:45.873334+00	2026-07-29 12:09:45.873334+00	2026-07-29 12:09:45.873334+00	{"eTag": "\\"0508b052c5abf829559855a54525ae0c\\"", "size": 923145, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:09:46.000Z", "contentLength": 923145, "httpStatusCode": 200}	7cfdee18-3da2-48f3-97c9-a2b95b018791	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
6e4bc9bc-ec65-4a95-9814-3ba7c74f290b	public-assets	landing-sections/0.5864832741418295.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:52:05.859742+00	2026-07-29 12:52:05.859742+00	2026-07-29 12:52:05.859742+00	{"eTag": "\\"81028eb6f127fbdd8f953acb1d0e3a6b\\"", "size": 4991, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:52:06.000Z", "contentLength": 4991, "httpStatusCode": 200}	d80483dd-c9fd-47e3-9420-8b88d4a68f03	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
b899bea7-f966-4775-b85d-f16a4a2fa544	public-assets	landing-sections/0.7217896114619867.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:52:10.302529+00	2026-07-29 12:52:10.302529+00	2026-07-29 12:52:10.302529+00	{"eTag": "\\"c665e2e06bb8298144a753d8626fcf76\\"", "size": 7105, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:52:11.000Z", "contentLength": 7105, "httpStatusCode": 200}	b2035092-5e9d-4e92-b534-941256be757d	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
6ebaa2ad-e197-47a6-b5c2-c7bc3a273bc7	public-assets	landing-sections/0.8505194636977615.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.374013+00	2026-07-29 12:53:55.374013+00	2026-07-29 12:53:55.374013+00	{"eTag": "\\"4d997e615a88590c144796a34eef8f43\\"", "size": 3378, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 3378, "httpStatusCode": 200}	5adfc399-b89c-4997-99c7-a5e5d15bc59a	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
91e20d60-2d7a-4f78-bbb5-9a5d0ec61af0	public-assets	landing-sections/0.03269669904131611.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.399503+00	2026-07-29 12:53:55.399503+00	2026-07-29 12:53:55.399503+00	{"eTag": "\\"835aa81faca1f5eee239b4aa60c220e4\\"", "size": 2889, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 2889, "httpStatusCode": 200}	bdde5952-e2c6-46e1-aa0f-bddca7c5810a	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
09fbee00-4130-464f-aaec-da4f3dd5df54	public-assets	landing-sections/0.8794008869546039.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.427491+00	2026-07-29 12:53:55.427491+00	2026-07-29 12:53:55.427491+00	{"eTag": "\\"81028eb6f127fbdd8f953acb1d0e3a6b\\"", "size": 4991, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 4991, "httpStatusCode": 200}	15df17d4-9eb4-4946-bfff-95966a647774	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
2735059e-a048-40ae-9cbb-e1bcf7ec8911	public-assets	landing-sections/0.17988519811159753.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.448527+00	2026-07-29 12:53:55.448527+00	2026-07-29 12:53:55.448527+00	{"eTag": "\\"0f51de14e8fc9614b969abd34a756e7c\\"", "size": 4160, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 4160, "httpStatusCode": 200}	0b5fa449-470e-4816-ab30-aec5564580e3	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
a56326c8-3168-4db5-ab65-3aebce7264ad	public-assets	landing-sections/0.15054502397074576.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.594891+00	2026-07-29 12:54:16.594891+00	2026-07-29 12:54:16.594891+00	{"eTag": "\\"06a5b7bb6cae965c60769e89af1fd8d5\\"", "size": 4556, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 4556, "httpStatusCode": 200}	a9ff5e5e-16bb-45b7-8c9d-f8fd7f9e08bc	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
560ea7ba-3630-41b4-b661-19dcf717695d	public-assets	landing-sections/0.42050728446465435.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:52:25.3506+00	2026-07-29 12:52:25.3506+00	2026-07-29 12:52:25.3506+00	{"eTag": "\\"4d997e615a88590c144796a34eef8f43\\"", "size": 3378, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:52:26.000Z", "contentLength": 3378, "httpStatusCode": 200}	fd2b8639-73fa-4a04-8696-0460eadad355	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
67011170-8c39-4ea6-845f-67b24c205f29	public-assets	landing-sections/0.6826493178887609.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:22.883787+00	2026-07-29 12:53:22.883787+00	2026-07-29 12:53:22.883787+00	{"eTag": "\\"0f51de14e8fc9614b969abd34a756e7c\\"", "size": 4160, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:23.000Z", "contentLength": 4160, "httpStatusCode": 200}	242e9218-445b-471a-a0b6-168b5726890e	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
3ca6bc53-31c3-4173-8351-6662bc639f60	public-assets	landing-sections/0.6463990310872921.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.36967+00	2026-07-29 12:53:55.36967+00	2026-07-29 12:53:55.36967+00	{"eTag": "\\"c665e2e06bb8298144a753d8626fcf76\\"", "size": 7105, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 7105, "httpStatusCode": 200}	f38ff90e-9a5d-4a89-83d9-55ca797ce2aa	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
0c1ee920-7be0-49f3-b8ab-81730c6522ab	public-assets	landing-sections/0.34034230863657444.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.398406+00	2026-07-29 12:53:55.398406+00	2026-07-29 12:53:55.398406+00	{"eTag": "\\"f407d3cac8e8693fb904244b6794fa44\\"", "size": 2673, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 2673, "httpStatusCode": 200}	42e413ab-3c4d-4114-a8be-581530ca3116	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
1d39f9f1-1af3-4971-82df-8c73e42d6850	public-assets	landing-sections/0.6840753265270323.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:53:55.425388+00	2026-07-29 12:53:55.425388+00	2026-07-29 12:53:55.425388+00	{"eTag": "\\"b061efc9382ecbbf4550d4ed9977dfdb\\"", "size": 4804, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:53:56.000Z", "contentLength": 4804, "httpStatusCode": 200}	223f604d-e075-42c7-bbbb-170eddc2a773	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
d562f9e6-f001-4fd3-9724-030cd2e27bfd	public-assets	landing-sections/0.6560091912528258.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.579314+00	2026-07-29 12:54:16.579314+00	2026-07-29 12:54:16.579314+00	{"eTag": "\\"504296ca56b15bd1769947ee085370f1\\"", "size": 5516, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 5516, "httpStatusCode": 200}	010a91c9-668d-4a58-8cb8-183642478d8c	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
3e48c1d3-8825-4a81-b3f0-451d2061a389	public-assets	landing-sections/0.31301832221700854.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.590228+00	2026-07-29 12:54:16.590228+00	2026-07-29 12:54:16.590228+00	{"eTag": "\\"7533796ce9ce1beccea6b551ac980552\\"", "size": 5566, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 5566, "httpStatusCode": 200}	0847cea2-2fc7-459d-b885-c2a0df34fdc3	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
404f4372-b4fe-48bb-bb31-277185b68514	public-assets	landing-sections/0.7012695037660169.webp	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.594813+00	2026-07-29 12:54:16.594813+00	2026-07-29 12:54:16.594813+00	{"eTag": "\\"b61dfb3a02ca356f818ef4739131937f\\"", "size": 5246, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 5246, "httpStatusCode": 200}	2707945a-1b89-44fc-b149-66bbd33bf98d	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
bf2c028c-0b01-498e-ad63-8c323620e89e	public-assets	landing-sections/0.4762013822552046.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.601564+00	2026-07-29 12:54:16.601564+00	2026-07-29 12:54:16.601564+00	{"eTag": "\\"4e55365b50311753a3ecdd594347aa16\\"", "size": 2915, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 2915, "httpStatusCode": 200}	1262d1af-3f54-49fd-96b8-8717f7f073ad	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
bc225ffe-d360-4efe-ba48-f8376c6bb30f	public-assets	landing-sections/0.07853198419725116.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.612645+00	2026-07-29 12:54:16.612645+00	2026-07-29 12:54:16.612645+00	{"eTag": "\\"0eefa1f8cb092230a36665a08c7548a2\\"", "size": 2754, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 2754, "httpStatusCode": 200}	338bf4f7-5cdd-4ccf-ad0e-a325cfda3b7c	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
e5dbe7c4-c473-40b8-8e0a-13fdc51272fe	public-assets	landing-sections/0.7829484077470483.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-29 12:54:16.765551+00	2026-07-29 12:54:16.765551+00	2026-07-29 12:54:16.765551+00	{"eTag": "\\"1dc149e1cd84d42c2793017985c19c02\\"", "size": 2937, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T12:54:17.000Z", "contentLength": 2937, "httpStatusCode": 200}	a1e0bcd7-7e2f-4cae-a0c9-fc594d118afa	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
457ccd8e-c574-4400-8e39-e17a795042f5	chat-media	account-3430edae-763b-4aac-9b82-1c2364936d79/1785392966754-1729959470847z8c190n6.png	2b7a9798-3044-440f-80be-68952f57d708	2026-07-30 06:29:35.127548+00	2026-07-30 06:29:35.127548+00	2026-07-30 06:29:35.127548+00	{"eTag": "\\"cb0fe344575dffe57eb303d3b2f27cfe\\"", "size": 128252, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T06:29:36.000Z", "contentLength": 128252, "httpStatusCode": 200}	2d0b94a7-1232-441e-9e09-f31de2b57236	2b7a9798-3044-440f-80be-68952f57d708	{}
d6e8cf44-1490-408f-a3ba-4d80181d7378	public-assets	landing-sections/0.057946727830456846.png	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 06:36:00.197405+00	2026-07-30 06:36:00.197405+00	2026-07-30 06:36:00.197405+00	{"eTag": "\\"93bb44df1deb2a9469701423dd1a6779\\"", "size": 1340873, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T06:36:01.000Z", "contentLength": 1340873, "httpStatusCode": 200}	662bf58c-cd90-401d-99d8-290c5bd23fbf	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
56494cce-29be-4fb6-ac65-85e568a45f8a	public-assets	landing-sections/0.2775783484255323.png	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 06:47:57.354655+00	2026-07-30 06:47:57.354655+00	2026-07-30 06:47:57.354655+00	{"eTag": "\\"d8735ef4ffeaf96af62515fd9d364494\\"", "size": 943619, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T06:47:58.000Z", "contentLength": 943619, "httpStatusCode": 200}	69a2cdd7-9862-4ed2-9e2e-4b9759b54429	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
7f3f36e3-69d6-4a02-ac78-b5a998ccd046	public-assets	landing-sections/0.7348950900457553.png	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 06:49:13.000778+00	2026-07-30 06:49:13.000778+00	2026-07-30 06:49:13.000778+00	{"eTag": "\\"b4340b6402444644a8a78e05b41dc826\\"", "size": 992763, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T06:49:13.000Z", "contentLength": 992763, "httpStatusCode": 200}	856766ac-f7b9-4685-95d1-93be83a2ffe6	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
fe5e2061-b4d3-48ba-b94d-ee6d5f713ce8	public-assets	landing-sections/0.5030861991879763.png	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 06:53:55.831206+00	2026-07-30 06:53:55.831206+00	2026-07-30 06:53:55.831206+00	{"eTag": "\\"b27821933d4816ca283598eb73dfc050\\"", "size": 1918698, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T06:53:56.000Z", "contentLength": 1918698, "httpStatusCode": 200}	1599e0df-785d-4238-9d2b-5e166a1cdda0	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
06bd8729-5f03-4ce2-8808-616048be8215	public-assets	landing-sections/0.8060085165350175.png	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 07:16:17.500616+00	2026-07-30 07:16:17.500616+00	2026-07-30 07:16:17.500616+00	{"eTag": "\\"c0a6b4534a13ddac0e94d32d0f55d603\\"", "size": 1248265, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T07:16:18.000Z", "contentLength": 1248265, "httpStatusCode": 200}	241cd4a0-b41e-4b50-b5aa-3a20bd1ca8dd	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
d6bdc498-b96c-4a14-804f-1890d198dc02	public-assets	landing-sections/0.8939347567207169.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.701665+00	2026-07-30 08:01:24.701665+00	2026-07-30 08:01:24.701665+00	{"eTag": "\\"6d051c0e3a65692b6d85eb071a7e9bf3\\"", "size": 11690, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 11690, "httpStatusCode": 200}	e9486147-a6e4-4f2d-969e-4c1a27475fe0	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
522b4c57-195a-41f9-ac91-910246adb315	public-assets	landing-sections/0.5515516367490317.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.707836+00	2026-07-30 08:01:24.707836+00	2026-07-30 08:01:24.707836+00	{"eTag": "\\"c665e2e06bb8298144a753d8626fcf76\\"", "size": 7105, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 7105, "httpStatusCode": 200}	4c078a0d-2336-4d7c-a95a-ba5d349ffec1	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
5ecf6967-ae7c-48a7-8983-7ec9f2bc9365	public-assets	landing-sections/0.6843913001918743.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.717449+00	2026-07-30 08:01:24.717449+00	2026-07-30 08:01:24.717449+00	{"eTag": "\\"a24f434521cac3b74126a45b1260591e\\"", "size": 8415, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 8415, "httpStatusCode": 200}	731daece-bda8-48fd-b58d-cdc313e149c1	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
58b6a5ea-de6f-4ae8-bfee-b4760b059be7	public-assets	landing-sections/0.3049871152833369.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.751701+00	2026-07-30 08:01:24.751701+00	2026-07-30 08:01:24.751701+00	{"eTag": "\\"06a5b7bb6cae965c60769e89af1fd8d5\\"", "size": 4556, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 4556, "httpStatusCode": 200}	0419f79e-6c3a-4d03-a339-b4d50bb4ed9f	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
dc475add-c5d7-4437-bf88-ce5ccba4d954	public-assets	landing-sections/0.4447899230470006.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.864163+00	2026-07-30 08:01:31.864163+00	2026-07-30 08:01:31.864163+00	{"eTag": "\\"fd4d70858ccf632ae1c5dc07bad488fe\\"", "size": 7416, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 7416, "httpStatusCode": 200}	0c3fbc89-0215-492d-a9a5-7159b14a6ec1	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
f82773be-557e-496f-9625-b5936f1c4f47	public-assets	landing-sections/0.6339856707446601.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.867125+00	2026-07-30 08:01:31.867125+00	2026-07-30 08:01:31.867125+00	{"eTag": "\\"369fa47b469ee6f2919b48a65afa7dad\\"", "size": 7148, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 7148, "httpStatusCode": 200}	34323ce1-d611-4d67-816c-841650bb8e91	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
284c0673-aebc-49de-a2f5-869a441500ef	public-assets	landing-sections/0.9124921821511134.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.955072+00	2026-07-30 08:01:31.955072+00	2026-07-30 08:01:31.955072+00	{"eTag": "\\"7533796ce9ce1beccea6b551ac980552\\"", "size": 5566, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 5566, "httpStatusCode": 200}	6afbf821-e10c-4dd0-a89d-7faa1a9c5483	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
30c671c7-f341-490a-bcf5-66fd41a171f9	public-assets	landing-sections/0.5047397961950877.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.709106+00	2026-07-30 08:01:24.709106+00	2026-07-30 08:01:24.709106+00	{"eTag": "\\"81028eb6f127fbdd8f953acb1d0e3a6b\\"", "size": 4991, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 4991, "httpStatusCode": 200}	b077da08-a5c6-4c03-9383-577d8622e0fe	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
c5f94771-46c2-491d-a969-3ad843b8fb19	public-assets	landing-sections/0.5486094243520065.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.715008+00	2026-07-30 08:01:24.715008+00	2026-07-30 08:01:24.715008+00	{"eTag": "\\"475e12cd69c12992d9efefd143730e34\\"", "size": 7654, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 7654, "httpStatusCode": 200}	708c2b3e-65cd-487b-9a2b-1b23cfd1b737	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
b5a9cc82-d389-4e63-80f5-b35fb9a751c2	public-assets	landing-sections/0.5761410416610566.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.86723+00	2026-07-30 08:01:31.86723+00	2026-07-30 08:01:31.86723+00	{"eTag": "\\"370ebe77f9430e8ef946398b1d4cb125\\"", "size": 8683, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 8683, "httpStatusCode": 200}	2b3d4f4c-3fdf-49ec-81bd-56de2f45fa47	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
cfa683d3-111a-47e6-909f-e35c9641158b	public-assets	landing-sections/0.7006376135194761.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:24.735275+00	2026-07-30 08:01:24.735275+00	2026-07-30 08:01:24.735275+00	{"eTag": "\\"b061efc9382ecbbf4550d4ed9977dfdb\\"", "size": 4804, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:25.000Z", "contentLength": 4804, "httpStatusCode": 200}	79c630a3-65b9-405e-bfef-4e3fe7f313f8	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
589bbde4-61d3-4e82-8adc-875a2b5769c8	public-assets	landing-sections/0.14293040231703247.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.865233+00	2026-07-30 08:01:31.865233+00	2026-07-30 08:01:31.865233+00	{"eTag": "\\"de68a896ab03bfdaec14e8a249a01372\\"", "size": 7788, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 7788, "httpStatusCode": 200}	f067c098-f0e4-4f23-8b9f-6ff9acbb81a3	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
c236296e-1fc9-484c-bba5-289b67083d67	public-assets	landing-sections/0.2697778102682953.jpg	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:32.020309+00	2026-07-30 08:01:32.020309+00	2026-07-30 08:01:32.020309+00	{"eTag": "\\"5bf5ef0f06e9c948dd357957fa068dd1\\"", "size": 6342, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 6342, "httpStatusCode": 200}	5199dabc-8835-419e-a9bf-30a54568a46e	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
14004a11-35f6-45e5-a729-99f11bcc1e7a	public-assets	landing-sections/0.478368964185767.webp	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	2026-07-30 08:01:31.865506+00	2026-07-30 08:01:31.865506+00	2026-07-30 08:01:31.865506+00	{"eTag": "\\"b61dfb3a02ca356f818ef4739131937f\\"", "size": 5246, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-30T08:01:32.000Z", "contentLength": 5246, "httpStatusCode": 200}	f84aed66-c74f-43c6-bd4e-ed538a5cff37	d29cff75-25aa-4a5d-82cf-8d8923e0abdb	{}
\.


--
-- TOC entry 5494 (class 0 OID 17353)
-- Dependencies: 301
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads (id, in_progress_size, upload_signature, bucket_id, key, version, owner_id, created_at, user_metadata, metadata) FROM stdin;
\.


--
-- TOC entry 5495 (class 0 OID 17367)
-- Dependencies: 302
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads_parts (id, upload_id, size, part_number, bucket_id, key, etag, owner_id, version, created_at) FROM stdin;
\.


--
-- TOC entry 5498 (class 0 OID 17437)
-- Dependencies: 305
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.vector_indexes (id, name, bucket_id, data_type, dimension, distance_metric, metadata_configuration, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5499 (class 0 OID 17479)
-- Dependencies: 306
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: supabase_migrations; Owner: postgres
--

COPY supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) FROM stdin;
20260725112801	{"-- ============================================================\n-- Idempotent migration — safe to run multiple times.\n-- Uses IF NOT EXISTS for tables/indexes and DROP IF EXISTS\n-- for policies/triggers (Postgres has no CREATE POLICY IF NOT EXISTS).\n-- ============================================================\n\n-- Enable UUID extension\nCREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";\n\n-- ============================================================\n-- PROFILES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS profiles (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  full_name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  avatar_url TEXT,\n  role TEXT DEFAULT 'user',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id)\n);\n\nALTER TABLE profiles ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can view own profile\\" ON profiles;\nDROP POLICY IF EXISTS \\"Users can update own profile\\" ON profiles;\nDROP POLICY IF EXISTS \\"Users can insert own profile\\" ON profiles;\nCREATE POLICY \\"Users can view own profile\\" ON profiles FOR SELECT USING (auth.uid() = user_id);\nCREATE POLICY \\"Users can update own profile\\" ON profiles FOR UPDATE USING (auth.uid() = user_id);\nCREATE POLICY \\"Users can insert own profile\\" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);\n\n-- ============================================================\n-- CONTACTS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS contacts (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  phone TEXT NOT NULL,\n  name TEXT,\n  email TEXT,\n  company TEXT,\n  avatar_url TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);\nCREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);\n\nALTER TABLE contacts ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own contacts\\" ON contacts;\nCREATE POLICY \\"Users can manage own contacts\\" ON contacts FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- TAGS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS tags (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  color TEXT NOT NULL DEFAULT '#3b82f6',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE tags ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own tags\\" ON tags;\nCREATE POLICY \\"Users can manage own tags\\" ON tags FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- CONTACT_TAGS (many-to-many)\n-- ============================================================\nCREATE TABLE IF NOT EXISTS contact_tags (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,\n  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(contact_id, tag_id)\n);\n\nCREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);\nCREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);\n\nALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage contact tags\\" ON contact_tags;\nCREATE POLICY \\"Users can manage contact tags\\" ON contact_tags FOR ALL\n  USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tags.contact_id AND contacts.user_id = auth.uid()));\n\n-- ============================================================\n-- CUSTOM_FIELDS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS custom_fields (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  field_name TEXT NOT NULL,\n  field_type TEXT NOT NULL DEFAULT 'text',\n  field_options JSONB,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own custom fields\\" ON custom_fields;\nCREATE POLICY \\"Users can manage own custom fields\\" ON custom_fields FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- CONTACT_CUSTOM_VALUES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS contact_custom_values (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,\n  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,\n  value TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(contact_id, custom_field_id)\n);\n\nALTER TABLE contact_custom_values ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage custom values\\" ON contact_custom_values;\nCREATE POLICY \\"Users can manage custom values\\" ON contact_custom_values FOR ALL\n  USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_custom_values.contact_id AND contacts.user_id = auth.uid()));\n\n-- ============================================================\n-- CONTACT_NOTES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS contact_notes (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  note_text TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own notes\\" ON contact_notes;\nCREATE POLICY \\"Users can manage own notes\\" ON contact_notes FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- CONVERSATIONS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS conversations (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,\n  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),\n  assigned_agent_id UUID,\n  last_message_text TEXT,\n  last_message_at TIMESTAMPTZ,\n  unread_count INTEGER DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);\nCREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);\n\nALTER TABLE conversations ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own conversations\\" ON conversations;\nCREATE POLICY \\"Users can manage own conversations\\" ON conversations FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- MESSAGES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS messages (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),\n  sender_id UUID,\n  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video', 'location', 'template')),\n  content_text TEXT,\n  media_url TEXT,\n  template_name TEXT,\n  message_id TEXT,\n  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);\nCREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);\n\nALTER TABLE messages ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can view own messages\\" ON messages;\nDROP POLICY IF EXISTS \\"Service role can insert messages\\" ON messages;\nCREATE POLICY \\"Users can view own messages\\" ON messages FOR ALL\n  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()));\nCREATE POLICY \\"Service role can insert messages\\" ON messages FOR INSERT WITH CHECK (true);\n\n-- ============================================================\n-- WHATSAPP_CONFIG\n-- ============================================================\nCREATE TABLE IF NOT EXISTS whatsapp_config (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  phone_number_id TEXT NOT NULL,\n  waba_id TEXT,\n  access_token TEXT NOT NULL,\n  verify_token TEXT,\n  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),\n  connected_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id)\n);\n\nALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own config\\" ON whatsapp_config;\nCREATE POLICY \\"Users can manage own config\\" ON whatsapp_config FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- MESSAGE_TEMPLATES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS message_templates (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  category TEXT NOT NULL DEFAULT 'Marketing' CHECK (category IN ('Marketing', 'Utility', 'Authentication')),\n  language TEXT DEFAULT 'en_US',\n  header_type TEXT CHECK (header_type IN ('text', 'image', 'video', 'document')),\n  header_content TEXT,\n  body_text TEXT NOT NULL,\n  footer_text TEXT,\n  buttons JSONB,\n  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending', 'Approved', 'Rejected')),\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own templates\\" ON message_templates;\nCREATE POLICY \\"Users can manage own templates\\" ON message_templates FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- PIPELINES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS pipelines (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own pipelines\\" ON pipelines;\nCREATE POLICY \\"Users can manage own pipelines\\" ON pipelines FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- PIPELINE_STAGES\n-- ============================================================\nCREATE TABLE IF NOT EXISTS pipeline_stages (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  position INTEGER NOT NULL DEFAULT 0,\n  color TEXT NOT NULL DEFAULT '#3b82f6',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);\n\nALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage pipeline stages\\" ON pipeline_stages;\nCREATE POLICY \\"Users can manage pipeline stages\\" ON pipeline_stages FOR ALL\n  USING (EXISTS (SELECT 1 FROM pipelines WHERE pipelines.id = pipeline_stages.pipeline_id AND pipelines.user_id = auth.uid()));\n\n-- ============================================================\n-- DEALS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS deals (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,\n  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),\n  contact_id UUID NOT NULL REFERENCES contacts(id),\n  conversation_id UUID REFERENCES conversations(id),\n  title TEXT NOT NULL,\n  value NUMERIC(12,2) NOT NULL DEFAULT 0,\n  currency TEXT DEFAULT 'USD',\n  notes TEXT,\n  expected_close_date DATE,\n  status TEXT DEFAULT 'active',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);\nCREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);\n\nALTER TABLE deals ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own deals\\" ON deals;\nCREATE POLICY \\"Users can manage own deals\\" ON deals FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- BROADCASTS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS broadcasts (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  template_name TEXT NOT NULL,\n  template_language TEXT NOT NULL DEFAULT 'en_US',\n  template_variables JSONB,\n  audience_filter JSONB,\n  scheduled_at TIMESTAMPTZ,\n  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),\n  total_recipients INTEGER DEFAULT 0,\n  sent_count INTEGER DEFAULT 0,\n  delivered_count INTEGER DEFAULT 0,\n  read_count INTEGER DEFAULT 0,\n  replied_count INTEGER DEFAULT 0,\n  failed_count INTEGER DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own broadcasts\\" ON broadcasts;\nCREATE POLICY \\"Users can manage own broadcasts\\" ON broadcasts FOR ALL USING (auth.uid() = user_id);\n\n-- ============================================================\n-- BROADCAST_RECIPIENTS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS broadcast_recipients (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,\n  contact_id UUID NOT NULL REFERENCES contacts(id),\n  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),\n  sent_at TIMESTAMPTZ,\n  delivered_at TIMESTAMPTZ,\n  read_at TIMESTAMPTZ,\n  replied_at TIMESTAMPTZ,\n  error_message TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);\n\nALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage broadcast recipients\\" ON broadcast_recipients;\nCREATE POLICY \\"Users can manage broadcast recipients\\" ON broadcast_recipients FOR ALL\n  USING (EXISTS (SELECT 1 FROM broadcasts WHERE broadcasts.id = broadcast_recipients.broadcast_id AND broadcasts.user_id = auth.uid()));\n\n-- ============================================================\n-- UPDATED_AT TRIGGER FUNCTION\n-- ============================================================\nCREATE OR REPLACE FUNCTION update_updated_at_column()\nRETURNS TRIGGER AS $$\nBEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\n-- Apply to tables with updated_at — drop existing triggers first to avoid conflicts\nDROP TRIGGER IF EXISTS set_updated_at ON profiles;\nDROP TRIGGER IF EXISTS set_updated_at ON contacts;\nDROP TRIGGER IF EXISTS set_updated_at ON conversations;\nDROP TRIGGER IF EXISTS set_updated_at ON whatsapp_config;\nDROP TRIGGER IF EXISTS set_updated_at ON message_templates;\nDROP TRIGGER IF EXISTS set_updated_at ON deals;\nDROP TRIGGER IF EXISTS set_updated_at ON broadcasts;\n\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================\n-- AUTO-CREATE PROFILE ON USER SIGNUP\n-- Uses SECURITY DEFINER with owner=postgres (bypasses RLS).\n-- EXCEPTION block ensures signup still succeeds even if profile\n-- insert fails — profile can be created later if needed.\n-- ============================================================\nDROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\nDROP FUNCTION IF EXISTS public.handle_new_user();\n\nCREATE OR REPLACE FUNCTION public.handle_new_user()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nBEGIN\n  INSERT INTO public.profiles (user_id, full_name, email)\n  VALUES (\n    NEW.id,\n    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),\n    NEW.email\n  );\n  RETURN NEW;\nEXCEPTION WHEN OTHERS THEN\n  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;\n  RETURN NEW;\nEND;\n$$;\n\nALTER FUNCTION public.handle_new_user() OWNER TO postgres;\n\nCREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();\n\n-- ============================================================\n-- ENABLE REALTIME for key tables (idempotent via DO block)\n-- ============================================================\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE messages;\n  END IF;\n\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;\n  END IF;\nEND $$;"}	001_initial_schema	souaib@junkiescoder.com	\N	\N
20260725113041	{"-- ============================================================\n-- Pipeline enhancements:\n--   * deals.assigned_to — optional FK to profiles.id\n--   * deals.status — CHECK constraint ('open', 'won', 'lost')\n--     (replaces the old default 'active' with spec-compliant values)\n--\n-- Idempotent: safe to run multiple times.\n-- ============================================================\n\n-- Add assigned_to (nullable, FK to profiles)\nALTER TABLE deals\n  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;\n\nCREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);\n\n-- Normalize status values: any existing 'active' row becomes 'open'\nUPDATE deals SET status = 'open' WHERE status = 'active' OR status IS NULL;\n\n-- Replace the old default and enforce allowed values\nALTER TABLE deals ALTER COLUMN status SET DEFAULT 'open';\n\n-- Drop prior CHECK if any (none in 001, but be idempotent)\nDO $$\nBEGIN\n  IF EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'deals_status_check' AND conrelid = 'deals'::regclass\n  ) THEN\n    ALTER TABLE deals DROP CONSTRAINT deals_status_check;\n  END IF;\nEND $$;\n\nALTER TABLE deals\n  ADD CONSTRAINT deals_status_check CHECK (status IN ('open', 'won', 'lost'));"}	002_pipelines_enhancements	souaib@junkiescoder.com	\N	\N
20260725113044	{"-- ============================================================\n-- Broadcast recipient correlation + aggregate counts\n--\n-- Problem this solves:\n--   * broadcast_recipients had no column to correlate with Meta's\n--     message id, so webhook status updates (sent/delivered/read)\n--     could not be mirrored into the recipient row and the broadcast\n--     aggregate counts never advanced.\n--   * aggregate counts on `broadcasts` (sent/delivered/read/replied/\n--     failed) were updated ad-hoc by the sender, which drifted quickly\n--     once webhooks arrived out of band.\n--\n-- This migration:\n--   1. Adds whatsapp_message_id (+ unique index) so webhooks can find\n--      a recipient given Meta's message id.\n--   2. Adds a composite index on (broadcast_id, status) so the\n--      aggregate trigger's COUNT(*) FILTER scans are fast.\n--   3. Installs an AFTER INSERT/UPDATE/DELETE trigger on\n--      broadcast_recipients that re-aggregates the parent broadcasts\n--      row. Keeps writer code trivial — the webhook + hook only touch\n--      the recipient row; counts stay consistent automatically.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nALTER TABLE broadcast_recipients\n  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;\n\n-- UNIQUE so webhook retries can't create duplicate correlations.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_wamid\n  ON broadcast_recipients (whatsapp_message_id)\n  WHERE whatsapp_message_id IS NOT NULL;\n\n-- Fast path for the aggregate trigger's COUNT(*) FILTER subqueries.\nCREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status\n  ON broadcast_recipients (broadcast_id, status);\n\n-- ============================================================\n-- Aggregate trigger\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)\nRETURNS VOID AS $$\nBEGIN\n  UPDATE broadcasts b SET\n    sent_count      = agg.sent_count,\n    delivered_count = agg.delivered_count,\n    read_count      = agg.read_count,\n    replied_count   = agg.replied_count,\n    failed_count    = agg.failed_count,\n    updated_at      = NOW()\n  FROM (\n    SELECT\n      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,\n      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,\n      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,\n      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,\n      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count\n    FROM broadcast_recipients\n    WHERE broadcast_id = bid\n  ) agg\n  WHERE b.id = bid;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;\n\nCREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()\nRETURNS TRIGGER AS $$\nBEGIN\n  IF TG_OP = 'DELETE' THEN\n    PERFORM public.recompute_broadcast_counts(OLD.broadcast_id);\n    RETURN OLD;\n  END IF;\n\n  -- INSERT or UPDATE — only recompute when status changed (or on fresh insert)\n  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN\n    PERFORM public.recompute_broadcast_counts(NEW.broadcast_id);\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;\n\nDROP TRIGGER IF EXISTS broadcast_recipients_aggregate ON broadcast_recipients;\nCREATE TRIGGER broadcast_recipients_aggregate\nAFTER INSERT OR UPDATE OR DELETE ON broadcast_recipients\nFOR EACH ROW EXECUTE FUNCTION public.broadcast_recipient_aggregate_trigger();"}	003_broadcast_recipient_wamid	souaib@junkiescoder.com	\N	\N
20260725113046	{"-- ============================================================\n-- Allow contact deletion without wiping history.\n--\n-- broadcast_recipients.contact_id and deals.contact_id were declared\n-- NOT NULL REFERENCES contacts(id) with no ON DELETE action, so\n-- Postgres defaults to NO ACTION. The first time a user tried to\n-- delete a contact that had ever received a broadcast or been\n-- attached to a deal, the delete failed with:\n--\n--   ERROR 23503: update or delete on table \\"contacts\\" violates\n--   foreign key constraint ... on table <other>\n--\n-- CASCADE is the wrong fix — it would silently wipe historical\n-- broadcast recipient rows (breaking audit + retroactively moving\n-- broadcasts.sent_count / delivered_count / read_count etc. via the\n-- aggregate trigger) and deal rows.\n--\n-- SET NULL is the right fix: history rows survive with a NULL\n-- contact_id. The UI is already null-safe (contact?.name ?? 'Unknown',\n-- contact?.phone, etc.).\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ── broadcast_recipients.contact_id ────────────────────────────\nALTER TABLE broadcast_recipients\n  ALTER COLUMN contact_id DROP NOT NULL;\n\nDO $$\nBEGIN\n  IF EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'broadcast_recipients_contact_id_fkey'\n      AND conrelid = 'broadcast_recipients'::regclass\n  ) THEN\n    ALTER TABLE broadcast_recipients\n      DROP CONSTRAINT broadcast_recipients_contact_id_fkey;\n  END IF;\nEND $$;\n\nALTER TABLE broadcast_recipients\n  ADD CONSTRAINT broadcast_recipients_contact_id_fkey\n    FOREIGN KEY (contact_id) REFERENCES contacts(id)\n    ON DELETE SET NULL;\n\n-- ── deals.contact_id ───────────────────────────────────────────\nALTER TABLE deals\n  ALTER COLUMN contact_id DROP NOT NULL;\n\nDO $$\nBEGIN\n  IF EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'deals_contact_id_fkey'\n      AND conrelid = 'deals'::regclass\n  ) THEN\n    ALTER TABLE deals\n      DROP CONSTRAINT deals_contact_id_fkey;\n  END IF;\nEND $$;\n\nALTER TABLE deals\n  ADD CONSTRAINT deals_contact_id_fkey\n    FOREIGN KEY (contact_id) REFERENCES contacts(id)\n    ON DELETE SET NULL;"}	004_contact_delete_set_null	souaib@junkiescoder.com	\N	\N
20260725113048	{"-- ============================================================\n-- Incremental broadcast aggregate trigger.\n--\n-- Migration 003 installed a trigger that recomputed every counter\n-- (sent/delivered/read/replied/failed) via COUNT(*) FILTER on every\n-- row change. For a 10k-recipient broadcast, the send loop produces\n-- 10k INSERTs + 10k UPDATEs = 20k full aggregate scans, each walking\n-- the (broadcast_id, status) index. Workable at small scale, but\n-- O(n²) overall.\n--\n-- This migration replaces that with an incremental trigger that\n-- adjusts the parent broadcast's counts by ±1 based on the OLD →\n-- NEW.status delta. O(1) per recipient change; no scans at all.\n--\n-- Semantic model (same as the lib/broadcast-status.ts \\"forward-only\n-- ladder\\" in the webhook):\n--   sent_count       = recipients whose status is at or past 'sent'\n--   delivered_count  = ... at or past 'delivered'\n--   read_count       = ... at or past 'read'\n--   replied_count    = status = 'replied'\n--   failed_count     = status = 'failed'\n--\n-- A webhook that advances a recipient pending → sent → delivered →\n-- read → replied bumps every rung it crosses by 1. Going to 'failed'\n-- only bumps failed_count (and can only happen from pending / sent,\n-- enforced in the webhook).\n--\n-- Keeps the safety net: a public recompute_broadcast_counts() SQL\n-- function is retained so ops can run it manually if counts ever\n-- drift (e.g. after bulk DB surgery).\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- Delta a single column by +1 / -1.\nCREATE OR REPLACE FUNCTION public._bcast_bump(bid UUID, col TEXT, delta INT)\nRETURNS VOID AS $$\nBEGIN\n  EXECUTE format(\n    'UPDATE broadcasts SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',\n    col, col\n  ) USING delta, bid;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;\n\n-- Columns this recipient's status contributes to.\nCREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)\nRETURNS TEXT[] AS $$\nBEGIN\n  -- 'pending' contributes to nothing.\n  IF s = 'pending' THEN RETURN ARRAY[]::TEXT[]; END IF;\n  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;\n  IF s = 'delivered' THEN RETURN ARRAY['sent_count','delivered_count']; END IF;\n  IF s = 'read'      THEN RETURN ARRAY['sent_count','delivered_count','read_count']; END IF;\n  IF s = 'replied'   THEN RETURN ARRAY['sent_count','delivered_count','read_count','replied_count']; END IF;\n  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;\n  RETURN ARRAY[]::TEXT[];\nEND;\n$$ LANGUAGE plpgsql IMMUTABLE;\n\n-- Replace the trigger body with the incremental version.\nCREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()\nRETURNS TRIGGER AS $$\nDECLARE\n  old_cols TEXT[];\n  new_cols TEXT[];\n  c TEXT;\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    new_cols := _bcast_cols_for_status(NEW.status);\n    FOREACH c IN ARRAY new_cols LOOP\n      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);\n    END LOOP;\n    RETURN NEW;\n  END IF;\n\n  IF TG_OP = 'DELETE' THEN\n    old_cols := _bcast_cols_for_status(OLD.status);\n    FOREACH c IN ARRAY old_cols LOOP\n      PERFORM _bcast_bump(OLD.broadcast_id, c, -1);\n    END LOOP;\n    RETURN OLD;\n  END IF;\n\n  -- UPDATE: only care if status changed.\n  IF OLD.status IS DISTINCT FROM NEW.status THEN\n    old_cols := _bcast_cols_for_status(OLD.status);\n    new_cols := _bcast_cols_for_status(NEW.status);\n    -- Subtract the old contributions, add the new.\n    FOREACH c IN ARRAY old_cols LOOP\n      PERFORM _bcast_bump(NEW.broadcast_id, c, -1);\n    END LOOP;\n    FOREACH c IN ARRAY new_cols LOOP\n      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);\n    END LOOP;\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;\n\n-- Trigger itself remains the same (INSERT/UPDATE/DELETE) — just its\n-- body has been replaced.\n\n-- Safety net — rebuild counts from scratch. Retained as-is so ops can\n-- run it on demand if something ever drifts. Matches the incremental\n-- trigger's semantic model exactly.\nCREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)\nRETURNS VOID AS $$\nBEGIN\n  UPDATE broadcasts b SET\n    sent_count      = agg.sent_count,\n    delivered_count = agg.delivered_count,\n    read_count      = agg.read_count,\n    replied_count   = agg.replied_count,\n    failed_count    = agg.failed_count,\n    updated_at      = NOW()\n  FROM (\n    SELECT\n      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,\n      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,\n      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,\n      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,\n      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count\n    FROM broadcast_recipients\n    WHERE broadcast_id = bid\n  ) agg\n  WHERE b.id = bid;\nEND;\n$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;"}	005_broadcast_counts_incremental	souaib@junkiescoder.com	\N	\N
20260725113051	{"-- ============================================================\n-- 006_automations.sql — Automations feature\n--\n-- Idempotent migration — safe to run multiple times.\n-- Follows the same conventions as 001_initial_schema.sql:\n--   IF NOT EXISTS on tables/indexes, DROP IF EXISTS before\n--   re-creating policies/triggers (Postgres has no\n--   CREATE POLICY IF NOT EXISTS).\n-- ============================================================\n\n-- ============================================================\n-- AUTOMATIONS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS automations (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  description TEXT,\n  trigger_type TEXT NOT NULL,\n  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,\n  is_active BOOLEAN NOT NULL DEFAULT FALSE,\n  execution_count INTEGER NOT NULL DEFAULT 0,\n  last_executed_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);\n-- Partial index tuned for the engine's hot path: find active automations\n-- whose trigger_type matches the fired event. RLS then narrows by user_id.\nCREATE INDEX IF NOT EXISTS idx_automations_active_trigger\n  ON automations(trigger_type) WHERE is_active = TRUE;\n\nALTER TABLE automations ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage own automations\\" ON automations;\nCREATE POLICY \\"Users can manage own automations\\" ON automations FOR ALL\n  USING (auth.uid() = user_id);\n\nDROP TRIGGER IF EXISTS set_updated_at ON automations;\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON automations\n  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================\n-- AUTOMATION_STEPS\n--\n-- `position`       — order within parent scope (root scope or a branch).\n-- `parent_step_id` — NULL for root-level steps; set to the Condition\n--                    step's id for steps that live inside one of its\n--                    branches.\n-- `branch`         — NULL for root steps. For children of a Condition,\n--                    'yes' or 'no' identifying which path.\n-- ============================================================\nCREATE TABLE IF NOT EXISTS automation_steps (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,\n  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,\n  branch TEXT CHECK (branch IN ('yes', 'no')),\n  step_type TEXT NOT NULL,\n  step_config JSONB NOT NULL DEFAULT '{}'::jsonb,\n  position INTEGER NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id\n  ON automation_steps(automation_id, position);\nCREATE INDEX IF NOT EXISTS idx_automation_steps_parent\n  ON automation_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;\n\nALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can manage steps of own automations\\" ON automation_steps;\nCREATE POLICY \\"Users can manage steps of own automations\\" ON automation_steps FOR ALL\n  USING (\n    EXISTS (\n      SELECT 1 FROM automations a\n      WHERE a.id = automation_steps.automation_id\n        AND a.user_id = auth.uid()\n    )\n  );\n\n-- ============================================================\n-- AUTOMATION_LOGS\n--\n-- user_id is denormalized for simple RLS; contact_id is nullable so\n-- history survives contact deletion (mirrors migration 004's pattern\n-- on broadcast_recipients / deals).\n-- ============================================================\nCREATE TABLE IF NOT EXISTS automation_logs (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,\n  trigger_event TEXT NOT NULL,\n  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,\n  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),\n  error_message TEXT,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_automation_logs_automation\n  ON automation_logs(automation_id, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_logs(user_id);\n\nALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS \\"Users can view own automation logs\\" ON automation_logs;\nCREATE POLICY \\"Users can view own automation logs\\" ON automation_logs FOR ALL\n  USING (auth.uid() = user_id);\n\n-- ============================================================\n-- AUTOMATION_PENDING_EXECUTIONS\n--\n-- Queue row created when a running automation hits a `wait` step.\n-- The cron endpoint drains rows where run_at <= now() and status =\n-- 'pending', flips them to 'running', and resumes the automation\n-- from `next_step_position` with the saved `context` jsonb.\n--\n-- Service-role only — writes never originate from the browser, and\n-- the engine uses the service-role client. No user policy exposed.\n-- ============================================================\nCREATE TABLE IF NOT EXISTS automation_pending_executions (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,\n  log_id UUID REFERENCES automation_logs(id) ON DELETE CASCADE,\n  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL,\n  branch TEXT CHECK (branch IN ('yes', 'no')),\n  next_step_position INTEGER NOT NULL,\n  context JSONB NOT NULL DEFAULT '{}'::jsonb,\n  status TEXT NOT NULL DEFAULT 'pending'\n    CHECK (status IN ('pending', 'running', 'done', 'failed')),\n  run_at TIMESTAMPTZ NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_automation_pending_due\n  ON automation_pending_executions(run_at) WHERE status = 'pending';\n\nALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;\n-- No SELECT/INSERT/UPDATE/DELETE policy for authenticated users — all\n-- access is server-side via the service-role key."}	006_automations	souaib@junkiescoder.com	\N	\N
20260725113112	{"-- ============================================================\n-- 007_automations_increment_counter.sql\n--\n-- Atomic increment of automations.execution_count + refresh of\n-- last_executed_at. Called via PostgREST RPC from the engine.\n--\n-- Before this, the engine did a read-modify-write:\n--   UPDATE automations SET execution_count = <cached + 1> WHERE id = ...\n-- so two concurrent dispatches (e.g. the same automation firing for\n-- two different contacts in the same second) could both read N and\n-- both write N+1, permanently losing one count.\n--\n-- Idempotent — safe to re-run.\n-- ============================================================\n\nCREATE OR REPLACE FUNCTION increment_automation_execution_count(p_automation_id UUID)\nRETURNS VOID\nLANGUAGE sql\nSECURITY DEFINER\nSET search_path = public\nAS $$\n  UPDATE automations\n  SET\n    execution_count = execution_count + 1,\n    last_executed_at = NOW()\n  WHERE id = p_automation_id;\n$$;\n\n-- Only the service role needs to call this (engine uses the\n-- service-role client). Explicitly lock anon / authenticated out so\n-- an authenticated user can't juice someone else's counter via RPC.\nREVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM PUBLIC;\nREVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM anon;\nREVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM authenticated;\nGRANT EXECUTE ON FUNCTION increment_automation_execution_count(UUID) TO service_role;"}	007_automations_increment_counter	souaib@junkiescoder.com	\N	\N
20260725113118	{"-- ============================================================\n-- 008_profile_avatars_storage.sql\n--\n-- Creates the `avatars` Supabase Storage bucket and the RLS policies\n-- that let each user manage only their own avatar file while letting\n-- everyone read (so rendering <img> tags without signed URLs works).\n--\n-- File path convention used by the app:\n--   avatars/{auth.uid()}/avatar-<timestamp>.<ext>\n-- The policies rely on the first path segment matching auth.uid()::text.\n--\n-- Idempotent — safe to re-run.\n-- ============================================================\n\nINSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nVALUES (\n  'avatars',\n  'avatars',\n  TRUE,\n  2097152, -- 2 MB\n  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']\n)\nON CONFLICT (id) DO UPDATE\nSET\n  public = EXCLUDED.public,\n  file_size_limit = EXCLUDED.file_size_limit,\n  allowed_mime_types = EXCLUDED.allowed_mime_types;\n\n-- Policies live on storage.objects. Drop-if-exists because Postgres\n-- has no CREATE POLICY IF NOT EXISTS, and we want this migration to\n-- re-run cleanly.\nDROP POLICY IF EXISTS \\"Avatars are publicly readable\\" ON storage.objects;\nCREATE POLICY \\"Avatars are publicly readable\\"\n  ON storage.objects FOR SELECT\n  USING (bucket_id = 'avatars');\n\nDROP POLICY IF EXISTS \\"Users can upload their own avatar\\" ON storage.objects;\nCREATE POLICY \\"Users can upload their own avatar\\"\n  ON storage.objects FOR INSERT\n  WITH CHECK (\n    bucket_id = 'avatars'\n    AND auth.uid()::text = (storage.foldername(name))[1]\n  );\n\nDROP POLICY IF EXISTS \\"Users can update their own avatar\\" ON storage.objects;\nCREATE POLICY \\"Users can update their own avatar\\"\n  ON storage.objects FOR UPDATE\n  USING (\n    bucket_id = 'avatars'\n    AND auth.uid()::text = (storage.foldername(name))[1]\n  );\n\nDROP POLICY IF EXISTS \\"Users can delete their own avatar\\" ON storage.objects;\nCREATE POLICY \\"Users can delete their own avatar\\"\n  ON storage.objects FOR DELETE\n  USING (\n    bucket_id = 'avatars'\n    AND auth.uid()::text = (storage.foldername(name))[1]\n  );"}	008_profile_avatars_storage	souaib@junkiescoder.com	\N	\N
20260725113155	{"-- 015_whatsapp_config_registration.sql"}	015_whatsapp_config_registration	\N	\N	\N
20260725113123	{"-- ============================================================\n-- Chat actions: reply linkage + reactions\n--\n-- Adds two things the chat UI now needs:\n--\n--   1. `messages.reply_to_message_id` — a self-FK so a message can\n--      point at the message it replies to. We use the internal UUID\n--      (not Meta's message_id text), because Meta IDs aren't unique\n--      across phone numbers and can't be FK-constrained. The webhook\n--      resolves `context.id` from Meta into our internal UUID before\n--      writing. ON DELETE SET NULL — a deleted parent must not nuke\n--      its replies (which today never happens, but the constraint\n--      should match intent).\n--\n--   2. `message_reactions` table — one row per (message, actor).\n--      Reactions arrive concurrently from agents (UI) and customers\n--      (webhook). A row-level uniqueness constraint enforces \\"one\n--      reaction per actor per message\\" without read-modify-write\n--      games on a JSONB column.\n--\n--      `conversation_id` is denormalised purely so Supabase Realtime\n--      can filter on it with a plain `eq`. Realtime can't join.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- 1. Reply linkage on messages\n-- ============================================================\nALTER TABLE messages\n  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID\n  REFERENCES messages(id) ON DELETE SET NULL;\n\n-- Partial index — most messages aren't replies, so skip nulls.\nCREATE INDEX IF NOT EXISTS idx_messages_reply_to\n  ON messages(reply_to_message_id)\n  WHERE reply_to_message_id IS NOT NULL;\n\n-- ============================================================\n-- 2. message_reactions\n-- ============================================================\nCREATE TABLE IF NOT EXISTS message_reactions (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,\n  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,\n  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent')),\n  actor_id UUID,\n  emoji TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  UNIQUE (message_id, actor_type, actor_id)\n);\n\nCREATE INDEX IF NOT EXISTS idx_message_reactions_conversation\n  ON message_reactions(conversation_id);\n\nCREATE INDEX IF NOT EXISTS idx_message_reactions_message\n  ON message_reactions(message_id);\n\nALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \\"Users see reactions on their conversations\\" ON message_reactions;\nCREATE POLICY \\"Users see reactions on their conversations\\" ON message_reactions FOR SELECT\n  USING (EXISTS (\n    SELECT 1 FROM conversations c\n    WHERE c.id = message_reactions.conversation_id\n      AND c.user_id = auth.uid()\n  ));\n\nDROP POLICY IF EXISTS \\"Users insert reactions on their conversations\\" ON message_reactions;\nCREATE POLICY \\"Users insert reactions on their conversations\\" ON message_reactions FOR INSERT\n  WITH CHECK (EXISTS (\n    SELECT 1 FROM conversations c\n    WHERE c.id = message_reactions.conversation_id\n      AND c.user_id = auth.uid()\n  ));\n\n-- Agents may remove their own reactions. Customer reactions are managed\n-- by the webhook (service-role bypass), not the UI.\nDROP POLICY IF EXISTS \\"Users delete their own agent reactions\\" ON message_reactions;\nCREATE POLICY \\"Users delete their own agent reactions\\" ON message_reactions FOR DELETE\n  USING (\n    actor_type = 'agent'\n    AND actor_id = auth.uid()\n    AND EXISTS (\n      SELECT 1 FROM conversations c\n      WHERE c.id = message_reactions.conversation_id\n        AND c.user_id = auth.uid()\n    )\n  );\n\n-- Agents may swap their own reaction emoji (UPDATE path is also used by\n-- the upsert in /api/whatsapp/react).\nDROP POLICY IF EXISTS \\"Users update their own agent reactions\\" ON message_reactions;\nCREATE POLICY \\"Users update their own agent reactions\\" ON message_reactions FOR UPDATE\n  USING (\n    actor_type = 'agent'\n    AND actor_id = auth.uid()\n    AND EXISTS (\n      SELECT 1 FROM conversations c\n      WHERE c.id = message_reactions.conversation_id\n        AND c.user_id = auth.uid()\n    )\n  );\n\n-- Realtime — let the thread subscribe filtered by conversation_id.\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;\n  END IF;\nEND $$;"}	009_message_actions	souaib@junkiescoder.com	\N	\N
20260725113124	{"-- ============================================================\n-- Conversational Flows: stateful, branching WhatsApp chatbot.\n--\n-- What this migration adds:\n--\n--   1. `flows` — the definition envelope (name, trigger config,\n--      entry node, fallback policy, status). One row per authored bot.\n--\n--   2. `flow_nodes` — the graph rows. Edges live INSIDE each node's\n--      `config` JSONB (e.g. each button row carries its own\n--      `next_node_key`). Why edges-in-config rather than a separate\n--      `flow_edges` table:\n--        - The runner only ever asks \\"given current node X, where does\n--          reply Y go?\\" — that's a single-row lookup with the JSON\n--          already on the row. Splitting edges out forces a join per\n--          inbound message.\n--        - The builder's natural unit of edit is the node (\\"change this\n--          button's label and target\\"); a side table would force\n--          coordinated inserts/deletes on every save.\n--      Cross-node integrity is enforced at save-time by the validator\n--      (mirrors what `automation_steps`/`validate.ts` already does).\n--\n--      `node_key` is a STABLE STRING (e.g. \\"menu_existing\\"), not the\n--      UUID. Edge targets reference node_key, which means:\n--        - Cloning a flow doesn't require UUID rewriting in JSON edges.\n--        - Templates ship with human-readable keys.\n--        - Direct DB inspection is debuggable.\n--      The (flow_id, node_key) UNIQUE constraint guarantees lookup\n--      determinism.\n--\n--   3. `flow_runs` — per-contact runtime state machine. The linchpin\n--      is the partial unique index `idx_one_active_run_per_contact`:\n--      at most one ACTIVE run per (user_id, contact_id). Two concurrent\n--      webhook deliveries trying to start a run both attempt INSERT;\n--      the second fails with 23505 and the runner catches & exits.\n--      No locking required.\n--\n--   4. `flow_run_events` — append-only audit. Used by the runner for\n--      idempotency (refuses to advance twice on the same Meta\n--      message_id) and by the future run-history viewer.\n--\n--   5. Widens `messages.content_type` CHECK to allow 'interactive', and\n--      adds `messages.interactive_reply_id`. With this, button/list\n--      taps become first-class message rows with a queryable reply id\n--      instead of getting silently coerced into the \\"Unsupported\n--      message type\\" fallback in parseMessageContent.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- 1. Messages table — widen content_type, add interactive_reply_id\n-- ============================================================\n\n-- Drop & re-add the CHECK constraint to add 'interactive' as an allowed\n-- value. Migration 001 named it `messages_content_type_check` (Postgres\n-- default for an inline CHECK on a TEXT column).\nALTER TABLE messages\n  DROP CONSTRAINT IF EXISTS messages_content_type_check;\n\nALTER TABLE messages\n  ADD CONSTRAINT messages_content_type_check\n  CHECK (content_type IN (\n    'text', 'image', 'document', 'audio', 'video',\n    'location', 'template', 'interactive'\n  ));\n\n-- Reply id of the button / list row the customer tapped. NULL for\n-- everything that isn't an interactive reply. No FK — Meta button ids\n-- are arbitrary user-chosen strings, not row references.\nALTER TABLE messages\n  ADD COLUMN IF NOT EXISTS interactive_reply_id TEXT;\n\n-- ============================================================\n-- 2. flows\n-- ============================================================\nCREATE TABLE IF NOT EXISTS flows (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  description TEXT,\n  status TEXT NOT NULL DEFAULT 'draft'\n    CHECK (status IN ('draft', 'active', 'archived')),\n  trigger_type TEXT NOT NULL\n    CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual')),\n  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,\n  -- References `flow_nodes.node_key` (a string, not the UUID). NULL\n  -- while the flow is being authored; required before activation\n  -- (enforced by the validator, not at the DB level so drafts can save).\n  entry_node_id TEXT,\n  fallback_policy JSONB NOT NULL DEFAULT\n    '{\\"on_unknown_reply\\":\\"reprompt\\",\\"max_reprompts\\":2,\\"on_timeout_hours\\":24,\\"on_exhaust\\":\\"handoff\\"}'::jsonb,\n  execution_count INTEGER NOT NULL DEFAULT 0,\n  last_executed_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- Active-only lookups dominate the runner's hot path. Partial index\n-- keeps it small even when archived flows accumulate.\nCREATE INDEX IF NOT EXISTS idx_flows_active_trigger\n  ON flows(user_id, trigger_type)\n  WHERE status = 'active';\n\nALTER TABLE flows ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \\"Users can manage own flows\\" ON flows;\nCREATE POLICY \\"Users can manage own flows\\" ON flows FOR ALL\n  USING (auth.uid() = user_id);\n\n-- ============================================================\n-- 3. flow_nodes\n-- ============================================================\nCREATE TABLE IF NOT EXISTS flow_nodes (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,\n  node_key TEXT NOT NULL,\n  node_type TEXT NOT NULL CHECK (node_type IN (\n    'start',\n    'send_buttons',\n    'send_list',\n    'send_message',\n    'collect_input',\n    'condition',\n    'set_tag',\n    'handoff',\n    'http_fetch',\n    'end'\n  )),\n  config JSONB NOT NULL DEFAULT '{}'::jsonb,\n  -- Reserved for the v2 react-flow canvas. v1 list editor leaves both\n  -- at 0; carrying the columns now avoids a follow-up migration when\n  -- the canvas ships.\n  position_x INTEGER NOT NULL DEFAULT 0,\n  position_y INTEGER NOT NULL DEFAULT 0,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  UNIQUE (flow_id, node_key)\n);\n\nCREATE INDEX IF NOT EXISTS idx_flow_nodes_flow\n  ON flow_nodes(flow_id);\n\nALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \\"Users manage nodes on their flows\\" ON flow_nodes;\nCREATE POLICY \\"Users manage nodes on their flows\\" ON flow_nodes FOR ALL\n  USING (EXISTS (\n    SELECT 1 FROM flows f\n    WHERE f.id = flow_nodes.flow_id\n      AND f.user_id = auth.uid()\n  ));\n\n-- ============================================================\n-- 4. flow_runs\n-- ============================================================\nCREATE TABLE IF NOT EXISTS flow_runs (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  -- contact_id intentionally SET NULL on delete (matches the\n  -- automation_logs / broadcast_recipients pattern in migration 004):\n  -- deleting a contact must not erase the historical audit trail.\n  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,\n  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,\n  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (\n    'active',           -- currently awaiting customer input\n    'completed',        -- reached an end node naturally\n    'handed_off',       -- ended via a handoff node\n    'timed_out',        -- swept by the cron after fallback_policy.on_timeout_hours\n    'paused_by_agent',  -- an agent manually replied; flow yielded\n    'failed'            -- runner hit an unrecoverable error\n  )),\n  current_node_key TEXT,\n  last_prompt_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,\n  -- Captured collect_input values + http_fetch responses. Interpolated\n  -- into downstream node configs at advance time.\n  vars JSONB NOT NULL DEFAULT '{}'::jsonb,\n  reprompt_count INTEGER NOT NULL DEFAULT 0,\n  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  last_advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  ended_at TIMESTAMPTZ,\n  end_reason TEXT\n);\n\n-- Linchpin of idempotency / concurrency safety. At most one active run\n-- per (user_id, contact_id). Two concurrent webhook deliveries each\n-- trying to start a run will collide on this index; the second INSERT\n-- fails with 23505 and the runner catches & returns consumed:true.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact\n  ON flow_runs(user_id, contact_id)\n  WHERE status = 'active';\n\n-- Cron sweep query: \\"find active runs older than X hours\\" needs to be\n-- index-supported so the sweeper stays cheap as flow volume grows.\nCREATE INDEX IF NOT EXISTS idx_flow_runs_active_advanced\n  ON flow_runs(last_advanced_at)\n  WHERE status = 'active';\n\n-- Detail / history page queries: \\"list runs for this flow, newest first\\".\nCREATE INDEX IF NOT EXISTS idx_flow_runs_flow_started\n  ON flow_runs(flow_id, started_at DESC);\n\nALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \\"Users see own flow runs\\" ON flow_runs;\nCREATE POLICY \\"Users see own flow runs\\" ON flow_runs FOR SELECT\n  USING (auth.uid() = user_id);\n\n-- The runner uses service_role for all writes; users never INSERT /\n-- UPDATE / DELETE flow_runs from the client. Omitting those policies\n-- keeps the surface tight (mirrors automation_pending_executions).\n\n-- ============================================================\n-- 5. flow_run_events\n-- ============================================================\nCREATE TABLE IF NOT EXISTS flow_run_events (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,\n  event_type TEXT NOT NULL CHECK (event_type IN (\n    'started',\n    'node_entered',\n    'message_sent',\n    'reply_received',\n    'fallback_fired',\n    'handoff',\n    'timeout',\n    'error',\n    'completed'\n  )),\n  node_key TEXT,\n  payload JSONB NOT NULL DEFAULT '{}'::jsonb,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- Idempotency check in the runner needs fast lookup by\n-- (flow_run_id, event_type, payload->>'meta_message_id'). The runner\n-- does the JSONB extraction client-side; index just needs the first\n-- two columns to narrow.\nCREATE INDEX IF NOT EXISTS idx_flow_run_events_run_type\n  ON flow_run_events(flow_run_id, event_type);\n\n-- History viewer: reverse-chronological scan per run.\nCREATE INDEX IF NOT EXISTS idx_flow_run_events_run_time\n  ON flow_run_events(flow_run_id, created_at DESC);\n\nALTER TABLE flow_run_events ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \\"Users see events on their runs\\" ON flow_run_events;\nCREATE POLICY \\"Users see events on their runs\\" ON flow_run_events FOR SELECT\n  USING (EXISTS (\n    SELECT 1 FROM flow_runs r\n    WHERE r.id = flow_run_events.flow_run_id\n      AND r.user_id = auth.uid()\n  ));\n\n-- ============================================================\n-- 6. updated_at trigger on flows\n-- ============================================================\n-- Reuses update_updated_at_column() from migration 001. Trigger name\n-- matches the convention used on every other table that has one\n-- (see migration 001 lines 361-367).\nDROP TRIGGER IF EXISTS set_updated_at ON flows;\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON flows\n  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================\n-- 7. Realtime publication\n-- ============================================================\n-- Add flow_runs so the inbox can render \\"this contact is in flow X at\n-- node Y\\" live as the runner advances. Other flow tables don't need\n-- realtime — the builder reads on demand, the runner is server-side.\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'flow_runs'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE flow_runs;\n  END IF;\nEND $$;"}	010_flows	souaib@junkiescoder.com	\N	\N
20260725113126	{"-- ============================================================\n-- Per-account beta feature flag column on `profiles`.\n--\n-- Adds an array of opted-in beta feature keys to each profile row.\n-- Currently used to gate the Flows feature (`'flows'`); shape is\n-- generic so subsequent betas (e.g. `'ai_replies'`, `'voice_notes'`)\n-- can land in this column without another migration.\n--\n-- Why a per-account flag rather than a global env var:\n--   - Self-hosted wacrm instances are multi-user (small teams, shared\n--     workspaces). A global flag would force every account on the\n--     instance to opt into a not-yet-stable feature simultaneously.\n--   - The owner wanted to dogfood the feature on their own account\n--     before exposing it to teammates. Flipping a column via\n--     Supabase Studio (`UPDATE profiles SET beta_features = ...\n--     WHERE user_id = '<theirs>'`) is the lowest-friction toggle.\n--   - DB-managed flags survive env rotation, deploy-restart timing,\n--     and (since beta_features is a TEXT[]) extend naturally to\n--     additional features without further schema work.\n--\n-- Default is the empty array, so every existing profile row opts\n-- out of every beta feature on apply. NOT NULL keeps callers from\n-- having to defend against `beta_features == null` at every site.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nALTER TABLE profiles\n  ADD COLUMN IF NOT EXISTS beta_features TEXT[]\n    NOT NULL\n    DEFAULT ARRAY[]::TEXT[];\n\n-- No new RLS policy needed: the existing `Users can view own profile` /\n-- `Users can update own profile` policies (migration 001) already gate\n-- access to this column. Server-side reads via service_role bypass RLS\n-- as they do for every other column.\n--\n-- No index needed: the column is read on the login codepath (one row\n-- lookup by primary key / user_id, both already indexed) and very\n-- rarely written."}	011_profile_beta_features	souaib@junkiescoder.com	\N	\N
20260725113127	{"-- ============================================================\n-- 012_flows_increment_counter.sql\n--\n-- Atomic increment of flows.execution_count + refresh of\n-- last_executed_at. Called via PostgREST RPC from the engine.\n--\n-- Before this, startNewRun did a read-modify-write:\n--   UPDATE flows SET execution_count = <cached + 1> WHERE id = ...\n-- so two concurrent dispatches (e.g. two webhooks for the same flow\n-- starting runs for different contacts in the same second) could both\n-- read N and both write N+1, permanently losing one count.\n--\n-- Mirrors migration 007 for automations — same shape, same security\n-- posture. Idempotent: safe to re-run.\n-- ============================================================\n\nCREATE OR REPLACE FUNCTION increment_flow_execution_count(p_flow_id UUID)\nRETURNS VOID\nLANGUAGE sql\nSECURITY DEFINER\nSET search_path = public\nAS $$\n  UPDATE flows\n  SET\n    execution_count = execution_count + 1,\n    last_executed_at = NOW()\n  WHERE id = p_flow_id;\n$$;\n\n-- Only the service role needs to call this (engine uses the\n-- service-role client). Explicitly lock anon / authenticated out so\n-- an authenticated user can't juice someone else's counter via RPC.\nREVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM PUBLIC;\nREVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM anon;\nREVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM authenticated;\nGRANT EXECUTE ON FUNCTION increment_flow_execution_count(UUID) TO service_role;"}	012_flows_increment_counter	souaib@junkiescoder.com	\N	\N
20260725113148	{"-- ============================================================\n-- whatsapp_config: enforce one user per phone_number_id\n--\n-- The webhook routes inbound messages by `phone_number_id` and uses\n-- `.single()` to find the owning config row. If two users have saved\n-- the same `phone_number_id`, `.single()` errors PGRST116 (\\"multiple\n-- rows returned\\") and the webhook silently drops every inbound\n-- message — see issue #136.\n--\n-- wacrm is single-tenant per WhatsApp number by design (RLS on\n-- conversations / messages is `auth.uid() = user_id`, so another user\n-- physically cannot read a conversation routed to a different owner).\n-- A UNIQUE constraint at the DB level makes that intent enforceable\n-- and stops races between the app-level check and the insert.\n--\n-- ─── On existing data ───────────────────────────────────────────\n-- If duplicates already exist in production, this migration FAILS\n-- LOUDLY rather than silently dropping rows. Auto-deduping would\n-- destroy user data (encrypted tokens, connection state) — the\n-- operator has to choose which user keeps the number. To resolve:\n--\n--   SELECT phone_number_id, array_agg(user_id) AS owners\n--   FROM whatsapp_config\n--   GROUP BY phone_number_id\n--   HAVING count(*) > 1;\n--\n-- Then DELETE the duplicate rows you don't want to keep and re-run\n-- migrations.\n--\n-- Idempotent — safe to run multiple times once the constraint is in\n-- place.\n-- ============================================================\n\n-- 1. Fail loudly if duplicates exist. Spelling out the conflicting\n--    phone_number_id and the user_ids that own it gives the operator\n--    a copy-pasteable starting point.\nDO $$\nDECLARE\n  conflict_count INT;\n  sample TEXT;\nBEGIN\n  SELECT count(*) INTO conflict_count\n  FROM (\n    SELECT phone_number_id\n    FROM whatsapp_config\n    GROUP BY phone_number_id\n    HAVING count(*) > 1\n  ) dupes;\n\n  IF conflict_count > 0 THEN\n    SELECT string_agg(\n      phone_number_id || ' -> [' || array_to_string(owners, ', ') || ']',\n      E'\\\\n  '\n    )\n    INTO sample\n    FROM (\n      SELECT phone_number_id, array_agg(user_id::text) AS owners\n      FROM whatsapp_config\n      GROUP BY phone_number_id\n      HAVING count(*) > 1\n    ) dupe_detail;\n\n    RAISE EXCEPTION\n      E'Cannot add UNIQUE(phone_number_id) on whatsapp_config — % phone_number_id value(s) are claimed by more than one user:\\\\n  %\\\\nDelete the duplicate rows you do not want to keep (see migration comment), then re-run migrations.',\n      conflict_count,\n      sample;\n  END IF;\nEND $$;\n\n-- 2. Add the UNIQUE constraint. PostgreSQL has no \\"ADD CONSTRAINT IF\n--    NOT EXISTS\\", so guard via pg_constraint.\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint\n    WHERE conname = 'whatsapp_config_phone_number_id_key'\n      AND conrelid = 'whatsapp_config'::regclass\n  ) THEN\n    ALTER TABLE whatsapp_config\n      ADD CONSTRAINT whatsapp_config_phone_number_id_key\n      UNIQUE (phone_number_id);\n  END IF;\nEND $$;"}	013_whatsapp_config_phone_number_id_unique	souaib@junkiescoder.com	\N	\N
20260725113152	{"-- ============================================================\n-- message_templates: Meta-integration columns + raw-enum status\n--\n-- Why this exists:\n--   The original schema (001) treated message_templates as a local\n--   catalog with a TitleCase status ('Draft'|'Pending'|'Approved'|\n--   'Rejected'). When the sync route imports from Meta, several of\n--   Meta's real statuses (PAUSED, DISABLED, IN_APPEAL, PENDING_REVIEW)\n--   got collapsed into the four-bucket TitleCase set — losing\n--   information that the upcoming submit / edit / resubmit flows\n--   need (e.g. a PAUSED template is recoverable; a DISABLED one is\n--   gone for 30 days; an IN_APPEAL one shouldn't be edited).\n--\n--   This migration switches `status` to the raw Meta enum and adds\n--   the columns the submit/webhook/edit flows need:\n--\n--     - sample_values    JSONB     {body: string[], header: string[]}\n--                                  required by Meta for variable templates\n--     - meta_template_id TEXT      Meta's id once the template is\n--                                  submitted; used as hsm_id on edit/delete\n--                                  so we scope to a single language\n--     - rejection_reason TEXT      surfaced from webhook on REJECTED\n--     - quality_score    TEXT      GREEN | YELLOW | RED, from webhook\n--     - header_handle    TEXT      from Resumable Upload, for media headers\n--     - header_media_url TEXT      URL fallback for media headers (v1 path)\n--     - submission_error TEXT      last 4xx from Meta on submit, for retry\n--     - last_submitted_at          rate-limit awareness (100 creates/hour)\n--\n--   Also adds a unique index on (user_id, name, language) so the sync\n--   upsert can match on it instead of select-then-insert, and so users\n--   can't create two local rows for the same Meta template variant.\n--\n--   Buttons CHECK enforces a shape guard (array of objects with a\n--   recognised `type`) at the DB level — strict per-type validation\n--   lives in the API layer so error messages can be specific.\n--\n-- Idempotent — safe to re-run.\n-- ============================================================\n\n-- 1. New columns. ADD COLUMN IF NOT EXISTS is idempotent.\nALTER TABLE message_templates\n  ADD COLUMN IF NOT EXISTS sample_values JSONB,\n  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,\n  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,\n  ADD COLUMN IF NOT EXISTS quality_score TEXT,\n  ADD COLUMN IF NOT EXISTS header_handle TEXT,\n  ADD COLUMN IF NOT EXISTS header_media_url TEXT,\n  ADD COLUMN IF NOT EXISTS submission_error TEXT,\n  ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ;\n\n-- 2. quality_score CHECK — GREEN / YELLOW / RED only (or NULL).\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint\n    WHERE conname = 'message_templates_quality_score_check'\n      AND conrelid = 'message_templates'::regclass\n  ) THEN\n    ALTER TABLE message_templates\n      ADD CONSTRAINT message_templates_quality_score_check\n      CHECK (quality_score IS NULL OR quality_score IN ('GREEN', 'YELLOW', 'RED'));\n  END IF;\nEND $$;\n\n-- 3. status: swap TitleCase enum for raw Meta enum.\n--    Order: drop old check → backfill data → add new check → update default.\n--    Doing it in this order means rows are momentarily check-free, but\n--    the backfill is a single UPDATE so the window is microseconds.\nDO $$\nBEGIN\n  -- Drop the legacy check by introspecting pg_constraint (the original\n  -- constraint name from migration 001 is auto-generated; match by\n  -- column + table).\n  IF EXISTS (\n    SELECT 1\n    FROM pg_constraint c\n    WHERE c.conrelid = 'message_templates'::regclass\n      AND c.contype = 'c'\n      AND pg_get_constraintdef(c.oid) ILIKE '%status%Draft%Pending%Approved%Rejected%'\n  ) THEN\n    EXECUTE (\n      SELECT 'ALTER TABLE message_templates DROP CONSTRAINT ' || quote_ident(conname)\n      FROM pg_constraint c\n      WHERE c.conrelid = 'message_templates'::regclass\n        AND c.contype = 'c'\n        AND pg_get_constraintdef(c.oid) ILIKE '%status%Draft%Pending%Approved%Rejected%'\n      LIMIT 1\n    );\n  END IF;\nEND $$;\n\n-- Backfill existing rows. Idempotent — already-uppercase rows are no-ops.\nUPDATE message_templates SET status = 'DRAFT'    WHERE status = 'Draft';\nUPDATE message_templates SET status = 'PENDING'  WHERE status = 'Pending';\nUPDATE message_templates SET status = 'APPROVED' WHERE status = 'Approved';\nUPDATE message_templates SET status = 'REJECTED' WHERE status = 'Rejected';\n\n-- Add the raw-enum check.\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint\n    WHERE conname = 'message_templates_status_meta_check'\n      AND conrelid = 'message_templates'::regclass\n  ) THEN\n    ALTER TABLE message_templates\n      ADD CONSTRAINT message_templates_status_meta_check\n      CHECK (status IN (\n        'DRAFT',\n        'PENDING',\n        'APPROVED',\n        'REJECTED',\n        'PAUSED',\n        'DISABLED',\n        'IN_APPEAL',\n        'PENDING_DELETION'\n      ));\n  END IF;\nEND $$;\n\n-- New default for fresh inserts.\nALTER TABLE message_templates ALTER COLUMN status SET DEFAULT 'DRAFT';\n\n-- 4. buttons shape guard. Postgres disallows subqueries in CHECK\n--    constraints, so we can only assert the outer shape here (is-array\n--    + max length). Per-element type validation (recognised `type`\n--    values, max counts per type, QUICK_REPLY-vs-CTA exclusivity, URL\n--    example required when {{1}} is present) lives in the API\n--    validators in src/lib/whatsapp/template-validators.ts — that's\n--    where error messages can be specific to the offending button\n--    anyway.\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint\n    WHERE conname = 'message_templates_buttons_shape_check'\n      AND conrelid = 'message_templates'::regclass\n  ) THEN\n    ALTER TABLE message_templates\n      ADD CONSTRAINT message_templates_buttons_shape_check\n      CHECK (\n        buttons IS NULL\n        OR (\n          jsonb_typeof(buttons) = 'array'\n          AND jsonb_array_length(buttons) <= 10\n        )\n      );\n  END IF;\nEND $$;\n\n-- 5. Unique index on (user_id, name, language). Fails loudly on\n--    duplicates rather than dropping rows — the operator picks which\n--    one to keep (same pattern as migration 013).\nDO $$\nDECLARE\n  dupe_count INT;\n  sample TEXT;\nBEGIN\n  SELECT count(*) INTO dupe_count\n  FROM (\n    SELECT user_id, name, language\n    FROM message_templates\n    GROUP BY user_id, name, language\n    HAVING count(*) > 1\n  ) dupes;\n\n  IF dupe_count > 0 THEN\n    SELECT string_agg(\n      user_id::text || ' / ' || name || ' / ' || COALESCE(language, '(null)') ||\n        ' (' || count || ' rows)',\n      E'\\\\n  '\n    )\n    INTO sample\n    FROM (\n      SELECT user_id, name, language, count(*) AS count\n      FROM message_templates\n      GROUP BY user_id, name, language\n      HAVING count(*) > 1\n    ) dupe_detail;\n\n    RAISE EXCEPTION\n      E'Cannot add UNIQUE(user_id, name, language) on message_templates — % duplicate combination(s):\\\\n  %\\\\nDelete the rows you do not want to keep, then re-run migrations.',\n      dupe_count, sample;\n  END IF;\nEND $$;\n\nCREATE UNIQUE INDEX IF NOT EXISTS message_templates_user_name_language_key\n  ON message_templates (user_id, name, language);\n\n-- 6. Lookup index for the webhook handler — incoming events identify\n--    templates by (waba_id, meta_template_id). meta_template_id is the\n--    discriminator we'll match on.\nCREATE INDEX IF NOT EXISTS idx_message_templates_meta_template_id\n  ON message_templates (meta_template_id)\n  WHERE meta_template_id IS NOT NULL;"}	014_message_templates_meta_integration	souaib@junkiescoder.com	\N	\N
20260725113520	{"-- ============================================================\n-- 017_account_sharing.sql — Multi-user accounts (foundation)\n--\n-- Turns wacrm from single-tenant-per-user into multi-tenant-per-\n-- account. Every existing user becomes the sole `owner` of a\n-- freshly-created account; every existing row is backfilled with\n-- that account's id. Post-apply behaviour is identical to before\n-- *until* a teammate is invited (which lands in later PRs).\n--\n-- What this migration does\n--   1. Introduces `account_role_enum` and tables `accounts` /\n--      `account_invitations`.\n--   2. Adds an `is_account_member(account_id, min_role)` SECURITY\n--      DEFINER helper used by every policy below.\n--   3. Adds `account_id` (+ `account_role` on `profiles`) to every\n--      table that previously carried a `user_id` FK to auth.users.\n--   4. Backfills one account per existing user and propagates\n--      `account_id` to every domain row.\n--   5. Drops the old `auth.uid() = user_id` policies and replaces\n--      them with membership-checked equivalents. Viewers may read;\n--      agents+ may write to operational data; admins+ may write to\n--      settings-class tables.\n--   6. Swaps `whatsapp_config.UNIQUE(user_id)` for\n--      `UNIQUE(account_id)` — one WhatsApp number per account.\n--   7. Swaps the `flow_runs` \\"one active run per (user_id, contact)\\"\n--      unique index for `(account_id, contact_id)`.\n--   8. Replaces `handle_new_user` so new signups receive a freshly-\n--      created personal account *and* the `owner` role atomically.\n--\n-- What this migration does NOT touch\n--   - `profiles.role TEXT` (legacy, unused) stays. Flag for removal\n--     in a later cleanup.\n--   - The `user_id` columns on domain tables stay too — they still\n--     identify \\"the agent who owns this row\\" (assignment, audit).\n--     They are *no longer* used for tenancy isolation.\n--   - Storage buckets (avatars, flow-media) stay user-scoped. A\n--     later migration will rescope flow-media to account paths.\n--   - No user-facing UI changes — those are gated separately on\n--     `profiles.beta_features` containing 'account_sharing' in the\n--     follow-up PRs.\n--\n-- Idempotent — safe to run multiple times. New columns use\n-- IF NOT EXISTS; policies / triggers / indexes are dropped before\n-- recreate (Postgres has no CREATE POLICY IF NOT EXISTS).\n-- ============================================================\n\n-- ============================================================\n-- TYPES\n-- ============================================================\nDO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN\n    CREATE TYPE account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');\n  END IF;\nEND $$;\n\n-- ============================================================\n-- ACCOUNTS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS accounts (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  name TEXT NOT NULL,\n  -- owner_user_id is denormalised for fast \\"is this user the owner of\n  -- their account\\" reads and for the one-account-per-user invariant\n  -- below. The source of truth for membership is profiles.account_id.\n  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- One account per user (the locked design decision — single\n-- membership). Drops automatically if we ever relax to many-to-many.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_per_owner\n  ON accounts(owner_user_id);\n\nALTER TABLE accounts ENABLE ROW LEVEL SECURITY;\n\nDROP TRIGGER IF EXISTS set_updated_at ON accounts;\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts\n  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================\n-- ACCOUNT_INVITATIONS\n--\n-- One row per outstanding invite link. We store `token_hash` (SHA-\n-- 256) rather than the raw token so a leaked DB snapshot doesn't\n-- yield a usable invite. The plaintext token is returned exactly\n-- once by the POST endpoint at creation time and never persisted.\n-- ============================================================\nCREATE TABLE IF NOT EXISTS account_invitations (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  token_hash TEXT NOT NULL UNIQUE,\n  role account_role_enum NOT NULL CHECK (role <> 'owner'),\n  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,\n  label TEXT,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  expires_at TIMESTAMPTZ NOT NULL,\n  accepted_at TIMESTAMPTZ,\n  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_account_invitations_account_pending\n  ON account_invitations(account_id, expires_at)\n  WHERE accepted_at IS NULL;\n\nALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;\n\n-- ============================================================\n-- PROFILE EXTENSION\n--\n-- account_role lives on profiles (not a separate memberships table)\n-- because the design is one-account-per-user; this keeps reads cheap\n-- (one row, already loaded by the auth hook).\n--\n-- Added BEFORE the is_account_member helper below because LANGUAGE\n-- sql functions resolve column references at CREATE time (unlike\n-- plpgsql, which defers to call time).\n-- ============================================================\nALTER TABLE profiles\n  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,\n  ADD COLUMN IF NOT EXISTS account_role account_role_enum;\n\nCREATE INDEX IF NOT EXISTS idx_profiles_account_role\n  ON profiles(account_id, account_role);\n\n-- ============================================================\n-- MEMBERSHIP HELPER\n--\n-- SECURITY DEFINER so the policy body can read `profiles` without\n-- recursive RLS evaluation. Returns true iff `auth.uid()` is a\n-- member of `target_account_id` with at least `min_role`.\n--\n-- Role hierarchy: owner > admin > agent > viewer.\n-- ============================================================\nCREATE OR REPLACE FUNCTION is_account_member(\n  target_account_id UUID,\n  min_role account_role_enum DEFAULT 'viewer'\n) RETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\n  SELECT EXISTS (\n    SELECT 1\n    FROM profiles p\n    WHERE p.user_id = auth.uid()\n      AND p.account_id = target_account_id\n      AND CASE p.account_role\n            WHEN 'owner'  THEN 4\n            WHEN 'admin'  THEN 3\n            WHEN 'agent'  THEN 2\n            WHEN 'viewer' THEN 1\n          END\n        >=\n          CASE min_role\n            WHEN 'owner'  THEN 4\n            WHEN 'admin'  THEN 3\n            WHEN 'agent'  THEN 2\n            WHEN 'viewer' THEN 1\n          END\n  );\n$$;\n\nALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;\nGRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;\n\n-- ============================================================\n-- ADD account_id TO EVERY PARENT TENANT TABLE\n--\n-- Nullable for now — backfill runs below, then NOT NULL applied at\n-- the end. Indexes too: every \\"list mine\\" query becomes \\"list my\n-- account's\\", so account_id is the new hot lookup key.\n-- ============================================================\nALTER TABLE contacts                       ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE tags                           ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE custom_fields                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE contact_notes                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE conversations                  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE whatsapp_config                ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE message_templates              ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE pipelines                      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE deals                          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE broadcasts                     ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE automations                    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE automation_logs                ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE automation_pending_executions  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE flows                          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\nALTER TABLE flow_runs                      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;\n\n-- ============================================================\n-- BACKFILL\n--\n-- Order is load-bearing:\n--   0. Heal orphaned auth.users that never got a profile row.\n--   1. Create one account per existing profile (the existing user\n--      is the owner).\n--   2. Stamp profile.account_id / account_role from the row above.\n--   3. Propagate account_id to every domain table via the profile.\n--   4. Apply NOT NULL on every account_id column.\n--\n-- Wrapped in a DO block so a partially-applied migration (e.g.\n-- accounts already exist but propagation didn't finish) re-converges\n-- on re-run rather than duplicating accounts.\n-- ============================================================\nDO $$\nDECLARE\n  v_table TEXT;\n  v_tables TEXT[] := ARRAY[\n    'contacts', 'tags', 'custom_fields', 'contact_notes',\n    'conversations', 'whatsapp_config', 'message_templates',\n    'pipelines', 'deals', 'broadcasts',\n    'automations', 'automation_logs', 'automation_pending_executions',\n    'flows', 'flow_runs'\n  ];\nBEGIN\n  -- (0) Heal orphaned users. The pre-017 signup trigger (migration\n  -- 001) inserted the profile inside an `EXCEPTION WHEN OTHERS ...\n  -- RAISE WARNING; RETURN NEW` block, so a signup could leave an\n  -- auth.users row with no matching profiles row. Those orphans would\n  -- be skipped by step (1) below, get no account, and — if they own\n  -- any domain rows (pre-017 RLS only required auth.uid() = user_id,\n  -- not a profile) — leave account_id NULL and abort the SET NOT NULL\n  -- step. Backfilling the missing profile first keys the whole backfill\n  -- off auth.users instead of profiles, so every authenticated user is\n  -- migrated and no domain row can be left without an account.\n  -- full_name / email are NOT NULL on profiles, hence the COALESCE.\n  INSERT INTO public.profiles (user_id, full_name, email)\n  SELECT u.id,\n         COALESCE(u.raw_user_meta_data->>'full_name', ''),\n         COALESCE(u.email, '')\n  FROM auth.users u\n  WHERE NOT EXISTS (\n    SELECT 1 FROM public.profiles p WHERE p.user_id = u.id\n  );\n\n  -- (1) Create one account per existing profile whose user does not\n  -- yet own one. Idempotent: skips users that already have an account.\n  INSERT INTO accounts (name, owner_user_id)\n  SELECT COALESCE(NULLIF(p.full_name, ''), p.email, 'My account'),\n         p.user_id\n  FROM profiles p\n  WHERE NOT EXISTS (\n    SELECT 1 FROM accounts a WHERE a.owner_user_id = p.user_id\n  );\n\n  -- (2) Stamp profile.account_id / account_role for every profile that\n  -- hasn't been linked yet.\n  UPDATE profiles p\n  SET account_id   = a.id,\n      account_role = 'owner'\n  FROM accounts a\n  WHERE a.owner_user_id = p.user_id\n    AND p.account_id IS NULL;\n\n  -- (3) Propagate account_id to every domain table. Uses the row's\n  -- existing user_id → profiles.user_id → profiles.account_id chain.\n  -- Only updates rows where account_id IS NULL so a re-run is cheap.\n  FOREACH v_table IN ARRAY v_tables LOOP\n    EXECUTE format($f$\n      UPDATE %I t\n      SET account_id = p.account_id\n      FROM profiles p\n      WHERE t.user_id = p.user_id\n        AND t.account_id IS NULL\n    $f$, v_table);\n  END LOOP;\nEND $$;\n\n-- (4) NOT NULL — split out from the DO block so DDL changes happen\n-- at the top transactional level. Idempotent: NOT NULL on an\n-- already-NOT NULL column is a no-op error-free.\nALTER TABLE profiles                       ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE profiles                       ALTER COLUMN account_role SET NOT NULL;\nALTER TABLE contacts                       ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE tags                           ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE custom_fields                  ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE contact_notes                  ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE conversations                  ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE whatsapp_config                ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE message_templates              ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE pipelines                      ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE deals                          ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE broadcasts                     ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE automations                    ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE automation_logs                ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE automation_pending_executions  ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE flows                          ALTER COLUMN account_id   SET NOT NULL;\nALTER TABLE flow_runs                      ALTER COLUMN account_id   SET NOT NULL;\n\n-- ============================================================\n-- INDEXES ON account_id (every parent — these are the new hot keys)\n-- ============================================================\nCREATE INDEX IF NOT EXISTS idx_contacts_account                ON contacts(account_id);\nCREATE INDEX IF NOT EXISTS idx_tags_account                    ON tags(account_id);\nCREATE INDEX IF NOT EXISTS idx_custom_fields_account           ON custom_fields(account_id);\nCREATE INDEX IF NOT EXISTS idx_contact_notes_account           ON contact_notes(account_id);\nCREATE INDEX IF NOT EXISTS idx_conversations_account           ON conversations(account_id);\nCREATE INDEX IF NOT EXISTS idx_whatsapp_config_account         ON whatsapp_config(account_id);\nCREATE INDEX IF NOT EXISTS idx_message_templates_account       ON message_templates(account_id);\nCREATE INDEX IF NOT EXISTS idx_pipelines_account               ON pipelines(account_id);\nCREATE INDEX IF NOT EXISTS idx_deals_account                   ON deals(account_id);\nCREATE INDEX IF NOT EXISTS idx_broadcasts_account              ON broadcasts(account_id);\nCREATE INDEX IF NOT EXISTS idx_automations_account             ON automations(account_id);\nCREATE INDEX IF NOT EXISTS idx_automation_logs_account         ON automation_logs(account_id);\nCREATE INDEX IF NOT EXISTS idx_automation_pending_account      ON automation_pending_executions(account_id);\nCREATE INDEX IF NOT EXISTS idx_flows_account                   ON flows(account_id);\nCREATE INDEX IF NOT EXISTS idx_flow_runs_account               ON flow_runs(account_id);\n\n-- ============================================================\n-- whatsapp_config: one WhatsApp number per ACCOUNT\n--\n-- Was UNIQUE(user_id). Same number cannot be configured by two\n-- accounts; same account cannot register two numbers. If multi-\n-- number-per-account is ever wanted, drop the unique and add a\n-- \\"primary\\" boolean.\n-- ============================================================\nALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_user_id_key;\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conname = 'whatsapp_config_account_id_key'\n  ) THEN\n    ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id);\n  END IF;\nEND $$;\n\n-- ============================================================\n-- flow_runs: idempotency key swaps to (account_id, contact_id)\n--\n-- The \\"at most one active run per contact\\" invariant is per-account\n-- now — two accounts that happen to share a contact phone number\n-- must be able to run their own flows independently.\n-- ============================================================\nDROP INDEX IF EXISTS idx_one_active_run_per_contact;\nCREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact\n  ON flow_runs(account_id, contact_id)\n  WHERE status = 'active';\n\n-- ============================================================\n-- RLS REWRITE — PARENT TABLES\n--\n-- Replaces every `auth.uid() = user_id` policy with the membership\n-- check. Three policy tiers:\n--   - viewer    : SELECT  (read-only)\n--   - agent+    : SELECT + INSERT/UPDATE/DELETE (operational data)\n--   - admin+    : same  + write paths on settings-class tables\n--\n-- The legacy `user_id` column stays on every row (still useful for\n-- assignment + audit) but is no longer consulted for isolation.\n-- ============================================================\n\n-- Make the RLS rewrite re-runnable. CREATE POLICY has no IF NOT EXISTS\n-- form, and the DROP statements below only name the *legacy* policies —\n-- the new ones (contacts_select, …) would error with 42710 \\"policy\n-- already exists\\" on a second run. 017 owns every policy on these tables\n-- (no later migration adds others), so drop them all first, then the\n-- CREATEs below re-establish the full set.\nDO $$\nDECLARE\n  pol RECORD;\nBEGIN\n  FOR pol IN\n    SELECT policyname, tablename\n    FROM pg_policies\n    WHERE schemaname = 'public'\n      AND tablename = ANY (ARRAY[\n        'contacts', 'tags', 'custom_fields', 'contact_notes',\n        'conversations', 'whatsapp_config', 'message_templates',\n        'pipelines', 'deals', 'broadcasts', 'automations',\n        'automation_logs', 'flows', 'flow_runs', 'contact_tags',\n        'contact_custom_values', 'messages', 'pipeline_stages',\n        'broadcast_recipients', 'automation_steps', 'flow_nodes',\n        'flow_run_events', 'message_reactions', 'profiles',\n        'accounts', 'account_invitations'\n      ])\n  LOOP\n    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);\n  END LOOP;\nEND $$;\n\n-- ---- contacts ---------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own contacts\\" ON contacts;\nCREATE POLICY contacts_select ON contacts FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY contacts_update ON contacts FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY contacts_delete ON contacts FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- tags (settings-class) -------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own tags\\" ON tags;\nCREATE POLICY tags_select ON tags FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY tags_insert ON tags FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));\nCREATE POLICY tags_update ON tags FOR UPDATE USING (is_account_member(account_id, 'admin'));\nCREATE POLICY tags_delete ON tags FOR DELETE USING (is_account_member(account_id, 'admin'));\n\n-- ---- custom_fields (settings-class) ----------------------------\nDROP POLICY IF EXISTS \\"Users can manage own custom fields\\" ON custom_fields;\nCREATE POLICY custom_fields_select ON custom_fields FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY custom_fields_insert ON custom_fields FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));\nCREATE POLICY custom_fields_update ON custom_fields FOR UPDATE USING (is_account_member(account_id, 'admin'));\nCREATE POLICY custom_fields_delete ON custom_fields FOR DELETE USING (is_account_member(account_id, 'admin'));\n\n-- ---- contact_notes ---------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own notes\\" ON contact_notes;\nCREATE POLICY contact_notes_select ON contact_notes FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY contact_notes_insert ON contact_notes FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY contact_notes_update ON contact_notes FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY contact_notes_delete ON contact_notes FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- conversations ---------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own conversations\\" ON conversations;\nCREATE POLICY conversations_select ON conversations FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY conversations_update ON conversations FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY conversations_delete ON conversations FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- whatsapp_config (settings-class) --------------------------\nDROP POLICY IF EXISTS \\"Users can manage own config\\" ON whatsapp_config;\nCREATE POLICY whatsapp_config_select ON whatsapp_config FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY whatsapp_config_insert ON whatsapp_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));\nCREATE POLICY whatsapp_config_update ON whatsapp_config FOR UPDATE USING (is_account_member(account_id, 'admin'));\nCREATE POLICY whatsapp_config_delete ON whatsapp_config FOR DELETE USING (is_account_member(account_id, 'admin'));\n\n-- ---- message_templates (settings-class) ------------------------\nDROP POLICY IF EXISTS \\"Users can manage own templates\\" ON message_templates;\nCREATE POLICY message_templates_select ON message_templates FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY message_templates_insert ON message_templates FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));\nCREATE POLICY message_templates_update ON message_templates FOR UPDATE USING (is_account_member(account_id, 'admin'));\nCREATE POLICY message_templates_delete ON message_templates FOR DELETE USING (is_account_member(account_id, 'admin'));\n\n-- ---- pipelines (settings-class) --------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own pipelines\\" ON pipelines;\nCREATE POLICY pipelines_select ON pipelines FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY pipelines_insert ON pipelines FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));\nCREATE POLICY pipelines_update ON pipelines FOR UPDATE USING (is_account_member(account_id, 'admin'));\nCREATE POLICY pipelines_delete ON pipelines FOR DELETE USING (is_account_member(account_id, 'admin'));\n\n-- ---- deals ------------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own deals\\" ON deals;\nCREATE POLICY deals_select ON deals FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY deals_update ON deals FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY deals_delete ON deals FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- broadcasts -------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own broadcasts\\" ON broadcasts;\nCREATE POLICY broadcasts_select ON broadcasts FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY broadcasts_insert ON broadcasts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY broadcasts_update ON broadcasts FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY broadcasts_delete ON broadcasts FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- automations ------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own automations\\" ON automations;\nCREATE POLICY automations_select ON automations FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY automations_insert ON automations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY automations_update ON automations FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY automations_delete ON automations FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- automation_logs -------------------------------------------\nDROP POLICY IF EXISTS \\"Users can view own automation logs\\" ON automation_logs;\nCREATE POLICY automation_logs_select ON automation_logs FOR SELECT USING (is_account_member(account_id));\n-- Service role inserts logs; no INSERT/UPDATE/DELETE policy for clients.\n\n-- ---- automation_pending_executions -----------------------------\n-- Service-role only (no client policies). Account_id is on the row\n-- for consistency and so the cron can route account-scoped queries.\n\n-- ---- flows ------------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage own flows\\" ON flows;\nCREATE POLICY flows_select ON flows FOR SELECT USING (is_account_member(account_id));\nCREATE POLICY flows_insert ON flows FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY flows_update ON flows FOR UPDATE USING (is_account_member(account_id, 'agent'));\nCREATE POLICY flows_delete ON flows FOR DELETE USING (is_account_member(account_id, 'agent'));\n\n-- ---- flow_runs --------------------------------------------------\nDROP POLICY IF EXISTS \\"Users see own flow runs\\" ON flow_runs;\nCREATE POLICY flow_runs_select ON flow_runs FOR SELECT USING (is_account_member(account_id));\n-- Service-role driven; no client INSERT/UPDATE/DELETE.\n\n-- ============================================================\n-- RLS REWRITE — CHILD TABLES (parent-join semantics)\n-- ============================================================\n\n-- ---- contact_tags ----------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage contact tags\\" ON contact_tags;\nCREATE POLICY contact_tags_select ON contact_tags FOR SELECT USING (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id))\n);\nCREATE POLICY contact_tags_modify ON contact_tags FOR ALL USING (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))\n);\n\n-- ---- contact_custom_values -------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage custom values\\" ON contact_custom_values;\nCREATE POLICY contact_custom_values_select ON contact_custom_values FOR SELECT USING (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id))\n);\nCREATE POLICY contact_custom_values_modify ON contact_custom_values FOR ALL USING (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))\n);\n\n-- ---- messages --------------------------------------------------\nDROP POLICY IF EXISTS \\"Users can view own messages\\" ON messages;\nDROP POLICY IF EXISTS \\"Service role can insert messages\\" ON messages;\nCREATE POLICY messages_select ON messages FOR SELECT USING (\n  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id))\n);\nCREATE POLICY messages_modify ON messages FOR ALL USING (\n  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))\n);\n-- Service-role webhook inserts (Meta deliveries) bypass RLS as before.\n\n-- ---- pipeline_stages -------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage pipeline stages\\" ON pipeline_stages;\nCREATE POLICY pipeline_stages_select ON pipeline_stages FOR SELECT USING (\n  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id))\n);\nCREATE POLICY pipeline_stages_modify ON pipeline_stages FOR ALL USING (\n  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))\n);\n\n-- ---- broadcast_recipients --------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage broadcast recipients\\" ON broadcast_recipients;\nCREATE POLICY broadcast_recipients_select ON broadcast_recipients FOR SELECT USING (\n  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id))\n);\nCREATE POLICY broadcast_recipients_modify ON broadcast_recipients FOR ALL USING (\n  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))\n);\n\n-- ---- automation_steps ------------------------------------------\nDROP POLICY IF EXISTS \\"Users can manage steps of own automations\\" ON automation_steps;\nCREATE POLICY automation_steps_select ON automation_steps FOR SELECT USING (\n  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id))\n);\nCREATE POLICY automation_steps_modify ON automation_steps FOR ALL USING (\n  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))\n);\n\n-- ---- flow_nodes ------------------------------------------------\nDROP POLICY IF EXISTS \\"Users manage nodes on their flows\\" ON flow_nodes;\nCREATE POLICY flow_nodes_select ON flow_nodes FOR SELECT USING (\n  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id))\n);\nCREATE POLICY flow_nodes_modify ON flow_nodes FOR ALL USING (\n  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))\n) WITH CHECK (\n  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))\n);\n\n-- ---- flow_run_events -------------------------------------------\nDROP POLICY IF EXISTS \\"Users see events on their runs\\" ON flow_run_events;\nCREATE POLICY flow_run_events_select ON flow_run_events FOR SELECT USING (\n  EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = flow_run_events.flow_run_id AND is_account_member(r.account_id))\n);\n\n-- ---- message_reactions -----------------------------------------\nDROP POLICY IF EXISTS \\"Users see reactions on their conversations\\" ON message_reactions;\nDROP POLICY IF EXISTS \\"Users insert reactions on their conversations\\" ON message_reactions;\nDROP POLICY IF EXISTS \\"Users delete their own agent reactions\\" ON message_reactions;\nDROP POLICY IF EXISTS \\"Users update their own agent reactions\\" ON message_reactions;\nCREATE POLICY message_reactions_select ON message_reactions FOR SELECT USING (\n  EXISTS (\n    SELECT 1 FROM messages m\n    JOIN conversations c ON c.id = m.conversation_id\n    WHERE m.id = message_reactions.message_id\n      AND is_account_member(c.account_id)\n  )\n);\nCREATE POLICY message_reactions_modify ON message_reactions FOR ALL USING (\n  EXISTS (\n    SELECT 1 FROM messages m\n    JOIN conversations c ON c.id = m.conversation_id\n    WHERE m.id = message_reactions.message_id\n      AND is_account_member(c.account_id, 'agent')\n  )\n) WITH CHECK (\n  EXISTS (\n    SELECT 1 FROM messages m\n    JOIN conversations c ON c.id = m.conversation_id\n    WHERE m.id = message_reactions.message_id\n      AND is_account_member(c.account_id, 'agent')\n  )\n);\n\n-- ============================================================\n-- RLS — PROFILES (revised)\n--\n-- A profile row is readable by every member of its account so the\n-- Members tab can render. It is only writable by the row's own\n-- user (so an admin cannot edit a teammate's name/avatar — that's\n-- the teammate's own settings). Role changes happen via the\n-- separate /api/account/members endpoint (admin-only, server-side).\n-- ============================================================\nDROP POLICY IF EXISTS \\"Users can view own profile\\" ON profiles;\nDROP POLICY IF EXISTS \\"Users can update own profile\\" ON profiles;\nDROP POLICY IF EXISTS \\"Users can insert own profile\\" ON profiles;\nCREATE POLICY profiles_select ON profiles FOR SELECT\n  USING (auth.uid() = user_id OR is_account_member(account_id));\nCREATE POLICY profiles_update ON profiles FOR UPDATE\n  USING (auth.uid() = user_id)\n  WITH CHECK (auth.uid() = user_id);\nCREATE POLICY profiles_insert ON profiles FOR INSERT\n  WITH CHECK (auth.uid() = user_id);\n\n-- ============================================================\n-- RLS — ACCOUNTS & ACCOUNT_INVITATIONS\n--\n-- accounts: members read; admins+ update; nobody inserts via\n-- client (the signup trigger / redeem RPC own creation).\n-- invitations: admins+ full control; everyone else has no\n-- visibility. The /api/invitations/[token]/peek endpoint uses the\n-- service role to look up by token_hash anonymously.\n-- ============================================================\nDROP POLICY IF EXISTS accounts_select ON accounts;\nDROP POLICY IF EXISTS accounts_update ON accounts;\nCREATE POLICY accounts_select ON accounts FOR SELECT\n  USING (is_account_member(id));\nCREATE POLICY accounts_update ON accounts FOR UPDATE\n  USING (is_account_member(id, 'admin'))\n  WITH CHECK (is_account_member(id, 'admin'));\n\nDROP POLICY IF EXISTS account_invitations_select ON account_invitations;\nDROP POLICY IF EXISTS account_invitations_modify ON account_invitations;\nCREATE POLICY account_invitations_select ON account_invitations FOR SELECT\n  USING (is_account_member(account_id, 'admin'));\nCREATE POLICY account_invitations_modify ON account_invitations FOR ALL\n  USING (is_account_member(account_id, 'admin'))\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\n-- ============================================================\n-- SIGNUP TRIGGER — replace to also create a personal account\n--\n-- Every new auth.users row now produces:\n--   - a fresh `accounts` row owned by them\n--   - a `profiles` row linked to that account with role = 'owner'\n--\n-- The invite-redemption RPC (later PR) will reassign profile.account_id\n-- to the inviter's account and delete the orphan personal account if\n-- it's still empty.\n-- ============================================================\nDROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\nDROP FUNCTION IF EXISTS public.handle_new_user();\n\nCREATE OR REPLACE FUNCTION public.handle_new_user()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_full_name TEXT;\n  v_account_id UUID;\nBEGIN\n  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');\n\n  INSERT INTO public.accounts (name, owner_user_id)\n  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)\n  RETURNING id INTO v_account_id;\n\n  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)\n  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');\n\n  RETURN NEW;\nEXCEPTION WHEN OTHERS THEN\n  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;\n  RETURN NEW;\nEND;\n$$;\n\nALTER FUNCTION public.handle_new_user() OWNER TO postgres;\n\nCREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();"}	017_account_sharing	souaib@junkiescoder.com	\N	\N
20260725113548	{"-- ============================================================\n-- 018_account_member_rpcs.sql — RPCs for member management\n--\n-- Why RPCs and not direct UPDATEs from the client\n--\n--   The `profiles_update` RLS policy from migration 017 only\n--   allows a user to update their *own* profile row. That is\n--   correct for self-service edits (name, avatar) but it would\n--   block an admin from changing a teammate's role or moving\n--   a removed member to a fresh personal account.\n--\n--   These three SECURITY DEFINER functions are the supervised\n--   escape hatches: they bypass RLS to do exactly the writes the\n--   matching API route needs, but every function self-checks the\n--   caller's authority via `auth.uid()` first, so the privilege\n--   bypass is scoped tightly.\n--\n-- Error contract\n--\n--   All functions raise Postgres exceptions with these SQLSTATEs:\n--     42501 (\\"insufficient_privilege\\") — forbidden\n--     22023 (\\"invalid_parameter_value\\") — bad input / 400\n--   The `toErrorResponse` helper on the API side maps each to\n--   the right HTTP status, with the RAISE message surfaced to\n--   the caller.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- set_member_role(p_user_id, p_new_role)\n--\n-- Admin+ changes another member's role within the caller's\n-- account. Cannot promote to / demote from 'owner' (that is the\n-- transfer endpoint). Cannot target self.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.set_member_role(\n  p_user_id UUID,\n  p_new_role account_role_enum\n) RETURNS VOID\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_caller_account_id UUID;\n  v_caller_role account_role_enum;\n  v_target_account_id UUID;\n  v_target_role account_role_enum;\nBEGIN\n  -- Caller must be authenticated.\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  -- Resolve caller's account + role.\n  SELECT account_id, account_role\n  INTO v_caller_account_id, v_caller_role\n  FROM profiles\n  WHERE user_id = auth.uid();\n\n  IF v_caller_account_id IS NULL THEN\n    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';\n  END IF;\n\n  -- Caller must be admin+.\n  IF v_caller_role NOT IN ('owner', 'admin') THEN\n    RAISE EXCEPTION 'This action requires the admin role or higher'\n      USING ERRCODE = '42501';\n  END IF;\n\n  -- Can't change own role via this endpoint.\n  IF p_user_id = auth.uid() THEN\n    RAISE EXCEPTION 'Cannot change your own role'\n      USING ERRCODE = '22023';\n  END IF;\n\n  -- Resolve target.\n  SELECT account_id, account_role\n  INTO v_target_account_id, v_target_role\n  FROM profiles\n  WHERE user_id = p_user_id;\n\n  IF v_target_account_id IS NULL THEN\n    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';\n  END IF;\n\n  -- Target must be in caller's account.\n  IF v_target_account_id <> v_caller_account_id THEN\n    RAISE EXCEPTION 'Target user is not a member of your account'\n      USING ERRCODE = '42501';\n  END IF;\n\n  -- Owner role changes go through transfer_account_ownership.\n  IF v_target_role = 'owner' THEN\n    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'\n      USING ERRCODE = '22023';\n  END IF;\n  IF p_new_role = 'owner' THEN\n    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'\n      USING ERRCODE = '22023';\n  END IF;\n\n  UPDATE profiles\n  SET account_role = p_new_role\n  WHERE user_id = p_user_id;\nEND;\n$$;\n\nALTER FUNCTION public.set_member_role(UUID, account_role_enum) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.set_member_role(UUID, account_role_enum) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum) TO authenticated;\n\n-- ============================================================\n-- remove_account_member(p_user_id)\n--\n-- Admin+ removes another member from the caller's account. The\n-- removed user is NOT deleted from auth.users — they keep their\n-- login. Instead, a fresh personal account is created on the fly\n-- and their profile is reassigned to it as 'owner'. This is the\n-- mirror image of the signup trigger: the user effectively\n-- \\"starts over\\" with an empty account, free to invite their own\n-- teammates if they want.\n--\n-- Cannot target the owner. Cannot target self.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.remove_account_member(\n  p_user_id UUID\n) RETURNS UUID  -- the new personal account id\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_caller_account_id UUID;\n  v_caller_role account_role_enum;\n  v_target_account_id UUID;\n  v_target_role account_role_enum;\n  v_target_name TEXT;\n  v_target_email TEXT;\n  v_new_account_id UUID;\nBEGIN\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  SELECT account_id, account_role\n  INTO v_caller_account_id, v_caller_role\n  FROM profiles\n  WHERE user_id = auth.uid();\n\n  IF v_caller_account_id IS NULL THEN\n    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';\n  END IF;\n\n  IF v_caller_role NOT IN ('owner', 'admin') THEN\n    RAISE EXCEPTION 'This action requires the admin role or higher'\n      USING ERRCODE = '42501';\n  END IF;\n\n  IF p_user_id = auth.uid() THEN\n    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'\n      USING ERRCODE = '22023';\n  END IF;\n\n  SELECT account_id, account_role, full_name, email\n  INTO v_target_account_id, v_target_role, v_target_name, v_target_email\n  FROM profiles\n  WHERE user_id = p_user_id;\n\n  IF v_target_account_id IS NULL THEN\n    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';\n  END IF;\n\n  IF v_target_account_id <> v_caller_account_id THEN\n    RAISE EXCEPTION 'Target user is not a member of your account'\n      USING ERRCODE = '42501';\n  END IF;\n\n  IF v_target_role = 'owner' THEN\n    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'\n      USING ERRCODE = '22023';\n  END IF;\n\n  -- Spin up a fresh personal account for the removed user. Mirror\n  -- of handle_new_user's logic — keep them whole, just relocated.\n  INSERT INTO accounts (name, owner_user_id)\n  VALUES (\n    COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),\n    p_user_id\n  )\n  RETURNING id INTO v_new_account_id;\n\n  UPDATE profiles\n  SET account_id = v_new_account_id,\n      account_role = 'owner'\n  WHERE user_id = p_user_id;\n\n  RETURN v_new_account_id;\nEND;\n$$;\n\nALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;\n\n-- ============================================================\n-- transfer_account_ownership(p_new_owner_user_id)\n--\n-- Owner only. Atomically:\n--   - demotes the current owner to 'admin'\n--   - promotes the target to 'owner'\n--   - updates accounts.owner_user_id\n--\n-- Both writes happen in the same statement-level transaction.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.transfer_account_ownership(\n  p_new_owner_user_id UUID\n) RETURNS VOID\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_caller_account_id UUID;\n  v_caller_role account_role_enum;\n  v_target_account_id UUID;\n  v_target_role account_role_enum;\nBEGIN\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  SELECT account_id, account_role\n  INTO v_caller_account_id, v_caller_role\n  FROM profiles\n  WHERE user_id = auth.uid();\n\n  IF v_caller_account_id IS NULL THEN\n    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';\n  END IF;\n\n  IF v_caller_role <> 'owner' THEN\n    RAISE EXCEPTION 'Only the account owner can transfer ownership'\n      USING ERRCODE = '42501';\n  END IF;\n\n  IF p_new_owner_user_id = auth.uid() THEN\n    RAISE EXCEPTION 'You are already the owner'\n      USING ERRCODE = '22023';\n  END IF;\n\n  SELECT account_id, account_role\n  INTO v_target_account_id, v_target_role\n  FROM profiles\n  WHERE user_id = p_new_owner_user_id;\n\n  IF v_target_account_id IS NULL THEN\n    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';\n  END IF;\n\n  IF v_target_account_id <> v_caller_account_id THEN\n    RAISE EXCEPTION 'Target user is not a member of your account'\n      USING ERRCODE = '42501';\n  END IF;\n\n  -- Demote current owner first so the temporary state where the\n  -- account has zero owners is never visible — both writes happen\n  -- in the same function transaction.\n  UPDATE profiles SET account_role = 'admin'\n  WHERE user_id = auth.uid();\n\n  UPDATE profiles SET account_role = 'owner'\n  WHERE user_id = p_new_owner_user_id;\n\n  UPDATE accounts SET owner_user_id = p_new_owner_user_id\n  WHERE id = v_caller_account_id;\nEND;\n$$;\n\nALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;"}	018_account_member_rpcs	souaib@junkiescoder.com	\N	\N
20260725113550	{"-- ============================================================\n-- 019_invitation_rpcs.sql — peek + redeem invitation RPCs\n--\n-- The third and last server-side migration in the multi-user\n-- accounts series. Both functions are SECURITY DEFINER for the\n-- same reason as the member RPCs in 018: the writes they need to\n-- do (or, for peek, the reads) cross RLS boundaries that the\n-- regular client policies (correctly) deny.\n--\n-- peek_invitation   — anonymous read. The /join/<token> page\n--   calls this to render \\"You're being invited to <Account> as\n--   <Role>\\" before the visitor signs in. Returns a uniform\n--   `{ ok, reason?, account_name?, role?, expires_at? }` JSON\n--   so the API route doesn't have to interpret error rows.\n--\n-- redeem_invitation — authenticated. Atomically moves the caller\n--   from their just-created personal account to the inviter's\n--   account, cleans up the orphan personal account, and stamps\n--   the invitation accepted. Refuses if the caller's current\n--   account holds any domain data (to avoid silent data loss).\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- peek_invitation(p_token_hash text)\n--\n-- Anonymous read by token hash. The plaintext token never\n-- reaches the DB; the route handler hashes it first.\n--\n-- Returns a JSON object with one of two shapes:\n--   { \\"ok\\": true,  \\"account_name\\": \\"...\\", \\"role\\": \\"...\\",\n--     \\"expires_at\\": \\"2026-...\\" }\n--   { \\"ok\\": false, \\"reason\\": \\"not_found\\" | \\"expired\\" | \\"used\\" }\n--\n-- We could collapse all three failure cases to \\"not_found\\" to\n-- harden against enumeration, but the join page needs the\n-- distinction for UX (\\"This invite has expired — ask <name>\n-- for a new one\\"). Tokens carry 256 bits of entropy, so the\n-- enumeration risk is theoretical; rate-limiting the route on\n-- the IP layer adds belt-and-braces.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.peek_invitation(\n  p_token_hash TEXT\n) RETURNS JSON\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_inv account_invitations%ROWTYPE;\n  v_account_name TEXT;\nBEGIN\n  SELECT * INTO v_inv\n  FROM account_invitations\n  WHERE token_hash = p_token_hash;\n\n  IF NOT FOUND THEN\n    RETURN json_build_object('ok', false, 'reason', 'not_found');\n  END IF;\n\n  IF v_inv.accepted_at IS NOT NULL THEN\n    RETURN json_build_object('ok', false, 'reason', 'used');\n  END IF;\n\n  IF v_inv.expires_at <= NOW() THEN\n    RETURN json_build_object('ok', false, 'reason', 'expired');\n  END IF;\n\n  SELECT name INTO v_account_name\n  FROM accounts\n  WHERE id = v_inv.account_id;\n\n  RETURN json_build_object(\n    'ok', true,\n    'account_name', v_account_name,\n    'role', v_inv.role,\n    'expires_at', v_inv.expires_at\n  );\nEND;\n$$;\n\nALTER FUNCTION public.peek_invitation(TEXT) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.peek_invitation(TEXT) FROM PUBLIC;\n-- `anon` so the /join/<token> page can call this before the user\n-- signs in; `authenticated` so the same page works when already\n-- signed in (e.g. existing user clicks a forwarded link).\nGRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT) TO anon, authenticated;\n\n-- ============================================================\n-- redeem_invitation(p_token_hash text)\n--\n-- Authenticated. The caller's auth.uid() is used both to scope\n-- the move (\\"which profile am I editing?\\") and as the safety\n-- check (\\"do you have any data we'd lose?\\").\n--\n-- Refusal codes (SQLSTATE):\n--   22023 — invite invalid (not_found / used / expired)\n--   42501 — caller not authenticated\n--   23505 — caller's account has data (would be lost by joining)\n--           NOTE: we reuse Postgres's \\"unique_violation\\" code here\n--           rather than invent a custom SQLSTATE because there's\n--           no proper standard SQLSTATE for \\"conflict\\"; the route\n--           handler maps it to HTTP 409.\n--\n-- Order of operations\n--   1. Lock the invite row (FOR UPDATE) so two concurrent redeems\n--      of the same token can't both succeed.\n--   2. Read caller's current account_id.\n--   3. Verify caller is the sole owner of their current account\n--      AND that the account has zero domain rows. (If the caller\n--      already joined someone else's account once, their\n--      profile.account_id points there, not to a personal account\n--      they own — that case fails the \\"is owner\\" check and\n--      surfaces as 23505.)\n--   4. Move profile.account_id + account_role to invite's.\n--   5. Mark invitation accepted (token_hash stays, so the same\n--      token can't be re-used).\n--   6. Delete the old personal account. The ON DELETE CASCADE on\n--      `accounts(id) ← profiles.account_id` would normally try to\n--      delete the caller's profile too, but step 4 already moved\n--      them to the new account, so the cascade is a no-op.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.redeem_invitation(\n  p_token_hash TEXT\n) RETURNS UUID  -- the joined account_id\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_caller_id UUID := auth.uid();\n  v_inv account_invitations%ROWTYPE;\n  v_old_account_id UUID;\n  v_old_account_owner UUID;\n  v_has_data BOOLEAN;\nBEGIN\n  IF v_caller_id IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  SELECT * INTO v_inv\n  FROM account_invitations\n  WHERE token_hash = p_token_hash\n  FOR UPDATE;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';\n  END IF;\n  IF v_inv.accepted_at IS NOT NULL THEN\n    RAISE EXCEPTION 'Invitation has already been redeemed'\n      USING ERRCODE = '22023';\n  END IF;\n  IF v_inv.expires_at <= NOW() THEN\n    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';\n  END IF;\n\n  -- Caller's current account + its owner.\n  SELECT p.account_id, a.owner_user_id\n  INTO v_old_account_id, v_old_account_owner\n  FROM profiles p\n  JOIN accounts a ON a.id = p.account_id\n  WHERE p.user_id = v_caller_id;\n\n  IF v_old_account_id IS NULL THEN\n    -- Defensive — every authenticated user has a profile post-017.\n    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';\n  END IF;\n\n  -- Edge case: the inviter sent themselves a link, or the\n  -- caller is somehow already in the inviter's account.\n  IF v_old_account_id = v_inv.account_id THEN\n    RAISE EXCEPTION 'You are already a member of this account'\n      USING ERRCODE = '23505';\n  END IF;\n\n  -- Safety: the caller must be the SOLE OWNER of their current\n  -- account (i.e. their fresh personal account from signup or a\n  -- prior removal). Any other state means they're either:\n  --   - a member of another shared account (joining a second\n  --     would silently orphan their access to the first), or\n  --   - the owner of an account with teammates (they'd abandon\n  --     their team to join the inviter's).\n  -- Either way, the safe answer is \\"make a different login\\".\n  IF v_old_account_owner <> v_caller_id THEN\n    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'\n      USING ERRCODE = '23505';\n  END IF;\n\n  -- Belt: even if they own their account, refuse if it has any\n  -- domain data — joining would orphan their contacts, deals,\n  -- broadcasts, automations, flows, templates, etc.\n  SELECT EXISTS (\n    SELECT 1 FROM contacts WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id\n    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id\n    LIMIT 1\n  ) INTO v_has_data;\n\n  IF v_has_data THEN\n    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'\n      USING ERRCODE = '23505';\n  END IF;\n\n  -- Move the profile first so the cascade-on-delete of the old\n  -- account doesn't try to nuke this user's profile too.\n  UPDATE profiles\n  SET account_id = v_inv.account_id,\n      account_role = v_inv.role\n  WHERE user_id = v_caller_id;\n\n  UPDATE account_invitations\n  SET accepted_at = NOW(),\n      accepted_by_user_id = v_caller_id\n  WHERE id = v_inv.id;\n\n  -- Clean up the orphan personal account. Empty by the checks\n  -- above, so this is purely housekeeping — no cascades fire\n  -- because no other rows reference it.\n  DELETE FROM accounts WHERE id = v_old_account_id;\n\n  RETURN v_inv.account_id;\nEND;\n$$;\n\nALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;"}	019_invitation_rpcs	souaib@junkiescoder.com	\N	\N
20260725113610	{"-- ============================================================\n-- 020_account_sharing_followups.sql — review-board fixes for\n-- the multi-user accounts series (#167-#177).\n--\n-- Two concerns this migration addresses:\n--\n--   1. Engine dispatch indexes — the per-inbound automations and\n--      flows lookups now scope by `account_id + trigger_type/status\n--      + is_active/status='active'`. The pre-017 partial indexes\n--      (`idx_automations_active_trigger`, no flows equivalent) were\n--      account-blind. For shared accounts with 100+ teammates each\n--      authoring rules, the planner ends up post-filtering by\n--      account_id. Composite partial indexes drop the post-filter\n--      cost to zero on the hot path.\n--\n--   2. Flow-media storage scoping — migration 016 created the\n--      `flow-media` bucket with per-user RLS policies keyed on\n--      `auth.uid() = path[0]`. After the multi-user move, flows\n--      are account-scoped but the storage paths remained user-\n--      scoped: an agent who left the account would orphan every\n--      flow node referencing media they had uploaded. This\n--      migration switches the write policies to account-scoped\n--      paths (`account-<account_id>/...`) while leaving the\n--      legacy `<auth.uid()>/...` paths writable by their original\n--      uploader for backward compatibility. The bucket is public,\n--      so reads are unchanged.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- COMPOSITE INDEXES — engine dispatch hot path\n-- ============================================================\n\n-- `runAutomationsForTrigger` queries\n--   automations WHERE account_id = X AND trigger_type = Y AND is_active = TRUE\n-- Migration 006 added a partial index on (trigger_type) WHERE is_active.\n-- Composite + partial index lets the planner answer all three predicates\n-- from one index lookup. The existing partial index can stay as belt-and-\n-- braces for any code path that filters only by trigger_type.\nCREATE INDEX IF NOT EXISTS idx_automations_account_active_trigger\n  ON automations(account_id, trigger_type)\n  WHERE is_active = TRUE;\n\n-- `findEntryFlow` queries\n--   flows WHERE account_id = X AND status = 'active'\n-- Migration 017 only added `idx_flows_account`; this partial composite\n-- is tuned for the engine's lookup and skips archived/draft rows.\nCREATE INDEX IF NOT EXISTS idx_flows_account_active\n  ON flows(account_id)\n  WHERE status = 'active';\n\n-- ============================================================\n-- FLOW-MEDIA STORAGE — account-scoped writes\n--\n-- New path convention: `account-<uuid>/<timestamp>-<base>.<ext>`\n-- Legacy path convention: `<uuid>/<timestamp>-<base>.<ext>` (where\n-- the uuid is auth.uid() — preserved for back-compat).\n--\n-- Reads stay public (the bucket is public so Meta can fetch media\n-- URLs without credentials). Only the write policies change.\n--\n-- Drop existing per-user policies and replace with account-aware\n-- ones that accept either path convention.\n-- ============================================================\nDROP POLICY IF EXISTS \\"Users can upload their own flow media\\" ON storage.objects;\nDROP POLICY IF EXISTS \\"Users can update their own flow media\\" ON storage.objects;\nDROP POLICY IF EXISTS \\"Users can delete their own flow media\\" ON storage.objects;\n\nDROP POLICY IF EXISTS \\"Members can upload flow media\\" ON storage.objects;\nCREATE POLICY \\"Members can upload flow media\\"\n  ON storage.objects FOR INSERT\n  WITH CHECK (\n    bucket_id = 'flow-media'\n    AND (\n      -- New: any account member uploading under their account's folder.\n      -- `'account-' || account_id` is how we namespace the folder, so\n      -- two accounts that happen to be in the same Supabase project\n      -- can never accidentally collide.\n      EXISTS (\n        SELECT 1 FROM public.profiles p\n        WHERE p.user_id = auth.uid()\n          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n      )\n      -- Legacy: the original uploader keeps write access to files they\n      -- already uploaded under the pre-020 path convention.\n      OR auth.uid()::text = (storage.foldername(name))[1]\n    )\n  );\n\nDROP POLICY IF EXISTS \\"Members can update flow media\\" ON storage.objects;\nCREATE POLICY \\"Members can update flow media\\"\n  ON storage.objects FOR UPDATE\n  USING (\n    bucket_id = 'flow-media'\n    AND (\n      EXISTS (\n        SELECT 1 FROM public.profiles p\n        WHERE p.user_id = auth.uid()\n          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n      )\n      OR auth.uid()::text = (storage.foldername(name))[1]\n    )\n  );\n\nDROP POLICY IF EXISTS \\"Members can delete flow media\\" ON storage.objects;\nCREATE POLICY \\"Members can delete flow media\\"\n  ON storage.objects FOR DELETE\n  USING (\n    bucket_id = 'flow-media'\n    AND (\n      EXISTS (\n        SELECT 1 FROM public.profiles p\n        WHERE p.user_id = auth.uid()\n          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n      )\n      OR auth.uid()::text = (storage.foldername(name))[1]\n    )\n  );"}	020_account_sharing_followups	souaib@junkiescoder.com	\N	\N
20260725113611	{"-- ============================================================\n-- 021_account_default_currency\n--\n-- Make the default deal currency configurable per account.\n--\n-- Before this, the app hardcoded USD everywhere — deal-value\n-- formatters, the new-deal form, and automation-created deals all\n-- assumed USD. wacrm is self-hostable and used globally, so a fixed\n-- USD default made deal tracking unhelpful for non-US businesses\n-- (issue #218).\n--\n-- We add a single `default_currency` column to `accounts`. New deals\n-- and all aggregated totals (pipeline/dashboard) format in this\n-- currency; existing deals keep their own saved `deals.currency`.\n-- We enforce one currency per account (no FX conversion) — the\n-- issue's recommended first pass.\n--\n-- RLS: no change needed. The existing `accounts_update` policy\n-- (017) already restricts writes to admins+, which is exactly who\n-- should change an account-wide setting.\n-- ============================================================\n\nALTER TABLE accounts\n  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';\n\n-- Keep the value an ISO-4217-shaped 3-letter uppercase code without\n-- pinning to a fixed enum — forks can use any currency Intl supports.\nALTER TABLE accounts\n  DROP CONSTRAINT IF EXISTS accounts_default_currency_format;\nALTER TABLE accounts\n  ADD CONSTRAINT accounts_default_currency_format\n  CHECK (default_currency ~ '^[A-Z]{3}$');"}	021_account_default_currency	souaib@junkiescoder.com	\N	\N
20260725113613	{"-- ============================================================\n-- 022_contact_phone_dedup\n--\n-- Prevent the same phone number from becoming multiple contacts\n-- within one account (issue #212).\n--\n-- Until now `contacts.phone` had only a non-unique index, phone was\n-- stored un-normalized (\\"+1 555-123-4567\\" vs \\"15551234567\\" are\n-- distinct strings), and only the WhatsApp webhook de-duped. Manual\n-- create and CSV import inserted freely, fragmenting conversations,\n-- deals, and tags across duplicate rows.\n--\n-- This migration, in order:\n--   1. adds a generated `phone_normalized` column (digits-only,\n--      mirroring the app's normalizePhone) that can never drift;\n--   2. merges existing duplicates into the oldest row, re-pointing\n--      all child records first so nothing is lost;\n--   3. adds a UNIQUE index on (account_id, phone_normalized) — the\n--      authoritative guarantee that covers every write path.\n--\n-- Idempotent. **No data loss** — duplicate rows are merged, not\n-- dropped: child rows (conversations, messages, deals, notes, tags,\n-- custom values, broadcast recipients, automation/flow records) are\n-- re-pointed to the surviving (oldest) contact before deletion.\n-- ============================================================\n\n-- 1) Normalized phone — STORED generated column, kept in lockstep\n--    with `phone` by Postgres. Matches normalizePhone()\n--    (src/lib/whatsapp/phone-utils.ts): strip every non-digit.\nALTER TABLE contacts\n  ADD COLUMN IF NOT EXISTS phone_normalized TEXT\n  GENERATED ALWAYS AS (regexp_replace(phone, '\\\\D', '', 'g')) STORED;\n\n-- 2) One-time (re-runnable) merge of existing duplicates.\n--    SECURITY DEFINER so it can re-point rows across tables\n--    regardless of the caller's RLS; it only ever collapses exact\n--    normalized duplicates within the same account.\nCREATE OR REPLACE FUNCTION public.merge_duplicate_contacts()\nRETURNS INTEGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_group   RECORD;\n  v_survivor UUID;\n  v_losers   UUID[];\n  v_merged   INTEGER := 0;\nBEGIN\n  FOR v_group IN\n    SELECT account_id,\n           phone_normalized,\n           array_agg(id ORDER BY created_at ASC, id ASC) AS ids\n    FROM contacts\n    WHERE phone_normalized <> ''\n    GROUP BY account_id, phone_normalized\n    HAVING count(*) > 1\n  LOOP\n    v_survivor := v_group.ids[1];\n    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];\n\n    -- Plain re-point: these tables have no contact-scoped unique\n    -- constraint. `conversations` is ON DELETE CASCADE, so this\n    -- re-point is what saves its rows (and their messages) from\n    -- being deleted with the loser contact.\n    UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);\n\n    -- Conflict-guarded re-point for UNIQUE(contact_id, tag_id):\n    -- move only tags the survivor doesn't already have, drop the rest.\n    UPDATE contact_tags ct SET contact_id = v_survivor\n      WHERE ct.contact_id = ANY(v_losers)\n        AND NOT EXISTS (\n          SELECT 1 FROM contact_tags s\n          WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id\n        );\n    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);\n\n    -- Same guard for UNIQUE(contact_id, custom_field_id). Survivor's\n    -- own value wins on conflict.\n    UPDATE contact_custom_values cv SET contact_id = v_survivor\n      WHERE cv.contact_id = ANY(v_losers)\n        AND NOT EXISTS (\n          SELECT 1 FROM contact_custom_values s\n          WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id\n        );\n    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);\n\n    -- flow_runs has a partial UNIQUE on active runs per contact.\n    -- Re-point only NON-active runs (exempt from the partial index)\n    -- to preserve history; any active loser run is left to be\n    -- NULLed by its FK's ON DELETE SET NULL when the loser is\n    -- removed below — avoids colliding with the survivor's active run.\n    UPDATE flow_runs SET contact_id = v_survivor\n      WHERE contact_id = ANY(v_losers) AND status <> 'active';\n\n    DELETE FROM contacts WHERE id = ANY(v_losers);\n\n    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);\n  END LOOP;\n\n  RETURN v_merged;\nEND;\n$$;\n\nALTER FUNCTION public.merge_duplicate_contacts() OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC;\n\n-- Collapse whatever duplicates exist right now.\nSELECT public.merge_duplicate_contacts();\n\n-- 3) Authoritative guarantee. Partial index defends against any\n--    empty normalized value (phone is NOT NULL, but belt-and-braces).\nCREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_phone_normalized\n  ON contacts (account_id, phone_normalized)\n  WHERE phone_normalized <> '';"}	022_contact_phone_dedup	souaib@junkiescoder.com	\N	\N
20260725113639	{"-- ============================================================\n-- 023_chat_media.sql — chat attachment bucket + RLS policies\n--\n-- Creates the `chat-media` storage bucket where agents upload files\n-- (images, voice notes, documents, videos) to send as attachments\n-- from the chat composer, and where incoming WhatsApp media is stored.\n--\n-- Path convention: `account-<uuid>/<conversation_id>/<timestamp>-<name>.<ext>`\n--\n-- Why account-scoped folder names:\n--   - Matches flow-media (migration 020).\n--   - Two accounts sharing a Supabase project cannot collide or read\n--     each other's attachments.\n--   - Easy cleanup: `account-<uuid>/...` lists everything for an account.\n--\n-- Bucket settings:\n--   - public: false — Chat attachments can be sensitive (invoices, ID docs,\n--     voice notes). Only account members can read or download them via RLS.\n--   - file_size_limit: 16 MB — Matches WhatsApp Cloud API limit for images/audio.\n--     (Documents support up to 100MB on WA, but 16MB keeps storage bounded;\n--      can be bumped later if needed).\n--\n-- RLS policies:\n--   - SELECT: Any account member can read media under their `account-<id>/` path.\n--   - INSERT: Any account member (agent+) can upload under their `account-<id>/` path.\n--   - UPDATE/DELETE: Admin+ or original uploader can modify/remove files.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- Create the private bucket (no-op if already exists)\nINSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nVALUES (\n  'chat-media',\n  'chat-media',\n  false,\n  16777216,  -- 16 MB in bytes\n  ARRAY[\n    -- Images\n    'image/jpeg', 'image/png', 'image/gif', 'image/webp',\n    -- Audio / Voice notes\n    'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/webm',\n    -- Documents\n    'application/pdf',\n    'application/msword',\n    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',\n    'application/vnd.ms-excel',\n    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',\n    'text/plain', 'text/csv',\n    -- Video\n    'video/mp4', 'video/3gpp'\n  ]\n)\nON CONFLICT (id) DO UPDATE SET\n  public = EXCLUDED.public,\n  file_size_limit = EXCLUDED.file_size_limit,\n  allowed_mime_types = EXCLUDED.allowed_mime_types;\n\n-- ============================================================\n-- RLS POLICIES FOR chat-media\n-- ============================================================\n\nDROP POLICY IF EXISTS \\"Members can read chat media\\" ON storage.objects;\nCREATE POLICY \\"Members can read chat media\\"\n  ON storage.objects FOR SELECT\n  USING (\n    bucket_id = 'chat-media'\n    AND EXISTS (\n      SELECT 1 FROM public.profiles p\n      WHERE p.user_id = auth.uid()\n        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n    )\n  );\n\nDROP POLICY IF EXISTS \\"Members can upload chat media\\" ON storage.objects;\nCREATE POLICY \\"Members can upload chat media\\"\n  ON storage.objects FOR INSERT\n  WITH CHECK (\n    bucket_id = 'chat-media'\n    AND EXISTS (\n      SELECT 1 FROM public.profiles p\n      WHERE p.user_id = auth.uid()\n        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n        AND is_account_member(p.account_id, 'agent')\n    )\n  );\n\nDROP POLICY IF EXISTS \\"Members can update chat media\\" ON storage.objects;\nCREATE POLICY \\"Members can update chat media\\"\n  ON storage.objects FOR UPDATE\n  USING (\n    bucket_id = 'chat-media'\n    AND EXISTS (\n      SELECT 1 FROM public.profiles p\n      WHERE p.user_id = auth.uid()\n        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n        AND (\n          -- Admins can update anything in their account\n          is_account_member(p.account_id, 'admin')\n          -- Original uploader can update their own files\n          OR owner = auth.uid()\n        )\n    )\n  );\n\nDROP POLICY IF EXISTS \\"Members can delete chat media\\" ON storage.objects;\nCREATE POLICY \\"Members can delete chat media\\"\n  ON storage.objects FOR DELETE\n  USING (\n    bucket_id = 'chat-media'\n    AND EXISTS (\n      SELECT 1 FROM public.profiles p\n      WHERE p.user_id = auth.uid()\n        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]\n        AND (\n          -- Admins can delete anything in their account\n          is_account_member(p.account_id, 'admin')\n          -- Original uploader can delete their own files\n          OR owner = auth.uid()\n        )\n    )\n  );"}	023_chat_media	souaib@junkiescoder.com	\N	\N
20260725113641	{"-- ============================================================\n-- 024_member_presence.sql — presence tracking & activity status\n--\n-- Adds the `member_presence` table and an RPC for high-frequency\n-- presence heartbeats (online/offline, custom status text, busy toggle).\n--\n-- Why a separate table instead of columns on `profiles`:\n--   - Presence updates happen every 30-60 seconds while an agent is active.\n--   - Putting high-frequency writes on `profiles` causes HOT (Heap-Only Tuple)\n--     bloat and lock contention on the core user table.\n--   - `member_presence` is lightweight, 1-to-1 with `profiles`, and can be\n--     truncated or cleaned up easily without touching profile data.\n--   - Realtime subscriptions on presence don't fire events for profile edits\n--     (name/avatar changes) and vice-versa.\n--\n-- Table structure:\n--   - user_id: PK, references auth.users (1:1 with profiles)\n--   - account_id: references accounts (for fast account-scoped queries)\n--   - status: enum ('online', 'busy', 'away', 'offline')\n--   - custom_status: optional text badge (e.g. \\"In a meeting\\", \\"Lunch break\\")\n--   - last_seen_at: updated on every heartbeat\n--\n-- RPC: `touch_presence(status, custom_status)`\n--   - Called by client-side heartbeat timer every 30s.\n--   - Upserts the presence row for `auth.uid()`.\n--   - Uses SECURITY DEFINER to keep the client write simple and avoid\n--     needing client-side INSERT/UPDATE RLS policies for heartbeats.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- Presence status enum\nDO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'presence_status_enum') THEN\n    CREATE TYPE presence_status_enum AS ENUM ('online', 'busy', 'away', 'offline');\n  END IF;\nEND $$;\n\n-- Presence table\nCREATE TABLE IF NOT EXISTS member_presence (\n  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,\n  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  status        presence_status_enum NOT NULL DEFAULT 'offline',\n  custom_status TEXT,\n  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- Index for account-scoped presence queries (e.g. \\"who is online in my team?\\")\nCREATE INDEX IF NOT EXISTS idx_member_presence_account_status\n  ON member_presence(account_id, status, last_seen_at DESC);\n\nALTER TABLE member_presence ENABLE ROW LEVEL SECURITY;\n\n-- Auto-update updated_at\nDROP TRIGGER IF EXISTS set_member_presence_updated_at ON member_presence;\nCREATE TRIGGER set_member_presence_updated_at BEFORE UPDATE ON member_presence\n  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================\n-- RLS POLICIES FOR member_presence\n--\n-- Read: Any account member can see their teammates' presence status.\n-- Write: No direct client INSERT/UPDATE/DELETE. All writes go through\n--        the `touch_presence` RPC below, or happen via cascades.\n-- ============================================================\nDROP POLICY IF EXISTS \\"Members can view teammate presence\\" ON member_presence;\nCREATE POLICY \\"Members can view teammate presence\\" ON member_presence FOR SELECT\n  USING (is_account_member(account_id));\n\n-- ============================================================\n-- touch_presence(p_status, p_custom_status)\n--\n-- Upserts presence for auth.uid(). Resolves account_id from profiles.\n-- If caller has no profile yet (mid-signup), fails gracefully with 42501.\n--\n-- Parameters:\n--   p_status: optional new status ('online' by default if NULL)\n--   p_custom_status: optional text text (pass NULL to keep current value\n--                    or clear it if explicitly requested via empty string)\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.touch_presence(\n  p_status presence_status_enum DEFAULT 'online',\n  p_custom_status TEXT DEFAULT NULL\n) RETURNS VOID\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_user_id UUID := auth.uid();\n  v_account_id UUID;\nBEGIN\n  IF v_user_id IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  SELECT account_id INTO v_account_id\n  FROM profiles\n  WHERE user_id = v_user_id;\n\n  IF v_account_id IS NULL THEN\n    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';\n  END IF;\n\n  INSERT INTO member_presence (user_id, account_id, status, custom_status, last_seen_at)\n  VALUES (\n    v_user_id,\n    v_account_id,\n    COALESCE(p_status, 'online'),\n    p_custom_status,\n    NOW()\n  )\n  ON CONFLICT (user_id) DO UPDATE SET\n    status = COALESCE(EXCLUDED.status, member_presence.status),\n    custom_status = CASE\n      -- If NULL passed, preserve existing custom_status\n      WHEN p_custom_status IS NULL THEN member_presence.custom_status\n      -- If empty string passed, clear custom_status\n      WHEN p_custom_status = '' THEN NULL\n      -- Otherwise update to new value\n      ELSE p_custom_status\n    END,\n    last_seen_at = NOW(),\n    -- Keep account_id in sync just in case user switched accounts\n    account_id = EXCLUDED.account_id;\nEND;\n$$;\n\nALTER FUNCTION public.touch_presence(presence_status_enum, TEXT) OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.touch_presence(presence_status_enum, TEXT) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.touch_presence(presence_status_enum, TEXT) TO authenticated;\n\n-- ============================================================\n-- REALTIME — enable for member_presence so UI can reflect changes\n-- instantaneously without polling.\n-- ============================================================\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'member_presence'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE member_presence;\n  END IF;\nEND $$;"}	024_member_presence	souaib@junkiescoder.com	\N	\N
20260725113642	{"-- ============================================================\n-- 025_filter_contacts_by_tags.sql — server-side tag filtering\n--\n-- Adds the `filter_contacts_by_tags` RPC to evaluate AND / OR\n-- tag filters inside Postgres.\n--\n-- Why an RPC instead of client-side queries:\n--   - Supabase PostgREST's syntax for \\"contacts where tags contain\n--     ALL of [A, B, C]\\" (relational AND) across a many-to-many join table\n--     (`contact_tags`) requires complex embedded filters or multiple RTTs.\n--   - As contacts grow past 10,000 per account, fetching IDs client-side and\n--     filtering in JS memory is slow and wastes bandwidth.\n--   - This RPC uses Postgres array operators and `HAVING COUNT(DISTINCT ...)`\n--     to filter tens of thousands of contacts in milliseconds, returning\n--     a paginated, sorted slice directly to the client.\n--\n-- Parameters:\n--   p_tag_ids: UUID array of tag IDs to filter by.\n--   p_match_all: boolean. True = AND (contact must have ALL tags).\n--                         False = OR (contact must have AT LEAST ONE tag).\n--   p_search: text search query (matches name or phone, case-insensitive).\n--   p_limit: max rows to return (default 50, max 200).\n--   p_offset: pagination offset (default 0).\n--\n-- Returns: SETOF contacts (table rows).\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nCREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(\n  p_tag_ids UUID[],\n  p_match_all BOOLEAN DEFAULT false,\n  p_search TEXT DEFAULT NULL,\n  p_limit INTEGER DEFAULT 50,\n  p_offset INTEGER DEFAULT 0\n) RETURNS SETOF contacts\nLANGUAGE plpgsql\nSTABLE\nSECURITY INVOKER\nSET search_path = public\nAS $$\nDECLARE\n  v_tag_count INTEGER;\n  v_limit INTEGER;\n  v_offset INTEGER;\nBEGIN\n  -- Validate and bound pagination\n  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);\n  v_offset := GREATEST(COALESCE(p_offset, 0), 0);\n\n  -- If no tags specified, fallback to simple search/list (still account-scoped by RLS)\n  IF p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL THEN\n    RETURN QUERY\n    SELECT c.*\n    FROM contacts c\n    WHERE (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')\n    ORDER BY c.created_at DESC\n    LIMIT v_limit\n    OFFSET v_offset;\n    RETURN;\n  END IF;\n\n  v_tag_count := array_length(p_tag_ids, 1);\n\n  IF p_match_all THEN\n    -- AND filter: Contact must have ALL specified tags.\n    -- We join contact_tags, filter by tag_ids, group by contact,\n    -- and ensure the distinct tag count matches array length.\n    RETURN QUERY\n    SELECT c.*\n    FROM contacts c\n    JOIN contact_tags ct ON ct.contact_id = c.id\n    WHERE ct.tag_id = ANY(p_tag_ids)\n      AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')\n    GROUP BY c.id\n    HAVING COUNT(DISTINCT ct.tag_id) = v_tag_count\n    ORDER BY c.created_at DESC\n    LIMIT v_limit\n    OFFSET v_offset;\n  ELSE\n    -- OR filter: Contact must have AT LEAST ONE of the specified tags.\n    RETURN QUERY\n    SELECT DISTINCT c.*\n    FROM contacts c\n    JOIN contact_tags ct ON ct.contact_id = c.id\n    WHERE ct.tag_id = ANY(p_tag_ids)\n      AND (p_search IS NULL OR p_search = '' OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')\n    ORDER BY c.created_at DESC\n    LIMIT v_limit\n    OFFSET v_offset;\n  END IF;\nEND;\n$$;\n\nALTER FUNCTION public.filter_contacts_by_tags(UUID[], BOOLEAN, TEXT, INTEGER, INTEGER) OWNER TO postgres;\n\n-- SECURITY INVOKER ensures the query runs with the calling user's RLS policies\n-- (contacts_select policy from migration 017 will enforce `is_account_member(account_id)`).\nREVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], BOOLEAN, TEXT, INTEGER, INTEGER) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], BOOLEAN, TEXT, INTEGER, INTEGER) TO authenticated;"}	025_filter_contacts_by_tags	souaib@junkiescoder.com	\N	\N
20260725113707	{"-- ============================================================\n-- 026_api_keys.sql — Public API credentials (groundwork)\n--\n-- Adds the `api_keys` table backing the public REST API\n-- (`/api/v1/*`). A key authenticates a *machine* caller (a script,\n-- an n8n/Zapier-style automation, a cron) against one account, the\n-- same way the cookie session authenticates a *human* in the\n-- dashboard.\n--\n-- Design notes\n--   - Account-scoped, never user-scoped. A key belongs to the\n--     account; `created_by` only records who minted it (audit), and\n--     is ON DELETE SET NULL so removing a teammate doesn't cascade-\n--     delete the keys their automations still depend on.\n--   - We store only the SHA-256 *hash* of the key, never plaintext.\n--     A leaked DB snapshot (backup, log, support export) therefore\n--     can't be replayed against the API — the caller would need the\n--     original key, which is returned exactly once at creation. Same\n--     pattern as `account_invitations.token_hash` (migration 017/019).\n--   - `key_prefix` is a short, non-secret display string\n--     (`wacrm_live_a1b2c3d4`) so the dashboard can show \\"which key\n--     is this\\" in a list without ever resurfacing the secret.\n--   - Authorization is by `scopes[]` (scopes-only model), resolved\n--     in the application layer (`src/lib/api-keys/scopes.ts`). The\n--     DB doesn't constrain the scope vocabulary — a future scope is\n--     a code change, not a migration.\n--\n-- RLS\n--   `api_keys` is a settings-class table: any member may *read* the\n--   roster of keys for their account; only admin+ may create/revoke\n--   (mirrors the `tags` / `custom_fields` policies in 017). The\n--   public-API auth path itself reads keys with the service-role\n--   client (RLS-bypassing) because an API caller has no Supabase\n--   session and therefore no `auth.uid()` for a policy to match.\n--\n-- Idempotent — safe to run multiple times. Table uses IF NOT\n-- EXISTS; policies are dropped before recreate (Postgres has no\n-- CREATE POLICY IF NOT EXISTS).\n-- ============================================================\n\nCREATE TABLE IF NOT EXISTS api_keys (\n  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  name         text NOT NULL,\n  key_prefix   text NOT NULL,             -- display only, e.g. \\"wacrm_live_a1b2c3d4\\"\n  key_hash     text NOT NULL UNIQUE,      -- SHA-256 hex of the full plaintext key\n  scopes       text[] NOT NULL DEFAULT '{}',\n  last_used_at timestamptz,\n  expires_at   timestamptz,               -- NULL = never expires\n  revoked_at   timestamptz,               -- NULL = active\n  created_at   timestamptz NOT NULL DEFAULT now()\n);\n\n-- account_id: every \\"list this account's keys\\" query filters on it.\nCREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys (account_id);\n-- key_hash: the hot path is the per-request auth lookup by hash. The\n-- UNIQUE constraint already creates an index, but spell it out so the\n-- intent (this is the lookup key) is documented and survives a future\n-- drop of the UNIQUE constraint.\nCREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);\n\nALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;\n\n-- SELECT: any member of the account (viewer+) can see the roster.\n-- key_hash is in the table but the dashboard never selects it.\nDROP POLICY IF EXISTS api_keys_select ON api_keys;\nCREATE POLICY api_keys_select ON api_keys FOR SELECT\n  USING (is_account_member(account_id));\n\n-- INSERT / UPDATE / DELETE: admin+ only (settings-class). Revoking a\n-- key is an UPDATE that sets `revoked_at`; we keep DELETE available\n-- too for operators who'd rather hard-delete.\nDROP POLICY IF EXISTS api_keys_insert ON api_keys;\nCREATE POLICY api_keys_insert ON api_keys FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS api_keys_update ON api_keys;\nCREATE POLICY api_keys_update ON api_keys FOR UPDATE\n  USING (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS api_keys_delete ON api_keys;\nCREATE POLICY api_keys_delete ON api_keys FOR DELETE\n  USING (is_account_member(account_id, 'admin'));"}	026_api_keys	souaib@junkiescoder.com	\N	\N
20260725113709	{"-- ============================================================\n-- NOTIFICATIONS\n-- ============================================================\nCREATE TABLE IF NOT EXISTS notifications (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  -- Recipient — the agent this notification is for.\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  type TEXT NOT NULL DEFAULT 'conversation_assigned'\n    CHECK (type IN ('conversation_assigned')),\n  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,\n  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,\n  -- Who triggered the notification. NULL means an automation / the\n  -- system did it rather than a signed-in teammate.\n  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,\n  title TEXT NOT NULL,\n  body TEXT,\n  read_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_notifications_user_created\n  ON notifications(user_id, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_notifications_user_unread\n  ON notifications(user_id)\n  WHERE read_at IS NULL;\n\n-- Full replica identity so realtime UPDATE payloads include old column\n-- values. Without this, payload.old only carries the primary key, which\n-- makes it impossible to derive whether a row was unread before the update.\nALTER TABLE notifications REPLICA IDENTITY FULL;\n\nALTER TABLE notifications ENABLE ROW LEVEL SECURITY;\n\n-- Recipients can read and mark their own notifications as read.\n-- No client INSERT/DELETE policy — rows are created exclusively by\n-- the SECURITY DEFINER trigger function below.\nDROP POLICY IF EXISTS notifications_select ON notifications;\nDROP POLICY IF EXISTS notifications_update ON notifications;\nCREATE POLICY notifications_select ON notifications FOR SELECT\n  USING (auth.uid() = user_id);\n-- Only read_at updates are meaningful from the client; restrict via a\n-- column-level security policy so other fields cannot be rewritten.\nCREATE POLICY notifications_update ON notifications FOR UPDATE\n  USING (auth.uid() = user_id)\n  WITH CHECK (auth.uid() = user_id);\n\n-- Restrict to read_at column only at the column-privilege level so\n-- clients cannot overwrite title, body, or other immutable fields.\nREVOKE UPDATE ON notifications FROM authenticated;\nGRANT UPDATE (read_at) ON notifications TO authenticated;\n\n-- ============================================================\n-- TRIGGER — notify on conversation assignment\n-- ============================================================\nCREATE OR REPLACE FUNCTION notify_conversation_assigned()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_contact_name TEXT;\n  v_actor_name TEXT;\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    IF NEW.assigned_agent_id IS NULL THEN\n      RETURN NEW;\n    END IF;\n  ELSE\n    IF NEW.assigned_agent_id IS NULL\n       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN\n      RETURN NEW;\n    END IF;\n  END IF;\n\n  -- Skip self-assignment — nothing to notify the agent about.\n  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN\n    RETURN NEW;\n  END IF;\n\n  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name\n  FROM contacts WHERE id = NEW.contact_id;\n\n  IF auth.uid() IS NOT NULL THEN\n    SELECT full_name INTO v_actor_name\n    FROM profiles WHERE user_id = auth.uid();\n  END IF;\n\n  INSERT INTO notifications (\n    account_id, user_id, type, conversation_id, contact_id,\n    actor_user_id, title, body\n  ) VALUES (\n    NEW.account_id,\n    NEW.assigned_agent_id,\n    'conversation_assigned',\n    NEW.id,\n    NEW.contact_id,\n    auth.uid(),\n    'New conversation assigned',\n    COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '\n      || COALESCE(v_contact_name, 'a contact')\n  );\n\n  RETURN NEW;\nEXCEPTION WHEN OTHERS THEN\n  -- Never let a notification failure block the assignment itself.\n  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;\n  RETURN NEW;\nEND;\n$$;\n\nALTER FUNCTION notify_conversation_assigned() OWNER TO postgres;\n\nDROP TRIGGER IF EXISTS on_conversation_assigned ON conversations;\nCREATE TRIGGER on_conversation_assigned\n  AFTER INSERT OR UPDATE OF assigned_agent_id ON conversations\n  FOR EACH ROW EXECUTE FUNCTION notify_conversation_assigned();\n\n-- ============================================================\n-- ENABLE REALTIME\n-- ============================================================\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'\n  ) THEN\n    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;\n  END IF;\nEND $$;"}	027_notifications	souaib@junkiescoder.com	\N	\N
20260725113711	{"-- ============================================================\n-- 028_webhook_endpoints.sql — Outbound event webhooks (public API)\n--\n-- Lets an account register HTTPS endpoints that wacrm POSTs to when\n-- something happens (an inbound message arrives, a delivery status\n-- changes, a conversation is created). This is the \\"react to inbound\\"\n-- half of the public API (#245): instead of polling\n-- `GET /api/v1/conversations`, an automation subscribes once and is\n-- pushed the events it cares about.\n--\n-- Design notes\n--   - Account-scoped, never user-scoped (same as `api_keys`).\n--     `created_by` records who registered it (audit); ON DELETE SET\n--     NULL so removing a teammate doesn't drop their integration's\n--     endpoint.\n--   - `secret` is the HMAC signing key. UNLIKE `api_keys` (where we\n--     store only a hash because the key is a bearer credential the\n--     *client* presents), here *we* sign each outgoing payload with\n--     the secret and the receiver verifies it — so we need the\n--     plaintext at delivery time. We store it AES-256-GCM-encrypted\n--     at rest (same `encrypt()`/`decrypt()` as `whatsapp_config.\n--     access_token`), and return the plaintext to the creator exactly\n--     once so they can configure their verifier.\n--   - `events[]` is the subscription filter (free text[], validated\n--     in the app layer against `src/lib/webhooks/events.ts` — a new\n--     event type is a code change, not a migration, mirroring scopes).\n--   - `failure_count` counts *consecutive* delivery failures; the\n--     deliverer auto-sets `is_active = false` once it crosses a\n--     threshold so a permanently-dead endpoint stops being retried.\n--     A successful delivery resets it to 0.\n--\n-- RLS\n--   Settings-class, mirroring `api_keys`: any member may read the\n--   roster; only admin+ may create/update/delete. The delivery path\n--   and the public-API management routes both use the service-role\n--   client (an API caller has no `auth.uid()`), so RLS is the guard\n--   for any dashboard UI that reads the table directly.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nCREATE TABLE IF NOT EXISTS webhook_endpoints (\n  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  url              text NOT NULL,             -- HTTPS endpoint we POST to\n  secret           text NOT NULL,             -- AES-256-GCM-encrypted HMAC signing secret\n  events           text[] NOT NULL DEFAULT '{}',\n  is_active        boolean NOT NULL DEFAULT true,\n  last_delivery_at timestamptz,               -- last successful delivery\n  failure_count    integer NOT NULL DEFAULT 0, -- consecutive failures; reset to 0 on success\n  created_at       timestamptz NOT NULL DEFAULT now()\n);\n\n-- Every delivery + management query filters by account_id.\nCREATE INDEX IF NOT EXISTS webhook_endpoints_account_id_idx\n  ON webhook_endpoints (account_id);\n\nALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;\n\n-- SELECT: any member of the account (viewer+) can see the roster.\nDROP POLICY IF EXISTS webhook_endpoints_select ON webhook_endpoints;\nCREATE POLICY webhook_endpoints_select ON webhook_endpoints FOR SELECT\n  USING (is_account_member(account_id));\n\n-- INSERT / UPDATE / DELETE: admin+ only (settings-class).\nDROP POLICY IF EXISTS webhook_endpoints_insert ON webhook_endpoints;\nCREATE POLICY webhook_endpoints_insert ON webhook_endpoints FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS webhook_endpoints_update ON webhook_endpoints;\nCREATE POLICY webhook_endpoints_update ON webhook_endpoints FOR UPDATE\n  USING (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS webhook_endpoints_delete ON webhook_endpoints;\nCREATE POLICY webhook_endpoints_delete ON webhook_endpoints FOR DELETE\n  USING (is_account_member(account_id, 'admin'));\n\n-- ============================================================\n-- Atomic consecutive-failure counter.\n--\n-- The deliverer records failures through this function rather than a\n-- read-modify-write: two deliveries to the same endpoint can run\n-- concurrently (e.g. conversation.created + message.received for one\n-- inbound message), and a client-side `count = count + 1` would lose\n-- increments, so a dead endpoint might never reach the auto-disable\n-- threshold. The `+ 1` and the disable decision happen in one UPDATE.\n-- Only ever disables (never re-enables) — re-enabling is an explicit\n-- PATCH by an admin, which resets the counter.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.record_webhook_failure(\n  endpoint_id uuid,\n  max_failures int\n)\nRETURNS void AS $$\n  UPDATE webhook_endpoints\n  SET failure_count = failure_count + 1,\n      is_active = CASE\n        WHEN failure_count + 1 >= max_failures THEN false\n        ELSE is_active\n      END\n  WHERE id = endpoint_id;\n$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;"}	028_webhook_endpoints	souaib@junkiescoder.com	\N	\N
20260725113744	{"-- ============================================================\n-- 029_ai_reply.sql — AI reply assistant (bring-your-own-key)\n--\n-- Adds the account-level config for the AI reply assistant plus the\n-- two per-conversation columns the auto-reply bot needs to stay\n-- bounded.\n--\n-- Design notes\n--   - `ai_configs` is account-scoped and UNIQUE(account_id) — one AI\n--     setup per workspace, exactly like `whatsapp_config`. Teammates\n--     inside an account share it.\n--   - `api_key` is the caller's own OpenAI / Anthropic key. We call\n--     the provider *with* it on every draft/auto-reply, so we need the\n--     plaintext at call time — stored AES-256-GCM-encrypted at rest\n--     (same `encrypt()`/`decrypt()` as `whatsapp_config.access_token`\n--     and `webhook_endpoints.secret`) and never returned to the client\n--     after save (the settings UI shows a masked placeholder).\n--   - `created_by` records who saved it (audit); ON DELETE SET NULL so\n--     removing a teammate doesn't drop the workspace's AI config.\n--   - `is_active` is the master switch (draft + auto-reply both off\n--     when false). `auto_reply_enabled` gates only the inbound bot;\n--     `auto_reply_max_per_conversation` caps how many times the bot\n--     will answer one thread before going quiet (prevents runaway\n--     loops / bill blowout on a chatty customer).\n--\n--   - `conversations.ai_autoreply_disabled` — set true when the model\n--     signals a human handoff, or when someone turns the bot off for\n--     that one thread. Sticky: once a conversation is handed off it\n--     stays off until explicitly re-enabled.\n--   - `conversations.ai_reply_count` — running count of bot auto-\n--     replies in the thread, checked against\n--     `auto_reply_max_per_conversation`.\n--\n-- RLS\n--   Settings-class, mirroring `whatsapp_config` / `webhook_endpoints`:\n--   any member (viewer+) may read the config — the inbox draft button\n--   needs to know whether AI is on — but only admin+ may create /\n--   update / delete it. The auto-reply path runs under the service-role\n--   client (a webhook has no `auth.uid()`), so RLS guards dashboard\n--   reads, not the engine.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nCREATE TABLE IF NOT EXISTS ai_configs (\n  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  account_id                        uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,\n  created_by                        uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  provider                          text NOT NULL CHECK (provider IN ('openai', 'anthropic')),\n  model                             text NOT NULL,\n  api_key                           text NOT NULL,            -- AES-256-GCM-encrypted BYO provider key\n  system_prompt                     text,                     -- business context / persona / tone\n  is_active                         boolean NOT NULL DEFAULT false,\n  auto_reply_enabled                boolean NOT NULL DEFAULT false,\n  auto_reply_max_per_conversation   integer NOT NULL DEFAULT 3\n                                      CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20),\n  created_at                        timestamptz NOT NULL DEFAULT now(),\n  updated_at                        timestamptz NOT NULL DEFAULT now()\n);\n\nALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;\n\n-- SELECT: any member of the account (viewer+) can see the config so\n-- the inbox knows whether the \\"Draft with AI\\" affordance is live.\nDROP POLICY IF EXISTS ai_configs_select ON ai_configs;\nCREATE POLICY ai_configs_select ON ai_configs FOR SELECT\n  USING (is_account_member(account_id));\n\n-- INSERT / UPDATE / DELETE: admin+ only (settings-class).\nDROP POLICY IF EXISTS ai_configs_insert ON ai_configs;\nCREATE POLICY ai_configs_insert ON ai_configs FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_configs_update ON ai_configs;\nCREATE POLICY ai_configs_update ON ai_configs FOR UPDATE\n  USING (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_configs_delete ON ai_configs;\nCREATE POLICY ai_configs_delete ON ai_configs FOR DELETE\n  USING (is_account_member(account_id, 'admin'));\n\n-- Keep updated_at fresh on every write.\nCREATE OR REPLACE FUNCTION public.update_ai_configs_updated_at()\nRETURNS TRIGGER AS $$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nDROP TRIGGER IF EXISTS ai_configs_updated_at ON ai_configs;\nCREATE TRIGGER ai_configs_updated_at\n  BEFORE UPDATE ON ai_configs\n  FOR EACH ROW\n  EXECUTE FUNCTION public.update_ai_configs_updated_at();\n\n-- ============================================================\n-- Per-conversation auto-reply control.\n-- ============================================================\nALTER TABLE conversations\n  ADD COLUMN IF NOT EXISTS ai_autoreply_disabled boolean NOT NULL DEFAULT false;\n\nALTER TABLE conversations\n  ADD COLUMN IF NOT EXISTS ai_reply_count integer NOT NULL DEFAULT 0;\n\n-- ============================================================\n-- Atomic auto-reply slot claim.\n--\n-- The bot claims a reply slot through this function rather than a\n-- read-then-write from the app: two inbound messages on one\n-- conversation can be processed concurrently, and a client-side\n-- \\"read count, check < cap, then increment\\" would let both pass the\n-- check and overshoot the per-conversation cap. Here the cap check and\n-- the `+ 1` happen in a single UPDATE, so exactly `max_replies` slots\n-- can ever be claimed. Returns true when a slot was claimed (the caller\n-- may send), false when the cap is already reached (skip).\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.claim_ai_reply_slot(\n  conversation_id uuid,\n  max_replies integer\n)\nRETURNS boolean AS $$\n  WITH claimed AS (\n    UPDATE conversations\n    SET ai_reply_count = ai_reply_count + 1\n    WHERE id = conversation_id\n      AND ai_reply_count < max_replies\n    RETURNING 1\n  )\n  SELECT EXISTS (SELECT 1 FROM claimed);\n$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;\n\n-- The auto-reply bot claims slots under the service-role client (the\n-- inbound webhook has no auth.uid()), so it needs EXECUTE. SECURITY\n-- DEFINER alone is not enough — it sets the privileges the function runs\n-- *with*, not who may call it. Without this grant the RPC fails with\n-- permission-denied on instances where the default PUBLIC execute\n-- privilege has been revoked (hardened / self-hosted Supabase), and the\n-- bot silently never replies. Only the service role claims slots, so we\n-- grant to it alone (mirrors 007 / 012). See migration 031 / issue #345.\nGRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) TO service_role;"}	029_ai_reply	souaib@junkiescoder.com	\N	\N
20260725113745	{"-- ============================================================\n-- 030_ai_knowledge.sql — AI knowledge base (RAG grounding)\n--\n-- Gives the AI assistant (migration 029) an account-owned knowledge\n-- base — FAQ / policy / product text — that it retrieves into every\n-- draft and auto-reply, so it can answer business-specific questions\n-- instead of handing off.\n--\n-- Hybrid retrieval:\n--   - Lexical: a generated `fts` tsvector on each chunk, ranked with\n--     ts_rank. Works for every account with no extra credentials.\n--   - Semantic: an optional pgvector `embedding` per chunk (OpenAI\n--     text-embedding-3-small, 1536 dims), populated only when the\n--     account configures an embeddings key. Anthropic-only accounts\n--     (Anthropic has no embeddings API) keep the lexical path with\n--     zero extra setup.\n--\n-- pgvector: `CREATE EXTENSION IF NOT EXISTS vector` works on a stock\n-- Postgres. On hosted Supabase the extension usually lives in the\n-- `extensions` schema — if your project pins that, run\n-- `create extension if not exists vector with schema extensions;`\n-- once, then this file is a no-op for the extension.\n--\n-- RLS: settings-class, mirroring `ai_configs` / `whatsapp_config` —\n-- any member may read the knowledge base; only admin+ may change it.\n-- The retrieval RPCs and the ingest path run under the service-role\n-- client (the auto-reply bot has no auth.uid()), so RLS guards\n-- dashboard reads.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\nCREATE EXTENSION IF NOT EXISTS vector;\n\n-- Optional embeddings key (OpenAI-compatible). When set, the KB is\n-- embedded and semantic search turns on. Stored AES-256-GCM-encrypted,\n-- same as ai_configs.api_key.\nALTER TABLE ai_configs\n  ADD COLUMN IF NOT EXISTS embeddings_api_key text;\n\n-- ============================================================\n-- Documents — one row per KB entry the user pastes (title + body).\n-- ============================================================\nCREATE TABLE IF NOT EXISTS ai_knowledge_documents (\n  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  title       text NOT NULL,\n  content     text NOT NULL,\n  created_at  timestamptz NOT NULL DEFAULT now(),\n  updated_at  timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE INDEX IF NOT EXISTS ai_knowledge_documents_account_id_idx\n  ON ai_knowledge_documents (account_id);\n\nALTER TABLE ai_knowledge_documents ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS ai_knowledge_documents_select ON ai_knowledge_documents;\nCREATE POLICY ai_knowledge_documents_select ON ai_knowledge_documents FOR SELECT\n  USING (is_account_member(account_id));\n\nDROP POLICY IF EXISTS ai_knowledge_documents_insert ON ai_knowledge_documents;\nCREATE POLICY ai_knowledge_documents_insert ON ai_knowledge_documents FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_knowledge_documents_update ON ai_knowledge_documents;\nCREATE POLICY ai_knowledge_documents_update ON ai_knowledge_documents FOR UPDATE\n  USING (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_knowledge_documents_delete ON ai_knowledge_documents;\nCREATE POLICY ai_knowledge_documents_delete ON ai_knowledge_documents FOR DELETE\n  USING (is_account_member(account_id, 'admin'));\n\nCREATE OR REPLACE FUNCTION public.update_ai_knowledge_documents_updated_at()\nRETURNS TRIGGER AS $$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nDROP TRIGGER IF EXISTS ai_knowledge_documents_updated_at ON ai_knowledge_documents;\nCREATE TRIGGER ai_knowledge_documents_updated_at\n  BEFORE UPDATE ON ai_knowledge_documents\n  FOR EACH ROW\n  EXECUTE FUNCTION public.update_ai_knowledge_documents_updated_at();\n\n-- ============================================================\n-- Chunks — retrieval units. `account_id` is denormalized off the\n-- document so the match RPCs and RLS filter without a join.\n-- ============================================================\nCREATE TABLE IF NOT EXISTS ai_knowledge_chunks (\n  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  document_id  uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,\n  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  chunk_index  integer NOT NULL DEFAULT 0,\n  content      text NOT NULL,\n  -- Language-neutral FTS config: wacrm is used in many languages\n  -- (its markets include BR / LATAM / IN), and this lexical path is the\n  -- fallback for accounts without an embeddings key. `'simple'` tokenizes\n  -- + lowercases without English-only stemming/stopwords, so it degrades\n  -- gracefully in any language. (Per-account language config is a\n  -- follow-up; accounts wanting paraphrase/morphology matching add an\n  -- embeddings key for the semantic path.)\n  fts          tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,\n  embedding    vector(1536),\n  created_at   timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE INDEX IF NOT EXISTS ai_knowledge_chunks_account_id_idx\n  ON ai_knowledge_chunks (account_id);\nCREATE INDEX IF NOT EXISTS ai_knowledge_chunks_document_id_idx\n  ON ai_knowledge_chunks (document_id);\nCREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx\n  ON ai_knowledge_chunks USING gin (fts);\n-- Cosine-distance ANN index for the semantic path. Rows with a NULL\n-- embedding (lexical-only accounts) are simply absent from it.\n--\n-- HNSW (not IVFFlat): per-account knowledge bases start empty and grow\n-- incrementally, and IVFFlat must be trained on existing rows — built\n-- against an empty/tiny table its centroids are meaningless and recall\n-- is poor until it's large and REINDEXed. HNSW needs no training and is\n-- accurate from the first row.\nCREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_idx\n  ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);\n\nALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS ai_knowledge_chunks_select ON ai_knowledge_chunks;\nCREATE POLICY ai_knowledge_chunks_select ON ai_knowledge_chunks FOR SELECT\n  USING (is_account_member(account_id));\n\nDROP POLICY IF EXISTS ai_knowledge_chunks_insert ON ai_knowledge_chunks;\nCREATE POLICY ai_knowledge_chunks_insert ON ai_knowledge_chunks FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_knowledge_chunks_update ON ai_knowledge_chunks;\nCREATE POLICY ai_knowledge_chunks_update ON ai_knowledge_chunks FOR UPDATE\n  USING (is_account_member(account_id, 'admin'));\n\nDROP POLICY IF EXISTS ai_knowledge_chunks_delete ON ai_knowledge_chunks;\nCREATE POLICY ai_knowledge_chunks_delete ON ai_knowledge_chunks FOR DELETE\n  USING (is_account_member(account_id, 'admin'));\n\n-- ============================================================\n-- Retrieval RPCs. Both SECURITY DEFINER and hard-scoped to the passed\n-- account_id so the service-role caller can only ever read one\n-- account's chunks.\n-- ============================================================\n\n-- Lexical: full-text rank. `plainto_tsquery` turns a raw customer\n-- message into a query safely (no operator injection). Uses the same\n-- language-neutral `'simple'` config as the stored `fts` column.\nCREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(\n  p_account_id  uuid,\n  p_query       text,\n  p_match_count integer\n)\nRETURNS TABLE (id uuid, content text, rank real) AS $$\n  SELECT c.id,\n         c.content,\n         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank\n  FROM ai_knowledge_chunks c\n  WHERE c.account_id = p_account_id\n    AND c.fts @@ plainto_tsquery('simple', p_query)\n  ORDER BY rank DESC\n  LIMIT GREATEST(p_match_count, 0);\n$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;\n\n-- Semantic: cosine distance against the query embedding. Only rows\n-- that actually have an embedding participate.\n--\n-- `p_query_embedding` is declared `text` (not `vector`) and cast inside:\n-- the caller sends the canonical pgvector literal `[0.1,0.2,...]` as a\n-- plain string, so there's no ambiguity in how PostgREST binds a JSON\n-- value to a `vector` parameter. Casting a literal to a constant vector\n-- still lets the HNSW index serve the `<=>` order-by.\nCREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(\n  p_account_id      uuid,\n  p_query_embedding text,\n  p_match_count     integer\n)\nRETURNS TABLE (id uuid, content text, distance real) AS $$\n  SELECT c.id,\n         c.content,\n         (c.embedding <=> p_query_embedding::vector(1536)) AS distance\n  FROM ai_knowledge_chunks c\n  WHERE c.account_id = p_account_id\n    AND c.embedding IS NOT NULL\n  ORDER BY c.embedding <=> p_query_embedding::vector(1536)\n  LIMIT GREATEST(p_match_count, 0);\n$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;\n\n-- Lock down EXECUTE (mirrors migrations 018 / 025). These are\n-- SECURITY DEFINER and would otherwise default to PUBLIC — i.e. the\n-- anon role — which, since the function bypasses RLS and only gates on\n-- the passed account_id, would let an unauthenticated caller read any\n-- account's knowledge base. The draft path calls them as `authenticated`\n-- and the auto-reply bot as `service_role`.\nREVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) TO authenticated, service_role;\nREVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) TO authenticated, service_role;"}	030_ai_knowledge	souaib@junkiescoder.com	\N	\N
20260725113747	{"-- ============================================================\n-- 031_ai_reply_slot_grant.sql — fix: AI auto-reply never fires\n--\n-- Migration 029 created `claim_ai_reply_slot(uuid, integer)` as a\n-- SECURITY DEFINER function but never GRANTed EXECUTE on it — the only\n-- function in the schema missing its grant (cf. 007, 012, 018, 019,\n-- 025, 030, which all grant EXECUTE explicitly).\n--\n-- SECURITY DEFINER changes the privileges a function runs *with*, not\n-- who may *call* it: the caller still needs EXECUTE. On Postgres\n-- instances where the default PUBLIC execute privilege on public-schema\n-- functions has been revoked (standard on hardened / self-hosted\n-- Supabase), `service_role` therefore cannot invoke it. The AI\n-- auto-reply path runs entirely under the service-role client (the\n-- inbound webhook has no auth.uid()), so `db.rpc('claim_ai_reply_slot')`\n-- fails with permission-denied, the caller bails before sending, and the\n-- bot silently never answers ANY inbound message — while the Playground\n-- (which never claims a slot) keeps working. See issue #345.\n--\n-- Only the service role ever claims a slot, so we grant to it alone —\n-- matching the increment-counter precedent in 007 / 012, and never\n-- exposing a counter-mutating function to end users.\n--\n-- Idempotent — GRANT is a no-op when the privilege already exists.\n-- ============================================================\n\nGRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) TO service_role;"}	031_ai_reply_slot_grant	souaib@junkiescoder.com	\N	\N
20260725113805	{"-- ============================================================\n-- 032_fix_ai_knowledge_membership.sql — stop cross-account KB\n--                                        reads (GHSA-fg5p-2qc3-jmxr, H2)\n--\n-- The problem\n--\n--   `match_ai_knowledge_fts` and `match_ai_knowledge_semantic`\n--   (migration 030) are SECURITY DEFINER, so they bypass RLS. They\n--   filter only on the caller-supplied `p_account_id` and never\n--   call `is_account_member()`, yet they are GRANTed to\n--   `authenticated`. The 030 header assumed only the service-role\n--   bot would call them, but any logged-in user can hit PostgREST\n--   directly with a foreign `p_account_id` and read another\n--   tenant's knowledge base:\n--\n--     POST /rest/v1/rpc/match_ai_knowledge_fts\n--       { \\"p_account_id\\": \\"<victim>\\", \\"p_query\\": \\"price\\",\n--         \\"p_match_count\\": 1000 }\n--\n-- The fix\n--\n--   Recreate both functions as SECURITY INVOKER — the only change\n--   is the security mode; the bodies are byte-for-byte the same.\n--   The existing SELECT policy\n--     ai_knowledge_chunks_select = is_account_member(account_id)\n--   then governs `authenticated` callers, so a foreign\n--   `p_account_id` returns zero rows, while the auto-reply bot\n--   (service_role) still bypasses RLS and works unchanged. This\n--   mirrors the deliberate SECURITY INVOKER choice in\n--   `filter_contacts_by_tags` (migration 025).\n--\n--   The legitimate draft path already passes the caller's *own*\n--   accountId (see src/lib/ai/knowledge.ts → retrieveKnowledge),\n--   so it keeps returning that account's chunks under RLS.\n--\n-- NOTE FOR MAINTAINER\n--\n--   This migration was not run against a live database. Validate\n--   the two checks at the bottom in your own environment. If you\n--   would rather keep these SECURITY DEFINER, the alternative is to\n--   add `AND (auth.role() = 'service_role' OR\n--   is_account_member(p_account_id))` to each WHERE clause instead.\n-- ============================================================\n\n-- Lexical: full-text rank. Body unchanged from migration 030 —\n-- only SECURITY DEFINER → SECURITY INVOKER differs.\nCREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(\n  p_account_id  uuid,\n  p_query       text,\n  p_match_count integer\n)\nRETURNS TABLE (id uuid, content text, rank real) AS $$\n  SELECT c.id,\n         c.content,\n         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank\n  FROM ai_knowledge_chunks c\n  WHERE c.account_id = p_account_id\n    AND c.fts @@ plainto_tsquery('simple', p_query)\n  ORDER BY rank DESC\n  LIMIT GREATEST(p_match_count, 0);\n$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;\n\n-- Semantic: cosine distance. Body unchanged from migration 030 —\n-- only SECURITY DEFINER → SECURITY INVOKER differs.\nCREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(\n  p_account_id      uuid,\n  p_query_embedding text,\n  p_match_count     integer\n)\nRETURNS TABLE (id uuid, content text, distance real) AS $$\n  SELECT c.id,\n         c.content,\n         (c.embedding <=> p_query_embedding::vector(1536)) AS distance\n  FROM ai_knowledge_chunks c\n  WHERE c.account_id = p_account_id\n    AND c.embedding IS NOT NULL\n  ORDER BY c.embedding <=> p_query_embedding::vector(1536)\n  LIMIT GREATEST(p_match_count, 0);\n$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;\n\n-- Re-assert the EXECUTE grants (CREATE OR REPLACE preserves them,\n-- but keep them explicit and re-runnable — mirrors migration 030).\nREVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) TO authenticated, service_role;\nREVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) TO authenticated, service_role;"}	032_fix_ai_knowledge_membership	souaib@junkiescoder.com	\N	\N
20260725113807	{"-- ============================================================\n-- 033_ai_reply_polish.sql — AI reply assistant polish\n--\n-- Follow-ups to 029_ai_reply / 030_ai_knowledge that make the\n-- auto-reply bot visible and controllable from the inbox, complete the\n-- handoff, and record token spend:\n--\n--   1. messages.ai_generated       — marks a reply the bot sent (vs a\n--                                     deterministic Flow/bot send), so\n--                                     the inbox can badge it \\"AI\\".\n--   2. ai_configs.handoff_agent_id — where a handed-off conversation is\n--                                     routed. NULL = leave unassigned\n--                                     (drop into the shared queue).\n--   3. conversations.ai_handoff_summary\n--                                  — a short internal note the bot writes\n--                                    when it hands off, surfaced to the\n--                                    agent who takes over.\n--   4. ai_usage_log                — per-run provider token usage, for\n--                                    cost visibility on the account's BYO\n--                                    key. Written by the service role from\n--                                    the draft route + auto-reply bot.\n--\n-- Idempotent — safe to run multiple times.\n-- ============================================================\n\n-- ============================================================\n-- 1. Mark AI-generated messages.\n--\n-- Auto-replies are inserted as sender_type='bot' (same as Flow sends);\n-- this column is the only thing that distinguishes an LLM reply from a\n-- deterministic one, so the inbox can show the \\"AI\\" badge on the right\n-- bubbles only.\n-- ============================================================\nALTER TABLE messages\n  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;\n\n-- ============================================================\n-- 2. Handoff routing target + 3. handoff summary.\n-- ============================================================\nALTER TABLE ai_configs\n  ADD COLUMN IF NOT EXISTS handoff_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;\n\nALTER TABLE conversations\n  ADD COLUMN IF NOT EXISTS ai_handoff_summary text;\n\n-- ============================================================\n-- 4. Per-run token-usage log.\n--\n-- One row per LLM call (draft or auto-reply). Best-effort: the writer\n-- never blocks a reply on a failed insert. Kept append-only; prune with\n-- a scheduled job if it grows (an active account writes a handful of\n-- rows per conversation).\n--\n-- RLS: admin+ read (spend is billing-class, not something a viewer/agent\n-- needs). Writes come from the service-role client (webhook + route),\n-- which bypasses RLS, so there is no INSERT policy for `authenticated`.\n-- ============================================================\nCREATE TABLE IF NOT EXISTS ai_usage_log (\n  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,\n  -- 'auto_reply' | 'draft' — which surface spent the tokens.\n  mode              text NOT NULL CHECK (mode IN ('auto_reply', 'draft')),\n  provider          text NOT NULL CHECK (provider IN ('openai', 'anthropic')),\n  model             text NOT NULL,\n  prompt_tokens     integer NOT NULL DEFAULT 0,\n  completion_tokens integer NOT NULL DEFAULT 0,\n  total_tokens      integer NOT NULL DEFAULT 0,\n  created_at        timestamptz NOT NULL DEFAULT now()\n);\n\n-- Account-scoped, newest-first reads (usage dashboards, \\"spend this\n-- month\\") — the only access pattern.\nCREATE INDEX IF NOT EXISTS idx_ai_usage_log_account_created\n  ON ai_usage_log(account_id, created_at DESC);\n\nALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;\n\n-- SELECT: admin+ only (spend visibility is settings/billing-class).\nDROP POLICY IF EXISTS ai_usage_log_select ON ai_usage_log;\nCREATE POLICY ai_usage_log_select ON ai_usage_log FOR SELECT\n  USING (is_account_member(account_id, 'admin'));\n\n-- No INSERT/UPDATE/DELETE policies for `authenticated`: the log is\n-- written exclusively by the service role (webhook + draft route) and\n-- is never mutated from the client."}	033_ai_reply_polish	souaib@junkiescoder.com	\N	\N
20260725113808	{"-- ============================================================\n-- 034_fix_profiles_update_rls.sql — lock down privilege columns\n--                                    on profiles (GHSA-fg5p-2qc3-jmxr, C1)\n--\n-- NOTE: renamed from 031 → 034 to resolve a duplicate migration version.\n-- The 031 slot was already taken by 031_ai_reply_slot_grant.sql (#345),\n-- so shipping this as 031 too made a clean `supabase db` apply fail with\n-- a duplicate schema_migrations key (SQLSTATE 23505). This migration is\n-- idempotent (DROP POLICY IF EXISTS / CREATE OR REPLACE) and independent\n-- of the AI tables, so re-sequencing it after 033 is safe.\n--\n-- The problem\n--\n--   The `profiles_update` RLS policy from migration 017 gates on\n--   `auth.uid() = user_id` only — it lets a user edit their *own*\n--   row, which is correct for self-service fields (full_name,\n--   avatar). But `account_role` and `account_id` also live on\n--   `profiles`, and they are the source of truth for\n--   `is_account_member()`. RLS constrains *which rows* you may\n--   update, not *which columns*, and no column-level GRANT or\n--   trigger guards them. So the normal `authenticated` browser\n--   client can self-serve a privilege escalation / tenant move:\n--\n--     -- viewer self-promotes to owner of the shared account\n--     UPDATE profiles SET account_role = 'owner' WHERE user_id = auth.uid();\n--     -- attacker relocates into a victim tenant\n--     UPDATE profiles SET account_id = '<victim>' WHERE user_id = auth.uid();\n--\n--   Both pass the WITH CHECK because `user_id` is unchanged.\n--\n-- The fix\n--\n--   A BEFORE UPDATE trigger that rejects any change to\n--   `account_role` / `account_id` when the caller is the\n--   `authenticated` role (the browser). The legitimate writers are\n--   unaffected:\n--     - handle_new_user + the 018/019 member/invitation RPCs are\n--       SECURITY DEFINER owned by `postgres`, so `current_user` is\n--       `postgres`, not `authenticated`.\n--     - the server backend runs as `service_role`.\n--   Self-service edits that leave both columns untouched (the\n--   IS DISTINCT FROM checks are false) also pass through freely.\n--\n--   Membership stays owned by the supervised RPCs (018/019), which\n--   is exactly the model migration 018's header describes.\n--\n-- NOTE FOR MAINTAINER\n--\n--   `current_user` is the reliable discriminator here because every\n--   sanctioned writer runs as postgres (DEFINER) or service_role,\n--   and PostgREST's browser clients run as `authenticated`. If you\n--   ever add a NON-definer RPC or a new role that must write these\n--   columns, extend the guard's role check accordingly. Validate in\n--   your own environment before relying on this (see the checks at\n--   the bottom); this migration was not run against a live database.\n-- ============================================================\n\nCREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nSET search_path = public\nAS $$\nBEGIN\n  IF (NEW.account_role IS DISTINCT FROM OLD.account_role\n      OR NEW.account_id IS DISTINCT FROM OLD.account_id)\n     AND current_user = 'authenticated'\n  THEN\n    RAISE EXCEPTION\n      'account_role and account_id cannot be changed directly; use the account member/invitation RPCs'\n      USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  RETURN NEW;\nEND;\n$$;\n\nALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;\n\nDROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;\nCREATE TRIGGER enforce_profile_privilege_columns\n  BEFORE UPDATE ON public.profiles\n  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_columns();"}	034_fix_profiles_update_rls	souaib@junkiescoder.com	\N	\N
20260725113822	{"-- ============================================================\n-- 035_interactive_messages.sql\n--\n-- Full support for WhatsApp interactive messages (reply buttons +\n-- list messages) beyond the Flows subsystem.\n--\n--   1. messages.interactive_payload — the structured payload of an\n--      OUTBOUND interactive message (buttons / list) so it round-trips:\n--      the thread can re-render the buttons/rows we sent, not just the\n--      body text. Migration 010 already added 'interactive' to the\n--      content_type CHECK and the inbound `interactive_reply_id`\n--      column, so no CHECK change is needed here.\n--\n--   2. quick_replies — reusable snippets (plain text OR a saved\n--      interactive message) an agent can insert from the inbox\n--      composer. Account-scoped, same tenancy model as automations.\n-- ============================================================\n\n-- 1. Outbound interactive payload -----------------------------\nALTER TABLE messages\n  ADD COLUMN IF NOT EXISTS interactive_payload JSONB;\n\n-- 2. Quick replies --------------------------------------------\nCREATE TABLE IF NOT EXISTS quick_replies (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  -- Tenancy. Every member of the account shares its quick replies.\n  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  -- Author / audit only — never used for tenancy isolation.\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  title TEXT NOT NULL,\n  -- 'text' snippets carry `content_text`; 'interactive' snippets carry\n  -- `interactive_payload` (validated app-side against Meta's limits).\n  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'interactive')),\n  content_text TEXT,\n  interactive_payload JSONB,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_quick_replies_account ON quick_replies(account_id);\n\nALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;\n\n-- Account-scoped policies mirroring automations (see 017): any member\n-- can read; agent+ can create / edit / delete.\nDROP POLICY IF EXISTS quick_replies_select ON quick_replies;\nDROP POLICY IF EXISTS quick_replies_insert ON quick_replies;\nDROP POLICY IF EXISTS quick_replies_update ON quick_replies;\nDROP POLICY IF EXISTS quick_replies_delete ON quick_replies;\nCREATE POLICY quick_replies_select ON quick_replies FOR SELECT\n  USING (is_account_member(account_id));\nCREATE POLICY quick_replies_insert ON quick_replies FOR INSERT\n  WITH CHECK (is_account_member(account_id, 'agent'));\nCREATE POLICY quick_replies_update ON quick_replies FOR UPDATE\n  USING (is_account_member(account_id, 'agent'));\nCREATE POLICY quick_replies_delete ON quick_replies FOR DELETE\n  USING (is_account_member(account_id, 'agent'));\n\nDROP TRIGGER IF EXISTS set_updated_at ON quick_replies;\nCREATE TRIGGER set_updated_at BEFORE UPDATE ON quick_replies\n  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"}	035_interactive_messages	souaib@junkiescoder.com	\N	\N
20260725113823	{"-- ============================================================\n-- 036_conversation_contact_dedup\n--\n-- Prevent the same contact from fragmenting into multiple\n-- conversations within one account (issue #363).\n--\n-- The inbound webhook and the public-API resolver both follow a\n-- \\"one conversation per (account, contact)\\" convention, but that\n-- convention was only ever enforced in application code with a\n-- `.single()` / `.maybeSingle()` lookup and no DB constraint. Two\n-- problems compounded:\n--\n--   1. A race (Meta retries a delivery, or a batch delivers two\n--      messages that fan out to concurrent `after()` runs) let two\n--      inserts both miss the lookup and create two conversations —\n--      unlike contacts (migration 022) there was no unique index and\n--      no unique-violation backstop.\n--   2. Once ≥2 conversations existed for a contact, the `.single()`\n--      lookup errored on *every* subsequent inbound message, so the\n--      code fell through and created yet another conversation each\n--      time — the duplication snowballed, which is what the reporter\n--      saw (a wall of duplicate chats for one number).\n--\n-- This migration mirrors 022_contact_phone_dedup:\n--   1. merges existing duplicate conversations into the oldest row,\n--      re-pointing every conversation-scoped child first so nothing\n--      is lost;\n--   2. adds a UNIQUE index on (account_id, contact_id) — the\n--      authoritative guarantee that covers every write path.\n--\n-- Idempotent. **No data loss** — duplicate conversations are merged,\n-- not dropped: child rows (messages, message_reactions, deals,\n-- flow_runs, notifications, ai_usage_log) are re-pointed to the\n-- surviving (oldest) conversation before the losers are deleted.\n-- ============================================================\n\n-- 1) One-time (re-runnable) merge of existing duplicates.\n--    SECURITY DEFINER so it can re-point rows across tables\n--    regardless of the caller's RLS; it only ever collapses\n--    conversations that share the same (account_id, contact_id).\nCREATE OR REPLACE FUNCTION public.merge_duplicate_conversations()\nRETURNS INTEGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_group    RECORD;\n  v_survivor UUID;\n  v_losers   UUID[];\n  v_all      UUID[];\n  v_merged   INTEGER := 0;\nBEGIN\n  FOR v_group IN\n    SELECT account_id,\n           contact_id,\n           array_agg(id ORDER BY created_at ASC, id ASC) AS ids,\n           COALESCE(SUM(unread_count), 0)                AS total_unread\n    FROM conversations\n    GROUP BY account_id, contact_id\n    HAVING count(*) > 1\n  LOOP\n    v_all      := v_group.ids;\n    v_survivor := v_all[1];\n    v_losers   := v_all[2:array_length(v_all, 1)];\n\n    -- Re-point every conversation-scoped child from the losers onto\n    -- the survivor. None of these carry a conversation-scoped unique\n    -- constraint (message_id is intentionally non-unique — see\n    -- migration 009), so a plain UPDATE is safe. Doing this BEFORE the\n    -- delete is what saves the ON DELETE CASCADE children (messages,\n    -- message_reactions, notifications) from being removed with the\n    -- loser conversations.\n    UPDATE messages          SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n    UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n    UPDATE deals             SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n    UPDATE flow_runs         SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n    UPDATE notifications     SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n    UPDATE ai_usage_log      SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);\n\n    -- Roll the merged unread counts onto the survivor and re-derive\n    -- its last-message summary from the now-complete message set, so\n    -- the surviving thread reflects the full history.\n    UPDATE conversations c\n    SET unread_count      = v_group.total_unread,\n        last_message_text = lm.content_text,\n        last_message_at   = lm.created_at,\n        updated_at        = NOW()\n    FROM (\n      SELECT content_text, created_at\n      FROM messages\n      WHERE conversation_id = v_survivor\n      ORDER BY created_at DESC\n      LIMIT 1\n    ) lm\n    WHERE c.id = v_survivor;\n\n    -- Survivor may have no messages at all (edge case). Still fold in\n    -- the merged unread count in that case.\n    UPDATE conversations\n    SET unread_count = v_group.total_unread,\n        updated_at   = NOW()\n    WHERE id = v_survivor\n      AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_survivor);\n\n    DELETE FROM conversations WHERE id = ANY(v_losers);\n\n    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);\n  END LOOP;\n\n  RETURN v_merged;\nEND;\n$$;\n\nALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;\nREVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC;\n\n-- Collapse whatever duplicates exist right now.\nSELECT public.merge_duplicate_conversations();\n\n-- 2) Authoritative guarantee: one conversation per (account, contact).\n--    Every write path (inbound webhook, public-API resolver) now has a\n--    DB-level backstop, and its unique-violation handling can re-resolve\n--    the winning row instead of compounding duplicates.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact\n  ON conversations (account_id, contact_id);"}	036_conversation_contact_dedup	souaib@junkiescoder.com	\N	\N
20260725113156	{"-- 016_flow_media.sql"}	016_flow_media	\N	\N	\N
20260727111049	{"-- ============================================================\n-- 039_member_suspension.sql — Member Suspension\n--\n-- Adds the is_active column to profiles and an RPC to safely\n-- toggle it.\n-- ============================================================\n\n-- Add the column\nALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;\n\n-- ============================================================\n-- set_member_status(p_user_id, p_is_active)\n--\n-- Owner/Admin toggles another member's active status within the\n-- caller's account. Owners cannot suspend themselves.\n-- ============================================================\nCREATE OR REPLACE FUNCTION public.set_member_status(\n  p_user_id UUID,\n  p_is_active BOOLEAN\n) RETURNS VOID\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_caller_account_id UUID;\n  v_caller_role account_role_enum;\n  v_target_account_id UUID;\n  v_target_role account_role_enum;\nBEGIN\n  -- Caller must be authenticated.\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';\n  END IF;\n\n  -- Resolve caller's account + role.\n  SELECT account_id, account_role\n  INTO v_caller_account_id, v_caller_role\n  FROM profiles\n  WHERE user_id = auth.uid();\n\n  IF v_caller_account_id IS NULL THEN\n    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';\n  END IF;\n\n  -- Caller must be admin+.\n  IF v_caller_role NOT IN ('owner', 'admin') THEN\n    RAISE EXCEPTION 'This action requires the admin role or higher'\n      USING ERRCODE = '42501';\n  END IF;\n\n  -- Can't suspend self via this endpoint.\n  IF p_user_id = auth.uid() THEN\n    RAISE EXCEPTION 'Cannot suspend or activate your own account'\n      USING ERRCODE = '22023';\n  END IF;\n\n  -- Resolve target.\n  SELECT account_id, account_role\n  INTO v_target_account_id, v_target_role\n  FROM profiles\n  WHERE user_id = p_user_id;\n\n  IF v_target_account_id IS NULL THEN\n    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';\n  END IF;\n\n  -- Target must be in caller's account.\n  IF v_target_account_id <> v_caller_account_id THEN\n    RAISE EXCEPTION 'Target user is not a member of your account'\n      USING ERRCODE = '42501';\n  END IF;\n\n  -- Owners cannot be suspended.\n  IF v_target_role = 'owner' THEN\n    RAISE EXCEPTION 'Cannot suspend the account owner'\n      USING ERRCODE = '22023';\n  END IF;\n\n  -- Commit the update\n  UPDATE profiles\n  SET \n    is_active = p_is_active,\n    updated_at = NOW()\n  WHERE user_id = p_user_id;\n\nEND;\n$$;"}	039_member_suspension	souaib@junkiescoder.com	\N	\N
20260728071958	{"-- Add connection_source column to whatsapp_config\nALTER TABLE public.whatsapp_config\nADD COLUMN IF NOT EXISTS connection_source TEXT DEFAULT 'manual';"}	038_embedded_signup_source	souaib@junkiescoder.com	\N	\N
20260729083044	{"-- ============================================================\n-- 040_super_admin_and_bans.sql\n-- Adds super admin flag and account ban system\n-- ============================================================\n\n-- 1. Add is_super_admin flag to profiles\nALTER TABLE profiles \n  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;\n\n-- 2. Add ban columns to accounts table\nALTER TABLE accounts\n  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,\n  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,\n  ADD COLUMN IF NOT EXISTS banned_reason TEXT,\n  ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;\n\n-- 3. Index for quick super admin lookups\nCREATE INDEX IF NOT EXISTS idx_profiles_super_admin \n  ON profiles(is_super_admin) WHERE is_super_admin = TRUE;\n\n-- 4. Index for banned accounts\nCREATE INDEX IF NOT EXISTS idx_accounts_banned \n  ON accounts(is_banned) WHERE is_banned = TRUE;"}	040_super_admin_and_bans	souaib@junkiescoder.com	\N	\N
20260729083101	{"-- ============================================================\n-- 041_landing_page_cms.sql\n-- CMS tables for the dynamic landing page\n-- ============================================================\n\n-- 1. SITE SETTINGS — global config (singleton row)\nCREATE TABLE IF NOT EXISTS site_settings (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  site_name TEXT NOT NULL DEFAULT 'Replai',\n  tagline TEXT NOT NULL DEFAULT 'AI-Powered WhatsApp CRM',\n  site_description TEXT DEFAULT 'Self-hostable CRM platform for WhatsApp with AI replies, automations, and team collaboration.',\n  logo_url TEXT,\n  favicon_url TEXT,\n  meta_title TEXT DEFAULT 'Replai — AI-Powered WhatsApp CRM',\n  meta_description TEXT,\n  og_image_url TEXT,\n  canonical_url TEXT DEFAULT 'https://replai.junkiescoder.com',\n  social_twitter TEXT,\n  social_linkedin TEXT,\n  social_github TEXT,\n  social_instagram TEXT,\n  social_youtube TEXT,\n  support_email TEXT DEFAULT 'support@junkiescoder.com',\n  sales_email TEXT DEFAULT 'sales@junkiescoder.com',\n  privacy_email TEXT DEFAULT 'privacy@junkiescoder.com',\n  legal_email TEXT DEFAULT 'legal@junkiescoder.com',\n  copyright_text TEXT DEFAULT '2026 Junkies Coder. All rights reserved.',\n  show_social_icons BOOLEAN DEFAULT TRUE,\n  show_newsletter BOOLEAN DEFAULT FALSE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- 2. LANDING SECTIONS — ordered content blocks\nCREATE TABLE IF NOT EXISTS landing_sections (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  section_key TEXT NOT NULL UNIQUE,  -- e.g. 'hero', 'features', 'pricing', 'how_it_works', 'ai_highlight', 'integrations', 'testimonials', 'cta_banner', 'social_proof'\n  title TEXT,\n  subtitle TEXT,\n  body_text TEXT,                     -- main content / description\n  cta_primary_text TEXT,\n  cta_primary_link TEXT,\n  cta_secondary_text TEXT,\n  cta_secondary_link TEXT,\n  background_style TEXT DEFAULT 'default',  -- 'default', 'gradient', 'image'\n  background_image_url TEXT,\n  is_visible BOOLEAN NOT NULL DEFAULT TRUE,\n  position INTEGER NOT NULL DEFAULT 0,\n  extra_data JSONB DEFAULT '{}',     -- flexible field for section-specific data\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_landing_sections_position ON landing_sections(position);\n\n-- 3. LANDING FEATURES — individual feature cards\nCREATE TABLE IF NOT EXISTS landing_features (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  icon_name TEXT NOT NULL DEFAULT 'MessageSquare',  -- Lucide icon name\n  title TEXT NOT NULL,\n  description TEXT NOT NULL,\n  position INTEGER NOT NULL DEFAULT 0,\n  is_visible BOOLEAN NOT NULL DEFAULT TRUE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_landing_features_position ON landing_features(position);\n\n-- 4. LANDING TESTIMONIALS\nCREATE TABLE IF NOT EXISTS landing_testimonials (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  quote TEXT NOT NULL,\n  author_name TEXT NOT NULL,\n  author_role TEXT,\n  author_company TEXT,\n  author_avatar_url TEXT,\n  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),\n  position INTEGER NOT NULL DEFAULT 0,\n  is_visible BOOLEAN NOT NULL DEFAULT TRUE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- 5. LANDING PRICING TIERS\nCREATE TABLE IF NOT EXISTS landing_pricing_tiers (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  name TEXT NOT NULL,                -- e.g. 'Starter', 'Professional', 'Enterprise'\n  price_monthly TEXT,                -- e.g. '$29', '$79', 'Custom'\n  price_yearly TEXT,                 -- e.g. '$290', '$790', 'Custom'\n  price_subtitle TEXT,               -- e.g. 'per month', 'billed annually'\n  features JSONB NOT NULL DEFAULT '[]',  -- array of strings: [\\"Feature 1\\", \\"Feature 2\\"]\n  is_highlighted BOOLEAN DEFAULT FALSE,  -- \\"Most Popular\\" badge\n  highlight_label TEXT DEFAULT 'Most Popular',\n  cta_text TEXT DEFAULT 'Get Started',\n  cta_link TEXT DEFAULT '/signup',\n  position INTEGER NOT NULL DEFAULT 0,\n  is_visible BOOLEAN NOT NULL DEFAULT TRUE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- 6. LANDING INTEGRATIONS — badge cards\nCREATE TABLE IF NOT EXISTS landing_integrations (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  name TEXT NOT NULL,\n  description TEXT,\n  icon_url TEXT,           -- URL to integration logo in Supabase Storage\n  position INTEGER NOT NULL DEFAULT 0,\n  is_visible BOOLEAN NOT NULL DEFAULT TRUE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- 7. LEGAL PAGES — markdown content\nCREATE TABLE IF NOT EXISTS legal_pages (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  slug TEXT NOT NULL UNIQUE,          -- 'privacy-policy', 'terms-of-service', etc.\n  title TEXT NOT NULL,\n  content_markdown TEXT NOT NULL DEFAULT '',\n  is_published BOOLEAN NOT NULL DEFAULT TRUE,\n  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\n-- 8. LANDING IMAGES — reusable image assets\nCREATE TABLE IF NOT EXISTS landing_images (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  image_key TEXT NOT NULL UNIQUE,    -- e.g. 'hero_mockup', 'hero_bg', 'og_image'\n  url TEXT NOT NULL,                 -- Supabase Storage URL\n  alt_text TEXT DEFAULT '',\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);"}	041_landing_page_cms	souaib@junkiescoder.com	\N	\N
20260729083154	{"-- ============================================================\n-- 043_platform_analytics.sql\n-- Views and RPCs for super admin analytics\n-- ============================================================\n\n-- 1. Platform-wide account summary view\nCREATE OR REPLACE VIEW v_platform_accounts_summary AS\nSELECT \n  a.id AS account_id,\n  a.name AS account_name,\n  a.is_banned,\n  a.banned_at,\n  a.banned_reason,\n  a.created_at AS account_created_at,\n  -- Owner info\n  p_owner.user_id AS owner_user_id,\n  p_owner.full_name AS owner_name,\n  p_owner.email AS owner_email,\n  p_owner.avatar_url AS owner_avatar_url,\n  -- Member count\n  (SELECT COUNT(*) FROM profiles p2 WHERE p2.account_id = a.id) AS member_count,\n  -- Contact count\n  (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id) AS contact_count,\n  -- Conversation count\n  (SELECT COUNT(*) FROM conversations cv WHERE cv.account_id = a.id) AS conversation_count,\n  -- Message count (last 30 days)\n  (SELECT COUNT(*) FROM messages m \n   JOIN conversations cv2 ON cv2.id = m.conversation_id \n   WHERE cv2.account_id = a.id \n   AND m.created_at > NOW() - INTERVAL '30 days') AS messages_30d,\n  -- WhatsApp connection status\n  (SELECT wc.status FROM whatsapp_config wc WHERE wc.account_id = a.id LIMIT 1) AS whatsapp_status,\n  -- Last activity (most recent message)\n  (SELECT MAX(m2.created_at) FROM messages m2 \n   JOIN conversations cv3 ON cv3.id = m2.conversation_id \n   WHERE cv3.account_id = a.id) AS last_activity_at\nFROM accounts a\nJOIN profiles p_owner ON p_owner.user_id = a.owner_user_id;\n\n-- 2. Platform metrics RPC\nCREATE OR REPLACE FUNCTION fn_platform_metrics()\nRETURNS JSON\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  result JSON;\nBEGIN\n  SELECT json_build_object(\n    'total_accounts', (SELECT COUNT(*) FROM accounts),\n    'total_users', (SELECT COUNT(*) FROM profiles),\n    'active_today', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p \n      JOIN member_presence mp ON mp.user_id = p.user_id \n      WHERE mp.last_seen_at > NOW() - INTERVAL '24 hours'),\n    'active_7d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p \n      JOIN member_presence mp ON mp.user_id = p.user_id \n      WHERE mp.last_seen_at > NOW() - INTERVAL '7 days'),\n    'active_30d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p \n      JOIN member_presence mp ON mp.user_id = p.user_id \n      WHERE mp.last_seen_at > NOW() - INTERVAL '30 days'),\n    'messages_today', (SELECT COUNT(*) FROM messages WHERE created_at > CURRENT_DATE),\n    'messages_7d', (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '7 days'),\n    'new_accounts_today', (SELECT COUNT(*) FROM accounts WHERE created_at > CURRENT_DATE),\n    'new_accounts_7d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '7 days'),\n    'new_accounts_30d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '30 days'),\n    'banned_accounts', (SELECT COUNT(*) FROM accounts WHERE is_banned = TRUE),\n    'total_contacts', (SELECT COUNT(*) FROM contacts),\n    'total_broadcasts', (SELECT COUNT(*) FROM broadcasts),\n    'total_automations', (SELECT COUNT(*) FROM automations WHERE is_active = TRUE),\n    'total_deals_value', (SELECT COALESCE(SUM(value), 0) FROM deals WHERE status = 'open'),\n    'connected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'connected'),\n    'disconnected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'disconnected')\n  ) INTO result;\n  RETURN result;\nEND;\n$$;\n\n-- 3. Account deep dive RPC\nCREATE OR REPLACE FUNCTION fn_account_deep_dive(target_account_id UUID)\nRETURNS JSON\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  result JSON;\nBEGIN\n  SELECT json_build_object(\n    'account', (SELECT row_to_json(a.*) FROM accounts a WHERE a.id = target_account_id),\n    'members', (\n      SELECT json_agg(json_build_object(\n        'user_id', p.user_id,\n        'full_name', p.full_name,\n        'email', p.email,\n        'avatar_url', p.avatar_url,\n        'account_role', p.account_role,\n        'permissions', p.permissions,\n        'is_active', p.is_active,\n        'created_at', p.created_at,\n        'last_seen_at', (SELECT mp.last_seen_at FROM member_presence mp WHERE mp.user_id = p.user_id),\n        'is_online', (SELECT mp.last_seen_at > NOW() - INTERVAL '5 minutes' FROM member_presence mp WHERE mp.user_id = p.user_id)\n      ))\n      FROM profiles p WHERE p.account_id = target_account_id\n    ),\n    'stats', json_build_object(\n      'contact_count', (SELECT COUNT(*) FROM contacts WHERE account_id = target_account_id),\n      'conversation_count', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id),\n      'active_conversations', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id AND status = 'open'),\n      'messages_total', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id),\n      'messages_30d', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id AND m.created_at > NOW() - INTERVAL '30 days'),\n      'active_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id AND is_active = TRUE),\n      'total_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id),\n      'broadcasts_sent', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id AND status = 'sent'),\n      'deals_open_value', (SELECT COALESCE(SUM(value), 0) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open'),\n      'deals_open_count', (SELECT COUNT(*) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open')\n    ),\n    'whatsapp_config', (\n      SELECT row_to_json(wc.*)\n      FROM whatsapp_config wc WHERE wc.account_id = target_account_id\n      LIMIT 1\n    )\n  ) INTO result;\n  RETURN result;\nEND;\n$$;\n\n-- 4. New signups over time (for growth chart)\nCREATE OR REPLACE FUNCTION fn_signups_over_time(days_back INTEGER DEFAULT 30)\nRETURNS JSON\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  result JSON;\nBEGIN\n  SELECT json_agg(row_to_json(t)) INTO result\n  FROM (\n    SELECT \n      d::date AS date,\n      (SELECT COUNT(*) FROM accounts WHERE created_at::date = d::date) AS new_accounts,\n      (SELECT COUNT(*) FROM profiles WHERE created_at::date = d::date) AS new_users\n    FROM generate_series(\n      CURRENT_DATE - (days_back || ' days')::INTERVAL,\n      CURRENT_DATE,\n      '1 day'::INTERVAL\n    ) AS d\n    ORDER BY d\n  ) t;\n  RETURN result;\nEND;\n$$;"}	043_platform_analytics	souaib@junkiescoder.com	\N	\N
20260805080503	{"CREATE TABLE IF NOT EXISTS contact_page_settings (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  heading TEXT NOT NULL DEFAULT 'Get in Touch',\n  subheading TEXT NOT NULL DEFAULT 'Have a question or need help? We''d love to hear from you.',\n  office_address TEXT DEFAULT '123 Business Hub, Mumbai, Maharashtra, India',\n  phone_number TEXT DEFAULT '+91 8828891029',\n  email_address TEXT DEFAULT 'info@junkiescoder.com',\n  working_hours TEXT DEFAULT 'Mon – Fri, 9:00 AM – 6:00 PM IST',\n  form_heading TEXT DEFAULT 'Send us a message',\n  form_subheading TEXT DEFAULT 'Fill out the form below and our team will get back to you within 24 hours.',\n  map_embed_url TEXT,\n  extra_data JSONB DEFAULT '{}',\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE TABLE IF NOT EXISTS contact_submissions (\n  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  subject TEXT,\n  message TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);\nCREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON contact_submissions(created_at DESC);\n\nALTER TABLE site_settings ADD COLUMN IF NOT EXISTS contact_notification_email TEXT DEFAULT 'info@junkiescoder.com';"}	046_contact_page	souaib@junkiescoder.com	\N	\N
\.


--
-- TOC entry 4127 (class 0 OID 16612)
-- Dependencies: 271
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--

COPY vault.secrets (id, name, description, secret, key_id, nonce, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5930 (class 0 OID 0)
-- Dependencies: 266
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 121, true);


--
-- TOC entry 5931 (class 0 OID 0)
-- Dependencies: 297
-- Name: subscription_id_seq; Type: SEQUENCE SET; Schema: realtime; Owner: supabase_realtime_admin
--

SELECT pg_catalog.setval('realtime.subscription_id_seq', 3633, true);


--
-- TOC entry 4639 (class 2606 OID 16789)
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- TOC entry 4608 (class 2606 OID 16535)
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- TOC entry 4694 (class 2606 OID 17121)
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- TOC entry 4696 (class 2606 OID 17119)
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 4662 (class 2606 OID 16895)
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- TOC entry 4617 (class 2606 OID 16913)
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- TOC entry 4619 (class 2606 OID 16923)
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- TOC entry 4606 (class 2606 OID 16528)
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- TOC entry 4641 (class 2606 OID 16782)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- TOC entry 4637 (class 2606 OID 16770)
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- TOC entry 4629 (class 2606 OID 16963)
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- TOC entry 4631 (class 2606 OID 16757)
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- TOC entry 4675 (class 2606 OID 17022)
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- TOC entry 4677 (class 2606 OID 17020)
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- TOC entry 4679 (class 2606 OID 17018)
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- TOC entry 4689 (class 2606 OID 17080)
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- TOC entry 4672 (class 2606 OID 16982)
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- TOC entry 4683 (class 2606 OID 17044)
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- TOC entry 4685 (class 2606 OID 17046)
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- TOC entry 4666 (class 2606 OID 16948)
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4600 (class 2606 OID 16518)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4603 (class 2606 OID 16699)
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- TOC entry 4651 (class 2606 OID 16829)
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- TOC entry 4653 (class 2606 OID 16827)
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 4658 (class 2606 OID 16843)
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- TOC entry 4611 (class 2606 OID 16541)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4624 (class 2606 OID 16720)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4648 (class 2606 OID 16810)
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- TOC entry 4643 (class 2606 OID 16801)
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 4593 (class 2606 OID 16883)
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- TOC entry 4595 (class 2606 OID 16505)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4704 (class 2606 OID 17158)
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- TOC entry 4700 (class 2606 OID 17141)
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- TOC entry 4871 (class 2606 OID 18191)
-- Name: account_invitations account_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_pkey PRIMARY KEY (id);


--
-- TOC entry 4873 (class 2606 OID 18193)
-- Name: account_invitations account_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 4867 (class 2606 OID 18174)
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- TOC entry 4892 (class 2606 OID 18589)
-- Name: ai_configs ai_configs_account_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_account_id_key UNIQUE (account_id);


--
-- TOC entry 4894 (class 2606 OID 18587)
-- Name: ai_configs ai_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_pkey PRIMARY KEY (id);


--
-- TOC entry 4903 (class 2606 OID 18975)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- TOC entry 4897 (class 2606 OID 18947)
-- Name: ai_knowledge_documents ai_knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 4905 (class 2606 OID 19017)
-- Name: ai_usage_log ai_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_pkey PRIMARY KEY (id);


--
-- TOC entry 4881 (class 2606 OID 18482)
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- TOC entry 4883 (class 2606 OID 18480)
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- TOC entry 4832 (class 2606 OID 17933)
-- Name: automation_logs automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4837 (class 2606 OID 17964)
-- Name: automation_pending_executions automation_pending_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_pkey PRIMARY KEY (id);


--
-- TOC entry 4828 (class 2606 OID 17909)
-- Name: automation_steps automation_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_pkey PRIMARY KEY (id);


--
-- TOC entry 4822 (class 2606 OID 17889)
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- TOC entry 4817 (class 2606 OID 17823)
-- Name: broadcast_recipients broadcast_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_pkey PRIMARY KEY (id);


--
-- TOC entry 4814 (class 2606 OID 17806)
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- TOC entry 4770 (class 2606 OID 17591)
-- Name: contact_custom_values contact_custom_values_contact_id_custom_field_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_custom_values
    ADD CONSTRAINT contact_custom_values_contact_id_custom_field_id_key UNIQUE (contact_id, custom_field_id);


--
-- TOC entry 4772 (class 2606 OID 17589)
-- Name: contact_custom_values contact_custom_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_custom_values
    ADD CONSTRAINT contact_custom_values_pkey PRIMARY KEY (id);


--
-- TOC entry 4774 (class 2606 OID 17611)
-- Name: contact_notes contact_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);


--
-- TOC entry 4958 (class 2606 OID 19605)
-- Name: contact_page_settings contact_page_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_page_settings
    ADD CONSTRAINT contact_page_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4964 (class 2606 OID 19632)
-- Name: contact_replies contact_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_replies
    ADD CONSTRAINT contact_replies_pkey PRIMARY KEY (id);


--
-- TOC entry 4960 (class 2606 OID 19617)
-- Name: contact_submissions contact_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);


--
-- TOC entry 4761 (class 2606 OID 17551)
-- Name: contact_tags contact_tags_contact_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_tag_id_key UNIQUE (contact_id, tag_id);


--
-- TOC entry 4763 (class 2606 OID 17549)
-- Name: contact_tags contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);


--
-- TOC entry 4752 (class 2606 OID 17518)
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- TOC entry 4777 (class 2606 OID 17635)
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- TOC entry 4767 (class 2606 OID 17574)
-- Name: custom_fields custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);


--
-- TOC entry 4808 (class 2606 OID 17759)
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- TOC entry 4852 (class 2606 OID 18071)
-- Name: flow_nodes flow_nodes_flow_id_node_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_nodes
    ADD CONSTRAINT flow_nodes_flow_id_node_key_key UNIQUE (flow_id, node_key);


--
-- TOC entry 4854 (class 2606 OID 18069)
-- Name: flow_nodes flow_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_nodes
    ADD CONSTRAINT flow_nodes_pkey PRIMARY KEY (id);


--
-- TOC entry 4863 (class 2606 OID 18132)
-- Name: flow_run_events flow_run_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_run_events
    ADD CONSTRAINT flow_run_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4857 (class 2606 OID 18092)
-- Name: flow_runs flow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_pkey PRIMARY KEY (id);


--
-- TOC entry 4847 (class 2606 OID 18049)
-- Name: flows flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_pkey PRIMARY KEY (id);


--
-- TOC entry 4938 (class 2606 OID 19458)
-- Name: landing_faqs landing_faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_faqs
    ADD CONSTRAINT landing_faqs_pkey PRIMARY KEY (id);


--
-- TOC entry 4919 (class 2606 OID 19303)
-- Name: landing_features landing_features_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_features
    ADD CONSTRAINT landing_features_pkey PRIMARY KEY (id);


--
-- TOC entry 4931 (class 2606 OID 19375)
-- Name: landing_images landing_images_image_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_images
    ADD CONSTRAINT landing_images_image_key_key UNIQUE (image_key);


--
-- TOC entry 4933 (class 2606 OID 19373)
-- Name: landing_images landing_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_images
    ADD CONSTRAINT landing_images_pkey PRIMARY KEY (id);


--
-- TOC entry 4925 (class 2606 OID 19347)
-- Name: landing_integrations landing_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_integrations
    ADD CONSTRAINT landing_integrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4923 (class 2606 OID 19335)
-- Name: landing_pricing_tiers landing_pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_pricing_tiers
    ADD CONSTRAINT landing_pricing_tiers_pkey PRIMARY KEY (id);


--
-- TOC entry 4914 (class 2606 OID 19287)
-- Name: landing_sections landing_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_sections
    ADD CONSTRAINT landing_sections_pkey PRIMARY KEY (id);


--
-- TOC entry 4916 (class 2606 OID 19289)
-- Name: landing_sections landing_sections_section_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_sections
    ADD CONSTRAINT landing_sections_section_key_key UNIQUE (section_key);


--
-- TOC entry 4921 (class 2606 OID 19318)
-- Name: landing_testimonials landing_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.landing_testimonials
    ADD CONSTRAINT landing_testimonials_pkey PRIMARY KEY (id);


--
-- TOC entry 4927 (class 2606 OID 19360)
-- Name: legal_pages legal_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_pages
    ADD CONSTRAINT legal_pages_pkey PRIMARY KEY (id);


--
-- TOC entry 4929 (class 2606 OID 19362)
-- Name: legal_pages legal_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_pages
    ADD CONSTRAINT legal_pages_slug_key UNIQUE (slug);


--
-- TOC entry 4877 (class 2606 OID 18452)
-- Name: member_presence member_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_presence
    ADD CONSTRAINT member_presence_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4843 (class 2606 OID 18015)
-- Name: message_reactions message_reactions_message_id_actor_type_actor_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_actor_type_actor_id_key UNIQUE (message_id, actor_type, actor_id);


--
-- TOC entry 4845 (class 2606 OID 18013)
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4799 (class 2606 OID 17707)
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 4787 (class 2606 OID 17662)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4887 (class 2606 OID 18510)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4806 (class 2606 OID 17739)
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- TOC entry 4803 (class 2606 OID 17722)
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- TOC entry 4748 (class 2606 OID 17498)
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4750 (class 2606 OID 17500)
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- TOC entry 4909 (class 2606 OID 19047)
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- TOC entry 4911 (class 2606 OID 19273)
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4759 (class 2606 OID 17536)
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- TOC entry 4890 (class 2606 OID 18555)
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
-- TOC entry 4791 (class 2606 OID 18308)
-- Name: whatsapp_config whatsapp_config_account_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id);


--
-- TOC entry 4793 (class 2606 OID 18147)
-- Name: whatsapp_config whatsapp_config_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_phone_number_id_key UNIQUE (phone_number_id);


--
-- TOC entry 4795 (class 2606 OID 17683)
-- Name: whatsapp_config whatsapp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_pkey PRIMARY KEY (id);


--
-- TOC entry 4708 (class 2606 OID 17266)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4936 (class 2606 OID 19443)
-- Name: messages_2026_08_02 messages_2026_08_02_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_02
    ADD CONSTRAINT messages_2026_08_02_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4941 (class 2606 OID 19482)
-- Name: messages_2026_08_03 messages_2026_08_03_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_03
    ADD CONSTRAINT messages_2026_08_03_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4944 (class 2606 OID 19516)
-- Name: messages_2026_08_04 messages_2026_08_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_04
    ADD CONSTRAINT messages_2026_08_04_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4947 (class 2606 OID 19529)
-- Name: messages_2026_08_05 messages_2026_08_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_05
    ADD CONSTRAINT messages_2026_08_05_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4950 (class 2606 OID 19542)
-- Name: messages_2026_08_06 messages_2026_08_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_06
    ADD CONSTRAINT messages_2026_08_06_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4953 (class 2606 OID 19557)
-- Name: messages_2026_08_07 messages_2026_08_07_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_07
    ADD CONSTRAINT messages_2026_08_07_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4956 (class 2606 OID 19583)
-- Name: messages_2026_08_08 messages_2026_08_08_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_08_08
    ADD CONSTRAINT messages_2026_08_08_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4537 (class 2606 OID 17264)
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- TOC entry 4713 (class 2606 OID 17268)
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- TOC entry 4710 (class 2606 OID 17270)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4734 (class 2606 OID 17460)
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- TOC entry 4721 (class 2606 OID 17302)
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- TOC entry 4737 (class 2606 OID 17436)
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- TOC entry 4716 (class 2606 OID 17293)
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- TOC entry 4718 (class 2606 OID 17291)
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4727 (class 2606 OID 17314)
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- TOC entry 4732 (class 2606 OID 17376)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- TOC entry 4730 (class 2606 OID 17361)
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- TOC entry 4740 (class 2606 OID 17446)
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- TOC entry 4742 (class 2606 OID 17487)
-- Name: schema_migrations schema_migrations_idempotency_key_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: postgres
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);


--
-- TOC entry 4744 (class 2606 OID 17485)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: postgres
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4609 (class 1259 OID 16536)
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- TOC entry 4579 (class 1259 OID 16709)
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4690 (class 1259 OID 17125)
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- TOC entry 4691 (class 1259 OID 17124)
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- TOC entry 4692 (class 1259 OID 17122)
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- TOC entry 4697 (class 1259 OID 17123)
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- TOC entry 4580 (class 1259 OID 16711)
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4581 (class 1259 OID 16712)
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4627 (class 1259 OID 16791)
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- TOC entry 4660 (class 1259 OID 16899)
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- TOC entry 4615 (class 1259 OID 16879)
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- TOC entry 5932 (class 0 OID 0)
-- Dependencies: 4615
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- TOC entry 4620 (class 1259 OID 16706)
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- TOC entry 4663 (class 1259 OID 16896)
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- TOC entry 4687 (class 1259 OID 17081)
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- TOC entry 4664 (class 1259 OID 16897)
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- TOC entry 4582 (class 1259 OID 17168)
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- TOC entry 4583 (class 1259 OID 17167)
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- TOC entry 4584 (class 1259 OID 17169)
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- TOC entry 4585 (class 1259 OID 17170)
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- TOC entry 4635 (class 1259 OID 16902)
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- TOC entry 4632 (class 1259 OID 16763)
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- TOC entry 4633 (class 1259 OID 16908)
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- TOC entry 4673 (class 1259 OID 17033)
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- TOC entry 4670 (class 1259 OID 16986)
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- TOC entry 4680 (class 1259 OID 17059)
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 4681 (class 1259 OID 17057)
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 4686 (class 1259 OID 17058)
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- TOC entry 4667 (class 1259 OID 16955)
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- TOC entry 4668 (class 1259 OID 16954)
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- TOC entry 4669 (class 1259 OID 16956)
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- TOC entry 4586 (class 1259 OID 16713)
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4587 (class 1259 OID 16710)
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4596 (class 1259 OID 16519)
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- TOC entry 4597 (class 1259 OID 16520)
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- TOC entry 4598 (class 1259 OID 16705)
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- TOC entry 4601 (class 1259 OID 16793)
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- TOC entry 4604 (class 1259 OID 16898)
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- TOC entry 4654 (class 1259 OID 16835)
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- TOC entry 4655 (class 1259 OID 16900)
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- TOC entry 4656 (class 1259 OID 16850)
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- TOC entry 4659 (class 1259 OID 16849)
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- TOC entry 4621 (class 1259 OID 16901)
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- TOC entry 4622 (class 1259 OID 17071)
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- TOC entry 4625 (class 1259 OID 16792)
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- TOC entry 4646 (class 1259 OID 16817)
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- TOC entry 4649 (class 1259 OID 16816)
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- TOC entry 4644 (class 1259 OID 16802)
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- TOC entry 4645 (class 1259 OID 16964)
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- TOC entry 4634 (class 1259 OID 16961)
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- TOC entry 4626 (class 1259 OID 16790)
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- TOC entry 4588 (class 1259 OID 16870)
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- TOC entry 5933 (class 0 OID 0)
-- Dependencies: 4588
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- TOC entry 4589 (class 1259 OID 16707)
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- TOC entry 4590 (class 1259 OID 16509)
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- TOC entry 4591 (class 1259 OID 16925)
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- TOC entry 4702 (class 1259 OID 17165)
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- TOC entry 4705 (class 1259 OID 17164)
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- TOC entry 4698 (class 1259 OID 17147)
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- TOC entry 4701 (class 1259 OID 17148)
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- TOC entry 4898 (class 1259 OID 18986)
-- Name: ai_knowledge_chunks_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_knowledge_chunks_account_id_idx ON public.ai_knowledge_chunks USING btree (account_id);


--
-- TOC entry 4899 (class 1259 OID 18987)
-- Name: ai_knowledge_chunks_document_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_knowledge_chunks_document_id_idx ON public.ai_knowledge_chunks USING btree (document_id);


--
-- TOC entry 4900 (class 1259 OID 18989)
-- Name: ai_knowledge_chunks_embedding_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_knowledge_chunks_embedding_idx ON public.ai_knowledge_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- TOC entry 4901 (class 1259 OID 18988)
-- Name: ai_knowledge_chunks_fts_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_knowledge_chunks_fts_idx ON public.ai_knowledge_chunks USING gin (fts);


--
-- TOC entry 4895 (class 1259 OID 18958)
-- Name: ai_knowledge_documents_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_knowledge_documents_account_id_idx ON public.ai_knowledge_documents USING btree (account_id);


--
-- TOC entry 4878 (class 1259 OID 18493)
-- Name: api_keys_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX api_keys_account_id_idx ON public.api_keys USING btree (account_id);


--
-- TOC entry 4879 (class 1259 OID 18494)
-- Name: api_keys_key_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX api_keys_key_hash_idx ON public.api_keys USING btree (key_hash);


--
-- TOC entry 4874 (class 1259 OID 18209)
-- Name: idx_account_invitations_account_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_account_invitations_account_pending ON public.account_invitations USING btree (account_id, expires_at) WHERE (accepted_at IS NULL);


--
-- TOC entry 4868 (class 1259 OID 19251)
-- Name: idx_accounts_banned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_banned ON public.accounts USING btree (is_banned) WHERE (is_banned = true);


--
-- TOC entry 4869 (class 1259 OID 18180)
-- Name: idx_accounts_one_per_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_accounts_one_per_owner ON public.accounts USING btree (owner_user_id);


--
-- TOC entry 4906 (class 1259 OID 19028)
-- Name: idx_ai_usage_log_account_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_usage_log_account_created ON public.ai_usage_log USING btree (account_id, created_at DESC);


--
-- TOC entry 4833 (class 1259 OID 18303)
-- Name: idx_automation_logs_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_logs_account ON public.automation_logs USING btree (account_id);


--
-- TOC entry 4834 (class 1259 OID 17949)
-- Name: idx_automation_logs_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_logs_automation ON public.automation_logs USING btree (automation_id, created_at DESC);


--
-- TOC entry 4835 (class 1259 OID 17950)
-- Name: idx_automation_logs_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_logs_user ON public.automation_logs USING btree (user_id);


--
-- TOC entry 4838 (class 1259 OID 18304)
-- Name: idx_automation_pending_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_pending_account ON public.automation_pending_executions USING btree (account_id);


--
-- TOC entry 4839 (class 1259 OID 17990)
-- Name: idx_automation_pending_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_pending_due ON public.automation_pending_executions USING btree (run_at) WHERE (status = 'pending'::text);


--
-- TOC entry 4829 (class 1259 OID 17920)
-- Name: idx_automation_steps_automation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_steps_automation_id ON public.automation_steps USING btree (automation_id, "position");


--
-- TOC entry 4830 (class 1259 OID 17921)
-- Name: idx_automation_steps_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automation_steps_parent ON public.automation_steps USING btree (parent_step_id) WHERE (parent_step_id IS NOT NULL);


--
-- TOC entry 4823 (class 1259 OID 18302)
-- Name: idx_automations_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automations_account ON public.automations USING btree (account_id);


--
-- TOC entry 4824 (class 1259 OID 18407)
-- Name: idx_automations_account_active_trigger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automations_account_active_trigger ON public.automations USING btree (account_id, trigger_type) WHERE (is_active = true);


--
-- TOC entry 4825 (class 1259 OID 17896)
-- Name: idx_automations_active_trigger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automations_active_trigger ON public.automations USING btree (trigger_type) WHERE (is_active = true);


--
-- TOC entry 4826 (class 1259 OID 17895)
-- Name: idx_automations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_automations_user_id ON public.automations USING btree (user_id);


--
-- TOC entry 4818 (class 1259 OID 17834)
-- Name: idx_broadcast_recipients_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_broadcast_recipients_broadcast ON public.broadcast_recipients USING btree (broadcast_id);


--
-- TOC entry 4819 (class 1259 OID 17860)
-- Name: idx_broadcast_recipients_broadcast_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_broadcast_recipients_broadcast_status ON public.broadcast_recipients USING btree (broadcast_id, status);


--
-- TOC entry 4820 (class 1259 OID 17859)
-- Name: idx_broadcast_recipients_wamid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_broadcast_recipients_wamid ON public.broadcast_recipients USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);


--
-- TOC entry 4815 (class 1259 OID 18301)
-- Name: idx_broadcasts_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_broadcasts_account ON public.broadcasts USING btree (account_id);


--
-- TOC entry 4775 (class 1259 OID 18295)
-- Name: idx_contact_notes_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_notes_account ON public.contact_notes USING btree (account_id);


--
-- TOC entry 4965 (class 1259 OID 19638)
-- Name: idx_contact_replies_submission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_replies_submission ON public.contact_replies USING btree (submission_id);


--
-- TOC entry 4961 (class 1259 OID 19619)
-- Name: idx_contact_submissions_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_submissions_created ON public.contact_submissions USING btree (created_at DESC);


--
-- TOC entry 4962 (class 1259 OID 19618)
-- Name: idx_contact_submissions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_submissions_status ON public.contact_submissions USING btree (status);


--
-- TOC entry 4764 (class 1259 OID 17562)
-- Name: idx_contact_tags_contact; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_tags_contact ON public.contact_tags USING btree (contact_id);


--
-- TOC entry 4765 (class 1259 OID 17563)
-- Name: idx_contact_tags_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_tags_tag ON public.contact_tags USING btree (tag_id);


--
-- TOC entry 4753 (class 1259 OID 18292)
-- Name: idx_contacts_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_account ON public.contacts USING btree (account_id);


--
-- TOC entry 4754 (class 1259 OID 18426)
-- Name: idx_contacts_account_phone_normalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_contacts_account_phone_normalized ON public.contacts USING btree (account_id, phone_normalized) WHERE (phone_normalized <> ''::text);


--
-- TOC entry 4755 (class 1259 OID 17525)
-- Name: idx_contacts_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_phone ON public.contacts USING btree (phone);


--
-- TOC entry 4756 (class 1259 OID 17524)
-- Name: idx_contacts_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);


--
-- TOC entry 4778 (class 1259 OID 18296)
-- Name: idx_conversations_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_account ON public.conversations USING btree (account_id);


--
-- TOC entry 4779 (class 1259 OID 19065)
-- Name: idx_conversations_account_contact; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_conversations_account_contact ON public.conversations USING btree (account_id, contact_id);


--
-- TOC entry 4780 (class 1259 OID 19183)
-- Name: idx_conversations_assigned_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_assigned_agent ON public.conversations USING btree (assigned_agent_id) WHERE (assigned_agent_id IS NOT NULL);


--
-- TOC entry 4781 (class 1259 OID 17647)
-- Name: idx_conversations_contact_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_contact_id ON public.conversations USING btree (contact_id);


--
-- TOC entry 4782 (class 1259 OID 17646)
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- TOC entry 4768 (class 1259 OID 18294)
-- Name: idx_custom_fields_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_fields_account ON public.custom_fields USING btree (account_id);


--
-- TOC entry 4809 (class 1259 OID 18300)
-- Name: idx_deals_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deals_account ON public.deals USING btree (account_id);


--
-- TOC entry 4810 (class 1259 OID 17856)
-- Name: idx_deals_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deals_assigned_to ON public.deals USING btree (assigned_to);


--
-- TOC entry 4811 (class 1259 OID 17785)
-- Name: idx_deals_pipeline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deals_pipeline ON public.deals USING btree (pipeline_id);


--
-- TOC entry 4812 (class 1259 OID 17786)
-- Name: idx_deals_stage; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deals_stage ON public.deals USING btree (stage_id);


--
-- TOC entry 4855 (class 1259 OID 18077)
-- Name: idx_flow_nodes_flow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_nodes_flow ON public.flow_nodes USING btree (flow_id);


--
-- TOC entry 4864 (class 1259 OID 18139)
-- Name: idx_flow_run_events_run_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_run_events_run_time ON public.flow_run_events USING btree (flow_run_id, created_at DESC);


--
-- TOC entry 4865 (class 1259 OID 18138)
-- Name: idx_flow_run_events_run_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_run_events_run_type ON public.flow_run_events USING btree (flow_run_id, event_type);


--
-- TOC entry 4858 (class 1259 OID 18306)
-- Name: idx_flow_runs_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_runs_account ON public.flow_runs USING btree (account_id);


--
-- TOC entry 4859 (class 1259 OID 18119)
-- Name: idx_flow_runs_active_advanced; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_runs_active_advanced ON public.flow_runs USING btree (last_advanced_at) WHERE (status = 'active'::text);


--
-- TOC entry 4860 (class 1259 OID 18120)
-- Name: idx_flow_runs_flow_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_runs_flow_started ON public.flow_runs USING btree (flow_id, started_at DESC);


--
-- TOC entry 4848 (class 1259 OID 18305)
-- Name: idx_flows_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_account ON public.flows USING btree (account_id);


--
-- TOC entry 4849 (class 1259 OID 18408)
-- Name: idx_flows_account_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_account_active ON public.flows USING btree (account_id) WHERE (status = 'active'::text);


--
-- TOC entry 4850 (class 1259 OID 18055)
-- Name: idx_flows_active_trigger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_active_trigger ON public.flows USING btree (user_id, trigger_type) WHERE (status = 'active'::text);


--
-- TOC entry 4917 (class 1259 OID 19304)
-- Name: idx_landing_features_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_landing_features_position ON public.landing_features USING btree ("position");


--
-- TOC entry 4912 (class 1259 OID 19290)
-- Name: idx_landing_sections_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_landing_sections_position ON public.landing_sections USING btree ("position");


--
-- TOC entry 4875 (class 1259 OID 18463)
-- Name: idx_member_presence_account_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_member_presence_account_status ON public.member_presence USING btree (account_id, status, last_seen_at DESC);


--
-- TOC entry 4840 (class 1259 OID 18026)
-- Name: idx_message_reactions_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_message_reactions_conversation ON public.message_reactions USING btree (conversation_id);


--
-- TOC entry 4841 (class 1259 OID 18027)
-- Name: idx_message_reactions_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);


--
-- TOC entry 4796 (class 1259 OID 18298)
-- Name: idx_message_templates_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_message_templates_account ON public.message_templates USING btree (account_id);


--
-- TOC entry 4797 (class 1259 OID 18153)
-- Name: idx_message_templates_meta_template_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_message_templates_meta_template_id ON public.message_templates USING btree (meta_template_id) WHERE (meta_template_id IS NOT NULL);


--
-- TOC entry 4783 (class 1259 OID 17668)
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);


--
-- TOC entry 4784 (class 1259 OID 17669)
-- Name: idx_messages_message_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_message_id ON public.messages USING btree (message_id);


--
-- TOC entry 4785 (class 1259 OID 18003)
-- Name: idx_messages_reply_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_reply_to ON public.messages USING btree (reply_to_message_id) WHERE (reply_to_message_id IS NOT NULL);


--
-- TOC entry 4884 (class 1259 OID 18536)
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- TOC entry 4885 (class 1259 OID 18537)
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- TOC entry 4861 (class 1259 OID 18309)
-- Name: idx_one_active_run_per_contact; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_one_active_run_per_contact ON public.flow_runs USING btree (account_id, contact_id) WHERE (status = 'active'::text);


--
-- TOC entry 4804 (class 1259 OID 17745)
-- Name: idx_pipeline_stages_pipeline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pipeline_stages_pipeline ON public.pipeline_stages USING btree (pipeline_id);


--
-- TOC entry 4801 (class 1259 OID 18299)
-- Name: idx_pipelines_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pipelines_account ON public.pipelines USING btree (account_id);


--
-- TOC entry 4745 (class 1259 OID 18215)
-- Name: idx_profiles_account_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_account_role ON public.profiles USING btree (account_id, account_role);


--
-- TOC entry 4746 (class 1259 OID 19250)
-- Name: idx_profiles_super_admin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_super_admin ON public.profiles USING btree (is_super_admin) WHERE (is_super_admin = true);


--
-- TOC entry 4907 (class 1259 OID 19058)
-- Name: idx_quick_replies_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_quick_replies_account ON public.quick_replies USING btree (account_id);


--
-- TOC entry 4757 (class 1259 OID 18293)
-- Name: idx_tags_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tags_account ON public.tags USING btree (account_id);


--
-- TOC entry 4788 (class 1259 OID 18297)
-- Name: idx_whatsapp_config_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_config_account ON public.whatsapp_config USING btree (account_id);


--
-- TOC entry 4789 (class 1259 OID 19134)
-- Name: idx_whatsapp_config_registered_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_config_registered_at ON public.whatsapp_config USING btree (registered_at) WHERE (registered_at IS NULL);


--
-- TOC entry 4800 (class 1259 OID 18152)
-- Name: message_templates_user_name_language_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX message_templates_user_name_language_key ON public.message_templates USING btree (user_id, name, language);


--
-- TOC entry 4888 (class 1259 OID 18566)
-- Name: webhook_endpoints_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX webhook_endpoints_account_id_idx ON public.webhook_endpoints USING btree (account_id);


--
-- TOC entry 4711 (class 1259 OID 17271)
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- TOC entry 4706 (class 1259 OID 17272)
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4934 (class 1259 OID 19444)
-- Name: messages_2026_08_02_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_02_inserted_at_topic_idx ON realtime.messages_2026_08_02 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4939 (class 1259 OID 19483)
-- Name: messages_2026_08_03_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_03_inserted_at_topic_idx ON realtime.messages_2026_08_03 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4942 (class 1259 OID 19517)
-- Name: messages_2026_08_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_04_inserted_at_topic_idx ON realtime.messages_2026_08_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4945 (class 1259 OID 19530)
-- Name: messages_2026_08_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_05_inserted_at_topic_idx ON realtime.messages_2026_08_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4948 (class 1259 OID 19543)
-- Name: messages_2026_08_06_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_06_inserted_at_topic_idx ON realtime.messages_2026_08_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4951 (class 1259 OID 19558)
-- Name: messages_2026_08_07_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_07_inserted_at_topic_idx ON realtime.messages_2026_08_07 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4954 (class 1259 OID 19584)
-- Name: messages_2026_08_08_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_08_08_inserted_at_topic_idx ON realtime.messages_2026_08_08 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4714 (class 1259 OID 17273)
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- TOC entry 4719 (class 1259 OID 17303)
-- Name: bname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- TOC entry 4722 (class 1259 OID 17320)
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- TOC entry 4735 (class 1259 OID 17461)
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- TOC entry 4728 (class 1259 OID 17387)
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- TOC entry 4723 (class 1259 OID 17352)
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- TOC entry 4724 (class 1259 OID 17468)
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- TOC entry 4725 (class 1259 OID 17321)
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- TOC entry 4738 (class 1259 OID 17452)
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- TOC entry 4966 (class 0 OID 0)
-- Name: messages_2026_08_02_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_02_inserted_at_topic_idx;


--
-- TOC entry 4967 (class 0 OID 0)
-- Name: messages_2026_08_02_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_02_pkey;


--
-- TOC entry 4968 (class 0 OID 0)
-- Name: messages_2026_08_03_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_03_inserted_at_topic_idx;


--
-- TOC entry 4969 (class 0 OID 0)
-- Name: messages_2026_08_03_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_03_pkey;


--
-- TOC entry 4970 (class 0 OID 0)
-- Name: messages_2026_08_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_04_inserted_at_topic_idx;


--
-- TOC entry 4971 (class 0 OID 0)
-- Name: messages_2026_08_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_04_pkey;


--
-- TOC entry 4972 (class 0 OID 0)
-- Name: messages_2026_08_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_05_inserted_at_topic_idx;


--
-- TOC entry 4973 (class 0 OID 0)
-- Name: messages_2026_08_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_05_pkey;


--
-- TOC entry 4974 (class 0 OID 0)
-- Name: messages_2026_08_06_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_06_inserted_at_topic_idx;


--
-- TOC entry 4975 (class 0 OID 0)
-- Name: messages_2026_08_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_06_pkey;


--
-- TOC entry 4976 (class 0 OID 0)
-- Name: messages_2026_08_07_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_07_inserted_at_topic_idx;


--
-- TOC entry 4977 (class 0 OID 0)
-- Name: messages_2026_08_07_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_07_pkey;


--
-- TOC entry 4978 (class 0 OID 0)
-- Name: messages_2026_08_08_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_08_inserted_at_topic_idx;


--
-- TOC entry 4979 (class 0 OID 0)
-- Name: messages_2026_08_08_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_08_pkey;


--
-- TOC entry 5095 (class 2620 OID 18395)
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: supabase_auth_admin
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- TOC entry 5115 (class 2620 OID 18605)
-- Name: ai_configs ai_configs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER ai_configs_updated_at BEFORE UPDATE ON public.ai_configs FOR EACH ROW EXECUTE FUNCTION public.update_ai_configs_updated_at();


--
-- TOC entry 5116 (class 2620 OID 18964)
-- Name: ai_knowledge_documents ai_knowledge_documents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER ai_knowledge_documents_updated_at BEFORE UPDATE ON public.ai_knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_ai_knowledge_documents_updated_at();


--
-- TOC entry 5110 (class 2620 OID 17863)
-- Name: broadcast_recipients broadcast_recipients_aggregate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER broadcast_recipients_aggregate AFTER INSERT OR DELETE OR UPDATE ON public.broadcast_recipients FOR EACH ROW EXECUTE FUNCTION public.broadcast_recipient_aggregate_trigger();


--
-- TOC entry 5101 (class 2620 OID 19032)
-- Name: profiles enforce_profile_privilege_columns; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_profile_privilege_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_columns();


--
-- TOC entry 5104 (class 2620 OID 18541)
-- Name: conversations on_conversation_assigned; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_conversation_assigned AFTER INSERT OR UPDATE OF assigned_agent_id ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.notify_conversation_assigned();


--
-- TOC entry 5114 (class 2620 OID 18464)
-- Name: member_presence set_member_presence_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_member_presence_updated_at BEFORE UPDATE ON public.member_presence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5113 (class 2620 OID 18181)
-- Name: accounts set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5111 (class 2620 OID 17898)
-- Name: automations set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5109 (class 2620 OID 17843)
-- Name: broadcasts set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5103 (class 2620 OID 17838)
-- Name: contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5105 (class 2620 OID 17839)
-- Name: conversations set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5108 (class 2620 OID 17842)
-- Name: deals set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5112 (class 2620 OID 18141)
-- Name: flows set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5107 (class 2620 OID 17841)
-- Name: message_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5102 (class 2620 OID 17837)
-- Name: profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5117 (class 2620 OID 19063)
-- Name: quick_replies set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5106 (class 2620 OID 17840)
-- Name: whatsapp_config set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.whatsapp_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5096 (class 2620 OID 17274)
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- TOC entry 5097 (class 2620 OID 17406)
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- TOC entry 5098 (class 2620 OID 17470)
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- TOC entry 5099 (class 2620 OID 17471)
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- TOC entry 5100 (class 2620 OID 17340)
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- TOC entry 4981 (class 2606 OID 16693)
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4986 (class 2606 OID 16783)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 4985 (class 2606 OID 16771)
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- TOC entry 4984 (class 2606 OID 16758)
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4992 (class 2606 OID 17023)
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 4993 (class 2606 OID 17028)
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4994 (class 2606 OID 17052)
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 4995 (class 2606 OID 17047)
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4991 (class 2606 OID 16949)
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4980 (class 2606 OID 16726)
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 4988 (class 2606 OID 16830)
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 4989 (class 2606 OID 16903)
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- TOC entry 4990 (class 2606 OID 16844)
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 4982 (class 2606 OID 17066)
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 4983 (class 2606 OID 16721)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4987 (class 2606 OID 16811)
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 4997 (class 2606 OID 17159)
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4996 (class 2606 OID 17142)
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5069 (class 2606 OID 18204)
-- Name: account_invitations account_invitations_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5070 (class 2606 OID 18194)
-- Name: account_invitations account_invitations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5071 (class 2606 OID 18199)
-- Name: account_invitations account_invitations_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5067 (class 2606 OID 19245)
-- Name: accounts accounts_banned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_banned_by_user_id_fkey FOREIGN KEY (banned_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5068 (class 2606 OID 18175)
-- Name: accounts accounts_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- TOC entry 5083 (class 2606 OID 18590)
-- Name: ai_configs ai_configs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5084 (class 2606 OID 18595)
-- Name: ai_configs ai_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5085 (class 2606 OID 18999)
-- Name: ai_configs ai_configs_handoff_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_handoff_agent_id_fkey FOREIGN KEY (handoff_agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5088 (class 2606 OID 18981)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5089 (class 2606 OID 18976)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE;


--
-- TOC entry 5086 (class 2606 OID 18948)
-- Name: ai_knowledge_documents ai_knowledge_documents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5087 (class 2606 OID 18953)
-- Name: ai_knowledge_documents ai_knowledge_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5090 (class 2606 OID 19018)
-- Name: ai_usage_log ai_usage_log_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5091 (class 2606 OID 19023)
-- Name: ai_usage_log ai_usage_log_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5074 (class 2606 OID 18483)
-- Name: api_keys api_keys_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5075 (class 2606 OID 18488)
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5045 (class 2606 OID 18272)
-- Name: automation_logs automation_logs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5046 (class 2606 OID 17934)
-- Name: automation_logs automation_logs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- TOC entry 5047 (class 2606 OID 17944)
-- Name: automation_logs automation_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5048 (class 2606 OID 17939)
-- Name: automation_logs automation_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5049 (class 2606 OID 18277)
-- Name: automation_pending_executions automation_pending_executions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5050 (class 2606 OID 17965)
-- Name: automation_pending_executions automation_pending_executions_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- TOC entry 5051 (class 2606 OID 17975)
-- Name: automation_pending_executions automation_pending_executions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5052 (class 2606 OID 17980)
-- Name: automation_pending_executions automation_pending_executions_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.automation_logs(id) ON DELETE CASCADE;


--
-- TOC entry 5053 (class 2606 OID 17985)
-- Name: automation_pending_executions automation_pending_executions_parent_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES public.automation_steps(id) ON DELETE SET NULL;


--
-- TOC entry 5054 (class 2606 OID 17970)
-- Name: automation_pending_executions automation_pending_executions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_pending_executions
    ADD CONSTRAINT automation_pending_executions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5043 (class 2606 OID 17910)
-- Name: automation_steps automation_steps_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- TOC entry 5044 (class 2606 OID 17915)
-- Name: automation_steps automation_steps_parent_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_steps
    ADD CONSTRAINT automation_steps_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES public.automation_steps(id) ON DELETE CASCADE;


--
-- TOC entry 5041 (class 2606 OID 18267)
-- Name: automations automations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5042 (class 2606 OID 17890)
-- Name: automations automations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5039 (class 2606 OID 17824)
-- Name: broadcast_recipients broadcast_recipients_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.broadcasts(id) ON DELETE CASCADE;


--
-- TOC entry 5040 (class 2606 OID 17864)
-- Name: broadcast_recipients broadcast_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5037 (class 2606 OID 18262)
-- Name: broadcasts broadcasts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5038 (class 2606 OID 17807)
-- Name: broadcasts broadcasts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5013 (class 2606 OID 17592)
-- Name: contact_custom_values contact_custom_values_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_custom_values
    ADD CONSTRAINT contact_custom_values_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- TOC entry 5014 (class 2606 OID 17597)
-- Name: contact_custom_values contact_custom_values_custom_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_custom_values
    ADD CONSTRAINT contact_custom_values_custom_field_id_fkey FOREIGN KEY (custom_field_id) REFERENCES public.custom_fields(id) ON DELETE CASCADE;


--
-- TOC entry 5015 (class 2606 OID 18232)
-- Name: contact_notes contact_notes_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5016 (class 2606 OID 17612)
-- Name: contact_notes contact_notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- TOC entry 5017 (class 2606 OID 17617)
-- Name: contact_notes contact_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5094 (class 2606 OID 19633)
-- Name: contact_replies contact_replies_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_replies
    ADD CONSTRAINT contact_replies_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.contact_submissions(id) ON DELETE CASCADE;


--
-- TOC entry 5009 (class 2606 OID 17552)
-- Name: contact_tags contact_tags_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- TOC entry 5010 (class 2606 OID 17557)
-- Name: contact_tags contact_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- TOC entry 5005 (class 2606 OID 18217)
-- Name: contacts contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5006 (class 2606 OID 17519)
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5018 (class 2606 OID 18237)
-- Name: conversations conversations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5019 (class 2606 OID 17641)
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- TOC entry 5020 (class 2606 OID 17636)
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5011 (class 2606 OID 18227)
-- Name: custom_fields custom_fields_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5012 (class 2606 OID 17575)
-- Name: custom_fields custom_fields_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5030 (class 2606 OID 18257)
-- Name: deals deals_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5031 (class 2606 OID 17851)
-- Name: deals deals_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- TOC entry 5032 (class 2606 OID 17869)
-- Name: deals deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5033 (class 2606 OID 17780)
-- Name: deals deals_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- TOC entry 5034 (class 2606 OID 17765)
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- TOC entry 5035 (class 2606 OID 17770)
-- Name: deals deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id);


--
-- TOC entry 5036 (class 2606 OID 17760)
-- Name: deals deals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5059 (class 2606 OID 18072)
-- Name: flow_nodes flow_nodes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_nodes
    ADD CONSTRAINT flow_nodes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- TOC entry 5066 (class 2606 OID 18133)
-- Name: flow_run_events flow_run_events_flow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_run_events
    ADD CONSTRAINT flow_run_events_flow_run_id_fkey FOREIGN KEY (flow_run_id) REFERENCES public.flow_runs(id) ON DELETE CASCADE;


--
-- TOC entry 5060 (class 2606 OID 18287)
-- Name: flow_runs flow_runs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5061 (class 2606 OID 18103)
-- Name: flow_runs flow_runs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5062 (class 2606 OID 18108)
-- Name: flow_runs flow_runs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5063 (class 2606 OID 18093)
-- Name: flow_runs flow_runs_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON DELETE CASCADE;


--
-- TOC entry 5064 (class 2606 OID 18113)
-- Name: flow_runs flow_runs_last_prompt_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_last_prompt_message_id_fkey FOREIGN KEY (last_prompt_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- TOC entry 5065 (class 2606 OID 18098)
-- Name: flow_runs flow_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flow_runs
    ADD CONSTRAINT flow_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5057 (class 2606 OID 18282)
-- Name: flows flows_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5058 (class 2606 OID 18050)
-- Name: flows flows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5072 (class 2606 OID 18458)
-- Name: member_presence member_presence_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_presence
    ADD CONSTRAINT member_presence_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5073 (class 2606 OID 18453)
-- Name: member_presence member_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_presence
    ADD CONSTRAINT member_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5055 (class 2606 OID 18021)
-- Name: message_reactions message_reactions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- TOC entry 5056 (class 2606 OID 18016)
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- TOC entry 5025 (class 2606 OID 18247)
-- Name: message_templates message_templates_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5026 (class 2606 OID 17708)
-- Name: message_templates message_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5021 (class 2606 OID 17663)
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- TOC entry 5022 (class 2606 OID 17998)
-- Name: messages messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- TOC entry 5076 (class 2606 OID 18511)
-- Name: notifications notifications_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5077 (class 2606 OID 18531)
-- Name: notifications notifications_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5078 (class 2606 OID 18526)
-- Name: notifications notifications_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5079 (class 2606 OID 18521)
-- Name: notifications notifications_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- TOC entry 5080 (class 2606 OID 18516)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5029 (class 2606 OID 17740)
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- TOC entry 5027 (class 2606 OID 18252)
-- Name: pipelines pipelines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5028 (class 2606 OID 17723)
-- Name: pipelines pipelines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5003 (class 2606 OID 18210)
-- Name: profiles profiles_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5004 (class 2606 OID 17501)
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5092 (class 2606 OID 19048)
-- Name: quick_replies quick_replies_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5093 (class 2606 OID 19053)
-- Name: quick_replies quick_replies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5007 (class 2606 OID 18222)
-- Name: tags tags_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5008 (class 2606 OID 17537)
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5081 (class 2606 OID 18556)
-- Name: webhook_endpoints webhook_endpoints_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5082 (class 2606 OID 18561)
-- Name: webhook_endpoints webhook_endpoints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 5023 (class 2606 OID 18242)
-- Name: whatsapp_config whatsapp_config_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5024 (class 2606 OID 17686)
-- Name: whatsapp_config whatsapp_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_config
    ADD CONSTRAINT whatsapp_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4998 (class 2606 OID 17315)
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 4999 (class 2606 OID 17362)
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5000 (class 2606 OID 17382)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5001 (class 2606 OID 17377)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- TOC entry 5002 (class 2606 OID 17447)
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- TOC entry 5270 (class 0 OID 16529)
-- Dependencies: 269
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5281 (class 0 OID 16889)
-- Dependencies: 282
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5272 (class 0 OID 16686)
-- Dependencies: 273
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5269 (class 0 OID 16522)
-- Dependencies: 268
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5276 (class 0 OID 16776)
-- Dependencies: 277
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5275 (class 0 OID 16764)
-- Dependencies: 276
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5274 (class 0 OID 16751)
-- Dependencies: 275
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5282 (class 0 OID 16939)
-- Dependencies: 283
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5268 (class 0 OID 16511)
-- Dependencies: 267
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5279 (class 0 OID 16818)
-- Dependencies: 280
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5280 (class 0 OID 16836)
-- Dependencies: 281
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5271 (class 0 OID 16537)
-- Dependencies: 270
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5273 (class 0 OID 16716)
-- Dependencies: 274
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5278 (class 0 OID 16803)
-- Dependencies: 279
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5277 (class 0 OID 16794)
-- Dependencies: 278
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5267 (class 0 OID 16499)
-- Dependencies: 265
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5453 (class 3256 OID 19460)
-- Name: landing_faqs Allow authenticated users to manage landing_faqs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to manage landing_faqs" ON public.landing_faqs USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 5452 (class 3256 OID 19459)
-- Name: landing_faqs Allow public read access to landing_faqs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to landing_faqs" ON public.landing_faqs FOR SELECT USING (true);


--
-- TOC entry 5454 (class 3256 OID 19639)
-- Name: contact_replies Allow service role full access to contact_replies; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow service role full access to contact_replies" ON public.contact_replies USING (true) WITH CHECK (true);


--
-- TOC entry 5417 (class 3256 OID 18465)
-- Name: member_presence Members can view teammate presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view teammate presence" ON public.member_presence FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5318 (class 0 OID 18182)
-- Dependencies: 333
-- Name: account_invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5408 (class 3256 OID 18393)
-- Name: account_invitations account_invitations_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY account_invitations_modify ON public.account_invitations USING (public.is_account_member(account_id, 'admin'::public.account_role_enum)) WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5392 (class 3256 OID 18392)
-- Name: account_invitations account_invitations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY account_invitations_select ON public.account_invitations FOR SELECT USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5317 (class 0 OID 18165)
-- Dependencies: 332
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5407 (class 3256 OID 18390)
-- Name: accounts accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY accounts_select ON public.accounts FOR SELECT USING (public.is_account_member(id));


--
-- TOC entry 5386 (class 3256 OID 18391)
-- Name: accounts accounts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY accounts_update ON public.accounts FOR UPDATE USING (public.is_account_member(id, 'admin'::public.account_role_enum)) WITH CHECK (public.is_account_member(id, 'admin'::public.account_role_enum));


--
-- TOC entry 5323 (class 0 OID 18573)
-- Dependencies: 338
-- Name: ai_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5428 (class 3256 OID 18603)
-- Name: ai_configs ai_configs_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_configs_delete ON public.ai_configs FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5426 (class 3256 OID 18601)
-- Name: ai_configs ai_configs_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_configs_insert ON public.ai_configs FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5425 (class 3256 OID 18600)
-- Name: ai_configs ai_configs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_configs_select ON public.ai_configs FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5427 (class 3256 OID 18602)
-- Name: ai_configs ai_configs_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_configs_update ON public.ai_configs FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5325 (class 0 OID 18965)
-- Dependencies: 340
-- Name: ai_knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5333 (class 3256 OID 18993)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_chunks_delete ON public.ai_knowledge_chunks FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5331 (class 3256 OID 18991)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_chunks_insert ON public.ai_knowledge_chunks FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5330 (class 3256 OID 18990)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_chunks_select ON public.ai_knowledge_chunks FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5332 (class 3256 OID 18992)
-- Name: ai_knowledge_chunks ai_knowledge_chunks_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_chunks_update ON public.ai_knowledge_chunks FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5324 (class 0 OID 18938)
-- Dependencies: 339
-- Name: ai_knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5432 (class 3256 OID 18962)
-- Name: ai_knowledge_documents ai_knowledge_documents_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_documents_delete ON public.ai_knowledge_documents FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5430 (class 3256 OID 18960)
-- Name: ai_knowledge_documents ai_knowledge_documents_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_documents_insert ON public.ai_knowledge_documents FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5429 (class 3256 OID 18959)
-- Name: ai_knowledge_documents ai_knowledge_documents_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_documents_select ON public.ai_knowledge_documents FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5431 (class 3256 OID 18961)
-- Name: ai_knowledge_documents ai_knowledge_documents_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_knowledge_documents_update ON public.ai_knowledge_documents FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5326 (class 0 OID 19004)
-- Dependencies: 341
-- Name: ai_usage_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5433 (class 3256 OID 19029)
-- Name: ai_usage_log ai_usage_log_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ai_usage_log_select ON public.ai_usage_log FOR SELECT USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5320 (class 0 OID 18471)
-- Dependencies: 335
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5413 (class 3256 OID 18498)
-- Name: api_keys api_keys_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY api_keys_delete ON public.api_keys FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5398 (class 3256 OID 18496)
-- Name: api_keys api_keys_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY api_keys_insert ON public.api_keys FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5418 (class 3256 OID 18495)
-- Name: api_keys api_keys_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY api_keys_select ON public.api_keys FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5412 (class 3256 OID 18497)
-- Name: api_keys api_keys_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY api_keys_update ON public.api_keys FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5310 (class 0 OID 17923)
-- Dependencies: 325
-- Name: automation_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5378 (class 3256 OID 18354)
-- Name: automation_logs automation_logs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automation_logs_select ON public.automation_logs FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5311 (class 0 OID 17952)
-- Dependencies: 326
-- Name: automation_pending_executions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_pending_executions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5309 (class 0 OID 17899)
-- Dependencies: 324
-- Name: automation_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5397 (class 3256 OID 18376)
-- Name: automation_steps automation_steps_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automation_steps_modify ON public.automation_steps USING ((EXISTS ( SELECT 1
   FROM public.automations a
  WHERE ((a.id = automation_steps.automation_id) AND public.is_account_member(a.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.automations a
  WHERE ((a.id = automation_steps.automation_id) AND public.is_account_member(a.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5396 (class 3256 OID 18375)
-- Name: automation_steps automation_steps_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automation_steps_select ON public.automation_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.automations a
  WHERE ((a.id = automation_steps.automation_id) AND public.is_account_member(a.account_id)))));


--
-- TOC entry 5308 (class 0 OID 17877)
-- Dependencies: 323
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5377 (class 3256 OID 18353)
-- Name: automations automations_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automations_delete ON public.automations FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5375 (class 3256 OID 18351)
-- Name: automations automations_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automations_insert ON public.automations FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5374 (class 3256 OID 18350)
-- Name: automations automations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automations_select ON public.automations FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5376 (class 3256 OID 18352)
-- Name: automations automations_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY automations_update ON public.automations FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5307 (class 0 OID 17813)
-- Dependencies: 322
-- Name: broadcast_recipients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5395 (class 3256 OID 18373)
-- Name: broadcast_recipients broadcast_recipients_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcast_recipients_modify ON public.broadcast_recipients USING ((EXISTS ( SELECT 1
   FROM public.broadcasts b
  WHERE ((b.id = broadcast_recipients.broadcast_id) AND public.is_account_member(b.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.broadcasts b
  WHERE ((b.id = broadcast_recipients.broadcast_id) AND public.is_account_member(b.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5394 (class 3256 OID 18372)
-- Name: broadcast_recipients broadcast_recipients_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcast_recipients_select ON public.broadcast_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.broadcasts b
  WHERE ((b.id = broadcast_recipients.broadcast_id) AND public.is_account_member(b.account_id)))));


--
-- TOC entry 5306 (class 0 OID 17788)
-- Dependencies: 321
-- Name: broadcasts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5373 (class 3256 OID 18349)
-- Name: broadcasts broadcasts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcasts_delete ON public.broadcasts FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5371 (class 3256 OID 18347)
-- Name: broadcasts broadcasts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcasts_insert ON public.broadcasts FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5370 (class 3256 OID 18346)
-- Name: broadcasts broadcasts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcasts_select ON public.broadcasts FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5372 (class 3256 OID 18348)
-- Name: broadcasts broadcasts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY broadcasts_update ON public.broadcasts FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5297 (class 0 OID 17581)
-- Dependencies: 312
-- Name: contact_custom_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contact_custom_values ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5388 (class 3256 OID 18364)
-- Name: contact_custom_values contact_custom_values_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_custom_values_modify ON public.contact_custom_values USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_custom_values.contact_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_custom_values.contact_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5387 (class 3256 OID 18363)
-- Name: contact_custom_values contact_custom_values_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_custom_values_select ON public.contact_custom_values FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_custom_values.contact_id) AND public.is_account_member(c.account_id)))));


--
-- TOC entry 5298 (class 0 OID 17603)
-- Dependencies: 313
-- Name: contact_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5353 (class 3256 OID 18325)
-- Name: contact_notes contact_notes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_notes_delete ON public.contact_notes FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5351 (class 3256 OID 18323)
-- Name: contact_notes contact_notes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_notes_insert ON public.contact_notes FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5338 (class 3256 OID 18322)
-- Name: contact_notes contact_notes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_notes_select ON public.contact_notes FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5352 (class 3256 OID 18324)
-- Name: contact_notes contact_notes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_notes_update ON public.contact_notes FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5329 (class 0 OID 19623)
-- Dependencies: 362
-- Name: contact_replies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contact_replies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5295 (class 0 OID 17543)
-- Dependencies: 310
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5385 (class 3256 OID 18361)
-- Name: contact_tags contact_tags_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_tags_modify ON public.contact_tags USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5384 (class 3256 OID 18360)
-- Name: contact_tags contact_tags_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contact_tags_select ON public.contact_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND public.is_account_member(c.account_id)))));


--
-- TOC entry 5293 (class 0 OID 17509)
-- Dependencies: 308
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5342 (class 3256 OID 18313)
-- Name: contacts contacts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contacts_delete ON public.contacts FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5340 (class 3256 OID 18311)
-- Name: contacts contacts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contacts_insert ON public.contacts FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5339 (class 3256 OID 18310)
-- Name: contacts contacts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5341 (class 3256 OID 18312)
-- Name: contacts contacts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contacts_update ON public.contacts FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5299 (class 0 OID 17623)
-- Dependencies: 314
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5446 (class 3256 OID 19187)
-- Name: conversations conversations_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conversations_delete ON public.conversations FOR DELETE USING (public.is_account_member(account_id, 'owner'::public.account_role_enum));


--
-- TOC entry 5444 (class 3256 OID 19185)
-- Name: conversations conversations_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK (public.is_account_member(account_id));


--
-- TOC entry 5443 (class 3256 OID 19184)
-- Name: conversations conversations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (
CASE
    WHEN (( SELECT profiles.account_role
       FROM public.profiles
      WHERE ((profiles.user_id = auth.uid()) AND (profiles.account_id = conversations.account_id))) = 'owner'::public.account_role_enum) THEN true
    ELSE (assigned_agent_id = auth.uid())
END);


--
-- TOC entry 5445 (class 3256 OID 19186)
-- Name: conversations conversations_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conversations_update ON public.conversations FOR UPDATE USING (
CASE
    WHEN (( SELECT profiles.account_role
       FROM public.profiles
      WHERE ((profiles.user_id = auth.uid()) AND (profiles.account_id = conversations.account_id))) = 'owner'::public.account_role_enum) THEN true
    ELSE (assigned_agent_id = auth.uid())
END);


--
-- TOC entry 5296 (class 0 OID 17565)
-- Dependencies: 311
-- Name: custom_fields; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5350 (class 3256 OID 18321)
-- Name: custom_fields custom_fields_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY custom_fields_delete ON public.custom_fields FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5348 (class 3256 OID 18319)
-- Name: custom_fields custom_fields_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY custom_fields_insert ON public.custom_fields FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5347 (class 3256 OID 18318)
-- Name: custom_fields custom_fields_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY custom_fields_select ON public.custom_fields FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5349 (class 3256 OID 18320)
-- Name: custom_fields custom_fields_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY custom_fields_update ON public.custom_fields FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5305 (class 0 OID 17747)
-- Dependencies: 320
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5369 (class 3256 OID 18345)
-- Name: deals deals_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_delete ON public.deals FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5367 (class 3256 OID 18343)
-- Name: deals deals_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_insert ON public.deals FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5366 (class 3256 OID 18342)
-- Name: deals deals_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_select ON public.deals FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5368 (class 3256 OID 18344)
-- Name: deals deals_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_update ON public.deals FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5314 (class 0 OID 18057)
-- Dependencies: 329
-- Name: flow_nodes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flow_nodes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5400 (class 3256 OID 18379)
-- Name: flow_nodes flow_nodes_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flow_nodes_modify ON public.flow_nodes USING ((EXISTS ( SELECT 1
   FROM public.flows f
  WHERE ((f.id = flow_nodes.flow_id) AND public.is_account_member(f.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.flows f
  WHERE ((f.id = flow_nodes.flow_id) AND public.is_account_member(f.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5399 (class 3256 OID 18378)
-- Name: flow_nodes flow_nodes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flow_nodes_select ON public.flow_nodes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.flows f
  WHERE ((f.id = flow_nodes.flow_id) AND public.is_account_member(f.account_id)))));


--
-- TOC entry 5316 (class 0 OID 18122)
-- Dependencies: 331
-- Name: flow_run_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flow_run_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5401 (class 3256 OID 18381)
-- Name: flow_run_events flow_run_events_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flow_run_events_select ON public.flow_run_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.flow_runs r
  WHERE ((r.id = flow_run_events.flow_run_id) AND public.is_account_member(r.account_id)))));


--
-- TOC entry 5315 (class 0 OID 18079)
-- Dependencies: 330
-- Name: flow_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flow_runs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5383 (class 3256 OID 18359)
-- Name: flow_runs flow_runs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flow_runs_select ON public.flow_runs FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5313 (class 0 OID 18034)
-- Dependencies: 328
-- Name: flows; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5382 (class 3256 OID 18358)
-- Name: flows flows_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flows_delete ON public.flows FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5380 (class 3256 OID 18356)
-- Name: flows flows_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flows_insert ON public.flows FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5379 (class 3256 OID 18355)
-- Name: flows flows_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flows_select ON public.flows FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5381 (class 3256 OID 18357)
-- Name: flows flows_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY flows_update ON public.flows FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5328 (class 0 OID 19447)
-- Dependencies: 353
-- Name: landing_faqs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.landing_faqs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5319 (class 0 OID 18443)
-- Dependencies: 334
-- Name: member_presence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.member_presence ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5312 (class 0 OID 18004)
-- Dependencies: 327
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5403 (class 3256 OID 18384)
-- Name: message_reactions message_reactions_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_reactions_modify ON public.message_reactions USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5402 (class 3256 OID 18382)
-- Name: message_reactions message_reactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_reactions_select ON public.message_reactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.conversations c ON ((c.id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND public.is_account_member(c.account_id)))));


--
-- TOC entry 5302 (class 0 OID 17692)
-- Dependencies: 317
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5361 (class 3256 OID 18337)
-- Name: message_templates message_templates_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_templates_delete ON public.message_templates FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5359 (class 3256 OID 18335)
-- Name: message_templates message_templates_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_templates_insert ON public.message_templates FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5358 (class 3256 OID 18334)
-- Name: message_templates message_templates_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_templates_select ON public.message_templates FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5360 (class 3256 OID 18336)
-- Name: message_templates message_templates_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY message_templates_update ON public.message_templates FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5300 (class 0 OID 17649)
-- Dependencies: 315
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5390 (class 3256 OID 18367)
-- Name: messages messages_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY messages_modify ON public.messages USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND public.is_account_member(c.account_id, 'agent'::public.account_role_enum)))));


--
-- TOC entry 5389 (class 3256 OID 18366)
-- Name: messages messages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY messages_select ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND public.is_account_member(c.account_id)))));


--
-- TOC entry 5321 (class 0 OID 18500)
-- Dependencies: 336
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5419 (class 3256 OID 18538)
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 5420 (class 3256 OID 18539)
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 5304 (class 0 OID 17729)
-- Dependencies: 319
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5393 (class 3256 OID 18370)
-- Name: pipeline_stages pipeline_stages_modify; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipeline_stages_modify ON public.pipeline_stages USING ((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND public.is_account_member(p.account_id, 'admin'::public.account_role_enum))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND public.is_account_member(p.account_id, 'admin'::public.account_role_enum)))));


--
-- TOC entry 5391 (class 3256 OID 18369)
-- Name: pipeline_stages pipeline_stages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipeline_stages_select ON public.pipeline_stages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND public.is_account_member(p.account_id)))));


--
-- TOC entry 5303 (class 0 OID 17714)
-- Dependencies: 318
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5365 (class 3256 OID 18341)
-- Name: pipelines pipelines_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipelines_delete ON public.pipelines FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5363 (class 3256 OID 18339)
-- Name: pipelines pipelines_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipelines_insert ON public.pipelines FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5362 (class 3256 OID 18338)
-- Name: pipelines pipelines_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipelines_select ON public.pipelines FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5364 (class 3256 OID 18340)
-- Name: pipelines pipelines_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pipelines_update ON public.pipelines FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5292 (class 0 OID 17488)
-- Dependencies: 307
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5406 (class 3256 OID 18389)
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 5404 (class 3256 OID 18387)
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (((auth.uid() = user_id) OR public.is_account_member(account_id)));


--
-- TOC entry 5405 (class 3256 OID 18388)
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 5327 (class 0 OID 19036)
-- Dependencies: 342
-- Name: quick_replies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5437 (class 3256 OID 19062)
-- Name: quick_replies quick_replies_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quick_replies_delete ON public.quick_replies FOR DELETE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5435 (class 3256 OID 19060)
-- Name: quick_replies quick_replies_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quick_replies_insert ON public.quick_replies FOR INSERT WITH CHECK (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5434 (class 3256 OID 19059)
-- Name: quick_replies quick_replies_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quick_replies_select ON public.quick_replies FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5436 (class 3256 OID 19061)
-- Name: quick_replies quick_replies_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quick_replies_update ON public.quick_replies FOR UPDATE USING (public.is_account_member(account_id, 'agent'::public.account_role_enum));


--
-- TOC entry 5294 (class 0 OID 17527)
-- Dependencies: 309
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5346 (class 3256 OID 18317)
-- Name: tags tags_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tags_delete ON public.tags FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5344 (class 3256 OID 18315)
-- Name: tags tags_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tags_insert ON public.tags FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5343 (class 3256 OID 18314)
-- Name: tags tags_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tags_select ON public.tags FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5345 (class 3256 OID 18316)
-- Name: tags tags_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tags_update ON public.tags FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5322 (class 0 OID 18544)
-- Dependencies: 337
-- Name: webhook_endpoints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5424 (class 3256 OID 18570)
-- Name: webhook_endpoints webhook_endpoints_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_endpoints_delete ON public.webhook_endpoints FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5422 (class 3256 OID 18568)
-- Name: webhook_endpoints webhook_endpoints_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_endpoints_insert ON public.webhook_endpoints FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5421 (class 3256 OID 18567)
-- Name: webhook_endpoints webhook_endpoints_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_endpoints_select ON public.webhook_endpoints FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5423 (class 3256 OID 18569)
-- Name: webhook_endpoints webhook_endpoints_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_endpoints_update ON public.webhook_endpoints FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5301 (class 0 OID 17672)
-- Dependencies: 316
-- Name: whatsapp_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5357 (class 3256 OID 18333)
-- Name: whatsapp_config whatsapp_config_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_config_delete ON public.whatsapp_config FOR DELETE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5355 (class 3256 OID 18331)
-- Name: whatsapp_config whatsapp_config_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_config_insert ON public.whatsapp_config FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5354 (class 3256 OID 18330)
-- Name: whatsapp_config whatsapp_config_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_config_select ON public.whatsapp_config FOR SELECT USING (public.is_account_member(account_id));


--
-- TOC entry 5356 (class 3256 OID 18332)
-- Name: whatsapp_config whatsapp_config_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_config_update ON public.whatsapp_config FOR UPDATE USING (public.is_account_member(account_id, 'admin'::public.account_role_enum));


--
-- TOC entry 5283 (class 0 OID 17243)
-- Dependencies: 294
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5451 (class 3256 OID 19419)
-- Name: objects Auth Delete; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE USING (((bucket_id = 'public-assets'::text) AND (auth.role() = 'authenticated'::text)));


--
-- TOC entry 5450 (class 3256 OID 19418)
-- Name: objects Auth Update; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE USING (((bucket_id = 'public-assets'::text) AND (auth.role() = 'authenticated'::text)));


--
-- TOC entry 5449 (class 3256 OID 19417)
-- Name: objects Auth Upload; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'public-assets'::text) AND (auth.role() = 'authenticated'::text)));


--
-- TOC entry 5334 (class 3256 OID 17994)
-- Name: objects Avatars are publicly readable; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Avatars are publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));


--
-- TOC entry 5442 (class 3256 OID 19140)
-- Name: objects Chat media is publicly readable; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Chat media is publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-media'::text));


--
-- TOC entry 5438 (class 3256 OID 19136)
-- Name: objects Flow media is publicly readable; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Flow media is publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'flow-media'::text));


--
-- TOC entry 5416 (class 3256 OID 18432)
-- Name: objects Members can delete chat media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can delete chat media" ON storage.objects FOR DELETE USING (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]) AND (public.is_account_member(p.account_id, 'admin'::public.account_role_enum) OR (objects.owner = auth.uid())))))));


--
-- TOC entry 5411 (class 3256 OID 18411)
-- Name: objects Members can delete flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can delete flow media" ON storage.objects FOR DELETE USING (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));


--
-- TOC entry 5415 (class 3256 OID 18431)
-- Name: objects Members can update chat media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can update chat media" ON storage.objects FOR UPDATE USING (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]) AND (public.is_account_member(p.account_id, 'admin'::public.account_role_enum) OR (objects.owner = auth.uid())))))));


--
-- TOC entry 5410 (class 3256 OID 18410)
-- Name: objects Members can update flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can update flow media" ON storage.objects FOR UPDATE USING (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));


--
-- TOC entry 5414 (class 3256 OID 18430)
-- Name: objects Members can upload chat media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can upload chat media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]) AND public.is_account_member(p.account_id, 'agent'::public.account_role_enum))))));


--
-- TOC entry 5409 (class 3256 OID 18409)
-- Name: objects Members can upload flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Members can upload flow media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));


--
-- TOC entry 5448 (class 3256 OID 19416)
-- Name: objects Public Access; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ((bucket_id = 'public-assets'::text));


--
-- TOC entry 5447 (class 3256 OID 19387)
-- Name: objects Public read access for landing assets; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Public read access for landing assets" ON storage.objects FOR SELECT USING ((bucket_id = 'landing-assets'::text));


--
-- TOC entry 5337 (class 3256 OID 17997)
-- Name: objects Users can delete their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5441 (class 3256 OID 19139)
-- Name: objects Users can delete their own flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can delete their own flow media" ON storage.objects FOR DELETE USING (((bucket_id = 'flow-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5336 (class 3256 OID 17996)
-- Name: objects Users can update their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5440 (class 3256 OID 19138)
-- Name: objects Users can update their own flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can update their own flow media" ON storage.objects FOR UPDATE USING (((bucket_id = 'flow-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5335 (class 3256 OID 17995)
-- Name: objects Users can upload their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5439 (class 3256 OID 19137)
-- Name: objects Users can upload their own flow media; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can upload their own flow media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'flow-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- TOC entry 5285 (class 0 OID 17294)
-- Dependencies: 299
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5289 (class 0 OID 17414)
-- Dependencies: 303
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5290 (class 0 OID 17427)
-- Dependencies: 304
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5284 (class 0 OID 17286)
-- Dependencies: 298
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5286 (class 0 OID 17304)
-- Dependencies: 300
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5287 (class 0 OID 17353)
-- Dependencies: 301
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5288 (class 0 OID 17367)
-- Dependencies: 302
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5291 (class 0 OID 17437)
-- Dependencies: 305
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5455 (class 6104 OID 16430)
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- TOC entry 5456 (class 6104 OID 19132)
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime_messages_publication OWNER TO supabase_admin;

--
-- TOC entry 5458 (class 6106 OID 17847)
-- Name: supabase_realtime conversations; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.conversations;


--
-- TOC entry 5460 (class 6106 OID 18142)
-- Name: supabase_realtime flow_runs; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.flow_runs;


--
-- TOC entry 5461 (class 6106 OID 18467)
-- Name: supabase_realtime member_presence; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.member_presence;


--
-- TOC entry 5459 (class 6106 OID 18032)
-- Name: supabase_realtime message_reactions; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.message_reactions;


--
-- TOC entry 5457 (class 6106 OID 17846)
-- Name: supabase_realtime messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.messages;


--
-- TOC entry 5462 (class 6106 OID 18542)
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- TOC entry 5463 (class 6106 OID 19133)
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: supabase_admin
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- TOC entry 5560 (class 0 OID 0)
-- Dependencies: 26
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- TOC entry 5561 (class 0 OID 0)
-- Dependencies: 17
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- TOC entry 5562 (class 0 OID 0)
-- Dependencies: 12
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- TOC entry 5563 (class 0 OID 0)
-- Dependencies: 10
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin WITH GRANT OPTION;
GRANT USAGE ON SCHEMA realtime TO authenticated;


--
-- TOC entry 5564 (class 0 OID 0)
-- Dependencies: 27
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- TOC entry 5565 (class 0 OID 0)
-- Dependencies: 23
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- TOC entry 5571 (class 0 OID 0)
-- Dependencies: 538
-- Name: FUNCTION halfvec_in(cstring, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_in(cstring, oid, integer) TO service_role;


--
-- TOC entry 5572 (class 0 OID 0)
-- Dependencies: 539
-- Name: FUNCTION halfvec_out(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_out(public.halfvec) TO service_role;


--
-- TOC entry 5573 (class 0 OID 0)
-- Dependencies: 541
-- Name: FUNCTION halfvec_recv(internal, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_recv(internal, oid, integer) TO service_role;


--
-- TOC entry 5574 (class 0 OID 0)
-- Dependencies: 542
-- Name: FUNCTION halfvec_send(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_send(public.halfvec) TO service_role;


--
-- TOC entry 5575 (class 0 OID 0)
-- Dependencies: 540
-- Name: FUNCTION halfvec_typmod_in(cstring[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_typmod_in(cstring[]) TO service_role;


--
-- TOC entry 5576 (class 0 OID 0)
-- Dependencies: 579
-- Name: FUNCTION sparsevec_in(cstring, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_in(cstring, oid, integer) TO service_role;


--
-- TOC entry 5577 (class 0 OID 0)
-- Dependencies: 580
-- Name: FUNCTION sparsevec_out(public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_out(public.sparsevec) TO service_role;


--
-- TOC entry 5578 (class 0 OID 0)
-- Dependencies: 582
-- Name: FUNCTION sparsevec_recv(internal, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_recv(internal, oid, integer) TO service_role;


--
-- TOC entry 5579 (class 0 OID 0)
-- Dependencies: 583
-- Name: FUNCTION sparsevec_send(public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_send(public.sparsevec) TO service_role;


--
-- TOC entry 5580 (class 0 OID 0)
-- Dependencies: 581
-- Name: FUNCTION sparsevec_typmod_in(cstring[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_typmod_in(cstring[]) TO service_role;


--
-- TOC entry 5581 (class 0 OID 0)
-- Dependencies: 494
-- Name: FUNCTION vector_in(cstring, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.vector_in(cstring, oid, integer) TO service_role;


--
-- TOC entry 5582 (class 0 OID 0)
-- Dependencies: 495
-- Name: FUNCTION vector_out(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_out(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_out(public.vector) TO service_role;


--
-- TOC entry 5583 (class 0 OID 0)
-- Dependencies: 497
-- Name: FUNCTION vector_recv(internal, oid, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO postgres;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO anon;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.vector_recv(internal, oid, integer) TO service_role;


--
-- TOC entry 5584 (class 0 OID 0)
-- Dependencies: 498
-- Name: FUNCTION vector_send(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_send(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_send(public.vector) TO service_role;


--
-- TOC entry 5585 (class 0 OID 0)
-- Dependencies: 496
-- Name: FUNCTION vector_typmod_in(cstring[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO anon;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_typmod_in(cstring[]) TO service_role;


--
-- TOC entry 5586 (class 0 OID 0)
-- Dependencies: 573
-- Name: FUNCTION array_to_halfvec(real[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(real[], integer, boolean) TO service_role;


--
-- TOC entry 5587 (class 0 OID 0)
-- Dependencies: 605
-- Name: FUNCTION array_to_sparsevec(real[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(real[], integer, boolean) TO service_role;


--
-- TOC entry 5588 (class 0 OID 0)
-- Dependencies: 527
-- Name: FUNCTION array_to_vector(real[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(real[], integer, boolean) TO service_role;


--
-- TOC entry 5589 (class 0 OID 0)
-- Dependencies: 574
-- Name: FUNCTION array_to_halfvec(double precision[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(double precision[], integer, boolean) TO service_role;


--
-- TOC entry 5590 (class 0 OID 0)
-- Dependencies: 606
-- Name: FUNCTION array_to_sparsevec(double precision[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(double precision[], integer, boolean) TO service_role;


--
-- TOC entry 5591 (class 0 OID 0)
-- Dependencies: 528
-- Name: FUNCTION array_to_vector(double precision[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(double precision[], integer, boolean) TO service_role;


--
-- TOC entry 5592 (class 0 OID 0)
-- Dependencies: 572
-- Name: FUNCTION array_to_halfvec(integer[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(integer[], integer, boolean) TO service_role;


--
-- TOC entry 5593 (class 0 OID 0)
-- Dependencies: 604
-- Name: FUNCTION array_to_sparsevec(integer[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(integer[], integer, boolean) TO service_role;


--
-- TOC entry 5594 (class 0 OID 0)
-- Dependencies: 526
-- Name: FUNCTION array_to_vector(integer[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(integer[], integer, boolean) TO service_role;


--
-- TOC entry 5595 (class 0 OID 0)
-- Dependencies: 575
-- Name: FUNCTION array_to_halfvec(numeric[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_halfvec(numeric[], integer, boolean) TO service_role;


--
-- TOC entry 5596 (class 0 OID 0)
-- Dependencies: 607
-- Name: FUNCTION array_to_sparsevec(numeric[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_sparsevec(numeric[], integer, boolean) TO service_role;


--
-- TOC entry 5597 (class 0 OID 0)
-- Dependencies: 529
-- Name: FUNCTION array_to_vector(numeric[], integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.array_to_vector(numeric[], integer, boolean) TO service_role;


--
-- TOC entry 5598 (class 0 OID 0)
-- Dependencies: 576
-- Name: FUNCTION halfvec_to_float4(public.halfvec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_float4(public.halfvec, integer, boolean) TO service_role;


--
-- TOC entry 5599 (class 0 OID 0)
-- Dependencies: 569
-- Name: FUNCTION halfvec(public.halfvec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec(public.halfvec, integer, boolean) TO service_role;


--
-- TOC entry 5600 (class 0 OID 0)
-- Dependencies: 602
-- Name: FUNCTION halfvec_to_sparsevec(public.halfvec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_sparsevec(public.halfvec, integer, boolean) TO service_role;


--
-- TOC entry 5601 (class 0 OID 0)
-- Dependencies: 570
-- Name: FUNCTION halfvec_to_vector(public.halfvec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_to_vector(public.halfvec, integer, boolean) TO service_role;


--
-- TOC entry 5602 (class 0 OID 0)
-- Dependencies: 603
-- Name: FUNCTION sparsevec_to_halfvec(public.sparsevec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_to_halfvec(public.sparsevec, integer, boolean) TO service_role;


--
-- TOC entry 5603 (class 0 OID 0)
-- Dependencies: 599
-- Name: FUNCTION sparsevec(public.sparsevec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec(public.sparsevec, integer, boolean) TO service_role;


--
-- TOC entry 5604 (class 0 OID 0)
-- Dependencies: 601
-- Name: FUNCTION sparsevec_to_vector(public.sparsevec, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_to_vector(public.sparsevec, integer, boolean) TO service_role;


--
-- TOC entry 5605 (class 0 OID 0)
-- Dependencies: 530
-- Name: FUNCTION vector_to_float4(public.vector, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_float4(public.vector, integer, boolean) TO service_role;


--
-- TOC entry 5606 (class 0 OID 0)
-- Dependencies: 571
-- Name: FUNCTION vector_to_halfvec(public.vector, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_halfvec(public.vector, integer, boolean) TO service_role;


--
-- TOC entry 5607 (class 0 OID 0)
-- Dependencies: 600
-- Name: FUNCTION vector_to_sparsevec(public.vector, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector_to_sparsevec(public.vector, integer, boolean) TO service_role;


--
-- TOC entry 5608 (class 0 OID 0)
-- Dependencies: 525
-- Name: FUNCTION vector(public.vector, integer, boolean); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO postgres;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO anon;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.vector(public.vector, integer, boolean) TO service_role;


--
-- TOC entry 5610 (class 0 OID 0)
-- Dependencies: 427
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- TOC entry 5611 (class 0 OID 0)
-- Dependencies: 440
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- TOC entry 5613 (class 0 OID 0)
-- Dependencies: 426
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- TOC entry 5615 (class 0 OID 0)
-- Dependencies: 425
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- TOC entry 5616 (class 0 OID 0)
-- Dependencies: 421
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;


--
-- TOC entry 5617 (class 0 OID 0)
-- Dependencies: 422
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea, text[], text[]) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;


--
-- TOC entry 5618 (class 0 OID 0)
-- Dependencies: 393
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.crypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;


--
-- TOC entry 5619 (class 0 OID 0)
-- Dependencies: 423
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.dearmor(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;


--
-- TOC entry 5620 (class 0 OID 0)
-- Dependencies: 397
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5621 (class 0 OID 0)
-- Dependencies: 399
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5622 (class 0 OID 0)
-- Dependencies: 390
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;


--
-- TOC entry 5623 (class 0 OID 0)
-- Dependencies: 389
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;


--
-- TOC entry 5624 (class 0 OID 0)
-- Dependencies: 396
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5625 (class 0 OID 0)
-- Dependencies: 398
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5626 (class 0 OID 0)
-- Dependencies: 400
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_bytes(integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;


--
-- TOC entry 5627 (class 0 OID 0)
-- Dependencies: 401
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_uuid() FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;


--
-- TOC entry 5628 (class 0 OID 0)
-- Dependencies: 394
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;


--
-- TOC entry 5629 (class 0 OID 0)
-- Dependencies: 395
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text, integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;


--
-- TOC entry 5631 (class 0 OID 0)
-- Dependencies: 428
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- TOC entry 5633 (class 0 OID 0)
-- Dependencies: 432
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- TOC entry 5635 (class 0 OID 0)
-- Dependencies: 429
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- TOC entry 5636 (class 0 OID 0)
-- Dependencies: 392
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5637 (class 0 OID 0)
-- Dependencies: 391
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;


--
-- TOC entry 5638 (class 0 OID 0)
-- Dependencies: 377
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO dashboard_user;


--
-- TOC entry 5639 (class 0 OID 0)
-- Dependencies: 376
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO dashboard_user;


--
-- TOC entry 5640 (class 0 OID 0)
-- Dependencies: 378
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO dashboard_user;


--
-- TOC entry 5641 (class 0 OID 0)
-- Dependencies: 424
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;


--
-- TOC entry 5642 (class 0 OID 0)
-- Dependencies: 420
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_key_id(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;


--
-- TOC entry 5643 (class 0 OID 0)
-- Dependencies: 414
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;


--
-- TOC entry 5644 (class 0 OID 0)
-- Dependencies: 416
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5645 (class 0 OID 0)
-- Dependencies: 418
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;


--
-- TOC entry 5646 (class 0 OID 0)
-- Dependencies: 415
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- TOC entry 5647 (class 0 OID 0)
-- Dependencies: 417
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5648 (class 0 OID 0)
-- Dependencies: 419
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;


--
-- TOC entry 5649 (class 0 OID 0)
-- Dependencies: 410
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;


--
-- TOC entry 5650 (class 0 OID 0)
-- Dependencies: 412
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;


--
-- TOC entry 5651 (class 0 OID 0)
-- Dependencies: 411
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- TOC entry 5652 (class 0 OID 0)
-- Dependencies: 413
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- TOC entry 5653 (class 0 OID 0)
-- Dependencies: 406
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;


--
-- TOC entry 5654 (class 0 OID 0)
-- Dependencies: 408
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;


--
-- TOC entry 5655 (class 0 OID 0)
-- Dependencies: 407
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;


--
-- TOC entry 5656 (class 0 OID 0)
-- Dependencies: 409
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- TOC entry 5657 (class 0 OID 0)
-- Dependencies: 402
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;


--
-- TOC entry 5658 (class 0 OID 0)
-- Dependencies: 404
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;


--
-- TOC entry 5659 (class 0 OID 0)
-- Dependencies: 403
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;


--
-- TOC entry 5660 (class 0 OID 0)
-- Dependencies: 405
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- TOC entry 5661 (class 0 OID 0)
-- Dependencies: 430
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- TOC entry 5662 (class 0 OID 0)
-- Dependencies: 431
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- TOC entry 5664 (class 0 OID 0)
-- Dependencies: 433
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- TOC entry 5665 (class 0 OID 0)
-- Dependencies: 384
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;


--
-- TOC entry 5666 (class 0 OID 0)
-- Dependencies: 385
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1mc() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;


--
-- TOC entry 5667 (class 0 OID 0)
-- Dependencies: 386
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;


--
-- TOC entry 5668 (class 0 OID 0)
-- Dependencies: 387
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v4() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;


--
-- TOC entry 5669 (class 0 OID 0)
-- Dependencies: 388
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;


--
-- TOC entry 5670 (class 0 OID 0)
-- Dependencies: 379
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_nil() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;


--
-- TOC entry 5671 (class 0 OID 0)
-- Dependencies: 380
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_dns() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;


--
-- TOC entry 5672 (class 0 OID 0)
-- Dependencies: 382
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_oid() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;


--
-- TOC entry 5673 (class 0 OID 0)
-- Dependencies: 381
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_url() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;


--
-- TOC entry 5674 (class 0 OID 0)
-- Dependencies: 383
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_x500() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;


--
-- TOC entry 5675 (class 0 OID 0)
-- Dependencies: 439
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- TOC entry 5676 (class 0 OID 0)
-- Dependencies: 363
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- TOC entry 5677 (class 0 OID 0)
-- Dependencies: 375
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- TOC entry 5678 (class 0 OID 0)
-- Dependencies: 476
-- Name: FUNCTION _bcast_bump(bid uuid, col text, delta integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public._bcast_bump(bid uuid, col text, delta integer) TO anon;
GRANT ALL ON FUNCTION public._bcast_bump(bid uuid, col text, delta integer) TO authenticated;
GRANT ALL ON FUNCTION public._bcast_bump(bid uuid, col text, delta integer) TO service_role;


--
-- TOC entry 5679 (class 0 OID 0)
-- Dependencies: 477
-- Name: FUNCTION _bcast_cols_for_status(s text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public._bcast_cols_for_status(s text) TO anon;
GRANT ALL ON FUNCTION public._bcast_cols_for_status(s text) TO authenticated;
GRANT ALL ON FUNCTION public._bcast_cols_for_status(s text) TO service_role;


--
-- TOC entry 5680 (class 0 OID 0)
-- Dependencies: 550
-- Name: FUNCTION binary_quantize(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.binary_quantize(public.halfvec) TO service_role;


--
-- TOC entry 5681 (class 0 OID 0)
-- Dependencies: 506
-- Name: FUNCTION binary_quantize(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO anon;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.binary_quantize(public.vector) TO service_role;


--
-- TOC entry 5682 (class 0 OID 0)
-- Dependencies: 475
-- Name: FUNCTION broadcast_recipient_aggregate_trigger(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.broadcast_recipient_aggregate_trigger() TO anon;
GRANT ALL ON FUNCTION public.broadcast_recipient_aggregate_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.broadcast_recipient_aggregate_trigger() TO service_role;


--
-- TOC entry 5683 (class 0 OID 0)
-- Dependencies: 493
-- Name: FUNCTION claim_ai_reply_slot(conversation_id uuid, max_replies integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.claim_ai_reply_slot(conversation_id uuid, max_replies integer) TO anon;
GRANT ALL ON FUNCTION public.claim_ai_reply_slot(conversation_id uuid, max_replies integer) TO authenticated;
GRANT ALL ON FUNCTION public.claim_ai_reply_slot(conversation_id uuid, max_replies integer) TO service_role;


--
-- TOC entry 5684 (class 0 OID 0)
-- Dependencies: 545
-- Name: FUNCTION cosine_distance(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5685 (class 0 OID 0)
-- Dependencies: 586
-- Name: FUNCTION cosine_distance(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5686 (class 0 OID 0)
-- Dependencies: 501
-- Name: FUNCTION cosine_distance(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.cosine_distance(public.vector, public.vector) TO service_role;


--
-- TOC entry 5687 (class 0 OID 0)
-- Dependencies: 611
-- Name: FUNCTION enforce_profile_privilege_columns(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_profile_privilege_columns() TO anon;
GRANT ALL ON FUNCTION public.enforce_profile_privilege_columns() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_profile_privilege_columns() TO service_role;


--
-- TOC entry 5688 (class 0 OID 0)
-- Dependencies: 308
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- TOC entry 5689 (class 0 OID 0)
-- Dependencies: 489
-- Name: FUNCTION filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.filter_contacts_by_tags(p_tag_ids uuid[], p_match_all boolean, p_search text, p_limit integer, p_offset integer) TO service_role;


--
-- TOC entry 5690 (class 0 OID 0)
-- Dependencies: 616
-- Name: FUNCTION fn_account_deep_dive(target_account_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_account_deep_dive(target_account_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_account_deep_dive(target_account_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_account_deep_dive(target_account_id uuid) TO service_role;


--
-- TOC entry 5691 (class 0 OID 0)
-- Dependencies: 618
-- Name: FUNCTION fn_health_metrics(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_health_metrics() TO anon;
GRANT ALL ON FUNCTION public.fn_health_metrics() TO authenticated;
GRANT ALL ON FUNCTION public.fn_health_metrics() TO service_role;


--
-- TOC entry 5692 (class 0 OID 0)
-- Dependencies: 615
-- Name: FUNCTION fn_platform_metrics(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_platform_metrics() TO anon;
GRANT ALL ON FUNCTION public.fn_platform_metrics() TO authenticated;
GRANT ALL ON FUNCTION public.fn_platform_metrics() TO service_role;


--
-- TOC entry 5693 (class 0 OID 0)
-- Dependencies: 617
-- Name: FUNCTION fn_signups_over_time(days_back integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_signups_over_time(days_back integer) TO anon;
GRANT ALL ON FUNCTION public.fn_signups_over_time(days_back integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_signups_over_time(days_back integer) TO service_role;


--
-- TOC entry 5694 (class 0 OID 0)
-- Dependencies: 566
-- Name: FUNCTION halfvec_accum(double precision[], public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_accum(double precision[], public.halfvec) TO service_role;


--
-- TOC entry 5695 (class 0 OID 0)
-- Dependencies: 552
-- Name: FUNCTION halfvec_add(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_add(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5696 (class 0 OID 0)
-- Dependencies: 567
-- Name: FUNCTION halfvec_avg(double precision[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_avg(double precision[]) TO service_role;


--
-- TOC entry 5697 (class 0 OID 0)
-- Dependencies: 562
-- Name: FUNCTION halfvec_cmp(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_cmp(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5698 (class 0 OID 0)
-- Dependencies: 568
-- Name: FUNCTION halfvec_combine(double precision[], double precision[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO anon;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_combine(double precision[], double precision[]) TO service_role;


--
-- TOC entry 5699 (class 0 OID 0)
-- Dependencies: 555
-- Name: FUNCTION halfvec_concat(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_concat(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5700 (class 0 OID 0)
-- Dependencies: 558
-- Name: FUNCTION halfvec_eq(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_eq(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5701 (class 0 OID 0)
-- Dependencies: 560
-- Name: FUNCTION halfvec_ge(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_ge(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5702 (class 0 OID 0)
-- Dependencies: 561
-- Name: FUNCTION halfvec_gt(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_gt(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5703 (class 0 OID 0)
-- Dependencies: 563
-- Name: FUNCTION halfvec_l2_squared_distance(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_l2_squared_distance(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5704 (class 0 OID 0)
-- Dependencies: 557
-- Name: FUNCTION halfvec_le(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_le(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5705 (class 0 OID 0)
-- Dependencies: 556
-- Name: FUNCTION halfvec_lt(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_lt(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5706 (class 0 OID 0)
-- Dependencies: 554
-- Name: FUNCTION halfvec_mul(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_mul(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5707 (class 0 OID 0)
-- Dependencies: 559
-- Name: FUNCTION halfvec_ne(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_ne(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5708 (class 0 OID 0)
-- Dependencies: 564
-- Name: FUNCTION halfvec_negative_inner_product(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_negative_inner_product(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5709 (class 0 OID 0)
-- Dependencies: 565
-- Name: FUNCTION halfvec_spherical_distance(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_spherical_distance(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5710 (class 0 OID 0)
-- Dependencies: 553
-- Name: FUNCTION halfvec_sub(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.halfvec_sub(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5711 (class 0 OID 0)
-- Dependencies: 577
-- Name: FUNCTION hamming_distance(bit, bit); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO postgres;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO anon;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO authenticated;
GRANT ALL ON FUNCTION public.hamming_distance(bit, bit) TO service_role;


--
-- TOC entry 5712 (class 0 OID 0)
-- Dependencies: 481
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- TOC entry 5713 (class 0 OID 0)
-- Dependencies: 536
-- Name: FUNCTION hnsw_bit_support(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_bit_support(internal) TO service_role;


--
-- TOC entry 5714 (class 0 OID 0)
-- Dependencies: 535
-- Name: FUNCTION hnsw_halfvec_support(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_halfvec_support(internal) TO service_role;


--
-- TOC entry 5715 (class 0 OID 0)
-- Dependencies: 537
-- Name: FUNCTION hnsw_sparsevec_support(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnsw_sparsevec_support(internal) TO service_role;


--
-- TOC entry 5716 (class 0 OID 0)
-- Dependencies: 532
-- Name: FUNCTION hnswhandler(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.hnswhandler(internal) TO postgres;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO anon;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO authenticated;
GRANT ALL ON FUNCTION public.hnswhandler(internal) TO service_role;


--
-- TOC entry 5717 (class 0 OID 0)
-- Dependencies: 478
-- Name: FUNCTION increment_automation_execution_count(p_automation_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.increment_automation_execution_count(p_automation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_automation_execution_count(p_automation_id uuid) TO service_role;


--
-- TOC entry 5718 (class 0 OID 0)
-- Dependencies: 479
-- Name: FUNCTION increment_flow_execution_count(p_flow_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.increment_flow_execution_count(p_flow_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_flow_execution_count(p_flow_id uuid) TO service_role;


--
-- TOC entry 5719 (class 0 OID 0)
-- Dependencies: 544
-- Name: FUNCTION inner_product(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5720 (class 0 OID 0)
-- Dependencies: 585
-- Name: FUNCTION inner_product(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5721 (class 0 OID 0)
-- Dependencies: 500
-- Name: FUNCTION inner_product(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.inner_product(public.vector, public.vector) TO service_role;


--
-- TOC entry 5722 (class 0 OID 0)
-- Dependencies: 480
-- Name: FUNCTION is_account_member(target_account_id uuid, min_role public.account_role_enum); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_account_member(target_account_id uuid, min_role public.account_role_enum) TO anon;
GRANT ALL ON FUNCTION public.is_account_member(target_account_id uuid, min_role public.account_role_enum) TO authenticated;
GRANT ALL ON FUNCTION public.is_account_member(target_account_id uuid, min_role public.account_role_enum) TO service_role;


--
-- TOC entry 5723 (class 0 OID 0)
-- Dependencies: 534
-- Name: FUNCTION ivfflat_bit_support(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflat_bit_support(internal) TO service_role;


--
-- TOC entry 5724 (class 0 OID 0)
-- Dependencies: 533
-- Name: FUNCTION ivfflat_halfvec_support(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflat_halfvec_support(internal) TO service_role;


--
-- TOC entry 5725 (class 0 OID 0)
-- Dependencies: 531
-- Name: FUNCTION ivfflathandler(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO postgres;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO anon;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO authenticated;
GRANT ALL ON FUNCTION public.ivfflathandler(internal) TO service_role;


--
-- TOC entry 5726 (class 0 OID 0)
-- Dependencies: 578
-- Name: FUNCTION jaccard_distance(bit, bit); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO postgres;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO anon;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO authenticated;
GRANT ALL ON FUNCTION public.jaccard_distance(bit, bit) TO service_role;


--
-- TOC entry 5727 (class 0 OID 0)
-- Dependencies: 546
-- Name: FUNCTION l1_distance(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5728 (class 0 OID 0)
-- Dependencies: 587
-- Name: FUNCTION l1_distance(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5729 (class 0 OID 0)
-- Dependencies: 502
-- Name: FUNCTION l1_distance(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l1_distance(public.vector, public.vector) TO service_role;


--
-- TOC entry 5730 (class 0 OID 0)
-- Dependencies: 543
-- Name: FUNCTION l2_distance(public.halfvec, public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.halfvec, public.halfvec) TO service_role;


--
-- TOC entry 5731 (class 0 OID 0)
-- Dependencies: 584
-- Name: FUNCTION l2_distance(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5732 (class 0 OID 0)
-- Dependencies: 499
-- Name: FUNCTION l2_distance(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l2_distance(public.vector, public.vector) TO service_role;


--
-- TOC entry 5733 (class 0 OID 0)
-- Dependencies: 548
-- Name: FUNCTION l2_norm(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_norm(public.halfvec) TO service_role;


--
-- TOC entry 5734 (class 0 OID 0)
-- Dependencies: 588
-- Name: FUNCTION l2_norm(public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_norm(public.sparsevec) TO service_role;


--
-- TOC entry 5735 (class 0 OID 0)
-- Dependencies: 549
-- Name: FUNCTION l2_normalize(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.halfvec) TO service_role;


--
-- TOC entry 5736 (class 0 OID 0)
-- Dependencies: 589
-- Name: FUNCTION l2_normalize(public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.sparsevec) TO service_role;


--
-- TOC entry 5737 (class 0 OID 0)
-- Dependencies: 505
-- Name: FUNCTION l2_normalize(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO anon;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.l2_normalize(public.vector) TO service_role;


--
-- TOC entry 5738 (class 0 OID 0)
-- Dependencies: 609
-- Name: FUNCTION match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_ai_knowledge_fts(p_account_id uuid, p_query text, p_match_count integer) TO service_role;


--
-- TOC entry 5739 (class 0 OID 0)
-- Dependencies: 610
-- Name: FUNCTION match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_ai_knowledge_semantic(p_account_id uuid, p_query_embedding text, p_match_count integer) TO service_role;


--
-- TOC entry 5740 (class 0 OID 0)
-- Dependencies: 487
-- Name: FUNCTION merge_duplicate_contacts(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_duplicate_contacts() TO anon;
GRANT ALL ON FUNCTION public.merge_duplicate_contacts() TO authenticated;
GRANT ALL ON FUNCTION public.merge_duplicate_contacts() TO service_role;


--
-- TOC entry 5741 (class 0 OID 0)
-- Dependencies: 612
-- Name: FUNCTION merge_duplicate_conversations(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_duplicate_conversations() TO anon;
GRANT ALL ON FUNCTION public.merge_duplicate_conversations() TO authenticated;
GRANT ALL ON FUNCTION public.merge_duplicate_conversations() TO service_role;


--
-- TOC entry 5742 (class 0 OID 0)
-- Dependencies: 490
-- Name: FUNCTION notify_conversation_assigned(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_conversation_assigned() TO anon;
GRANT ALL ON FUNCTION public.notify_conversation_assigned() TO authenticated;
GRANT ALL ON FUNCTION public.notify_conversation_assigned() TO service_role;


--
-- TOC entry 5743 (class 0 OID 0)
-- Dependencies: 485
-- Name: FUNCTION peek_invitation(p_token_hash text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.peek_invitation(p_token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.peek_invitation(p_token_hash text) TO anon;
GRANT ALL ON FUNCTION public.peek_invitation(p_token_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.peek_invitation(p_token_hash text) TO service_role;


--
-- TOC entry 5744 (class 0 OID 0)
-- Dependencies: 474
-- Name: FUNCTION recompute_broadcast_counts(bid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.recompute_broadcast_counts(bid uuid) TO anon;
GRANT ALL ON FUNCTION public.recompute_broadcast_counts(bid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recompute_broadcast_counts(bid uuid) TO service_role;


--
-- TOC entry 5745 (class 0 OID 0)
-- Dependencies: 491
-- Name: FUNCTION record_webhook_failure(endpoint_id uuid, max_failures integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.record_webhook_failure(endpoint_id uuid, max_failures integer) TO anon;
GRANT ALL ON FUNCTION public.record_webhook_failure(endpoint_id uuid, max_failures integer) TO authenticated;
GRANT ALL ON FUNCTION public.record_webhook_failure(endpoint_id uuid, max_failures integer) TO service_role;


--
-- TOC entry 5746 (class 0 OID 0)
-- Dependencies: 486
-- Name: FUNCTION redeem_invitation(p_token_hash text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.redeem_invitation(p_token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_invitation(p_token_hash text) TO anon;
GRANT ALL ON FUNCTION public.redeem_invitation(p_token_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.redeem_invitation(p_token_hash text) TO service_role;


--
-- TOC entry 5747 (class 0 OID 0)
-- Dependencies: 483
-- Name: FUNCTION remove_account_member(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.remove_account_member(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_account_member(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_account_member(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_account_member(p_user_id uuid) TO service_role;


--
-- TOC entry 5748 (class 0 OID 0)
-- Dependencies: 613
-- Name: FUNCTION set_member_permissions(p_user_id uuid, p_permissions jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) TO anon;
GRANT ALL ON FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_permissions(p_user_id uuid, p_permissions jsonb) TO service_role;


--
-- TOC entry 5749 (class 0 OID 0)
-- Dependencies: 482
-- Name: FUNCTION set_member_role(p_user_id uuid, p_new_role public.account_role_enum); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) TO anon;
GRANT ALL ON FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_role(p_user_id uuid, p_new_role public.account_role_enum) TO service_role;


--
-- TOC entry 5750 (class 0 OID 0)
-- Dependencies: 614
-- Name: FUNCTION set_member_status(p_user_id uuid, p_is_active boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_member_status(p_user_id uuid, p_is_active boolean) TO anon;
GRANT ALL ON FUNCTION public.set_member_status(p_user_id uuid, p_is_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_status(p_user_id uuid, p_is_active boolean) TO service_role;


--
-- TOC entry 5751 (class 0 OID 0)
-- Dependencies: 596
-- Name: FUNCTION sparsevec_cmp(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_cmp(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5752 (class 0 OID 0)
-- Dependencies: 592
-- Name: FUNCTION sparsevec_eq(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_eq(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5753 (class 0 OID 0)
-- Dependencies: 594
-- Name: FUNCTION sparsevec_ge(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_ge(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5754 (class 0 OID 0)
-- Dependencies: 595
-- Name: FUNCTION sparsevec_gt(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_gt(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5755 (class 0 OID 0)
-- Dependencies: 597
-- Name: FUNCTION sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_l2_squared_distance(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5756 (class 0 OID 0)
-- Dependencies: 591
-- Name: FUNCTION sparsevec_le(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_le(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5757 (class 0 OID 0)
-- Dependencies: 590
-- Name: FUNCTION sparsevec_lt(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_lt(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5758 (class 0 OID 0)
-- Dependencies: 593
-- Name: FUNCTION sparsevec_ne(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_ne(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5759 (class 0 OID 0)
-- Dependencies: 598
-- Name: FUNCTION sparsevec_negative_inner_product(public.sparsevec, public.sparsevec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO postgres;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO anon;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO authenticated;
GRANT ALL ON FUNCTION public.sparsevec_negative_inner_product(public.sparsevec, public.sparsevec) TO service_role;


--
-- TOC entry 5760 (class 0 OID 0)
-- Dependencies: 551
-- Name: FUNCTION subvector(public.halfvec, integer, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO postgres;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.subvector(public.halfvec, integer, integer) TO service_role;


--
-- TOC entry 5761 (class 0 OID 0)
-- Dependencies: 507
-- Name: FUNCTION subvector(public.vector, integer, integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO postgres;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO anon;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO authenticated;
GRANT ALL ON FUNCTION public.subvector(public.vector, integer, integer) TO service_role;


--
-- TOC entry 5762 (class 0 OID 0)
-- Dependencies: 488
-- Name: FUNCTION touch_presence(p_status public.presence_status_enum, p_custom_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.touch_presence(p_status public.presence_status_enum, p_custom_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_presence(p_status public.presence_status_enum, p_custom_status text) TO anon;
GRANT ALL ON FUNCTION public.touch_presence(p_status public.presence_status_enum, p_custom_status text) TO authenticated;
GRANT ALL ON FUNCTION public.touch_presence(p_status public.presence_status_enum, p_custom_status text) TO service_role;


--
-- TOC entry 5763 (class 0 OID 0)
-- Dependencies: 484
-- Name: FUNCTION transfer_account_ownership(p_new_owner_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_account_ownership(p_new_owner_user_id uuid) TO service_role;


--
-- TOC entry 5764 (class 0 OID 0)
-- Dependencies: 492
-- Name: FUNCTION update_ai_configs_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_ai_configs_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_ai_configs_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_ai_configs_updated_at() TO service_role;


--
-- TOC entry 5765 (class 0 OID 0)
-- Dependencies: 608
-- Name: FUNCTION update_ai_knowledge_documents_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_ai_knowledge_documents_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_ai_knowledge_documents_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_ai_knowledge_documents_updated_at() TO service_role;


--
-- TOC entry 5766 (class 0 OID 0)
-- Dependencies: 473
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- TOC entry 5767 (class 0 OID 0)
-- Dependencies: 522
-- Name: FUNCTION vector_accum(double precision[], public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_accum(double precision[], public.vector) TO service_role;


--
-- TOC entry 5768 (class 0 OID 0)
-- Dependencies: 508
-- Name: FUNCTION vector_add(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_add(public.vector, public.vector) TO service_role;


--
-- TOC entry 5769 (class 0 OID 0)
-- Dependencies: 523
-- Name: FUNCTION vector_avg(double precision[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO anon;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_avg(double precision[]) TO service_role;


--
-- TOC entry 5770 (class 0 OID 0)
-- Dependencies: 518
-- Name: FUNCTION vector_cmp(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_cmp(public.vector, public.vector) TO service_role;


--
-- TOC entry 5771 (class 0 OID 0)
-- Dependencies: 524
-- Name: FUNCTION vector_combine(double precision[], double precision[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO postgres;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO anon;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO authenticated;
GRANT ALL ON FUNCTION public.vector_combine(double precision[], double precision[]) TO service_role;


--
-- TOC entry 5772 (class 0 OID 0)
-- Dependencies: 511
-- Name: FUNCTION vector_concat(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_concat(public.vector, public.vector) TO service_role;


--
-- TOC entry 5773 (class 0 OID 0)
-- Dependencies: 547
-- Name: FUNCTION vector_dims(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.vector_dims(public.halfvec) TO service_role;


--
-- TOC entry 5774 (class 0 OID 0)
-- Dependencies: 503
-- Name: FUNCTION vector_dims(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_dims(public.vector) TO service_role;


--
-- TOC entry 5775 (class 0 OID 0)
-- Dependencies: 514
-- Name: FUNCTION vector_eq(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_eq(public.vector, public.vector) TO service_role;


--
-- TOC entry 5776 (class 0 OID 0)
-- Dependencies: 516
-- Name: FUNCTION vector_ge(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_ge(public.vector, public.vector) TO service_role;


--
-- TOC entry 5777 (class 0 OID 0)
-- Dependencies: 517
-- Name: FUNCTION vector_gt(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_gt(public.vector, public.vector) TO service_role;


--
-- TOC entry 5778 (class 0 OID 0)
-- Dependencies: 519
-- Name: FUNCTION vector_l2_squared_distance(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_l2_squared_distance(public.vector, public.vector) TO service_role;


--
-- TOC entry 5779 (class 0 OID 0)
-- Dependencies: 513
-- Name: FUNCTION vector_le(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_le(public.vector, public.vector) TO service_role;


--
-- TOC entry 5780 (class 0 OID 0)
-- Dependencies: 512
-- Name: FUNCTION vector_lt(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_lt(public.vector, public.vector) TO service_role;


--
-- TOC entry 5781 (class 0 OID 0)
-- Dependencies: 510
-- Name: FUNCTION vector_mul(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_mul(public.vector, public.vector) TO service_role;


--
-- TOC entry 5782 (class 0 OID 0)
-- Dependencies: 515
-- Name: FUNCTION vector_ne(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_ne(public.vector, public.vector) TO service_role;


--
-- TOC entry 5783 (class 0 OID 0)
-- Dependencies: 520
-- Name: FUNCTION vector_negative_inner_product(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_negative_inner_product(public.vector, public.vector) TO service_role;


--
-- TOC entry 5784 (class 0 OID 0)
-- Dependencies: 504
-- Name: FUNCTION vector_norm(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_norm(public.vector) TO service_role;


--
-- TOC entry 5785 (class 0 OID 0)
-- Dependencies: 521
-- Name: FUNCTION vector_spherical_distance(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_spherical_distance(public.vector, public.vector) TO service_role;


--
-- TOC entry 5786 (class 0 OID 0)
-- Dependencies: 509
-- Name: FUNCTION vector_sub(public.vector, public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO postgres;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO anon;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.vector_sub(public.vector, public.vector) TO service_role;


--
-- TOC entry 5787 (class 0 OID 0)
-- Dependencies: 441
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;


--
-- TOC entry 5788 (class 0 OID 0)
-- Dependencies: 442
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- TOC entry 5789 (class 0 OID 0)
-- Dependencies: 443
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;


--
-- TOC entry 5790 (class 0 OID 0)
-- Dependencies: 444
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;


--
-- TOC entry 5791 (class 0 OID 0)
-- Dependencies: 445
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;


--
-- TOC entry 5792 (class 0 OID 0)
-- Dependencies: 446
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO service_role;


--
-- TOC entry 5793 (class 0 OID 0)
-- Dependencies: 447
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;


--
-- TOC entry 5794 (class 0 OID 0)
-- Dependencies: 448
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;


--
-- TOC entry 5795 (class 0 OID 0)
-- Dependencies: 449
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;


--
-- TOC entry 5796 (class 0 OID 0)
-- Dependencies: 450
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- TOC entry 5797 (class 0 OID 0)
-- Dependencies: 451
-- Name: FUNCTION send_binary(payload bytea, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO dashboard_user;


--
-- TOC entry 5798 (class 0 OID 0)
-- Dependencies: 452
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;


--
-- TOC entry 5799 (class 0 OID 0)
-- Dependencies: 453
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;


--
-- TOC entry 5800 (class 0 OID 0)
-- Dependencies: 454
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- TOC entry 5801 (class 0 OID 0)
-- Dependencies: 455
-- Name: FUNCTION wal2json_escape_identifier(name text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO postgres;
GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO dashboard_user;


--
-- TOC entry 5802 (class 0 OID 0)
-- Dependencies: 435
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- TOC entry 5803 (class 0 OID 0)
-- Dependencies: 437
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- TOC entry 5804 (class 0 OID 0)
-- Dependencies: 438
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- TOC entry 5805 (class 0 OID 0)
-- Dependencies: 1577
-- Name: FUNCTION avg(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.avg(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.avg(public.halfvec) TO service_role;


--
-- TOC entry 5806 (class 0 OID 0)
-- Dependencies: 1575
-- Name: FUNCTION avg(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.avg(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.avg(public.vector) TO anon;
GRANT ALL ON FUNCTION public.avg(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.avg(public.vector) TO service_role;


--
-- TOC entry 5807 (class 0 OID 0)
-- Dependencies: 1578
-- Name: FUNCTION sum(public.halfvec); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sum(public.halfvec) TO postgres;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO anon;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO authenticated;
GRANT ALL ON FUNCTION public.sum(public.halfvec) TO service_role;


--
-- TOC entry 5808 (class 0 OID 0)
-- Dependencies: 1576
-- Name: FUNCTION sum(public.vector); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.sum(public.vector) TO postgres;
GRANT ALL ON FUNCTION public.sum(public.vector) TO anon;
GRANT ALL ON FUNCTION public.sum(public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.sum(public.vector) TO service_role;


--
-- TOC entry 5810 (class 0 OID 0)
-- Dependencies: 269
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- TOC entry 5811 (class 0 OID 0)
-- Dependencies: 288
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- TOC entry 5813 (class 0 OID 0)
-- Dependencies: 282
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- TOC entry 5816 (class 0 OID 0)
-- Dependencies: 273
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- TOC entry 5818 (class 0 OID 0)
-- Dependencies: 268
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- TOC entry 5820 (class 0 OID 0)
-- Dependencies: 277
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- TOC entry 5822 (class 0 OID 0)
-- Dependencies: 276
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- TOC entry 5825 (class 0 OID 0)
-- Dependencies: 275
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- TOC entry 5826 (class 0 OID 0)
-- Dependencies: 285
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- TOC entry 5828 (class 0 OID 0)
-- Dependencies: 287
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- TOC entry 5829 (class 0 OID 0)
-- Dependencies: 284
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- TOC entry 5830 (class 0 OID 0)
-- Dependencies: 286
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- TOC entry 5831 (class 0 OID 0)
-- Dependencies: 283
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- TOC entry 5833 (class 0 OID 0)
-- Dependencies: 267
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- TOC entry 5835 (class 0 OID 0)
-- Dependencies: 266
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- TOC entry 5837 (class 0 OID 0)
-- Dependencies: 280
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- TOC entry 5839 (class 0 OID 0)
-- Dependencies: 281
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- TOC entry 5841 (class 0 OID 0)
-- Dependencies: 270
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- TOC entry 5846 (class 0 OID 0)
-- Dependencies: 274
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- TOC entry 5848 (class 0 OID 0)
-- Dependencies: 279
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- TOC entry 5851 (class 0 OID 0)
-- Dependencies: 278
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- TOC entry 5854 (class 0 OID 0)
-- Dependencies: 265
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- TOC entry 5855 (class 0 OID 0)
-- Dependencies: 290
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- TOC entry 5856 (class 0 OID 0)
-- Dependencies: 289
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- TOC entry 5857 (class 0 OID 0)
-- Dependencies: 264
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements TO dashboard_user;


--
-- TOC entry 5858 (class 0 OID 0)
-- Dependencies: 263
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements_info FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO dashboard_user;


--
-- TOC entry 5859 (class 0 OID 0)
-- Dependencies: 333
-- Name: TABLE account_invitations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.account_invitations TO anon;
GRANT ALL ON TABLE public.account_invitations TO authenticated;
GRANT ALL ON TABLE public.account_invitations TO service_role;


--
-- TOC entry 5860 (class 0 OID 0)
-- Dependencies: 332
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;


--
-- TOC entry 5861 (class 0 OID 0)
-- Dependencies: 338
-- Name: TABLE ai_configs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_configs TO anon;
GRANT ALL ON TABLE public.ai_configs TO authenticated;
GRANT ALL ON TABLE public.ai_configs TO service_role;


--
-- TOC entry 5862 (class 0 OID 0)
-- Dependencies: 340
-- Name: TABLE ai_knowledge_chunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_knowledge_chunks TO anon;
GRANT ALL ON TABLE public.ai_knowledge_chunks TO authenticated;
GRANT ALL ON TABLE public.ai_knowledge_chunks TO service_role;


--
-- TOC entry 5863 (class 0 OID 0)
-- Dependencies: 339
-- Name: TABLE ai_knowledge_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_knowledge_documents TO anon;
GRANT ALL ON TABLE public.ai_knowledge_documents TO authenticated;
GRANT ALL ON TABLE public.ai_knowledge_documents TO service_role;


--
-- TOC entry 5864 (class 0 OID 0)
-- Dependencies: 341
-- Name: TABLE ai_usage_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_usage_log TO anon;
GRANT ALL ON TABLE public.ai_usage_log TO authenticated;
GRANT ALL ON TABLE public.ai_usage_log TO service_role;


--
-- TOC entry 5865 (class 0 OID 0)
-- Dependencies: 335
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;


--
-- TOC entry 5866 (class 0 OID 0)
-- Dependencies: 325
-- Name: TABLE automation_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automation_logs TO anon;
GRANT ALL ON TABLE public.automation_logs TO authenticated;
GRANT ALL ON TABLE public.automation_logs TO service_role;


--
-- TOC entry 5867 (class 0 OID 0)
-- Dependencies: 326
-- Name: TABLE automation_pending_executions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automation_pending_executions TO anon;
GRANT ALL ON TABLE public.automation_pending_executions TO authenticated;
GRANT ALL ON TABLE public.automation_pending_executions TO service_role;


--
-- TOC entry 5868 (class 0 OID 0)
-- Dependencies: 324
-- Name: TABLE automation_steps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automation_steps TO anon;
GRANT ALL ON TABLE public.automation_steps TO authenticated;
GRANT ALL ON TABLE public.automation_steps TO service_role;


--
-- TOC entry 5869 (class 0 OID 0)
-- Dependencies: 323
-- Name: TABLE automations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.automations TO anon;
GRANT ALL ON TABLE public.automations TO authenticated;
GRANT ALL ON TABLE public.automations TO service_role;


--
-- TOC entry 5870 (class 0 OID 0)
-- Dependencies: 322
-- Name: TABLE broadcast_recipients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.broadcast_recipients TO anon;
GRANT ALL ON TABLE public.broadcast_recipients TO authenticated;
GRANT ALL ON TABLE public.broadcast_recipients TO service_role;


--
-- TOC entry 5871 (class 0 OID 0)
-- Dependencies: 321
-- Name: TABLE broadcasts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.broadcasts TO anon;
GRANT ALL ON TABLE public.broadcasts TO authenticated;
GRANT ALL ON TABLE public.broadcasts TO service_role;


--
-- TOC entry 5872 (class 0 OID 0)
-- Dependencies: 312
-- Name: TABLE contact_custom_values; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_custom_values TO anon;
GRANT ALL ON TABLE public.contact_custom_values TO authenticated;
GRANT ALL ON TABLE public.contact_custom_values TO service_role;


--
-- TOC entry 5873 (class 0 OID 0)
-- Dependencies: 313
-- Name: TABLE contact_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_notes TO anon;
GRANT ALL ON TABLE public.contact_notes TO authenticated;
GRANT ALL ON TABLE public.contact_notes TO service_role;


--
-- TOC entry 5874 (class 0 OID 0)
-- Dependencies: 360
-- Name: TABLE contact_page_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_page_settings TO anon;
GRANT ALL ON TABLE public.contact_page_settings TO authenticated;
GRANT ALL ON TABLE public.contact_page_settings TO service_role;


--
-- TOC entry 5875 (class 0 OID 0)
-- Dependencies: 362
-- Name: TABLE contact_replies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_replies TO anon;
GRANT ALL ON TABLE public.contact_replies TO authenticated;
GRANT ALL ON TABLE public.contact_replies TO service_role;


--
-- TOC entry 5876 (class 0 OID 0)
-- Dependencies: 361
-- Name: TABLE contact_submissions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_submissions TO anon;
GRANT ALL ON TABLE public.contact_submissions TO authenticated;
GRANT ALL ON TABLE public.contact_submissions TO service_role;


--
-- TOC entry 5877 (class 0 OID 0)
-- Dependencies: 310
-- Name: TABLE contact_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contact_tags TO anon;
GRANT ALL ON TABLE public.contact_tags TO authenticated;
GRANT ALL ON TABLE public.contact_tags TO service_role;


--
-- TOC entry 5878 (class 0 OID 0)
-- Dependencies: 314
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conversations TO anon;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;


--
-- TOC entry 5879 (class 0 OID 0)
-- Dependencies: 311
-- Name: TABLE custom_fields; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.custom_fields TO anon;
GRANT ALL ON TABLE public.custom_fields TO authenticated;
GRANT ALL ON TABLE public.custom_fields TO service_role;


--
-- TOC entry 5880 (class 0 OID 0)
-- Dependencies: 320
-- Name: TABLE deals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deals TO anon;
GRANT ALL ON TABLE public.deals TO authenticated;
GRANT ALL ON TABLE public.deals TO service_role;


--
-- TOC entry 5881 (class 0 OID 0)
-- Dependencies: 329
-- Name: TABLE flow_nodes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flow_nodes TO anon;
GRANT ALL ON TABLE public.flow_nodes TO authenticated;
GRANT ALL ON TABLE public.flow_nodes TO service_role;


--
-- TOC entry 5882 (class 0 OID 0)
-- Dependencies: 331
-- Name: TABLE flow_run_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flow_run_events TO anon;
GRANT ALL ON TABLE public.flow_run_events TO authenticated;
GRANT ALL ON TABLE public.flow_run_events TO service_role;


--
-- TOC entry 5883 (class 0 OID 0)
-- Dependencies: 330
-- Name: TABLE flow_runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flow_runs TO anon;
GRANT ALL ON TABLE public.flow_runs TO authenticated;
GRANT ALL ON TABLE public.flow_runs TO service_role;


--
-- TOC entry 5884 (class 0 OID 0)
-- Dependencies: 328
-- Name: TABLE flows; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flows TO anon;
GRANT ALL ON TABLE public.flows TO authenticated;
GRANT ALL ON TABLE public.flows TO service_role;


--
-- TOC entry 5885 (class 0 OID 0)
-- Dependencies: 353
-- Name: TABLE landing_faqs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_faqs TO anon;
GRANT ALL ON TABLE public.landing_faqs TO authenticated;
GRANT ALL ON TABLE public.landing_faqs TO service_role;


--
-- TOC entry 5886 (class 0 OID 0)
-- Dependencies: 345
-- Name: TABLE landing_features; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_features TO anon;
GRANT ALL ON TABLE public.landing_features TO authenticated;
GRANT ALL ON TABLE public.landing_features TO service_role;


--
-- TOC entry 5887 (class 0 OID 0)
-- Dependencies: 350
-- Name: TABLE landing_images; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_images TO anon;
GRANT ALL ON TABLE public.landing_images TO authenticated;
GRANT ALL ON TABLE public.landing_images TO service_role;


--
-- TOC entry 5888 (class 0 OID 0)
-- Dependencies: 348
-- Name: TABLE landing_integrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_integrations TO anon;
GRANT ALL ON TABLE public.landing_integrations TO authenticated;
GRANT ALL ON TABLE public.landing_integrations TO service_role;


--
-- TOC entry 5889 (class 0 OID 0)
-- Dependencies: 347
-- Name: TABLE landing_pricing_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_pricing_tiers TO anon;
GRANT ALL ON TABLE public.landing_pricing_tiers TO authenticated;
GRANT ALL ON TABLE public.landing_pricing_tiers TO service_role;


--
-- TOC entry 5890 (class 0 OID 0)
-- Dependencies: 344
-- Name: TABLE landing_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_sections TO anon;
GRANT ALL ON TABLE public.landing_sections TO authenticated;
GRANT ALL ON TABLE public.landing_sections TO service_role;


--
-- TOC entry 5891 (class 0 OID 0)
-- Dependencies: 346
-- Name: TABLE landing_testimonials; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.landing_testimonials TO anon;
GRANT ALL ON TABLE public.landing_testimonials TO authenticated;
GRANT ALL ON TABLE public.landing_testimonials TO service_role;


--
-- TOC entry 5892 (class 0 OID 0)
-- Dependencies: 349
-- Name: TABLE legal_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.legal_pages TO anon;
GRANT ALL ON TABLE public.legal_pages TO authenticated;
GRANT ALL ON TABLE public.legal_pages TO service_role;


--
-- TOC entry 5893 (class 0 OID 0)
-- Dependencies: 334
-- Name: TABLE member_presence; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.member_presence TO anon;
GRANT ALL ON TABLE public.member_presence TO authenticated;
GRANT ALL ON TABLE public.member_presence TO service_role;


--
-- TOC entry 5894 (class 0 OID 0)
-- Dependencies: 327
-- Name: TABLE message_reactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.message_reactions TO anon;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;


--
-- TOC entry 5895 (class 0 OID 0)
-- Dependencies: 317
-- Name: TABLE message_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.message_templates TO anon;
GRANT ALL ON TABLE public.message_templates TO authenticated;
GRANT ALL ON TABLE public.message_templates TO service_role;


--
-- TOC entry 5896 (class 0 OID 0)
-- Dependencies: 315
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- TOC entry 5897 (class 0 OID 0)
-- Dependencies: 336
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- TOC entry 5898 (class 0 OID 0)
-- Dependencies: 336 5897
-- Name: COLUMN notifications.read_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;


--
-- TOC entry 5899 (class 0 OID 0)
-- Dependencies: 319
-- Name: TABLE pipeline_stages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipeline_stages TO anon;
GRANT ALL ON TABLE public.pipeline_stages TO authenticated;
GRANT ALL ON TABLE public.pipeline_stages TO service_role;


--
-- TOC entry 5900 (class 0 OID 0)
-- Dependencies: 318
-- Name: TABLE pipelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipelines TO anon;
GRANT ALL ON TABLE public.pipelines TO authenticated;
GRANT ALL ON TABLE public.pipelines TO service_role;


--
-- TOC entry 5901 (class 0 OID 0)
-- Dependencies: 307
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- TOC entry 5902 (class 0 OID 0)
-- Dependencies: 342
-- Name: TABLE quick_replies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.quick_replies TO anon;
GRANT ALL ON TABLE public.quick_replies TO authenticated;
GRANT ALL ON TABLE public.quick_replies TO service_role;


--
-- TOC entry 5903 (class 0 OID 0)
-- Dependencies: 343
-- Name: TABLE site_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.site_settings TO anon;
GRANT ALL ON TABLE public.site_settings TO authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;


--
-- TOC entry 5904 (class 0 OID 0)
-- Dependencies: 309
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tags TO anon;
GRANT ALL ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;


--
-- TOC entry 5905 (class 0 OID 0)
-- Dependencies: 316
-- Name: TABLE whatsapp_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_config TO anon;
GRANT ALL ON TABLE public.whatsapp_config TO authenticated;
GRANT ALL ON TABLE public.whatsapp_config TO service_role;


--
-- TOC entry 5906 (class 0 OID 0)
-- Dependencies: 351
-- Name: TABLE v_platform_accounts_summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_platform_accounts_summary TO anon;
GRANT ALL ON TABLE public.v_platform_accounts_summary TO authenticated;
GRANT ALL ON TABLE public.v_platform_accounts_summary TO service_role;


--
-- TOC entry 5907 (class 0 OID 0)
-- Dependencies: 337
-- Name: TABLE webhook_endpoints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.webhook_endpoints TO anon;
GRANT ALL ON TABLE public.webhook_endpoints TO authenticated;
GRANT ALL ON TABLE public.webhook_endpoints TO service_role;


--
-- TOC entry 5908 (class 0 OID 0)
-- Dependencies: 294
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- TOC entry 5909 (class 0 OID 0)
-- Dependencies: 352
-- Name: TABLE messages_2026_08_02; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_02 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_02 TO dashboard_user;


--
-- TOC entry 5910 (class 0 OID 0)
-- Dependencies: 354
-- Name: TABLE messages_2026_08_03; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_03 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_03 TO dashboard_user;


--
-- TOC entry 5911 (class 0 OID 0)
-- Dependencies: 355
-- Name: TABLE messages_2026_08_04; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_04 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_04 TO dashboard_user;


--
-- TOC entry 5912 (class 0 OID 0)
-- Dependencies: 356
-- Name: TABLE messages_2026_08_05; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_05 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_05 TO dashboard_user;


--
-- TOC entry 5913 (class 0 OID 0)
-- Dependencies: 357
-- Name: TABLE messages_2026_08_06; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_06 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_06 TO dashboard_user;


--
-- TOC entry 5914 (class 0 OID 0)
-- Dependencies: 358
-- Name: TABLE messages_2026_08_07; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_07 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_07 TO dashboard_user;


--
-- TOC entry 5915 (class 0 OID 0)
-- Dependencies: 359
-- Name: TABLE messages_2026_08_08; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_08_08 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_08_08 TO dashboard_user;


--
-- TOC entry 5916 (class 0 OID 0)
-- Dependencies: 295
-- Name: TABLE schema_migrations; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.schema_migrations TO postgres;
GRANT ALL ON TABLE realtime.schema_migrations TO dashboard_user;


--
-- TOC entry 5917 (class 0 OID 0)
-- Dependencies: 296
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;


--
-- TOC entry 5918 (class 0 OID 0)
-- Dependencies: 297
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;


--
-- TOC entry 5920 (class 0 OID 0)
-- Dependencies: 299
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.buckets FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- TOC entry 5921 (class 0 OID 0)
-- Dependencies: 303
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- TOC entry 5922 (class 0 OID 0)
-- Dependencies: 304
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;


--
-- TOC entry 5924 (class 0 OID 0)
-- Dependencies: 300
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.objects FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- TOC entry 5925 (class 0 OID 0)
-- Dependencies: 301
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- TOC entry 5926 (class 0 OID 0)
-- Dependencies: 302
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- TOC entry 5927 (class 0 OID 0)
-- Dependencies: 305
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;


--
-- TOC entry 5928 (class 0 OID 0)
-- Dependencies: 271
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- TOC entry 5929 (class 0 OID 0)
-- Dependencies: 272
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- TOC entry 2872 (class 826 OID 16557)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- TOC entry 2873 (class 826 OID 16558)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- TOC entry 2871 (class 826 OID 16556)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- TOC entry 2879 (class 826 OID 16636)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- TOC entry 2878 (class 826 OID 16635)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- TOC entry 2877 (class 826 OID 16634)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- TOC entry 2882 (class 826 OID 16591)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2881 (class 826 OID 16590)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2880 (class 826 OID 16589)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2874 (class 826 OID 16571)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2876 (class 826 OID 16570)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2875 (class 826 OID 16569)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2864 (class 826 OID 16494)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2865 (class 826 OID 16495)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2863 (class 826 OID 16493)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2867 (class 826 OID 16497)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2862 (class 826 OID 16492)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2866 (class 826 OID 16496)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2883 (class 826 OID 16561)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- TOC entry 2884 (class 826 OID 16562)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- TOC entry 2885 (class 826 OID 16560)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- TOC entry 2870 (class 826 OID 16550)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2869 (class 826 OID 16549)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2868 (class 826 OID 16548)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 4121 (class 3466 OID 16575)
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- TOC entry 4124 (class 3466 OID 16654)
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- TOC entry 4126 (class 3466 OID 16666)
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- TOC entry 4125 (class 3466 OID 16657)
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

--
-- TOC entry 4122 (class 3466 OID 16576)
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- TOC entry 4123 (class 3466 OID 16577)
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

-- Completed on 2026-08-05 18:42:07

--
-- PostgreSQL database dump complete
--

\unrestrict S6IwNCV2OHEWuEbepwiAnzcY13lguelQoXBnzausmwNqWgY6IKJMFT0qjwr6dfl

