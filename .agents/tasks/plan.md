# Implementation Plan — broadcast replies missing (Fixes 1–3) + Fix 4 read-only counts

Root cause: `.agents/tasks/broadcast-replies-missing-2026-10-02.md`.
Work directly in `d:\Junkies Coder\whatsapp-crm-nextjs` (no worktree).

Hard constraints for every step:
- Do NOT commit, push, deploy, or touch the production server.
- Do NOT write to `d:\Junkies Coder\Scrum.txt` or any sheet. The user deferred all logging until the fix is verified; that overrides the AGENTS.md "log every task" rule for this task.
- Do NOT add new test files. The one test change in scope is updating `src/lib/contacts/dedupe.test.ts`. Throwaway checks go in `/scratch` (gitignored) and get deleted afterwards.
- No new migration (decision under Fix 2).
- Never run `next build` into `.next`. Always build with `$env:NEXT_DIST_DIR=".next-verify"`.

## Facts confirmed while planning (no need to re-derive)

- `contacts.phone_normalized` comes from migration `022_contact_phone_dedup.sql`:
  `GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED`.
  - That is the same transform as `normalizePhone()` in `src/lib/whatsapp/phone-utils.ts` (`phone.replace(/\D/g, '')`).
  - Unique index `idx_contacts_account_phone_normalized ON contacts (account_id, phone_normalized) WHERE phone_normalized <> ''`.
  - `src/app/api/whatsapp/coexistence/contacts/route.ts` already queries it with `.in('phone_normalized', …)` through a session client, so PostgREST and RLS expose it.
- All three webhook contact-creating paths go through the one `findOrCreateContact` (`webhook/route.ts` ~2810):
  - `processMessage` (~2216)
  - `processEcho` (~652)
  - `ingestHistoryThread` (~1287)

  Each does `if (!contactOutcome) return`. Fixing `findOrCreateContact` fixes all three.
- `handleAppStateSync` (~1498) calls `findExistingContact` directly for `alreadyKnown`. Fix 1 covers it.
- `POST /api/whatsapp/webhook` returns 200 BEFORE processing (`after()`, ~327–335). A contact-resolution failure therefore cannot make Meta retry. "Loud" can only mean logging or persistence.
- `record_webhook_failure` (migration 028, `src/lib/webhooks/deliver.ts:151`) is a consecutive-failure counter for OUTBOUND subscriber endpoints (`endpoint_id`, auto-disable). It is NOT an inbound-failure log, and no inbound error/dead-letter table exists.
- `broadcast_recipients`:
  - status CHECK is `pending|sent|delivered|read|replied|failed|skipped`. There is NO `queued`, so "still pending" means `status = 'pending'`.
  - Unique partial index on `whatsapp_message_id`.
  - No unique constraint on `(broadcast_id, contact_id)`.
  - RLS `broadcast_recipients_modify` = account member (`'agent'`) of the parent broadcast. This is the same session RLS the client hook already writes under, so the server route's session client can do the same write.
  - Counts are maintained incrementally by trigger (migration 005). A status change moves counts automatically; an update that leaves status unchanged moves nothing.
- Server send paths:
  - `src/app/api/whatsapp/broadcast/route.ts` (wizard / client flow): calls `persistBroadcastMessage` but never touches `broadcast_recipients`. This is the race.
  - `src/lib/whatsapp/broadcast-core.ts` `deliverBroadcast` (public API + scheduled cron): already writes the recipient row BEFORE `persistBroadcastMessage`, with an unconditional `status:'sent'` update.
- `persistBroadcastMessage` (`src/lib/whatsapp/broadcast-inbox.ts`) writes `messages.broadcast_id` and `message_id = wamid`. The comment in `handleStatusUpdate` (~2024–2032) saying "a broadcast send never creates a messages row" is stale.
- Existing `src/lib/whatsapp/resolve-conversation.test.ts` stub:
  - returns `{data: [], error: null}` from `.limit()` for non-conversation tables
  - scripts `.like()` per call

  The new exact-then-suffix lookup behaves as "exact miss, then suffix hit/miss" there, so those tests should pass unchanged. Do not edit them unless they actually fail.

---

## Fix 1 — `findExistingContact` on `phone_normalized`

