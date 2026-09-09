# Inbox parity with WhatsApp Web — implementation plan

What WhatsApp Web offers, what the Cloud API actually allows, and what we can build.

Sources: [Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages),
[Location messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-messages/),
[Location request messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/location-request-messages),
[Contacts messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/contacts-messages/),
[Sticker messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/sticker-messages/),
[Typing indicators](https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators),
[Mark messages as read](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read).
Content from Meta's docs is paraphrased here; payloads are the documented shapes.

---

## 1. Verdict table

The single most important thing to understand before planning: **WhatsApp Web is a
WhatsApp client. We are not.** We talk to the Cloud API, which exposes a deliberately
smaller surface. Some of what the screenshots show is impossible for any Business API
product, and no competitor has it either.

| WhatsApp Web feature | Cloud API reality | What we build |
| --- | --- | --- |
| Photos & videos, Document, Audio | Supported | **Already built** |
| Reply / quote | `context.message_id` | **Already built** |
| React (emoji) | `type: reaction` | **Already built**, but only 6 hardcoded emoji |
| Copy | Client-side | **Already built** |
| Voice note | Ogg/Opus audio | **Already built** (in-browser Opus encoder) |
| **Blue ticks for the customer** | `status: read` | **Build** — we never send this today |
| **Typing indicator** | `typing_indicator: { type: text }` | **Build** |
| **Location (send a pin)** | `type: location` | **Build** |
| **Ask customer for location** | `interactive.location_request_message` | **Build** (Web has no equivalent — better than parity) |
| **Location (render inbound)** | Arrives with lat/lng | **Fix** — we currently flatten it to a string and lose the coordinates |
| **Contact card** | `type: contacts` | **Build** — natural fit, we already own a contacts table |
| Contact card (inbound) | Arrives as `type: contacts` | **Fix** — the live webhook parser has no case for it at all |
| **Sticker** | `type: sticker`, WebP only | **Build** |
| **Emoji picker** | Client-side | **Build** |
| **Forward** | No forward API | **Build as re-send** — honest label, see §7 |
| **Star** | No API | **Build local-only** |
| **Pin** | No API | **Build local-only** |
| **Message info** | Status webhooks | **Build** — needs per-status timestamps |
| **Delete for everyone** | **Not supported by any Business API** | Explain + offer *delete for me*; see §8 |
| Delete (customer deletes) | Coexistence `revoke` | **Already built** (`deleted_at`) |
| Poll | **Not supported** — inbound arrives unsupported | Honest limitation card |
| Live location | **Not supported** | Honest limitation card + ask for a static pin |
| Event | **Not supported** | Nothing |
| New sticker (create) | Not an API concern | Sticker pack management, optional later |
| Catalogue | `interactive` product messages | Deferred — needs a Meta commerce catalog on the WABA |
| Quick replies | Our own feature | **Already built** |

---

## 2. The structural blocker to fix first

Adding any new inbound message type today requires **three coordinated edits in three
files**, and missing one causes a silent data bug:

1. `supabase/migrations/*` — the `messages_content_type_check` CHECK constraint.
2. `src/app/api/whatsapp/webhook/route.ts` — an `ALLOWED_CONTENT_TYPES` set that is
   **duplicated twice** (live path ~line 1876, echo path ~line 600) and coerces anything
   unknown to `'text'`.
3. `src/types/index.ts` — the `ContentType` union.

The current allowed set is 8 values: `text, image, document, audio, video, location,
template, interactive`.

That duplication is why `sticker` silently became `image`, and why a `contacts` message
from a customer lands as the literal text `[Unsupported message type: contacts]`.

**Phase 0 collapses the three lists into one exported constant** that the migration
comment, the webhook, and the types all reference. Everything else in this plan gets
cheaper and safer once that exists.

---

## 3. Phase 0 — foundation (do this first)

**Migration `075_message_types_and_metadata.sql`**

