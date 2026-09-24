# Feature: Google Sheets add-on ("Replai — WhatsApp Sender & Automation")

**State: live on the Google Workspace Marketplace. One unrelated OAuth
review (data access / scope verification) is still in progress and does
not affect the listing's live status. No development work is outstanding.**

Anchor point: Apps Script **version 4**, add-on `VERSION 1.0.0`, Marketplace
listing published 15 Sep 2026.

A Google Sheets editor add-on that sends WhatsApp Business template
messages from a spreadsheet. The user builds a rule in the sidebar — which
sheet to watch, when to run, which rows qualify — and the add-on sends
through an approved Meta template via the Replai CRM, then writes a
per-row status back into the sheet.

---

## How it fits together

```
Google Sheet ──sidebar──▶ Apps Script add-on
                              │  API key from UserProperties
                              │  HTTPS + Bearer
                              ▼
                    CRM public API  /api/v1/**
                              │
                              ▼
                    Replai CRM ──▶ Meta WhatsApp
```

**The add-on never touches the database.** It only calls `/api/v1/**` with
an account API key, the same boundary `mcp-server/` uses. That is what
keeps a Google-hosted script outside our trust domain, and it is not
negotiable when changing this feature.

Three trigger types: new row added (including linked Google Forms), on
change, and a daily time-based reminder. 19 condition operators, including
date-aware ones. Rules live in the spreadsheet's `DocumentProperties`, one
property per rule plus an index; the API key lives in per-user
`UserProperties` so collaborators cannot read it.

## Where the code lives

| Path                                                    | What                                        |
| ------------------------------------------------------- | ------------------------------------------- |
| `sheets-addon/`                                         | the Apps Script project, pushed via `clasp` |
| `sheets-addon/src/Config.js`                            | every environment constant, incl. the flags |
| `sheets-addon/test/`                                    | vitest, pure logic only (158 tests)         |
| `src/app/api/v1/campaigns/**`                           | campaign discovery + campaign-scoped send   |
| `src/app/(dashboard)/broadcasts/api-campaigns/**`       | API campaign UI                             |
| `src/app/integrations/google-sheets/**`                 | public landing, privacy, terms pages        |
| `src/app/(super-admin)/super-admin/cms/integrations/**` | CMS editor for those pages                  |
| `src/components/settings/app-integrations.tsx`          | CRM settings tab with the install link      |

## Phases

The build order from [`../google-sheets-addon-plan.md`](../google-sheets-addon-plan.md) §12.

| Phase | Scope                                                         | State              |
| ----- | ------------------------------------------------------------- | ------------------ |
| 1     | Migrations + `createBroadcast` extensions                     | done               |
| 2     | Dashboard routes, campaigns `Type` column, API campaign form  | done               |
| 3     | Public API `/campaigns`, `/{id}`, `/{id}/send` + API docs     | done               |
| 4     | Add-on skeleton: manifest, auth, `/me` validation, key dialog | done               |
| 5     | Rule CRUD, wizard steps 1–2, conditions and dates + tests     | done               |
| 6     | Dispatchers, send path, status write-back, batching           | done               |
| 7     | Settings tab, starter-sheet template, public pages, CMS       | done               |
| 8     | Marketplace submission                                        | **approved, live** |

Phase 7 was split across two agents: the settings tab, starter-sheet
template and submission pack on one side, the public pages and Super Admin
CMS on the other.

## Key facts

| Thing                    | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| Cloud project            | `replai-sheets-add-on`, app id `1050125319240`              |
| Apps Script ID           | `1R_NlhhETTuRA4DcGLpnDstmN8NxGeGZdPJrXQypvGgqsd-gQlkqP6U4x` |
| Published script version | `4` (deployment "V1.0.0 Production")                        |
| Production host          | `https://wacrm.junkiescoder.com`                            |
| Dev host                 | `https://devcrm.junkiescoder.com` (Cloudflare tunnel)       |
| Add-on type              | **Editor** add-on, not a Workspace add-on                   |
| Listing category         | Sales and CRM                                               |
| Pricing                  | Free of charge with paid features                           |
| Tests                    | 158 add-on / 7 files; CRM suite 1372 / 112 files            |

OAuth scopes, all five declared in `appsscript.json` before they were
used, so no user ever has to re-consent:

```
spreadsheets.currentonly   script.external_request   script.scriptapp
script.container.ui        userinfo.email
```

`userinfo.profile` also appears in the Marketplace SDK. Google adds email
and profile by default; it is not in our manifest and the add-on does not
use it.

**No restricted scopes.** `spreadsheets.currentonly` was chosen over the
full `spreadsheets` scope specifically to stay out of that bracket, which
is what avoids a CASA third-party security assessment. Do not widen it.

## Live in production

All verified 200:

```
/integrations/google-sheets           landing
/integrations/google-sheets/privacy   add-on privacy policy
/integrations/google-sheets/terms     add-on terms
/privacy  → /legal/privacy-policy     /terms → /legal/terms-of-service
/contact                              support URL on the listing
```

The three integration pages are **CMS-driven**, rendered from the
`integration_pages` row for slug `google-sheets`, editable at
`/super-admin/cms/integrations/google-sheets`.

## Live on the Marketplace

**Published and installable**, confirmed by the approval email from
`gwm-review@google.com` (15 Sep 2026) and the live listing:

```
https://workspace.google.com/marketplace/app/replai___whatsapp_sender_automation/1050125319240
```

Listing currently shows "No reviews" / "No users" — expected for a
same-day publish, not a fault.

## What is still in progress, and on whom

One review remains open, and it does **not** gate the listing above —
that one already passed on its own track.

| Review                         | State                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth branding                 | ✅ verified, shown to users (passed without an app logo)                                                                                             |
| Marketplace store listing      | ✅ **approved and published**                                                                                                                        |
| OAuth data access verification | ⏳ in progress — homepage & branding sub-checks passed; privacy policy, app functionality, appropriate data access, and minimum scopes still pending |

Google's own estimate for data access verification is **3–5 days for
first contact, up to 4–6 weeks total**. This review is about scope
verification for the `Unverified` sensitive scopes
(`script.external_request`, `script.scriptapp`, `script.container.ui`),
not about whether the add-on can be installed — it already can be, by
anyone. Watch `souaib@junkiescoder.com` for the Trust & Safety team's
first email; the demo video `https://youtu.be/jDtn5AL5o1E` is already
submitted against it.

## Left to do

Nothing in code. Owner tasks only:

- Respond promptly if Trust & Safety emails with a question — an
  unanswered request restarts the review.
- Add more screenshots to the listing; only one is uploaded. Add the demo
  video to the listing's own Promo Videos field too — it currently only
  exists on the verification form, not the listing.
- Retry the OAuth consent screen logo once the data access review closes.
  It was removed to get branding through, so the consent screen is
  logo-less for now.
- Install on a completely clean Google account (one that never used a
  draft/test build) and confirm triggers arm and fire. Nothing else
  proves this end to end.
- Revoke the reviewer's API key if one was issued during verification.
- Watch for the first real install and reply to the first real review.

## Gotchas worth knowing before changing anything

- **`REPLAI_DEV` in `Config.js` picks the host, the allowlist does not.**
  Both hosts stay in `urlFetchWhitelist`; the flag alone decides. It must
  be `false` in any push that becomes a version. Check the sidebar footer,
  not the source: a dev build reads `Add-on v1.0.0 · dev`.
- **`clasp push` publishes nothing.** Push updates the editor, `clasp
create-version` freezes a snapshot, and the Marketplace SDK's script
  version decides what installed users run. All three are separate.
- **It is an Editor add-on, so the SDK takes a version _number_**, not a
  deployment ID. The field wants a bare integer.
- **`onOpen` runs in `AuthMode.NONE`.** `PropertiesService`, `UrlFetchApp`
  and `Session` are all unavailable there. Touching one throws and the
  add-on menu never appears, so `onOpen` only builds a static menu.
- **Nothing throws for an expected failure.** `src/api.js` returns
  `{ok, status, code, message}`; an uncaught throw in a trigger ends the
  whole run and skips every remaining rule.
- **The CMS page content is a hand-written database row.** The migration
  only creates an empty table. Rebuilding the database from migrations
  alone would blank the privacy and terms pages, which breaks the listing
  silently. Back the row up before touching that table.
- **Phone columns must be formatted as plain text before values are
  written.** A phone in a default cell is parsed as a number and loses its
  `+`, and formatting afterwards cannot recover it.
- **Sample phone numbers stay in the NANP fiction range** (`+1202555xxxx`).
  Plausible-looking real numbers may belong to someone.
- **`Sending · <time>` in the status column is a success**, not a pending
  state. Delivery is confirmed in the Inbox, not the sheet.

## Reference docs

| Doc                                                                                                 | For                                                  |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`google-sheets-addon-plan.md`](../google-sheets-addon-plan.md)                                     | the specification, architecture and design decisions |
| [`google-sheets-addon-setup-guide.md`](../google-sheets-addon-setup-guide.md)                       | first-time developer setup                           |
| [`google-sheets-addon-marketplace-submission.md`](../google-sheets-addon-marketplace-submission.md) | listing copy, scope justifications, reviewer notes   |
| [`google-sheets-addon-go-live-guide.md`](../google-sheets-addon-go-live-guide.md)                   | the release runbook and pre-submission checklist     |
| [`../../sheets-addon/README.md`](../../sheets-addon/README.md)                                      | add-on internals and why each choice was made        |
