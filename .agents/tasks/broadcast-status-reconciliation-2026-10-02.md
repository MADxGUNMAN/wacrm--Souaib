# Broadcast status reconciliation — "SV Brands campaign" (dry run, 2 Oct 2026)

Status: **READ-ONLY. Nothing has been applied.** Every query below that was run against production
(`dknolotutfiesuhbhmze`) was a `SELECT`. The `UPDATE` at the end is a proposal and awaits approval.

Campaign: `def217d7-3a7b-483f-881e-9a11238acb57`, "SV Brands campaign", created 28 Sep 2026 12:30:27 UTC.

## Headline

- 250 recipients. Every one has a `whatsapp_message_id` (250 distinct), and every one joins to exactly one
  `messages` row on `(message_id, broadcast_id)`. The join is 1:1, so no recipient has an ambiguous match.
- **173 recipient rows would change status**: 67 `sent → delivered` and 106 `sent → failed`.
- **11 more rows would get a timestamp-only fill**. They are already `read` but have `delivered_at = NULL`, and
  the message row has the real `delivered_at`. Their status does not change.
- **184 rows in total** if both kinds are applied, or 173 if you want status changes only (variant B below).
- 15 `sent → sent` and the 62 already-correct rows (46 delivered, 15 read, 1 failed) are untouched.

## Columns confirmed on `broadcast_recipients`

`id, broadcast_id, contact_id, status, sent_at, delivered_at, read_at, replied_at, error_message, created_at,
whatsapp_message_id, send_params, error_code, error_details`

- `status` CHECK: `pending | sent | delivered | read | replied | failed | skipped`.
- Trigger `broadcast_recipients_aggregate` (AFTER INSERT/UPDATE/DELETE, per row) re-derives the parent
  `broadcasts` counters whenever `status` changes. The UPDATE needs no separate counter fix.

## Per-group breakdown (measured)

Join: `messages.message_id = broadcast_recipients.whatsapp_message_id AND messages.broadcast_id = broadcast_recipients.broadcast_id`.

