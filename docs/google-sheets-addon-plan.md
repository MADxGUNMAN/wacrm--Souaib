# Replai for Google Sheets — implementation plan

A Google Workspace Marketplace add-on that sends WhatsApp template
messages from a spreadsheet, plus the **API Campaign** concept in the CRM
that makes it possible.

Reference product: _WhatsApp Sender & Automation by SandeshAI_
(Marketplace listing, 3K+ installs, ★5). This plan reproduces its
feature set and interaction model, then specifies how to build, secure,
test and publish ours.

> **Status:** plan only. No code written yet. Section 12 is the phased
> build order; section 13 is the Marketplace submission path.

---

## 1. What is actually being built

Three separable deliverables. Only the third is new territory; the first
two are extensions of code that already works.

| #   | Deliverable                                                                | Where                      | Rough size                          |
| --- | -------------------------------------------------------------------------- | -------------------------- | ----------------------------------- |
| 1   | **API Campaign** — a saved, reusable campaign with no fixed recipient list | CRM (`src/`)               | 1 migration, 3 routes, 2 UI screens |
| 2   | **Public API extensions** — campaign discovery + campaign-scoped send      | CRM (`src/app/api/v1/`)    | 3 routes, 1 doc update              |
| 3   | **The add-on** — Apps Script sidebar, rule engine, triggers                | new `sheets-addon/` folder | ~12 source files                    |

The add-on never talks to the database. It only ever calls
`/api/v1/**` with an account API key, exactly as the existing
`mcp-server/` does. That boundary is what keeps a Google-hosted script
out of our trust domain.

---

## 2. Screenshot analysis — the specification

Every requirement below is taken from the supplied screenshots. Where a
screenshot is ambiguous, that is called out rather than guessed.

### 2.1 Add-on entry and authentication

**API setup dialog** (screenshot 9) — a modal, not a sidebar, shown on
first run:

- Title bar: `🔑 SandeshAI API Setup`, closable.
- Inner card: product name, subtitle _"WhatsApp Automation for Google
  Sheets"_.
- Single field: **API Key**, masked (password input with a reveal eye).
- Primary button: **Save & Continue**, full width, dark.
- Two footer links: **How to get API key?** (left), **Book free demo**
  (right).
- Footer: `www.sandeshai.com`.

**Where the key comes from** (screenshot 8) — the CRM's
`Settings → API Key` tab shows a single UUID-style key with a **Copy**
button and a _"API Key copied to clipboard!"_ toast.

> **Divergence we should keep.** SandeshAI shows one bare UUID per
> account. Replai already has something better: named, scoped,
> revocable keys with a `wacrm_live_` prefix and SHA-256 storage
> (`src/lib/api-keys/keys.ts`, migration `026_api_keys.sql`). We keep
> ours and do **not** regress to a single account-wide UUID. The add-on
> dialog stays identical; only the key format differs.

### 2.2 Sidebar — empty state

Screenshot 7:

- Header: `WhatsApp Sender & Automation by SandeshAI` with an `✕`.
- Centred lightning-bolt icon (orange/amber).
- Heading **No Automation Rules Yet**.
- Primary button **+ New Rule** (purple/indigo).
- Footer line: _"Need proper sheet format? **Create template**"_ — a
  link that writes a correctly-shaped starter sheet.

### 2.3 Sidebar — rules list

Screenshot 1:

- Header row: **Automation Rules** (left), **+ New Rule** (right).
- One card per rule, pale indigo background:
  - Rule name, bold (`Test 1`).
  - Subtitle `Sheet1 • test1` — target sheet **•** campaign name.
  - Status pill **ACTIVE** (green).
  - Row of icon actions, right-aligned: ✏️ edit, 🗑 delete.

Implied but not shown: a paused/inactive state (the pill implies a
second value), and no reordering.

### 2.4 Rule wizard — step 1 "Setup"

Screenshots 6 and 5. Stepper reads `1 Setup · 2 Configuration`, with
step 1 highlighted. Header **Create New Rule** with a **Cancel** button.

Section **Basic Setup**:

| Field        | Control                               | Notes                                                          |
| ------------ | ------------------------------------- | -------------------------------------------------------------- |
| Rule Name    | text, placeholder _"Enter rule name"_ | required                                                       |
| Target Sheet | select                                | populated from the workbook's tabs (`Select sheet…`, `Sheet1`) |
| Trigger Type | select                                | `New Row Added`, `On Change`, `Time-Based Reminder`            |

Section **Trigger Configuration** (screenshot 5) appears once a trigger
type is chosen, and holds a **repeatable list of conditions**:

- Column select (`Select…`) — populated from the target sheet's header row.
- Condition operator select (default `Equals`).
- Value text input.
- 🗑 delete-condition button.

Footer: **Cancel** / **Next Step →**.

Screenshot 5 shows exactly one condition row with a delete button, which
means the list is dynamic (there must be an "add condition" affordance;
it is off-screen — likely below the last row).

### 2.5 The condition operators — full list

Screenshot 4 is the most valuable screenshot: the operator dropdown
fully expanded. Nineteen operators, in this exact order:

**Comparison (10)**

1. `Equals`
2. `Contains`
3. `Not equals`
4. `Does not contain`
5. `Is empty`
6. `Is not empty`
7. `Greater than`
8. `Greater than or equal`
9. `Less than`
10. `Less than or equal`

**Date-aware (9)**

11. `Date: Equals today`
12. `Date: Day & Month today` — recurring annually (birthdays)
13. `Date: Day & Month in X days (upcoming)`
14. `Date: Day & Month was X days ago (past)`
15. `Date: Day only today` — recurring monthly (rent, EMI)
16. `Date: Day in X days (upcoming)`
17. `Date: Day was X days ago (past)`
18. `Date: In X days from today (upcoming)`
19. `Date: Was X days ago (past)`

The date family is the whole point of the _Time-Based Reminder_ trigger
and is what makes the add-on more than a bulk sender. It supports three
distinct recurrence shapes:

- **Full date match** (11, 18, 19) — one-off, year included. _"Send 2
  days before the delivery date."_
- **Day + month match** (12, 13, 14) — annual recurrence, year ignored.
  _"Send on their birthday", "3 days before their anniversary."_
- **Day-of-month match** (15, 16, 17) — monthly recurrence. _"Remind on
  the 5th", "2 days before the 1st."_

Operators 5 and 6 (`Is empty` / `Is not empty`) must hide the Value
input. Operators 13–19 relabel it to a day count.

### 2.6 Rule wizard — step 2 "Configuration"