```sql
-- content_type widening. Postgres has no ALTER CHECK, so drop + re-add
-- (same pattern as migrations 010 and 069).
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text','image','document','audio','video','location','template','interactive',
    'sticker',     -- was collapsed into 'image'; needs its own render (no bubble chrome)
    'contacts',    -- contact cards, in and out
    'unsupported'  -- poll / live location / view once: honest placeholder, not fake text
  ));

-- Location, as coordinates rather than a sentence.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_name    TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_address TEXT;

-- Contact cards: Meta's contacts[] array, stored verbatim so re-render is lossless.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contacts_payload JSONB;

-- Message info. `status` is a single enum today, so "delivered at 6:11, read at 6:13"
-- is unanswerable — the transition is overwritten each time.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- Media metadata we currently throw away (`void mediaType` in the webhook).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_filename  TEXT;

-- Forward provenance. Our own bookkeeping: Meta cannot mark a message as
-- forwarded on the recipient's phone, so this only ever means "we re-sent this".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID
  REFERENCES messages(id) ON DELETE SET NULL;
```

**New file `src/lib/whatsapp/content-types.ts`** — one exported list, imported by the
webhook (both paths), the types, and the send validator. Delete both inline
`ALLOWED_CONTENT_TYPES` sets.

**Webhook status handler** — set `sent_at` / `delivered_at` / `read_at` alongside
`status`. Guard each with "only if not already set", because Meta can redeliver a
webhook and a later `delivered` must not overwrite an earlier one.

Sizing: **M.** No user-visible change, unblocks everything below.

---

## 4. Phase 1 — read receipts and typing indicator

The highest-value item, and the only one on this list that is currently **invisibly
broken**: the CRM never tells Meta a message was read, so customers never see blue
ticks no matter how fast an agent replies. In WhatsApp Web, opening a chat does this.

Both use the same endpoint:

```jsonc
// Mark read (blue ticks). Within 30 days of receipt.
// Marking one message also marks earlier ones in the conversation.
POST /{phone_number_id}/messages
{ "messaging_product": "whatsapp", "status": "read", "message_id": "<wamid>" }

// Same call plus a typing indicator. Auto-dismissed on reply or after 25s.
{ "messaging_product": "whatsapp", "status": "read", "message_id": "<wamid>",
  "typing_indicator": { "type": "text" } }
```

Work:

- `src/lib/whatsapp/meta-api.ts` — add `markMessageRead()` and `sendTypingIndicator()`.
- `POST /api/whatsapp/conversations/[id]/read` — resolve the newest inbound wamid, call
  Meta, then zero `unread_count`. Wire into the existing "conversation opened" path.
- Typing indicator on two triggers: the agent starts typing in the composer (debounced,
  fired at most once per 20s per conversation — the indicator lasts 25s, so re-firing
  more often is wasted quota), and immediately before an AI auto-reply generates
  (`src/app/api/ai/autoreply/[conversationId]/route.ts`), which is exactly the "this
  will take a few seconds" case Meta recommends it for.
- Only fire when a real reply is coming. Meta explicitly warns against showing the
  indicator otherwise, and it costs customer trust.
- Error 131009 means a bad wamid — log and swallow. A failed read receipt must never
  block opening a conversation.

Sizing: **S.** Biggest perceived-quality win per line of code in this document.

---

## 5. Phase 2 — location

Three separate pieces, all cheap once Phase 0 lands.

**Send a pin** (`type: location`, lat/lng required, name/address optional):

```jsonc
{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "<phone>",
  "type": "location",
  "location": { "latitude": "37.4421", "longitude": "-122.1615",
                "name": "Philz Coffee", "address": "101 Forest Ave, Palo Alto" } }
```

**Ask the customer for theirs** (`interactive.location_request_message`) — WhatsApp Web
has no equivalent; this is the API being *better* than the client. Renders body text plus
a Send location button, and the reply arrives as an ordinary `location` message carrying
`context.id` pointing at our request:

```jsonc
{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "<phone>",
  "type": "interactive",
  "interactive": { "type": "location_request_message",
                   "body": { "text": "Where should we deliver?" },
                   "action": { "name": "send_location" } } }
```

**Render inbound properly.** Today `parseMessageContent` destroys the payload:

```ts
// current — coordinates flattened into a display string, unrecoverable
const locationText = [loc.name, loc.address, `${loc.latitude},${loc.longitude}`]
  .filter(Boolean).join(' - ')
```

Store the four fields in their own columns, then render a static map thumbnail with an
"Open in Maps" link. Note the map tile provider is a **new third-party dependency and a
possible cost** — start with a plain card (pin icon, name, address, coordinates,
`https://maps.google.com/?q=lat,lng` link) and add tiles only if asked. A card with a
working link beats a broken tile.

