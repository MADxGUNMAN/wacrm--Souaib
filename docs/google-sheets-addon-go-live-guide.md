# Go-live guide — Replai for Google Sheets

This is the click-by-click runbook for taking the add-on from "finished in
the repo" to "listed on the Google Workspace Marketplace". Follow the
sections in order. Each one ends with a way to check it actually worked
before you move on.

**The code side is done.** As of this guide:

| Thing                           | State                                                      |
| ------------------------------- | ---------------------------------------------------------- |
| `REPLAI_DEV`                    | `false` — the add-on now calls `wacrm.junkiescoder.com`    |
| `urlFetchWhitelist`             | production **and** dev host, on purpose — see 2.6          |
| `VERSION` in `Config.js`        | `1.0.0`                                                    |
| `HOMEPAGE_ENABLED`              | `true`                                                     |
| "Limited Use" disclosure        | present on the add-on privacy page (added to the database) |
| Typecheck / add-on tests / lint | all green (158 add-on tests pass)                          |

**What is left is entirely on your side**: deploy, then fill in forms and
upload images. Nothing below needs a developer.

Long-form listing copy (the full detailed description, the scope
justification wording, the reviewer notes) lives in
[`google-sheets-addon-marketplace-submission.md`](./google-sheets-addon-marketplace-submission.md).
That file is the source of truth for wording; this file is the source of
truth for **order of operations**. Where a value is short enough to
copy-paste, it is repeated here so you do not have to flip between the two.

---

## Section 1: Deploy the CRM code to production

Right now the five pages Google needs to see return **404 on production**.
They work on the dev tunnel only. Nothing else in this guide can be
completed until this section is done.

### 1.1 Understand what triggers a deploy

The GitHub Actions workflow `.github/workflows/master_ci.yml` runs **only
on a push to `master`**. It then:

1. Builds an ARM64 Docker image and pushes it to GHCR.
2. SSHes into the production server, `cd /opt/wacrm`.
3. `docker compose pull` + `docker compose up -d`.
4. Polls `http://localhost:3000/api/health` ten times, ten seconds apart.
5. **If the health check never passes, it automatically rolls back** to the
   previous image and the workflow fails.

So a red workflow generally means production is still on the old build, not
that production is broken. That is a safety net, not a reason to skip
checking.

### 1.2 Review what you are about to ship

You are currently on branch `wip/souaib`, with one unpushed commit and a
large pile of uncommitted work. Look at it before staging:

```powershell
git status
git diff --stat
```

⚠️ **Most of the new integration pages are untracked files, not modified
ones.** A `git add` that misses a directory will deploy a half-built
feature that compiles and then 404s exactly like it does now. These are the
new paths that must all be staged:

```
src/app/integrations/
src/app/privacy/
src/app/terms/
src/app/api/super-admin/cms/integration-pages/
src/app/(super-admin)/super-admin/cms/integrations/
src/components/settings/app-integrations.tsx
supabase/migrations/20260915120000_integration_pages.sql
sheets-addon/src/template.js
sheets-addon/test/template.test.js
sheets-addon/test/events.test.js
docs/google-sheets-addon-marketplace-submission.md
docs/google-sheets-addon-go-live-guide.md
```

### 1.3 Commit and push

```powershell
git add -A
git status
git commit -m "Google Sheets add-on: integration pages, CMS editor, 1.0.0 release config"
git push -u origin wip/souaib
```

Run `git status` **after** `git add -A` and read the staged list. That is
the last cheap moment to notice a stray file.

### 1.4 Merge to master (this is what deploys)

```powershell
git checkout master
git pull origin master
git merge wip/souaib
git push origin master
```

⚠️ **`git push origin master` starts a production deploy immediately.**
There is no confirmation step and no staging environment in between. Do
this when you can watch it for the next ten minutes.