- [ ] 1. Rewrite the lookup in `src/lib/contacts/dedupe.ts` to query the generated column. Keep the exported signature `findExistingContact(db, accountId, phone): Promise<ExistingContact | null>` and the return shape.

  Add and export a new helper:

  ```ts
  /** Exact lookup on the generated digits-only column (migration 022), the
   *  same key the unique index enforces. Returns the error separately so a
   *  caller can tell "not found" from "lookup failed". */
  export async function findContactByNormalizedPhone(
    db: SupabaseClient, accountId: string, phone: string,
  ): Promise<{ contact: ExistingContact | null; error: { code?: string; message: string } | null }>
  ```

  - `const key = normalizePhone(phone)`. If `!key`, return `{ contact: null, error: null }` WITHOUT querying.
  - Query: `db.from("contacts").select("*").eq("account_id", accountId).eq("phone_normalized", key).limit(1)`, then take `data?.[0] ?? null`.
    - Use `.limit(1)`, not `.maybeSingle()`. The index makes duplicates impossible, but a 2-row response should never become an error that reads as "not found".

  New body of `findExistingContact`:
  1. `normalized = normalizePhone(phone)`. If empty, return null with no query (unchanged).
  2. Exact step: `findContactByNormalizedPhone`. If it returns a contact, return it.
     - On `error`, `console.error('[dedupe] exact contact lookup failed', { accountId, phone: normalized, code, message })` and fall through to the suffix step. That keeps today's "error → treated as not found" contract, but it is no longer silent.
  3. Suffix fallback, only when `normalized.length >= 8`:
     - Query: `db.from("contacts").select("*").eq("account_id", accountId).like("phone_normalized", `%${normalized.slice(-8)}`)`.
     - Then `find((c) => phonesMatch(c.phone, phone)) ?? null`, as today.
     - On error, log as in step 2 and return null.
     - Rationale for skipping below 8 digits: `phonesMatch` can only return true by exact equality when either side has fewer than 8 digits, and step 2 already covered exact equality. So the query could never add a match.
     - The pattern is digits only, so it contains no `%` or `_` metacharacters. No escaping needed.

  Update the doc comment (header and function) to say the lookup is on `phone_normalized`, and why: raw `phone` stored formatted (`+238 988 48 84`) never LIKE-matched its own last 8 digits, which is the 2 Oct incident.

  Files: `src/lib/contacts/dedupe.ts`
  Verify: `npx tsc --noEmit 2>&1 | Select-String -Pattern "^src[/\\].*error TS"` shows no new errors (step 2 runs the tests).

- [ ] 2. Update `src/lib/contacts/dedupe.test.ts` so the `findExistingContact` stub ASSERTS columns and patterns, per AGENTS.md §4. Replace the `stubDb` that ignores arguments with an in-memory evaluator:
  - Rows carry `{ id, account_id, phone }`. The stub derives `phone_normalized = phone.replace(/\D/g, '')`, mirroring the generated column.
  - Every `from()` returns a fresh builder that records each call as `[method, column, value]` into a shared `calls` array:
    - `eq(col, val)` filters rows by `row[col] === val`.
    - `like(col, pattern)` requires the pattern to start with `%` and filters by `String(row[col]).endsWith(pattern.slice(1))`.
    - `select` and `limit(n)` slice as expected.
  - The builder is thenable (`then(resolve) => resolve({ data, error: null })`), so both terminals (`.limit()` and `.like()`) resolve.
  - Also count `from()` calls.

  Tests (replace the three existing `findExistingContact` cases):
  - **Incident regression.** Row `{ phone: '+238 988 48 84', account_id: 'acct' }`, input `'2389884884'`:
    - returns that row
    - `calls` contains `['eq','account_id','acct']` and `['eq','phone_normalized','2389884884']`
    - NO `like` call (exact hit short-circuits)
    - no call references column `'phone'`
  - **Trunk variant via suffix.** Row `'37063949836'`, input `'+370 063 949 836'`:
    - returns it
    - `calls` contains `['like','phone_normalized','%63949836']`
    - `account_id` eq present
  - **Account scoping.** The same number exists in `other-acct` only, so the result is null.
  - **No match.** Row `'15559999999'`, input `'+1 555-123-4567'`, so the result is null.
  - **Empty phone** `'   '` returns null with 0 `from()` calls.
  - **Short number** (fewer than 8 digits, no exact row): null, and no `like` call.

  Also add a small `describe('findContactByNormalizedPhone')`:
  - formatted stored row found by exact digits
  - `{contact:null,error:null}` for empty input with no query

  Keep the other `describe` blocks unchanged.

  Files: `src/lib/contacts/dedupe.test.ts`
  Verify: `npx vitest run src/lib/contacts/dedupe.test.ts src/lib/whatsapp/resolve-conversation.test.ts src/lib/api/v1/contacts.test.ts`. All pass.

