# Codebase Guide — understanding your own project

You know how the CRM behaves. This document teaches you where that behaviour
**lives**, so you can look at any filename in this repo and immediately know
three things: is it frontend or backend, who calls it, and what breaks if you
change it.

No prior knowledge assumed. Read section 1 and 2, then use section 6 as a
lookup table forever after.

---

## 1. The one mental model that explains everything

Your CRM is four layers. Every single feature you have ever used passes
through them in the same order.

```
   YOU (browser)
        │
        │  clicks a button
        ▼
┌───────────────────────────────────────────────┐
│ 1. SCREENS + WIDGETS      (frontend)          │
│    src/app/(dashboard)/**  ← the pages        │
│    src/components/**       ← the widgets      │
│    Runs INSIDE the user's browser.            │
└───────────────────────────────────────────────┘
        │
        │  fetch('/api/whatsapp/send')
        ▼
┌───────────────────────────────────────────────┐
│ 2. DOORS                  (backend / APIs)    │
│    src/app/api/**/route.ts                    │
│    Runs on the SERVER. Checks who you are,    │
│    then hands the real work to layer 3.       │
└───────────────────────────────────────────────┘
        │
        │  calls a plain function
        ▼
┌───────────────────────────────────────────────┐
│ 3. THE BRAIN              (business logic)    │
│    src/lib/**                                 │
│    All the actual rules and maths. Knows      │
│    nothing about buttons or URLs.             │
└───────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
┌──────────────────┐    ┌────────────────────────┐
│ 4a. DATABASE     │    │ 4b. META (WhatsApp)    │
│ Supabase/Postgres│    │ graph.facebook.com     │
│ shape defined in │    │ reached only from       │
│ supabase/        │    │ layer 3, never from     │
│   migrations/    │    │ the browser             │
└──────────────────┘    └────────────────────────┘
```

**The single most useful rule in this document:** the folder tells you the
layer.

| If the path contains…       | It is…                     | Runs where            |
| --------------------------- | -------------------------- | --------------------- |
| `src/app/` + `page.tsx`     | a screen the user sees     | browser (mostly)      |
| `src/components/`           | a reusable widget          | browser               |
| `src/app/api/` + `route.ts` | a backend door (API)       | server                |
| `src/lib/`                  | business logic / rules     | server, mostly        |
| `src/hooks/`                | reusable browser behaviour | browser               |
| `supabase/migrations/`      | database shape changes     | database              |
| ends in `.test.ts`          | an automated check         | nowhere in production |

Your project currently has **57 pages**, **148 API doors**, **263 logic
files**, **189 widgets**, **109 test files**, and **105 database
migrations**. That is the whole thing.

---

## 2. Follow one real click, end to end

Take the thing you do most: **typing a message in the Inbox and pressing
send.** Here is every file it touches, in order.

**Step 1 — the screen.** `src/app/(dashboard)/inbox/page.tsx`
Line 1 of that file is `'use client'`, which means "this runs in the
browser." It holds the three-panel inbox layout and the currently selected
conversation.

**Step 2 — the widgets.** `src/components/inbox/message-thread.tsx`,
`conversation-list.tsx`, `contact-sidebar.tsx`
The page doesn't draw the chat bubbles itself; it delegates. This is why the
page file stays readable even though the inbox is your most complex screen.

**Step 3 — the door.** `src/app/api/whatsapp/send/route.ts`
When you press send, the browser calls this URL. Read its opening comment —
it describes itself as "a thin adapter." That is deliberate. It does exactly
four things:

1. Confirms you are logged in (`supabase.auth.getUser()`)
2. Rate-limits you so a runaway script can't spam Meta
3. Works out which **account** (workspace) you belong to
4. Hands off to the brain

**Step 4 — the brain.** `src/lib/whatsapp/send-message.ts`
The function `sendMessageToConversation()` holds the real rules: validate the
payload, call Meta, save the message row, pause any running automation for
that contact. This file is where the actual behaviour lives.

**Step 5 — Meta.** `src/lib/whatsapp/meta-api.ts`
The only file in the project that talks to `graph.facebook.com`. Everything
Meta-related funnels through here.

**Step 6 — the database.** The message row is written to Supabase, and
`supabase/migrations/001_initial_schema.sql` (plus 104 later migrations) is
what defines the columns it's written into.