Then open the run: **GitHub → your repo → Actions → "Deploy WhatsApp CRM"**.
A successful run ends with a green summary saying
`WhatsApp CRM Deployed to Production`. Expect roughly 8–15 minutes; the ARM
build is the slow part.

### 1.5 Verify the deploy

Wait for the workflow to go green, then run this in PowerShell:

```powershell
$ProgressPreference = 'SilentlyContinue'
$urls = @(
  'https://wacrm.junkiescoder.com/integrations/google-sheets',
  'https://wacrm.junkiescoder.com/integrations/google-sheets/privacy',
  'https://wacrm.junkiescoder.com/integrations/google-sheets/terms',
  'https://wacrm.junkiescoder.com/privacy',
  'https://wacrm.junkiescoder.com/terms',
  'https://wacrm.junkiescoder.com/contact'
)
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -ErrorAction Stop
    "$($r.StatusCode)  $u"
  } catch {
    "$($_.Exception.Response.StatusCode.value__)  $u"
  }
}
```

**All six must print `200`.** These are the five required pages plus the
support page:

| URL                                   | Expected                                                        |
| ------------------------------------- | --------------------------------------------------------------- |
| `/integrations/google-sheets`         | 200, the add-on landing page                                    |
| `/integrations/google-sheets/privacy` | 200, the add-on privacy policy                                  |
| `/integrations/google-sheets/terms`   | 200, the add-on terms                                           |
| `/privacy`                            | 200 **after following a redirect** to `/legal/privacy-policy`   |
| `/terms`                              | 200 **after following a redirect** to `/legal/terms-of-service` |
| `/contact`                            | 200 (already live today)                                        |

⚠️ **`/privacy` and `/terms` are redirects, so a `curl -I` will show `307`,
not `200`.** That is correct behaviour, not a failure. If you prefer curl,
follow redirects and print only the final code:

```bash
curl -sIL -o /dev/null -w "%{http_code}\n" https://wacrm.junkiescoder.com/privacy
```

### 1.6 Then open the pages in a browser and actually read them

A 200 is not proof the content is there. Open
`https://wacrm.junkiescoder.com/integrations/google-sheets/privacy` and
confirm you see the real policy text, **not** the words
"No privacy policy content configured yet".

That fallback would mean the production build is pointing at a different
Supabase project than the one holding the content. The pages are rendered
from the `integration_pages` table in project `dknolotutfiesuhbhmze`. Dev
and production share that project today, so this should be fine — but the
production image is built with the GitHub secret
`NEXT_PUBLIC_SUPABASE_URL`. If you ever see the fallback text, check that
secret first (**GitHub → Settings → Secrets and variables → Actions**); it
must be `https://dknolotutfiesuhbhmze.supabase.co`.

Use `Ctrl+F` on the privacy page and search for **Limited Use**. It must be
there. Section 8 explains why.

> **Worth knowing, not blocking:** the page content exists as a database
> row that was written by hand. The migration file only creates the empty
> table. If that database were ever rebuilt from migrations alone, these
> pages would come back blank and the listing would break silently. Once
> you are approved, it is worth keeping a copy of that row somewhere safe.

---

## Section 2: Deploy the add-on code to Google Apps Script

Production CRM is live now, so the add-on can safely be pointed at it.

### 2.1 Push the code

```powershell
cd "d:\Junkies Coder\whatsapp-crm-nextjs\sheets-addon"
npx clasp login     # only if you are not already logged in
npm run push        # runs: clasp push
```

If `clasp push` asks about overwriting the manifest, say yes — your local
`appsscript.json` is the correct one.

### 2.2 Sanity-check the push landed

```powershell
npm run open        # opens the Apps Script editor in your browser
```

In the editor, open `Config.js` and confirm with your own eyes:

- `const REPLAI_DEV = false;`
- `VERSION: '1.0.0'`

`appsscript.json` should list **both** hosts in `urlFetchWhitelist`. That
is correct and intended — 2.6 explains why.

