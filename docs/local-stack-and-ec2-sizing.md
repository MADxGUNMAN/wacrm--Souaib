# The self-hosted stack: what runs, what it costs to run, and how to move it to EC2

**Measured 24 Aug 2026** against the working local stack in
`docker-compose.local.yml`, restored from the production dump
`supabase/Production db backups/24-08-plain.sql`. Every number here came from
`docker stats`, a SQL query, or a `docker manifest inspect` — not an estimate.
Where something is an estimate, it says so.

This document is about **the stack that now exists**. For the strategic
question of whether to self-host Supabase at all versus rewriting onto
AWS-native services, see [`supabase-to-aws-migration.md`](./supabase-to-aws-migration.md)
— that document's Path A is what this one implements.

> **Correction to that document's §2.** It recorded 24 MB / 6 users / 53
> contacts / 32 messages as of 21 Aug. The current dump is **27 MB / 8 users /
> 7 accounts / 9,292 contacts / 7,260 messages**, and the migration count is
> **89**, not 84. The contact count grew ~175× in three days (a coexistence
> import). The "the data is tiny, migrate now" argument still holds, but it is
> weakening faster than that document assumed.
>
> Its code counts have drifted only slightly and remain sound: 837 `.from()`
> calls in 210 files today versus 843 in 223 then.

---

## 1. What is actually running

Six services. Not the thirteen in Supabase's official self-host compose — the
seven that were dropped are listed in §1.2 with the reason each one went.

| Service    | Image                          | Job in plain words                                           | Port  |
| ---------- | ------------------------------ | ------------------------------------------------------------ | ----- |
| `db`       | `supabase/postgres:17.6.1.165` | The database. Every row lives here.                          | 54322 |
| `auth`     | `supabase/gotrue:v2.196.0`     | Login, logout, password reset, "who is this person"          | —     |
| `rest`     | `postgrest/postgrest:v12.2.3`  | Turns `.from('contacts').select()` into real SQL             | —     |
| `realtime` | `supabase/realtime:v2.129.9`   | Pushes "a new message arrived" to the browser                | —     |
| `kong`     | `kong:2.8.1`                   | One URL in front of the three above                          | 54321 |
| `app`      | built from `Dockerfile`        | The Next.js app itself, including the WhatsApp webhook route | 3000  |

Plus two one-shot containers that run, do a job, and exit:

| Service   | When it runs                        | What it does                                               |
| --------- | ----------------------------------- | ---------------------------------------------------------- |
| `restore` | Before `auth`, if a dump is present | Loads the production dump                                  |
| `migrate` | After `auth`, always                | Applies the 89 migrations — **or stands down** if restored |

And two behind `--profile studio`, off by default: `meta` + `studio` (the
visual table browser).

### 1.1 How they fit together

```
                        browser  /  Meta webhook
                                │
                    ┌───────────┴────────────┐
                    │                        │
            localhost:3000            localhost:54321
                    │                        │
            ┌───────▼────────┐      ┌────────▼────────┐
            │  app (Next.js) │      │   kong (gateway)│
            │  webhook lives │      └────┬───┬───┬────┘
            │  here          │           │   │   │
            └───────┬────────┘   /auth/v1│   │   │/realtime/v1
                    │                    │   │   │
                    │            ┌───────▼┐ ┌▼──────┐ ┌▼─────────┐
                    │            │  auth  │ │ rest  │ │ realtime │
                    │            └───┬────┘ └───┬───┘ └────┬─────┘
                    │                │          │          │
                    └────────────────┴──────────┴──────────┘
                                       │
                                 ┌─────▼─────┐
                                 │    db     │
                                 └───────────┘
```

Two non-obvious wiring details, both load-bearing:

- **`app` shares Kong's network namespace** (`network_mode: service:kong`).
  Every Supabase client in `src/` — browser _and_ server, 11 call sites —
  reads the same `NEXT_PUBLIC_SUPABASE_URL`, and Next.js inlines
  `NEXT_PUBLIC_*` at build time into both bundles. One string therefore has to
  resolve from the browser on the host _and_ from inside a container.
  `http://kong:54321` fails in the browser; `http://localhost:54321` fails in a
  normal container; a docker alias cannot fix it because `/etc/hosts` pins
  `localhost` first. Sharing the namespace makes `localhost:54321` mean Kong
  for both. Zero application code changed.
