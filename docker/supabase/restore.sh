#!/bin/sh
# ============================================================
# Restores a PRODUCTION pg_dump into the local stack.
#
# ─── Why this exists ────────────────────────────────────────
#
# The migrate path (migrate.sh) builds the schema from
# supabase/migrations/*.sql and gives you an EMPTY database. That is the
# right thing for a from-scratch install, but it means:
#
#   - you cannot log in with a production account, because the row lives
#     in production's auth.users and there is nothing local to match;
#   - the landing page renders grey placeholder blocks, because every
#     image URL on it comes from CMS tables (site_settings.logo_url,
#     landing_sections.images, landing_integrations, ...) and those
#     tables are empty. Nothing is wrong with S3 in that state — the app
#     simply has no URLs to render.
#
# This script loads a real dump instead, so local is a faithful copy.
#
# ─── Which flow runs ────────────────────────────────────────
#
# Whichever is applicable, decided automatically:
#   dump file present -> restore.sh loads it, migrate.sh skips
#   no dump           -> restore.sh exits, migrate.sh applies migrations
#
# ─── Ordering constraint ────────────────────────────────────
#
# This MUST run before GoTrue starts. GoTrue creates auth.users itself on
# first boot; if it wins the race, the dump's `CREATE TABLE auth.users`
# collides and the restore aborts half-applied. The compose file gates
# `auth` on this container exiting 0.
# ============================================================
set -eu

: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

DUMP_DIR=/backups
WORK=/tmp/restore.sql

psql_q() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
       -v ON_ERROR_STOP=1 -qtAX "$@"
}

# ------------------------------------------------------------
# 1. Pick the dump: RESTORE_FILE if set, else newest *-plain.sql.
#
# Only plain SQL is supported, deliberately. The custom-format .backup
# beside it was produced by pg_dump 18, and pg_restore refuses archives
# written by a newer major version — restoring it would pin this container
# to an 18.x client for no benefit, since the plain file carries exactly
# the same content in a form we can also preprocess.
# ------------------------------------------------------------
if [ -n "${RESTORE_FILE:-}" ]; then
  DUMP="$DUMP_DIR/$RESTORE_FILE"