### Why layer 3 exists at all

Look at step 4 again. `sendMessageToConversation()` is used by **two**
different doors: the dashboard's `/api/whatsapp/send` (you, clicking) and the
public API's `/api/v1/messages` (a customer's script). Same rules, same
result, one copy of the logic. That is the entire reason `src/lib/` is
separate from `src/app/api/`.

---

## 3. Messages coming IN — the webhook

Sending is you pushing. Receiving is Meta pushing _you_. That needs a
different kind of door, called a webhook.

**The file:** `src/app/api/whatsapp/webhook/route.ts`

A webhook is just an API door with two unusual properties:

- **Nobody is logged in.** Meta's servers call it, not a human with a
  session cookie. So it cannot use the normal "who are you?" check.
- **It must prove the caller is really Meta.** It does this with
  `verifyMetaWebhookSignature()` from
  `src/lib/whatsapp/webhook-signature.ts`. Without that check, anyone who
  learned your URL could inject fake customer messages.

This single file is the busiest in your project, because one inbound message
can trigger many things. Its imports tell you the whole story:

| It calls                           | Which does                                     |
| ---------------------------------- | ---------------------------------------------- |
| `lib/contacts/dedupe.ts`           | find the existing contact, or create one       |
| `lib/whatsapp/opt-out-inbound.ts`  | detect "STOP" and honour the opt-out           |
| `lib/automations/engine.ts`        | fire matching automations                      |
| `lib/flows/engine.ts`              | advance any running flow                       |
| `lib/ai/auto-reply.ts`             | let the AI agent answer                        |
| `lib/webhooks/deliver.ts`          | forward the event to _your_ customer's webhook |
| `lib/whatsapp/template-webhook.ts` | record template approval/rejection             |
| `lib/whatsapp/coexistence.ts`      | sync history from the WhatsApp Business app    |

**How your open inbox sees the message instantly** — there's no refresh and
no polling. `src/hooks/use-realtime.ts` opens a live websocket to Supabase
and listens for new rows in the messages table. The webhook writes a row; the
database pushes it to every open browser. That's why the inbox feels
instant.

Note the `maxDuration = 60` near the top of the webhook file, and the
`after()` import. `after()` means "reply to Meta immediately, then keep
working." Meta retries if you're slow, so you answer fast and do the heavy
lifting afterwards.

---

## 4. Who is allowed to do what

Three concepts, easily confused. They are genuinely different.

### 4a. The gatekeeper — `src/proxy.ts`

This runs **before every single request** in your app. In older Next.js
versions this file was called `middleware.ts`; Next.js 16 renamed the
convention to `proxy`. Same idea.

It is the bouncer at the door, and it enforces, in order:

1. Refreshes your login session (and carefully carries the rotated cookies
   onto every response — the comment there explains a real bug that came from
   getting this wrong)
2. Signed-in users never see the landing or login pages
3. Signed-out users can't reach `/dashboard`, `/inbox`, `/contacts`, etc.
4. Super admins stay in `/super-admin`; normal users stay out of it
5. Banned accounts go to `/banned`
6. Lapsed subscriptions get redirected to `/upgrade-plan`

The `UNGATED_API_PREFIXES` list at the top is worth understanding: `/api/billing`
stays open when an account is blocked, because otherwise a lapsed customer
could never pay to recover. `/api/whatsapp/webhook` stays open too, so
inbound messages keep arriving even while outbound is cut off.

### 4b. Three different database connections

This trips up everyone. Same database, three keys, very different powers.

| File                           | Who it acts as                         | Can it bypass security rules? |
| ------------------------------ | -------------------------------------- | ----------------------------- |
| `src/lib/supabase/client.ts`   | the logged-in user, **in the browser** | No                            |
| `src/lib/supabase/server.ts`   | the logged-in user, **on the server**  | No                            |
| `src/lib/auth/admin-client.ts` | the system itself (service role)       | **Yes — full access**         |

The first two are restricted by **RLS** (Row Level Security) — rules stored
inside Postgres itself saying "you may only read rows belonging to your own
account." That is what stops customer A seeing customer B's contacts even if
the code has a bug.