Screenshots 3 and 2. Stepper now highlights step 2.

Section **Campaign Settings**:

- **Campaign Name** select — `Select campaign…` plus the account's API
  campaigns (`test1`). This is fetched from the CRM.

Section **WhatsApp Settings**:

- **WhatsApp Number Column** — select, required.
- **Contact Name Column** — select.
- **Country Code (Optional)** — select, default `None`.

Section **Template Variables**:

- Italic helper text: _"Variables will be automatically added based on
  the selected campaign"_ — i.e. once a campaign is chosen, the CRM
  reports how many `{{n}}` placeholders its template has, and the UI
  renders one column-picker per placeholder.

Section **Media URL (Optional)**:

- **Media Type** select, default `None`.
- Implied: a URL column picker once a media type is chosen.

Footer: **← Previous** / **Create Rule**.

### 2.7 CRM side — campaigns

Screenshot 14 — the campaigns list has a **Type** column with two
values, `API` and `BROADCAST`:

| Campaign Name | Template Name      | Contacts | Type      | Status    | Created At |
| ------------- | ------------------ | -------- | --------- | --------- | ---------- |
| test1         | order_confirmation | –        | API       | Active    | 9/14/2026  |
| test          | new_course_launchs | 1        | BROADCAST | Completed | 9/11/2026  |

Note `Contacts` is `–` and `Status` is `Active` for the API row: an API
campaign has **no recipient list** and **no terminal state**. There is
also an **Export Report** action.

The **+ Campaign** button is a dropdown with two options:

- **Broadcast Campaign** — _"Send bulk messages from our platform"_
- **API Campaign** — _"Send messages from your own system"_

Screenshot 15 — the API campaign creation form is deliberately tiny:
**Campaign Name** (text), **Template Name** (select), a _"Can't find
your template? Create new template"_ link, an **Add Campaign** button,
and a live WhatsApp phone preview of the rendered template.

That is the entire model: **an API campaign is a name bound to a
template.** Nothing else.

### 2.8 CRM side — App Integrations tab

Screenshot 13 — `Settings → App Integration`, a card grid. The Google
Sheets card carries:

- Icon, title **Google Sheets**, subtitle _"WhatsApp automation
  add-on"_, **Available** badge.
- Body: _"Automate WhatsApp messaging directly from Google Sheets with
  rule-based triggers."_
- Three feature bullets with icons: _Send on new row / form submission_,
  _Trigger on cell changes_, _Time-based reminders_.
- Green CTA **Install Add-on ↗** — deep-links to the Marketplace listing.

### 2.9 OAuth consent and Marketplace listing

Screenshot 10 lists the granted permissions, which map to the add-on
manifest scopes:

| Consent screen wording                                                   | Scope                      |
| ------------------------------------------------------------------------ | -------------------------- |
| View and manage spreadsheets that this application has been installed in | `spreadsheets.currentonly` |
| Connect to an external service                                           | `script.external_request`  |
| Allow this application to run when you are not present                   | `script.scriptapp`         |
| Display and run third-party web content in prompts and sidebars          | `script.container.ui`      |
| View and manage data associated with the application                     | see note                   |

> The fifth line's exact scope URI could not be confirmed from Google's
> published docs (the pages are JS-rendered and did not yield the
> mapping). It is most likely a storage/app-data scope pulled in
> implicitly. **Action:** set the four confirmed scopes in
> `appsscript.json`, run the authorisation flow once, and read the
> actual consent screen — then pin the manifest to exactly what appears.
> Do not ship a guessed scope; Marketplace review rejects scopes the app
> cannot justify.

Screenshot 11 confirms basic profile scopes (name, profile picture,
email) — `userinfo.email` and `userinfo.profile`.

Screenshot 12 — the listing surface: icon, title, one-line pitch,
publisher link, _"Listing updated"_ date, **Works with** badges (Sheets

- one more), star rating, install count, and Overview / Permissions /
  Reviews tabs with a screenshot carousel.

---

## 3. Gap analysis against the current codebase

Verified by reading the code, not assumed.

### 3.1 Already exists and is directly reusable

| Capability                                                                           | Location                                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| API key auth, scopes, per-key rate limit (120/min)                                   | `src/lib/auth/api-context.ts`, `src/lib/api-keys/**`                                |
| `broadcasts:send` scope                                                              | `src/lib/api-keys/scopes.ts`                                                        |
| Validate + persist a broadcast, resolve contacts, de-dupe                            | `createBroadcast()` in `src/lib/whatsapp/broadcast-core.ts`                         |
| Fan out with phone-variant retry, per-recipient error capture, Meta 131050 → opt-out | `deliverBroadcast()`, same file                                                     |
| Marketing opt-out suppression before insert                                          | `src/lib/whatsapp/marketing-opt-out.ts`                                             |
| Claim-based worker that cannot double-send                                           | `src/lib/whatsapp/scheduled-broadcasts.ts` + `src/app/api/broadcasts/cron/route.ts` |
| Broadcast sends appearing in the Inbox                                               | `messages.broadcast_id` + `persistBroadcastMessage()`                               |
| Rich send values (media header, carousel, named params, offers)                      | `SendTimeParams` in `src/lib/whatsapp/template-send-builder.ts`                     |
| Template placeholder introspection                                                   | `buildSendPlan()` in `src/lib/whatsapp/template-send-inputs.ts`                     |
| Public API envelope, pagination, error codes                                         | `src/lib/api/v1/respond.ts`, `pagination.ts`                                        |
| A working reference client for this exact API                                        | `mcp-server/src/tools/broadcast.ts`                                                 |

### 3.2 Does not exist — must be built

1. **Any notion of a campaign type.** `broadcasts` has no `type` /
   `source` column. API-created broadcasts are distinguishable only by
   their default name `API broadcast (<template>)`.
2. **A reusable, recipient-less campaign.** `createBroadcast()` hard-
   requires a non-empty `recipients` array and writes
   `total_recipients` at insert.
3. **Campaign discovery over the API.** No endpoint lists campaigns or
   reports a template's placeholder count — both of which the add-on's
   step 2 needs.
4. **Rich send values over the public API.** `POST /api/v1/broadcasts`
   accepts only `recipients[].params` (positional strings). Media
   headers and named params are unreachable, even though
   `broadcast_recipients.send_params` can carry them.
5. **Per-account send quota / plan gating on the API.** `/api/v1` is
   explicitly excluded from the subscription gate in `src/proxy.ts`
   (`UNGATED_API_PREFIXES`). The only limits today are 1000 recipients
   per request and the per-key rate limit.
