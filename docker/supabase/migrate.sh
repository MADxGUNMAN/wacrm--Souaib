#!/bin/sh
# ============================================================
# Applies supabase/migrations/*.sql to the local Postgres, once.
#
# ─── Why this is a separate one-shot service, not an initdb script ───
#
# Postgres runs /docker-entrypoint-initdb.d/* before it accepts outside
# connections — so before GoTrue has ever started. But this app's very
# first migration (001_initial_schema.sql) has
# `REFERENCES auth.users(id)`, and there are 46 such foreign keys plus a
# trigger `AFTER INSERT ON auth.users`. `auth.users` is created by
# GoTrue's own migrations at ITS startup.
#
# So the order has to be:
#   1. Postgres init  -> roles, schemas, extensions, auth.uid()
#   2. GoTrue boots   -> creates auth.users
#   3. THIS script    -> the app's 86 migrations
#
# An initdb script cannot express step 3, which is why this exists.
#
# Idempotent: a marker table records which files have been applied, so
# `docker compose up` on an existing volume is a no-op rather than a
# stack of "already exists" errors.
# ============================================================
set -eu

: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

psql_q() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
       -v ON_ERROR_STOP=1 -qtAX "$@"
}

echo "[migrate] waiting for postgres..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
  sleep 1
done
echo "[migrate] postgres is up"

# Is this a restored copy of production, or a database this script built?
# supabase_migrations.schema_migrations is Supabase's own migration ledger:
# it appears only in a dump taken from a real project, and nothing in this
# repo creates it. Decided up front because it changes two things below —
# whether the auth helpers get replaced, and whether the 89 files run.
restored=$(psql_q -c "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL")

# GoTrue creates auth.users on its first boot. Wait for the TABLE, not
# just the container — a healthy container can still be mid-migration,
# and starting ours early fails on the first foreign key.
echo "[migrate] waiting for GoTrue to create auth.users..."
i=0
until [ "$(psql_q -c "SELECT to_regclass('auth.users') IS NOT NULL")" = "t" ]; do
  i=$((i + 1))
  if [ "$i" -gt 120 ]; then
    echo "[migrate] ERROR: auth.users never appeared after 120s." >&2
    echo "[migrate] Check the 'auth' container logs — GoTrue probably failed to migrate." >&2
    exit 1
  fi
  sleep 1
done
echo "[migrate] auth.users exists"

# ------------------------------------------------------------
# auth.uid() / auth.role() / auth.jwt() / auth.email()
#
# Installed HERE, not in the initdb bootstrap, and this ordering is
# load-bearing twice over.
#
# 1. OWNERSHIP. GoTrue's own migration runs
#    `create or replace function auth.uid()`. Creating it first from the
#    initdb script (which runs as supabase_admin) made GoTrue fail with
#    "must be owner of function uid" and crash-loop forever. Letting
#    GoTrue create it first, then replacing it from here as `postgres`
#    (a superuser, which bypasses the ownership check) avoids that.
#
# 2. CORRECTNESS. GoTrue's auth.uid() reads ONLY the legacy per-claim
#    GUC `request.jwt.claim.sub`. Modern PostgREST with
#    PGRST_DB_USE_LEGACY_GUCS=false sets ONLY the JSON blob
#    `request.jwt.claims`. Left as GoTrue wrote it, auth.uid() would
#    return NULL on every request — and since 104 of the app's 120 RLS
#    policies funnel through is_account_member() -> auth.uid(), every
#    table would silently read as empty. The versions below coalesce
#    across both GUC styles so they work either way.
# ------------------------------------------------------------
#
# SKIPPED ON A RESTORED DATABASE. Production's own auth.uid() already
# coalesces the legacy per-claim GUC with the modern JSON blob (verified
# in the dump), so it is correct under PGRST_DB_USE_LEGACY_GUCS=false.
# Overwriting prod's definitions with our own would make local diverge
# from prod for no gain — and these functions sit under 104 RLS policies,
# which is not a place to introduce a gratuitous difference.
if [ "$restored" = "t" ]; then
  echo "[migrate] restored database — keeping production's auth.uid()/role()/jwt()/email()"
else
echo "[migrate] installing auth.uid()/role()/jwt()/email()"
psql_q <<'SQL'
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fn$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$fn$;

GRANT EXECUTE ON FUNCTION auth.jwt()   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid()   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated, service_role;
SQL
fi

# Ledger of applied files.
psql_q -c "
  CREATE TABLE IF NOT EXISTS public._local_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
"