- **Realtime is reached via the alias `realtime-dev.replai-realtime`.**
  Realtime is multi-tenant and reads the tenant id from the _first label of the
  Host header_. With `Host: kong` there is no matching tenant and every
  websocket upgrade returns a bare `403`.

### 1.2 What was deliberately left out, and why

| Not running            | Why                                                                    |
| ---------------------- | ---------------------------------------------------------------------- |
| `storage-api`          | Grepped `supabase.storage` → **0 call sites**. S3 replaced it already. |
| `imgproxy`             | Only exists to serve `storage-api` transforms.                         |
| `edge-runtime`         | No `supabase/functions` directory. Nothing deployed.                   |
| `analytics` (Logflare) | Telemetry. Wants its own BigQuery/Postgres backend.                    |
| `vector`               | Log shipper for `analytics`.                                           |
| `inbucket`             | Fake SMTP inbox. The app sends via its own real SMTP.                  |
| `supavisor`            | Connection pooler. Irrelevant for one app instance.                    |

That is **seven containers** not started. On a memory-constrained box this is
the single biggest lever, and it costs nothing because none of them serve a
code path this app uses.

---

## 2. Measured resource usage

`docker stats`, steady state, restored production data (27 MB DB), no traffic:

| Service    | Memory        | CPU idle  |
| ---------- | ------------- | --------- |
| `realtime` | **227 MiB**   | 0.16 %    |
| `kong`     | **178 MiB**   | 0.11 %    |
| `db`       | **155 MiB**   | 0.1–3 %   |
| `app`      | **61 MiB**    | 0.00 %    |
| `rest`     | **46 MiB**    | 0.12 %    |
| `auth`     | **11 MiB**    | 0.02 %    |
| **Total**  | **≈ 677 MiB** | **< 1 %** |

### 2.1 The Kong finding — read this before sizing anything

Kong originally measured **960 MiB**, more than the other five services
combined. Cause: Kong defaults to `nginx_worker_processes = auto`, meaning
**one nginx worker per host CPU**, and each worker reserves the `64 × 160k`
proxy buffers this config sets. On a 12-core machine that is 12 workers at
~87 MiB each.

Fixed by pinning `KONG_NGINX_WORKER_PROCESSES: 2` in the compose file:
**960 MiB → 178 MiB**, verified, with the landing page, REST reads and a live
`postgres_changes` event all still passing.

Why this matters more on EC2 than locally: without the cap, **memory use
silently changes with instance size**. Size a box on numbers measured on a
2-vCPU instance, then upgrade to 8 vCPU for CPU headroom, and Kong quietly
takes another ~500 MB. That is a nasty way to meet the OOM killer.

### 2.2 Disk

| Item                   | Size   |
| ---------------------- | ------ |
| Database (`postgres`)  | 27 MB  |
| Docker volume          | 78 MB  |
| Container images (all) | 7.1 GB |

**The images are the disk cost, not the data.** A t4g.micro's default 8 GB
root volume will not comfortably hold 7 GB of images plus the OS. Budget
**30 GB gp3** minimum.

---

## 3. EC2 sizing

### 3.1 Everything on one EC2 box (app + all six services)

Graviton works — **all six images publish `arm64`**, verified via
`docker manifest inspect`:

```
supabase/postgres:17.6.1.165  -> amd64, arm64
supabase/gotrue:v2.196.0      -> amd64, arm64
postgrest/postgrest:v12.2.3   -> amd64, arm64
supabase/realtime:v2.129.9    -> amd64, arm64
kong:2.8.1                    -> amd64, arm64
postgres:17-alpine            -> amd64, arm64 (+ others)
```

So the cheaper `t4g` family is available rather than being forced onto `t3`.

