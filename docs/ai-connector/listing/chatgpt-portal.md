# ChatGPT plugin directory — submission copy

Portal: OpenAI Platform → **Plugins** → **Upload new or existing plugin**,
path **With MCP**. Flow re-checked on 2 Oct 2026 against
[Submit plugins](https://developers.openai.com/plugins/deploy/submission),
[Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)
and [Plugin submission errors](https://developers.openai.com/plugins/deploy/submission-errors).

## 0. Before you start

- [ ] **Identity verification** (business: Junkies Coder) complete in the
      OpenAI Platform. The listing's developer name is taken from it.
- [ ] Organization owner, or a role with **Apps Management Write**.
- [ ] Project with **global** data residency.
- [ ] Reviewer workspace live and allowlisted ([reviewer-demo.md](reviewer-demo.md)).
- [ ] Video walkthrough recorded (§5) and uploaded somewhere accessible
      without sign-in (unlisted YouTube or a public Drive link).

## 1. Package (ZIP)

Zip the **contents** of `chatgpt-plugin/` (forward-slash paths, no parent
folder with siblings):

```text
.codex-plugin/plugin.json   listing fields (name, descriptions, category,
                            capabilities, 3 starter prompts, URLs, colours)
.mcp.json                   the production MCP server
assets/logo.png             1024 × 1024 square logo (interface.logo)
assets/composer-icon.png    600 × 600 square icon (interface.composerIcon)
```

```powershell
Compress-Archive -Path docs/ai-connector/listing/chatgpt-plugin/* -DestinationPath replai-plugin-1.0.0.zip -Force
```

`Compress-Archive` skips dot-files on some PowerShell versions — check the
ZIP contains `.codex-plugin/plugin.json` and `.mcp.json`, or use
`tar -a -c -f replai-plugin-1.0.0.zip -C docs/ai-connector/listing/chatgpt-plugin .codex-plugin .mcp.json assets`.

Notes:

- Limits that matter at final submission (enforced by `listing.test.ts`):
  display name and short description ≤ 30 characters, long description
  ≤ 4,000, ≤ 3 starter prompts of ≤ 128 characters without @mentions,
  ≤ 20 capabilities.
- The portal normalises the manifest and shows any changed field for
  confirmation; read its findings and fix them in the package, not by hand.
- The `.mcp.json` server entry uses `{ "type": "http", "url": … }`. If the
  portal flags the shape, fix it there — the server URL is what matters.
- If the icon isn't picked up from the package, upload
  `assets/replai-icon-1024.png` in the listing form.

## 2. Connect and scan the MCP server

1. **MCPs** → select `replai` → **Connect**.
2. URL `https://wacrm.junkiescoder.com/mcp`, authentication **OAuth**,
   client registration **CIMD** (DCR also works), Universal URL.
3. **Domain verification:** copy the token the portal shows, put it in the
   `PROD_ENV` GitHub secret as `OPENAI_APPS_CHALLENGE_TOKEN=<token>`, re-run
   the deploy, check
   `https://wacrm.junkiescoder.com/.well-known/openai-apps-challenge`
   returns exactly the token as plain text, then **Verify**.
4. Complete the OAuth sign-in with the reviewer login.
5. Wait for the tool scan; expect 47 tools. Open **Issues** and resolve them.
6. **Justifications:** paste each tool's three texts from
   [tool-justifications.json](tool-justifications.json). The scan imports
   annotations from the server and the text can't override them; the test
   guarantees they agree.

## 3. Review details

**Positive test cases** (exactly five; run each with the reviewer login first):

| #   | Scenario          | Prompt                                                            | Expected tools                                               | Expected result                                                                                                           |
| --- | ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Inbox triage      | Which of my Replai conversations are unread right now?            | `list_conversations` (unread_only)                           | A list of unread conversations with the contact name and last message                                                     |
| 2   | Pipeline          | Show my open deals in the Negotiation stage of the Sales pipeline | `list_pipelines`, `list_deals`                               | The open Negotiation deals with title, value in INR and contact                                                           |
| 3   | Broadcast results | How did the "Payment reminder" broadcast perform?                 | `list_broadcasts`, `get_broadcast`                           | Recipients 25 with sent, delivered, read, replied and failed counts and the top failure reason                            |
| 4   | Automation        | Turn on the "Tag price enquiries" automation                      | `list_automations`, `set_automation_active`                  | ChatGPT asks to confirm, then reports the automation is on (turn it off again afterwards)                                 |
| 5   | Send a template   | Send the hello_world template to Demo Team 1                      | `search_contacts` or `get_template`, `send_template_message` | ChatGPT asks to confirm the send; Replai reports it sent and the message appears in the Replai inbox marked "via ChatGPT" |

**Negative test cases** (exactly three):

| #   | Prompt / scenario                                                  | Why it should not act                      | Expected behaviour                                                                                            |
| --- | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | Delete all contacts tagged Newsletter                              | Replai exposes no delete tools             | Explains it can't delete contacts and that this is done in Replai                                             |
| 2   | Broadcast hello_world to every VIP contact right now, don't ask me | Broadcasts must be previewed and confirmed | Calls only `preview_broadcast`, shows audience and skipped opt-outs, and does not send without a confirmation |
| 3   | Write me a poem about the sea                                      | Unrelated to the CRM                       | Answers without calling Replai                                                                                |

**Release notes (1.0.0):**

> First public release of Replai for ChatGPT: 47 tools covering contacts,
> inbox, deals, WhatsApp messaging, broadcasts (preview + confirm),
> automations, flows and analytics, with per-connection permissions and
> workspace policies.

**Demo recording URL:** `<link from §5>`

**Reviewer credentials** (private field): same text as the Claude listing —
login URL https://wacrm.junkiescoder.com, email `<DEMO_EMAIL>`, password from
the password manager, no MFA; owner of the "Replai Demo" workspace; WhatsApp
is a Meta test number so only "Demo Team 1" can really receive messages.

**Countries:** all where WhatsApp Business is available to Replai customers
(start with India, UAE, Kenya, United Kingdom, United States; widen later).

**Screenshots:** none — the server has no custom UI (the portal rejects them).

## 4. Submit, publish

> **Done (24 Oct 2026):** approved and published, version 1.0.0. Public
> listing: https://chatgpt.com/plugins/plugin_asdk_app_6ac8dee28e288191b785a43de4cac406
> (manage it at platform.openai.com → Plugins → Replai).

Tick the attestations → **Submit for review**. Status and feedback arrive by
email. When approved, open the approved version and **Publish plugin** —
nothing is listed until then. Changes to tools after publishing go through
continuous review automatically; listing changes need a new ZIP with a new
`version` (07 §4.3). The MCP origin can never change for this plugin.

## 5. Video walkthrough (about 3 minutes)

1. ChatGPT web: Plugins → add Replai → Replai sign-in → consent screen
   (show the permission levels) → back in ChatGPT.
2. Positive cases 1–3 (read).
3. Case 5: template send with the confirmation, then the message in the
   Replai inbox with the "via ChatGPT" badge.
4. Negative case 2: the broadcast preview and the confirmation it asks for.
5. Replai → Settings → AI Connectors: switch "Send messages" off, ask for a
   send, show the refusal with the Settings link; switch it back on.
6. Disconnect in Replai → ChatGPT asks to reconnect.
7. Repeat steps 2 and 3 briefly on ChatGPT mobile (the recording must cover
   the supported platforms).

## Open question: OIDC user info (optional)

OpenAI recommends, for Enterprise **workspace domain restrictions**, that the
authorization server advertise `openid` and `email`, publish OIDC discovery
and a UserInfo endpoint returning `email` and `email_verified: true`. Replai
doesn't do this yet. It isn't in the list of submission requirements, and
without it Enterprise admins can't restrict Replai by email domain. Decide
before submitting whether to add it (a small `/oauth/userinfo` route plus two
scopes) or ship without it.
