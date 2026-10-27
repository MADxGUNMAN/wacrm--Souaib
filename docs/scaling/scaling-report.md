# Replai scaling and performance report

Prepared 24 Oct 2026. Read-only investigation: no code, config, database or server was changed.

Every number in this report carries one of three labels:

- **MEASURED**: read from the production database (`pg_stat_statements`, `pg_stat_user_tables`, `EXPLAIN ANALYZE`), the repository, or the server figures supplied in the brief.
- **FROM SOURCE**: taken from a vendor document, linked inline.
- **ESTIMATE**: derived by reasoning; the assumption is stated next to it.

Currency conversion uses **₹88 per USD (ESTIMATE)**. AWS prices other than EC2 are list prices recalled from AWS pricing pages and must be checked in the AWS Pricing Calculator for ap-south-1 before you commit to them; they are labelled ESTIMATE for that reason.

---

## 1. Executive summary

### 1.1 The short answer

The application code is careful about correctness (idempotent status updates, forward-only ladders, unique-index backstops, SKIP LOCKED claims in billing). What it lacks is **shape for volume**: almost every unit of work is done one row at a time, in sequence, inside the web process, and the browser leans on unfiltered Supabase Realtime and RLS-scanned queries. None of that matters at 21 accounts. All of it matters from roughly 100 to 300 active workspaces.

Three findings change decisions today, before any growth:

1. **Production runs on the Supabase Free plan** (MEASURED: organisation plan `free`). [Supabase pricing](https://supabase.com/pricing) lists automatic backups as not included on Free, and the Free Realtime ceiling is 200 concurrent connections ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)). You are collecting Razorpay AutoPay money on a database with no managed backup.
2. **Dev and production share that one database.** Every dev experiment, test webhook and migration rehearsal lands on customer data and consumes the same 60 connections and 200 Realtime slots.
3. **Supabase Realtime `postgres_changes` is the single largest consumer of database time** (MEASURED: 4.37 million calls, 26,131 seconds total since 25 Jul 2026, about 75% of the top-30 statement time), and the inbox subscribes to `messages` and `conversations` with **no filter** (`src/hooks/use-realtime.ts:50` and `:61`, `src/hooks/use-total-unread.ts:48`). Supabase documents that Postgres Changes authorises every change once per subscriber on a single thread, so a larger database does not raise its ceiling ([Postgres Changes, scaling section](https://supabase.com/docs/guides/realtime/postgres-changes)).

### 1.2 Per tier

| Tier | Verdict | First thing that breaks | Recommended shape | Monthly cost (ESTIMATE) | Top actions |
|---|---|---|---|---|---|
| **Today's box** (t4g.micro + Supabase Free) | Comfortable for the current 21 accounts. Roughly **80 to 150 daily-active workspaces** before latency and CPU credits become a problem. | Supabase Free Realtime (200 connections) and no backups, then t4g CPU credits during broadcast bursts | Same box, Pro plan, separate dev project | ~₹2,600 (Supabase Pro $25 + EC2 ~$5) | Pro plan, split dev, indexes, RLS fixes, presence and Realtime filters |
| **1,000 workspaces** | Feasible on Supabase with a modest AWS footprint, after the webhook path becomes queue-backed. | Status-webhook DB round trips during morning broadcast peaks (about 2,600 DB requests/s, ESTIMATE) and Realtime connection count (~10,000 channels, the Pro no-spend-cap ceiling) | 2 web + 2 worker Graviton instances behind an ALB, Postgres-backed webhook queue, Supabase Pro on Large/XL compute, Valkey for limits and caches | **$700 to $1,000** (₹62k to ₹88k), about ₹60 to ₹90 per workspace | Store-then-process webhooks, set-based status SQL, broadcast worker, Realtime via filtered Broadcast channels, PITR |
| **10,000 workspaces** | Feasible only after Realtime is redesigned and `messages` carries `account_id` and is partitioned. Supabase hosted can still be the database, at 4XL with replicas, or move to RDS/Aurora. | Realtime fan-out (100k+ channels) and write volume on `messages` (~360 GB/month growth, ESTIMATE) | Autoscaled web and worker fleets (ECS or ASG), SQS for webhooks, dedicated WebSocket gateway or Supabase Enterprise Realtime, partitioned and archived messages, read replicas | **$5,000 to $8,000** (₹4.4 to ₹7 lakh), about ₹45 to ₹70 per workspace | Account-scoped schema, cell-ready services, archive to S3, observability with SLO alarms |
| **100,000+ workspaces** | Requires a cell (shard) architecture: groups of ~10,000 workspaces each with their own database and workers. | A single Postgres primary (write rate tens of thousands of statements/s) | 8 to 12 cells, each a 10k-tier stack, global routing by `phone_number_id` and `account_id`, self-managed or RDS Postgres with Savings Plans | **$40,000 to $70,000** (₹35 to ₹62 lakh), about ₹35 to ₹60 per workspace | Cell router, per-cell migrations, cross-cell super-admin reporting from a warehouse |

### 1.3 CPU and DB reduction without removing features

The largest savings, each of which also makes a feature better:

| Change | Saving (ESTIMATE) | Feature improvement |
|---|---|---|
| Store each Meta webhook raw, ack, process from a queue in batches | Webhook DB round trips per status from ~5 to well under 1 (batched) | No lost messages on deploy or crash; replay; per-conversation ordering |
| One set-based SQL function for status updates, statement-level broadcast counters | 80 to 95% of status-path DB work; removes a hot-row lock on `broadcasts` | Live campaign counters stay accurate under load |
| Realtime: filtered, account-scoped Broadcast channels instead of unfiltered `postgres_changes` | Most of the measured Realtime DB time; removes the per-subscriber RLS fan-out | Faster inbox updates, works at 10k+ workspaces |
| Presence via Realtime Presence instead of a DB write every 30 s | 100% of `touch_presence` writes (MEASURED 128,406 calls so far) | Presence updates instantly, not on a 30 s tick |
| RLS policy rewrites plus explicit `account_id` filters | Contacts list 465 ms to 20 ms (MEASURED, 23x) | Faster contacts, inbox and dashboard |
| Dashboard aggregations as SQL RPCs | Removes row transfer and JS aggregation; fixes silent truncation at PostgREST's row cap | Charts correct for busy accounts |
| Broadcast worker with batched contact upsert and paced parallel sends | ~2,000 sequential round trips per 1,000-recipient audience to a handful | Sends do not need the browser tab open; 5x to 20x faster |
| Inbound media persisted to S3 once, served by CloudFront | Removes Node buffering of every media view | Media older than 7 days stops breaking ([Meta media IDs in webhooks expire after 7 days](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)) |

---

## 2. Current state (MEASURED)

### 2.1 Infrastructure

| Item | Value | Source |
|---|---|---|
| App host | EC2 t4g.micro, ap-south-1, 2 vCPU burstable, 903 MB RAM, 2 GB swap, 11 GB disk 55% used | Brief |
| Container | One `wacrm` container, `node server.js` (Next.js 16.2.6 standalone), 149 MB RSS at rest, no `NODE_OPTIONS` | Brief, `Dockerfile` |
| Proxy | nginx, `worker_processes auto`, `worker_connections 768`; repo snippets set 25 MB body and 32k proxy buffers (`deploy/nginx-*.conf`) | Brief, repo |
| Load | load average 0.41, 389 MB available, 90 MB swap used, 0 OOM kills, 0 restarts | Brief |
| Database | Supabase project `dknolotutfiesuhbhmze`, ap-south-1, Postgres 17.6, organisation plan **free** | Supabase MCP |
| DB settings | `max_connections` 60, `shared_buffers` 224 MB, `work_mem` 2,184 kB, `effective_cache_size` 384 MB, 29 open connections (10 PostgREST, 9 Realtime) | `pg_settings`, `pg_stat_activity` |
| DB size | 56 MB | `pg_database_size` |
| Extensions | pg_stat_statements, pgcrypto, vector 0.8.2, supabase_vault, uuid-ossp | `pg_extension` |
| Cron | `deploy/cron-ping.sh`, every 5 min, 8 endpoints in sequence, `curl --max-time 60` each | Repo |
| Realtime publication | conversations, flow_runs, marketing_opt_outs, marketing_subscription_events, member_presence, message_reactions, messages, notifications, super_admin_notification_reads, super_admin_notifications, support_conversations, support_messages | `pg_publication_tables` |

### 2.2 What the database has actually been doing (91 days of `pg_stat_statements`)

Stats were reset on 25 Jul 2026, so the window is about 91 days of light production plus dev traffic.

| Rank | Statement (shortened) | Calls | Mean | Total | Comment |
|---|---|---|---|---|---|
| 1 | Realtime WAL change polling (`realtime.list_changes`) | 4,373,242 | 5.98 ms | 26,131 s | Fixed cost of Postgres Changes, grows with subscribers |
| 2 | `coexistence_staged_contacts` filtered count | 1,856 | 802 ms | 1,488 s | Coexistence import UI |
| 3 | `SELECT name FROM pg_timezone_names` | 1,514 | 605 ms | 916 s | Introspection (Studio or PostgREST schema reload), not app code |
| 4 | Contacts list, `ORDER BY created_at DESC` with `count=exact`, **no account filter** | 2,101 | 371 ms | 780 s | Relies on RLS; see §3.6 |
| 5 | `touch_presence` RPC | 128,406 | 5.27 ms | 676 s | 30 s presence heartbeat |
| 6 | Contacts list variant | 635 | 991 ms | 629 s | Same pattern |
| 9 | `fn_account_outbound_message_count` | 16,684 | 21.7 ms | 361 s | Alerts cron, one alert row |
| 10 | `fn_health_metrics` | 10,515 | 33.1 ms | 348 s | Super-admin health page polling |
| 13 | Dashboard 30-day messages series | 2,315 | 101 ms | 233 s | Client-side aggregation |
| 14 | Dashboard 14-day response time | 2,260 | 99 ms | 224 s | Client-side aggregation |
| 16 | Contacts `ilike` search on name/phone/email | 79 | 2,421 ms | 191 s | No trigram index |
| 22 | `conversations` `id, unread_count` full list | 4,396 | 27.5 ms | 121 s | `use-total-unread.ts` |
| 25 | `UPDATE whatsapp_usage_alerts SET last_evaluated_at` | 16,622 | 6.7 ms | 111 s | Written every tick even when nothing changed |
| 30 | PostgREST per-request `set_config` | 828,910 | 0.11 ms | 89 s | About **9,100 PostgREST requests per day** in total |

Table-level counters (MEASURED, `pg_stat_user_tables`):

| Table | Live rows | Seq scans | Rows read by seq scans | Note |
|---|---|---|---|---|
| profiles | 22 | 112,467,482 | 1.5 billion | Read once per row by RLS helpers (`is_account_member`) |
| contacts | 10,516 | 34,134 | 125 million | Unfiltered lists under RLS |
| messages | 3,432 | 118,986 | 69.7 million | Dashboard and RLS subplans |
| broadcast_recipients | 1,192 | 71,600 | 29.7 million | No index on `contact_id` |
| member_presence | 18 | 26,356 | 0.2 million | **128,376 updates** for 18 rows |
| broadcasts | 63 | 28,471 | 0.2 million | **4,956 updates** for 63 rows (counter trigger) |
| whatsapp_usage_alerts | 1 | 35,462 | 33,433 | **16,626 updates** for 1 row |

Message mix over the last 30 days, excluding the protected account (MEASURED): agent 1,400 (456 of them broadcast), customer 218, business_app 145, bot 64. Of agent messages, 77% reached `delivered` and 56% reached `read`, which confirms roughly 2.3 to 3 status webhooks per outbound message.

Storage density (MEASURED): `messages` is 7.46 MB for 3,432 rows, about **2.2 KB per message** including indexes and TOAST. `contacts` is 9.0 MB for 10,516 rows, about **0.86 KB per contact**.

---

## 3. Code audit of hot paths

### 3.1 WhatsApp webhook: `src/app/api/whatsapp/webhook/route.ts` (3,179 lines)

**Ack path (good).** `POST` reads the raw body, verifies the HMAC (`verifyMetaWebhookSignature`), parses JSON, schedules `processWebhook` inside `after()` (line 331) and returns 200. Meta's latency standard is a median under 250 ms with under 1% above 1 s ([Meta throughput](https://developers.facebook.com/docs/whatsapp/throughput)); this path meets it as long as the event loop is not saturated.

**Durability (gap).** `after()` work lives only in the Node process. Next drains pending `after()` callbacks on SIGTERM when self-hosted (`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, section `after`), but `docker compose up -d` in `.github/workflows/master_ci.yml:94` recreates the container with Docker's default 10 s stop timeout, a crash or OOM loses everything in flight, and Meta will not retry because it already got 200. There is also no backpressure: under a burst, accepted-but-unprocessed work accumulates in memory on a 903 MB box.

**Sequential processing.** `processWebhook` (line 342) walks `entry[] -> changes[] -> statuses[]` with `await` inside every loop (lines 384-385, 421). A batched delivery is processed one status at a time.

**Status webhook: `handleStatusUpdate` (line 1980).** Round trips per status (MEASURED from code):

| Step | Line | Round trips |
|---|---|---|
| `fn_apply_message_status` RPC | 2065 | 1 |
| Message row plus embedded conversation (account, contact) | 2098 | 1 |
| `broadcast_recipients` by wamid | 2115 | 1 |
| Fallback lookup and backfill when wamid not yet stamped | 1917-1975 | 0 to 2 |
| Forward-only recipient update | 2187 | 0 to 1 |
| Broadcast counter trigger (`_bcast_bump`, migration 005): one `UPDATE broadcasts` per counter column touched | trigger | 0 to 3 |
| `dispatchWebhookEvent` endpoint lookup | `src/lib/webhooks/deliver.ts:54` | 1 |
| Per subscribed endpoint: HTTP POST plus `UPDATE` or RPC | `deliver.ts:133` | 0 to 2 per endpoint |

That is **4 to 5 round trips for a normal status, 7 to 10 for a broadcast status**, each a separate HTTPS request to PostgREST. Two specific problems:

- The counter trigger in `supabase/migrations/005_broadcast_counts_incremental.sql` issues one dynamic `UPDATE broadcasts` per counter (`_bcast_bump`). A `sent -> delivered` transition is three updates of the **same** `broadcasts` row. During a campaign, every status webhook for that campaign serialises on one row lock and leaves dead tuples (MEASURED: 4,956 updates against 63 rows).
- `messages.message_id` has a plain index (`idx_messages_message_id`), so lookups are fine, but the same row is fetched twice (RPC then select) because the RPC does not return what the next step needs.

**Inbound message: `processMessage` (line 2339).** Round trips for a plain text message from a known contact in an existing conversation, with nothing configured (MEASURED from code):

| Step | Line | Round trips |
|---|---|---|
| `resolveConfigByPhoneNumberId` (`select('*')`) | 509 | 1 |
| `findExistingContact` exact match | `src/lib/contacts/dedupe.ts` | 1 (plus 1 suffix `LIKE` scan if new) |
| Contact name update when profile name changed | 2999 | 0 to 1 |
| `findOrCreateConversation` (`select('*')`) | 3122 | 1 |
| Prior customer message `count: 'exact'` | 2445 | 1 |
| Insert message | 2452 | 1 |
| Update conversation (preview, unread) | 2481 | 1 |
| `flagBroadcastReplyIfAny` | 2233 | 1 (plus 1 update) |
| Opt-in/out config | `src/lib/whatsapp/opt-out-inbound.ts` via `loadOptInOutConfig` | 1 |
| Flows: active run lookup, then active flows list | `src/lib/flows/engine.ts:183`, `:320` | 2 |
| Automations: per trigger (2 to 4 triggers) contact ownership check plus automations select | `src/lib/automations/engine.ts:80`, `:96` | 4 to 8 |
| AI config | `src/lib/ai/auto-reply.ts:52` | 1 |
| `message.received` endpoint lookup | `deliver.ts:54` | 1 |

That is **about 16 to 20 round trips even when the workspace has no flows, automations, AI or webhooks configured.** With AI enabled and replying, add about 12 more (automations check, conversation, context, knowledge RPC, latest inbound, whatsapp_config, claim RPC, then `engineSendText`: contact, config, insert, update, usage insert) plus the LLM call. With one matching automation that sends a message, add about 10 (log insert, steps select, step execution and send, append results, counter RPC). Every outbound reply later produces about three status webhooks at 4 to 5 round trips each.

Specific issues:

- **Lost-update race on unread count.** Line 2486 writes `unread_count: (conversation.unread_count || 0) + 1` using the value read at line 3122. Two inbound messages processed concurrently for the same conversation both write N+1. This is a correctness bug that gets more frequent with volume. Fix with an atomic `unread_count = unread_count + 1` in SQL.
- **Missing index on `broadcast_recipients(contact_id)`.** `flagBroadcastReplyIfAny` (line 2233) runs on every inbound message. EXPLAIN (MEASURED) shows a sequential scan of all 1,192 recipients, 44.7 ms. The Supabase performance advisor flags the same foreign key as unindexed. At 10 million recipient rows this becomes a multi-second scan on every inbound message.
- **Automations dispatch is per trigger.** `runAutomationsForTrigger` is called once per trigger type (line 2633) and each call repeats a contact ownership check and an automations query. The ownership check is redundant when the caller is the webhook, which just resolved the contact inside the same account. The calls are also not awaited (`.catch` at 2644), so they are not covered by `after()` semantics on serverless and not durable anywhere.
- **Media verification calls Meta synchronously.** `verifyAndBuildUrl` (line 2707) calls `getMediaUrl` for every inbound media message only to confirm the id exists; the bytes are fetched later by the media proxy on every view (§3.9).
- **Suffix phone match cannot use an index.** `src/lib/contacts/dedupe.ts:127` runs `phone_normalized LIKE '%<last 8>'` scoped by `account_id`, which scans the whole account's contacts via `idx_contacts_account`. It only runs when the exact match misses (new contacts), but for a 100,000-contact account each new inbound contact reads 100,000 rows.

**Coexistence echoes and history** (`handleMessageEchoes` line 603, `ingestHistoryThread` line 1265) follow the same row-at-a-time pattern. History import is the largest burst a single workspace can produce (up to six months of chats); it should be a queued, rate-limited job rather than inline webhook work.

### 3.2 Broadcast sending

Three entry points share one pattern:

- Dashboard wizard: the **browser** loops over batches and POSTs each to `/api/whatsapp/broadcast` (`src/hooks/use-broadcast-sending.ts:706`). The route sends sequentially (`src/app/api/whatsapp/broadcast/route.ts`, loop near line 262, `sendTemplateMessage` near 298). The campaign stops if the operator closes the tab.
- Public API and Google Sheets add-on: `/api/v1/broadcasts` and `/api/v1/campaigns/[id]/send` call `createBroadcast` then `deliverBroadcast` (`src/lib/whatsapp/broadcast-core.ts`).
- Scheduled: `/api/broadcasts/cron`, at most `MAX_SCHEDULED_PER_RUN = 20` broadcasts per tick (`src/lib/whatsapp/scheduled-broadcasts.ts:50`), executed one after another.

Per recipient (MEASURED from code):

| Phase | Line | Round trips |
|---|---|---|
| Resolve contact, sequential, inside `createBroadcast` | `broadcast-core.ts:311`, `:319` | 1 to 3 |
| Opt-out filter | `filterOptedOutPhones` | batched, 1 per broadcast |
| Recipient rows | `broadcast-core.ts:447` | batched, 1 per broadcast |
| Meta send, sequential, with phone-variant retry | `broadcast-core.ts:537` | 1 HTTPS to Meta (more on retry) |
| Stamp wamid | `broadcast-core.ts:565` | 1 to 2 (plus counter trigger) |
| Inbox message: find or create conversation, insert message, update conversation | `broadcast-core.ts:582`, `broadcast-inbox.ts` | 3 to 5 |

So **about 7 to 11 DB round trips plus one Meta call per recipient, strictly sequential**. With a Meta round trip of roughly 150 to 300 ms from Mumbai (ESTIMATE), one broadcast sends at about **3 to 5 messages per second (ESTIMATE)**, against Meta's default of 80 messages per second per number, or a fixed 20 for coexistence numbers ([Meta throughput](https://developers.facebook.com/docs/whatsapp/throughput)). A 1,000-recipient campaign takes 3 to 6 minutes; `MAX_RECIPIENTS = 1000` per request (`broadcast-core.ts:223`). Then each recipient produces 2 to 3 status webhooks (§3.1), so a 1,000-recipient campaign generates **about 2,500 webhooks and roughly 15,000 to 25,000 DB statements** including trigger updates.

### 3.3 Automation engine and its cron

- `src/lib/automations/engine.ts`: each execution inserts a log (line 180), loads steps (line 240), runs steps one by one, updates the log, and calls `increment_automation_execution_count` (line 217). Conditions recurse with another steps query per branch.
- `/api/automations/cron` (`src/app/api/automations/cron/route.ts`) selects **at most 50** due waits, then claims and runs them one at a time. At one tick per 5 minutes that is a hard ceiling of **600 resumed waits per hour, 14,400 per day**, for the whole platform. With 10,000 workspaces each having a drip automation with a wait step, the backlog grows without bound. The claim is an `UPDATE ... WHERE status='pending'` per row (good for correctness), not a batch claim.

### 3.4 Flows engine and its cron

- `dispatchInboundToFlows` (`src/lib/flows/engine.ts:963`) is cheap when nothing matches (two indexed lookups). `isDuplicateInbound` (line 294) loads every run id for the contact and then filters `flow_run_events` on a JSON field; acceptable now, slow for long-lived contacts.
- `/api/flows/cron` (`src/app/api/flows/cron/route.ts:55`) selects **every active run on the platform with no limit**, computes staleness in JavaScript, and updates and inserts one row at a time. At 100,000 workspaces this is a large unbounded read every 5 minutes. This should be a single set-based `UPDATE ... RETURNING` using `idx_flow_runs_active_advanced`.

### 3.5 Other cron endpoints

| Endpoint | Bound | Issue |
|---|---|---|
| `/api/alerts/cron` | 200 alerts per tick (`route.ts:64-69`) | **No `ORDER BY`**, so with more than 200 enabled alerts the same subset is likely evaluated every tick and the rest never are. One `fn_account_outbound_message_count` per alert, and an unconditional `UPDATE` of `last_evaluated_at` per alert (MEASURED 16,622 updates for one row). |
| `/api/auto-mail/cron` | 100 reminders | Fine; batched plan lookup already. |
| `/api/support-chat/cron` | bounded, several point queries per reply | Fine at 1k. |
| `/api/ai-connectors/cron` | 500 idle checks | Fine. |
| `/api/billing/cron` | SKIP LOCKED claims, 40 s budget | The pattern every other cron should copy. |
| `deploy/cron-ping.sh` | 8 sequential curls, 60 s each | A worst-case tick takes 8 minutes, longer than the 5 minute interval, so ticks overlap. Endpoints share the web process, so a heavy cron run competes with inbox users and webhooks. |

### 3.6 Row Level Security and browser queries

RLS policies call `is_account_member(account_id, ...)` (SECURITY DEFINER, STABLE) per row, and `conversations_select` runs a correlated subselect on `profiles` per row (MEASURED from `pg_policies`). The Supabase advisor reports 18 `auth_rls_initplan` warnings and 81 `multiple_permissive_policies` warnings (MEASURED).

The measurable effect, run as a real owner with `SET ROLE authenticated` in a read-only transaction:

| Query | Plan | Time (MEASURED) |
|---|---|---|
| Latest 25 contacts, no account filter (what the UI sends) | Seq scan of all 10,516 contacts, RLS function per row | **465 ms** |
| Same, with `account_id = ...` | Index scan on `idx_contacts_account` | **20 ms** |
| 14-day messages for the dashboard | Two RLS subplans each seq-scanning all conversations, calling the profiles subquery 1,010 times | **320 ms for 54 rows** |

The cost is proportional to **all tenants' rows**, not the caller's. At 10,000 workspaces an unfiltered contacts list would evaluate the RLS function across tens of millions of rows. This is also why `profiles` shows 112 million sequential scans (MEASURED).

### 3.7 Dashboard: `src/lib/dashboard/queries.ts`

Runs in the browser through the RLS client (`src/app/(dashboard)/dashboard/page.tsx:70-88`).

- `loadMetrics` (line 38) fires eight count queries in parallel, none with an account filter.
- `loadConversationsSeries` (line 124) downloads `created_at, sender_type` for **every message in the last 30 days** and buckets them in JavaScript.
- `loadResponseTime` (line 197) downloads 14 days of messages and walks them in JavaScript.
- Both are subject to PostgREST's maximum rows per response (1,000 by Supabase default; this project's setting was not verified). A workspace with more than 1,000 messages in the window gets **silently truncated charts**. Moving these to SQL fixes accuracy as well as cost.

### 3.8 Proxy: `src/proxy.ts`

Runs for every page and `/api/*` request (matcher at line 497 excludes only static assets and images). For a signed-in user hitting a gated API route (MEASURED from code):

| Step | Line | Cost |
|---|---|---|
| `supabase.auth.getUser()` | 137 | One HTTPS call to Supabase Auth, every request |
| `auth.getSession()` plus 2FA gate RPC | 230 | RPC cached in-process for 20 s (`src/lib/two-factor/gate.ts:83-85`) |
| `profiles` select | 323 | 1 PostgREST call |
| `accounts` select | 357 | 1 PostgREST call |
| Gate config | `src/lib/subscription/gate-cache.ts` | Cached in-process |

Then most route handlers call `getCurrentAccount()` (`src/lib/auth/account.ts:112`), which repeats `getUser()` and the `profiles` lookup. So **a typical authenticated API call costs two Auth round trips and three or four PostgREST round trips before the handler does any work**. `getUser()` exists to validate the token against Auth; with asymmetric JWT signing keys, `supabase.auth.getClaims()` verifies the JWT locally (check the method is available in the installed `@supabase/supabase-js` 2.107 and that the project uses asymmetric signing keys before relying on it). The webhook route also passes through the proxy, but with no cookies the user branches are skipped.

### 3.9 Media proxy: `src/app/api/whatsapp/media/[mediaId]/route.ts`

Every view of an inbound image, voice note or document: `getUser()`, `profiles`, `whatsapp_config` (`select('*')`), a Graph API call for the URL, then `downloadMedia` buffers the **entire file in Node memory** and returns it. Documents can be up to 100 MB ([Meta media](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)). Three concurrent views of large files on a 903 MB box is a realistic OOM. The response is marked `Cache-Control: public, max-age=86400` although it is per-account data; that is harmless with nginx not caching, but would leak media across users the day a CDN is put in front. Meta also states that media ids received in webhooks are downloadable for only 7 days, so **any inbound media older than a week already fails to load in the inbox**.

### 3.10 MCP connector: `src/app/mcp/route.ts`

Per tool call (MEASURED from code): in-memory per-IP rate limit, JSON parse, `runGate` (`src/lib/ai-connector/gate.ts:203`): access token lookup, connection lookup, then five parallel lookups (client, profile, account, policy, connector profile, line 260), so **7 round trips in 3 sequential waves**. Then a user-scoped Supabase client with a freshly minted 5-minute JWT (the signing key is parsed once and cached), a **new `McpServer` and transport per request** (`buildMcpServer`), the tool's own RLS queries, and in `after()` one audit insert per entry plus a `last_used_at` update at most once a minute. The per-request server construction registers every tool with its zod schema; that is CPU, not I/O, likely a few milliseconds (ESTIMATE, should be profiled). At MCP volumes (tens of calls per workspace per day) this is not a bottleneck; the gate round trips are the part worth caching (connection plus profile plus policy for 30 to 60 s, invalidated on revoke).

### 3.11 Public API: `/api/v1`

`requireApiKey` (`src/lib/auth/api-context.ts:80`) does one hashed key lookup, an in-memory rate limit (`publicApi`, 120/min per key), and `touchLastUsed` (line 108) which **writes `api_keys.last_used_at` on every request** (MEASURED: 1,369 updates against 13 rows). The MCP route already throttles the same kind of write to once a minute; copying that removes nearly all of these writes.

### 3.12 Super-admin routes

`/api/super-admin/billing/events` reads up to `EVENTS_CAP = 10000` subscription events in chunks plus a billing directory on every request, filters and paginates in JavaScript. `fn_health_metrics` (10,515 calls, 33 ms mean) and `fn_platform_metrics` (5,071 calls) are called on page polling (MEASURED). Fine at 1k; at 10k and above these should read precomputed snapshot tables refreshed by the scheduler.

### 3.13 Realtime in the browser

Per open dashboard tab (MEASURED from code): `inbox-realtime` with unfiltered `messages` and `conversations` (`use-realtime.ts:50, 61`), `total-unread-realtime` with unfiltered `conversations` (`use-total-unread.ts:48`), notifications, support unread, presence (`use-presence.ts:93`), the WhatsApp banner on the dashboard, per-thread reactions (`message-thread.tsx:600`), contact sidebar subscription status (`contact-sidebar.tsx:293`), and one per floating chat window. That is **about 5 to 8 channels per tab**. Supabase's concepts page defines concurrent connections as the total channels subscribed across clients ([Realtime concepts](https://supabase.com/docs/guides/realtime/concepts)); if that is how your quota is counted, the Free limit of 200 is reached by about 10 to 15 workspaces with 2 to 3 agents online. Check the Realtime report in the dashboard to confirm how your peak is counted.

`use-total-unread.ts:30-32` also loads `id, unread_count` for **every conversation** visible to the user on each mount (MEASURED 4,396 calls), which is wrong past the row cap and wasteful below it. A count RPC returns one integer.

The presence heartbeat writes `member_presence` every 30 s per tab (`src/lib/presence.ts:16`, `presence-heartbeat.tsx:91`), and because `member_presence` is in the Realtime publication, every write is also fanned out to every presence subscriber.

### 3.14 Process-local state that breaks with more than one instance

| State | File | Effect with N instances |
|---|---|---|
| Rate limiter buckets | `src/lib/rate-limit.ts:46` | Each limit becomes N times looser. Affects send, broadcast, AI auto-reply per account (protects the customer's own LLM key), OAuth, MCP, Razorpay checkout |
| 2FA gate cache (20 s) | `src/lib/two-factor/gate.ts:85` | Harmless (short TTL, fails closed) |
| Subscription gate config cache | `src/lib/subscription/gate-cache.ts` | Harmless (short TTL) |
| Next.js data and ISR cache | Next default, per instance | Stale CMS pages differ per instance unless a shared cache handler is configured (Next self-hosting guide) |
| Server Action encryption key, deployment id | Next default | Must be pinned for multiple instances (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `deploymentId`, per the Next self-hosting guide in `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`) |

### 3.15 Public pages

`src/app/page.tsx:67` and the docs, legal, contact and integration pages are `force-dynamic`. The landing page runs a `Promise.all` of CMS queries (line 80) on every visit (MEASURED: `site_settings` 58,166 sequential scans, landing tables about 9,300 each). `next.config.ts` sets `s-maxage=300` but there is no shared cache in front of Node, so the header has no effect today. These pages contain no per-user data (the signed-in redirect happens in `proxy.ts`), so they can be cached.

### 3.16 Node process

One `node server.js` process per container uses one core for JavaScript; the second vCPU of the t4g.micro mostly serves nginx and the OS. No `NODE_OPTIONS`, no memory limit in `docker-compose.prod.yml`, no `stop_grace_period`. Next's built-in gzip runs in Node by default; if nginx is configured to compress (not verified, the server's nginx site file is not in the repo), turning off Next's compression moves that CPU to nginx. Node 22's global `fetch` keeps connections alive by default, and the service-role Supabase clients are module-level singletons, so connection reuse to Supabase and Meta is already in place; that item from the brief is low impact.

---

## 4. Workload model

### 4.1 Assumptions per active workspace per day (ESTIMATE)

Indian SMB using the product daily with 2 to 3 agents, 5 to 10 automations, a weekly broadcast, an AI agent, occasional Sheets and MCP use.

| Driver | Per workspace per day | Basis |
|---|---|---|
| Inbound customer messages | 60 | Small retail or service business |
| Outbound agent messages | 50 | |
| Bot messages (AI 15, automations 15, flows 10) | 40 | |
| Broadcast recipients | 300 average (one 2,000-recipient campaign per week) | Capped early on by Meta portfolio limits of 250, then 2,000, 10,000, 100,000 unique users per 24 h ([Meta messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)) |
| Status webhooks | ~1,000 (390 outbound x ~2.6) | MEASURED ratio in §2.2 |
| Automation runs | 30 | |
| AI auto-replies | 15 | |
| MCP tool calls | 10 | Minority of workspaces |
| Public API and Sheets calls | 50 | |
| Agent page and API requests through Next | 1,500 | Inbox, contacts, settings, media views |
| Browser PostgREST requests | 1,500 | Lists, threads, dashboard |
| Presence heartbeats | 2,880 (3 agents x 8 h x 120/h) | `HEARTBEAT_MS = 30_000` |
| Realtime channels while online | 15 to 25 (3 agents, 1 to 2 tabs each, 5 to 8 channels) | §3.13 |

### 4.2 DB round trips per unit of work (MEASURED from code, §3)

| Unit | Round trips |
|---|---|
| Status webhook | 4 to 5 (7 to 10 for broadcast statuses, including trigger updates) |
| Inbound message, nothing configured | 16 to 20 |
| Inbound message with AI reply | 28 to 32 plus LLM and Meta |
| Automation run with one send | ~10 |
| Broadcast recipient | 7 to 11 plus one Meta call |
| MCP tool call | 7 (gate) + tool queries + 1 to 2 (audit) |
| Authenticated API call through proxy | 2 Auth + 3 to 4 PostgREST before handler work |

### 4.3 Daily totals per workspace (ESTIMATE)

| Category | Requests or statements per day |
|---|---|
| Status webhooks: 1,000 x 5 | 5,000 |
| Inbound processing: 60 x 18 | 1,080 |
| Broadcast: 300 x 9 | 2,700 |
| Automations and AI: 30 x 10 + 15 x 14 | 510 |
| Proxy and handler auth for 1,500 Next requests: x 5 | 7,500 (of which 3,000 go to Auth) |
| Browser PostgREST | 1,500 |
| Presence | 2,880 |
| Cron share, MCP, API | ~300 |
| **Total** | **about 21,000 DB-side requests** and **about 1,100 Meta webhook POSTs** |

### 4.4 Platform rates (ESTIMATE)

Peak factor: 70% of traffic in a 10-hour business day gives about 1.7x the 24-hour average; the 10:00 to 12:00 IST window with broadcasts adds another 2x to 3x.

| | 1,000 workspaces | 10,000 | 100,000 |
|---|---|---|---|
| DB-side requests, average | 245/s | 2,450/s | 24,500/s |
| DB-side requests, business-hour peak | 600 to 900/s | 6,000 to 9,000/s | 60,000 to 90,000/s |
| Meta webhooks, average | 13/s | 130/s | 1,300/s |
| Meta webhooks, morning broadcast peak (5% of workspaces broadcasting at once at the current ~4 msg/s each, x2.6 statuses) | ~520/s | ~5,200/s | ~52,000/s |
| DB statements from that webhook peak alone (x5) | ~2,600/s | ~26,000/s | ~260,000/s |
| Realtime channels at peak (60% online, 18 each) | ~10,800 | ~108,000 | ~1,080,000 |
| New `messages` storage (450 rows/day x 2.2 KB, broadcasts included) | ~30 GB/month | ~300 GB/month | ~3 TB/month |

If broadcasts are sped up to Meta's 80 messages per second (recommended, §6), peak webhook rates per broadcasting workspace rise 20x. Meta advises sizing webhook servers for 3x outgoing plus 1x incoming traffic ([Meta throughput](https://developers.facebook.com/docs/whatsapp/throughput)), which is why the queue in §5 must exist before the sender gets faster.

### 4.5 What the current box can hold (ESTIMATE)

Node CPU per workspace per day: 1,100 webhooks x ~6 ms + 1,500 Next requests x ~15 ms + 300 broadcast sends x ~10 ms + automations and AI ~2 s, roughly **35 to 60 CPU-seconds per workspace per day**. A t4g.micro earns a baseline of 10% per vCPU, 20% of one vCPU across both ([AWS burstable baseline](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html)), which is about 17,000 CPU-seconds per day if spread evenly, enough on paper for ~300 workspaces. Traffic is not spread evenly, the single Node process can only use one core, and memory (903 MB with 389 MB free) is consumed by concurrent broadcasts and media proxying. A realistic ceiling is **80 to 150 daily-active workspaces** on the box, and the Supabase Free Realtime limit binds earlier (§3.13). T4g instances launch in unlimited mode by default, billing surplus CPU at a flat rate per vCPU-hour ([AWS unlimited mode](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode-concepts.html)); at about $0.04 per vCPU-hour (figure from an [AWS re:Post answer](https://www.repost.aws/it/questions/QU3_rVJhlLT-q1Uqm-YnODTw/burstable-instance-surplus-cpu-credits-charge), confirm on the EC2 pricing page), a micro pegged at 100% costs about $52 a month extra, more than a c7g.large. A busy micro is false economy.

---

## 5. Platform limits (current, with sources)

### 5.1 Meta WhatsApp Cloud API

| Limit | Value | Source |
|---|---|---|
| Throughput per business number | 80 msg/s default, up to 1,000 by automatic upgrade; inbound and outbound both count; error 130429 when exceeded | [Throughput](https://developers.facebook.com/docs/whatsapp/throughput) |
| Coexistence numbers (Business App plus Cloud API) | Fixed 20 msg/s | same |
| Upgrade eligibility | Unlimited messaging limit, 100,000+ unique users outside the service window in 24 h, quality Medium or better | same |
| Webhook latency standard | Median under 250 ms, under 1% above 1 s; Meta delivers concurrently | same |
| Webhook retries | Up to 7 days with exponential backoff | same |
| Webhook sizing guidance | 3x outgoing plus 1x incoming traffic | same |
| Messaging limits (unique users per rolling 24 h, per portfolio) | 250, then 2,000, 10,000, 100,000, unlimited | [Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits) |
| Media | Webhook media ids downloadable for 7 days; download URLs valid 5 minutes; documents up to 100 MB | [Media](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media) |

Webhook payloads can carry several `entry`, `changes` and `statuses` items in one POST; the code already loops over them. Meta does not order status webhooks and redelivers them, which `fn_apply_message_status` already handles.

### 5.2 Supabase

Compute sizes ([Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk), [Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute)):

| Size | USD/month | CPU | RAM | Max connections | Pooler clients | Recommended max DB |
|---|---|---|---|---|---|---|
| Nano (Free) | $0 | Shared | 0.5 GB | 60 | 200 | 500 MB |
| Micro | ~$10 | Shared | 1 GB | 60 | 200 | 10 GB |
| Small | ~$15 | Shared | 2 GB | 90 | 400 | 50 GB |
| Medium | ~$60 | Shared | 4 GB | 120 | 600 | 100 GB |
| Large | ~$110 | 2 dedicated | 8 GB | 160 | 800 | 200 GB |
| XL | ~$210 | 4 dedicated | 16 GB | 240 | 1,000 | 500 GB |
| 2XL | ~$410 | 8 dedicated | 32 GB | 380 | 1,500 | 1 TB |
| 4XL | ~$960 | 16 dedicated | 64 GB | 480 | 3,000 | 2 TB |
| 8XL | ~$1,870 | 32 dedicated | 128 GB | 490 | 6,000 | 4 TB |
| 16XL | ~$3,730 | 64 dedicated | 256 GB | 500 | 12,000 | 10 TB |

Paid plans include $10 of compute credit per month; read replicas bill at the primary's compute size and do not receive credits ([Read replicas](https://supabase.com/docs/guides/platform/manage-your-usage/read-replicas)). Disk beyond 8 GB is $0.125/GB.

Plans and Realtime ([Pricing](https://supabase.com/pricing), [Realtime limits](https://supabase.com/docs/guides/realtime/limits)):

| | Free | Pro | Pro, no spend cap | Team |
|---|---|---|---|---|
| Base | $0 | $25 | $25 | $599 (list) |
| Automatic backups | Not included | 7 days | 7 days | 14 days |
| PITR | No | $100/month per 7 days | same | same |
| Realtime concurrent connections | 200 | 500 | 10,000 | 10,000 |
| Realtime messages per second | 100 | 500 | 2,500 | 2,500 |
| Realtime overage | | $10 per 1,000 peak connections, $2.50 per million messages beyond 5 million | | |
| Egress | 5 GB | 250 GB then $0.09/GB | | |

Postgres Changes authorises each change per subscriber and processes changes on a single thread; bigger compute does not meaningfully raise its throughput ([Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)). This is the architectural ceiling for the current inbox design.

### 5.3 AWS (ap-south-1)

EC2 on-demand Linux, from the [DevZero ap-south-1 price list](https://www.devzero.io/instances/aws/regions/ap-south-1) (rounded to three decimals; confirm on the AWS EC2 pricing page):

| Type | vCPU | RAM | USD/hour | USD/month (730 h) |
|---|---|---|---|---|
| t4g.micro | 2 (10% baseline each) | 1 GB | 0.006 | ~4.4 |
| t4g.small | 2 (20%) | 2 GB | 0.011 | ~8 |
| t4g.medium | 2 (20%) | 4 GB | 0.022 | ~16 |
| t4g.large | 2 (30%) | 8 GB | 0.045 | ~33 |
| c7g.large | 2 | 4 GB | 0.049 | ~36 |
| m7g.large | 2 | 8 GB | 0.058 | ~42 |
| c7g.xlarge | 4 | 8 GB | 0.098 | ~72 |
| m7g.xlarge | 4 | 16 GB | 0.117 | ~85 |

Baselines from [AWS burstable credits](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html). One- or three-year Savings Plans typically cut Graviton prices by 30 to 50% (ESTIMATE).

Other services (ESTIMATE, AWS list prices as recalled; verify in the Pricing Calculator):

| Service | Price assumption |
|---|---|
| Application Load Balancer | ~$0.024/hour (~$18/month) plus ~$0.008 per LCU-hour |
| ElastiCache for Valkey, cache.t4g.small | ~$0.03/hour (~$25/month); Valkey is priced below Redis OSS |
| SQS standard | First 1 million requests per month free, then ~$0.40 per million |
| S3 Standard | ~$0.025/GB-month in Mumbai |
| CloudFront to India | ~$0.11/GB for the first 10 TB |
| Data transfer out of EC2 | ~$0.11/GB after the free allowance |
| RDS for PostgreSQL db.m7g.large Multi-AZ | ~$250 to $300/month plus storage |

Lambda is not recommended for the webhook processor: Supabase connection limits and PostgREST round trips make long-lived workers cheaper and simpler than per-invocation functions at these volumes.

### 5.4 Node.js and Next.js

- One Node process runs JavaScript on one core. Use one container (or cluster worker) per vCPU.
- `after()` is fully supported with `next start`; graceful shutdown on SIGTERM drains it, and Next recommends a 10 to 30 s drain (`self-hosting.md`).
- Multiple instances need a shared Server Action encryption key, a `deploymentId` for version skew, and a shared cache handler if ISR or `use cache` is used (`self-hosting.md`).
- The proxy runs before every matched route; anything it awaits adds to every request.

---

## 6. CPU and DB reduction, prioritised

Impact and effort are relative (H/M/L). Savings are ESTIMATES unless marked.

| # | Problem (file:line) | Change | Saving | Risk | Feature improvement | Impact / Effort |
|---|---|---|---|---|---|---|
| 1 | Production on Free, dev shares prod (§1.1) | Upgrade org to Pro; create a separate dev project (a second Free project or a Micro on Pro); point devcrm at it | Removes dev load from prod; raises Realtime to 500 | Low; downtime only if compute size changes | Backups for paying customers; safe experiments | H / L |
| 2 | `flagBroadcastReplyIfAny` seq scan (`webhook/route.ts:2233`) | Index `broadcast_recipients (contact_id, created_at DESC) WHERE status IN ('sent','delivered','read')` | 44 ms to under 1 ms per inbound now (MEASURED baseline); prevents multi-second scans later | Low | Reply attribution stays instant | H / L |
| 3 | RLS per-row functions (§3.6) | Rewrite policies to `account_id IN (SELECT my_account_ids())` with a STABLE SECURITY DEFINER helper, wrap `auth.uid()` as `(SELECT auth.uid())`, merge duplicate permissive policies; add explicit `.eq('account_id', ...)` in list queries; index `contacts (account_id, created_at DESC)` | Contacts list 465 ms to ~20 ms (MEASURED); profiles seq scans largely disappear | Medium: security-sensitive, needs policy tests | Faster contacts, inbox, dashboard | H / M |
| 4 | Unfiltered Realtime (`use-realtime.ts:50, 61`, `use-total-unread.ts:48`) | Short term: filter `conversations` by `account_id=eq.<id>`, drop the duplicate conversations subscription from the sidebar by sharing one channel. Medium term: add `account_id` to `messages` and switch to private Broadcast channels (`account:<id>`) fed by a DB trigger or by the worker after each write | Most of the 26,131 s Realtime DB time; per-change RLS checks drop from all subscribers to one account's | Medium | Lower latency inbox; the only design that works at 10k+ | H / M |
| 5 | Presence writes every 30 s (`presence.ts:16`) | Realtime Presence for live state, write `last_seen_at` at most every 5 minutes or on tab close | ~100% of 128k `touch_presence` calls (MEASURED); ~1,000 writes/s avoided at 10k | Low | Instant online/away instead of up to 30 s lag | H / L |
| 6 | Webhook work in memory (`route.ts:331`) | Store-then-process: insert raw payload into `whatsapp_webhook_events` (one INSERT, dedupe key) before 200; workers claim with `FOR UPDATE SKIP LOCKED`, the same pattern as `billing_webhook_events` | Ack path stays ~5 ms of CPU; processing moves off web instances; batches enable #7 | Medium: new table, worker process | No lost messages on deploy or crash; replay; admin visibility | H / M |
| 7 | 4 to 5 round trips per status, 3 trigger updates (`route.ts:1980`, migration 005) | One `fn_apply_status_batch(jsonb)` that updates messages, recipients and returns fan-out targets, applied set-based to ~100 statuses per claim; replace the per-column trigger with a statement-level trigger using transition tables (one `UPDATE broadcasts` per broadcast per batch) | 80 to 95% of status-path DB work | Medium | Campaign counters stay live under heavy campaigns, no lock queue | H / M |
| 8 | Inbound path, 16 to 20 round trips (§3.1) | Cache `whatsapp_config` by `phone_number_id` (60 s), cache per-account "what is configured" (automations by trigger, active flows, AI enabled, opt-in config, webhook endpoints) in Valkey, invalidated on write; one automations query for all trigger types; skip the redundant ownership check from the webhook; replace prior-count `count: 'exact'` with `EXISTS`; atomic unread increment | 16 to 20 to about 8 for unconfigured workspaces | Low to medium | Fixes the unread-count race (`route.ts:2486`) | H / M |
| 9 | Broadcast sequential and browser-driven (§3.2) | Broadcast worker: audience resolved once with a batched `INSERT ... ON CONFLICT (account_id, phone_normalized) DO NOTHING RETURNING` plus one select; paced parallel sends per number (token bucket at 20 or 80 msg/s, back off on 130429); batched message inserts and recipient stamps (100 rows per statement) | ~2,000 sequential round trips per 1,000 recipients to under 50; send speed 5x to 20x | Medium: must raise webhook capacity first (#6, #7) | Campaigns continue with the tab closed; resumable; faster | H / H |
| 10 | Dashboard JS aggregation (`dashboard/queries.ts:124, 197`) | SQL RPCs (`date_trunc` buckets, window functions for response time), later a daily rollup table updated by the worker | Removes row transfer; 100 ms to a few ms | Low | Correct charts beyond 1,000 messages | M / L |
| 11 | `use-total-unread.ts:30` loads all conversations | `count(*) WHERE unread_count > 0` RPC, Realtime delta handling unchanged | 27 ms per load (MEASURED) to ~1 ms | Low | Correct badge for large inboxes | M / L |
| 12 | Proxy does Auth plus 2 to 3 queries per request (`proxy.ts:137, 323, 357`); handlers repeat it | Verify JWT locally (`getClaims()` with asymmetric keys, confirm support first); cache profile and account gate row in Valkey or an in-process LRU for 30 to 60 s keyed by user id, invalidated on ban, role or subscription change; pass resolved context to handlers via request headers | 50 to 70% of per-request auth overhead | Medium: ban and lapse take up to the TTL to apply | Faster every page and API call | H / M |
| 13 | In-memory rate limits (`rate-limit.ts:46`) | Same `checkRateLimit` signature backed by Valkey (`INCR` plus `PEXPIRE`, or a Lua sliding window) | Not a CPU saving; it is what allows more than one instance | Low | Limits that hold at any instance count, protecting customers' LLM keys and Meta quality | H (at 1k) / L |
| 14 | Cron loops (§3.3 to 3.5) | A scheduler process (one container) enqueues jobs; workers claim bounded batches with leases. Automations: SKIP LOCKED batch claim of 500, every minute. Flows: one set-based `UPDATE ... RETURNING`. Alerts: one grouped count query ordered by `last_evaluated_at NULLS FIRST`, write only on change | Removes cron from the web process; raises the waits ceiling from 14,400/day to effectively unbounded | Low | Waits fire on time; every alert is evaluated | H / M |
| 15 | Media proxy buffering (`media/[mediaId]/route.ts`) | Worker downloads inbound media once into S3 (`chat-media`), stores the key; inbox reads via short-lived signed CloudFront or S3 URLs; mark any proxy response `private` | Removes per-view Meta calls and Node buffering | Low | Media survives past Meta's 7-day expiry; faster loads | H / M |
| 16 | `force-dynamic` public pages (`app/page.tsx:67` and others) | `export const revalidate = 300` or `use cache` with a tag revalidated from the CMS save routes; optionally nginx `proxy_cache` or CloudFront for HTML | Near 100% of landing CMS queries and SSR CPU | Low | Faster landing page, better SEO | M / L |
| 17 | `api_keys.last_used_at` on every call (`api-context.ts:108`) | Throttle to once per 60 s per key, as `/mcp` does | ~99% of those writes | Low | None visible | L / L |
| 18 | No memory guard on the box | `NODE_OPTIONS=--max-old-space-size=384` on the micro (larger on bigger instances), `mem_limit` and `stop_grace_period: 30s` in compose | Avoids OOM-kill of the whole container; lets `after()` drain on deploy | Low | Fewer lost webhooks on deploy | M / L |
| 19 | One process per container | On instances with 2+ vCPU run one container per vCPU behind nginx `upstream` (needs #13 and the Next multi-instance settings) | Uses the second core: ~1.8x throughput per box | Low | | M / L |
| 20 | Next gzip in Node | If nginx gzip or brotli is enabled, set `compress: false` in `next.config.ts`; serve `/_next/static` from nginx or CloudFront | 5 to 15% of Node CPU on page traffic | Low | | L / L |
| 21 | Suffix phone match (`dedupe.ts:127`) | Store a generated `phone_last8` column with index `(account_id, phone_last8)`, or a reversed-text index | New-contact lookup from an account scan to an index probe | Low | | M / L |
| 22 | Contacts `ilike` search 2.4 s (MEASURED) | `pg_trgm` GIN indexes on name, phone digits and email, scoped by account | Seconds to tens of milliseconds | Low | Usable search on big lists | M / L |
| 23 | `McpServer` per request (`mcp/route.ts`) | Profile first; if construction exceeds a few ms, build the tool registry once and bind per-request context | Small | Low | | L / L |

---

## 7. Architecture per tier

### 7.1 Target shape (all tiers)

```
Meta, Razorpay ──► ALB / nginx ──► web (Next.js)  ──► INSERT raw event ──► 200
                                         │
                                         ▼
                              queue (Postgres SKIP LOCKED  → SQS at 10k)
                                         │
                ┌────────────────────────┼─────────────────────────┐
         webhook workers          broadcast senders         scheduler + job workers
   (status batches, inbound,   (paced per phone number,     (automation waits, flows
    media to S3, AI, flows,      batched writes)              sweep, alerts, emails,
    automations)                                              billing reconcile)
                │                        │                          │
                └──────────► Postgres (Supabase or RDS) ◄───────────┘
                                         │
                       Realtime: account-scoped Broadcast channels
                                         │
                                     browsers
   Valkey: rate limits, config caches, gate cache, send pacing tokens
   S3 + CloudFront: media and static assets
```

The web tier only authenticates, renders and enqueues. Everything Meta-driven or long-running runs in workers built from the same image with a different entry command, so the codebase stays one repo and one build.

### 7.2 1,000 workspaces

| Layer | Choice | Reasoning |
|---|---|---|
| Web | 2 x c7g.large (or t4g.large in unlimited mode), 2 Node containers each, behind an ALB; ASG min 2 max 4 on CPU 60% | Peak ~200 Next requests/s plus webhook acks |
| Workers | 2 x c7g.large: webhook processors (concurrency 20 to 50) and broadcast senders | Peak ~520 status webhooks/s, batched |
| Scheduler | One small container (on a worker box) replacing host crontab | Removes cron from web |
| Queue | Postgres table with SKIP LOCKED, partitioned by day, dropped after 7 to 14 days | No new service; matches the billing pattern |
| Database | Supabase Pro, Large compute (160 connections, 8 GB) moving to XL by month 9 to 12 as data passes ~200 GB; Supavisor transaction mode for workers; PITR on | ~30 GB/month growth |
| Realtime | Filtered channels and Presence now (#4, #5); Pro without spend cap to allow ~10,000 peak connections | Peak ~10,800 channels; move to Broadcast channels during this tier |
| Cache | ElastiCache Valkey cache.t4g.small | Rate limits, config and gate caches, send pacing |
| Media | Inbound media to S3 by worker; CloudFront for media and `/_next/static` | |
| Data lifecycle | Keep 12 months of `messages` hot; plan monthly range partitions | |
| Observability | CloudWatch agent or Grafana Cloud free tier, Sentry free tier, alarms on 5xx, p99 ack latency, queue lag, DB CPU and connections, Realtime peak, cron failures | |
| Backups | Supabase daily plus PITR; weekly `pg_dump` to S3 with lifecycle | |
| Dev and staging | Separate Supabase projects; staging on Micro for load tests | Mandatory before load testing |

Monthly cost (ESTIMATE):

| Item | USD |
|---|---|
| EC2: 4 x c7g.large | 145 |
| ALB | 25 to 35 |
| Supabase Pro + Large compute − credit | 125 |
| Supabase disk ~150 GB average | 18 |
| Supabase PITR 7 days | 100 |
| Supabase Realtime overage (~9,500 connections above 500, ~40 million extra messages) | 95 + 100 |
| Supabase dev and staging projects | 10 to 25 |
| Valkey | 25 |
| S3 and CloudFront (media, static) | 40 to 80 |
| EBS, data transfer, CloudWatch, Sentry | 40 to 80 |
| **Total** | **~$750 to $1,000 (₹66k to ₹88k)** |

### 7.3 10,000 workspaces

| Layer | Choice |
|---|---|
| Web | ECS on Fargate Graviton or an ASG of c7g.xlarge, 4 to 8 instances, autoscaled on request count and CPU |
| Workers | Separate services: webhook processors (6 to 10 c7g.large), broadcast senders (4 to 6), AI and automation workers (2 to 4, I/O-bound) |
| Queue | SQS standard for raw webhooks (ack path writes to SQS, not Postgres), with a DLQ; Postgres outbox for internal jobs |
| Database | Option A: Supabase 4XL ($960) plus 1 to 2 read replicas for dashboards, exports and super-admin. Option B: RDS or Aurora PostgreSQL with PgBouncer, keeping Supabase Auth or migrating Auth (see `docs/supabase-to-aws-migration.md`). Decide on cost and Realtime: if Realtime moves off Supabase, Option B is usually cheaper |
| Schema | `messages.account_id` NOT NULL, monthly range partitions, indexes leading with `account_id`; `broadcast_recipients` partitioned likewise; archive partitions older than 12 months to S3 (Parquet) with an "older messages" on-demand loader |
| Realtime | 100,000+ channels: either Supabase Enterprise with custom limits, or a small WebSocket gateway (2 to 4 c7g.large, Valkey pub/sub fan-out, JWT auth, one socket per tab with account and user topics). Workers publish after commit |
| Cache | Valkey cluster mode, 2 to 3 shards of cache.m7g.large |
| Rollups | Daily per-account counters (messages by sender, broadcasts, AI tokens) maintained by workers; dashboards and alerts read rollups only |
| Observability | Managed Prometheus and Grafana or Datadog, structured logs to CloudWatch with retention, SLOs: webhook ack p99 under 1 s, queue lag p95 under 30 s, inbox realtime p95 under 2 s |

Monthly cost (ESTIMATE): web $400 to $600, workers $400 to $700, gateway $150 to $300, ALB $80 to $150, database $2,500 to $4,000 (4XL plus replicas plus disk, or RDS equivalent), Valkey $250 to $400, SQS ~$400 (about 1 billion requests), S3 and CloudFront $300 to $600, observability $200 to $500. **Total about $5,000 to $8,000 (₹4.4 to ₹7 lakh).**

### 7.4 100,000+ workspaces

A single Postgres primary at 60,000 to 90,000 requests per second at peak, with ~3 TB of new messages a month, is past what one cluster should carry. Use **cells**:

- A cell is a full 10k-tier stack: its own Postgres cluster, workers, queues and Realtime gateway, holding ~10,000 workspaces.
- A thin global layer: a routing table (`account_id` and `phone_number_id` to cell) in a small replicated database cached in Valkey; the webhook ingress looks up the cell from `metadata.phone_number_id` and enqueues into that cell's queue.
- Auth: a global identity service (Supabase Auth or Cognito) with tokens that carry `account_id` and cell.
- Super-admin and billing analytics read a warehouse (S3 plus Athena, or ClickHouse) fed by change data capture from every cell, never by cross-cell queries.
- Migrations run per cell with a canary cell first.
- Razorpay webhooks route by subscription to the owning cell.

Cost (ESTIMATE): 8 to 12 cells at $3,500 to $5,000 each with Savings Plans and RDS reserved instances, plus a global layer of $2,000 to $5,000: **about $40,000 to $70,000 per month (₹35 to ₹62 lakh)**, roughly ₹35 to ₹60 per workspace.

### 7.5 Dev and production on one database

Strongly recommended to separate now. Today:

- Dev and prod compete for 60 connections and the Free plan's 200 Realtime connections.
- A dev migration, test seed or bad query runs against customer data; a dev cron or webhook test writes into production tables.
- Load testing is impossible without endangering production.
- `AGENTS.md` notes the billing flag cannot be flipped for dev because the database is shared; this coupling grows with every feature.

Cost: zero on Free (two free projects are allowed per [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)), about $10 per month on Pro. Work: a second project, migrations applied there, devcrm environment variables re-pointed, an anonymised data copy.

---

## 8. Roadmap

### 8.1 Quick wins this month on the current t4g.micro

Ordered so each is independently shippable.

1. Move the Supabase organisation to Pro; enable daily backups; add a weekly `pg_dump` to S3.
2. Create a separate dev project and re-point devcrm.
3. Add the `broadcast_recipients (contact_id, ...)` index and `contacts (account_id, created_at DESC)`.
4. Add explicit `account_id` filters to contacts lists, dashboard queries and `use-total-unread`.
5. Filter the `conversations` Realtime subscriptions by `account_id`; share one channel between inbox and sidebar.
6. Presence: Realtime Presence, or as a stop-gap raise `HEARTBEAT_MS` to 120 s.
7. Throttle `api_keys.last_used_at`; make the alerts cron write only on change and order by `last_evaluated_at`.
8. Atomic `unread_count` increment.
9. Dashboard series and response time as SQL RPCs.
10. `revalidate = 300` on landing, docs, legal and integration pages.
11. `NODE_OPTIONS=--max-old-space-size=384`, `stop_grace_period: 30s`, a CloudWatch alarm on `CPUCreditBalance` and on memory.
12. Raise the automations cron batch and switch its claim to a SKIP LOCKED RPC.

Expected effect (ESTIMATE): 40 to 60% less DB time, the Realtime fan-out bounded per account, and the micro's practical ceiling roughly doubled.

### 8.2 Before 1,000 workspaces

- `whatsapp_webhook_events` store-then-process with a worker container; batched status SQL; statement-level broadcast counters.
- Per-account configuration caches; Valkey-backed rate limiter.
- Broadcast worker (server-side, resumable, paced per number); the wizard enqueues instead of looping in the browser.
- Inbound media persisted to S3; CloudFront for media and static assets.
- Scheduler process replacing `cron-ping.sh`; all jobs bounded with leases.
- RLS policy rewrite with tests; `pg_trgm` search.
- ALB with two web instances, Next multi-instance settings (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `deploymentId`), rolling deploys instead of `docker compose up -d` on a single box.
- Observability and alarms; staging stack and the load tests in §9.

### 8.3 Before 10,000 workspaces

- `messages.account_id`, monthly partitions, archival to S3; partition `broadcast_recipients` and the webhook events table.
- Realtime on private Broadcast channels or a dedicated WebSocket gateway.
- SQS for webhook ingress; separate autoscaled worker services.
- Daily rollup tables for dashboards, usage alerts and super-admin.
- Decide Supabase 4XL plus replicas versus RDS or Aurora, using load-test numbers.
- Supabase Auth getClaims (or equivalent local verification) and cached gates in the proxy.

### 8.4 Before 100,000 workspaces

- Cell architecture, global routing, per-cell deploys and migrations.
- Warehouse for analytics and super-admin.
- Savings Plans and reserved database capacity.
- Formal SLOs, on-call, chaos testing of a cell failure.

---

## 9. Load-testing plan

### 9.1 Where

Never against production, and not against devcrm while it shares the production database. Build a **staging stack**: a separate Supabase project (Micro or the target compute size), one EC2 instance matching the tier under test, the same image, and an anonymised copy of production data scaled up synthetically (for example 1,000 accounts, 5 million messages). Point the Meta Graph base URL at a **stub server** that returns realistic wamids with 150 to 300 ms latency and occasional 130429 errors; if the code has no base-URL override, add one behind an environment flag used only in staging. Never send real WhatsApp messages from a load test.

### 9.2 Tools

- **k6** for HTTP and WebSocket scenarios (`k6/experimental/websockets` or the `ws` module).
- A small Node script to generate Meta webhook payloads and sign them with the staging app secret (HMAC SHA-256 over the raw body, header `x-hub-signature-256`), matching `verifyMetaWebhookSignature`.
- Supabase Observability, `pg_stat_statements` (reset before each run), CloudWatch, and the Realtime report.

### 9.3 Scenarios

| Scenario | Shape | Pass criteria |
|---|---|---|
| Webhook burst | Replay signed status and inbound payloads at 50, 200, 500, 1,000 req/s for 10 minutes, mixing statuses for one large broadcast with inbound from many accounts | Ack p50 under 250 ms, p99 under 1 s (Meta's standard); 0 non-2xx; queue lag p95 under 30 s; zero lost or duplicated messages (reconcile counts against generated payloads) |
| Broadcast | Campaigns of 1,000, 10,000 and 50,000 recipients through the stub, 1 to 20 concurrently | Sustained send rate at the configured pace (20 or 80 msg/s per number); recipient and broadcast counters exactly match; no lock waits over 1 s |
| Agents with Realtime | M = 100, 500, 2,000 virtual agents: open WebSocket, subscribe to the same channels as the inbox, poll lists, send replies | Realtime delivery p95 under 2 s from DB commit; no `too_many_connections` or `tenant_events` errors; page API p95 under 500 ms |
| MCP | 50 concurrent connections, 2 calls/s each, mixed read and write tools | p95 under 800 ms excluding tool DB time; audit rows equal calls |
| Public API and Sheets | 100 keys at 2 req/s each | Limits enforced across all instances (proves the Valkey limiter) |
| Cron at scale | 50,000 due waits, 20,000 active flow runs, 5,000 alerts | Each job drains within its interval; web latency unaffected |
| Deploy under load | Rolling deploy during the webhook burst | Zero lost webhooks |

### 9.4 Metrics to capture

Requests per second and latency percentiles per route; Node event-loop lag and CPU per container; memory and GC; DB CPU, active connections versus `max_connections`, lock waits, top statements by total time, rows per call, dead tuples on `broadcasts`, `conversations` and `messages`; queue depth and age; Realtime peak connections and messages per second; Meta stub 130429 rate; error logs grouped by tag (for example `[webhook][contact-resolution-failed]`).

Fail any run where DB CPU is above 70% sustained, connections above 80% of the limit, or event-loop lag p99 above 200 ms; those are the levels at which real traffic spikes turn into retries.

---

## 10. Risks and open questions

**Risks**

1. **No managed backups today.** Production is on Supabase Free. One bad migration or accidental delete is unrecoverable except from manual dumps.
2. **Shared dev and production database.** Load from dev, accidental writes and quota sharing.
3. **In-memory webhook processing.** A crash or deploy during a burst silently loses inbound messages that Meta will not resend.
4. **Realtime design.** Unfiltered `postgres_changes` hits Supabase's single-threaded ceiling regardless of compute size. This is the most expensive thing to change late.
5. **Unread count race** (`webhook/route.ts:2486`) and **alerts starvation** beyond 200 alerts: correctness bugs that grow with volume.
6. **Silent truncation** in dashboard and unread queries past PostgREST's row cap.
7. **Inbound media expiry** after 7 days at Meta; old media in the inbox is already broken for that reason.
8. **Faster broadcasts amplify webhook load.** Shipping the faster sender before the queue and batched status path would move the bottleneck straight onto the database.
9. **t4g unlimited-mode billing** if CPU stays high; a CloudWatch billing alarm is cheap insurance.
10. **Meta portfolio messaging limits** and quality rating affect customers' broadcast success more than infrastructure does; surface the tier and Meta's own errors in the UI.

**Open questions**

1. How does Supabase count this project's Realtime "concurrent connections": per socket or per channel? Check the Realtime report before sizing.
2. What is the project's PostgREST `max_rows` setting (Supabase default is 1,000)?
3. Is gzip or brotli enabled in the server's nginx site config (not in the repo)?
4. Exact Supabase compute size of this project (settings are consistent with Nano or Micro, both 60 connections).
5. Real per-workspace message volumes once there are 50+ paying customers: rerun §4 with measured numbers.
6. Does `@supabase/supabase-js` 2.107 with this project's JWT configuration support local verification via `getClaims()`?
7. Average and peak broadcast size per customer segment, which drives the webhook peak more than any other input.
8. Whether to stay on hosted Supabase past 10k (Enterprise Realtime and 4XL plus replicas) or move to RDS plus a custom WebSocket gateway; decide with load-test data and the cost model in `docs/supabase-to-aws-migration.md`.

---

## Appendix: how the measurements were taken

All database figures came from read-only queries through the Supabase MCP against project `dknolotutfiesuhbhmze` on 24 Oct 2026: `pg_stat_statements` (top 30 by total time), `pg_stat_user_tables`, `pg_indexes`, `pg_policies`, `pg_proc`, `pg_publication_tables`, `realtime.subscription`, `pg_stat_activity`, `pg_settings`, and the Supabase performance advisor. `EXPLAIN (ANALYZE, BUFFERS)` was run inside `BEGIN READ ONLY ... ROLLBACK` with `SET LOCAL ROLE authenticated` and a JWT claim for an existing owner of a non-protected account. The protected account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d` was excluded from every per-account query. No statement wrote data.

Source code references are to the working tree at the time of writing; line numbers may drift with later edits, so the function names are given alongside them.