Then open any spreadsheet with the add-on and look at the sidebar footer.
It must read **`Add-on v1.0.0`** with no `· dev` after it. That marker is
the fastest honest answer to "which CRM is this talking to", and it is
worth more than reading the flag, because it reflects the code the
spreadsheet is actually running.

⚠️ If `REPLAI_DEV` is `true`, or the footer shows `· dev`, stop. Do not
create a version. A published add-on pointing at the dev tunnel dies for
every user the moment that tunnel closes.

### 2.3 Create an immutable version

```powershell
npm run version -- "v1.0.0 - First public release"
```

or equivalently:

```powershell
npx clasp create-version "v1.0.0 - First public release"
```

The command prints something like `Created version 7.` **Write that number
down.** That integer is what the Marketplace serves, and you need it in
Section 3.

> Note on naming: `clasp version` is an alias of `clasp create-version` in
> clasp 3.x, which is what this repo pins. Both work.

### 2.4 The step people skip

⚠️ **A `clasp push` on its own changes nothing for users.** Pushing updates
the code you see in the editor. The Marketplace serves a **pinned version
number**. Until you create a new version _and_ update the number in the
Marketplace SDK, every installed copy keeps running the old code.

Remember it as three separate things:

1. `clasp push` — updates the editor.
2. `clasp create-version` — freezes a numbered snapshot.
3. Marketplace SDK → script version — decides which snapshot users get.

### 2.5 About "Manage deployments"

You will read advice saying to go to **Deploy → Manage deployments** and
copy a **Deployment ID**. That applies to _Google Workspace add-ons_.

