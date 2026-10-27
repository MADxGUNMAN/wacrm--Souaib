# 07 — Production deploy and directory publishing

From a tested dev build to a connector anyone can install from the Claude
Connectors Directory and the ChatGPT directory.

> Directory rules change often. At the start of Phase 10, re-read the
> official pages linked in the README and update this file where they
> differ. Requirements below were current in August 2026 and are
> paraphrased.

---

## 1. Production deploy

The connector ships inside the existing `wacrm` container on the EC2 host
(`/opt/wacrm`). No new service.

### 1.1 Environment

Add to `/opt/wacrm/.env` (read the existing file on the server; don't paste
secrets into chat or commits):

```dotenv
AI_CONNECTOR_ENABLED=true
AI_CONNECTOR_ISSUER=https://wacrm.junkiescoder.com
AI_CONNECTOR_TOKEN_PEPPER=<openssl rand -base64 48, production only>
AI_CONNECTOR_JWT_PRIVATE_KEY="<ES256 PEM, production only>"
AI_CONNECTOR_JWT_KID=<kid shown by Supabase after import>
AI_CONNECTOR_ALLOWED_ACCOUNTS=<beta workspace ids; remove after listing>
AI_CONNECTOR_ALLOW_DEV_CLIENTS=false
AI_CONNECTOR_DCR_ENABLED=true
```

And pass them through `docker-compose.prod.yml` (`environment:` block —
they are runtime, not build args).

### 1.2 nginx

On the host, make sure these reach the container unchanged:

```nginx
location = /mcp                 { proxy_pass http://127.0.0.1:3000; proxy_read_timeout 60s; client_max_body_size 256k; }
location /oauth/                { proxy_pass http://127.0.0.1:3000; }
location /.well-known/oauth-    { proxy_pass http://127.0.0.1:3000; }
```

Keep the existing `proxy_set_header Host`, `X-Forwarded-For` and
`X-Forwarded-Proto` lines. Don't let an ACME `location /.well-known/`
block swallow the OAuth documents — scope ACME to
`/.well-known/acme-challenge/`. No IP allowlist is needed; if you add one
later, Anthropic's egress range is `160.79.104.0/21` and OpenAI publishes
its own.

### 1.3 Deploy steps

1. Merge to `main`; CI (`master_ci.yml`) green.
2. Apply any pending connector migrations to the Supabase project.
3. Import the production signing key into Supabase (01 §5.2 option A).
4. Update `.env`, rebuild and restart the container as for any release.
5. Add the connector cleanup and audit-retention jobs to
   `/opt/wacrm/cron-ping.sh` (same `x-cron-secret` pattern; back up the
   script first, as with the last cron install).
6. Smoke test (below).

### 1.4 Smoke test

- [ ] §2 of 06 (401 + metadata) against `https://wacrm.junkiescoder.com`.
- [ ] Inspector OAuth flow **fails** (dev clients off) — correct for prod.
- [ ] Claude custom connector `Replai` → sign-in → `get_profile`.
- [ ] ChatGPT developer-mode app → sign-in → `get_profile`.
- [ ] Settings → AI Connectors shows both connected.
- [ ] Disconnect both from Replai → both ask to reconnect.
- [ ] `/api/health` still 200; container memory normal.

### 1.5 Monitoring

- Super admin → System health: tool calls/day, error rate, p95 latency,
  denials by layer, token refresh failures, refresh-reuse events.
- Alert (existing notification mechanism) when error rate > 5 % over 15
  minutes or any refresh-reuse event.

### 1.6 Rollback

Set `AI_CONNECTOR_ENABLED=false` and restart. `/mcp` returns 503 and the
consent page explains AI connectors are temporarily unavailable. Tokens
stay valid in the database and work again when re-enabled. Migrations are
additive, so the previous image runs fine against the new schema.

---

## 2. Listing materials (shared by both directories)

Prepare once, before either submission. The prepared material — portal
copy, the ChatGPT package, per-tool justifications, icon and the reviewer
workspace runbook — is in [`listing/`](listing/README.md).

