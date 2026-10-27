# Contact lookup on phone_normalized, 23505 recovery and forward-only broadcast recipient stamping

This diff fixes the 2 Oct incident where broadcast replies from about 8,900 Source Vehicle contacts were dropped. `findExistingContact` now queries the generated digits-only `phone_normalized` column. It does an exact match first, then a last-8 suffix pre-filter plus `phonesMatch`, so a formatted stored phone like `+238 988 48 84` resolves again. On a 23505, `findOrCreateContact` re-resolves on the exact index key, and the one remaining drop path now writes a tagged, structured log line. On the broadcast side, the wizard route stamps `whatsapp_message_id`/`sent_at`/`sent` onto the recipient row at send time through a new forward-only helper. The client hook, `deliverBroadcast` and the status webhook now use the same forward-only rules. The webhook also gains a fallback that finds the recipient through `messages.broadcast_id`.

Watch for:
- The residual drop is logged, not persisted. Container logs still vanish on redeploy (confirmed; the plan chose this on purpose).
- Stale browser tabs from before the deploy can still regress rows that the server now correlates early (likely, temporary).

**Verdict**: APPROVED

## High-level view

The lookup fix sits at the shared helper, so every caller is repaired without edits: the webhook's three contact paths, `handleAppStateSync`, `resolve-conversation`, the public send API, `v1/contacts`, coexistence import and the contact form. The signature and return shape are unchanged. The exact step uses the column the unique index enforces. The suffix step is skipped below 8 digits, because `phonesMatch` could only succeed there by exact equality. The test stub now evaluates `eq`/`like` against a derived `phone_normalized`, and it asserts both the column and the pattern. The raw `phone` column is never queried.

On 23505, the webhook re-resolves through `findContactByNormalizedPhone`, which uses exactly `(account_id, phone_normalized)`. That is the only unique index on `contacts`, so a 23505 from a contact insert always names a row this query can find. `processEcho` and `ingestHistoryThread` share the function and get the same recovery. No migration was added. The residual failure (a DB error or a non-23505 insert error) is a single `[webhook][contact-resolution-failed]` JSON line that carries the account, the digits, the source, the wamid and both errors.

The recipient stamp is two conditional UPDATEs. A sets the wamid and `sent_at` only `WHERE whatsapp_message_id IS NULL`. B sets `sent` only `WHERE status='pending' AND whatsapp_message_id=<w>`. So a delivered/read/failed row is never regressed, and a delivered row with no wamid still gets the wamid. The status webhook's recipient UPDATE now carries `.in('status', allowedPredecessorStatuses(...))`, so the ladder rule is enforced in the WHERE clause, not just in the JS read. The `messages` lookup was hoisted, so the fallback adds no query for non-broadcast statuses.

The tenancy is sound. The route derives `accountId` from the session profile. It checks that the client-supplied `broadcast_id` belongs to that account before stamping, and stamps under session RLS. The webhook fallback scopes through `broadcasts!inner(account_id)`. Both dedupe queries filter on `account_id`.

<details>
<summary>Issues (3)</summary>

1. **Residual drop is not persisted.** The `[webhook][contact-resolution-failed]` line is the only trace, and it is lost on the next container recreate (confirmed, non-blocking; the plan made this choice deliberately). Ship report recommendation 5 (log retention across deploys) as a follow-up, so this tag survives long enough to be grepped.
2. **Stale client bundles during rollout.** A tab still running the old hook does an unconditional `status:'sent'` write after its batch returns. Now that the server correlates rows during the batch, webhooks can advance those rows first, and that write would drag them back to `sent` (likely, transitional). Mention a hard refresh to active senders at deploy time, or deploy outside an active campaign.
3. **Duplicate (broadcast_id, contact_id) rows under the contact-id key.** When no `recipient_id` is sent (legacy or old-bundle caller), statement A would put one wamid on two rows. That trips the unique wamid index, so the stamp fails and is logged, and the webhook fallback then reports "ambiguous" (likely, fails safe, low frequency). No change needed unless duplicates turn out to be real.

</details>

<details><summary>Details</summary>

### Lookup and its callers

The behaviour change for short inputs (under 8 digits) is that the old `LIKE '%<whole number>'` path is gone. Because `phonesMatch` only accepts exact equality at that length, no match is lost.

