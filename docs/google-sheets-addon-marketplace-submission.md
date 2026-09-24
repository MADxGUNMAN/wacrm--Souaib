# Marketplace submission pack — Replai Sheets add-on

Everything needed to take the add-on from **unlisted** to **public**, in
the order it has to happen. Phase 8 of
[`google-sheets-addon-plan.md`](./google-sheets-addon-plan.md).

Requirements below are taken from Google's
[Create a store listing](https://developers.google.com/workspace/marketplace/create-listing)
page. Where an earlier draft of our own setup guide disagreed with it,
Google's page wins — three of its requirements were missing from ours and
are flagged **[was missing]**.

---

## 1. Pre-flight, in the code

None of this is visible in the listing, and all of it breaks the add-on
for real users if skipped. **All three code items are done for 1.0.0** —
they are kept here as the checklist to re-run on every later version,
because a local debugging session is the usual way they regress.

- [x] `REPLAI_DEV = false` in `sheets-addon/src/Config.js`. Left `true`,
      every installed copy calls a laptop tunnel and dies the moment it
      closes. Confirm from the sidebar footer: a dev build reads
      `Add-on v1.0.0 · dev`, a production build shows the version alone.
- [x] `HOMEPAGE_ENABLED = true` in `Config.js`, once
      `/integrations/google-sheets` is live — that flag is the only thing
      hiding the "About this add-on" link in the setup dialog.
- [x] Bump `VERSION` in `Config.js` (now `1.0.0`). It shows in the sidebar
      footer and is the only way to tell which build a spreadsheet is
      running.
- [ ] `npm run push`, then `npm run version -- "v1.0.0 - First public
release"`, and **write down the integer it prints**.
- [ ] Marketplace SDK → **App Configuration → Sheets Add-on Script
      version** → set to that integer. **A push alone changes nothing**
      for installed users: the listing serves a pinned version.

Three corrections to earlier drafts of this section:

- This is an **Editor add-on**, so the SDK takes a **version number**, not
  a deployment ID —
  [Google's publishing overview](https://developers.google.com/workspace/add-ons/how-tos/publish-add-on-overview)
  splits the two by add-on type. **Deploy → Manage deployments** is not
  part of our flow.
- The SDK field wants a bare integer (`7`), not `1.0.0`. `VERSION` in
  `Config.js` is only a display label for the sidebar footer.
- **The dev host stays in `urlFetchWhitelist`.** An earlier draft called
  removing it a release blocker; it is not. Both entries are hosts we own
  on one domain, the allowlist is only a permission to fetch rather than a
  choice of target, and keeping both means no version can ship with an
  allowlist that forgot the host it is pointed at. If review asks, the
  answer is that `devcrm` is our staging deployment of the same CRM. The
  flag, not the allowlist, is what must be right at release.

Verify by opening a sheet and checking the footer shows the version you
just built.

Step-by-step operator instructions for everything downstream of here —
deploying production, the SDK forms, assets, reviewer setup — are in
[`google-sheets-addon-go-live-guide.md`](./google-sheets-addon-go-live-guide.md).

---

## 2. App details

| Field                | Value                                   |
| -------------------- | --------------------------------------- |
| Application name     | `Replai — WhatsApp Sender & Automation` |
| Short description    | see below (200 char limit)              |
| Detailed description | see below (16,000 char limit)           |
| Category             | Productivity                            |
| Pricing              | **Free of charge with paid features**   |

Three constraints worth knowing:

- The name **must match the OAuth consent screen** app name exactly.
  Check Cloud Console → OAuth consent screen before submitting; a
  mismatch is a straightforward rejection.
- The name must not contain "Google" or a Google product name. Ours does
  not. Describing the app as working _with_ Google Sheets in the
  description is fine and expected.
- **Pricing is not "Free"** — the add-on requires a Replai subscription
  or trial to send (the send endpoint returns `subscription_inactive`
  otherwise). Declaring "Free of charge" while gating the core action is
  the kind of mismatch review does catch.

### Short description (198 characters)

```
Send WhatsApp messages from Google Sheets. Build rules that fire when a row is added or edited, or on a daily schedule, and send through your approved WhatsApp Business templates via Replai.
```

### Detailed description

```
Replai turns a Google Sheet into a WhatsApp sending engine.

Build a rule in the sidebar, choose which sheet to watch and when it should run, and Replai sends a WhatsApp message through one of your approved WhatsApp Business templates whenever a row matches.

WHAT YOU CAN AUTOMATE

• New row added — send when a row is added, including rows added by a linked Google Form.
• On change — send when someone edits a row and it matches your conditions. Each row sends once.
• Time-based reminder — checked on a schedule you choose (daily, weekly or monthly, at an hour you pick), for birthdays, renewals, delivery dates and monthly due dates.

Nineteen condition types are available, including date-aware ones: on a date, a number of days before or after it, the same day and month each year, or the same day of each month.

HOW A MESSAGE IS BUILT

Map each placeholder in your template to a column in your sheet, or to one fixed value. Add an image, document or video from a column or a single URL. Set a country code once for numbers stored without one.

WHAT YOU SEE AFTERWARDS

Replai writes a status back into your sheet, per row: sent, skipped, or failed with the reason. A rule can be previewed before it sends anything, and a single row can be sent on demand to check a setup end to end.

WHAT YOU NEED

• A Replai account on an active subscription or trial.
• A connected WhatsApp Business number.
• At least one WhatsApp template approved by Meta.
• An API key from Replai, pasted into the add-on once.

ABOUT YOUR DATA

The add-on reads only the spreadsheet you install it in. It reads the rows and column headers your rule refers to, and writes back a status column. Nothing else in your Drive is accessed.

Your Replai API key is stored against your own Google account, not in the shared spreadsheet, so collaborators cannot see or use it.

Row data is sent to Replai over HTTPS solely to deliver the message you configured. It is not sold, and it is not used to train anything.

Full detail: https://wacrm.junkiescoder.com/integrations/google-sheets/privacy
```

---

## 3. Graphic assets

| Asset                   | Requirement                                                         | Notes                                                          |
| ----------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Application icon        | **32×32 and 128×128** PNG, both required                            | **[was missing]** our guide asked only for 128×128             |
| Application card banner | **220×140** PNG, exact                                              | Shown in listings and search results                           |
| Screenshots             | 1–10, recommended **1280×800** (640×400 or 2560×1600 also accepted) | At least one must show the add-on working inside Google Sheets |

Screenshots must have **square corners and no padding — full bleed**.
**[was missing]** A browser screenshot with rounded window corners, a
drop shadow, or desktop background around the edges fails this.

### Shot list

Crop each to the Sheets window only, no browser chrome, no desktop.

1. **The sidebar with a rule** — the rules list showing an active rule,
   its sheet and campaign, next to a few rows of the sheet. This is the
   one that must show the Sheets integration.
2. **The rule wizard, step 1** — target sheet, trigger type, and a
   condition row with the operator dropdown open on the date operators.
   Shows the depth of the product in one frame.
3. **The rule wizard, step 2** — campaign chosen and template variables
   mapped to columns.
4. **The status column** — the sheet with `Replai Status` filled in,
   showing a sent row and a skipped row with its reason. Proves it
   reports back.
5. **The setup dialog** — API key screen. Optional, but it makes the
   one-time setup obvious to someone deciding whether to install.

Use the starter sheet (**Create template** in the sidebar) for these, so
the sample data is clean and the phone numbers are the reserved test
numbers rather than anyone's real one.

---

## 4. Support links

| Field            | URL                                                                 | Required                                                         |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Terms of service | `https://wacrm.junkiescoder.com/integrations/google-sheets/terms`   | yes                                                              |
| Privacy policy   | `https://wacrm.junkiescoder.com/integrations/google-sheets/privacy` | yes                                                              |
| Support          | `https://wacrm.junkiescoder.com/contact`                            | **yes — [was missing]**                                          |
| Setup            | `https://wacrm.junkiescoder.com/integrations/google-sheets`         | optional, worth filling                                          |
| Help             | `https://wacrm.junkiescoder.com/integrations/google-sheets`         | optional; adds a **Learn more** button to the add-on's Help menu |
| Report issue     | `https://wacrm.junkiescoder.com/contact`                            | optional; adds **Report an issue** to the Help menu              |

### These are Google's links, not the add-on's own Help dialog

Do not confuse the two, because they are edited in different places and
only one of them lands anywhere you will see:

- The **Report issue** field above puts a _Google-rendered_ "Report an
  issue" entry in Sheets' own Help menu. It opens whatever URL is typed
  here, in a browser tab.
- Since **1.2.0** the add-on also has its own **Help & Support** dialog
  under `Extensions → Replai`, whose Report Issue form posts to
  `/api/public/sheets-addon/report` and lands in **Super Admin → Sheet
  Add-on → Issue Reports**. Its copy and links are edited in **Super Admin
  → Sheet Add-on → Help Content**, not here.

Fill the Marketplace field anyway — it is free and a reviewer may check
it — but the in-dialog form is the one that reaches your inbox.

Point the policy links at the **add-on-specific** pages, not the
company-wide `/legal/*` ones. Reviewers check that the policy names this
add-on and accounts for the scopes it requests; a general company privacy
policy that never mentions Google Sheets invites a follow-up question.

Verify all three required URLs return 200 before submitting. Broken policy
links are among the most common rejections, and the earlier draft of this
listing pointed at `/privacy` and `/terms`, which did not exist.

---

## 5. OAuth scope justification

Review asks why each scope is needed. One sentence each, matching what
the add-on actually does:

| Scope                      | Justification                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spreadsheets.currentonly` | Read the rows and column headers the user's rule refers to, and write the delivery status back into that sheet. Narrower than `spreadsheets`: it grants access only to the file the add-on is installed in. |
| `script.external_request`  | Call the Replai API to send the message the user configured.                                                                                                                                                |
| `script.scriptapp`         | Install the edit, form-submit and recurring time-based triggers that let a rule run without the user present.                                                                                               |
| `script.container.ui`      | Render the sidebar and the API key dialog.                                                                                                                                                                  |
| `userinfo.email`           | Show which account a rule runs under, so a shared spreadsheet's collaborators can see whose key sends and take a rule over.                                                                                 |

Before submitting, complete the consent flow once and read the screen
Google actually shows. If it lists a scope the manifest does not, pin the
manifest to what appears — plan §2.9 flagged one consent line we could
not map to a documented scope URI. Do not ship a guessed scope.

---

## 6. Reviewer test account

The reviewer must be able to use the add-on end to end without a Replai
account of their own. Prepare, and paste into the review notes:

- A Replai account on an active trial.
- A connected WhatsApp Business number.
- One approved template with **two body variables** — enough to
  demonstrate mapping without being fiddly.
- One API campaign already created, bound to that template.
- An API key scoped to `broadcasts:send` only.
- A spreadsheet containing the starter sheet, with the reserved test
  numbers left in place.

### Review notes text

```
Replai sends WhatsApp Business template messages on behalf of the user, triggered by their own Google Sheet.

TO TEST
1. Open the spreadsheet linked below. The add-on is already installed.
2. Extensions > Replai > Open Replai.
3. Paste the API key below when prompted. It is scoped so it can only send broadcasts.
4. The rule "Delivery reminder" is already configured. Press the eye icon to preview which rows match — this sends nothing.
5. To see a real send, edit the Status cell in row 2 so the rule matches it. The rule fires on that edit and the "Replai Status" column in that row updates within a minute.
6. Extensions > Replai > Help & Support shows the support options, documentation links and a form for reporting a problem. Nothing there sends a message or charges anything. "Reset Everything" in that dialog clears the API key and rules for this spreadsheet only; it is behind a two-step confirm, so a single click cannot trigger it.

The sample numbers in the sheet are NANP numbers reserved for fictional use (555-0100 range) and cannot receive a message, so nothing reaches a real person.

WHY EACH PERMISSION IS NEEDED
- View and manage spreadsheets this application is installed in: read the rows and headers the user's rule refers to; write the delivery status back. Scoped to the installed file only.
- Connect to an external service: call the Replai API to send.
- Run when you are not present: install the triggers that make a rule fire on an edit, a form submission, or daily.
- Display third-party content in sidebars: render the sidebar and setup dialog.
- View your email address: show which account a rule sends under, so collaborators on a shared sheet know whose key is used.

Spreadsheet: <URL>
API key: <KEY>
Test account: <EMAIL> / <PASSWORD>
```

Mint the reviewer's API key fresh and revoke it after approval.

---

## 7. Demo video (optional but recommended)

Ninety seconds, no narration needed, captions over screen capture.

| Time      | Shot                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:10 | A sheet of orders. Caption: "A spreadsheet of orders."                                                                               |
| 0:10–0:25 | Extensions → Replai → Open Replai; paste the API key. Caption: "Connect once."                                                       |
| 0:25–0:50 | Build a rule: sheet, On change, `Status equals Shipped`, campaign, map two variables. Caption: "Say when to send, and what to send." |
| 0:50–1:05 | Back in the sheet, change a Status cell to `Shipped`. The status column fills in. Caption: "Edit a row. The message goes out."       |
| 1:05–1:20 | The message arriving on a phone, next to the Replai Inbox showing the same conversation. Caption: "Every send lands in your Inbox."  |
| 1:20–1:30 | The date conditions in the wizard. Caption: "Or run daily, for renewals and birthdays."                                              |

Upload unlisted on YouTube and paste the link into the Promo Videos
field.

---

## 8. Submit

1. Cloud Console → **Google Workspace Marketplace SDK → Store Listing**.
2. Fill App Details, Graphic Assets, Screenshots, Support Links.
3. Leave **All Regions** selected unless there is a reason not to. Any
   region you deselect gets an error on a direct link, not a quiet
   fallback.
4. **Submit for review.**

A **public** listing goes through review. A **private** one publishes
immediately — which is what let us test with triggers working before
going public.

Status arrives by email at the developer address on the listing, and is
also shown at the top of the Store Listing page: `Unpublished`, `Under
review`, `Approved`.

After approval, install on a clean account and confirm the triggers arm
and fire, because that is the one thing a test deployment cannot prove.

---

## 9. Likely rejection reasons, and where we stand

| Reason                                             | Status                                                       |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Broken or missing privacy / terms URL              | Fixed — dedicated add-on pages; verify 200 before submitting |
| No Support link                                    | Add it — `/contact` **[was missing from our guide]**         |
| Privacy policy does not cover the requested scopes | Covered on the add-on privacy page                           |
| Requesting a scope the app cannot justify          | Five scopes, all used; justifications in §5                  |
| App name mismatch with the OAuth consent screen    | **Check this** — see §2                                      |
| Screenshots with padding or rounded corners        | See §3; crop full bleed                                      |
| No screenshot showing the Google integration       | Shot 1 in §3                                                 |
| Pricing declared Free while features are gated     | Declared "Free of charge with paid features" — see §2        |
| Reviewer cannot exercise the app                   | Test account + notes in §6                                   |
