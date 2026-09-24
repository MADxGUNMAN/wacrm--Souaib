# Google-side setup guide — Replai for Google Sheets

Everything that has to be done by hand in Google's consoles, in order,
from verifying the domain through to pressing **Submit for review**.

Written to be followed without reading the implementation plan. Where a
step is easy to get wrong in a way that is expensive to undo, it says so.

**Who does what**

| Part                                              | Owner                            |
| ------------------------------------------------- | -------------------------------- |
| Steps 1–6 (domain, Cloud project, consent screen) | you, once, before any code ships |
| Steps 7–8 (Apps Script, clasp)                    | developer                        |
| Steps 9–12 (listing, assets, video, submit)       | you, with assets from design     |

Keep a scratch note as you go. Several steps produce an id you need
later: the **Cloud project number**, the **OAuth client ID**, the
**Apps Script script ID**, and the **deployment version**.

---

## Before you start

You need a **Google Workspace account on `junkiescoder.com`** — for
example `souaib@junkiescoder.com`. Not a personal `@gmail.com`.

Two reasons, both hard blockers rather than preferences:

- The Marketplace listing displays the publisher, and Google checks that
  the publisher controls the domain in the listing links.
- Domain verification (step 1) has to be done by an account on that
  domain.

If `junkiescoder.com` mail runs on Google Workspace, you already have
this. If it runs on something else, you can still verify domain
ownership via DNS with a regular account, but the publisher name will
look worse and some review steps get more awkward. Prefer Workspace.

> **Do every step below signed in as that one account.** The single most
> common way this process goes wrong is creating the Cloud project as
> one account and the Apps Script project as another. They then cannot
> be linked, and the fix is to start over.

---

## Step 1 — Verify the domain in Search Console

This proves you own `junkiescoder.com`. Nothing else can proceed without
it, and it can take up to 24 hours for DNS to propagate, so do it first.