| Instance              | vCPU | RAM  | ~$/mo (us-east-1) | Verdict                                                                                                                                                     |
| --------------------- | ---- | ---- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t4g.micro` (current) | 2    | 1 GB | ~$6               | **No.** 677 MB of services + ~200 MB OS leaves nothing. The 100 MB-upload OOM incident in `AGENTS.md` happened on this box with _only_ the app running.     |
| `t4g.small`           | 2    | 2 GB | ~$12              | **Possible, no margin.** Works only if you cap Kong workers, never build on the box, and accept that one traffic spike or one `VACUUM` is the whole margin. |
| `t4g.medium`          | 2    | 4 GB | ~$24.50           | **Recommended minimum.** ~677 MB services + OS leaves ~3 GB for page cache, Postgres growth and spikes.                                                     |
| `t4g.large`           | 2    | 8 GB | ~$49              | **Comfortable.** Room to build on the box, run the cron work, and grow the DB an order of magnitude.                                                        |

**Recommendation: `t4g.medium`, with a hard rule that you do not build the
Docker image on it.**

This is a genuine, measured downgrade from the `t4g.large` recommendation in
`supabase-to-aws-migration.md`. That figure came from Supabase's published
4 GB-minimum for the **full thirteen-service** stack. Running six services
with Kong capped measures at 677 MB, so 4 GB is real headroom rather than the
bare minimum.

Two caveats, stated plainly:

1. **Measured idle, on Windows/WSL2, with 27 MB of data.** Under real
   concurrent load, Postgres and Next.js both grow. `t4g.small` is where that
   bites first.
2. **`npm run build` is the actual memory peak, not runtime.** A Next.js 16
   production build routinely wants 2 GB+. That alone can exceed everything
   else combined. Build in CI, push to ECR, `docker pull` on the box.

### 3.2 Burst credits are the real risk on `t4g`, not RAM

`t4g` instances are **burstable**. `t4g.medium` earns 24 CPU credits/hour, a
baseline of 20 % of 2 vCPUs. Idle CPU measured under 1 %, so the baseline is
fine — but two workloads spend credits in bursts:

- Postgres `VACUUM`/`ANALYZE` on the growing `contacts` and `messages` tables
- A broadcast send looping over thousands of recipients

Watch `CPUCreditBalance` in CloudWatch. If it trends to zero you are being
throttled to 20 % and everything feels broken for no visible reason. `t4g`
also defaults to **unlimited** mode, which does not throttle — it bills for
surplus credits instead. Cheap, but it is a bill that appears without a
capacity alarm firing.

---

## 4. The RDS variant

Moving `db` to RDS and keeping the other five on EC2.

### 4.1 What changes

|                         | On EC2 (all-in-one)                   | With RDS                                  |
| ----------------------- | ------------------------------------- | ----------------------------------------- |
| Containers on the box   | 6                                     | **5** (`db` leaves)                       |
| Measured RAM on the box | 677 MB                                | **≈ 522 MB**                              |
| EC2 instance            | `t4g.medium` (4 GB)                   | **`t4g.small` (2 GB)** becomes defensible |
| Backups                 | Your job (`pg_dump` + cron + offsite) | Automated, point-in-time recovery         |
| Patching Postgres       | Your job                              | AWS, in a maintenance window              |
| Disk growth             | You resize the EBS volume             | Storage autoscaling                       |
| Failure domain          | One box loses everything              | App and DB fail independently             |

### 4.2 Cost

|           | All-in-one EC2       | EC2 + RDS                           |
| --------- | -------------------- | ----------------------------------- |
| Compute   | `t4g.medium` ~$24.50 | `t4g.small` ~$12                    |
| Database  | (included)           | `db.t4g.micro` ~$12–15              |
| Storage   | 30 GB gp3 ~$2.40     | 30 GB gp3 ~$2.40 + RDS 20 GB ~$2.30 |
| Backups   | ~$0 (S3 pennies)     | included to 100 % of storage        |
| **Total** | **≈ $27/mo**         | **≈ $29–32/mo**                     |

**RDS costs roughly the same and removes the two jobs most likely to hurt you
at 3 a.m.: backups and patching.** At this data size that is the better trade.
The all-in-one box only wins if you genuinely want the single-box simplicity.

### 4.3 The RDS gotchas — these are specific and they bite

**Realtime does work on RDS.** This is the piece everyone assumes blocks it.
[AWS's docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.FeatureSupport.LogicalReplication.html)
state that RDS for PostgreSQL supports the `test_decoding` and `wal2json`
output plugins — and `wal2json` is exactly what this stack's replication slot
uses (verified: `supabase_realtime_replication_slot_` / plugin `wal2json`).
_(Content rephrased for compliance with licensing restrictions.)_

But you must do all of this:

1. **Set `rds.logical_replication = 1`** in a custom parameter group. It is a
   _static_ parameter — **requires a reboot**. Default RDS has
   `wal_level = replica`, and Realtime silently delivers nothing without
   logical WAL. Same invisible failure as the local bugs: `SUBSCRIBED`, then
   no events.
2. **Grant `rds_replication`** to the role Realtime connects as, plus
   `rds_superuser` to the role that enables the above.
3. **There is no superuser on RDS.** Locally Realtime connects as
   `supabase_admin`, which is `SUPERUSER REPLICATION`. On RDS the closest you
   get is `rds_superuser` + `rds_replication`. Realtime needs to create the
   `realtime` schema, run its tenant migrations, create publications and
   create replication slots — all reachable with those two roles, but you must
   grant them explicitly.
4. **Strip `supabase_vault` from the dump.** It is not available on RDS. The
   dump has **15 references** to it and the app has **0** — so delete the
   `CREATE EXTENSION supabase_vault` line and the `vault` schema block. This
   will otherwise fail the restore on line one of the extension section.
5. **The dump has 6 event triggers and 22 objects owned by `supabase_admin`.**
   Create a plain (non-superuser) `supabase_admin` role on RDS first, or
   restore with `--no-owner`. Event triggers need `rds_superuser`.
6. **`max_connections` scales with instance memory on RDS.** A
   `db.t4g.micro` gives you a low limit, and you now have four separate
   clients connecting (PostgREST's pool, GoTrue, Realtime, and the app's
   direct pool if any). Check it before you are surprised by
   `too many connections`.

---

## 5. Fully moving Supabase — including all users and data — to your EC2

This is the concrete change list. Most of it is already done by the compose
file in this repo; the work is environment and operations, not code.

### 5.1 Application code changes: none

Worth stating first because it is the headline. `supabase-js` talks to
PostgREST and GoTrue over HTTP. Self-hosting moves _where those programs run_,
not _what they speak_.

Measured on this commit across 525 non-test files in `src/`:

| Surface                                      | Count                | Changes?          |
| -------------------------------------------- | -------------------- | ----------------- |
| `.from()` queries                            | **837** in 210 files | No                |
| `.channel()` subscriptions                   | **6**                | No                |
| RLS policies                                 | **120**              | No                |
| Postgres functions                           | **158**              | No                |
| `process.env.NEXT_PUBLIC_SUPABASE_URL` sites | **11**               | No — but see §6.5 |

What changes is **three env vars**. That is the entire application-level cost
of Path A, and it is why this is a weekend rather than a quarter.

### 5.2 The steps

**1. Provision and prepare the box**

- `t4g.medium`, Amazon Linux 2023 or Ubuntu 24.04 arm64, **30 GB gp3**.
- Install Docker + compose plugin.
- Security group: allow **443** (and 80 to redirect) from the internet.
  **Do not open 54321 or 54322.** In this compose they bind `127.0.0.1`
  only — keep that.

**2. Move the data**

The mechanism already exists in this repo and is proven end-to-end:

```bash
# On the box, with the dump in supabase/Production db backups/
docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d
```

`restore.sh` picks the newest `*-plain.sql`, loads it, and `migrate.sh` detects
the restored schema and stands down. Verified locally: 8 users, 7 accounts,
8 profiles, 9,292 contacts, 7,260 messages, 9 templates — matching production
exactly.

**Users and passwords come across intact.** `auth.users` holds `$2a$` bcrypt
hashes, and bcrypt is self-contained: the salt and cost live inside the hash
string, and verifying one depends on nothing about the project or the JWT
secret. Restore the row, the original password still works. **No password
reset email campaign is needed** — which is the single most common fear about
this migration and it is unfounded.

**3. Take a fresh dump at cutover, not the 24-08 one**

The dump is a point in time. Between taking it and cutting over, production
keeps accepting WhatsApp messages. Plan a short read-only window: stop the
webhook, take the dump, restore, switch DNS.

**4. Generate real secrets**

Everything in `.env.docker.local` is a **local-only, deliberately public**
value. For a real deployment, all of these must be regenerated:

| Var                             | How                                                      |
| ------------------------------- | -------------------------------------------------------- |
| `JWT_SECRET`                    | `openssl rand -base64 48`                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT `{"role":"anon"}` signed with the new secret         |
| `SUPABASE_SERVICE_ROLE_KEY`     | JWT `{"role":"service_role"}` signed with the new secret |
| `POSTGRES_PASSWORD`             | `openssl rand -base64 32`                                |
| `REALTIME_ENC_KEY`              | exactly 16 chars                                         |
| `REALTIME_SECRET_KEY_BASE`      | ≥ 64 chars                                               |

All three of the first group must be regenerated **together** — the keys are
signatures over the secret, and a mismatch fails every request with a
signature error. `ENCRYPTION_KEY` is the exception: **do not rotate it**, or
every stored WhatsApp token becomes undecryptable.

**5. Point the URL at a real hostname**

`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` works locally only because
`app` shares Kong's namespace. In production you want
`https://api.yourdomain.com` fronted by nginx with TLS. Because
`NEXT_PUBLIC_*` is **inlined at build time**, changing this means a **rebuild**,
not a restart.

