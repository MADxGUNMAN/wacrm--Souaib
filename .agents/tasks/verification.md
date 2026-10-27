# Verification — Fixes 1–3 (broadcast replies missing), iteration 1

Run on 2 Oct 2026 in `d:\Junkies Coder\whatsapp-crm-nextjs`, working tree only. Nothing committed, pushed or deployed. Scrum and sheet not touched.

## Commands and results

| # | Command | Result |
|---|---|---|
| 1 | `npx tsc --noEmit 2>&1 \| Select-String -Pattern "^src[/\\].*error TS"` | No output (0 `src/` errors). Run after the last source edit. |
| 2 | `npx vitest run` | **157 files / 2100 tests, all passed.** (AGENTS.md's "1151 / 100" is stale; net +5 tests from the dedupe rewrite: 3 old `findExistingContact` cases → 6, plus 2 `findContactByNormalizedPhone`.) |
| 3 | `npx eslint src/lib/contacts/dedupe.ts src/lib/contacts/dedupe.test.ts src/app/api/whatsapp/webhook/route.ts src/app/api/whatsapp/broadcast/route.ts src/hooks/use-broadcast-sending.ts src/lib/whatsapp/broadcast-core.ts src/lib/whatsapp/broadcast-recipient-status.ts src/lib/services/fake-db.test-helper.ts` | 0 errors, 1 warning: `webhook/route.ts:4 'downloadMedia' is defined but never used` — pre-existing import on a line not touched. |
| 4 | `npx prettier --write <same 8 paths>` | `dedupe.ts` and `dedupe.test.ts` reformatted whole-file (they used double quotes; project Prettier config is single quotes). `webhook/route.ts`, `broadcast/route.ts`, `use-broadcast-sending.ts` reformatted only around the edits (+1 cosmetic re-wrap of an existing `as string \| null \| undefined` cast in `findOrCreateContact`). Others unchanged. |
| 5 | `$env:NEXT_DIST_DIR=".next-verify"; npm run build` | Exit 0, full route table emitted. Side effect: Next appended `.next-verify/types/**` entries to `tsconfig.json`; reverted with `git checkout -- tsconfig.json`. |

## Test-run regression found and fixed

The first full `vitest run` failed 1 test: `src/lib/services/phase7.test.ts > send_template_message > a known number goes to its existing contact`.

- Cause: `src/lib/services/fake-db.test-helper.ts` stores fixture rows as given, so `contacts.phone_normalized` (a GENERATED column in Postgres) did not exist. The new exact lookup `.eq('phone_normalized', …)` therefore missed.
- Fix: the helper's `field()` derives `phone_normalized` from `phone` with `/\D/g` when the row has no such key, which is what migration 022 does.
- This is a test-helper change, not a new test file. After it, all 2100 passed.

## Throwaway scratch check (deleted)

`scratch/vitest.scratch.config.ts` + `scratch/fix23.check.ts`, run with `npx vitest run --config scratch/vitest.scratch.config.ts`: **13/13 passed**. Both files then deleted (`Test-Path` → False for each). The in-memory stub evaluates `eq/neq/is/in/like('%x')/limit` and applies `update` patches, with `phone_normalized` derived as in migration 022.

Cases covered:

- Formatted `+238 988 48 84` is found for incoming `2389884884` and `+2389884884`.
- Trunk-zero variants in both directions: stored `+370 63 949 836` matches incoming `370063949836`, and stored `+91 98765-43210` matches incoming `9109876543210`.
- Numbers under 8 digits: an exact `123456` hit, `23456` gives null, and no `like` query is ever issued.
- Account isolation: `+226 72 36 23 25` in account B is not found from A but is found from B. Every contacts query carried `eq account_id`.
- The 23505 recovery key (`findContactByNormalizedPhone`) finds the formatted row from logged drop #1 and is account-scoped.
- An exact-step DB error is logged (`[dedupe] exact contact lookup failed`) and falls through to the suffix step.
- `stampRecipientSent`:
  - A pending row gets wamid, `sent_at` and `sent`.
  - A delivered row with no wamid gets the wamid and stays `delivered`.
  - A failed row that already has the wamid is untouched.
  - A row with a different wamid is untouched.
  - Statement A carries `is whatsapp_message_id null`. Statement B carries `eq status pending` and `eq whatsapp_message_id <w>`.
  - The `contact_id` key is used only without `recipientId`, and another broadcast's row is untouched.
  - No key means no query.
- The predecessor predicate (a copy of the route's ladder logic): delivered → `[pending, sent, skipped]`; read → `[pending, sent, delivered, skipped]`; failed → `[pending, sent]`. This matches today's `isValidStatusTransition` exactly.

## Caller re-check for `findExistingContact` (signature and return shape unchanged)

Each caller was read after the change:

- `webhook/route.ts` `findOrCreateContact` (used by processMessage, processEcho and ingestHistoryThread) and `handleAppStateSync` (`alreadyKnown`): these pass digits or the raw staged phone. Both now resolve formatted rows.
- `resolve-conversation.ts:91` and `:121`: pass `sanitized` digits. `resolve-conversation.test.ts` passes unchanged.
- `services/messaging.ts:531`: passes `digits`. `phase7.test.ts` passes after the helper fix above.
- `api/v1/contacts.ts:140` and `:161`: pass `sanitized`. `contacts.test.ts` passes unchanged.
- `coexistence/contacts/route.ts:609`: session client. That route already queries `phone_normalized` through the same client, so the column is exposed and readable under RLS.
- `contact-form.tsx:152` and `:321`: browser client, new contacts only (`if (isEdit) return`), so a contact can never match itself.

## Not verified here

- No live DB or Meta run. Behaviour against real PostgREST (for example `broadcasts!inner` filtering, the `.in('status', …)` predicate, RLS on the stamp writes) is inferred from existing code that uses the same constructs (`flagBroadcastReplyIfAny` uses `broadcasts!inner(account_id)` + `.eq('broadcasts.account_id', …)`; the hook already writes `broadcast_recipients` under the same session RLS).
- `handleStatusUpdate` and `findOrCreateContact` are not exported, so they were exercised only through their helpers. The route-level wiring was verified by reading the code, tsc and the build.
