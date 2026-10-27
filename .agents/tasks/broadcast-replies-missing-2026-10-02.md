# Missing broadcast replies — Source Vehicle (investigated 2 Oct 2026)

## Summary

Meta delivered the replies and the app accepted them. The webhook then dropped every one of them before storing anything, because it could not find the recipient's existing contact.

- `findExistingContact` (`src/lib/contacts/dedupe.ts:46-49`) pre-filters with `.like("phone", "%<last 8 digits>")` against the RAW `contacts.phone` column.
- Source Vehicle's contacts are stored formatted, e.g. `+238 988 48 84`. Its last 8 digits are `89884884`, but the raw string ends in `88 48 84`, so the LIKE matches nothing.
- The webhook then tries to INSERT a new contact `2389884884`. The unique index `idx_contacts_account_phone_normalized` (account_id, phone_normalized) rejects it with 23505, because the digits-only generated column DOES match the existing row.
- The race-recovery branch (`webhook/route.ts` ~2908) calls the same broken lookup again, gets null, logs `Error creating contact` and returns null. `processMessage` returns at `if (!contactOutcome) return;`. No message row is written, no unread bump, no broadcast "replied" flag. The reply is gone.

This explains 100% of the missing replies, not a subset:

- All 250 recipients of the campaign have phones the LIKE cannot match.
- 0 of 250 have any customer message stored after the send.
- Across the whole account, 8,939 of 9,219 contacts are unmatchable, and **none of those 8,939 has ever had an inbound message stored**. The 280 matchable contacts have 45 with inbound messages.
- This is not a broadcast-only bug. Any message from these 8,939 contacts is dropped, at any time, including quick-reply taps ("Yes Interested"), coexistence echoes (`processEcho`), and history backfill. It is still happening now.

Separate, smaller bug: the broadcast report is wrong. The client-side broadcast flow writes the wamid onto `broadcast_recipients` only after the whole batch call returns, 2–26 s after the send. Status webhooks that arrive inside that gap find no recipient row and are lost for good. The report shows 188 "sent", but 67 of those were delivered and 106 failed.

The incident traits in the brief (business senders, auto-replies, Cape Verde/African numbers, bursts) are coincidental. The only shared trait is how the phone is stored.

## Timeline / timezone

- The only Source Vehicle broadcast is "SV Brands campaign" (`def217d7-…`, template `brands_marketing`), created **28 Sep 2026 12:30:27 UTC**. Sends ran 12:30:52–12:41:00 UTC. There is no broadcast on 2 Oct, so the client is describing the 28 Sep campaign.
- The business number is `+971 56 558 0904` (UAE, UTC+4). The screenshot's 16:34 is 12:34 UTC. The example recipient's `sent_at` is 12:34:08 UTC, an exact match. (In IST the same instant would be 18:04.)
- The production container was recreated at **28 Sep 13:10:19 UTC** by the deploy of `c8b1623`. App logs for 12:30–13:10, the main reply window, no longer exist (json-file driver, removed with the container).

## Evidence

### 1. Meta delivered, and the app accepted (verified)

The nginx access log shows `POST /api/whatsapp/webhook` from `facebookexternalua` on 28 Sep, all with status 200:

| UTC bucket | POSTs |
|---|---|
| 12:30 | 163 |
| 12:35 | 188 |
| 12:40 | 38 |
| 12:45–13:10 | 25 |

All 3,328 webhook POSTs in the retained logs (about 14 days) returned 200. That rules out:

- the proxy gate
- signature failure (would be 401)
- 413 / 502 / OOM

The container restart count is 0. nginx error.log for 28 Sep has nothing on the webhook path.

Status events from the same webhooks were processed, which shows account resolution by `phone_number_id` worked. For the example contact, `messages.delivered_at` = 12:34:06 UTC.

### 2. The drop point (verified in logs)

These are the only `Error creating contact` lines since the 13:10 restart. All three are Source Vehicle broadcast recipients replying after the restart:

```
2026-09-28T14:20:59Z Error creating contact: code '23505'
  Key (account_id, phone_normalized)=(b69f6811-…, 22672362325) already exists.  -> "+226 72 36 23 25" Faso Automobile Premium
2026-09-29T11:19:20Z … 213660367247  -> "+213 660 36 72 47" Renault Batna - KHERRAF Automobile
2026-09-29T11:19:53Z … 22996757532   -> "+229 96 75 75 32" VOITURES dICI & dAILLEURS
```

The constraint is `idx_contacts_account_phone_normalized`. All three rows exist, have `in_broadcast = true`, and have no stored inbound message.

The other 23505 lines in the log are `messages_conversation_wamid_key` from Meta redeliveries. Those are benign.

### 3. Example recipient +238 988 48 84 (verified in DB)

| Field | Value |
|---|---|
| contact id | `10ba03f6-…` |
| `phone` | `+238 988 48 84` |
| name | Alucar SA - Praia |
| created | 22 Aug |
| broadcast recipient status | `sent`, sent_at 12:34:08 UTC |
| conversation | one; contains ONLY the outbound template message (status `delivered`, delivered_at 12:34:06) |
| customer messages | none |

The "Obrigado por nos contactar!" auto-reply reached the server, inside the lost 12:30–13:10 log window, and died in `findOrCreateContact`.

### 4. How common formatted phones are (verified)

`unmatchable` means `phone NOT LIKE '%' || right(digits(phone), 8)`, the exact predicate the code uses.

| Scope | Contacts | Unmatchable | Unmatchable with any inbound ever |
|---|---|---|---|
| Source Vehicle, all | 9,219 | 8,939 | **0** |
| Source Vehicle, broadcast recipients | 250 | 250 | **0** |
| Other accounts | 989 | 1 (Akash Patel) | — |

Where the formatted rows come from:

- 9,121 created 22 Aug, `source='unknown'` (a bulk load that kept the sheet's spacing)
- 49 created 23 Sep via CSV import (`source='import'`), from before `cleanImportPhone` existed
- Every contact the webhook created itself (`source='whatsapp'`) is digits-only

`cleanImportPhone` (`src/lib/contacts/import-phone.ts`, commit `efaf27d`, deployed 28 Sep 13:10) now stores `+<digits>` for international numbers. Two paths can still write formatted values:

- it still stores `local` numbers as typed (`'050 675 1025'`)
- `contact-form.tsx:245,259` and `contact-detail-view.tsx:264` save `phone.trim()`

### 5. Code path (file:symbol)

- `src/app/api/whatsapp/webhook/route.ts`
  - `processMessage` (~2199): `normalizePhone(message.from)`, then `findOrCreateContact`, then `if (!contactOutcome) return;`
  - `findOrCreateContact` (2810–2920): lookup, then insert, then on 23505 a re-lookup with the same helper, then `console.error('Error creating contact')` and `return null`
- `src/lib/contacts/dedupe.ts` `findExistingContact` (35–56): `.like("phone", `%${suffix}`)` on the raw column
- `src/lib/contacts/dedupe.test.ts`: `stubDb` resolves `.like()` to a fixed row set, so the test never runs the SQL predicate. This is the "mock makes the query chain meaningless" trap from AGENTS.md §4.
- Other callers that fail the same way for formatted rows:
  - `processEcho` and `ingestHistoryThread` (coexistence echoes and history)
  - `handleAppStateSync` (`alreadyKnown`)
  - `src/lib/whatsapp/resolve-conversation.ts:91`
  - `src/lib/services/messaging.ts:531` (public API send)
  - `src/lib/api/v1/contacts.ts:140`
  - `src/app/api/whatsapp/coexistence/contacts/route.ts:609`
  - `contact-form.tsx:152` (duplicate check)

  For the API and resolve paths the symptom is a 23505, then null, then an error response.

### 6. Secondary bug: broadcast status mirror race (verified)

`src/hooks/use-broadcast-sending.ts:743-753` writes `status:'sent', whatsapp_message_id` per recipient only after `POST /api/whatsapp/broadcast` returns for the whole batch. Meanwhile `persistBroadcastMessage` has already written the `messages` row. For this campaign, the recipient's `sent_at` came 2.4–26.6 s after the message row (median 10.7 s).

`handleStatusUpdate` (`webhook/route.ts:1997-2000`) looks up `broadcast_recipients` by `whatsapp_message_id`. A `delivered` or `failed` status that arrives inside that gap matches nothing and is never retried.

| Recipient status | Real `messages.status` | n |
|---|---|---|
| sent | delivered | 67 (all delivered before the wamid was written) |
| sent | failed | 106 (102× 131026 undeliverable, 4× 131049, 1× 130472) |
| sent | sent | 15 |
| delivered / read / failed | same | 46 / 15 / 1 |

`replied_count = 0` is caused by the primary bug, since `flagBroadcastReplyIfAny` is never reached.

## Verified vs inferred

Verified:

- Webhook POSTs and their 200s (nginx)
- The three post-restart drops and their constraint (docker logs)
- All DB counts above
- The code path, by reading it
- The 22 Aug / 23 Sep origin of the formatted rows

Inferred:

- That the roughly 27 other replies (about 30 minus 3) arrived between 12:30 and 13:10 and failed the same way. Their logs were destroyed by the 13:10 redeploy. The inference is strong: there are 0 stored inbound messages for any unmatchable contact, ever, and the failure is deterministic for every such row.
- The exact number and content of replies. Only the phone has them.

Not checked: Meta-side webhook subscription fields. Not needed, since deliveries are evidenced.

## Recommendations (not implemented)

1. **Fix the lookup (primary).** In `findExistingContact`, query the generated, indexed digits column instead of raw `phone`:
   - first `.eq('phone_normalized', normalized)` (exact, uses the unique index)
   - then a fallback `.like('phone_normalized', '%' + suffix)` for trunk variants
   - keep `phonesMatch` as the final filter

   This repairs every caller in §5 at once, with no data migration needed. Update `dedupe.test.ts` so the stub asserts the column and pattern it receives.
2. **Never drop a message on contact-resolution failure.** In `findOrCreateContact`, on 23505, re-resolve with `.eq('phone_normalized', normalizePhone(phone))`, the exact key the index just reported. Make a null outcome a loud, persisted failure (Sentry or a table) rather than a `console.error` that dies with the container. Logs vanish on every deploy.
3. **Normalise stored phones going forward.** Store `+<digits>` from `contact-form.tsx`, `contact-detail-view.tsx` and the `local` branch of `cleanImportPhone`, or make the fix in step 1 sufficient on its own. Optionally run a one-off `UPDATE contacts SET phone = '+' || phone_normalized` for Source Vehicle. That changes what users see (the spacing), so get the user's confirmation first. Step 1 makes it unnecessary for correctness.
4. **Broadcast status race.** Have `/api/whatsapp/broadcast` (server side, where the wamid is known) write `whatsapp_message_id` and `sent` onto the recipient row before or alongside `persistBroadcastMessage`, using `contact_id` and `broadcast_id`. Alternatively, have `handleStatusUpdate` fall back to `messages.message_id` and then to the recipient via `broadcast_id`/`contact_id`. A one-off reconciliation (SELECT-verified first) can copy `messages.status`, `delivered_at` and `error_*` onto the 173 mis-reported recipient rows of this campaign.
5. **Persist container logs across deploys**, e.g. a json-file `max-size` plus a log-shipping or `docker logs` dump in `deploy.sh` before recreate. This incident's main window was unrecoverable for that reason alone.

## Recovery of the lost replies

- Meta does not redeliver a webhook that was acknowledged with 200, and the app acked every one. The payloads were never persisted or logged, so they cannot be replayed from our side.
- Coexistence history sync is a one-time onboarding share. It cannot be re-triggered for a past window without re-onboarding the number, which is disruptive and not guaranteed to include them.
- Practical recovery: deploy fix 1 first. Then the client can see who replied on their phone (the replies are there) and either follow up, or tag those contacts in the CRM manually. Any new message from those contacts will then land normally. Until fix 1 ships, **every** reply from about 8,900 of this client's contacts keeps being silently dropped.