6. **An `App Integration` settings tab.**
7. **Everything in the add-on.**

### 3.3 Two constraints worth deciding early

**The 60-second fan-out ceiling.** `POST /api/v1/broadcasts` runs
`deliverBroadcast` inside `after()` with `maxDuration = 60`. Its own
comment admits a near-1000 audience can exceed that, stranding
recipients as `pending`. A Sheets rule firing on a 5000-row sheet will
hit this immediately.

> **Decision:** API campaign sends do **not** fan out in the request.
> They write `status: 'scheduled'` with `scheduled_at = now()` and
> per-recipient `send_params`, and let the existing 5-minute cron drain
> them. This reuses the claim-based worker that already cannot
> double-send, needs no new infrastructure, and removes the ceiling
> entirely. Cost: up to 5 minutes of latency. For a reminder or a
> drip that is irrelevant; for a genuinely instant send we can add a
> `POST /api/v1/campaigns/{id}/flush` later.

**Apps Script trigger quotas.** An installable trigger is per-user,
per-script, and capped (20 per user per script). One `onChange` and one
daily time-driven trigger per document is the design target — **not one
trigger per rule.** A single dispatcher trigger reads all rules and
decides which fire. This also matters because triggers run as the
_installing user_, with that user's API key.

---

## 4. Architecture

```
Google Sheet
 ├── Apps Script add-on (sheets-addon/)
 │     ├── sidebar UI            (HtmlService, sandboxed iframe)
 │     ├── rule store            → DocumentProperties  (per workbook)
 │     ├── API key store         → UserProperties      (per user!)
 │     └── dispatcher triggers   → onChange + daily timer
 │                    │
 │                    │ HTTPS + Authorization: Bearer wacrm_live_…
 │                    ▼
 └────────────► Replai  /api/v1/*
                   ├── GET  /campaigns                 (list, for step 2)
                   ├── GET  /campaigns/{id}            (template + var count)
                   ├── POST /campaigns/{id}/send       (the send)
                   └── GET  /me                        (key validation)
                              │
                              ▼
                   api_campaigns ──1:N──► broadcasts ──1:N──► broadcast_recipients
                                              │
                                              └─► messages (Inbox, via broadcast_id)
```

### 4.1 Why `api_campaigns` is its own table

Rejected alternative: add `broadcasts.campaign_type = 'api' | 'broadcast'`
and relax the recipients requirement.

That breaks three invariants the `broadcasts` table currently holds:

- `total_recipients` is written at insert. An API campaign has no
  audience at creation and accumulates recipients forever.
- The per-status count columns are **owned by a DB aggregate trigger**
  (migrations 003/005) derived from recipient rows. On a campaign that
  runs indefinitely, `sent_count` becomes a lifetime total with no
  denominator — meaningless next to a one-shot broadcast's counts.
- `status` has a terminal state (`sent` / `failed`). An API campaign is
  `active` / `paused` and never terminal. The existing CHECK constraint
  and the scheduled-broadcast sweep both reason about those states.

So: **`api_campaigns` holds the definition; each trigger fire creates a
real `broadcasts` row parented to it.** Every existing behaviour —
counts, opt-out suppression, Inbox linkage, delivery-webhook status
matching, the failure-detail dialog shipped earlier — keeps working
untouched, because an API campaign run _is_ a broadcast.

The campaigns list in the UI is then a union: `api_campaigns` plus
`broadcasts WHERE api_campaign_id IS NULL`, which reproduces screenshot
14 exactly.

### 4.2 Why the API key lives in UserProperties, not DocumentProperties

A spreadsheet gets shared. `DocumentProperties` is readable by any
collaborator who can open the Apps Script context, so a key stored
there is a credential leak to everyone the sheet is shared with — and
that key can send WhatsApp messages that cost real money.

`UserProperties` is scoped to (user, script), so each collaborator
supplies their own key.

Consequence to document in the UI: **the person who creates a rule owns
its trigger.** Triggers run as the installing user with that user's key.
If they leave the organisation or revoke their key, the rule stops. The
sidebar must show whose key a rule runs under, and surface a clear error
rather than failing silently.

---

## 5. Data model changes

### 5.1 Migration: `api_campaigns`

```sql
CREATE TABLE IF NOT EXISTS api_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text NOT NULL,
  template_name     text NOT NULL,
  template_language text NOT NULL DEFAULT 'en_US',
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'paused')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);
```

`UNIQUE (account_id, name)` because the add-on's step 2 picks a campaign
**by name** from a dropdown; two campaigns sharing a name would make the
rule ambiguous.

RLS mirroring `api_keys`: select for `is_account_member(account_id)`,
write for `is_account_member(account_id, 'agent')`.

### 5.2 Migration: link runs to campaigns

```sql
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS api_campaign_id uuid
    REFERENCES api_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broadcasts_api_campaign
  ON broadcasts (api_campaign_id, created_at DESC)
  WHERE api_campaign_id IS NOT NULL;
```

`ON DELETE SET NULL`, matching the reasoning already applied to
`messages.broadcast_id`: deleting a campaign definition must never
delete the send history or the customer conversations it produced.

### 5.3 Migration: idempotency for triggered sends

The single hardest correctness problem in this feature. An `onChange`
trigger can fire twice for one logical edit; a user can paste a block;
a time-based reminder runs daily and must not re-send yesterday's.

```sql
CREATE TABLE IF NOT EXISTS api_campaign_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  api_campaign_id uuid NOT NULL REFERENCES api_campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  broadcast_id    uuid REFERENCES broadcasts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_campaign_id, idempotency_key)
);
```

The add-on computes the key deterministically and the server enforces
it with a claim-insert against the UNIQUE constraint — the same pattern
`recordMarketingOptOut` and the usage-alert cron already use.

Key recipe, computed add-on side:

```
sha256(spreadsheetId | sheetId | ruleId | rowIdentity | fireDate)
```

- `rowIdentity` — the phone number plus the row number. Prefer the phone
  alone when it is unique in the sheet; a row number alone breaks when
  rows are inserted above.
- `fireDate` — `yyyy-MM-dd` in the **sheet's** timezone for time-based
  reminders (so a daily sweep is naturally once-per-day-per-row), and
  omitted for `New Row Added` (so a row sends exactly once ever).

This is the mechanism that makes "send 2 days before the delivery date"
safe to evaluate every single day.

---

## 6. CRM work

### 6.1 Dashboard routes