1. Go to <https://search.google.com/search-console>.
2. Sign in as your `@junkiescoder.com` account.
3. **Add property** → choose **Domain** (the left option, not "URL
   prefix").
4. Enter `junkiescoder.com` — no `https://`, no `www`.
5. Google shows a **TXT record**. Copy it.
6. In your DNS host (Cloudflare, judging by the tunnel setup), add:
   - Type: `TXT`
   - Name: `@` (or `junkiescoder.com`)
   - Content: the value Google gave you
   - TTL: automatic
   - **Proxy: off / DNS only** — proxying does not apply to TXT records,
     but if your host offers the toggle, leave it off.
7. Back in Search Console, press **Verify**.

If it fails, wait 15 minutes and retry. Cloudflare usually propagates in
under a minute; some registrars take hours.

**Why the Domain option and not URL prefix:** domain verification covers
every subdomain, so `wacrm.junkiescoder.com` and any future
`replai.junkiescoder.com` are all covered by this one record. URL-prefix
verification would need repeating per subdomain.

✅ **Done when:** Search Console shows `junkiescoder.com` as a verified
property.

---

## Step 2 — Create the Google Cloud project

The add-on needs a **standard** Cloud project. Apps Script creates a
hidden default project automatically, and that one **cannot** be used
for a Marketplace listing — this is the single most common wasted day in
this whole process.

1. Go to <https://console.cloud.google.com/projectcreate>.
2. **Project name:** `Replai Sheets Add-on`
3. **Project ID:** `replai-sheets-addon` (must be globally unique; if
   taken, append a number — write down whatever you end up with).
4. **Location / Organisation:** if your Workspace has an organisation,
   pick it. Otherwise "No organisation" is fine.
5. **Create**, then wait for it and make sure it is the selected project
   in the top bar.
6. Note the **project number** (Dashboard → Project info).

### Add a second owner immediately

Do not skip this.

1. **IAM & Admin → IAM → Grant access**.
2. Add a second trusted `@junkiescoder.com` account as **Owner**.

A published Marketplace listing is bound to its Cloud project
permanently. If the only owner's Google account is ever closed or loses
access, the listing and every install of it are unrecoverable — there is
no support path to move a listing between projects.

✅ **Done when:** the project exists and has two owners.

---

## Step 3 — Enable the required APIs

With `Replai Sheets Add-on` selected:

1. **APIs & Services → Library**.
2. Search **Google Workspace Marketplace SDK** → **Enable**.
3. Search **Apps Script API** → **Enable**.
4. Search **Google Sheets API** → **Enable**.

Only three. Do not enable anything else — reviewers look at enabled APIs
and an unexplained one invites questions.

✅ **Done when:** all three show **API enabled**.

---

## Step 4 — Publish the public pages

Google's reviewers open these. They must be live, reachable without
login, and specific to this add-on. A generic company page is a common
rejection.

Three URLs are needed. Suggested paths on the existing site:

| Page             | Suggested URL                                               |
| ---------------- | ----------------------------------------------------------- |
| Add-on homepage  | `https://wacrm.junkiescoder.com/integrations/google-sheets` |
| Privacy policy   | `https://wacrm.junkiescoder.com/privacy`                    |
| Terms of service | `https://wacrm.junkiescoder.com/terms`                      |

### What the homepage must say

- What the add-on does, in plain language.
- **That it requires a Replai account** — hiding an account requirement
  is an explicit rejection reason.
- That it requires a Meta-approved WhatsApp template.
- A link to install it (fill in once you have the listing URL).

### What the privacy policy must cover

Reviewers check specifically that the policy addresses the scopes you
request. It must state:

- **What is read from the spreadsheet:** the sheet's column headers, and
  the cell values in rows matched by a rule — phone numbers, names, and
  any values mapped to template variables.
- **Where it goes:** transmitted to Replai's servers
  (`wacrm.junkiescoder.com`) over HTTPS, solely to deliver the WhatsApp
  message the user configured.
- **What is stored, and for how long:** the contact and the message are
  stored in the user's own Replai account; the automation rules are
  stored in the spreadsheet itself via Google's Properties Service.
- **What is not done:** the data is not sold, not used for advertising,
  and not used to train models.
- **Deletion:** how a user removes their data — uninstall the add-on to
  drop the rules, delete the Replai account to drop the messages.
- A contact address for privacy requests.

✅ **Done when:** all three URLs load in a private browsing window.

---

## Step 5 — Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

1. **User type: External.** ("Internal" would restrict the add-on to
   your own Workspace only.)
2. **App information**
   - App name: `Replai — WhatsApp Sender & Automation`
     — this exact string appears on the consent screen users see, so it
     must match the Marketplace listing name.
   - User support email: a monitored `@junkiescoder.com` address.
   - App logo: **120×120 PNG**, under 1 MB. Must not contain the word
     "Google" or imply Google endorsement.
3. **App domain**
   - Application home page: the homepage from step 4.
   - Privacy policy link: from step 4.
   - Terms of service link: from step 4.
4. **Authorized domains:** add `junkiescoder.com`.
   This only accepts domains verified in step 1 — if it rejects the
   entry, step 1 did not complete.
5. **Developer contact information:** your email.
6. **Scopes → Add or remove scopes.** Add exactly:

   ```
   https://www.googleapis.com/auth/spreadsheets.currentonly
   https://www.googleapis.com/auth/script.external_request
   https://www.googleapis.com/auth/script.scriptapp
   https://www.googleapis.com/auth/script.container.ui
   https://www.googleapis.com/auth/userinfo.email
   ```

   Some are not in the picker list — use **Manually add scopes**, paste
   them, then **Add to table**.

7. Save through to the summary.

### Do not widen the Sheets scope

`spreadsheets.currentonly` grants access only to the one file the add-on
is installed in. The broader `spreadsheets` scope grants access to
**every** spreadsheet in the user's Drive, and it is classed
**restricted** rather than merely sensitive — which pulls in a
third-party **CASA security assessment**, typically thousands of dollars
and several extra weeks.

`spreadsheets.currentonly` is _sensitive_: it needs OAuth verification
(step 12), but **no CASA assessment**. Keeping this scope narrow is the
single biggest cost and time saving available in this project.

### Publishing status

Leave it as **Testing** for now and add yourself under **Test users**.
Switch to **In production** at step 12, when you submit. In Testing
mode, only listed test users can authorise the add-on.

✅ **Done when:** the consent screen summary lists five scopes, three
URLs and the authorized domain.

---

## Step 6 — Note the OAuth client

Apps Script creates its own OAuth client when you link the project, so
you usually do not create one by hand.

Check **APIs & Services → Credentials** after step 7 and note the
**OAuth 2.0 Client ID**. You need it for the demo video (step 11).

---

## Step 7 — Link Apps Script to the Cloud project

Developer task, but it needs the project number from step 2.

1. Open the Apps Script project for the add-on.
2. **Project Settings** (gear icon).
3. Under **Google Cloud Platform (GCP) Project**, press **Change
   project**.
4. Paste the **project number** from step 2 → **Set project**.
5. Note the **Script ID** on the same page — needed at step 10.

✅ **Done when:** Project Settings shows `replai-sheets-addon` rather
than a default auto-generated project.

---

## Step 8 — Deploy a test version

Before anything is published, prove the add-on works when installed.

1. In the Apps Script editor: **Deploy → Test deployments**.
2. **Install** it, choose a test spreadsheet, and run through:
   - the API key dialog accepts a real Replai key,
   - a rule can be created,
   - a row triggers a real WhatsApp message.
3. When it works: **Deploy → New deployment → Add-on**.
4. Note the **version number** (`1`, `2`, …) — step 10 pins to it.

Every future update needs a new version _and_ a listing update pointing
at it. Publishing new code alone does not change what users have.

✅ **Done when:** a real message has been sent from a real sheet.

---

## Step 9 — Prepare the listing assets

Get these ready before opening the listing form; it is tedious to fill
in twice.

| Asset                 | Exact size                   | Notes                                    |
| --------------------- | ---------------------------- | ---------------------------------------- |
| App icon              | **128×128** PNG              | flat, no rounded corners, no drop shadow |
| Card banner           | **220×140** PNG              | shown in search results                  |
| Screenshots           | **1280×800** or **1440×900** | at least 1, ideally 4–5                  |
| Logo (consent screen) | 120×120 PNG                  | already uploaded at step 5               |

### Screenshots that pass review

Reviewers reject screenshots that are just an empty sidebar. Copy the
pattern the reference product uses: annotated captions on a coloured
band above a real screenshot. Suggested set:

1. _"Connect your Replai account"_ — the API key dialog over a sheet.
2. _"Send on new rows, cell changes, or a schedule"_ — the trigger step.
3. _"Map your columns to template variables"_ — the configuration step.
4. _"Delivery status written back to your sheet"_ — the status column.

Use realistic but **fake** data. Real customer phone numbers in a public
listing screenshot is a data-protection problem of your own making.

### Text

- **Application name:** `Replai — WhatsApp Sender & Automation`
  Front-load the distinctive word. Marketplace truncates long names: the
  reference listing renders as `WhatsApp Sender & ...`, losing the brand
  entirely. Putting "Replai" first means the truncated form still
  identifies you. Must match the consent screen name from step 5.
- **Short description:** one line, under ~80 characters.
- **Detailed description:** what it does, the three trigger types, and
  plainly that a Replai account plus an approved WhatsApp template are
  required.
- **Category:** Productivity.
- Write `WhatsApp™` with the trademark symbol, describe integration only,
  and never imply Meta endorsement. Meta's brand guidelines apply on top
  of Google's review.

---

## Step 10 — Configure the Marketplace SDK

**APIs & Services → Google Workspace Marketplace SDK → App
configuration.**

1. **App visibility:** Public.
   (Choose "Private" to your domain if you want a closed beta first —
   this can be changed later.)
2. **Installation settings:** allow both individual and admin install.
3. **App integration:** tick **Sheets add-on**, then supply:
   - **Script ID** from step 7
   - **Deployment version** from step 8
4. **OAuth scopes:** the same five from step 5.
   They must match the manifest **character for character**. A mismatch
   is an automatic rejection and the error message does not say which
   scope differs.
5. **Developer links:** homepage, ToS, privacy, support — from step 4.
6. Save.

Then **Store listing**: paste the text and upload the assets from step 9.

✅ **Done when:** both tabs save without validation errors.

---

## Step 11 — Record the demo video

Required for OAuth verification. Unlisted YouTube is fine; it does not
need production polish, but it does need three specific things on
screen or it gets bounced back.

Must show:

1. **The OAuth consent screen**, with your app name visible on it.
2. **The OAuth client ID** visible — easiest is to show the browser
   address bar during consent, which contains `client_id=…`.
3. **Each requested scope actually being used**, narrated:
   - _"the add-on reads the phone number column from this sheet"_ →
     `spreadsheets.currentonly`
   - _"it calls the Replai API to send"_ → `script.external_request`
   - _"it installs a recurring trigger for reminders"_ → `script.scriptapp`
   - _"this is the sidebar it renders"_ → `script.container.ui`
   - _"it shows which account the rule runs as"_ → `userinfo.email`

Two to four minutes. Screen recording with voice-over, no editing needed.

---

## Step 12 — Submit

1. **OAuth consent screen → Publishing status → Publish app** (switch
   from Testing to In production).
2. **Prepare for verification** — fill the form, paste the video URL,
   and justify each scope in one sentence (the sentences in step 11 are
   your justifications).
3. **Marketplace SDK → Store listing → Publish / Submit for review.**

### Reviewer test credentials

Review will fail if the reviewer cannot use the add-on. Prepare and
include in the review notes:

- a demo Replai account with an active subscription,
- an **approved** WhatsApp template on it,
- a pre-made API campaign,
- an API key for that account,
- a shared sample spreadsheet with the right columns,
- three lines on how to install and fire a rule.

### What happens next

Two independent gates run, and they can come back at different times:

- **OAuth verification** (Trust & Safety) — days to a few weeks for
  sensitive scopes. Expect at least one round of questions about scope
  justification.
- **Marketplace app review** — checks the listing, functionality and
  policy compliance.

Until OAuth verification passes, the app shows an **"unverified app"**
warning and is capped at **100 users**. That cap is perfectly workable
for a paid private beta, so do not hold the feature back waiting for the
badge.

**Do not announce a launch date until the first approval lands.**
Timelines here are not predictable.

---

## Common rejection reasons

Collected so they can be avoided rather than discovered.

| Reason                               | Prevention                                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| Scopes broader than the app needs    | Keep `spreadsheets.currentonly`; never `spreadsheets`        |
| Manifest scopes ≠ SDK scopes         | Copy-paste the same five into both (steps 5 and 10)          |
| Generic privacy policy               | Write one that names the sheet data and this add-on (step 4) |
| Account requirement not disclosed    | State it in the homepage and the detailed description        |
| Reviewer cannot log in               | Supply working test credentials (step 12)                    |
| Video missing client ID or a scope   | Re-record following step 11 exactly                          |
| Default Apps Script Cloud project    | Create a standard project (step 2)                           |
| Empty or placeholder screenshots     | Annotated screenshots with realistic fake data (step 9)      |
| App name implying Google endorsement | Do not put "Google" in the app name                          |

---

## Quick reference — things to write down

Fill these in as you go; later steps and the developer both need them.

```
Publisher account:        ____________________@junkiescoder.com
Cloud project ID:         ____________________
Cloud project number:     ____________________
OAuth client ID:          ____________________
Apps Script script ID:    ____________________
Add-on deployment version:____________________
Marketplace listing URL:  ____________________
Demo video URL:           ____________________
```