Files: `meta-api.ts` (2 senders), `send-message.ts` (`VALID_MESSAGE_TYPES` +
`location` branch + validation), webhook parser, `message-bubble.tsx` (location branch),
composer attach menu (a small pick-a-location dialog), `src/types/index.ts`.

Sizing: **M.**

---

## 6. Phase 3 — contact cards

The best fit in this whole list, because the CRM already *is* a contact database.
"Send a contact" should open our own contact picker, not a blank form.

Outbound (`type: contacts`, up to 257 per message, `name.formatted_name` required):

```jsonc
{ "messaging_product": "whatsapp", "to": "<phone>", "type": "contacts",
  "contacts": [ { "name": { "formatted_name": "Barbara J. Johnson",
                            "first_name": "Barbara", "last_name": "Johnson" },
                  "phones": [ { "phone": "+16505559999", "type": "Mobile",
                                "wa_id": "16505559999" } ],
                  "org": { "company": "Lucky Shrub" },
                  "emails": [ { "email": "b@luckyshrub.com", "type": "Work" } ] } ] }
```

One behaviour worth knowing: include `wa_id` and the recipient gets **Message** and
**Save contact** buttons; omit it and both are replaced by **Invite to WhatsApp**. Since
every row in our `contacts` table has a phone number we believe is on WhatsApp, we should
send `wa_id` — that is the difference between a useful card and a dead end.

Inbound is a **live bug to fix**, not a new feature: `type: contacts` has no case in
`parseMessageContent`, so it falls to the default and stores the literal string
`[Unsupported message type: contacts]`, losing every name and number. (The history
importer *does* handle it — the live path was simply never updated to match.) Store the
array in `contacts_payload` and render a proper card with an "Add to contacts" action
that creates a CRM contact. That last part is a genuine workflow win: a customer
forwarding you their colleague's card becomes a contact in one click.

Sizing: **M.**

---

## 7. Phase 4-6 — emoji picker, stickers, forward

**Emoji picker (S).** Two places: composer insertion, and replacing the 6 hardcoded
`QUICK_EMOJIS` in `message-actions.tsx` with a full picker (keep the 6 as the fast path,
add a "+" that opens the full set — which is exactly WhatsApp's own layout in screenshot
3). Pick a data-only library and render with our own components rather than adopting a
prebuilt picker whose styling we then fight; the emoji list is the valuable part.

**Stickers (S-M).** `type: sticker`, and the constraints are strict: **WebP only**,
static ≤ 100 KB, animated ≤ 500 KB. Meta recommends an uploaded media ID over a link.
Two decisions:
- Enforce format and size **client-side before upload**, with a clear message. A rejected
  sticker otherwise surfaces as an opaque Meta error.
- Give `sticker` its own `content_type` and bubble branch — a sticker renders with no
  bubble chrome and a transparent background. Collapsing it into `image` (what we do
  today) is why inbound stickers look like tiny photos in a grey box.
- Optional follow-on: an account-level sticker library in `chat-media`, so agents reuse
  approved stickers instead of hunting for files.

**Forward (M) — and be honest about it.** There is no forward API. What we can do is
re-send the same content to another conversation. The recipient sees a normal new
message with **no "Forwarded" label**, because only a real WhatsApp client can set that.

- Text / location / contacts: rebuild the payload from our columns and send.
- Media: inbound media lives only as a Meta media ID behind our proxy. Download through
  `/api/whatsapp/media/[mediaId]`, re-upload to the `chat-media` bucket, send by link.
  (Re-sending the inbound media ID directly may work within the same phone number and
  would skip the round trip — treat it as an optimisation to verify, not the primary
  path, because a silent failure here loses the attachment.)
- Templates: cannot be forwarded as a template; offer the body as text or the template
  picker instead.
- UI: multi-select in the thread → pick conversations → confirm. Record
  `forwarded_from_message_id` so the CRM's own thread shows the provenance even though
  the customer's phone cannot.
- Label the button **Send to another chat** rather than *Forward* if we cannot show the
  forwarded marker. Calling it Forward promises WhatsApp semantics we do not deliver.

---

## 8. Phase 7 — star, pin, message info, delete

All local-only. No Cloud API involvement, which also means **none of it is visible to the
customer** — worth saying plainly in the UI so nobody assumes pinning a message does
something on the customer's phone.