The admin client bypasses RLS completely. It exists because some work has no
logged-in user to act as: the webhook (Meta isn't a user), the public API (a
script isn't a user), background refreshes. **Every query made with the admin
client must filter by `account_id` by hand**, because the automatic safety net
is switched off. You'll see that discipline in
`src/lib/auth/api-context.ts`, which spells it out in its header comment.

### 4c. Roles and permissions

`src/lib/auth/roles.ts` — only two roles exist: `owner` and `member`. An
owner can do everything. A member's abilities come entirely from a
permissions object stored on their profile row.

`src/hooks/use-can.ts` is the browser side: it returns a plain yes/no that
screens use to disable buttons, mark inputs read-only, or change tooltip
wording. Its sibling `src/components/auth/require-role.tsx` (`<RequireRole min="owner">`)
hides whole sections outright.

But greying out a button is cosmetic — the real enforcement is
`requireRole()` in `src/lib/auth/account.ts`, called on the server, plus RLS
in the database. A determined user can re-enable anything in their own
browser; they cannot talk their way past those two.

---

## 5. You have three separate APIs, and they authenticate differently

This is the part most people miss.

| Folder                  | Who calls it         | How it proves identity                        | Example                 |
| ----------------------- | -------------------- | --------------------------------------------- | ----------------------- |
| `src/app/api/**`        | your own CRM screens | session cookie (you're logged in)             | `api/whatsapp/send`     |
| `src/app/api/v1/**`     | your customers' code | API key: `Authorization: Bearer wacrm_live_…` | `api/v1/messages`       |
| `src/app/api/public/**` | anonymous visitors   | nothing — deliberately open                   | `api/public/newsletter` |

There are two matching helpers, one per identity style, and they are worth
knowing by name:

- `getCurrentAccount()` in `src/lib/auth/account.ts` — cookie session → your
  account. Used by the dashboard's own doors.
- `requireApiKey()` in `src/lib/auth/api-context.ts` — API key → an account.
  Used by every `/api/v1` door.

The API-key check lives in `src/lib/auth/api-context.ts` (`requireApiKey`).
It also rate-limits per key and checks _scopes_ — a key granted only
`contacts:read` cannot send messages. Response shapes for the public API are
standardised in `src/lib/api/v1/respond.ts`, and the whole surface is
documented for customers in `docs/public-api.md`.

`src/app/api/super-admin/**` is a fourth, narrower surface: platform-operator
only, protected by the `is_super_admin` flag that `src/proxy.ts` checks.

---

## 6. Lookup table — what every folder is for

### Screens: `src/app/`

Next.js turns folders into URLs. A folder containing `page.tsx` becomes a
visitable page.

| Path                                    | URL              | Note                   |
| --------------------------------------- | ---------------- | ---------------------- |
| `src/app/page.tsx`                      | `/`              | public landing page    |
| `src/app/(auth)/login/page.tsx`         | `/login`         |                        |
| `src/app/(dashboard)/inbox/page.tsx`    | `/inbox`         |                        |
| `src/app/(dashboard)/settings/page.tsx` | `/settings`      |                        |
| `src/app/(super-admin)/…`               | `/super-admin/…` | platform operator area |

**Parentheses folders like `(dashboard)` do NOT appear in the URL.** They
exist purely to group pages that share a layout. That's why `/inbox` is not
`/dashboard/inbox` despite living inside `(dashboard)`. The shared frame those
pages get is `src/app/(dashboard)/layout.tsx` plus `dashboard-shell.tsx` —
the sidebar and header you see on every CRM screen.

Special filenames inside `src/app/`:

| File                      | Meaning                                               |
| ------------------------- | ----------------------------------------------------- |
| `page.tsx`                | a visitable screen                                    |
| `layout.tsx`              | a frame wrapped around every page beneath it          |
| `route.ts`                | an API door — **not** a screen, returns data not HTML |
| `globals.css`             | app-wide styling                                      |
| `robots.ts`, `sitemap.ts` | generated SEO files                                   |

### Widgets: `src/components/`

189 reusable pieces, grouped by feature. `inbox/`, `contacts/`, `templates/`,
`broadcasts/`, `flows/`, `automations/`, `settings/`, `super-admin/`,
`landing/`, `dashboard/`, `billing/`, `pipelines/`, `agents/`, `media/`.

Two special ones:

- **`src/components/ui/`** — 28 generic building blocks (button, dialog,
  table, input). These come from shadcn/ui and are configured by
  `components.json` at the project root. They know nothing about WhatsApp;
  they are the raw material every other component is built from.
- **`src/components/providers/`** — holds `meta-sdk-provider.tsx`, which
  loads Meta's JavaScript SDK for the guided WhatsApp signup flow. It's
  scoped to just that feature rather than the whole app.

The app-wide wrappers (translations, theme, confirm dialogs, toasts) are
applied in `src/app/layout.tsx` instead, pulling from `@/hooks/use-theme`
and `@/components/ui/confirm-dialog`.

### The brain: `src/lib/`

263 files, grouped by domain. This is where you go to change _behaviour_.

| Folder                                           | Owns                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `whatsapp/`                                      | everything Meta: sending, templates, webhooks, analytics, opt-out, coexistence |
| `automations/`                                   | the trigger→action automation engine                                           |
| `flows/`                                         | the visual flow builder engine                                                 |
| `ai/`                                            | AI agent: replies, knowledge base, embeddings, handoff                         |
| `auth/`                                          | accounts, roles, invitations, API-key context                                  |
| `supabase/`                                      | the browser + server database clients                                          |
| `contacts/`                                      | deduplication, placeholder names                                               |
| `inbox/`                                         | conversation queries and shaping                                               |
| `templates/`                                     | template helpers                                                               |
| `messages/`                                      | message helpers                                                                |
| `broadcast-status.ts`                            | broadcast state machine                                                        |
| `subscription/`                                  | trial and billing gate logic                                                   |
| `billing`, `cms`, `email`, `auto-mail`, `alerts` | admin and comms                                                                |
| `storage/`                                       | media uploads (S3 — `s3-client.ts`, `upload-media.ts`)                         |
| `api/v1/`                                        | public API response shapes and pagination                                      |
| `api-keys/`                                      | key generation, hashing, scopes                                                |
| `rate-limit.ts`                                  | request throttling used by every door                                          |
| `webhooks/`                                      | outbound webhooks _you_ send to customers                                      |
| `phone/`, `geo/`, `currency.ts`, `validation/`   | small shared utilities                                                         |

`src/lib/whatsapp/` is the biggest folder in the project, which makes sense —
it's a WhatsApp CRM. Inside it, `meta-api.ts` is the only file that actually
makes network calls to Meta; everything else is rules and shaping around it.

### Browser behaviour: `src/hooks/`

Reusable logic for screens. Always start with `use`, always run in the
browser.

`use-realtime.ts` (live message updates), `use-auth.tsx` (current user),
`use-can.ts` (permission checks), `use-theme.tsx`, `use-presence.ts` (who's
online), `use-subscription.ts`, `use-total-unread.ts`,
`use-broadcast-sending.ts`, and a few more.

### Shared shapes: `src/types/`

`index.ts` defines what a `Contact`, `Message`, or `Conversation` looks like,
so the screens and the brain agree on the shape of your data. No behaviour
here, just descriptions.

### Database: `supabase/migrations/`

105 `.sql` files. Each one is a numbered, permanent, forward-only change to
the database shape. They run in filename order, which is why they're
timestamped: `20260910020000_template_analytics_buttons.sql`.

**You never edit an old migration.** Once applied, it's history. To change
something you add a new file. That's how the same database shape can be
rebuilt identically on your laptop, in Docker, and in production.

`supabase/Production db backups/` and `supabase/snippets/` are exactly what
they sound like.

### Tests: `*.test.ts`

109 files, living right next to the code they check —
`send-message.ts` is tested by `send-message.test.ts` in the same folder.

Run them with `npm test`. They currently number 1325 individual checks across
110 files. Their job is to tell you "the change you just made broke something
you weren't thinking about." Notice that almost every test sits beside a
`src/lib/` file, not beside a component — logic is what's worth testing.

### Translations: `messages/` + `src/i18n/`

`messages/en.json` and `messages/ko.json` hold every piece of user-facing
text. `src/i18n/request.ts` wires them up, and `next.config.ts` registers the
plugin. When a screen shows text, it looks it up here rather than hardcoding
it, which is how the CRM can switch language.

---

## 7. The files sitting at the project root

You'll never run these, but knowing what they do stops them being scary.

| File                                     | What it does                                                                               | Safe to edit?                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| `package.json`                           | lists every library the project uses, and defines the commands (`npm run dev`, `npm test`) | carefully                     |
| `package-lock.json`                      | exact versions actually installed                                                          | never by hand                 |
| `next.config.ts`                         | Next.js settings: security headers, caching, Docker output mode, dev tunnels               | carefully — heavily commented |
| `tsconfig.json`                          | TypeScript settings, including the `@/` shortcut that means `src/`                         | rarely                        |
| `eslint.config.mjs`                      | code-quality rules (`npm run lint`)                                                        | rarely                        |
| `.prettierrc`                            | code formatting rules (`npm run format`)                                                   | rarely                        |
| `vitest.config.ts`                       | test runner config — this is what says tests are `src/**/*.test.ts`                        | rarely                        |
| `postcss.config.mjs`                     | Tailwind CSS build step                                                                    | rarely                        |
| `components.json`                        | shadcn/ui settings for `src/components/ui/`                                                | rarely                        |
| `Dockerfile`                             | recipe for packaging the app into a container                                              | carefully                     |
| `docker-compose.prod.yml` / `.local.yml` | run the whole stack (app + database) together                                              | carefully                     |
| `.env.local`                             | **your secrets** — API keys, database URL. Never commit or paste this                      | yes, but privately            |
| `.env.docker`                            | same idea, for the Docker setup                                                            | yes, privately                |
| `*.example` versions                     | safe templates showing which keys are needed, with no real values                          | yes                           |
| `AGENTS.md`, `CLAUDE.md`                 | instructions for AI coding assistants working on this repo                                 | yes                           |
| `README.md`                              | project overview                                                                           | yes                           |
| `.gitignore`                             | files git must never save (`.env.local`, `node_modules`, `.next`)                          | carefully                     |

The `@/` shortcut is worth memorising: `@/lib/whatsapp/meta-api` means
`src/lib/whatsapp/meta-api.ts`. You'll see it in every import.

### Folders at the root

| Folder                                     | Contents                                                          |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/`                                     | **all your actual application code**                              |
| `supabase/`                                | database migrations and backups                                   |
| `public/`                                  | images served as-is (logos, SVGs)                                 |
| `messages/`                                | translation files                                                 |
| `docs/`                                    | written documentation, including this file                        |
| `docker/`                                  | database bootstrap and migration scripts for Docker               |
| `deploy/`                                  | server config: nginx upload limits, cron jobs                     |
| `scripts/`                                 | one-off maintenance scripts you run by hand                       |
| `mcp-server/`                              | a separate published tool that lets AI assistants control the CRM |
| `tools/`                                   | local AI helper servers (Meta API, Google Sheets)                 |
| `.github/workflows/`                       | CI — the checks that run automatically on every push              |
| `node_modules/`                            | downloaded libraries. Never touch, never commit, huge             |
| `.next/`                                   | build output. Auto-generated, disposable                          |
| `scratch/`, `.gemini/`, `semantic-review/` | working scratch space, not production                             |

---

## 8. Frontend vs backend, decided in five seconds

When you open a file and want to know which side it's on:

1. **Does line 1 say `'use client'`?** → frontend, runs in the browser.
2. **Is it named `route.ts`?** → backend, an API door.
3. **Is it in `src/lib/`?** → backend logic (with rare exceptions).
4. **Is it named `page.tsx` without `'use client'`?** → a server-rendered
   page: assembled on the server, sent as finished HTML.
5. **Is it `.sql`?** → database.

The practical difference: **anything in the browser is visible to your
users.** That is why every Meta call happens in `src/lib/whatsapp/meta-api.ts`
on the server, and never from a component. If the browser called Meta
directly, your WhatsApp access token would be sitting in the user's
developer tools.

The same reasoning is written into `next.config.ts` — its
`connect-src` security rule deliberately allows Supabase but **not**
`graph.facebook.com`, precisely because no browser code should ever be
reaching Meta.

---

## 9. Where to look when something specific is wrong

| Symptom                     | Start here                                                    |
| --------------------------- | ------------------------------------------------------------- |
| A screen looks wrong        | `src/components/<feature>/` then the matching `page.tsx`      |
| A button does nothing       | the component, then the API door it calls                     |
| Wrong number displayed      | the `src/lib/` file that calculates it                        |
| Message won't send          | `api/whatsapp/send/route.ts` → `lib/whatsapp/send-message.ts` |
| Incoming messages missing   | `api/whatsapp/webhook/route.ts`                               |
| Inbox not updating live     | `src/hooks/use-realtime.ts`                                   |
| Login / redirect loops      | `src/proxy.ts`                                                |
| "Unauthorized" errors       | `src/proxy.ts`, then the door's own auth check                |
| Permission / hidden buttons | `src/lib/auth/roles.ts`, `src/hooks/use-can.ts`               |
| Template problems           | `src/lib/whatsapp/template-*.ts`                              |
| Automation didn't fire      | `src/lib/automations/engine.ts`                               |
| Flow stuck                  | `src/lib/flows/engine.ts`                                     |
| AI replied badly            | `src/lib/ai/auto-reply.ts`, `src/lib/ai/context.ts`           |
| Upload failing              | `src/lib/storage/upload-media.ts`, `s3-client.ts`             |
| Billing / trial gate        | `src/lib/subscription/status.ts`, `src/proxy.ts`              |
| Public API complaint        | `src/app/api/v1/`, `src/lib/auth/api-context.ts`              |
| Missing database column     | newest file in `supabase/migrations/`                         |

---

## 10. The commands, and what each one protects you from

| Command             | What it does                            | Why you care                                          |
| ------------------- | --------------------------------------- | ----------------------------------------------------- |
| `npm run dev`       | starts the app locally                  | your normal working mode                              |
| `npm run typecheck` | checks every file's data shapes line up | catches "you passed a number where text was expected" |
| `npm test`          | runs all 1325 automated checks          | catches broken behaviour                              |
| `npm run lint`      | code-quality rules                      | catches sloppy or risky patterns                      |
| `npm run format`    | auto-formats everything                 | keeps the codebase consistent                         |
| `npm run build`     | full production build                   | catches errors that only appear in production         |

Run `typecheck`, `test`, and `build` before you consider a change finished.
Between them, they catch most of what would otherwise reach your customers.

---

## 11. Vocabulary

| Word                     | Plain meaning                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| **frontend / client**    | code running in the user's browser                                  |
| **backend / server**     | code running on your server, invisible to users                     |
| **API**                  | a URL that returns data instead of a web page                       |
| **route / endpoint**     | one such URL, defined by a `route.ts` file                          |
| **webhook**              | a URL _someone else_ calls to notify you (Meta does this)           |
| **component**            | a reusable piece of screen                                          |
| **hook**                 | reusable browser behaviour, named `use…`                            |
| **library / lib**        | plain functions holding your rules                                  |
| **migration**            | a numbered, permanent change to the database shape                  |
| **RLS**                  | database-level rules stopping one account reading another's rows    |
| **service role**         | a key that bypasses RLS; used only where no user exists             |
| **environment variable** | a secret or setting kept out of the code, in `.env.local`           |
| **Meta Graph API**       | WhatsApp's official API at `graph.facebook.com`                     |
| **WABA**                 | WhatsApp Business Account — your account on Meta's side             |
| **template**             | a pre-approved message; required to start a conversation            |
| **realtime**             | live database push, so screens update without refreshing            |
| **middleware / proxy**   | code running before every request; here, `src/proxy.ts`             |
| **route group**          | a `(parentheses)` folder that groups pages without changing the URL |
| **`'use client'`**       | a marker at the top of a file meaning "run this in the browser"     |
| **`@/`**                 | shorthand for `src/` in import lines                                |

---

## 12. If you remember only this

- **`src/app/**/page.tsx`** is what users see.
- **`src/app/api/**/route.ts`** is how the screens ask the server for things.
- **`src/lib/`** is where the real rules live — change behaviour here.
- **`supabase/migrations/`** is the shape of your data, add-only.
- **`src/proxy.ts`** decides who gets in at all.
- **`.env.local`** holds your secrets and must never be shared.
- Anything ending **`.test.ts`** exists to tell you when you broke something.