**Ours is an Editor add-on** — it hangs off the Extensions menu in Sheets
via `createAddonMenu()` and uses the `spreadsheets.currentonly` scope. Per
[Google's publishing overview](https://developers.google.com/workspace/add-ons/how-tos/publish-add-on-overview),
Editor add-ons are configured with the **version number**, and only
Workspace add-ons use a deployment ID.

So: you need the number from step 2.3. You do not need to touch Manage
deployments at all.

### 2.6 Switching between dev and production, after you publish

You keep both. `appsscript.json` allowlists both hosts:

```json
"urlFetchWhitelist": [
  "https://wacrm.junkiescoder.com/",
  "https://devcrm.junkiescoder.com/"
]
```

**The allowlist is a permission to fetch, not a choice of target.** Listing
both hosts does not make the add-on call dev; `REPLAI_DEV` in `Config.js`
decides that, on its own. Keeping both listed is what makes switching a
one-line edit instead of a manifest change, and it removes a whole class of
mistake: a version can never ship with an allowlist that forgot the host it
is actually pointed at.

To work against your Cloudflare-tunnelled dev CRM:

```powershell
cd "d:\Junkies Coder\whatsapp-crm-nextjs\sheets-addon"
# src/Config.js → const REPLAI_DEV = true;
npm run push
```

And back to production:

```powershell
# src/Config.js → const REPLAI_DEV = false;
npm run push
```

The sidebar footer tells you where you landed: `Add-on v1.0.0 · dev` on
dev, `Add-on v1.0.0` on production. The API key dialog also shows the host
it will send you to, so there are two independent ways to check.

**This is safe to do at any time, including after you are published.** A
version is an immutable snapshot. `clasp push` only changes the code in the
editor, so pushing a dev build cannot reach anyone running the published
version — they stay pinned to the version number in the Marketplace SDK
until you deliberately change it.

⚠️ The one real risk is creating a version while the flag is `true`. That
is why 2.2 has you check the footer before 2.3, and why the checklist in
Section 8 repeats it. Treat "footer shows no `· dev`" as the gate on every
release, not just this one.

> **If review asks about the second host**, the honest answer is short:
> `devcrm.junkiescoder.com` is our staging deployment of the same CRM, on
> the same domain we own. Both entries are ours, and the published build
> only calls production. This is ordinary and not a rejection reason.

### 2.7 Reading errors in the sidebar

Two things that look like problems and are not:

**`Sending · <timestamp>` in the status column is a success.** The add-on
writes it when the CRM has accepted the send. It deliberately stops short
of claiming delivery, because the hand-off to Meta happens after the
response comes back — the Inbox is where delivery is confirmed. A failure
reads `Failed` with a reason.

**Your test spreadsheet always runs the newest pushed code.** As the
developer you are on HEAD, not on a version, so `clasp push` is enough to
test. Versions and the Marketplace script version only decide what
_installed users_ run. This means a missing deployment version can cause
stale behaviour for other people — never an HTTP error for you.

And one that is a real problem, with a specific cause:

**`Request failed with HTTP 502.`** That wording is the add-on's fallback
for a response body that is not the CRM's JSON envelope. Every genuine CRM
error carries `{"error":{"code","message"}}` and renders a specific
sentence instead. So a bare `HTTP 502` means the reply came from **nginx on
the production box, not from the app** — nginx could not get a valid
response from the Next.js container.

The ordinary cause is timing: `docker compose up -d` restarts the
container while nginx stays up, so anything sent during that window gets a 502. Press **Try again** in the sidebar.

If it persists, it is server-side and nothing in the add-on will fix it.
On the server:

```bash
cd /opt/wacrm
docker compose ps            # is wacrm up, or restart-looping?
docker compose logs --tail=100 wacrm
curl -s localhost:3000/api/health
sudo tail -50 /var/log/nginx/error.log
```

`curl` against `localhost:3000` succeeding while the public URL 502s
narrows it to nginx. Both failing means the container.

---

## Section 3: Google Workspace Marketplace SDK

### 3.1 Getting there

1. Open the [Google Cloud console](https://console.cloud.google.com/).
2. Switch the project picker to **`replai-sheets-add-on`** (project number
   `1050125319240`).
3. **APIs & Services → Enabled APIs & services**.
4. Click **Google Workspace Marketplace SDK**.
5. You will see three tabs: **App Configuration**, **Store Listing**, and
   **Public Listing / Publish status**.

⚠️ If the SDK is not in the list, enable it first from **Library**. Also
confirm you are in the _standard_ Cloud project linked to the script, not
the auto-created default one. The default project cannot publish.

### 3.2 App Configuration tab

| Field                           | Value                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| App visibility                  | **Public**                                                  |
| Trader status                   | **Trader** — see the warning below                          |
| Installation settings           | Individual + Admin install (leave both on)                  |
| App integration                 | tick **Editor Add-on**, then tick **Sheets**                |
| Sheets Add-on Project Script ID | `1R_NlhhETTuRA4DcGLpnDstmN8NxGeGZdPJrXQypvGgqsd-gQlkqP6U4x` |
| Sheets Add-on Script version    | the integer from step 2.3 (e.g. `7`)                        |
| OAuth scopes                    | the five listed in Section 5                                |
| Developer links                 | see the table in 3.4                                        |

⚠️ **The script version field takes a plain integer.** Type `7`, not
`1.0.0` and not `v1.0.0`. The `1.0.0` in `Config.js` is only a label shown
in the sidebar footer so you can tell which build a spreadsheet is running
— it has nothing to do with the Apps Script version number.

⚠️ **App visibility is permanent.** Public cannot later be changed to
private, or the reverse. Public is what you want here, but choose
deliberately.

⚠️ **Trader status is a legal declaration, not a preference.** It sits under
**Developer Information** on the same tab. Google added it for EEA consumer
protection law: a "trader" is anyone acting for purposes relating to their
trade, business or profession. Junkies Coder is a company distributing an
add-on that feeds a paid subscription product, which is trading. Declaring
**Non-trader** tells EEA consumers that consumer protection law does not
apply to them, and it sits badly next to a pricing field that reads "Free
of charge with paid features", a company developer name and a commercial
website. Set this to **Trader**, and give the business address and contact
details it then asks for. Google can restrict EEA distribution over an
inaccurate declaration, and the exposure outlives the review.

If saving throws _"Project Key is not associated with the current project
or the script version doesn't exist"_, it is almost always one of: wrong
Cloud project selected, the version was never created, or the Script ID was
pasted with a stray space. Clearing the Script ID field and retyping it
also shakes loose a known caching quirk on that page.

### 3.3 Store Listing tab — App details

**Application name** (≤ 50 characters):

```
Replai — WhatsApp Sender & Automation
```

⚠️ **This must match the OAuth consent screen app name character for
character.** Check **APIs & Services → OAuth consent screen** in the same
project before you save. A mismatch is one of the most routine rejections
there is. Also note the name may not contain "Google" or any Google product
name — ours does not, and describing the add-on as working _with_ Google
Sheets in the description is fine.

**Short description** (≤ 200 characters, this one is 198):

```
Send WhatsApp messages from Google Sheets. Build rules that fire when a row is added or edited, or on a daily schedule, and send through your approved WhatsApp Business templates via Replai.
```

**Detailed description** (≤ 16,000 characters) — paste the full block from
[§2 of the submission pack](./google-sheets-addon-marketplace-submission.md).
It is the long copy covering what you can automate, how a message is built,
what you see afterwards, what you need, and the data section.

**Category**: **Productivity**. (Business Tools is also defensible; pick one
and leave it. Productivity matches how people search for spreadsheet
tooling.)

**Pricing**: **Free of charge with paid features**.

⚠️ **Do not select plain "Free."** Sending requires an active Replai
subscription or trial — the API returns `subscription_inactive` otherwise.
Declaring the add-on free while gating its core action is a mismatch review
does catch.

### 3.4 Store Listing tab — Developer links

| Field                | Value                                                               | Required    |
| -------------------- | ------------------------------------------------------------------- | ----------- |
| Terms of Service URL | `https://wacrm.junkiescoder.com/integrations/google-sheets/terms`   | **yes**     |
| Privacy Policy URL   | `https://wacrm.junkiescoder.com/integrations/google-sheets/privacy` | **yes**     |
| Support URL          | `https://wacrm.junkiescoder.com/contact`                            | **yes**     |
| Setup / Homepage URL | `https://wacrm.junkiescoder.com/integrations/google-sheets`         | recommended |
| Help URL             | `https://wacrm.junkiescoder.com/integrations/google-sheets`         | optional    |
| Report Issue URL     | `https://wacrm.junkiescoder.com/contact`                            | optional    |

Two things to get right here:

- **Support URL is required**, not optional. An earlier draft of our own
  notes had it as optional; Google's
  [create-listing page](https://developers.google.com/workspace/marketplace/create-listing)
  lists it as required.
- **Point the policy links at the add-on-specific pages**, not the
  company-wide `/legal/*` ones. Reviewers check that the policy names this
  add-on and accounts for the exact scopes it requests. A general company
  privacy policy that never mentions Google Sheets invites a follow-up
  question and another round of review.

Filling the Help URL also adds a **Learn more** entry to the add-on's own
Help menu inside Sheets, which is free polish.

---

## Section 4: Graphic assets

All PNG. All uploaded on the **Store Listing** tab.

| Asset            | Size                                              | Required  | Notes                                           |
| ---------------- | ------------------------------------------------- | --------- | ----------------------------------------------- |
| Application icon | **128×128**                                       | yes       | the main listing icon                           |
| Application icon | **32×32**                                         | yes       | used in smaller contexts such as menus          |
| Card banner      | **exactly 220×140**                               | yes       | the listing card and search results             |
| Screenshots      | **1280×800** (640×400 or 2560×1600 also accepted) | yes, 1–10 | at least one must show the add-on inside Sheets |

⚠️ **Screenshots must be full bleed: square corners, no padding, no
rounded window edges, no drop shadow, no desktop wallpaper visible.** The
easy mistake is grabbing a browser window screenshot on macOS, which comes
with rounded corners and a shadow. Crop tight to the Sheets content area.

⚠️ 220×140 for the banner is exact, not "about". A 221px-wide image is
rejected at upload.

### Suggested shot list

Use the add-on's own **Create template** button first, so the sample data
is clean and the phone numbers are the reserved fictional ones rather than
anyone's real number.

1. **Sidebar with a live rule** — the rules list showing an active rule, its
   sheet and campaign, alongside a few rows of the spreadsheet. _This is the
   one that satisfies "must show the Google integration", so make sure the
   Sheets grid and the Extensions area are both clearly visible._
2. **Rule builder, step 1** — target sheet, trigger type, and a condition
   row with the operator dropdown open on the date operators. One frame that
   shows how deep the product goes.
3. **Rule builder, step 2** — campaign selected, template variables mapped
   to columns.
4. **Starter template just created** — the generated `Replai Starter` sheet
   with its headers and sample rows, showing how quickly someone gets going.
5. **Status written back** — the sheet with the `Replai Status` column
   filled in: one row sent, one row skipped with its reason. This is the
   proof that it reports results, and it is the closest thing to "a message
   being sent" that works as a still image.

Five is a good number. If you want a sixth, the API key setup dialog makes
the one-time setup obvious to someone deciding whether to install.

---

## Section 5: OAuth scope justifications

The form asks, per scope, why the app needs it. Paste these one at a time.
Keep them factual — a justification that overclaims is worse than a short
one.

**`https://www.googleapis.com/auth/spreadsheets.currentonly`**

```
Read the rows and column headers that the user's own automation rule refers to, and write the delivery status back into that same sheet. This scope is deliberately narrower than the full spreadsheets scope: it grants access only to the single file the add-on is installed in, and no other file in the user's Drive.
```

**`https://www.googleapis.com/auth/script.external_request`**

```
Call the Replai API over HTTPS to send the WhatsApp Business template message the user configured. The add-on contacts only Replai's own hosts, which are the two entries in the manifest's urlFetchWhitelist: wacrm.junkiescoder.com, which the published add-on uses, and devcrm.junkiescoder.com, our staging deployment of the same CRM.
```

**`https://www.googleapis.com/auth/script.scriptapp`**

```
Install the on-edit, on-form-submit and daily time-based triggers that allow a user's rule to run when they are not present. Without this scope the add-on can only send while the sidebar is open, which defeats its purpose.
```

**`https://www.googleapis.com/auth/script.container.ui`**

```
Render the add-on's sidebar and the one-time API key setup dialog inside Google Sheets.
```

**`https://www.googleapis.com/auth/userinfo.email`**

```
Display which Google account a rule runs under, so that collaborators on a shared spreadsheet can see whose API key sends the messages and can take ownership of a rule if needed.
```

⚠️ **Before submitting, install the add-on once on a clean account and read
the consent screen Google actually shows you.** If it lists a permission
you cannot map back to one of these five, fix the manifest to match what
appears rather than guessing at an extra scope. Shipping a scope you cannot
explain is a rejection; so is a consent screen that asks for more than the
listing declares.

---

## Section 6: Reviewer test account

Google assigns a human reviewer who will install the add-on and try to use
it. If they cannot get past the API key screen, the review fails — not for
a policy reason, just because they could not exercise the app.

### What to prepare

- A **Replai account on an active trial** (not expired — sending is gated on
  it).
- A **connected WhatsApp Business number** on that account.
- **One approved template with two body variables.** Two is the sweet spot:
  enough to demonstrate variable mapping, not enough to be fiddly.
- **One API campaign** already created and bound to that template.
- **An API key scoped to `broadcasts:send` only.** Mint it fresh for the
  reviewer and revoke it once you are approved.
- **A spreadsheet with the starter sheet already in it**, rule already
  configured, add-on already installed, sample numbers left untouched.

### About the sample phone numbers

The starter sheet ships with numbers in the `+1 202 555 0100` range. These
are NANP numbers reserved for fictional use — they cannot connect to a real
person. Say so explicitly in the review notes, because a reviewer pressing
send on what looks like a real number will hesitate, and a hesitating
reviewer asks a question instead of approving.

⚠️ **Correction to an earlier draft of this guide:** the Marketplace SDK
Store Listing has **no reviewer-notes field**. There is nowhere to paste
the block below at submission time. What actually happens is that the
review team emails the **Developer Email** on the App Configuration tab if
they need access, and you can add their address under **Draft Testers** so
they get the draft build. So keep this text ready to send as a reply rather
than expecting a form field, and watch that mailbox — an unanswered access
request is a rejection with extra steps.

### Reviewer instructions, to send on request

```
Replai sends WhatsApp Business template messages on the user's behalf, triggered by their own Google Sheet.

TO TEST
1. Open the spreadsheet linked below. The add-on is already installed.
2. Extensions > Replai > Open Replai.
3. Paste the API key below when prompted. It is scoped so that it can only send broadcasts and cannot read or change anything else in the account.
4. The rule "Delivery reminder" is already configured. Press the eye icon to preview which rows match. This sends nothing.
5. To see a real send, edit the Status cell in row 2 so the rule matches it. The rule fires on that edit, and the "Replai Status" column in that row updates in place within a minute.
6. Extensions > Replai > Help & Support shows the support options, documentation links and a form for reporting a problem. Nothing there sends a message or charges anything. "Reset Everything" in that dialog clears the API key and rules for this spreadsheet only, and is behind a two-step confirm so a single click cannot trigger it.

The sample numbers in the sheet are NANP numbers reserved for fictional use (the 555-0100 range) and cannot reach a real person, so nothing you send during testing will be delivered to anyone.

WHY EACH PERMISSION IS NEEDED
- View and manage spreadsheets that this application is installed in: read the rows and headers the user's rule refers to, and write the delivery status back. Scoped to the installed file only.
- Connect to an external service: call the Replai API to send the message.
- Allow this application to run when you are not present: install the triggers that make a rule fire on an edit, a form submission, or on a recurring schedule the user sets.
- Display and run third-party web content in prompts and sidebars: render the sidebar and the setup dialog.
- View your email address: show which account a rule sends under, so collaborators on a shared sheet know whose key is used.

Spreadsheet: <URL>
API key: <KEY>
Test account: <EMAIL> / <PASSWORD>
```

Fill in the three placeholders at the bottom before pasting.

---

## Section 7: Demo video (optional)

**Google recommends it but does not require it.** It is a genuine tiebreaker
when a reviewer is unsure what your app does, and this add-on is the kind of
thing that is far clearer in motion than in stills. Worth 30 minutes.

If you make one:

- **60–90 seconds.** Screen capture with captions; narration is not needed.
- **Upload to YouTube as Unlisted**, then paste the link into the Promo
  Videos field on the Store Listing tab.
- **Show the OAuth consent screen**, and leave the browser address bar
  visible while it is on screen so the client ID is readable. Reviewers
  specifically look for this — it proves the consent flow you described is
  the one users actually get.

Suggested beats:

| Time      | Shot                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| 0:00–0:10 | A sheet of orders. Caption: "A spreadsheet of orders."                                  |
| 0:10–0:20 | Extensions → Replai → Open Replai, **consent screen with the URL bar visible**.         |
| 0:20–0:30 | Paste the API key. Caption: "Connect once."                                             |
| 0:30–0:55 | Build a rule: sheet, On change, `Status equals Shipped`, campaign, map two variables.   |
| 0:55–1:10 | Back in the sheet, change a Status cell to `Shipped`. The status column fills in.       |
| 1:10–1:20 | The message arriving on a phone next to the Replai Inbox showing the same conversation. |
| 1:20–1:30 | The date conditions in the wizard. Caption: "Or run daily, for renewals and birthdays." |

---

## Section 8: Pre-submission checklist

Do not click **Submit for review** until every line is true.

**Production**

- [ ] `https://wacrm.junkiescoder.com/integrations/google-sheets` returns 200
- [ ] `https://wacrm.junkiescoder.com/integrations/google-sheets/privacy` returns 200
- [ ] `https://wacrm.junkiescoder.com/integrations/google-sheets/terms` returns 200
- [ ] `https://wacrm.junkiescoder.com/privacy` reaches `/legal/privacy-policy` (200 after redirect)
- [ ] `https://wacrm.junkiescoder.com/terms` reaches `/legal/terms-of-service` (200 after redirect)
- [ ] `https://wacrm.junkiescoder.com/contact` returns 200 (this is your Support URL)
- [ ] The privacy page shows real content, not "No privacy policy content configured yet"
- [ ] The exact sentence beginning "Replai's use and transfer to any other app of information received from Google APIs" and containing **Limited Use** is visible on the add-on privacy page

**Add-on code**

- [ ] `REPLAI_DEV = false` in `sheets-addon/src/Config.js`
- [ ] Sidebar footer reads `Add-on v1.0.0` with **no `· dev`** marker
- [ ] `urlFetchWhitelist` lists both Replai hosts (this is correct, not a defect)
- [ ] `VERSION` in `Config.js` reads `1.0.0`
- [ ] `clasp push` done, and the Apps Script editor shows the above
- [ ] A new immutable version created **after** the footer check, and its
      **number written down**

**Marketplace SDK — App Configuration**

- [ ] App visibility set to **Public**
- [ ] Trader status set to **Trader**, not Non-trader
- [ ] Editor Add-on → **Sheets** ticked
- [ ] Sheets Add-on Project Script ID pasted with no trailing space
- [ ] Sheets Add-on Script version set to the **integer** from the version step
- [ ] All five OAuth scopes listed, and they match the manifest exactly

**Marketplace SDK — Store Listing**

- [ ] App name is ≤ 50 characters and **matches the OAuth consent screen exactly**
- [ ] Short description ≤ 200 characters
- [ ] Detailed description pasted
- [ ] Category selected
- [ ] Pricing set to **Free of charge with paid features**, not Free
- [ ] Terms, Privacy and **Support** URLs filled, all three verified 200
- [ ] Icons uploaded at both **128×128 and 32×32**
- [ ] Card banner uploaded at **exactly 220×140**
- [ ] At least one screenshot, full bleed, square corners, no padding
- [ ] At least one screenshot clearly shows the add-on running inside Google Sheets
- [ ] Regions left as **All Regions** unless you have a reason otherwise

**Review readiness**

- [ ] Reviewer test account on an active trial
- [ ] API key minted, scoped to `broadcasts:send` only
- [ ] One approved template with two body variables, bound to an API campaign
- [ ] Shared spreadsheet prepared with the starter sheet and a configured rule
- [ ] Review notes pasted, with spreadsheet URL, API key and credentials filled in
- [ ] Consent screen checked once on a clean account, and it asks for nothing beyond the five declared scopes

Then **Submit for review**.

### After you submit

Status shows at the top of the Store Listing page — `Unpublished`, `Under
review`, `Approved` — and an email goes to the developer address on the
listing. Public listings go through human review; private ones publish
instantly, which is what let us test with real triggers before this point.

Once approved, install on a completely clean Google account and confirm the
triggers arm and fire. That is the one thing a test deployment cannot prove,
and it is the difference between "published" and "working".

### If you are rejected

It is normal, and it is usually one line in an email. The likely causes, in
rough order of frequency: a policy URL that 404s, an app name that does not
match the consent screen, screenshots with padding or rounded corners, a
scope with no convincing justification, or a reviewer who could not get the
app to run. Every one of those has a checkbox above. Fix, and resubmit —
resubmission does not start you at the back of any queue.