## Fix 2 — `findOrCreateContact` never silently drops a message

Decision: NO migration. Make the failure loud with a structured, greppable log line carrying full context.

Why:
- No existing table fits. `record_webhook_failure` is an outbound-endpoint failure counter with auto-disable semantics, and reusing it would mis-model the data.
- A new table means a production migration, RLS and retention work that the user did not ask for. The user asked for these fixes "immediately".
- After Fixes 1 and 2, the only remaining way to reach this branch is the database itself failing. A DB-persisted failure row would fail in exactly that case.
- Known limitation: container logs still vanish on redeploy (report recommendation 5, out of scope). Call this out in the summary.

- [ ] 3. In `src/app/api/whatsapp/webhook/route.ts`, change `findOrCreateContact` (~2810–2920):
  - Add a 5th optional parameter `logCtx?: { source: 'inbound' | 'echo' | 'history'; waMessageId?: string }`. Pass it from:
    - `processMessage`: `{ source: 'inbound', waMessageId: message.id }`
    - `processEcho`: `{ source: 'echo', waMessageId: echo.id }`
    - `ingestHistoryThread`: `{ source: 'history' }`
  - Import `findContactByNormalizedPhone` from `@/lib/contacts/dedupe`.
  - In the `if (createError)` branch, when `isUniqueViolation(createError)`:
    - Re-resolve with `findContactByNormalizedPhone(supabaseAdmin(), accountId, phone)`. This is the exact `(account_id, phone_normalized)` key the index reported.
    - If a contact comes back, return `{ contact, wasCreated: false }`.
    - Do not run the existing name-update logic on this branch, so behaviour matches today's race branch.
  - Otherwise (any non-23505 insert error, or the re-resolve returned null or an error), replace `console.error('Error creating contact:', createError)` with one line:

    ```ts
    console.error('[webhook][contact-resolution-failed] message NOT stored', JSON.stringify({
      accountId, phone: normalizePhone(phone), source: logCtx?.source ?? 'unknown',
      waMessageId: logCtx?.waMessageId ?? null,
      insertError: { code: createError.code, message: createError.message, details: createError.details },
      reResolveError: <error from findContactByNormalizedPhone or null>,
    }));
    ```

    Then return null, as today.
    - The caller contract (`null` means skip) stays the same.
    - The stable tag `[webhook][contact-resolution-failed]` is what an operator greps for in `docker logs`.
  - Update the function's leading comment: the lookup is now on `phone_normalized` (Fix 1), and the 23505 recovery uses the exact key.

  Files: `src/app/api/whatsapp/webhook/route.ts`
  Verify:
  - typecheck as above, no new `src/` errors
  - `npx vitest run src/lib/whatsapp src/lib/contacts` passes
  - Scratch check (step 9) covers the 23505 → exact re-resolve path through `findContactByNormalizedPhone`

## Fix 3 — broadcast recipient wamid race, forward-only

Forward-only mechanism: two conditional single-statement UPDATEs, no read-then-write.
- Each predicate lives in the WHERE clause, so a concurrent status webhook can never be overwritten.
- Statement order (wamid first, status second) makes the row correlatable as early as possible.

Decision on the `handleStatusUpdate` fallback: YES, via `messages`. The data model supports it cleanly:
- `messages.broadcast_id` plus `messages.conversation_id` → `conversations.contact_id` identifies the recipient row as `(broadcast_id, contact_id)`.
- `handleStatusUpdate` already queries `messages` by `message_id` for the webhook fan-out (step 3 of that function). Hoisting that one query covers the fallback with ZERO extra queries for non-broadcast statuses.
- The fallback closes three gaps:
  - a send-time stamp that failed (logged, best-effort)
  - stale browser bundles still running the old client-side write during or after deploy
  - rows created before this fix

