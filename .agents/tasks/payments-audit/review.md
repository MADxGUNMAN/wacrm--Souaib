# Review: Payments & Subscriptions audit and fix (first pass)

Base HEAD 5f30195, uncommitted working tree. Reviewed against plan.md (F1-F30, P1-P17) and the original user request (message 12). Tests, tsc, eslint and build were not re-run; evidence taken from verification.md and progress.md.

## Summary

Verdict: APPROVED. No blocking findings.

The change replaces the binary `source: payment | manual` with one shared, pure classifier (`src/lib/billing/event-channel.ts`) used by the events route, the Workspaces access-via derivation and the AutoPay drawer. Channel precedence matches the plan table exactly (admin source / billing_admin_action, then customer source, then Razorpay links/sources/types, then manual UPI links/types, then actor super admin, then other actor, then system). Legacy NULL-source rows fall back to links and actor, so admin grants (no payment_request_id) read Admin action and manual UPI paid activations (payment_request_id set) read Manual UPI with amountKind `covered_by_payment`. Counts and pagination are computed server-side in `selectEventsPage` / `selectLedgerPage` with the same filter set as the table (byChannel ignores only the channel filter). Reads are chunked with an explicit cap and a `truncated` flag.

## Evidence checked

- event-channel.ts:205-235 channel precedence, :237-279 initiator table, :281-313 money/amountKind table: all match plan §2, including `subscription_expired` + NULL source + no actor -> Scheduled job, and missing actor profile -> customer "Unknown user".
- events/route.ts:94-108 validates channel, type (25 values via `isEventType`), mode, since, accountId UUID (400). :120-136 SQL filters on `account_id`, `event_type`, `created_at`; :138-140 excludes super-admin-owned workspaces; explicit column list, no secrets.
- event-query.ts:73-97 byChannel over mode+search rows, total includes channel; page clamped.
- ledger/route.ts, collected/route.ts: `requireSuperAdmin` first, `dynamic = 'force-dynamic'`, GET only, `adminBillingErrorResponse` passes guard 401/403 through. Enums validated with 400.
- ledger.ts status mapping and `refunded` filter matching partially_refunded; counts per dimension exclude own filter; deterministic tie-break by key.
- collected.ts: authorisation payments excluded from AutoPay and shown as setup checks; refunds exclude `none_not_a_charge`; manual UPI never in test; per-currency lines; net live only.
- access-via.ts: never guesses; lookup failure returns `undefined` -> "Not recorded" (subscriptions/route.ts loadLatestGrants catch).
- payment-requests/route.ts: new `id` param UUID-validated, read-only `.eq('id', id)`.
- Tenant ids: accountId is only a super-admin filter, validated as UUID; no tenant id trusted for writes.
- No `.insert/.update/.upsert/.delete/.rpc` in any new or changed billing read path; route tests assert `fake.writes` is empty; events test asserts the `account_id` and `event_type` COLUMNS.
- No migrations, no package.json change, no commits (HEAD still 5f30195), account b69f6811 not referenced anywhere in the diff.
- Copy: no exclamation marks or em dashes in new prose (the only "—" are the null placeholders already used across billing tables). No `formatCurrency` left in the payments page components (plans-panel.tsx is out of scope per plan P14).
- docs/razopay/payments-page-audit-and-fix-report.md exists; README row added.

## Per-plan-item status

| Item | Status |
|---|---|
| P1 money-format + fetch-all | Done |
| P2 classifier + 25 event types + groups | Done |
| P3 labels, CHANNEL_META, cyan tone, ledger/access domains, ChannelBadge | Done |
| P4 events route rewrite, validation, server counts, tests | Done |
| P5 describeBillingEvent | Done |
| P6 Activity log UI (tiles, Channel / grouped Event type / Razorpay mode / Date filters, pageSize 20, truncated note, captions, initiated by) | Done |
| P7 ledger server + payment-requests id | Done |
| P8 access via server + methodSummary | Done |
| P9 Workspaces list + Manage dialog history | Done |
| P10 AutoPay drawer + webhook titles | Done |
| P11 nav `ledger` default + panel + page wiring | Done |
| P12 Collected server | Done |
| P13 Overview Collected card, extra status tiles, failed-payments preset | Done |
| P14 currency and polish sweep | Done |
| P15 guide content + tests | Done |
| P16 report + README + runbook sentence | Done |
| P17 verification | Done (tsc 0, vitest 222 files / 2,924 tests, eslint clean, build ok in .next-verify3, tsconfig restored) |

Findings F1-F30 are each addressed by the items above.

## Findings

None blocking.

Non-blocking notes (no action required for approval):
- Overview "AutoPay collected (test)" and "Refunded (live)" tiles open All payments with channel/status presets but no mode preset, so the ledger shows both modes until the operator picks one.
- The browser checklist (report §11) is still unverified, as verification.md states.
