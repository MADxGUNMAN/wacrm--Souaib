# Marketing opt-out & suppression

Customers block businesses when there is no polite way to leave. Blocks feed
Meta's quality rating, and a falling rating is what gets a number restricted
from opening new conversations. So an opt-out path is not a courtesy feature —
it is account-health work.

This document records the design and the build order.

## The rule this implements

> A contact who asked to stop receiving marketing never receives another
> marketing template — from any send path, including direct API calls.

Two halves, and they are independent:

- **Enforcement** — every send path consults the suppression list.
- **Capture** — inbound `STOP` (and Meta's own opt-out signal) writes to it.

Enforcement ships first. With an empty suppression list it is a no-op, so it
is risk-free to deploy. Shipping capture first would collect opt-outs while
still messaging those people, which is strictly worse than doing nothing.

## Design decisions

### Suppression is keyed on phone, not on a `contacts` column

`marketing_opt_outs (account_id, phone_normalized)` rather than a flag on
`contacts`. Two reasons, both load-bearing:

1. `POST /api/whatsapp/broadcast` receives **bare phone numbers** and never
   reads `contacts` at all. A phone-keyed table answers it with one batched
   query instead of forcing a new phone-to-contact resolution step.
2. Opt-outs must survive contact deletion and CSV re-import. Every CSV
   broadcast calls `upsertCsvContacts`, which inserts missing contacts — so a
   column on `contacts` would let a re-upload silently resurrect consent.
   That is exactly the failure this feature exists to prevent.

`contact_id` is stored alongside for audit only, `ON DELETE SET NULL`. The
phone is the identity.

### Only `Marketing` templates are suppressed

Utility and Authentication keep flowing. Meta's own copy for error 131050
says utility may still be allowed, and blanket suppression would break
transactional messaging — order updates, OTPs, delivery notices.

Category is read **at send time**, never cached into a broadcast row:
`template-webhook.ts` rewrites `message_templates.category` when Meta
reclassifies a template, so one that was Utility at authoring time can be
Marketing by the time it sends.

### Unknown category fails closed

`templateRow === null` is reachable in both broadcast paths — a template that
exists at Meta but was never synced locally. When category is unknown we
suppress.

This is cheap because the filter only ever applies to contacts who explicitly
opted out. Recipients who never opted out are unaffected either way, so the
blast radius of the safe choice is one suppressed message to somebody who
asked you to stop.

### `is_active` gates capture, not enforcement

Turning the feature off stops watching for keywords. It does **not** release
contacts who already opted out. Consent was withdrawn; a settings toggle is
not consent to resume. Enforcement therefore never reads `is_active`.

### Keywords and replies are per-account configuration

`opt_in_out_configs`, one row per account, holding the keyword lists, the two
response messages, and the active toggle. Keywords are stored UPPERCASE and
matched case-insensitively.

Defaults apply when no row exists, so an account that never opens Settings
still has a working `STOP`.

### Matching is whole-message, not substring

`STOP`, `stop`, and `STOP.` opt out. "please don't stop sending these" and
"stop by tomorrow" do not.

This is why detection is not built on the existing `keyword_match` automation
trigger, whose `contains` mode has no word-boundary handling and would opt
those customers out against their wishes.

### Detection is hardcoded, not an automation

An automation needs no code, but fails four ways: it is opt-in per account, so
accounts that never build it have no opt-out path; it is skipped entirely when
a Flow consumed the message (`flowConsumed` gates `keyword_match`); it cannot
stop the AI auto-reply; and its matching is substring-based. Detection and
enforcement are hardcoded. Only the wording stays configurable.

## Send paths

Five paths can put a template on the wire. They are separate implementations —
none delegates to another, so each needs its own gate.

| Path                                                    | Recipients from                           | Category available       |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------ |
| `POST /api/whatsapp/broadcast` (dashboard)              | client-supplied phones, no contact lookup | yes, nullable            |
| `POST /api/v1/broadcasts` → `broadcast-core.ts`         | caller phones, find-or-creates contacts   | yes, nullable            |
| `POST /api/whatsapp/send` → `sendMessageToConversation` | DB, in-account                            | yes                      |
| `POST /api/v1/messages`                                 | same core as above                        | yes                      |
| Automations `send_template` → `sendViaMeta`             | DB, single contact                        | **no — had to be added** |

Filtering only in the broadcast wizard would be cosmetic: the dashboard route
accepts a phone array from the client, so any authenticated user could POST
directly around it. The gate belongs server-side in every send path.

There is deliberately **no** scheduled-broadcast gate, because there is no
scheduled-broadcast executor: `status: 'scheduled'` and `scheduled_at` exist
but nothing drains them. If one is ever built, it must evaluate suppression at
send time, not at schedule time.

## Phases

### Phase 1 — Schema, library, enforcement ✅

- `20260831000000_marketing_opt_out.sql`
  - `opt_in_out_configs` — per-account keywords, replies, active toggle
  - `marketing_opt_outs` — the suppression list
  - `broadcast_recipients.status` widened with `'skipped'`
- `src/lib/whatsapp/marketing-opt-out.ts` — the single source of truth for
  matching, category gating, filtering, and recording
- Enforcement in all five send paths
- Meta error 131050 recorded as an opt-out instead of only logged
- `src/types/index.ts` — `MarketingOptOut`, `OptInOutConfig`

`'skipped'` is safe to add: the aggregate trigger in migrations 003/005
re-counts with `COUNT(*) FILTER (WHERE status IN (...))`, so a skipped
recipient lands in neither `sent_count` nor `failed_count`. An opt-out is not
a delivery failure and must not pollute failure metrics.

### Phase 2 — Capture ✅

`src/lib/whatsapp/opt-out-inbound.ts` — `handleInboundOptOutKeyword`, called
from the webhook's `processMessage` after the message INSERT and before
`dispatchInboundToFlows`.

That position is deliberate. It is after the INSERT, whose early-return on a
duplicate wamid is the de-facto idempotency barrier, so a Meta redelivery
cannot double-process. And it is upstream of every reactive engine.

It must gate all three engines, mirroring how `flowConsumed` is threaded:
Flows, the `keyword_match` / `new_message_received` / `interactive_reply`
automation triggers, and the AI auto-reply. Otherwise the LLM replies to
"STOP".

On opt-out it also pauses active `flow_runs` (`end_reason:
'customer_opted_out'`) and sets `conversations.ai_autoreply_disabled`, then
sends the configured confirmation via `engineSendText`. The 24-hour window is
open by definition, since the customer just messaged.

Matches both plain text and template quick-reply taps. For a tap, match on
`interactiveReplyId` — the button _payload_, a stable value — not the label,
which is translatable.

Four rules that are easy to get backwards:

- **A failed write never confirms.** If `recordMarketingOptOut` returns
  `'failed'`, the message is not consumed and no confirmation is sent. Telling
  somebody they unsubscribed when nothing was stored would stop them asking
  again while marketing keeps arriving.
- **`'existed'` is success, not failure.** A repeated `STOP` still gets a
  confirmation; silence reads as being ignored.
- **Opt-IN does not silence anything.** It clears the suppression and
  confirms, but deliberately leaves Flows and the AI running — somebody
  opting back in wants to engage.
- **Opt-out suppresses the relationship-level triggers too.**
  `new_contact_created` and `first_inbound_message` normally survive
  `flowConsumed` because they are about _who_ is messaging rather than what
  they said, but a contact whose first-ever message is `STOP` must not be met
  with a welcome sequence.

### Phase 3 — Settings UI and surfaces ✅

- Settings → **Opt-In/Out** tab: keyword chips with add/remove, the two
  response messages, the active toggle, suggested keywords
  (`STOP`, `CANCEL`, `UNSUBSCRIBE`, `END`, `QUIT` /
  `JOIN`, `START`, `SUBSCRIBE`, `YES`, `CONFIRM`)
- Contact sidebar: unsubscribed badge plus an agent re-subscribe control,
  because mistakes and verbal re-consent both happen
- Broadcast wizard: subtract opted-out contacts in `resolveAudience`, next to
  the existing exclude-tag subtraction, so suppressed contacts never get
  recipient rows
- `step4-schedule-send.tsx` reach estimate — it runs independent queries and
  will otherwise disagree with what actually sends
- Broadcast detail: show skipped distinctly from failed
- Template editor: for Marketing templates, nudge toward a
  `Reply STOP to unsubscribe` footer and a STOP quick-reply button.
  `footer_text` already flows through `buildMetaTemplatePayload`, so this is
  guidance, not plumbing

### Phase 4 — Observability ✅

A count nobody can act on is not observability. This phase makes the
suppression list answerable: who is on it, how they got there, and whether it
is growing.

- `GET /api/whatsapp/opt-in-out` also returns a `summary` —
  `{ total, last_30_days, by_source }`. The 30-day figure is the point: a flat
  total cannot tell you whether opt-outs are accelerating, which is the early
  warning that a campaign is annoying people.
- `GET /api/whatsapp/opt-in-out/list` — paginated audit list (phone, contact
  name, source, date) with search. `DELETE ?phone=…` re-subscribes one number.
- `src/components/settings/opt-out-list.tsx` — the list in the Settings pane,
  with a confirmed Re-subscribe action.
- Broadcast detail shows a suppression banner when anything was withheld.
- `src/lib/whatsapp/opt-in-out-access.ts` — one shared permission resolver, so
  the two routes cannot drift on who may read and who may write.

Three implementation notes that are easy to get wrong:

- **Counts are exact `count` queries, never a tally of fetched rows.**
  PostgREST caps a plain select at ~1000 rows, so counting in JS silently
  undercounts a busy account. This applies to the summary and to the
  per-broadcast skipped total.
- **Contact names are resolved in a second query, joined on
  `phone_normalized`** — not a PostgREST embed on `contact_id`. The FK is new,
  and an embed depends on the schema cache having picked it up; a stale cache
  fails the whole request with PGRST200. Joining on phone also keeps the name
  visible for a contact that was deleted and re-imported.
- **`skipped` has no aggregate column, by design.** The trigger in migrations
  003/005 counts explicit status lists, so a skipped recipient lands in
  neither `sent_count` nor `failed_count`. The banner exists partly to explain
  the resulting gap between Total and Sent + Failed.

## Scope: marketing templates only — decided

The rule is deliberately narrow, and this is settled rather than open:

> An opted-out contact receives no **marketing templates**. Everything else
> continues to work.

What still reaches an opted-out contact:

| Message                                       | Reaches them? |
| --------------------------------------------- | ------------- |
| Marketing template                            | **No**        |
| Utility template (order updates, receipts)    | Yes           |
| Authentication template (OTPs)                | Yes           |
| Agent's free-form reply in the 24-hour window | Yes           |
| Flow / automation free-form text and media    | Yes           |
| Interactive buttons and lists                 | Yes           |

So Flows and automations sending promotional _text_ is **not** gated, and that
is the intended behaviour, not an oversight. Opting out of marketing is not the
same as refusing to be talked to — an unsubscribed customer who asks a question
must still get an answer.

The one edge worth knowing: a template that exists at Meta but was never synced
locally has no category, and `isMarketingCategory` treats unknown as marketing
(fail closed). A genuine utility template in that state will be withheld from
opted-out contacts until it is synced. `marketingSuppressionReason()` says so
in the error rather than claiming the template was marketing, because the fix
is "Sync from Meta", not "change your template".