- [ ] 4. Create `src/lib/whatsapp/broadcast-recipient-status.ts`. Import types only; no server-only imports, because the browser hook uses this file too. It exports:

  ```ts
  export interface StampRecipientSentArgs {
    recipientId?: string | null;   // preferred: exact row
    broadcastId: string;
    contactId?: string | null;     // fallback key when recipientId is absent
    waMessageId: string;
    sentAt?: string;               // default new Date().toISOString()
  }
  export async function stampRecipientSent(db: SupabaseClient, a: StampRecipientSentArgs): Promise<void>
  ```

  Target filter:
  - `recipientId` given: `.eq('id', recipientId).eq('broadcast_id', broadcastId)`.
  - Else `contactId` given: `.eq('broadcast_id', broadcastId).eq('contact_id', contactId)`.
  - Else `console.warn` and return.

  Statement A (correlate as early as possible, set once):
  - `update({ whatsapp_message_id: waMessageId, sent_at })`, then filter, then `.is('whatsapp_message_id', null)`.
  - SQL shape: `UPDATE broadcast_recipients SET whatsapp_message_id=$w, sent_at=$t WHERE <filter> AND whatsapp_message_id IS NULL`.

  Statement B (forward-only status):
  - `update({ status: 'sent', error_message: null })`, then filter, then `.eq('status', 'pending').eq('whatsapp_message_id', waMessageId)`.
  - SQL shape: `UPDATE … SET status='sent', error_message=NULL WHERE <filter> AND status='pending' AND whatsapp_message_id=$w`.
  - The wamid predicate restricts B to the row A stamped (or one already carrying this wamid). It matters for the `contactId` key, which is not unique.
  - If a webhook already moved the row to delivered, read or failed between A and B, B matches 0 rows. That is the forward-only guarantee.

  Error handling:
  - Each statement's `error` is logged as `console.error('[broadcast] could not stamp recipient', { broadcastId, recipientId, contactId, waMessageId, code, message })`.
  - Never throw. Meta has already accepted the message, the same best-effort contract as `broadcast-inbox.ts`.

  Header comment explains:
  - the 2 Oct race (wamid written 2–26 s after send, statuses lost)
  - why two statements in this order
  - that no `queued` status exists

  Files: `src/lib/whatsapp/broadcast-recipient-status.ts` (new source file, not a test)
  Verify: typecheck clean. Behaviour is checked in the scratch run (step 9).

- [ ] 5. Write the stamp server-side at send time in `src/app/api/whatsapp/broadcast/route.ts`:
  - Add `recipient_id?: string` to `NewRecipient`, with a doc comment: lets the route stamp the exact `broadcast_recipients` row.
  - In the `if (sentMessageId)` branch, BEFORE `persistBroadcastMessage`, when `typeof broadcast_id === 'string'` and (`typeof recipient.recipient_id === 'string'` or `recipient.contact_id`), call:

    ```ts
    await stampRecipientSent(supabase, {
      recipientId: typeof recipient.recipient_id === 'string' ? recipient.recipient_id : null,
      broadcastId: broadcast_id,
      contactId: recipient.contact_id ?? null,
      waMessageId: sentMessageId,
    });
    ```

  - The session client is deliberate: RLS (`broadcast_recipients_modify`, account member of the parent broadcast) scopes it, so a caller cannot stamp another account's rows by posting foreign ids. Keep it; do NOT switch to `supabaseAdmin()`.
  - The stamp runs before the message insert, so by the time a `messages` row exists, the recipient is already correlated. That is the same order `deliverBroadcast` uses.
  - Leave the response shape unchanged.

  Files: `src/app/api/whatsapp/broadcast/route.ts`
  Verify: typecheck clean, `npx eslint src/app/api/whatsapp/broadcast/route.ts`.

- [ ] 6. Make the client hook harmless in `src/hooks/use-broadcast-sending.ts` (~688–790). The server now owns the stamp; the client keeps a forward-only belt-and-braces write.
  - In the `apiRecipients` map, add `recipient_id: r.id as string`.
  - Replace the `result.status === 'sent'` plain update (~743–753):
    - If `result.whatsapp_message_id` is present: `await stampRecipientSent(supabase, { recipientId: recipient.id, broadcastId: broadcast.id, contactId: recipient.contact?.id ?? null, waMessageId: result.whatsapp_message_id })`. This is idempotent, a no-op once the server has stamped, and can never regress a webhook-advanced row.
    - Otherwise: `update({ status: 'sent', sent_at, error_message: null }).eq('id', recipient.id).eq('status', 'pending')`.
  - Add `.eq('status', 'pending')` to every other recipient write in this loop:
    - the `!result` failed write
    - the `skipped` write
    - the `failed` write
    - the `catch (err)` mark-all-failed write

    The catch-block guard is load-bearing now. If `fetch`/`res.json()` throws AFTER the server already sent and stamped (timeout or parse error), the old unconditional write would flip sent or delivered rows to `failed`.
  - `failedCount` logic and the final broadcast status are unchanged.

  Files: `src/hooks/use-broadcast-sending.ts`
  Verify: typecheck clean, `npx eslint src/hooks/use-broadcast-sending.ts`.

