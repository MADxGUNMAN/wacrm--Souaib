# Supabase dependency, and what moving to AWS would cost

**Measured 21 Aug 2026** against the live project `dknolotutfiesuhbhmze` and
commit `44fdc9e`. Every number below came from a query or a code scan, not an
estimate — the commands are in [Appendix A](#appendix-a--how-to-re-measure) so
you can re-run them as the codebase changes.

---

## 1. The short answer

Supabase is doing **five jobs** for this app. One is already gone, two are
straightforward, and two are genuine lock-in.

| Job                         | How coupled                                                 | Effort to leave                      |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| File storage                | **Not coupled at all** — 0 references                       | Already done (S3)                    |
| Auth emails                 | **Not coupled** — own SMTP                                  | Already done                         |
| Postgres database           | 84 plain-SQL migrations, portable extensions                | **Low**                              |
| Row Level Security          | 120 policies, but 104 funnel through _one_ function         | **Low** (surprisingly)               |
| Query layer (`supabase-js`) | **843** `.from()` calls in 223 files                        | **High**                             |
| Auth                        | 95 calls, 15 methods, **46 foreign keys** into `auth.users` | **High**                             |
| Realtime                    | 6 channels over 6 tables                                    | **High — no managed AWS equivalent** |

**And the finding that matters most for your decision:**

> Your Supabase organisation is on the **Free plan**. You are paying **$0/month**
> today. Every AWS option below costs **more** than that, not less.

So this migration is not a cost saving. It is a decision about control,
lock-in and scaling headroom. That is a legitimate reason to do it — but it
should be made with the price tag facing the right direction.

---

## 2. Where you are today

|               |                                                                |
| ------------- | -------------------------------------------------------------- |
| Database      | Supabase Postgres **17.6**, **24 MB**                          |
| Rows          | 6 users, 5 accounts, 53 contacts, 3 conversations, 32 messages |
| Supabase plan | **Free** ($0/mo)                                               |
| App server    | 1× EC2 **t4g.micro** (2 vCPU, 1 GB RAM, arm64), `us-east-1`    |
| Files         | AWS S3 bucket `replai-jc`, `us-east-1`                         |
| Email         | Own SMTP                                                       |
| Runtime       | Next.js 16.2.6, single Docker container behind nginx           |

**The data is tiny.** That is the single biggest argument for moving _now_
rather than later: a 24 MB dump with 6 users is a coffee-break migration.
At 24 GB with 500 accounts it is a project with a rollback plan.

---

## 3. What is already independent

Worth stating plainly, because it is real progress and it shrinks the job:

- **File storage.** `0` calls to `storage.from()`. Uploads go browser → S3
  via presigned URLs (`/api/storage/presign`). Nothing to move.
- **Transactional email.** Password resets use `admin.generateLink` purely to
  mint a token, then send through your own SMTP
  (`src/app/api/auth/forgot-password/route.ts`). You are not dependent on
  Supabase's mail.
- **Edge Functions.** `0` calls to `functions.invoke()`. Nothing deployed there.
- **`supabase_vault`.** Installed by default but **`0` references in code**.
  Drop it.
- **Migrations are plain SQL.** 84 files, no proprietary DSL.

---

## 4. The five dependencies, measured

### 4.1 Postgres — easy

66 tables, 158 functions, 32 triggers, 1 view, 6 extensions.

| Extension                 | Available on RDS / Aurora?      |
| ------------------------- | ------------------------------- |
| `plpgsql`                 | Yes (built in)                  |
| `pgcrypto`                | Yes                             |
| `uuid-ossp`               | Yes                             |
| `pg_stat_statements`      | Yes                             |
| `vector` (pgvector 0.8.2) | **Yes** — RDS PostgreSQL 15.5+  |
| `supabase_vault`          | No — **but unused, so drop it** |

There is no blocker here. `pgvector` backs one column,
`ai_knowledge_chunks.embedding`, and RDS supports it.

### 4.2 Row Level Security — much easier than the count suggests

This was the most useful discovery in the whole review:

| How a policy establishes identity | Count   |
| --------------------------------- | ------- |
| via `is_account_member()`         | **104** |
| direct `auth.uid()`               | 12      |
| via `is_super_admin()`            | 3       |
| via `auth.jwt()` / `auth.role()`  | 1       |
| no identity reference             | 4       |
| **Total**                         | **120** |

And `is_account_member()` looks like this — its _only_ Supabase dependency is
a single `auth.uid()`:

```sql
CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id uuid,
  min_role account_role_enum DEFAULT 'member'
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()          -- <<< the one line that is Supabase
      AND p.account_id = target_account_id
      AND ...role ranking...
  );
$$;
```

**Porting the permission model = rewriting one function + 12 policies.** Not 120. On plain Postgres, `auth.uid()` becomes something like
`current_setting('app.user_id', true)::uuid`, set per connection or per
transaction by your app.

### 4.3 The query layer — the expensive part

`supabase.from('contacts').select(...)` is **not SQL**. It is a client library
speaking to PostgREST. Point the app at plain RDS and all 843 calls stop
working.

| Where               | Files   | Queries | RLS actually applies?             |
| ------------------- | ------- | ------- | --------------------------------- |
| Client components   | 62      | **212** | Yes                               |
| Server routes + lib | 161     | **631** | **No** — service-role bypasses it |
| **Total**           | **223** | **843** |                                   |

Read that second row carefully: **75% of your queries already bypass RLS**,
because they run server-side with the service-role key (225 `supabaseAdmin()`
call sites). RLS is only load-bearing for the 212 client-side queries.

That opens a strategic option covered in [§7.2](#72-the-decision-that-halves-the-work).

### 4.4 Auth — the hard one

Fifteen distinct methods, 95 call sites:

| Method                      | Calls |     | Method                         | Calls |
| --------------------------- | ----- | --- | ------------------------------ | ----- |
| `auth.getUser()`            | 32    |     | `auth.updateUser()`            | 2     |
| `auth.getSession()`         | 12    |     | `auth.resetPasswordForEmail()` | 1     |
| `auth.uid()` (in SQL)       | 8     |     | `auth.signUp()`                | 1     |
| `auth.admin.generateLink()` | 5     |     | `auth.onAuthStateChange()`     | 1     |
| `auth.signOut()`            | 5     |     | `auth.admin.deleteUser()`      | 1     |
| `auth.signInWithPassword()` | 3     |     | `auth.admin.createUser()`      | 1     |
|                             |       |     | `auth.admin.getUserById()`     | 1     |
|                             |       |     | `auth.admin.updateUserById()`  | 1     |
|                             |       |     | `auth.verifyOtp()`             | 1     |

**In your favour:** no OAuth, no social login, no magic links, no MFA. Email
and password only. That is a small surface.

**Against you — the schema, not the code:**

- **46 foreign keys point at `auth.users`.** That is a Supabase-managed table
  in a schema you do not own.
- **2 triggers live on `auth.users`:**
  - `on_auth_user_created` → `handle_new_user()` (creates the `profiles` row)
  - `on_auth_user_updated` → `handle_user_update()` (syncs email into `profiles`)
- Sessions are cookies via `@supabase/ssr`, refreshed in `src/proxy.ts:92`
  where `getUser()` transparently renews an expired access token.

Moving auth means creating your own `users` table, re-pointing 46 FKs at it,
and moving both triggers into application code.

### 4.5 Realtime — the one with design risk

6 channels, 9 `postgres_changes` listeners:

| File                                          | Purpose                    |
| --------------------------------------------- | -------------------------- |
| `src/app/(dashboard)/inbox/page.tsx:56`       | live conversation list     |
| `src/components/inbox/message-thread.tsx:512` | live messages + reactions  |
| `src/hooks/use-presence.ts:85`                | who is online              |
| `src/hooks/use-realtime.ts:48`                | shared subscription helper |
| `src/hooks/use-total-unread.ts:46`            | unread badge               |
| `src/hooks/use-unread-notifications.ts:34`    | notification bell          |

Publication `supabase_realtime` covers: `conversations`, `messages`,
`message_reactions`, `flow_runs`, `member_presence`, `notifications`.

**AWS has no managed equivalent.** There is no service that streams Postgres
row changes to browsers. This is the piece you _rebuild_, not port.

---

## 5. The two paths, explained simply

Before the detailed target architecture, it's worth understanding that
"move to AWS" is not one thing — there are two genuinely different paths, and
they trade code effort against ops effort in opposite directions.

### Path A — Self-host Supabase's own software on an AWS server

**The idea in plain words:** Supabase is not magic — it's four open-source
programs wired together (a database, a login service, a translator, and a
live-update service). Right now Supabase runs those four programs _for_ you,
on _their_ servers. Path A means downloading that same set of four programs
and running them yourself, on your own EC2 server, instead of theirs.

**Your app cannot tell the difference.** From your Next.js code's point of
view, it's still saying `supabase.from('contacts').select(...)` and
`supabase.auth.getUser()` exactly as it does today. It's just that those
requests now travel to a server you pay for and control, instead of one
Supabase operates. That is why the code changes are almost nothing — you are
not replacing the translator, you're just moving the building it lives in.

**The four programs, and what each one actually does:**

| Program                   | Plain-words job                                             | Is it required for this app?       |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| **Postgres**              | The actual database — where every row of every table lives  | Yes, obviously                     |
| **GoTrue** ("Auth")       | Handles login, logout, password reset, "who is this person" | Yes — this app calls it 95 times   |
| **PostgREST** ("the API") | Translates `.from('contacts').select()` into real SQL       | Yes — this app calls it 843 times  |
| **Realtime**              | Pushes "a new message arrived" to the browser instantly     | Yes — the live inbox depends on it |

Two more exist in the full stack but you don't need them, because you
already moved off them:

| Program | Job                               | Needed here?                                          |
| ------- | --------------------------------- | ----------------------------------------------------- |
| Storage | File uploads                      | **No** — you already use S3 directly                  |
| Studio  | The visual dashboard/table editor | Optional, nice for browsing data, not required to run |

### Does it run _everything_ — auth, database, webhooks — on the EC2 box?

**The database and auth: yes, both run on the box, as two of those four
Docker containers.** Your existing app container (Next.js) sits alongside
them on the _same_ server, or on a separate small server next to it — your
choice.

**Webhooks: no change needed, and they don't run "inside" Supabase at all.**
Your Meta/WhatsApp webhook is a route in _your own_ Next.js app
(`src/app/api/whatsapp/webhook/route.ts`) — it already runs on your EC2 box
today and continues to, completely unrelated to whichever database sits
behind it. Self-hosting Supabase doesn't move your webhook anywhere; it only
changes where the database and login service live.

So the honest picture of one server running all of it:

```
┌─────────────────────────────── one EC2 server ───────────────────────────────┐
│                                                                                │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐           │
│  │  Postgres  │   │   GoTrue   │   │ PostgREST  │   │  Realtime  │           │
│  │ (database) │   │   (auth)   │   │ (the API)  │   │(live push) │           │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘           │
│         ▲                ▲                ▲                ▲                 │
│         └────────────────┴────────┬───────┴────────────────┘                 │
│                                    │                                          │
│                          ┌──────────────────┐                                │
│                          │  Your Next.js    │  ← webhook route lives here,   │
│                          │  app (unchanged) │    exactly as it does today    │
│                          └──────────────────┘                                │
│                                    │                                          │
│                              nginx (unchanged)                                │
└────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                              the internet / Meta
```

Five containers on one box. Your webhook is the same box either way — it
just now talks to a database next door instead of a database at
`supabase.co`.

### What size EC2 server does this actually need?

Your current server is a **t4g.micro**: 2 vCPU, **1 GB of RAM**. Supabase's
own documentation is direct about this — their published minimum for running
the full stack is **4 GB of RAM**, with 8 GB+ _recommended_ for anything
beyond a toy deployment. Your box has a quarter of the minimum.

This isn't a "might be tight" situation, it's a "will not start" situation:
five database-and-API programs will not fit in 1 GB alongside your existing
app, and this is exactly the kind of box that gets picked off by the Linux
out-of-memory killer under load — the same failure mode already documented
in this repo's `AGENTS.md` for a single 100 MB file upload on this box.

| Instance                        | vCPU | RAM  | ~Cost/mo (`us-east-1`, on-demand) | Verdict                                           |
| ------------------------------- | ---- | ---- | --------------------------------- | ------------------------------------------------- |
| `t4g.micro` (what you have now) | 2    | 1 GB | ~$6                               | **Too small — will not run this**                 |
| `t4g.medium`                    | 2    | 4 GB | **~$24.50**                       | Meets Supabase's _minimum_. Workable, no headroom |
| `t4g.large`                     | 2    | 8 GB | **~$49**                          | Meets the _recommended_ size. Comfortable         |

**Realistic recommendation: `t4g.large`.** Running below the recommended size
means every future feature (the alerts cron, AI auto-reply, template sends)
is competing for a shrinking pool of memory on the same box that also runs
your database — and you would be reading this exact kind of AGENTS.md-style
incident report again, just about Postgres this time instead of an upload
route.

### What you get, and what you give up

**You get:** almost no code changes. Change the connection URL and the API
keys in your `.env`, and the 843 `.from()` calls plus the 95 auth calls all
keep working, because they're still talking to the exact same kind of
translator — just one you now run.

**You give up:** Supabase currently patches, backs up, and monitors those
four programs for you, for free, as part of the Free plan. The moment you
self-host, **that becomes your job.** You are now the one who:

- Applies security patches to Postgres, GoTrue, PostgREST and Realtime
- Takes and tests backups (Supabase does this automatically today)
- Notices and fixes it if one of the four containers crashes at 2 a.m.
- Handles version upgrades between the four services, which must stay
  compatible with each other

None of that is code — it's **ongoing operational work**, every month,
indefinitely. That is the real cost of Path A, and it's the reason the table
at the top of this document lists it as "ops burden" rather than "dollars."

### Time estimate

**Realistic for a weekend**, per the setup above — clone Supabase's official
Docker Compose file, plug in a `t4g.large`, point your `.env` at the new
`SUPABASE_URL`, restart. You keep every line of your 843 database calls and
95 auth calls exactly as written today.

### Path B, in the same plain words, for contrast

Path A moves the _same four programs_ to a server you own. Path B **replaces**
them with different, AWS-native services — RDS instead of self-run Postgres,
Better Auth instead of GoTrue, your own `pg`/Drizzle calls instead of
PostgREST, AppSync instead of Realtime. That's the version covered in
detail in §7 through §10: no ops burden (RDS is managed for you), but every one
of the 843 database calls and 95 auth calls has to be rewritten, because
you're no longer speaking the language those specific programs understand.

---

## 6. Target architecture on AWS (Path B)

| Piece       | Today                     | On AWS                                                             | Notes                                     |
| ----------- | ------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Database    | Supabase Postgres         | **RDS PostgreSQL** (or Aurora Serverless v2)                       | `pg_dump`/`pg_restore`. Enable `pgvector` |
| Auth        | Supabase Auth (GoTrue)    | **Better Auth** or **Auth.js** in-app                              | See §6.1 — Next.js has none built in      |
| Query layer | `supabase-js` + PostgREST | **Drizzle**, **Prisma** or `pg`                                    | 843 rewrites                              |
| Realtime    | Supabase Realtime         | **AppSync** subscriptions _or_ **API Gateway WebSockets** + Lambda | Or self-host Supabase Realtime            |
| Files       | S3                        | **S3**                                                             | No change                                 |
| Email       | SMTP                      | **SES** (optional)                                                 | No change needed                          |
| Hosting     | EC2 t4g.micro + Docker    | Same, or **ECS Fargate** / **App Runner**                          | No change needed                          |
| Secrets     | `.env` on box             | **Secrets Manager** / **SSM Parameter Store**                      | Optional improvement                      |
| Cron        | crontab + `cron-ping.sh`  | **EventBridge Scheduler**                                          | Optional improvement                      |

### 5.1 About "built-in Next.js authentication"

Worth being precise, because it changes the plan: **Next.js has no built-in
authentication.** Checked against your installed version (16.2.6) —
`node_modules/next/dist/docs/01-app/02-guides/authentication.md` explains how
to build sessions yourself, and then says:

> _"While you can implement a custom auth solution, for increased security and
> simplicity, we recommend using an authentication library."_

Next.js gives you the **primitives** — Server Actions for login forms,
cookies, and the Proxy for route protection. The libraries it lists include
**Better Auth**, **NextAuth.js (Auth.js)**, **Ory**, **Logto**, plus hosted
options (Auth0, Clerk, WorkOS). For sessions specifically it points at
**Jose** and **Iron Session**.

Three realistic routes:

| Option                         | What you own                      | Fit here                                                                                                                                      |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Better Auth**                | Your DB, your tables, your server | **Best fit.** Owns its own `user`/`session` tables in _your_ Postgres, so the 46 FKs get a real local table to point at                       |
| **Auth.js (NextAuth v5)**      | Your DB via an adapter            | Solid, larger ecosystem, more ceremony for plain email+password                                                                               |
| **Custom** (`jose` + `argon2`) | Everything                        | You already have SMTP, rate limiting and email templates — genuinely viable, but you would be writing security code                           |
| **AWS Cognito**                | AWS owns identity                 | _Not recommended here._ Keeps identity outside your DB, so the 46-FK problem stays, and its hosted flows are less flexible than what you have |

Cognito looks like the "AWS-native" answer but it reproduces the exact
coupling you are trying to remove. If the goal is owning your data, put the
users in your own Postgres.

---

## 7. Code changes required

### 6.1 The work, by area

| #   | Area                                                        | Scale               | Risk                           |
| --- | ----------------------------------------------------------- | ------------------- | ------------------------------ |
| 1   | Provision RDS, restore dump, drop `supabase_vault`          | 1 DB                | Low                            |
| 2   | Replace `auth.uid()` in `is_account_member()` + 12 policies | 13 objects          | Low                            |
| 3   | Recreate `users` table; re-point **46 FKs**                 | 46 constraints      | **Medium**                     |
| 4   | Move 2 `auth.users` triggers into app code                  | 2 triggers          | Low                            |
| 5   | Swap auth library; rewrite **95** auth calls                | 95 sites            | **Medium**                     |
| 6   | Session cookies + `src/proxy.ts` refresh logic              | 1 file + helpers    | **Medium**                     |
| 7   | Replace **843** `.from()` queries                           | 223 files           | **High volume, low risk each** |
| 8   | Rebuild **6** realtime channels                             | 6 channels          | **High — design risk**         |
| 9   | Set `app.user_id` per request so RLS still works            | connection layer    | Medium                         |
| 10  | Rewrite tests that mock `@supabase/*`                       | ~40 files import it | Low                            |

Item 7 is the bulk of the hours. Item 8 is where the unknowns are.

### 6.2 The decision that halves the work

**Do you keep RLS at all?**

75% of queries already bypass it. If you move the remaining **212 client-side
queries behind API routes**, then:

- You do not need PostgREST or an RLS-aware client
- You do not need `app.user_id` plumbing (item 9 disappears)
- Permission checks become ordinary server-side code, next to your validation
- The browser stops holding a database-capable credential entirely

Cost: 212 queries become API endpoints. Benefit: items 2 and 9 vanish, and the
security model gets easier to reason about — one place that checks
permissions instead of two.

**Recommendation: take this option.** Your codebase is already 75% of the way
there, and it is the direction you have been moving anyway (the presigned
upload work, the alerts API, the star/pin/hide routes).

### 6.3 Files that concentrate the change

Good news: the client construction is already centralised. These are the choke
points:

```
src/lib/supabase/client.ts        browser client
src/lib/supabase/server.ts        server client (@supabase/ssr cookies)
src/lib/auth/admin-client.ts      service-role client  (225 call sites)
src/proxy.ts                      session refresh + route gating
src/hooks/use-auth.ts             the hook most components read
```

Five files decide _how_ you talk to Supabase. The other 223 decide _what_ you
ask for.

---

## 8. Impact and risks

### What users would notice if it went wrong

| Risk                          | Consequence                                                                             | Mitigation                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Realtime regression**       | Inbox stops updating live. For a WhatsApp CRM this is the core experience, not a nicety | Build and test realtime **first**, on a branch, before touching anything else               |
| **Session invalidation**      | Every user logged out at cutover                                                        | Expected and acceptable at 6 users. Plan the comms                                          |
| **Password migration**        | Supabase stores bcrypt hashes. If they cannot be exported, everyone resets              | Verify hash export **before** committing. You have working reset email already              |
| **RLS gap during transition** | A tenant sees another tenant's data                                                     | Do not run half-migrated. Move all client queries server-side in one release                |
| **FK rewrite mistakes**       | Orphaned rows, failed cascades                                                          | `accounts.owner_user_id` is `ON DELETE RESTRICT`; deletion order matters (see AGENTS.md §4) |
| **Webhook downtime**          | Meta retries, so brief gaps are survivable                                              | Keep the same domain; do not change the webhook URL                                         |

### What does _not_ change

- WhatsApp / Meta integration — untouched
- S3 storage and presigned uploads — untouched
- nginx, TLS, the domain, the deployment pipeline — untouched
- All 158 Postgres functions and 32 triggers — they are standard Postgres
- SMTP email — untouched

That is a decent share of the system left alone.

---

## 9. Cost comparison

> **Approximate, `us-east-1`, single-AZ, as of Aug 2026.** Verify against the
> [AWS Pricing Calculator](https://calculator.aws) before committing — prices
> move and vary by region.

### Today

| Item                 | Cost                                          |
| -------------------- | --------------------------------------------- |
| Supabase (Free plan) | **$0**                                        |
| EC2 t4g.micro        | ~$6/mo (or $0 if still in a free-tier window) |
| S3 (a few GB)        | <$1/mo                                        |
| **Total**            | **~$6–7/mo**                                  |

### After moving to AWS

| Item                            | Approx / mo          | Note                                                                 |
| ------------------------------- | -------------------- | -------------------------------------------------------------------- |
| RDS `db.t4g.micro` PostgreSQL   | ~$12–15              | Free for 12 months only if your account signed up before 15 Jul 2025 |
| RDS storage 20 GB gp3 + backups | ~$3–5                |                                                                      |
| EC2 t4g.micro (unchanged)       | ~$6                  | Likely needs upsizing — see below                                    |
| S3                              | <$1                  | Unchanged                                                            |
| Realtime (AppSync or API GW WS) | ~$0–5 at your volume | Usage-based; cheap while small                                       |
| Secrets Manager (optional)      | ~$0.40/secret        |                                                                      |
| **Total**                       | **~$22–32/mo**       |

### The comparison that actually matters

| Scenario                                                         | Monthly     |
| ---------------------------------------------------------------- | ----------- |
| **Today** (Supabase Free + EC2 `t4g.micro`)                      | **~$6**     |
| Supabase **Pro** + EC2                                           | ~$31        |
| **Full AWS rewrite — Path B** (RDS + EC2 + realtime)             | **~$22–32** |
| **Self-host Supabase — Path A** (EC2 `t4g.large` + your app box) | **~$55–61** |

Path A's number comes straight from §5: a `t4g.large` running the four
Supabase services (~$49/mo, `us-east-1` on-demand) plus your existing app
box (~$6/mo). It is the **most expensive** option on this list, because it
duplicates infrastructure Supabase already runs efficiently at scale — you
are paying for a dedicated server sized to Supabase's own stated minimum, on
top of what you already pay for your app.

**Four honest conclusions:**

0. **Path A (self-host) is the worst deal financially, not the best.** It
   promises "almost no code changes" but delivers the highest bill of any
   option here, because you're renting a whole extra server just to run
   software Supabase already operates at scale for you. Choose it only if
   the goal is _control_, not _savings_.
1. **Moving to AWS now roughly 4–5×'s your bill**, from ~$6 to ~$25+. You are
   comparing paid infrastructure against a free tier.
2. **Against Supabase Pro, AWS is roughly a wash.** The moment you outgrow the
   Free plan — 500 MB database, or the project pausing after inactivity — the
   comparison becomes even, and AWS starts winning at scale because RDS
   reserved instances and Savings Plans discount steeply while Supabase's tiers
   step up.
3. **The hidden cost is engineering, not hosting.** At any sane hourly rate,
   the weeks of work in §7 dwarf several years of the ~$20/mo difference. The
   money is not the reason to do this or to avoid it.

### The cost nobody puts in the table

Self-hosting means **you** own backups, patching, failover, connection
pooling, monitoring and the 3 a.m. page. Supabase Free currently does that for
nothing. Today your entire ops burden is one `t4g.micro` and an automatic
reboot window — RDS is managed too, but the realtime layer would not be.

---

## 10. If you decide to do it

Order matters. This sequence keeps a working app at every step:

1. **Spike realtime first, on a branch.** It is the only piece with genuine
   unknowns. If AppSync or WebSockets cannot give you what
   `postgres_changes` does, you want to know that in week one, not month three.
2. **Verify password hashes are exportable.** Before anything else. If not,
   the plan needs a forced-reset step.
3. **Move the 212 client queries behind API routes** — _while still on
   Supabase_. This is the highest-value step because it is useful on its own,
   ships incrementally, and deletes items 2 and 9 from the work list.
4. **Swap the DB.** `pg_dump` → RDS, replace the query layer, keep auth on
   Supabase for now. App still works.
5. **Swap auth last.** New `users` table, re-point the 46 FKs, move the 2
   triggers, adopt Better Auth. This is the only step with a hard cutover.
6. **Decommission** the Supabase project once nothing references it.

Steps 1–3 are worth doing **whether or not you ever migrate.**

---

## 11. Recommendation

**Do not migrate now.** Nothing is hurting you, you are paying nothing, and
the work is measured in weeks.

**Do three things that reduce lock-in and are worth doing anyway:**

1. **Stop adding client-side database queries.** New features go through API
   routes. This shrinks the 212 and puts validation where it belongs.
2. **Funnel auth through one internal module.** 32 scattered `getUser()` calls
   should become one `getCurrentUser()`. Then swapping providers is one file
   instead of ninety-five.
3. **Fold the 12 direct `auth.uid()` policies into `is_account_member()`.**
   Small work now; it makes the identity swap a single-function change.

**Revisit the decision when any of these becomes true:**

- You outgrow the Supabase Free plan and Pro pricing starts to bite
- Realtime, RLS or connection limits become a real constraint
- A customer contract requires data in your own infrastructure
- The database gets big enough that migration stops being a coffee break —
  **this is the one with a deadline, and it is quietly ticking**

---

## 12. What this document does _not_ cover

Stated so nobody treats it as more settled than it is:

- **No pricing was tested.** Figures are approximate; run the AWS calculator.
- **Realtime replacement was not prototyped.** The claim that AppSync or API
  Gateway WebSockets can replace `postgres_changes` is reasonable but unproven
  _for this app_.
- **Password hash export was not attempted.** Treat it as unknown until tested.
- **No load or performance comparison** between Supabase Postgres and RDS at
  your query patterns.
- **Aurora Serverless v2** was not evaluated; it may be cheaper at bursty low
  volume, or more expensive at steady low volume.
- **Effort estimates are ranges, not quotes.** 843 mechanical query rewrites
  are predictable; rebuilding realtime is not.

---

## Appendix A — how to re-measure

These are the exact commands behind the numbers above. Re-run them before
trusting this document after significant development.

```powershell
# Query-layer coupling, split by client vs server
$all = Get-ChildItem -Recurse -Include *.ts,*.tsx -Path src -File
$cf=0;$cq=0;$sf=0;$sq=0
foreach ($f in $all) {
  $t = Get-Content -LiteralPath $f.FullName -Raw
  if (-not $t) { continue }
  $m = ([regex]::Matches($t, "\.from\(")).Count
  if ($m -eq 0) { continue }
  if ($t -match "use client") { $cf++; $cq += $m } else { $sf++; $sq += $m }
}
"client: $cf files / $cq queries;  server: $sf files / $sq queries"

# Auth surface
Select-String -Path ($all | % FullName) -Pattern "auth\.(admin\.)?[a-zA-Z]+\(" -AllMatches |
  % { $_.Matches } | % { $_.Value } | Group-Object | Sort Count -Desc
```

```sql
-- How policies establish identity (the number that decides RLS portability)
with p as (
  select coalesce(qual,'') || ' ' || coalesce(with_check,'') as body
  from pg_policies where schemaname='public'
)
select
  count(*) filter (where body like '%auth.uid()%')        as direct_auth_uid,
  count(*) filter (where body like '%is_account_member%') as via_helper,
  count(*)                                               as total
from p;

-- Foreign keys tying the schema to Supabase Auth
select count(*) from pg_constraint c
join pg_class t on t.oid = c.confrelid
join pg_namespace n on n.oid = t.relnamespace
where c.contype='f' and n.nspname='auth' and t.relname='users';

-- Triggers living in the auth schema
select t.tgname, p.proname from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='auth' and not t.tgisinternal;

-- Extensions, and which are Supabase-only
select extname, extversion from pg_extension order by extname;

-- Realtime surface
select tablename from pg_publication_tables where pubname='supabase_realtime';
```