else
  DUMP=$(ls -1t "$DUMP_DIR"/*-plain.sql 2>/dev/null | head -n 1 || true)
fi

if [ -z "${DUMP:-}" ] || [ ! -f "$DUMP" ]; then
  echo "[restore] no *-plain.sql found in $DUMP_DIR — skipping."
  echo "[restore] migrate.sh will build the schema from migrations instead."
  exit 0
fi

echo "[restore] waiting for postgres..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
  sleep 1
done

# The bootstrap init script runs to completion before Postgres accepts
# outside connections, so if `authenticator` exists the roles are all in.
until [ "$(psql_q -c "SELECT 1 FROM pg_roles WHERE rolname='authenticator'")" = "1" ]; do
  sleep 1
done
echo "[restore] postgres ready"

# ------------------------------------------------------------
# 2. Idempotence guard.
#
# supabase_migrations.schema_migrations only exists in a dump taken from a
# real Supabase project — nothing in this repo's own migrations creates
# it. Its presence is therefore a reliable "this database is already a
# restored copy of production" marker, and re-running the whole restore
# over live data would be destructive.
# ------------------------------------------------------------
if [ "$(psql_q -c "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL")" = "t" ]; then
  echo "[restore] already restored (supabase_migrations.schema_migrations present) — nothing to do."
  exit 0
fi

echo "[restore] restoring $(basename "$DUMP") ($(wc -c < "$DUMP") bytes)"

# ------------------------------------------------------------
# 3. Remove the few objects 01-bootstrap.sql creates that the dump also
#    creates outright (no IF NOT EXISTS), so they would collide.
#
# Everything else in the bootstrap is either idempotent or something the
# dump does not touch. Being explicit here rather than dropping schemas
# wholesale keeps the roles, the `_realtime` schema and the extensions in
# place — Realtime needs `_realtime`, and the dump's
# `CREATE EXTENSION IF NOT EXISTS` lines no-op against the extensions the
# bootstrap already installed in the same schemas (verified: uuid-ossp and
# pgcrypto in `extensions`, vector in `public`, matching the dump).
# ------------------------------------------------------------
echo "[restore] clearing bootstrap placeholders"
psql_q <<'SQL'
-- Bootstrap creates this empty so the app's migrations have something to
-- ALTER; the dump issues a bare CREATE PUBLICATION.
DROP PUBLICATION IF EXISTS supabase_realtime;
DROP PUBLICATION IF EXISTS supabase_realtime_messages_publication;

-- Bootstrap ships a 2-table `storage` stub (buckets, objects) purely so
-- migration 008 can reference it. The dump brings the real 8-table schema.
DROP SCHEMA IF EXISTS storage CASCADE;

-- Empty at this point: Realtime's tenant migrations have not run because
-- no client has connected yet. The dump brings production's version,
-- including realtime.subscription and the realtime.messages partitions.
DROP SCHEMA IF EXISTS realtime CASCADE;
SQL

# ------------------------------------------------------------
# 4. Preprocess.
#
# Two edits, both required, both mechanical:
#
#   \restrict / \unrestrict
#       psql 18 meta-commands wrapping the file (pg_dump 18 emits them to
#       stop a hostile dump running commands on an older client). psql 17
#       does not know them and errors out on line 5.
#
#   CREATE SCHEMA x;  ->  CREATE SCHEMA IF NOT EXISTS x;
#       The bootstrap already created auth, extensions and public. Without
#       this the restore dies on the first one.
#
# Everything else is left byte-identical, including `SET
# transaction_timeout` — that is a PG17 setting and the local server is
# now PG17, matching production.
# ------------------------------------------------------------
echo "[restore] preprocessing"
sed -e '/^\\restrict /d' \
    -e '/^\\unrestrict /d' \
    -e 's/^CREATE SCHEMA \([A-Za-z_][A-Za-z0-9_]*\);/CREATE SCHEMA IF NOT EXISTS \1;/' \
    "$DUMP" > "$WORK"

echo "[restore] applying (this takes a minute — ~30k rows)"
# ON_ERROR_STOP=1: a partially restored database is worse than a failed
# one, because the app half-works and the gaps surface later as missing
# rows rather than as an error here.
if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      -v ON_ERROR_STOP=1 -qX -f "$WORK"; then
  echo "[restore] ERROR: restore failed. The database is partially loaded." >&2
  echo "[restore] Start clean before retrying:" >&2
  echo "[restore]   docker compose --env-file .env.docker.local -f docker-compose.local.yml down -v" >&2
  exit 1
fi

# ------------------------------------------------------------
# 5. Post-restore fixups.
#
# NOTE what is deliberately NOT here: the auth.uid()/role()/jwt()/email()
# shims that migrate.sh installs. Production's own auth.uid() already
# coalesces the legacy per-claim GUC with the modern JSON blob (checked in
# the dump), so it works as-is under PGRST_DB_USE_LEGACY_GUCS=false.
# Replacing it would be churn that makes local differ from prod.
# ------------------------------------------------------------
echo "[restore] post-restore fixups"
psql_q <<'SQL'
-- Realtime's own bookkeeping schema. Not in the dump (it is per-install,
-- not per-project) and DROP SCHEMA realtime CASCADE above cannot have
-- touched it, but assert it so a restore onto an odd volume still boots.
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

-- The local-only login role. The dump has no idea it exists, and the
-- grants it needs are against tables the dump just created.
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public, extensions, auth, realtime TO anon, authenticated, service_role;
SQL

# REPLICA IDENTITY FULL, re-asserted. pg_dump preserves replica identity,
# but this is cheap and it is the setting whose absence silently breaks
# DELETE payloads on message_reactions and the filtered presence channels.
psql_q -c "
DO \$\$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','messages','message_reactions',
                           'flow_runs','member_presence','notifications'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END
\$\$;
"

# PostgREST caches the schema once at startup and 404s anything it did not
# see. It is gated on this container in compose, so this is belt-and-braces
# for a re-run.
psql_q -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

psql_q -c "SELECT '[restore] users=' || (SELECT count(*) FROM auth.users)
                 || ' accounts='     || (SELECT count(*) FROM public.accounts)
                 || ' profiles='     || (SELECT count(*) FROM public.profiles)
                 || ' contacts='     || (SELECT count(*) FROM public.contacts)
                 || ' messages='     || (SELECT count(*) FROM public.messages);"
psql_q -c "SELECT '[restore] published: ' || string_agg(tablename, ', ' ORDER BY tablename)
           FROM pg_publication_tables WHERE pubname = 'supabase_realtime';"
echo "[restore] complete"