- [ ] 7. Route `deliverBroadcast`'s sent-write through the same helper in `src/lib/whatsapp/broadcast-core.ts` (~561–570). Replace the unconditional `update({ status:'sent', sent_at, whatsapp_message_id, error_message:null }).eq('id', recipient.recipientRowId)` with:

  ```ts
  await stampRecipientSent(db, {
    recipientId: recipient.recipientRowId,
    broadcastId: plan.broadcastId,
    contactId: recipient.contactId || null,
    waMessageId: sentMessageId,
  });
  ```

  - Rationale: one forward-only rule for every recipient status write on the send side. With the new fallback in step 8, a status webhook could otherwise reach this row first via `messages`.
  - Leave the failed-write branch as is: a row that failed at send time has no wamid, so no webhook can have advanced it. Optionally add `.eq('status','pending')` to it for symmetry. That is harmless, and the scheduled path only selects pending rows.

  Files: `src/lib/whatsapp/broadcast-core.ts`
  Verify: `npx vitest run src/lib/whatsapp/broadcast-core.test.ts src/lib/whatsapp/scheduled-broadcasts.test.ts` passes.

- [ ] 8. Add the `handleStatusUpdate` fallback in `src/app/api/whatsapp/webhook/route.ts` (~1878–2075):
  - Hoist the step-3 `messages` lookup to right after the `fn_apply_message_status` RPC. Widen its select to `'conversation_id, broadcast_id, conversations(account_id, contact_id)'`, keeping `.eq('message_id', status.id).limit(1).maybeSingle()`. Step 3 (webhook fan-out) reuses this `msgRow`, so the fan-out still runs LAST and the query count does not change.
  - In step 2, if the wamid lookup returned no recipient and no error, AND `msgRow?.broadcast_id` and `conv?.contact_id` are set:
    - Select `broadcast_recipients` `id, status, whatsapp_message_id` with `.eq('broadcast_id', msgRow.broadcast_id).eq('contact_id', contactId).neq('status', 'skipped').limit(2)`.
    - Keep candidates where `whatsapp_message_id == null || whatsapp_message_id === status.id`.
    - Exactly 1 candidate: use it as `recipient`. If its wamid is null, backfill with `update({ whatsapp_message_id: status.id }).eq('id', cand.id).is('whatsapp_message_id', null)`, so later statuses take the fast path. The unique wamid index makes a racing double-backfill fail safely; log and continue.
    - 0 or 2+ candidates: `console.warn('[webhook] broadcast recipient fallback ambiguous/none', { wamid, broadcastId, contactId, n })` and skip. Never guess (AGENTS §6).
  - The existing `isValidStatusTransition` guard and the update block then apply unchanged. Forward-only is preserved on the fallback path as well.
  - Fix the stale comment (~2024–2032): broadcast sends DO create a `messages` row now (`broadcast-inbox.ts`). The error columns are still mirrored onto the recipient because the report reads them from there.
  - Do NOT touch the `fn_apply_message_status` call. `messages.status` is written only by the RPC (AGENTS §4).

  Files: `src/app/api/whatsapp/webhook/route.ts`
  Verify: typecheck clean, `npx vitest run src/lib/whatsapp` passes.

## Verification