### 2.1 Public pages on the production origin

| Page                                                                             | Content                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/integrations/ai` (+ `/integrations/claude`, `/integrations/chatgpt` redirects) | What it does, example prompts, how to connect each app, permissions, how to disconnect, limits, support link                                                                                                                                                                                                                    |
| `/legal/privacy-policy` (via `/privacy`)                                         | New "AI connectors" section: data categories returned to Claude/ChatGPT (contacts, messages, deals, templates, broadcast stats), purpose, recipients (Anthropic, OpenAI as chosen by the user), retention (audit log 90 days, tokens until revoked/expired), user controls (permissions, disconnect, workspace switch), contact |
| `/legal/terms-of-service` (via `/terms`)                                         | Use of AI connectors, user responsibility for messages sent through them                                                                                                                                                                                                                                                        |
| `/contact`                                                                       | Support contact (already exists)                                                                                                                                                                                                                                                                                                |

Check each returns 200 with real content (same check as the Google Sheets
go-live guide).

### 2.2 Assets and text

- Icon: square PNG of the Replai mark (`public/logo-icon.png` at 512×512 or
  larger, transparent or solid background — check each portal's spec).
- Name: **Replai** (OpenAI rejects "Replai MCP" / "Replai Plugin").
- Short description: "Manage your Replai WhatsApp CRM — inbox, contacts,
  deals, messages and broadcasts."
- Long description: what it does, who it's for, that it needs a Replai
  account, the permissions model. No pricing, trials, comparisons or
  promises.
- Example prompts (5–8) taken from 06 §5, each with the expected result.
- Tool justifications: one line per tool explaining its annotations
  (OpenAI says justifications are optional now, but reviewers still read
  them when annotations are flagged).

### 2.3 Reviewer test account

Both directories require a login reviewers can use with no extra steps.

- Separate production workspace "Replai Demo", owner login with email +
  password, **no MFA**, no email OTP, not tied to a real person's phone.
- Realistic data: ~200 contacts with tags and custom fields, ~40
  conversations (open/pending/closed, some unread, some inside the
  24-hour window), 2 pipelines with ~20 deals, 6 approved templates, 3 past
  broadcasts with stats, 3 automations, 1 flow.
- WhatsApp connected to a **test number** whose recipients are team
  phones, so reviewer sends reach nobody real. Broadcast policy on but cap
  set to 20; allowlist the demo account.
- Subscription active for the whole review window.
- Credentials stored in the team password manager; shared only through the
  portals' private fields.

---

## 3. Claude Connectors Directory

> **Re-checked against the live docs on 2 Oct 2026 (Phase 8).** The
> [connector pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria)
> matches §3.1. What changed: submissions now go through the developer
> portal at claude.ai/directory/manage from a Pro, Max, Team or Enterprise
> account (on Team/Enterprise only an Owner, or a role with the Directory
> permission) — see [Publish to the directory](https://claude.com/docs/directory/publish).
> A listing is either an **MCP connector** (what we submit: the server
> URL, no repository) or a **plugin bundle** (a public GitHub repo with
> skills that can reference the connector and be paired with it).
> A bundle is optional and can follow later. Public documentation must be
> live by the publish date; test credentials must be for a fully
> populated account.

### 3.1 Requirements check

- [ ] Remote HTTPS server, OAuth 2.0 for user data.
- [ ] Every tool has `title` and the applicable `readOnlyHint` /
      `destructiveHint` (03).
- [ ] No catch-all request tool; reads and writes are separate tools.
- [ ] Tool names ≤ 64 chars; descriptions describe behaviour only — no
      instructions to Claude about other tools, no hidden or promotional
      text.
- [ ] Every tool returns success with valid input; errors are specific.
- [ ] Responses are reasonably sized; no data dumps.
- [ ] Doesn't collect conversation data, chat history or memory.
- [ ] The server is Replai's own first-party API on Replai's domain.
- [ ] Tested as a custom connector in Claude (every tool from a
      conversation).
- [ ] Privacy policy, documentation, support contact, icon, reviewer
      account ready.
- [ ] Submitting account is on a paid Claude plan.

### 3.2 Choose the authentication type

Recommended: **CIMD** (`oauth_cimd`) with DCR fallback (`oauth_dcr`) —
both work by default and need nothing from Anthropic. Universal URL:
`https://wacrm.junkiescoder.com/mcp`.