# ------------------------------------------------------------
# Stand down if this database is a RESTORED COPY OF PRODUCTION.
#
# restore.sh may have loaded a production pg_dump before this ran, in
# which case the schema is already at prod state and applying the 89
# files on top is wrong, not merely redundant: they would run against
# tables that already hold real data. Several are only conditionally
# idempotent, and 038's `ALTER TYPE ... ADD VALUE` plus 082's REVOKEs
# would fight the restored definitions.
#
# The files are recorded as applied rather than left unrecorded, so a
# later `docker compose up` does not mistake this for a fresh database and
# try again. Everything below the loop (realtime publication, replica
# identity, schema-cache reload) still runs — it is all re-assertion and
# is correct either way.
# ------------------------------------------------------------
if [ "$restored" = "t" ]; then
  echo "[migrate] database is a restored production copy — NOT applying migrations."
  for f in $(find /migrations -maxdepth 1 -name '*.sql' | sort); do
    psql_q -c "INSERT INTO public._local_migrations (filename) VALUES ('$(basename "$f")')
               ON CONFLICT (filename) DO NOTHING;"
  done
  echo "[migrate] recorded $(ls -1 /migrations/*.sql | wc -l) migration files as already present"
fi

applied=0
skipped=0

# Sort order is the deployment order. The numeric prefixes (001..082)
# sort before the one timestamped file (20260811000000_...), which is
# also the order they were written in, so plain `sort` is correct here.
for f in $(find /migrations -maxdepth 1 -name '*.sql' | sort); do
  base=$(basename "$f")

  already=$(psql_q -c "SELECT 1 FROM public._local_migrations WHERE filename = '$base'")
  if [ "$already" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "[migrate] applying $base"
  # Autocommit per statement — NOT --single-transaction.
  #
  # This started as --single-transaction (a failure then leaves the DB at
  # the last good migration rather than half-applying one) and that broke
  # 038_role_simplification.sql:
  #
  #   ERROR: unsafe use of new value "member" of enum type account_role_enum
  #
  # Postgres refuses to USE an enum value in the same transaction that
  # ADDed it. The migration does `ALTER TYPE ... ADD VALUE 'member'` and
  # then references 'member' further down, which is only legal once the
  # ADD has committed. Hosted Supabase applies migrations statement-by-
  # statement, which is why this file has always worked in production and
  # only failed here.
  #
  # ON_ERROR_STOP=1 still halts at the first failing statement, so a
  # broken migration does not cascade. The trade-off is that a mid-file
  # failure leaves that file partially applied — acceptable because these
  # 86 files are already proven against production, and because almost
  # all of them are written idempotently (IF NOT EXISTS / DROP IF EXISTS)
  # so a re-run recovers. For a clean slate: `down -v` then up again.
  if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        -v ON_ERROR_STOP=1 -qX -f "$f"; then
    echo "[migrate] ERROR: $base failed (partially applied — see note in migrate.sh)." >&2
    exit 1
  fi

  psql_q -c "INSERT INTO public._local_migrations (filename) VALUES ('$base');"
  applied=$((applied + 1))
done

echo "[migrate] done — $applied applied, $skipped already present"

# ------------------------------------------------------------
# Realtime: REPLICA IDENTITY, and a membership safety net.
#
# Publication MEMBERSHIP is already handled by the app's own migrations
# (001 messages+conversations, 009 message_reactions, 010 flow_runs,
# 024 member_presence, 027 notifications) — the empty publication is
# created in 01-bootstrap.sql so those ALTERs have something to target.
# The loop below re-asserts them anyway, so a future table added to a
# channel without a migration still works.
#
# REPLICA IDENTITY FULL is the part nothing else does, and it is not
# optional: message-thread.tsx handles DELETE on message_reactions and
# reads the OLD row, and the presence + reactions channels use
# server-side filters (`account_id=eq.`, `conversation_id=eq.`). With the
# default replica identity Postgres ships only the primary key on DELETE,
# so the filter cannot match and a removed reaction never disappears from
# the UI.
# ------------------------------------------------------------
echo "[migrate] configuring realtime publication + replica identity"
psql_q -c "
DO \$\$
DECLARE
  t text;
  tables text[] := ARRAY[
    'conversations',
    'messages',
    'message_reactions',
    'flow_runs',
    'member_presence',
    'notifications'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'realtime: table public.% not found, skipping', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END
\$\$;
"

echo "[migrate] realtime publication ready"
psql_q -c "SELECT '[migrate] published: ' || string_agg(tablename, ', ' ORDER BY tablename)
           FROM pg_publication_tables WHERE pubname = 'supabase_realtime';"

# ------------------------------------------------------------
# Tell PostgREST to rebuild its schema cache.
#
# PostgREST introspects the schema ONCE at startup and serves 404 for
# anything it did not see. The compose file makes `rest` wait for this
# job, so on a normal `up` the cache is already correct — but if you add
# a migration and re-run just this service, `rest` is not restarted and
# would keep 404-ing the new tables. This NOTIFY covers that case.
# Harmless when nothing is listening.
# ------------------------------------------------------------
psql_q -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true
echo "[migrate] complete"
