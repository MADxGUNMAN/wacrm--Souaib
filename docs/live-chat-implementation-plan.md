# Live Chat (Customer ↔ Super Admin) — Implementation Plan

## The Headline Finding

You already own about 70% of this. Four systems exist and are in daily production use:

| What you need | What already exists | Reusable? |
| :--- | :--- | :--- |
| **Live message delivery** | Supabase Realtime `postgres_changes`, 7 tables published, RLS-scoped per subscriber | Directly |
| **Online / away / offline + "last seen 5 days 14 hours ago"** | `member_presence` + `touch_presence` RPC + `usePresence` hook + `derivePresence`/`formatLastSeen` (unit tested) | Directly |
| **Voice notes** | `opus-recorder` vendored, records Ogg/Opus in-browser, no server transcode | With one fix (below) |
| **Attachments** | Presigned browser → S3, `signableHeaders` pinning type + length, `validateUploadRequest` | With a new folder |
| **Chat UI** | `message-bubble.tsx`, `message-composer.tsx`, `reply-quote.tsx`, `emoji-picker` | Pattern, not import |

So this is mostly assembly plus one new table pair, not a greenfield build.

---

## Problem Statement

Today a customer with a problem messages you on WhatsApp personally and you answer on WhatsApp. That doesn't scale, has no record inside the product, and mixes your personal number into support. Replace it with an in-app chat: a **Live chat** pane in the customer's Settings, and a matching inbox in Super Admin.

---

## Architecture: The One Decision Everything Else Follows From

**Both sides must read and write through RLS, not the service-role client.**

That's a deliberate departure from this repo's usual pattern, where super-admin reads go through `supabaseAdmin()` and bypass RLS. It's forced by Realtime: Supabase re-evaluates the subscriber's own JWT against RLS on every row change before emitting it. A service-role read on the server cannot make a browser subscription work.

Your own codebase already discovered this and documented it — `20260921180000_member_presence_super_admin_read.sql` exists for exactly this reason, and its header says so. So the pattern is established, not invented here: one permissive policy per audience, OR'd, never one compound predicate.

```text
support_messages
├── policy: tenant    USING (is_account_member(account_id))
└── policy: operator  USING (is_super_admin_user())  TO authenticated
```

`TO authenticated` on the operator policy is load-bearing. `is_super_admin_user()` has EXECUTE revoked from anon, so an unrestricted policy makes anonymous reads fail with `permission denied for function` instead of returning zero rows. That exact trap is already documented in the presence migration.

---

## Data Model

Two tables, mirroring the conversations / messages split you already have:

### 1. `support_conversations`
* `id`
* `account_id` (unique, one row per account)
* `last_message_at`
* `last_message_preview`
* `unread_for_account`
* `unread_for_admin`
* `status` (`open` / `closed`)
* `created_at`
* `updated_at`

> **Note on counters:** Two separate unread counters because "unread" is a different question for each side. One shared counter is the bug that makes a badge lie.

### 2. `support_messages`
* `id`
* `conversation_id`
* `account_id` (denormalised so RLS is a single-table predicate — no join in a hot policy)
* `sender_kind` (`account` | `admin`)
* `sender_user_id`
* `content_type` (`text` | `image` | `document` | `audio`)
* `content_text`
* `media_url`
* `media_filename`
* `media_mime_type`
* `media_size_bytes`
* `reply_to_message_id`
* `read_at`
* `deleted_at`
* `created_at`

Both get **`REPLICA IDENTITY FULL`** — your notifications migration documents why: without it, Realtime UPDATE payloads carry only the PK, so you can't tell whether a row was unread before the change.

### Status Model
Honestly: **sent** (row exists) and **read** (`read_at` set). I will not add a "delivered" tick. In-app there's no delivery event distinct from insert, and a tick that always means the same as the previous tick is decoration pretending to be information.

---

## What I'm Deliberately NOT Copying from the Inbox

You asked for the inbox's useful features only. Dropping, with reasons:

* **24-hour session window** — a Meta billing rule. Meaningless between you and your customer.
* **Templates, template picker, TemplateMessage** — Meta approval artefacts.
* **AI draft / AiThreadBanner** — you're answering your own customers; a model drafting your support replies is a different product decision.
* **Quick replies, interactive messages (buttons/lists/CTA), contact cards, location pins, stickers** — all WhatsApp-surface features.
* **Forward, star, pin** — forward has nowhere to go; star and pin are inbox triage for hundreds of threads.
* **Assign dropdown, conversation status open/pending/closed on the customer side** — no team on the admin side of this.
* **Broadcast tab, campaign filters, rowPreview broadcast logic** — no campaigns here.

**Keeping:** text with `whitespace-pre-wrap`, images with lightbox, documents, voice notes, emoji picker, reply/quote, day separators, relative timestamps, read ticks, auto-scroll with prepend-position restore, "Load earlier messages" paging, hover actions limited to Reply / Copy / Delete for me.

---

## Security

* **Text sanitization:** Text needs no sanitiser and must not get one. React escapes text children, and every message branch in `message-bubble.tsx` renders `{message.content_text}` as a plain child. There is no `dangerouslySetInnerHTML` anywhere near user text in this repo, and no DOMPurify dependency. I'll keep that property. Validation is: length cap (4096, matching `TEXT_MESSAGE_MAX`), control-character strip, reject empty-after-trim.
* **Avoid `notes.ts`:** One thing to explicitly avoid: do not reuse `notes.ts`. Its `CODE_PATTERNS` array rejects text containing `function`, `const`, backticks, `{...}` blocks, `document.`, `SQL`, and `javascript:`. That's right for a contact note and catastrophic for a support chat — the first thing a customer does is paste an error message or a JSON payload. Rejecting that makes the feature useless for its actual purpose.
* **No linkifier:** The repo has none today, and URLs render inert with `break-words`. I recommend keeping it that way in v1. Auto-linking arbitrary customer-supplied text is a phishing surface for whoever clicks, and `break-words` already exists so long URLs wrap rather than break layout.
* **Rate limiting:** New `RATE_LIMITS.supportChat` bucket, per user. Also worth noting — `POST /api/storage/presign` currently has no rate limit at all, which means the attachment path is uncapped today for every existing feature too.

---

## Phases

### Phase 1 — Foundation and live text chat
*The whole vertical slice, text only, both directions.*

* **Migration:** both tables, per-audience RLS policies, indexes, realtime publication, `REPLICA IDENTITY FULL`.
* **`src/lib/support-chat/`:** types, validation, a `findOrCreateConversation` helper.
* **API:** `POST .../send`, `GET .../messages` (paged, newest-first then reversed, 300-row page — same shape as the inbox, which has a documented PostgREST 1000-row truncation bug it solved this way), `POST .../read`.
* **Customer:** new `live-chat` Settings section. Note the id has exactly one hyphen — `canAccessSettingsSection` derives the permission key with `section.replace('-', '_')` and `String.replace` swaps only the first match, so `live-chat` → `settings_live_chat` correctly, while `live-support-chat` would derive the broken `settings_live_support-chat` and never match. Your codebase documents this trap on `opt-out`.
* **Super admin:** new nav group with a conversation list + thread.
* **Realtime subscriptions:** both sides, with the reconnect/visibility resync token pattern the inbox already uses.
* **Presence:** super admin sees the customer's online/away/offline + last seen using the existing system unchanged — `usePresenceForAccount(accountId)` plus the existing super-admin SELECT policy already does this.
* **Demo:** customer types in Settings → Live chat, it appears in Super Admin instantly and vice versa; admin sees the customer online, and "last seen 20 minutes ago" after they close the tab.

### Phase 2 — Images, documents, screenshots
* **Folder setup:** New `support-chat` folder in `ALLOWED_UPLOAD_FOLDERS` + `ACCOUNT_SCOPED_FOLDERS`.
* **MIME & size limits:** Per-kind size/MIME limits; accept `image/png`, `image/jpeg`, `image/webp`, `image/gif` and the document set.
* **Drafts & cleanup:** Media draft preview with caption, discard GCs the S3 object.
* **Clipboard paste for screenshots:** `Ctrl+V` an image straight into the composer. This is the single highest-value addition for support and the inbox does not have it (its `handlePaste` only checks text length).
* **Hardening:** Rate limit on presign.
* **UI:** Lightbox reuse.
* **Demo:** paste a screenshot, send a PDF, both render inline.