| Recipient status | Actual `messages.status` | Error code | n | Action |
|---|---|---|---|---|
| sent | delivered | — | 67 | → `delivered`, copy `delivered_at` |
| sent | failed | 131026 | 102 | → `failed`, copy error |
| sent | failed | 131049 | 3 | → `failed`, copy error |
| sent | failed | 130472 | 1 | → `failed`, copy error |
| sent | sent | — | 15 | none (no status from Meta, on either table) |
| delivered | delivered | — | 46 | none (`delivered_at` already equals the message's) |
| read | read | — | 15 | 11 get `delivered_at` filled, 4 already match |
| failed | failed | 131049 | 1 | none (error already on the row) |
| **Total** | | | **250** | |

Timestamp detail:

- All 67 `sent → delivered` rows had `messages.delivered_at` earlier than the recipient's `sent_at`, i.e.
  delivered before the wamid was written. That matches the race. Recipients have `delivered_at` NULL; messages
  have it set on all 67.
- All 106 `sent → failed` rows have `error_code`, `error_message` and `error_details` set on the message
  (`error_details.source = 'status_webhook'`), and none of them are set on the recipient.
- `read_at` already matches the message on all 15 read rows.

Meta wording stored on the failed messages:

- 131026: "Message Undeliverable. (Meta error 131026)"
- 131049: "In order to maintain a healthy ecosystem engagement, the message failed to be delivered. (Meta error 131049)"
- 130472: "Failed to send message because this user's phone number is part of an experiment (Meta error 130472)"

## Discrepancy with the root-cause report

The report gives `106 sent→failed (102× 131026, 4× 131049, 1× 130472)`, but those parts add up to 107. The
measured split of the 106 is **102 / 3 / 1**. The "4× 131049" counts every failed message of the campaign,
including the one recipient that was already correctly `failed`. All other figures match the report exactly:
67, 106, 15, 46, 15 and 1.

The report did not mention the 11 `read` rows missing `delivered_at`. They are the same race, where `read`
landed but `delivered` was lost.

## Effect on the campaign counters

The current `broadcasts` row is consistent with the recipient rows: sent 249, delivered 61, read 15,
failed 1, replied 0. The trigger moves a row out of `sent_count` when it becomes `failed`.

| Counter | Now | After UPDATE |
|---|---|---|
| sent_count | 249 | **143** |
| delivered_count | 61 | **128** |
| read_count | 15 | 15 |
| failed_count | 1 | **107** |
| replied_count | 0 | 0 |

The 11 timestamp-only rows do not touch the counters, because the trigger only fires on a status change.
`replied_count` stays 0. That is the separate contact-lookup bug, and the replies were never stored, so there
is nothing to copy.

## Proposed UPDATE (NOT executed)

How it stays forward-only:

- It uses the same rules as `isValidStatusTransition` in the webhook. On the ladder
  `pending < sent < delivered < read < replied`, a status only moves up.
- `failed` is accepted only from `pending` or `sent`.
- A `failed` or `skipped` recipient is never touched.
- Timestamps are only filled with `COALESCE`. An existing value is never overwritten.
- Error fields are copied only on the transition into `failed`.
- `br.status = p.r_status` is a concurrency guard. If a live webhook moves a row in the meantime, Postgres
  re-checks the WHERE against the new row version and skips that row.
- `sent_at` is deliberately left alone.

### Variant A: status + timestamp fill (expect 184 rows)

```sql
BEGIN;

WITH src AS (
  SELECT br.id,
         br.status       AS r_status,
         m.status        AS m_status,
         m.delivered_at  AS m_delivered_at,
         m.read_at       AS m_read_at,
         m.error_code    AS m_error_code,
         m.error_message AS m_error_message,
         m.error_details AS m_error_details,
         CASE br.status WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2
                        WHEN 'read' THEN 3 WHEN 'replied' THEN 4 ELSE -1 END AS r_rank,
         CASE m.status  WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
                        ELSE -1 END AS m_rank
  FROM broadcast_recipients br
  JOIN messages m
    ON m.message_id   = br.whatsapp_message_id
   AND m.broadcast_id = br.broadcast_id
  WHERE br.broadcast_id = 'def217d7-3a7b-483f-881e-9a11238acb57'
),
plan AS (
  SELECT src.*,
         CASE
           WHEN m_status = 'failed' AND r_status IN ('pending', 'sent') THEN 'failed'
           WHEN r_rank >= 0 AND m_rank > r_rank                         THEN m_status
           ELSE r_status
         END AS new_status
  FROM src
)
UPDATE broadcast_recipients br
SET status        = p.new_status,
    delivered_at  = CASE WHEN p.new_status IN ('delivered', 'read', 'replied')
                         THEN COALESCE(br.delivered_at, p.m_delivered_at)
                         ELSE br.delivered_at END,
    read_at       = CASE WHEN p.new_status IN ('read', 'replied')
                         THEN COALESCE(br.read_at, p.m_read_at)
                         ELSE br.read_at END,
    error_code    = CASE WHEN p.new_status = 'failed' AND p.r_status <> 'failed'
                         THEN COALESCE(br.error_code, p.m_error_code)
                         ELSE br.error_code END,
    error_message = CASE WHEN p.new_status = 'failed' AND p.r_status <> 'failed'
                         THEN COALESCE(br.error_message, p.m_error_message)
                         ELSE br.error_message END,
    error_details = CASE WHEN p.new_status = 'failed' AND p.r_status <> 'failed'
                         THEN COALESCE(br.error_details, p.m_error_details)
                         ELSE br.error_details END
FROM plan p
WHERE br.id = p.id
  AND br.status = p.r_status            -- concurrency guard: skip rows moved since the read
  AND (
        p.new_status IS DISTINCT FROM p.r_status
     OR (p.new_status IN ('delivered', 'read', 'replied')
         AND br.delivered_at IS NULL AND p.m_delivered_at IS NOT NULL)
     OR (p.new_status IN ('read', 'replied')
         AND br.read_at IS NULL AND p.m_read_at IS NOT NULL)
  )
RETURNING br.id, p.r_status AS old_status, br.status AS new_status;

-- Expect exactly 184 rows returned (67 delivered + 106 failed + 11 read/timestamp-only).
-- Anything else: ROLLBACK;
COMMIT;
```

### Variant B: status changes only (expect 173 rows)

This is the same statement with the last WHERE block reduced to the status change. It leaves the 11 `read`
rows without `delivered_at`.

```sql
  AND p.new_status IS DISTINCT FROM p.r_status
```

### Post-apply check (SELECT)

```sql
SELECT br.status AS r_status, m.status AS m_status, count(*)
FROM broadcast_recipients br
JOIN messages m ON m.message_id = br.whatsapp_message_id AND m.broadcast_id = br.broadcast_id
WHERE br.broadcast_id = 'def217d7-3a7b-483f-881e-9a11238acb57'
GROUP BY 1, 2 ORDER BY 1, 2;
-- Expect: delivered/delivered 113, failed/failed 107, read/read 15, sent/sent 15.

SELECT sent_count, delivered_count, read_count, failed_count, replied_count
FROM broadcasts WHERE id = 'def217d7-3a7b-483f-881e-9a11238acb57';
-- Expect: 143, 128, 15, 107, 0.
```

## Notes

- **Blast radius.** One campaign, one table (`broadcast_recipients`), plus the trigger-maintained counters on
  one `broadcasts` row. No `messages`, contacts or other accounts are touched.
- **Reversibility.** Fully reversible: the 184 ids come back via `RETURNING`, and before the change every row
  had `status = 'sent'` (or `read` for the 11) and NULL `delivered_at` / `error_*`. Save the `RETURNING`
  output before you `COMMIT`.
- **Scope.** Only this campaign. Other campaigns sent before the send-side wamid fix may have the same drift.
  This dry run did not measure them.
