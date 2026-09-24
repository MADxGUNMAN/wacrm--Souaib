# Replai — WhatsApp Sender & Automation (Google Sheets add-on)

A Google Sheets **editor add-on** that sends WhatsApp messages through
Replai [API campaigns](../docs/public-api.md#api-campaigns). It talks to
the CRM only over the public API — it has no database access and holds no
secret beyond the user's own API key.

Build plan: [`docs/google-sheets-addon-plan.md`](../docs/google-sheets-addon-plan.md).
Publishing steps: [`docs/google-sheets-addon-setup-guide.md`](../docs/google-sheets-addon-setup-guide.md).

**Phases 4, 5 and 6 of 8 are implemented.** The add-on is functionally
complete: an API key is saved and validated, rules are built in a
two-step wizard, and saved rules install real triggers that evaluate the
sheet and send real WhatsApp messages through a Replai API campaign,
writing the result back into a `Replai Status` column.

What is left is packaging, not mechanics: the CRM-side **App Integration**
tab and the starter-sheet template (phase 7), then the Marketplace
listing (phase 8).

## Project

|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| Apps Script ID | `1R_NlhhETTuRA4DcGLpnDstmN8NxGeGZdPJrXQypvGgqsd-gQlkqP6U4x`      |
| Cloud project  | `replai-sheets-add-on` (project number `1050125319240`)          |
| Owners         | souaib@junkiescoder.com, info@junkiescoder.com                   |
| Targets        | `devcrm` while `REPLAI_DEV` is on, else `wacrm.junkiescoder.com` |

## Layout

```
sheets-addon/
├── appsscript.json      manifest: scopes, runtime, URL allowlist
├── .clasp.json.example  copy to .clasp.json (untracked) before pushing
├── .claspignore         deny-all, then allow manifest + src/*.js + ui/*.html
├── vitest.config.mjs    scoped to test/, separate from the repo root's
├── src/
│   ├── Config.js        every environment constant, one place
│   ├── Code.js          Apps Script entry points + client-callable API
│   ├── auth.js          API key custody (UserProperties) + /me validation
│   ├── api.js           the only network code: retries, error mapping
│   ├── dates.js         date reading + recurrence maths — PURE, tested
│   ├── conditions.js    the 19 operators — PURE, tested
│   ├── phone.js         cell value → E.164 — PURE, tested
│   ├── rowmap.js        row → API recipient + key recipe — PURE, tested
│   ├── rules.js         rule schema (PURE, tested) + DocumentProperties store
│   ├── sheets.js        tabs, headers, rows, timezone, status write-back
│   ├── campaigns.js     campaign list + template introspection from the CRM
│   ├── send.js          the one place a real paid message is triggered
│   ├── triggers.js      installs exactly two triggers, never one per rule
│   └── dispatcher.js    what happens when a trigger fires
├── ui/
│   ├── Shared.css.html  design tokens shared by sidebar + dialog
│   ├── Sidebar.html     shell; swaps one <section> per state
│   ├── Sidebar.css.html sidebar layout (fixed ~300px column)
│   ├── Sidebar.js.html  shell logic: state, views, rule cards
│   ├── Wizard.css.html  rule cards, stepper, wizard controls
│   ├── Wizard.js.html   the two-step rule wizard
│   └── ApiKeyDialog.html the setup modal, self-contained
└── test/
    ├── dates.test.js
    ├── conditions.test.js
    └── rules.test.js
```

`clasp` flattens nothing: `src/Code.js` becomes the project file
`src/Code`, and `ui/Sidebar.js.html` becomes `ui/Sidebar.js`, which is why
the templates include `ui/Sidebar.js` and not `Sidebar.js.html`.

## Working on it

```bash
cd sheets-addon
npm install
cp .clasp.json.example .clasp.json     # PowerShell: Copy-Item
npm run login                          # once per machine
npm run push
npm run open                           # opens the script editor
```

Enable the Apps Script API first, once per Google account:
<https://script.google.com/home/usersettings>.

### Testing it in a real sheet

The add-on is **container-independent** (a standalone script), so it is
tested through a deployment rather than by opening a bound sheet:

1. In the script editor: **Deploy → Test deployments → Install**.
2. Pick or create a spreadsheet, then open it.
3. **Extensions → Replai — WhatsApp Sender & Automation → Open Replai**.
4. Paste an API key created in Replai (**Settings → API**) with the
   **Launch broadcast campaigns** permission.

### After publishing, `clasp push` alone changes nothing

A Marketplace listing points at a **pinned script version**, not at Head.
So once the add-on is installed from the Marketplace, pushing code updates
Head while the installed add-on keeps running the old frozen snapshot —
silently, with no indication anywhere. The footer version is how you
notice.

The full loop after any change:

```bash
npm run push
```

1. Apps Script → **Deploy → Manage deployments** → edit the add-on
   deployment → Version: **New version** → Deploy. Note the number.
2. Cloud Console → **Google Workspace Marketplace SDK → App
   Configuration** → **Script Version** → set it to that number → Save.
3. Reload the spreadsheet and check the footer shows the version you just
   built.

### "Installed" is not "working" — reinstalling triggers

`ScriptApp.getProjectTriggers()` cannot tell a live trigger from a dead
one, and dead ones are normal:

- A trigger created in a **test deployment** is left permanently
  **Disabled** by Google, and still appears in the list.
- A trigger created **before the add-on was installed** from the
  Marketplace belongs to the old context, does not fire for the installed
  add-on, and still appears in the list.

`sync()` used to treat "a trigger with this handler exists" as proof the
engine was armed, so a stale trigger blocked a good one from ever being
created. Two things fix that:

- **A heartbeat.** Every dispatch records the time it ran, before doing
  anything that could fail. The sidebar then reports `Last fired …` or
  `Never fired yet` rather than a bare "Active", which is the difference
  between a diagnosable problem and an invisible one.
- **Reinstall triggers**, in the sidebar while unproven and always in
  **Extensions → Replai → Help & Support**. It deletes and recreates them,
  and clears the heartbeat so the new ones have to earn it. Recreating is
  the only available fix for either case above.

## The add-on menu

```
Extensions → Replai — WhatsApp Sender & Automation
├── Open Replai
├── Set up API key
└── Help & Support
```

`Reinstall automatic triggers` and `Disconnect this account` used to sit
in this menu as two more entries. They are inside **Help & Support** now,
under headings that explain what they do, alongside the support routes,
the documentation links, a reset and an issue-report form. Two
destructive-sounding verbs in a dropdown with no context was the worst
place for them.

### Every string in that dialog is operator-editable

The dialog renders **no hardcoded copy**. Titles, section headings, button
labels, the support links and their subtitles all come from
`GET /api/public/sheets-addon/help`, and are edited in the CRM under
**Super Admin → Sheet Add-on → Help Content**.

That is a deliberate constraint, not an accident of design. A fallback
string compiled into the add-on would silently override whatever an
operator typed in the panel, and nothing in the rendered dialog would
reveal which of the two was winning — so the panel would look broken
while being correct. The cost is that a failed fetch has to _look_ like a
failure: the dialog shows a retry, never invented content.

Two consequences worth knowing:

- **The menu label itself is not editable.** `onOpen` runs in
  `AuthMode.NONE`, where `PropertiesService` and `UrlFetchApp` both throw.
  A label fetched from the CRM would mean no add-on menu at all on first
  open.
- **The endpoints are unauthenticated** (`/api/public/…`, no API key).
  Every `/api/v1` route requires a valid key, and the person most likely
  to open Help & Support is the one whose key will not validate. A support
  screen that demands working credentials is no use to them. Reports still
  attribute themselves to an account when a usable key happens to be
  stored; when it is not, the report lands unattributed rather than being
  rejected.

### Reset Everything

Clears the API key, **every rule in the spreadsheet**, and all triggers,
scoped to this spreadsheet and this user. Rules live only in
DocumentProperties — there is no server copy — so this cannot be undone,
which is why it is behind a two-step confirm that names the live rule
count before you commit.

Order matters in the implementation: triggers are removed **first**. A
sweep that fired between deleting the rules and deleting the triggers
would run against half-erased state and write nonsense into the status
column.

### A test deployment cannot fire triggers

Google's docs on
[testing editor add-ons](https://developers.google.com/apps-script/add-ons/test)
state it plainly: **installable triggers aren't supported in a test
deployment.** The add-on creates them, the Triggers panel lists them, and
Google leaves them permanently **Disabled** — `Last run` reads
`Disabled` and the Executions log never shows `onEditDispatch`.

So in a test deployment, editing a cell cannot fire anything, and this is
not something the code can work around. A test deployment is still the
right place to check **anything that is not a real send** — every sidebar
screen, the wizard, rule validation, and **Preview**, which reports which
rows would send and why the rest would be skipped without messaging
anyone.

For a real send there were two routes, and only one is left:

- ~~**Send now**~~ — removed in 1.0.1. It took one row and sent it for
  real from the sidebar, which made it the quickest way to exercise the
  whole pipeline, but a one-click control that spends money and reaches a
  real person does not belong in a shipped product. `ReplaiDispatcher.runRow`
  still exists and can be called from the Apps Script editor if a
  named-row send is needed during development; nothing in the UI reaches
  it.
- **A container-bound copy**, which also tests the triggers themselves and
  is now the way to verify a send end to end. From the test spreadsheet:
  **Extensions → Apps Script**, paste the `src/` and `ui/` files into that
  bound project, and run `ReplaiTriggers.sync()` once from the editor.
  Installable triggers work normally in a bound script, so edits fire the
  engine for real. Keep it as a scratch project — the add-on itself must
  stay standalone.

Triggers begin working properly the moment the add-on is installed from
the Marketplace, including an unlisted or domain-internal publish.

### First-run consent

The first run asks for consent. Read that consent screen carefully and
compare it against `oauthScopes` in the manifest — plan §2.9 flags one
scope on the reference product's consent screen we could not map from
Google's docs. If Google's screen lists something the manifest does not,
pin the manifest to what actually appears before submitting for review.

### Running the tests

```bash
npm test            # vitest run — 141 tests
```

Covered: `dates.js`, `conditions.js`, `phone.js`, `rowmap.js`, the schema
half of `rules.js`, and `ReplaiSheets.rowsFromEvent` — the last of those
because reading the edited row out of the wrong event object is what made
On Change rules silently never fire. Those are the parts where
being wrong is expensive and invisible — a date operator that fires a day
early sends a real message on a date nobody chose, and a phone number
that normalises loosely sends one to a stranger — and they are the only
parts that can run outside Apps Script.

Apps Script has no module system, so each pure file ends with a
`typeof module !== 'undefined'` export block that never executes inside
Sheets. Where one pure file depends on another, the test wires it up on
`globalThis` rather than adding a `require()` to production source.

### Watching what it does

```bash
npm run logs        # clasp tail-logs --watch
```

Requires `projectId` in `.clasp.json` (the Cloud project number above)
and the Cloud Logging API enabled on that project.

## Design decisions worth knowing

**The API key lives in `UserProperties`, never `DocumentProperties`.**
DocumentProperties is readable by every editor of the spreadsheet, so
storing an account-wide sending credential there would hand it to anyone
the sheet is shared with. The consequence is that a key is per-person: a
collaborator opening the same sheet is prompted for their own, and a rule
sends under whoever installed its trigger. That is why the sidebar shows
**Runs as \<email\>**.

**One hard-coded base URL, not a setting.** A published add-on can only
fetch URLs listed in the manifest's `urlFetchWhitelist`, and that
allowlist is [required for a versioned
deployment](https://developers.google.com/apps-script/manifest/allowlist-url)
(it is optional only for the untracked test deployments used during
development). A "point this at my own server" field therefore could not
work in the published build — the fetch would be blocked whatever the
user typed. Self-hosters fork this folder and change two lines:
`BASE_URL` in `src/Config.js` and the allowlist entry in
`appsscript.json`.

**Development targets the tunnelled dev CRM.** Apps Script has no route
to localhost, so `REPLAI_DEV` in `src/Config.js` swings `BASE_URL` to
`devcrm.junkiescoder.com`, reached through a Cloudflare tunnel.

**Both hosts stay allowlisted, and that is deliberate.** The manifest
lists production and dev; `REPLAI_DEV` alone decides which is used. The
allowlist is a permission to fetch, not a choice of target, so listing
both costs nothing at runtime and buys two things: switching environments
is one line plus `clasp push`, and no version can ship with an allowlist
that forgot the host it is pointed at. Publishing is unaffected either
way — a version is an immutable snapshot, so pushing dev code into the
editor cannot reach anyone running the published version.

The sidebar footer shows `Add-on v1.2.0 · dev` on a dev build and the
bare version on a production one, so a spreadsheet never leaves you
guessing which CRM it is talking to.

## Switching environments

```bash
# point at the tunnelled dev CRM
# src/Config.js → const REPLAI_DEV = true;
npm run push

# back to production
# src/Config.js → const REPLAI_DEV = false;
npm run push
```

Confirm which one you are on from the sidebar footer, not from memory.

## Before `clasp create-version`

A version is what the Marketplace serves, so this is a release blocker,
not a nit. It is **done for 1.2.0**; re-check it on every later version,
because a local debugging session is the usual way it regresses:

- [x] `REPLAI_DEV = false` in `src/Config.js`, verified by the footer
      showing no `· dev` marker. A published add-on pointed at a laptop
      tunnel breaks for every user the moment that tunnel closes.

The dev host in `urlFetchWhitelist` is **not** a release blocker. Both
entries are hosts we own on one domain. If review asks, the answer is
that `devcrm` is our staging deployment of the same CRM.

Full release runbook, including the Marketplace listing fields and the
Apps Script deployment step a `clasp push` does **not** cover:
[`docs/google-sheets-addon-go-live-guide.md`](../docs/google-sheets-addon-go-live-guide.md).

**All five scopes are declared now, before phases 5–6 use them.** Adding
a scope after release forces every existing user through consent again,
and an add-on that silently stops working until each person re-authorises
is worse than one scope explained at install time. Justification, one
line each (Marketplace review asks):

| Scope                      | Why                                                              |
| -------------------------- | ---------------------------------------------------------------- |
| `spreadsheets.currentonly` | Read the rows/headers a rule targets; write delivery status back |
| `script.external_request`  | Call the Replai API to send                                      |
| `script.scriptapp`         | Install the two dispatcher triggers (phase 6)                    |
| `script.container.ui`      | Render the sidebar and the setup dialog                          |
| `userinfo.email`           | Show which account a rule runs as                                |

**Nothing throws for an expected failure.** `src/api.js` returns result
objects (`{ok, status, code, message}`) rather than exceptions, because
an uncaught throw in a sidebar handler reaches the user as Apps Script's
generic red toast with the real reason discarded — and in a background
trigger it ends the whole run, skipping every remaining rule.

**A key is validated before it is stored.** `GET /api/v1/me` needs no
scope, so it cleanly separates "this key is dead" from "this key is alive
but cannot send". Storing first and discovering later produces a
mysterious 401 on the user's first real send.

**Rules live one per property, with an index.** A property value is
capped at 9 kB and a whole store at 500 kB. One JSON array of every rule
would fit roughly ten before writes started failing — and it would fail
by silently rejecting the eleventh. So each rule is
`replai.rule.<id>` and `replai.ruleIndex.v1` holds the order, which also
means saving one rule cannot corrupt another. `ReplaiRules.list()`
self-heals: an id whose rule is missing or unparseable is dropped from
the index instead of breaking the sidebar forever.

**Rules are per document; the key is per user.** A rule describes _this_
spreadsheet's columns, so it belongs to the file and keeps working when
the file is shared. Each rule records the email whose key created it, and
the card shows it, so nobody has to guess who a rule sends as.

**Dates travel as `{y, m, d}`, and the timezone is resolved before they
get there.** A date cell has no timezone — 14 September means that
wall-clock date to whoever typed it — so putting one in a `Date` attaches
a zone and the day can shift on the way back out. `dates.js` therefore
takes "today" already resolved in the **spreadsheet's** timezone
(`SpreadsheetApp.getSpreadsheetTimeZone()`), never the script's and never
UTC. Day arithmetic runs in UTC milliseconds so a DST transition cannot
duplicate or skip a calendar day. This diverges from the plan's §9.2
sketch, which passed a `Date` plus a timezone string.

**Columns are matched by header name, not index.** Inserting a column
shifts every index and would silently repoint a rule at the wrong data.
The cost is duplicate headers, which are reported to the wizard so it can
warn rather than quietly using the first one.

**Text comparison trims and ignores case; numeric comparison does not
guess.** A trailing space in a cell is invisible and routine, so `'Pass '`
matching `'Pass'` is correct behaviour, not laxness. In the other
direction, `'1000 units'` is **not** a number: `parseFloat` would read it
as 1000 and fire a "Price > 500" rule on a row that says no such thing.

**Reminder schedules live on the rule; the trigger is a dumb hourly
sweep.** Apps Script caps time-based triggers at 20 per user per script,
shared across every spreadsheet that user has the add-on in, so a trigger
per rule exhausts the budget after a handful of rules and then fails on
the next save. The first design went the other way — one trigger at one
hour for the whole document — which is why a rule had no time of its own
and "daily" was the only frequency there could be.

So there is still exactly **one** time-based trigger, but it fires hourly
and asks each rule whether it is due (`ReplaiSchedule.isDue`). That buys
per-rule hours plus weekly and monthly without asking Google for anything
extra. A sweep with nothing due reads document properties and compares
numbers — it never touches the sheet. All of the decision logic is pure and
unit-tested in
`src/schedule.js`, because a reminder that fires on the wrong day, or
silently never fires, is invisible from inside the product.

Three details in there that each fix a real failure:

- **Hourly is a hard floor for add-ons.** An every-minute sweep was built
  and Google rejected it outright: _"The recurrence interval for an Add-on
  trigger must be at least one hour."_ That limit is specific to editor
  add-ons — `everyMinutes(1)` works in a container-bound script, which is
  why the general `everyMinutes()` docs never mention it — and the failure
  is total, not graceful: `create()` throws, nothing is installed, and
  every reminder rule reads "Not armed". The wizard therefore pins its time
  input to whole hours (`step="3600"`) and says "runs within that hour".
  A `minute` field is still honoured by `isDue` for rules saved during that
  attempt.
- **`>=`, not `===`, on minutes-since-midnight.** Google can skip or delay
  a sweep; exact matching would drop that day's run entirely.
- **A monthly date is clamped to the month's length.** `dayOfMonth === 31`
  matched literally would silently skip seven months a year.

A `lastFiredOn` stamp on the rule keeps the hourly sweep from re-running a
rule it already handled today.

**Triggers are scoped per spreadsheet, and the two kinds are scoped
differently.** `ScriptApp.getProjectTriggers()` returns the user's triggers
for the whole SCRIPT, not for this file, so matching them by handler name
alone pooled every spreadsheet's triggers together. A user with rules in
two sheets hit three failures at once: the second sheet saw the first
sheet's trigger and installed nothing, `status()` reported it armed while
none of its rules could fire, and the duplicate-pruning branch deleted the
other sheet's trigger — breaking the sheet that did work.

Scoping now matches what Google exposes:

| Trigger     | Attributed by                                         |
| ----------- | ----------------------------------------------------- |
| edit, form  | `getTriggerSourceId()` — the spreadsheet's file id    |
| time-driven | a unique id recorded per (user, document) on creation |

A clock trigger reports **no** source document, so there is nothing on the
Trigger object that says which sheet it serves. Its `getUniqueId()` is
therefore stored in `UserProperties` under a document-keyed property when
it is created, and a sweep counts as this document's only if the ids match.

A clock trigger that no document claims is an orphan — from the pooled era,
or one whose record was lost — and is deleted, because it runs a sweep
nothing manages and burns the user's trigger-runtime quota. Claims are
checked across every document first, so a sibling sheet's live sweep is
never mistaken for one. If the claim list cannot be read at all, nothing is
pruned: `allRecordedSweepIds_` returns `null` rather than `[]` specifically
so a failed read cannot be misread as "nothing is claimed".

## How the engine avoids sending 500 messages by accident

Three independent limits, because this is the failure that cannot be
undone. `onChange` reports a coarse change type and does **not** say which
cells changed, so the obvious implementation re-evaluates the whole sheet
on every edit — and on a sheet that already holds 500 matching rows, the
first edit anyone makes sends 500 paid messages to real people.

1. **On Change looks only at the rows the change touched** (the active
   range). No active range means no candidates, not all of them.
2. **New Row Added looks only past a watermark** recorded when the rule
   was saved, so rows that already existed can never be "new". Resuming a
   paused rule re-baselines it, because the sheet kept growing while it
   was paused.
3. **Every send carries a per-row idempotency key**, so even if 1 and 2
   were wrong, the CRM's `UNIQUE` constraint refuses a second send for
   that row rather than merely making it unlikely.

Only the daily reminder sweep looks at every row, which is the entire
point of a daily reminder sweep.

**Which trigger, and why not `onChange`.** Three installable triggers:
an **Edit** trigger (`onEditDispatch`) for New Row Added and On Change, a
**form-submit** trigger for rows a linked Google Form adds, and a
**time-driven** trigger for reminders. Never one per rule.

The Change trigger is deliberately unused, and that is a bug fix rather
than a preference. It fires for more kinds of change, but its event object
carries **no range**, so a rule driven by it cannot tell which row to look
at. The first implementation used it and fell back to
`getActiveRange()` — the selection of whoever is looking at the sheet,
which in a background trigger is routinely null. On Change rules silently
never fired: the run started, found no candidate rows, and completed
successfully having done nothing. `e.range` on an Edit trigger is the cell
the user actually changed. A form-submit trigger is separately required
because an Edit trigger does **not** fire for a Form submission.

Two consequences to know about. A value changed by a **formula, an import
or another script** is not detected by On Change, because an Edit trigger
only fires for user edits — use a Time-Based Reminder rule with the same
conditions for those. And the watermark is **never advanced after a run**:
advancing it broke filling a new row cell by cell, because the first
keystroke fired a run that matched nothing and moved the watermark past
the row.

**Triggers self-heal when the sidebar opens.** A rule can exist with no
trigger behind it — created by a build without the engine, saved while the
trigger quota was full, or created by a colleague — and it looks
completely normal while doing nothing. So `ReplaiTriggers.sync()` runs on
sidebar open as well as on every rule write. Telling a user to re-save
their rule to make it work is not a fix. An enabled rule with no trigger
shows a **Not armed** pill rather than a reassuring "Active".

**One API call per row, not batched.** The plan's §9.3 sketched batching
matches into calls of ≤500 recipients, and that is not safely
implementable against this endpoint: `POST /campaigns/{id}/send` takes one
idempotency key per call, and correctness comes from that key being per
row. A batch would key off the set of rows in it, so adding one more
matching row tomorrow changes the set, changes the key, and re-sends every
row already sent in that batch. Per-row calls are slower; a duplicate
paid message costs money, reaches a real person, and pulls the account's
Meta quality rating down. `MAX_SENDS_PER_RUN` in `dispatcher.js` is what
keeps the slower path inside the 6-minute execution ceiling — leftovers
are picked up by the next run.

**Failures are split into "this row" and "this whole run".** A dead key, a
paused campaign or a lapsed subscription fails identically for every
remaining row, so the run stops on the first one. Grinding through 300
rows would waste the budget and bury the real reason under 300 identical
status cells.

**Runs are serialised with a document lock.** Writing the status column is
itself a change to the spreadsheet, so a run can re-fire the trigger that
started it. The lock cannot prevent a duplicate message — the idempotency
key already does — but it stops the account's API budget being spent
re-checking rows that are already done.

## The starter sheet

**Create template** in the sidebar's empty state writes a correctly-shaped
tab (`src/template.js`). Three details in it are correctness rather than
decoration:

- The phone column is set to **plain text before anything is written**.
  A number written into a default cell is parsed as a number, so
  `+919876543210` loses its plus — and applying a text format afterwards
  cannot bring it back.
- The date column holds **real `Date` values**, not text. The date
  operators read a cell's real Date and only fall back to parsing text, so
  a starter sheet with text dates would quietly demonstrate the weaker
  path.
- The sample numbers come from the NANP range **reserved for fiction**
  (`555-0100`–`555-0199`), so they cannot reach anyone. A plausible
  placeholder like `+91 98765 43210` is a valid Indian mobile number and
  may well belong to someone.

It never reuses an existing tab: a sheet already called `Replai Starter`
holds somebody's data, so the new one becomes `Replai Starter 2`.
Guidance lives in header **notes**, not extra rows — a row added here
would be evaluated by a rule and could be messaged.

## Not yet built

| Phase | Scope                  |
| ----- | ---------------------- |
| 8     | Marketplace submission |

Submission steps, listing copy, scope justifications and the reviewer test
account are in
[`docs/google-sheets-addon-marketplace-submission.md`](../docs/google-sheets-addon-marketplace-submission.md).

## Credits

Built by [Souaib Ansari](https://ansarisouaib.in) for Junkies Coder.

Published on the Google Workspace Marketplace by **Junkies Coder**, which is
the developer identity in the Marketplace listing (Cloud project
`replai-sheets-add-on`). This section is repo documentation and is not part of
the distributed add-on - see `.claspignore`.