- [ ] 9. Throwaway scratch check of the non-pure logic (no new test files in `src/`):
  - Create `scratch/vitest.scratch.config.ts`. Copy `vitest.config.ts`, but use `include: ['scratch/**/*.check.ts']`, keep `resolve.tsconfigPaths: true`, and keep the same `env`.
  - Create `scratch/fix23.check.ts` with an in-memory Supabase stub that records `[method, col, val]` and evaluates `eq`/`is`/`neq`/`like` against rows. Assert:
    - `stampRecipientSent` on a `pending` row: wamid, `sent_at` and `status='sent'` are all set.
    - On a row already `delivered` with wamid null: the wamid gets set and the status stays `delivered`.
    - On a row already `failed` with the same wamid: no change.
    - Statement B carries the `status = 'pending'` and wamid predicates.
    - The `contactId` key is used only when `recipientId` is absent.
    - `findContactByNormalizedPhone` returns the formatted row `'+226 72 36 23 25'` for input `'22672362325'` (one of the three logged drops).
  - Run `npx vitest run --config scratch/vitest.scratch.config.ts`. All pass.
  - Then delete both scratch files.

  Files: `scratch/*` (deleted afterwards)
  Verify: the run passes and `git status --short` shows no `scratch/` files.

- [ ] 10. Full verification bar (AGENTS.md §2) on touched paths:

  ```powershell
  npx tsc --noEmit 2>&1 | Select-String -Pattern "^src[/\\].*error TS"
  npx vitest run
  npx eslint src/lib/contacts/dedupe.ts src/lib/contacts/dedupe.test.ts src/app/api/whatsapp/webhook/route.ts src/app/api/whatsapp/broadcast/route.ts src/hooks/use-broadcast-sending.ts src/lib/whatsapp/broadcast-core.ts src/lib/whatsapp/broadcast-recipient-status.ts
  npx prettier --write <same paths>
  $env:NEXT_DIST_DIR=".next-verify"; npm run build
  ```

  Expected results:
  - Typecheck: no `src/` errors.
  - Vitest: all pass. Baseline is about 1151 tests / 100 files; the count rises by the new dedupe cases.
  - ESLint: no new errors. The 3 known `no-explicit-any` errors in `whatsapp-setup.tsx` are not in these paths.
  - Build: succeeds.
  - If Prettier reformats whole files that were never Prettier-clean (likely `webhook/route.ts`, which uses single quotes vs dedupe's double), say so in the summary.
  - Do not commit.

## Per-caller regression checklist for `findExistingContact`

Signature and return shape are unchanged, so no caller edits are needed. After step 10, confirm by reading each call site:

| # | Caller | Input passed | Expected after Fix 1 |
|---|---|---|---|
| 1 | `webhook/route.ts` `findOrCreateContact` (processMessage / processEcho / ingestHistoryThread) | `normalizePhone(...)` digits | A formatted stored phone resolves by the exact step, so no insert, no 23505, and the message is stored |
| 2 | `webhook/route.ts` `handleAppStateSync` `alreadyKnown` (~1498) | raw staged phone | Formatted contacts are now flagged "already known" |
| 3 | `src/lib/whatsapp/resolve-conversation.ts:91` and the race re-lookup at `:121` | `sanitized` digits | Existing contact reused; `resolve-conversation.test.ts` passes unchanged |
| 4 | `src/lib/services/messaging.ts:531` (public API send) | `digits` | Reuses the formatted contact instead of insert → 23505 → error response |
| 5 | `src/lib/api/v1/contacts.ts:140` and race re-lookup `:161` | `sanitized` | Returns `{ id, created:false }` for formatted rows |
| 6 | `src/app/api/whatsapp/coexistence/contacts/route.ts:609` (23505 recovery) | resolved phone | Recovery now finds the winner instead of reporting failure |
| 7 | `src/components/contacts/contact-form.tsx:152` (dup check) and `:321` (post-23505) | typed value, browser client under RLS | The exact duplicate is flagged `exact` (hard block) rather than missed. A trunk variant still warns as fuzzy. Same `contacts_select` RLS, column readable |

## Fix 4 — READ-ONLY counts for "SV Brands campaign" (runs in the later `fix4-counts` step; do NOT apply)

Execute SELECT statements only, against production Supabase project `dknolotutfiesuhbhmze` (Supabase MCP `execute_sql`). Never run the UPDATE, not even inside BEGIN/ROLLBACK. Write the results to `d:\Junkies Coder\whatsapp-crm-nextjs\.agents\tasks\fix4-reconciliation-counts.md`.

Q0 — resolve the full id. Proceed only if exactly 1 row comes back, named `SV Brands campaign`:

```sql
SELECT id, name, account_id, status, created_at,
       sent_count, delivered_count, read_count, replied_count, failed_count
FROM broadcasts
WHERE id::text LIKE 'def217d7-%';
```

Q1 — recipient status vs actual message status (`:bid` = the id from Q0):

```sql
SELECT br.status                       AS recipient_status,
       COALESCE(m.status, '<no message row>') AS message_status,
       (br.whatsapp_message_id IS NULL) AS wamid_missing,
       count(*)                        AS n
FROM broadcast_recipients br
LEFT JOIN messages m
       ON m.message_id = br.whatsapp_message_id
      AND m.broadcast_id = br.broadcast_id
WHERE br.broadcast_id = :bid
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

The report expects: sent/delivered 67, sent/failed 106, sent/sent 15, plus delivered 46 / read 15 / failed 1 matching.

Q2 — rows a forward-only reconciliation would change. `n_distinct` must equal `n`, otherwise a recipient joins more than one message:

```sql
SELECT br.status AS from_status, m.status AS to_status,
       count(*) AS n, count(DISTINCT br.id) AS n_distinct
FROM broadcast_recipients br
JOIN messages m
  ON m.message_id = br.whatsapp_message_id
 AND m.broadcast_id = br.broadcast_id
WHERE br.broadcast_id = :bid
  AND (   (m.status = 'failed'    AND br.status IN ('pending','sent'))
       OR (m.status = 'delivered' AND br.status IN ('pending','sent'))
       OR (m.status = 'read'      AND br.status IN ('pending','sent','delivered')))
GROUP BY 1, 2 ORDER BY 1, 2;
```

The report expects 173 in total (67 + 106).

Q3 — projected broadcast counters after reconciliation, using migration 005's `_bcast_cols_for_status` semantics:
- `sent_count` = sent + delivered + read + replied
- `delivered_count` = delivered + read + replied
- `read_count` = read + replied
- `failed_count` = failed

Compute the projected status per recipient with the same CASE as the UPDATE below, then aggregate. Show it side by side with the current counters from Q0.

Proposed UPDATE. Write it into the report verbatim and DO NOT EXECUTE it. It needs explicit user approval. Forward-only: the ladder guard sits in the WHERE clause, so READ COMMITTED re-checks it against concurrent webhook writes. Timestamps and error detail are COALESCEd, so nothing already recorded is overwritten. The trigger from migration 005 moves the counters.

```sql
UPDATE broadcast_recipients br
SET status        = m.status,
    delivered_at  = CASE WHEN m.status IN ('delivered','read')
                         THEN COALESCE(br.delivered_at, m.delivered_at) ELSE br.delivered_at END,
    read_at       = CASE WHEN m.status = 'read'
                         THEN COALESCE(br.read_at, m.read_at) ELSE br.read_at END,
    error_code    = CASE WHEN m.status = 'failed'
                         THEN COALESCE(br.error_code, m.error_code) ELSE br.error_code END,
    error_message = CASE WHEN m.status = 'failed'
                         THEN COALESCE(br.error_message, m.error_message) ELSE br.error_message END,
    error_details = CASE WHEN m.status = 'failed'
                         THEN COALESCE(br.error_details, m.error_details) ELSE br.error_details END
FROM messages m
WHERE br.broadcast_id = :bid
  AND m.message_id   = br.whatsapp_message_id
  AND m.broadcast_id = br.broadcast_id
  AND (   (m.status = 'failed'    AND br.status IN ('pending','sent'))
       OR (m.status = 'delivered' AND br.status IN ('pending','sent'))
       OR (m.status = 'read'      AND br.status IN ('pending','sent','delivered')))
RETURNING br.id, br.status;
```

The report must state:
- the Q0 row
- the Q1 table
- the Q2 total, which should be 173, and any `n` ≠ `n_distinct`
- the Q3 before/after counters
- that `replied_count` stays 0, because the replies were never stored (Fix 1 is what prevents future loss; past replies are unrecoverable)
- that nothing was written

## Known gaps / assumptions

- A status webhook that arrives in the few milliseconds between Meta accepting a send and statement A can still miss. The fallback in step 8 also misses, because the `messages` row does not exist yet. Closing that fully needs a pre-send correlation key Meta does not provide. The window shrinks from 2–26 s to milliseconds.
- The stamp is per recipient inside the route's loop: two small UPDATEs per sent message. It is under RLS, so the policy's `EXISTS` subquery runs per statement. That is acceptable at `SEND_BATCH_SIZE` scale.
- Phones still stored formatted (report recommendation 3) and container log retention (recommendation 5) are out of scope. Fix 1 makes formatted storage harmless for matching.