| Route                             | Method | Purpose                      |
| --------------------------------- | ------ | ---------------------------- |
| `/api/account/api-campaigns`      | GET    | list for the campaigns table |
| `/api/account/api-campaigns`      | POST   | create (name + template)     |
| `/api/account/api-campaigns/[id]` | PATCH  | rename, pause/resume         |
| `/api/account/api-campaigns/[id]` | DELETE | remove definition            |

Dashboard envelope (`{ error: string }`), `getCurrentAccount()` +
`requireRole()`, per repo convention.

### 6.2 UI

**Campaigns list** — add a `Type` column, and convert `+ Campaign` into
a dropdown with the two options and their subtitles from screenshot 14.
Rows come from the union described in 4.1. API rows render `–` for
contacts and an `Active`/`Paused` pill.

**API campaign form** — reproduce screenshot 15: name, template select,
"Can't find your template? Create new template" link, and reuse the
existing phone-preview component from the broadcast wizard.

**API campaign detail** — not in the screenshots, but needed: the list
of runs (`broadcasts` rows) with their counts, so an operator can see
what the sheet has been sending. Reuse the existing broadcast detail
table and the recipient-failure dialog built earlier.

**`App Integration` settings tab** — reproduce screenshot 13's card
grid. Only the Google Sheets card is real; do not render placeholder
cards for integrations that do not exist.

### 6.3 Public API additions

Follow `src/lib/api/v1/respond.ts` and document in `docs/public-api.md`.

**`GET /api/v1/campaigns`** — scope `broadcasts:send`. Paginated.

```jsonc
{
  "data": [
    {
      "id": "…",
      "name": "test1",
      "template_name": "order_confirmation",
      "template_language": "en_US",
      "status": "active",
    },
  ],
  "meta": { "next_cursor": null },
}
```

**`GET /api/v1/campaigns/{id}`** — scope `broadcasts:send`. Adds the
template introspection step 2 needs, from `buildSendPlan()`:

```jsonc
{
  "data": {
    "id": "…",
    "name": "test1",
    "status": "active",
    "template": {
      "name": "order_confirmation",
      "language": "en_US",
      "category": "Utility",
      "body_variable_count": 3,
      "body_variable_names": ["1", "2", "3"],
      "parameter_format": "POSITIONAL",
      "header": { "format": "IMAGE", "requires_media": true },
      "buttons": [{ "index": 0, "type": "URL", "requires_param": true }],
    },
  },
}
```

This is what lets the sidebar render exactly the right number of
variable pickers and show/hide the media section — the behaviour behind
screenshot 2's _"Variables will be automatically added based on the
selected campaign."_

**`POST /api/v1/campaigns/{id}/send`** — scope `broadcasts:send`.

```jsonc
{
  "idempotency_key": "a3f1…",
  "recipients": [
    {
      "to": "+919876543210",
      "name": "Souaib",
      "params": ["393392", "200", "2 Days"],
      "media_url": "https://…/invoice.pdf",
      "button_params": { "0": "ORD-123" },
    },
  ],
  "source": {
    "kind": "google_sheets",
    "spreadsheet_id": "1i0…",
    "sheet": "Sheet1",
    "rule_id": "r_7…",
  },
}
```

Behaviour:

1. Resolve the campaign, 404 if not in `ctx.accountId`.
2. Reject if `status = 'paused'` → `403 campaign_paused`.
3. Claim-insert `api_campaign_sends`. On unique violation return
   **200** with `{ "duplicate": true, "broadcast_id": <existing> }` —
   idempotent replay must be cheap and must not send.
4. Call `createBroadcast()` with `api_campaign_id`, then **do not**
   deliver inline: set `status: 'scheduled'`, `scheduled_at: now()`, and
   write each recipient's `send_params` so the cron picks it up.
5. Return `202` with `broadcast_id` and the accepted / rejected /
   suppressed triple that `POST /api/v1/broadcasts` already returns.

`source` is stored on the broadcast (a JSONB column or reuse
`audience_filter`, which is unused by every current path) purely so the
CRM can show "sent by Google Sheets, rule X" in the run list.

### 6.4 Extend `createBroadcast()`

Two additive changes, both backwards compatible:

- Accept `apiCampaignId?: string | null` and write it to the row.
- Accept `mode?: 'deliver_now' | 'schedule'`. `'schedule'` writes
  `status: 'scheduled'` + `scheduled_at` + per-recipient `send_params`
  instead of `status: 'sending'`, and returns the plan without expecting
  `deliverBroadcast` to be called.

Also accept per-recipient `messageParams` so media headers and button
params survive from the sheet to Meta. Today only the scheduled path
populates that field.

### 6.5 Quota — decided: no send ceiling

**Decision: no per-account send quota.** Both plans (monthly and yearly)
and the trial carry every feature with unlimited use, so a send ceiling
would contradict the pricing model. `POST /api/v1/campaigns/{id}/send`
ships without a `quota_exceeded` path.

Two guards remain, and they are enough:

- **Per-key rate limit** — 120 requests/minute, already enforced in
  `requireApiKey` (`src/lib/auth/api-context.ts`). Caps burst rate, not
  volume.
- **`MAX_RECIPIENTS = 1000` per request** — already in
  `createBroadcast`. The add-on batches to 500 (§9.3), so it never
  approaches this.

What is deliberately **not** guarded is total volume, and that is a real
exposure worth naming: a rule on a large sheet can send thousands of
billable WhatsApp messages. The mitigations are Meta's own, not ours —
the account's messaging tier and its 24-hour business-initiated
conversation limit both cap real-world throughput regardless of what we
allow. Meta rejects sends past the tier, and those rejections already
surface per recipient with the structured error detail built earlier.

Because the subscription gate does not apply to `/api/v1`
(`UNGATED_API_PREFIXES` in `src/proxy.ts`), one check is still worth
adding: **refuse to send when the account has no active subscription or
trial.** That is not a quota, it is the same access control the
dashboard already applies, and without it a lapsed account keeps sending
through the API forever. Implement as a subscription-state lookup in the
send route returning `403 subscription_inactive`.

---

## 7. The add-on — folder layout

New top-level folder, deployed with `clasp`, versioned in this repo but
independent of the Next.js build.