Alternative if DCR/CIMD gives trouble at scale: **Anthropic-held client
credentials** (`oauth_anthropic_creds`). Create a confidential client for
Claude in `oauth_clients`, email the `client_id` to
mcp-review@anthropic.com, transfer the secret the way they instruct (never
in the email). Claude Code still uses its own CIMD in that case.

### 3.3 Submit

1. Open **claude.ai/directory/manage** → **Submit new** → **MCP connector**.
2. Work through the steps: server URL, connection type (Universal URL),
   authentication, listing details (name, descriptions, icon,
   documentation URL, privacy policy URL, support contact), reviewer test
   credentials, allowed link URIs (only if we use `ui/open-link` — not in
   v1), and the **Test & launch** confirmation that every tool was tested
   in Claude.
3. Accept the Software Directory Terms and Policy.
4. Submit. Anthropic scans automatically and, by default, lists it as a
   **Community** connector. Some listings are later escalated to
   **Verified** review with functional tests of each tool; no action needed.
5. Track status and reviewer feedback in the same portal. Escalations:
   mcp-review@anthropic.com.

### 3.4 After listing

- Copy the listing link into Settings → AI Connectors (Claude card) and
  `/integrations/ai`.
- Tool changes go live from the server, but keep the reviewed contract:
  no surprise new write tools without updating the listing; respond to
  security issues promptly (directory terms).
- Discovery metadata is cached ~5 minutes on Claude's side.

---

## 4. ChatGPT directory (plugins)