Once there is a real external hostname, `network_mode: service:kong` is no
longer needed and the app can publish its own port again.

**6. Update the CSP**

`next.config.ts` currently allows `https://*.supabase.co` in `connect-src` and
`media-src`. After moving, that should become your own API hostname. It ships
as `Content-Security-Policy-Report-Only`, so a stale value will not break
anything — it will just stop being useful.

**7. Take over the operations Supabase was doing for free**

This is the real cost of self-hosting, and it is ongoing:

- **Backups.** `pg_dump` on a schedule to S3, with a lifecycle rule. **Test a
  restore** — an untested backup is a hope, not a backup.
- **Patching.** Four images to keep current, and they must stay compatible
  with each other and with the schema (see §6).
- **Monitoring.** Something must page you when a container dies. `restart:
unless-stopped` handles crashes but not crash-loops.
- **Disk.** Postgres fills the volume and stops. Alarm on EBS free space.
  A replication slot that nothing reads from will also fill the disk with WAL.

---

## 6. What you need to know to make this easy

The recommendations that would have saved the most time, in rough order of
how much pain each one prevents.

### 6.1 Pin the service versions to the schema, not to "latest"

**This is the most important thing in this document.** The dump carries
production's `auth`, `realtime` and `storage` schemas. A container older than
the schema handed to it does not degrade gracefully — it breaks in ways that
look like something else entirely. All three of these were hit:

| Service    | Symptom of a version that is too old                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`       | 17.6 dump uses syntax and settings PG 15 rejects; restore dies on line 15                                                                                                                                                        |
| `auth`     | GoTrue v2.177 knew migrations to `20241009103726`; dump was at `20260625000000`                                                                                                                                                  |
| `realtime` | v2.34 upserts `ON CONFLICT (subscription_id, entity, filters)`; migration `20260709120000` widened that unique index to five columns → `42P10`, and **the client still reports `SUBSCRIBED` and then silently receives nothing** |

**Rule: before restoring a dump, read `auth.schema_migrations` and
`realtime.schema_migrations` out of it and pick containers new enough.** It
takes two minutes and it is the difference between a working stack and a day
of debugging.

### 6.2 Realtime fails silently. Always test it with a real event

Three separate Realtime bugs were found building this, and **every one of them
presented identically**: websocket upgrades with `101`, channel reports
`SUBSCRIBED`, zero events delivered, nothing in the browser console. The
actual error was in the `realtime` container log every time.

A handshake test proves nothing. The only meaningful test is: subscribe,
insert a row, assert the event arrives. Keep that script.

One trap in writing that test: **insert _after_ a short delay, not in the
`SUBSCRIBED` callback.** The ack means the channel join was accepted, not that
the subscription row is visible to the CDC poller. Insert in the same tick and
the change is evaluated against zero subscriptions and **dropped**, not
delayed — so it never arrives and looks like a total failure.

### 6.3 PostgREST builds its schema cache once, as `authenticator`

If `authenticator` is `NOINHERIT` (which is what hosted Supabase uses, and
what every PostgREST tutorial says), it holds no table privileges of its own,
`information_schema` shows it nothing, and the log reads
`Schema cache loaded 0 Relations`. **Reads still work** — they are planned from
the URL — but every `INSERT`/`UPDATE`/`DELETE` returns `404 {}` with an
**empty error body**, which `supabase-js` surfaces as `error: {}`. Nothing
points at privileges.

Two things follow:

- Grant `INHERIT` to `authenticator` in a self-hosted stack. Safe: PostgREST
  issues `SET LOCAL ROLE` per request, and `BYPASSRLS` is a role _attribute_,
  never inherited.
- **`Schema cache loaded N Relations` in the PostgREST log is the first thing
  to check** when writes fail and reads work. `N = 0` is the whole answer.

### 6.4 Order of startup is not a detail

- **Restore before GoTrue.** GoTrue creates `auth.users` itself on first boot.
  If it wins that race, the dump's `CREATE TABLE auth.users` collides and the
  restore aborts half-applied.
- **PostgREST after migrations.** It caches the schema at startup; tables
  created after that moment return `404` forever with nothing in any log.
- **Realtime's healthcheck does real work.** Realtime applies its per-tenant
  migrations lazily, on first contact. Hitting
  `/api/tenants/<id>/health` at startup forces them, so the window does not
  land on whoever opens the app first.

### 6.5 `NEXT_PUBLIC_*` is baked in at build time

Not a runtime variable. Changing `NEXT_PUBLIC_SUPABASE_URL` requires a
**rebuild**. And because this codebase has no server-only Supabase URL
override — all 11 client-construction sites read the same var — that one
string must resolve from both the browser and the server. Plan the hostname
before you build, not after.

### 6.6 Restore with `ON_ERROR_STOP=1`

A partially restored database is worse than a failed one: the app half-works
and the gaps surface later as missing rows instead of as an error you can act
on. `restore.sh` does this. If it fails, `down -v` and start clean rather than
patching forward.

### 6.7 pg_dump does not dump roles

`pg_dump` emits `OWNER TO` / `GRANT` for every object but **does not create the
roles**, so a plain restore fails on the first unknown role name (that is
`pg_dumpall --roles-only`). This dump references twelve. Extract them from the
dump rather than guessing:

```bash
grep -oE '(OWNER TO|GRANT .* TO) [a-z_]+' dump.sql | awk '{print $NF}' | sort -u
```

### 6.8 Keep two dump formats, restore from plain

The `.backup` custom-format archive is more flexible in principle
(`--no-owner`, selective restore), but **`pg_restore` refuses archives written
by a newer major version**. This one was written by pg_dump 18, so restoring it
needs an 18.x client. The plain `.sql` carries identical content, works with
any client, and can be preprocessed with `sed` — which was necessary anyway to
strip the psql-18-only `\restrict` / `\unrestrict` wrapper that psql 17 rejects
on line 5.

### 6.9 Do not build on the production box

`npm run build` for Next.js 16 routinely wants 2 GB+. On a 4 GB box already
running Postgres and five services, that is the memory peak of the whole
system — and it happens at deploy time, when you are least able to debug it.
Build in CI, push to ECR, `docker pull`.

### 6.10 Things you should switch on once, then forget

- **`pg_dump` to S3 nightly**, lifecycle to Glacier after 30 days. Test one.
- **CloudWatch alarms** on `CPUCreditBalance`, EBS free space, and memory
  (needs the CloudWatch agent — EC2 does not report memory by default).
- **A dead replication slot alarm.** An inactive slot retains WAL forever and
  will fill the disk. This is the classic self-hosted-Realtime outage.
- **`docker image prune`** on a schedule. 7 GB of images accumulates.

### 6.11 One thing to fix in the app before scaling

`accounts.owner_user_id` has **no `ON DELETE CASCADE`**, so
`auth.admin.deleteUser()` **fails silently** — the account row holds the
reference and the user is never removed. This was hit while cleaning up a test
account: the user count went 8 → 9 and stayed there. Deleting a user requires
removing the owned account first. Worth either documenting loudly or fixing
with an explicit deletion order in code.

---

## Appendix — how to re-measure

```bash
# Per-service memory and CPU
docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"

# Kong's worker count (this is what drives its memory)
docker exec replai-kong sh -c "nproc; ps -eo rss,comm | grep -c nginx"

# Database size and row counts
docker exec replai-db psql -U postgres -d postgres -c \
  "SELECT pg_size_pretty(pg_database_size('postgres'));"

# Is PostgREST's cache healthy? (0 Relations = writes will 404)
docker logs replai-rest 2>&1 | grep "Schema cache loaded"

# Which schema version does a dump expect?
grep -A400 'COPY auth.schema_migrations'     dump.sql | head -50
grep -A50  'COPY realtime.schema_migrations' dump.sql | head -20

# arm64 availability before moving to Graviton
docker manifest inspect <image> | grep architecture

# Roles a dump needs that pg_dump will not create
grep -oE '(OWNER TO|GRANT .* TO) [a-z_]+' dump.sql | awk '{print $NF}' | sort -u
```