```
sheets-addon/
├── README.md                 how to clasp login / push / deploy
├── .clasp.json.example       scriptId placeholder (real one untracked)
├── appsscript.json           manifest: scopes, add-on config, timezone
├── package.json              clasp + prettier + a vitest suite for pure logic
├── src/
│   ├── Code.js               entry points: onOpen, onInstall, showSidebar
│   ├── auth.js               API key get/set/clear (UserProperties), validate via /me
│   ├── api.js                UrlFetchApp client: retries, timeouts, error mapping
│   ├── rules.js              rule CRUD against DocumentProperties + schema versioning
│   ├── conditions.js         the 19 operators — PURE, unit-tested
│   ├── dates.js              date parsing + the 3 recurrence shapes — PURE
│   ├── dispatcher.js         onChange + daily handlers; decides which rules fire
│   ├── send.js               row → recipient payload; idempotency key; batching
│   ├── sheets.js             read headers, rows, columns; write status back
│   └── template.js           writes the "proper sheet format" starter sheet
├── ui/
│   ├── Sidebar.html          shell + include() helper
│   ├── Sidebar.js.html       client logic (vanilla, no framework)
│   ├── Sidebar.css.html      styles matching Replai's palette
│   ├── ApiKeyDialog.html     the screenshot-9 modal
│   └── Shared.css.html       tokens shared by sidebar + dialog
└── test/
    ├── conditions.test.js    all 19 operators, both truthy and falsy
    ├── dates.test.js         timezone + recurrence edge cases
    └── idempotency.test.js   key stability and collision behaviour
```

`conditions.js` and `dates.js` are deliberately dependency-free so they
can be unit-tested in Node with vitest — the rest of the add-on can only
be tested inside Apps Script, so the parts most likely to be wrong are
the parts made testable.

### 7.1 Manifest sketch

```jsonc
{
  "timeZone": "Asia/Kolkata",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  "sheets": {
    "macros": [],
  },
  "addOns": {
    "common": {
      "name": "Replai — WhatsApp Sender & Automation",
      "logoUrl": "https://wacrm.junkiescoder.com/logo-icon.png",
      "useLocaleFromApp": true,
    },
    "sheets": {},
  },
}
```

Scope justification for review — one line each, because Marketplace
review asks:

- `spreadsheets.currentonly` — read the rows and headers the rule
  targets, and write delivery status back. Narrower than `spreadsheets`;
  grants access only to the file the add-on is installed in.
- `script.external_request` — call the Replai API to send.
- `script.scriptapp` — install the two dispatcher triggers so reminders
  fire without the user present.
- `script.container.ui` — render the sidebar and the API key dialog.
- `userinfo.email` — show which account a rule runs under (see 4.2).

---

## 8. Sidebar UI specification

Match Replai's existing palette rather than SandeshAI's indigo: primary
green from the CRM, `--card` surfaces, the same radius scale. The
_layout_ is copied; the _branding_ is ours.

### 8.1 Screens and states

| State         | Trigger                  | Content                              |
| ------------- | ------------------------ | ------------------------------------ |
| `needs_key`   | no key in UserProperties | the screenshot-9 dialog              |
| `key_invalid` | `/me` returns 401        | same dialog + inline error           |
| `empty`       | key valid, zero rules    | screenshot 7 empty state             |
| `list`        | ≥1 rule                  | screenshot 1 card list               |
| `wizard_1`    | New Rule / edit          | screenshots 6 + 5                    |
| `wizard_2`    | Next Step                | screenshots 3 + 2                    |
| `offline`     | fetch failed             | retry affordance, rules still listed |

Beyond the reference product, two additions the §14 decisions require:

- Every rule card shows **"Runs as \<email\>"**, and a rule whose owner's
  key no longer works shows a **Needs attention** pill plus a
  **Take over this rule** action (§14.5).
- A single **Reminder time** control on the rules list, one per
  spreadsheet, labelled "around HH:00" (§14.3). Rendered only once at
  least one `Time-Based Reminder` rule exists — an option that affects
  nothing is clutter.

### 8.2 Wizard validation

Block **Next Step** until: rule name non-empty, target sheet chosen,
trigger type chosen, and — for `On Change` and `Time-Based Reminder` —
at least one complete condition. `New Row Added` may legitimately have
zero conditions (send for every new row).

Block **Create Rule** until: campaign chosen, WhatsApp number column
chosen, and every template variable mapped to either a column or a
literal.

Mapping a variable should allow **either** a column **or** a fixed
value. Screenshot 2 does not show this, but a template like _"Hi {{1}},
your {{2}} order"_ almost always has one dynamic and one constant part,
and forcing a column for constants would mean adding filler columns to
the sheet.

### 8.3 Writing status back to the sheet

Not visible in the screenshots but essential, and the reason
`spreadsheets.currentonly` needs write access: after a send, stamp a
status column (create it if absent) with `Sent` / `Failed: <reason>` and
a timestamp. Without this the operator has no idea what happened, and
the idempotency guard becomes the only thing preventing duplicates.

---

## 9. The trigger engine

### 9.1 Two triggers, not N

```
installDispatchers(ss):
  deleteExistingDispatchers()          // idempotent re-install
  ScriptApp.newTrigger('onChangeDispatch')
           .forSpreadsheet(ss).onChange().create()
  ScriptApp.newTrigger('onDailyDispatch')
           .timeBased().atHour(reminderHour())   // per document, default 9
           .everyDays(1)
           .inTimezone(ss.getSpreadsheetTimeZone()).create()
```

`onChangeDispatch` serves both `New Row Added` and `On Change`;
`onDailyDispatch` serves `Time-Based Reminder`. Installed on first rule
creation, removed when the last rule is deleted.

`reminderHour()` reads the per-document setting from §14.3, defaulting to
9; changing it re-installs only the daily trigger. Note `atHour(9)` fires
_within_ the 09:00–10:00 window rather than at 09:00 exactly, which is
why the UI says "around 09:00".

`onChange` gives a coarse `changeType` (`INSERT_ROW`, `EDIT`, …) and
does **not** tell you which cell changed. So:

- `New Row Added` → filter `changeType === 'INSERT_ROW'`, then evaluate
  conditions against the newly added row(s).
- `On Change` → evaluate conditions across candidate rows and rely on
  idempotency plus a per-row "last sent" marker to avoid re-sending
  rows that already matched. This is where the design is most likely to
  need iteration; the idempotency table makes wrongness cheap rather
  than expensive.

### 9.2 Condition evaluation contract

```js
// conditions.js — pure
evaluate(operator, cellValue, expected, ctx) → boolean
// ctx: { today: 'yyyy-MM-dd' | {y,m,d} | Date, dateOrder: 'MDY' | 'DMY' }
```