For `contact-form.tsx`, an exact duplicate is now found by the exact step. Before, it could be missed and fall through to the post-insert 23505 path. The form only checks new contacts, so a contact cannot match itself.

The `fake-db.test-helper.ts` change derives `phone_normalized` when a fixture omits it, which mirrors the generated column. It is a test-only seam. It was needed because `phase7.test.ts` failed on the first run, and verification.md records that.

### Forward-only stamping and the race window

```
Meta accepts ─▶ A: wamid,sent_at (IS NULL) ─▶ B: sent (pending & wamid) ─▶ persistBroadcastMessage
                       ▲                                ▲
          status webhook can match from here    a delivered landing between A and B
                                                 wins; B then matches 0 rows
```

The stamp runs before `persistBroadcastMessage`, so by the time a `messages` row exists, the recipient is already correlated. The fallback therefore only matters when the best-effort stamp failed, or for rows from before the fix. The window that remains, between Meta's response and statement A, is milliseconds instead of 2–26 s. The plan states this openly.

Old bundles do not send `recipient_id`, so the server falls back to the `contact_id` key. That is the path where Issue 3 applies. The same bundles then run the old unconditional client write (Issue 2). Both go away once every tab has reloaded.

In the hook, every write is now guarded by `.eq('status','pending')`. In the `catch` branch the guard is what stops a fetch or parse error after a successful server send from flipping sent or delivered rows to `failed`. `failedCount` still increments for those rows, as it did before, so the final broadcast status can still read worse than the rows show. That counting is unchanged behaviour, not a regression.

### Status webhook fallback

The fallback requires exactly one candidate whose wamid is null or equal to this one, and otherwise logs and skips without guessing. The wamid backfill is set-once (`.is('whatsapp_message_id', null)`), and the unique index makes a racing double-backfill fail safely. `fn_apply_message_status` is untouched, so `messages.status` is still written only by the RPC.

`allowedPredecessorStatuses` is derived from `isValidStatusTransition`, so it inherits that function's existing rule that `skipped` (off-ladder) may advance. That is the same as before, now expressed in SQL.

### Verification evidence

verification.md records the full §2 bar: the `src/` typecheck is clean, vitest passed 157 files / 2100 tests, eslint showed 0 errors (1 pre-existing unused-import warning on an untouched line), prettier ran, and the build with `NEXT_DIST_DIR=.next-verify` exited 0. The `tsconfig.json` side effect of the build was reverted. The scratch probe passed 13/13 and covered formatted, trunk, short, cross-account, 23505-key, stamp forward-only and predecessor-set cases.

Spot checks agree with that record. `.next-verify` was written at 18:04, after the last source write at 18:02. Both scratch files are gone. `tsconfig.json` has no diff. Prettier reformatted `dedupe.ts` and `dedupe.test.ts` whole-file (double → single quotes), which inflates their diffs. AGENTS.md's "1151 tests / 100 files" figure is stale. I re-ran no suites.

</details>

<details>
<summary>File map</summary>

- `src/lib/contacts/dedupe.ts`: new `findContactByNormalizedPhone`; `findExistingContact` uses exact then suffix lookups on `phone_normalized`; whole-file prettier.
- `src/lib/contacts/dedupe.test.ts`: an evaluating stub that asserts column and pattern; 6 lookup cases plus 2 exact-helper cases.
- `src/lib/services/fake-db.test-helper.ts`: derives the generated `phone_normalized`.
- `src/app/api/whatsapp/webhook/route.ts`: 23505 exact re-resolve and tagged failure log; `logCtx` passed by inbound/echo/history; recipient fallback via `messages`; forward-only `.in('status', …)` predicate; hoisted `messages` lookup.
- `src/lib/whatsapp/broadcast-recipient-status.ts` (new): forward-only `stampRecipientSent`.
- `src/app/api/whatsapp/broadcast/route.ts`: `recipient_id` input, broadcast ownership check, send-time stamp.
- `src/hooks/use-broadcast-sending.ts`: sends `recipient_id`; all recipient writes guarded by `pending`; the sent write goes through the helper.
- `src/lib/whatsapp/broadcast-core.ts`: sent write goes through the helper; failed write guarded by `pending`.

Full diff: `git diff` in the working tree (uncommitted).

</details>