- **Star** — per-user bookmark. New table `message_stars (message_id, user_id)`, not a
  boolean on `messages`: two agents starring the same message are two independent facts,
  and a shared boolean would let one agent silently un-star another's. Plus a
  "Starred" filter in the inbox.
- **Pin** — one pinned message per conversation (`conversations.pinned_message_id`),
  shown in a strip above the thread. Team-wide, unlike star: pinning is how you say
  "this is the address we agreed" to colleagues.
- **Message info** — a panel showing sent / delivered / read timestamps from the Phase 0
  columns, plus the failure block that already exists, plus the wamid and `fbtrace_id`
  for support tickets. Cheap, and it kills a class of "did they actually see it?"
  questions.
- **Delete.** Two different things behind one word:
  - *Delete for everyone* — **impossible.** No Business API exposes it. The customer's
    phone keeps the message forever. In Coexistence the business owner can delete from
    their phone and we already ingest the `revoke` and set `deleted_at`.
  - *Delete for me* (hide from the CRM thread) — buildable, and honest if labelled
    exactly that. Soft-hide, reversible, audit-logged.
  - The menu must not offer a bare "Delete" that only hides locally. That is the same
    class of mistake as the old "Skip all": an action that looks destructive-and-global
    but is neither.

---

## 9. Phase 8 — honest limitation cards

Meta does not forward polls, live location, view-once media, or disappearing messages to
Business API clients. They arrive as `unsupported`, or not at all. Today those render as
`[Unsupported message type: poll]` in muted italics, which reads like *our* bug.

Replace with a card that says what happened, that it is a WhatsApp platform limit, and
what to do:

> **Poll** — WhatsApp does not send polls to business platforms. Ask the customer to
> reply with their choice, or send an interactive list instead.

> **Live location** — WhatsApp does not share live location with business platforms.
> Tap *Request location* to ask for a one-time pin.

That last line is a working button, thanks to Phase 2. This is the difference between a
limitation and a dead end. Store these as `content_type: 'unsupported'` with the original
Meta type kept, so the copy is chosen by data rather than by string-matching a bracketed
sentence.

Sizing: **S.**

---

## 10. Explicitly not building, and why

| Feature | Reason |
| --- | --- |
| Live location | Not delivered to the Cloud API. Substitute: location request. |
| Polls | Cannot send; inbound not delivered. Substitute: interactive list. |
| Events | No API surface. |
| View once / disappearing | Not delivered. |
| Groups | The Send-messages doc mentions `recipient_type: "group"`, but group messaging is not generally available and needs verification against our own WABA before any work starts. Treated as unverified. |
| Catalogue / product messages | Real API, but requires a Meta commerce catalog connected to the WABA plus product inventory sync. That is a separate feature with its own data model, not an inbox button. |
| "Add text to note" (screenshot 3) | Not a WhatsApp feature — it is a WhatsApp *client* note. We already have contact notes; wiring "quote this message into a note" is a small local win if wanted. |

---

## 11. Suggested order

1. **Phase 0** — foundation. Everything else depends on it.
2. **Phase 1** — read receipts + typing. Smallest change, largest customer-visible effect,
   and it fixes something already broken rather than adding surface.
3. **Phase 3** — contact cards. Fixes a live data-loss bug in the same stroke.
4. **Phase 2** — location, including the coordinate-loss fix.
5. **Phase 8** — limitation cards. Cheap, and stops the inbox looking buggy.
6. **Phase 4** — emoji picker.
7. **Phase 7** — star / pin / message info / delete-for-me.
8. **Phase 5** — stickers.
9. **Phase 6** — forward. Last: most UI, most caveats, least certain semantics.

Phases 0 and 1 together are the highest-leverage work here. Phase 1 in particular is not
"parity" at all — it is a customer-facing defect that has been silently live.

## 12. Verification for each phase

- `npx tsc --noEmit`, `npx vitest run`, `npx eslint`, `npm run build` — the existing bar.
- Every new Meta sender gets a unit test against a mocked fetch asserting the exact
  documented payload shape, since a wrong field name fails only at send time in
  production.
- Every new inbound type gets a webhook parser test with a payload copied from Meta's
  docs.
- Manual send to `+91 78619 02341` (the connected Coexistence number) before calling any
  phase done. Cloud API accepting a payload does not prove the handset renders it.