> **Implemented shape differs from the original sketch** (which passed
> `{ today: Date, timezone: string }`). A `Date` is an instant, so it
> cannot express "today in Asia/Kolkata" without this pure layer
> re-implementing timezone maths it should not own. The caller resolves
> today first — `Utilities.formatDate(new Date(),
ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')` — and dates travel through
> the operators as `{y, m, d}` parts. `dateOrder` replaces `timezone`
> because the only thing the pure layer needs a locale for is breaking a
> tie on ambiguous text like `05/06/2026`; it is derived from
> `getSpreadsheetLocale()` in `sheets.js`.

Rules for correctness that must be encoded, not left to chance:

- **Numeric comparison** (7–10) coerces both sides with a strict parse;
  a non-numeric cell makes the condition false, never throws.
- **String comparison** is case-insensitive and trims — a sheet cell
  routinely carries a trailing space, and `Pass ` failing to match
  `Pass` would look like a broken product.
- **Dates** are read from the cell's real `Date` value when Sheets has
  one, and only parsed from text as a fallback. Formatting the cell as
  text is common in imported sheets.
- **All date maths happens in the spreadsheet's timezone**, not the
  script's and not UTC. "Today" for a sheet in `Asia/Kolkata` is not
  "today" in UTC for five and a half hours a day, and a reminder that
  fires a day early is a visible failure.

### 9.3 Batching