### Phase 3 — Voice notes
* **Audio recording:** Reuse the vendored `opus-recorder` flow verbatim: lazy `import('opus-recorder')`, `encoderApplication: 2048` (VOIP), 5-minute auto-stop, cancel discards the encoded bytes.
* **The one real fix:** The inbox records Ogg/Opus, which is correct because Meta renders it on a phone. Here it plays in an in-app `<audio>` element, and Safari/iOS historically does not play Ogg containers. I'll feature-detect with `MediaRecorder.isTypeSupported` and fall back to `audio/mp4` on Safari, with a download link as the last resort. Worth verifying on a real iPhone rather than trusting a support table.
* **Demo:** record and play both directions, including on Safari.

### Phase 4 — Unread, notifications, polish
* **Unread badges:** A dot on the Settings rail item and on the Super Admin nav item. Neither exists today — the green dot in your screenshots is just the active-page marker (`{active && nested && <span …>}`), backed by no fetch.
* **Super-admin bell:** Widen the type CHECK, add an AFTER INSERT trigger calling `fn_sa_notify`, which the existing badge store picks up over its existing subscription.
* **Customer notifications:** Customer-side in-app notification via the existing `notifications` table.
* **Message interactions:** Reply/quote, delete-for-me, load-older paging.
* **Optional:** Typing indicator via Supabase Realtime Broadcast — a mechanism this repo uses nowhere yet, so it's genuinely new surface.
* **Optional:** Customer sees whether support is online. Needs a heartbeat mounted in the super-admin shell (there is none today — `PresenceHeartbeat` mounts only in `dashboard-shell.tsx`) plus a policy letting tenants read that one row.

---

## Risks I'd Flag Now

1. **S3 Bucket Public-Read Policy:** Your S3 bucket is public-read by bucket policy so Meta can fetch media. Every support attachment would therefore be readable by anyone with the URL. For WhatsApp media that's unavoidable; for in-app support chat it isn't, and support screenshots are exactly where customers paste API keys and other people's data. See decision 1.
2. **Presence Drift:** `member_presence` in production has `custom_status` and `updated_at` columns that no committed migration creates. `touch_presence` writes `custom_status`. A database rebuilt purely from `supabase/migrations/` would get a table without that column and the RPC would fail at runtime. This doesn't block the feature, but it's a live landmine worth a separate fix.
3. **Dead Code:** `message-thread.tsx` calls `usePresence()` and imports `PresenceDot`, but renders neither — so every open thread pays for a presence subscription and shows nothing.

---

## Three Decisions I Need From You

### [1]: Attachment privacy — how should support-chat files be served?
* **a. Public S3 URLs** — same as the inbox. Simplest, zero new code, but anyone with the link can read the file forever.
* **b. Presigned GET URLs, short-lived (Recommended)** — new pattern in this repo, keeps screenshots private. My recommendation, given what customers paste into support.
* **c. Proxy route with an auth check** — most control, most code, and it puts file bytes back through nginx (1 MB cap territory).

### [2]: Who on the customer side can use Live chat, and is the thread shared?
* **a. One thread per account, visible to any member with Settings access (Recommended)** — a workspace support channel; member A sees member B's conversation with you. Each message still stamped with its author.
* **b. One thread per account, owner-only** — must be added to `OWNER_ONLY_SETTINGS_SECTIONS`, otherwise every existing member inherits access, because a missing permission key means ALLOW and stored permission rows are never migrated.
* **c. One thread per user** — private per member, but you get N threads per account to triage.

### [3]: Voice notes in Phase 3, or sooner?
* **a. Phase 3 as planned (Recommended)** — text first, attachments second, voice third.
* **b. Fold into Phase 2** — one composer rebuild instead of two.
* **c. Drop voice notes** — text and screenshots cover most support, and it removes the Safari codec problem entirely.

---

*Answer as briefly as 1=b, 2=a, 3=a, or tell me your own. Does the phasing otherwise look right, or would you like me to adjust anything before I start?*