> **Re-checked against the live docs on 2 Oct 2026 (Phase 8)** —
> [Submit plugins](https://developers.openai.com/plugins/deploy/submission),
> [Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review),
> [Package your plugin](https://developers.openai.com/plugins/build/plugins).
> §4.1 still holds; the submission flow in §4.2 changed:
>
> - A submission is now a **ZIP package**: `plugin.json` at the root (or
>   the `.codex-plugin/plugin.json` layout that `@plugin-creator`
>   scaffolds) declaring the MCP server. The MCP server must be in the
>   first ZIP — it can't be added to a skills-only plugin later. One MCP
>   server per plugin. Skills are optional.
> - **Domain verification**: the portal shows a token to serve as plain
>   text at `https://wacrm.junkiescoder.com/.well-known/openai-apps-challenge`.
>   The route exists; set `OPENAI_APPS_CHALLENGE_TOKEN` on the server.
> - Review information: **5 positive and 3 negative test cases** (prompt,
>   expected tools, expected result), a **video walkthrough URL**, release
>   notes. These can live in `plugin.json`; reviewer credentials are
>   entered separately in the portal.
> - Submitting needs organization owner or **Apps Management Write**.
> - Annotation rules are spelled out: sending messages to external
>   recipients is `openWorldHint: true` and `destructiveHint: true`;
>   anything limited to the user's own workspace is `openWorldHint: false`.
>   Our catalog matches (03 §4).
> - "Remove internal identifiers (trace or request ids, internal account
>   ids)" from results unless needed. Our results carry only record ids
>   the next call needs; the `ref` code appears only in internal-error
>   messages. Reviewers may still ask about the user id in `get_profile`.
> - MCP changes after publishing are picked up by continuous review with
>   no new ZIP; listing/metadata changes need a new ZIP version.

### 4.1 Requirements check

- [ ] **Identity verification complete** in the OpenAI Platform dashboard
      for the exact publisher name (individual or business). Unverified
      names are rejected.
- [ ] Organization owner, or a role with `api.apps.write` (submit) and
      `api.apps.read` (view status).
- [ ] Project with **global** data residency (EU-residency projects can't
      submit MCP plugins).
- [ ] Public HTTPS MCP URL — not a tunnel or test endpoint.
- [ ] Every tool has explicit boolean `readOnlyHint`, `destructiveHint`,
      `openWorldHint` that match behaviour (03 §1).
- [ ] Tools are independent; no "call another plugin" instructions; no
      generic executor.
- [ ] Outputs contain no unnecessary PII, internal ids, trace ids or
      secrets; every returned data category is in the privacy policy.
- [ ] No pricing, upgrade prompts or checkout links in tools or listing
      (the subscription error links to an informational page only).
- [ ] Works on ChatGPT desktop and mobile.
- [ ] Test prompts with expected responses, all passing.
- [ ] Reviewer credentials: no MFA, work from outside our network, not
      expiring.

### 4.2 Submit

1. Open the **plugin submission portal** in the OpenAI Platform dashboard.
2. Create a new MCP-backed plugin. Enter the MCP URL
   `https://wacrm.junkiescoder.com/mcp`, select **OAuth**, choose **CIMD**
   (or DCR). Universal URL, not Template.
3. **Scan Tools**. The portal imports tool names, descriptions, schemas,
   annotations, `securitySchemes`, `_meta` and server instructions. If an
   annotation looks wrong, fix it on the server, deploy, scan again — the
   justification text can't override it.
4. Fill in: name, logo, description, company URL, privacy policy URL,
   terms URL, support contact, test prompts + expected responses,
   localization/countries. No screenshots (no UI in v1).
5. Tick the confirmations → **Submit for review**.
6. Status and emails come through the portal. To change anything while in
   review: **Cancel Review**, edit the same draft, resubmit.
7. When approved, click **Publish**. Without publishing it doesn't appear.

### 4.3 After publishing

- Users find it by searching the exact name or through its directory URL.
  Featured placement is chosen by OpenAI and can't be requested.
- **Continuous review:** OpenAI rescans the live server. Deleted tools
  disappear at once; new or changed tools go live only after automated
  checks pass, and the old definition stays live meanwhile. Keep old input
  schemas working until a change is approved; roll back rather than wait if
  a deploy breaks the published contract.
- Changes to listing info need a new version → review → publish.
- **The MCP origin can never change** for this plugin. Moving to a new
  domain means a brand-new plugin submission. Only the path can change in a
  new version.
- Before any press announcement, contact press@openai.com.

---

## 5. Launch checklist

- [ ] Phases 0–9 exit gates all met.
- [ ] External security review done, findings closed.
- [ ] Production smoke test passed (§1.4).
- [ ] Public pages and privacy policy live (§2.1).
- [ ] Reviewer demo workspace ready and re-checked the day of submission.
- [x] Claude submitted; ChatGPT submitted (verification done) — 8 Oct 2026.
- [x] ChatGPT approved and published — 24 Oct 2026:
      https://chatgpt.com/plugins/plugin_asdk_app_6ac8dee28e288191b785a43de4cac406
- [ ] Claude listed (still in review).
- [ ] Support ready: `/contact` and Live Chat know how to answer "how do I
      connect / disconnect / why was this refused".
- [x] Allowlist removed (8 Oct 2026).
- [ ] Settings → AI Connectors deep links point to both listings (ChatGPT
      done 24 Oct 2026; Claude when listed).
- [ ] Announce to existing customers (in-app notification + email via Auto
      Mail), after OpenAI press coordination if mentioning ChatGPT.

---

## 6. Ongoing maintenance

| Cadence                                                      | Task                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Every release touching tools                                 | Rerun 06 §5 on both platforms; update eval file and listing prompts                                                       |
| Monthly                                                      | Review denial and error metrics; check both platforms' changelogs for auth or annotation changes                          |
| Quarterly                                                    | Rotate `AI_CONNECTOR_JWT_PRIVATE_KEY`; review `oauth_clients` registry and pinned CIMD copies; review audit-log retention |
| Yearly                                                       | Re-run the external security review                                                                                       |
| When MCP 2026-07-28 is supported by the SDK and both clients | Plan the protocol upgrade (05 Phase 11)                                                                                   |