A daily sweep over a 5000-row sheet may match hundreds of rows. Group
matches per rule into chunks of **≤ 500 recipients per API call**
(under the server's 1000 cap, leaving headroom), and stop after a
per-run ceiling to stay inside the Apps Script 6-minute execution limit.
Anything not sent this run is picked up tomorrow — the idempotency key
includes the fire date, so a partial run is safe to repeat.

> **Not implemented, deliberately — one call per row instead.** Batching
> is unsafe against this endpoint, and the reason only becomes visible
> once the idempotency key is real. `POST /campaigns/{id}/send` accepts
> **one key per call**, and per-row correctness ("this row sends once,
> ever" — §14.2) comes from the key being per row. A batch has to derive
> its key from the set of rows it contains; add one more matching row
> tomorrow and the set changes, so the key changes, so every row already
> sent in that batch is sent **again**.
>
> Per-row calls cost more requests and are slower. That is the right
> trade: a duplicate paid message reaches a real person, costs money, and
> lowers the account's Meta quality rating, at scale, before anyone
> notices. The per-run ceiling (`MAX_SENDS_PER_RUN`, 100) keeps the slower
> path inside the execution limit; leftovers are picked up by the next
> run.

### 9.4 Which rows a run may touch — implemented

`onChange` does not report which cells changed, so the naive
implementation re-evaluates the whole sheet on every edit. On a sheet
already holding 500 matching rows, the first edit anyone makes sends 500
messages. Three independent limits prevent it:

1. **On Change** evaluates only the rows the change touched, read from
   `e.source.getActiveRange()`. No active range → no candidates. The cost
   is that a purely programmatic write with no active range is skipped.
2. **New Row Added** evaluates only rows past a watermark
   (`rule.baselineRow`) captured when the rule was saved, so pre-existing
   rows are never "new". A Google Form submission has no active range, and
   the watermark is what makes that case work. Resuming a paused rule
   re-baselines it.
3. **Every send** carries the per-row key, so the CRM's `UNIQUE`
   constraint is the backstop if 1 or 2 is ever wrong.

Runs are serialised with `LockService.getDocumentLock()`: writing the
status column is itself a spreadsheet change and can re-fire the trigger
that started the run.

### 9.5 Correction: Edit and form-submit triggers, not Change

§9.1 above specifies an `onChange` trigger, and the first implementation
followed it. **It does not work, and the failure is silent.** An
`On Change` rule never fired: the run started, found no candidate rows,
and completed successfully having done nothing.

The onChange event object carries **no range** — Google's docs confirm it
reports only a coarse `changeType`. The implementation fell back to
`e.source.getActiveRange()`, the selection of whoever happens to be
looking at the sheet, which in a background trigger is routinely null. So
the scoping rule in §9.4 ("only the rows the change touched") reduced to
"no rows, ever".

Implemented instead, all three creatable by an Editor add-on:

| Trigger            | Handler                | Serves                           |
| ------------------ | ---------------------- | -------------------------------- |
| Edit (installable) | `onEditDispatch`       | New Row Added + On Change        |
| Form-submit        | `onFormSubmitDispatch` | New Row Added from a linked Form |
| Time-driven        | `onDailyDispatch`      | Time-Based Reminder              |

`e.range` on an Edit trigger is the cell the user actually changed, which
is the fact the rule needs. The form-submit trigger is required because an
Edit trigger does **not** fire for a Form submission — without it, "New
Row Added" would miss the case its own description promises. Up to three
triggers per document, still never one per rule.

`onChangeDispatch` is kept as a no-op: triggers pointing at it already
exist in installed spreadsheets, and deleting the function would make
every edit fail with "script function not found". `ReplaiTriggers.sync()`
deletes those triggers on its next run.

**Two consequences worth stating plainly:**

- A value changed by a **formula, an import, or another script** is not
  detected by On Change — an Edit trigger only fires for user edits. The
  wizard's trigger hint says so, and a Time-Based Reminder rule with the
  same conditions is the workaround.
- The watermark is **no longer advanced after a run.** It only ever means
  "rows that existed before this rule did". Advancing it broke the
  commonest way anyone adds a row: type the name, the trigger fires,
  nothing matches yet because the status cell is still empty, and the
  watermark moves past the row — so finishing it is ignored forever.
  Leaving it fixed costs nothing, because a row that already sent is
  refused by the per-row idempotency key.

### 9.6 Triggers must self-heal

A rule can be saved with no trigger behind it: created by a build without
the engine, saved while the user's trigger quota was full, or created by a
colleague. In every case the rule looks completely normal and does
nothing.

`ReplaiTriggers.sync()` therefore also runs when the **sidebar opens**,
not only on a rule write. Instructing a user to "re-save your rule to make
it work" is not a fix, and no one would guess it. Self-healing is limited
to the rules' own owner and only when a key is saved, since a trigger
installed under an account with no key would fail on every run.

The rules list shows a **Not armed** pill on any enabled rule whose
trigger is missing — the one state that otherwise looks healthy and does
nothing.

---

## 10. Security review

| Risk                                   | Mitigation                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| API key leaking to sheet collaborators | `UserProperties`, never `DocumentProperties` (4.2)                                                                            |
| Key in plaintext in Apps Script        | Unavoidable; mitigated by scoping the key to `broadcasts:send` only, and by revocability in the CRM                           |
| Duplicate paid sends                   | `api_campaign_sends` UNIQUE claim-insert (5.3) + claim-based cron                                                             |
| Runaway send volume                    | Per-key rate limit (exists) + per-account daily quota (6.5, to be decided)                                                    |
| Marketing to opted-out contacts        | Already enforced in `createBroadcast()` before insert                                                                         |
| Cross-tenant access                    | Campaign resolved by `id` **and** `ctx.accountId`; every query filtered manually because the service-role client bypasses RLS |
| Malicious sheet content                | Recipients are validated as E.164 and dropped if not; params are sent as strings, never interpolated into anything executable |
| Add-on impersonating the CRM           | The add-on holds no secret beyond the user's own API key; it cannot read other accounts                                       |

Explicitly **not** doing: OAuth between the add-on and Replai. An API
key pasted once is what the reference product does, is what the
screenshots show, and avoids running an OAuth provider. Revisit only if
Marketplace review objects.

---

## 11. Testing

**Pure logic (vitest, in `sheets-addon/test/`)** — all 19 operators
against a fixed `today`, both matching and non-matching; DST and
timezone boundaries; day-of-month recurrence in February; idempotency
key stability across identical input and divergence across rows.

**CRM (existing vitest suite)** — `createBroadcast` with
`mode: 'schedule'` and an `apiCampaignId`; the duplicate-idempotency
path returning 200 without sending; a paused campaign returning 403; a
campaign from another account returning 404.

**Manual, in a real sheet** — each trigger type end to end; a rule
created by user A firing while user B is the active viewer; revoking the
API key mid-rule; a 1000-row sweep; deleting a campaign that has runs
(must not delete history).

**Reviewer test account** — Marketplace review needs working
credentials. Prepare a demo Replai account with an approved template, a
pre-made API campaign, and a sample sheet, and put the API key in the
review notes.

---

## 12. Phased build order

Each phase is independently shippable and leaves the product working.

| Phase | Scope                                                                                            | Exit criteria                                                                          |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **1** | Migrations (5.1–5.3) + `createBroadcast` extensions (6.4)                                        | Existing tests green; a scheduled API-campaign broadcast drains via cron               |
| **2** | Dashboard routes + campaigns list `Type` column + API campaign form (6.1, 6.2)                   | Can create an API campaign in the UI and see it listed                                 |
| **3** | Public API: `/campaigns`, `/campaigns/{id}`, `/campaigns/{id}/send` (6.3) + `docs/public-api.md` | `curl` can send through a campaign; replaying the idempotency key does not double-send |
| **4** | Add-on skeleton: manifest, auth, `/me` validation, API key dialog, empty state                   | Key can be saved and validated inside Sheets                                           |
| **5** | Rule CRUD + wizard steps 1 and 2 + `conditions.js` / `dates.js` with tests                       | A rule can be created and persisted; operators unit-tested                             |
| **6** | Dispatchers, send path, status write-back, batching (9.x)                                        | All three trigger types send end to end                                                |
| **7** | `App Integration` settings tab + starter-sheet template + polish                                 | Feature complete against the screenshots                                               |
| **8** | Marketplace submission (13)                                                                      | Listed and verified                                                                    |

Phases 1–3 have real value on their own: they give the CRM an API
Campaign that any external system can drive, which is the _"Send
messages from your own system"_ promise in screenshot 14 regardless of
whether the add-on ships.

---

## 13. Publishing to the Google Workspace Marketplace

Ordered, with the parts people usually get wrong flagged.

### 13.1 Prerequisites

1. **A standard Google Cloud project** — not the one Apps Script creates
   by default. Create it, then in the Apps Script editor switch the
   project to it (`Project Settings → Google Cloud Platform project`).
   The default project cannot be used for a Marketplace listing.
2. **Enable APIs** in that project: _Google Workspace Marketplace SDK_
   and _Apps Script API_.
3. **Publisher identity** — use a Google Workspace account on
   `junkiescoder.com`, not a personal Gmail. The listing shows the
   publisher, and domain ownership is verified against it.
4. **Verified domain** — add and verify `junkiescoder.com` in Google
   Search Console with the same account, then list it under _Authorized
   domains_ on the consent screen.

### 13.2 Public-facing pages that must exist first

Review checks these are live, reachable, and specific to this add-on:

- **Homepage** — a page describing the add-on, e.g.
  `https://wacrm.junkiescoder.com/integrations/google-sheets`.
- **Privacy policy** — must state what sheet data is accessed, that it
  is sent to Replai to deliver WhatsApp messages, what is retained, and
  how to delete it. A generic company privacy policy is a common
  rejection reason.
- **Terms of service.**
- **Support contact** — an address that receives mail.

### 13.3 OAuth consent screen

Configure in the Cloud project: app name, logo (120×120 PNG), support
email, developer contact, homepage, privacy policy, terms, authorized
domains, and the scope list from 7.1.

Publishing status **External → In production**.

**On verification:** `spreadsheets.currentonly` is a _sensitive_ scope,
so the app requires OAuth verification but — importantly — sensitive
scopes do **not** trigger a CASA third-party security assessment. That
is reserved for _restricted_ scopes (full Drive, Gmail read, etc.).
Staying on `spreadsheets.currentonly` instead of `spreadsheets` is
therefore worth real money and weeks of calendar time. **Do not widen
that scope.**

Verification submission needs a **demo video** (unlisted YouTube) that
shows: the OAuth consent screen with the app name visible, each
requested scope being exercised in the product, and the client ID
on-screen. Record it after the add-on works, not before.

### 13.4 Deploy the add-on

1. `clasp push` the final code.
2. In the editor: _Deploy → New deployment → Add-on_. Note the
   **deployment version number** — the Marketplace SDK pins to a
   version, so every update needs a new version and a listing update.
3. Test as an unpublished add-on first (_Deploy → Test deployments_),
   installed on a real sheet.

### 13.5 Marketplace SDK configuration

In the Cloud project → _Google Workspace Marketplace SDK → App
configuration_:

- App visibility: **Public** (or private to the domain while testing).
- Installation settings: individual + admin install.
- App integration: **Editor Add-on**, with the script ID and the
  deployment version from 13.4.
- OAuth scopes: must match the manifest **exactly**. A mismatch is an
  automatic rejection.
- Developer links: homepage, ToS, privacy, support.

### 13.6 Store listing

- **Name** — keep it short and descriptive; Marketplace truncates. e.g.
  `Replai — WhatsApp Sender & Automation`. Names implying Google
  endorsement are rejected. Note screenshot 12 shows the reference
  product's own name truncated to `WhatsApp Sender & ...`, so front-load
  the distinctive word.
- **Descriptions** — short (one line) and detailed. State plainly that
  it needs a Replai account and a Meta-approved WhatsApp template;
  hiding an account requirement is a rejection reason.
- **Graphics** — 128×128 app icon, 220×140 card banner, and at least one
  screenshot at 1280×800 or 1440×900. Screenshot 12 shows the reference
  product using annotated feature screenshots; do the same.
- **Category** — Productivity / Workflow.
- **"WhatsApp" trademark** — use it descriptively only, with the
  attribution the reference listing uses (`WhatsApp™`), never in a way
  implying Meta endorsement. Meta's brand guidelines apply on top of
  Google's review.

### 13.7 Submit and iterate

Submit for review. Two independent gates run: **OAuth verification**
(Trust & Safety) and **Marketplace app review**. Expect a
clarification round on scope justification. Budget several weeks
end-to-end and do not announce a date until the first approval lands.

Until verified, the app shows an "unverified" warning and is capped at
**100 users** — which is fine for a private beta with real customers.

---

## 14. Decisions

All six questions are answered. Nothing blocks any phase.

### 14.1 No send quota

See §6.5. Unlimited on every plan and in trial; add a subscription-state
check rather than a ceiling.

### 14.2 `On Change` — once per row, per rule

A row that matches sends **once for that rule, ever**. If a later edit
makes it match again, it does not re-send.

Why this way round: the failure modes are wildly asymmetric. A missed
send is a message a customer did not get, which the operator can see in
the sheet's status column and fix by hand. A duplicate send costs real
money per message, arrives on a stranger's phone, and pushes the
account's Meta quality rating down — and at scale it does that hundreds
of times before anyone notices.

Implemented purely through the idempotency key (§5.3): for
`New Row Added` and `On Change` the key omits any date component, so the
`UNIQUE (api_campaign_id, idempotency_key)` constraint makes a second
send structurally impossible rather than merely unlikely.

The escape hatch, when it is asked for, is a per-rule
_"Allow re-sending when a row matches again"_ toggle defaulting to off.
Not built in v1: it is not in the reference product, and every extra
control in the wizard is a thing that can be misconfigured into
duplicate billing.

### 14.3 Reminder hour — per document, default 09:00

One reminder hour per spreadsheet, editable, defaulting to **09:00 in
the spreadsheet's own timezone**. Not per rule.

This is forced by Apps Script, not by taste. Time-based triggers are
capped per user per script, and a distinct trigger per rule would burn
that budget within a handful of rules. An hourly trigger that checks
"is it time for any rule?" would instead spend the daily execution-time
quota scanning sheets 24 times a day for the sake of a preference.

One daily trigger, one hour setting, all reminder rules in the document
share it. `atHour()` fires within that hour rather than on the minute,
which the UI must say plainly — "around 09:00" — because "09:00" invites
a bug report when it lands at 09:37.

Timezone comes from `SpreadsheetApp.getSpreadsheetTimeZone()`, never the
script's and never UTC. See §9.2.

### 14.4 Media — both a column and a fixed URL

The wizard supports both, chosen with a small source toggle that appears
once Media Type is anything other than `None`:

- **From a column** — per-row media. Invoices, tickets, per-order PDFs.
- **A fixed URL** — one asset for the whole rule. A promo image, a price
  list.

Both are needed and neither substitutes for the other, so shipping one
would just generate the request for the other. The fixed case is also
the more common one and the cheaper to validate, since the URL can be
checked once at rule-creation time instead of per row.

Validation: `https://` only, and the URL is passed to Meta as
`headerMediaUrl` (never `header_handle`, which is a creation-time upload
handle Meta rejects at send time — see the note in `buildSendPlan`).

### 14.5 Key ownership — per user, with rule takeover

Keep the API key in `UserProperties` (§4.2). Do **not** add an
account-wide key in the shared document.

The "creator leaves and the rule dies" problem is solved without
weakening that, by making ownership visible and transferable:

- Each rule records the email of the user whose key installed it.
- The sidebar shows _"Runs as souaib@junkiescoder.com"_ on every rule
  card, so ownership is never a surprise.
- When a trigger fires under a user whose key is missing, revoked or
  invalid, the rule is flagged **Needs attention** instead of failing
  silently, and the reason is written to the sheet's status column.
- Any collaborator can press **Take over this rule**, which re-installs
  the trigger under their own key and updates the owner email.

That gets the resilience of a shared key with none of the exposure: a
credential that can spend money never sits in a document that gets
shared with a contractor.

### 14.6 Publisher account and Cloud project

The domain is **not yet verified** — that is the first task. The
complete click-by-click path for everything on the Google side, from
verifying `junkiescoder.com` through to pressing Submit for review, is
in a separate document so it can be followed without reading this plan:

> **[docs/google-sheets-addon-setup-guide.md](./google-sheets-addon-setup-guide.md)**

Two things settled here because they shape the build:

- **Publisher identity** — a Google Workspace account on
  `junkiescoder.com`, not a personal Gmail. The listing shows the
  publisher name and domain ownership is checked against it.
- **Cloud project ownership** — a dedicated project (suggested id
  `replai-sheets-addon`) owned by that Workspace account, with a second
  admin added immediately. A Marketplace listing is tied to its Cloud
  project for life; if the sole owner's account is ever closed, the
  listing and its install base are unrecoverable.

---

## 15. Deliberate divergences from SandeshAI

Recorded so they are choices, not drift.

| Their behaviour                     | Ours                                              | Why                                                                           |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| One account-wide UUID API key       | Named, scoped, revocable `wacrm_live_` keys       | We already have better; a single key cannot be rotated per integration        |
| Indigo/purple add-on branding       | Replai green                                      | It is our product                                                             |
| Send appears to fan out inline      | Queued through the existing 5-minute cron         | Removes the 60-second ceiling and reuses a worker that cannot double-send     |
| No visible idempotency guarantee    | Explicit idempotency key + UNIQUE claim           | Duplicate marketing sends cost money and burn quality rating                  |
| No visible per-row feedback         | Status written back to the sheet                  | Otherwise the operator cannot tell what happened                              |
| Rule dies silently with its creator | Owner shown on the card + **Take over this rule** | Resilience without putting a spending credential in a shared document (§14.5) |
| Reminder hour not configurable      | One editable hour per spreadsheet                 | Costs one control and avoids the Apps Script trigger cap (§14.3)              |
