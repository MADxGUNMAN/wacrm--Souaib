# Claude Connectors Directory — submission copy

> **Status (24 Oct 2026):** submitted 8 Oct 2026, **still in review**. When
> it is listed, follow "After listing" below and add the link to
> `DIRECTORY_LISTINGS` in `src/components/settings/ai-connectors/shared.ts`.

Portal: **claude.ai/directory/manage** → **Submit new** → **MCP connector**.
Submit from the Pro/Max account (or Team/Enterprise **Owner**) that should
own the listing long term. Requirements re-checked against
[the connector pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria)
on 2 Oct 2026 (07 §3).

## 1. Server

| Field             | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Server URL        | `https://wacrm.junkiescoder.com/mcp`                                                        |
| Connection type   | Universal URL                                                                               |
| Authentication    | OAuth — **CIMD** (`oauth_cimd`); DCR (`oauth_dcr`) also works. Nothing to send to Anthropic |
| Allowed link URIs | None (no `ui/open-link` in v1)                                                              |

## 2. Listing

**Name:** Replai

**Short description** (one line):

> Manage your Replai WhatsApp CRM — inbox, contacts, deals, messages and broadcasts.

**Long description:**

> Replai is a WhatsApp Business CRM. This connector lets Claude work in your
> Replai workspace in plain language.
>
> - Find contacts and read their notes, tags and latest conversation.
> - See which inbox conversations are open or unread, read the messages, and
>   check whether WhatsApp's 24-hour reply window is open.
> - Add contacts, tags and notes, change conversation status and assignment,
>   and create, move or close deals.
> - Reply on WhatsApp or send an approved template to a customer.
> - Prepare a template broadcast, see exactly who it will reach, and send it
>   only after you confirm.
> - Check broadcast results, template performance, response times and
>   dashboard numbers, and switch automations or chatbot flows on or off.
>
> You sign in with your Replai account and Claude acts as you — with your
> Replai role and nothing more, in the workspace you signed in to. You choose
> what it may do when you connect (view, edit records, send messages,
> broadcasts, automations) and can narrow it or disconnect any time in
> Replai → Settings → AI Connectors. Workspace owners can switch sending,
> broadcasts or AI access off for everyone and set daily limits. Broadcasts
> always need a preview and your confirmation; messages sent this way are
> marked in the Replai inbox.
>
> Requires a Replai account with WhatsApp Business connected.

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Icon              | `assets/replai-icon-1024.png` (square, white background) |
| Documentation URL | https://wacrm.junkiescoder.com/integrations/ai           |
| Privacy policy    | https://wacrm.junkiescoder.com/privacy                   |
| Support contact   | https://wacrm.junkiescoder.com/contact                   |

**Example prompts** (with what should happen, from 06 §5):

| Prompt                                                               | Expected                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Which of my Replai conversations are unread right now?               | `list_conversations` (unread) — names and last message           |
| Show my open deals in the Negotiation stage of the Sales pipeline    | `list_pipelines` → `list_deals`                                  |
| How did the "Payment reminder" broadcast perform?                    | `list_broadcasts` → `get_broadcast` — sent/delivered/read/failed |
| Add the tag Follow-up to Demo Team 1 and note "asked for a callback" | `search_contacts` → `add_tags_to_contacts`, `add_contact_note`   |
| Send the hello_world template to Demo Team 1                         | `get_template` → `send_template_message`, approval prompt        |
| Turn on the "Tag price enquiries" automation                         | `list_automations` → `set_automation_active`                     |
| Broadcast hello_world to everyone tagged VIP                         | `preview_broadcast` → shows the preview and waits for a yes      |

## 3. Reviewer test credentials (private field)

From the password manager entry "Replai Demo reviewer" (see
[reviewer-demo.md](reviewer-demo.md)):

> Sign in at https://wacrm.junkiescoder.com when Claude opens the Replai
> window. Email: `<DEMO_EMAIL>` — Password: `<from password manager>`.
> No MFA, no email code. The account is the owner of the "Replai Demo"
> workspace (≈200 sample contacts, 40 conversations, 2 pipelines, 3 past
> broadcasts, 3 automations, 1 flow). WhatsApp is a Meta test number:
> messages reach only our own team phones (contact "Demo Team 1"); sends to
> the other sample contacts are rejected by WhatsApp by design. Broadcasts
> are limited to 20 recipients a day.

## 4. Reviewer notes (optional free text)

> Annotations: 26 of 47 tools are read-only. Writes inside the workspace are
> destructiveHint true when they overwrite or remove data (update, remove
> tags, status, assignment, close deal, automation/flow switches,
> disconnect). The two send tools and send_broadcast are open-world and
> destructive because a delivered WhatsApp message can't be recalled.
> Broadcasts are always two-step (preview_broadcast returns a single-use
> confirmation id that send_broadcast requires). Customer-written text is
> returned in `untrusted_text` fields and the server instructions tell the
> model to treat it as data. Per-tool justifications are attached
> (tool-justifications.json).

## 5. Test & launch

Before ticking "every tool was tested in Claude": run the example prompts
above with the reviewer login, plus at least one call of every tool group
(06 §5.1–5.4). Record the results in `src/lib/ai-connector/evals/prompts.md`.

## After listing

Copy the listing link into `/integrations/ai` (Claude card) and Settings →
AI Connectors. Keep the reviewed contract: no new write tools without
updating the listing (07 §3.4).
