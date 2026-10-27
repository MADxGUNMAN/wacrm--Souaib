# Phase 3 report: webhooks, reconciliation and billing emails

Date: 21-10-2026. Razorpay mode: Test. Scope: the demo workspace `c1db92d7-7ae4-44ac-aae7-b62e152b0341` only. Production still runs manual UPI: Razorpay is not configured there, so the new webhook answers 503 and the new cron answers `{"skipped":"not_configured"}`.

## Summary

- Razorpay can now tell the app about payments. A signed webhook is stored in under 200 ms and processed right after the response. Every event is re-read from Razorpay before anything changes.
- A cron job recovers anything a webhook missed:
  - retries failed events
  - re-reads overdue and stale subscriptions
  - closes abandoned checkouts
  - sends the billing emails
- Billing emails are live. The first one ("AutoPay is set up, you have not been charged") was sent to the demo owner for the real UPI AutoPay set up on 21-10-2026.
- Refunds and chargebacks follow D4. A full refund or a lost dispute takes back the time that payment bought. A partial refund changes nothing. The automatic ₹5 verification refund is recorded silently.
- Operators get super-admin notifications for:
  - failed charges and halted AutoPay
  - disputes, refunds and failed billing checks
  - webhooks that could not be processed

  Test-mode notices start with "[Test]", because dev shares the production database.

- **New since Phase 2:** UPI AutoPay works in test mode. You authorised `sub_TqTtwUDRjijZys` (Yearly, first charge 6 Apr 2027) with UPI at 13:18 IST. The ₹5 verification (`pay_TqTu6O7IN25VyI`) was refunded automatically (`rfnd_TqTuBfqVr07sWU`). The app recorded the authorisation and the method (`UPI te****@razorpay`).

## 1. Database (migration `20261022000000_razorpay_billing_phase3.sql`, applied)

Additive only, applied to the shared Supabase project with `apply_migration`. All 11 function bodies in the database match the file byte for byte (md5 of `prosrc` compared). Every function is service-role only.

| Change                                                             | Why                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `billing_notifications.mode`, `.env`                               | Dev and production share the outbox. Each deployment sends only its own mode and environment, so production can never email a dev test event with production links (or the reverse). |
| `billing_payments.access_revoked_at`                               | Marks the payment whose time a full refund or a lost dispute took back.                                                                                                              |
| `super_admin_notifications` type CHECK widened                     | Six new types. Every existing value is kept.                                                                                                                                         |
| `billing_enqueue_notification` (now with mode and env)             | Replaces the Phase 1 version (dropped). `billing_apply_subscription_snapshot` and `billing_apply_payment` were re-created only to call it; their bodies are otherwise unchanged.     |
| `billing_remove_payment_window`                                    | D4 roll-back. Never cuts manual time, never writes a NULL end date, and leaves things alone (for an operator) if something later extended access.                                    |
| `billing_apply_refund`, `billing_apply_dispute`                    | Moved here from Phase 1, as planned. Forward-only statuses, one email per refund, one event per dispute stage.                                                                       |
| `billing_claim_webhook_events`, `billing_claim_notifications`      | `FOR UPDATE SKIP LOCKED` work claims with leases, so overlapping ticks, after() and a second container never double-process or double-send.                                          |
| `billing_reconcile_candidates`                                     | What the cron should re-read: stale claims, expired checkouts, overdue charges, and a daily sweep.                                                                                   |
| `billing_notify_admin` + trigger `trg_billing_events_notify_admin` | Operator notices written in the same transaction as the billing event. The trigger fires only for billing event types and swallows its own errors.                                   |

The pending "AutoPay set up" email from your test (enqueued before this migration) was tagged `mode=test, env=dev` by one targeted update, so it could be delivered.

### SQL behaviour test (rolled back, demo account only)

The test ran as one `DO` block ending in `RAISE EXCEPTION`, so nothing was kept. Afterwards the account row hash, the real subscription and every table count were confirmed unchanged.

| Check                                                                | Result                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Authorise, activate, charge, then the ₹5 verification                | +30 days paid; 2 emails (set up, receipt), both tagged test/dev                               |
| Replay all of it twice more in shuffled order                        | Identical state: no extra time, events or emails                                              |
| Charge processed before "activated" (T12)                            | Identical final state                                                                         |
| Partial refund                                                       | `none_partial`, access unchanged                                                              |
| Pending, then processed rest (full)                                  | `window_removed`, access back to exactly what it was before                                   |
| Same refund replayed                                                 | `recorded`, no second email                                                                   |
| ₹5 verification refund                                               | `none_not_a_charge`, no email                                                                 |
| Refunds: emails / operator notices                                   | 2 / 2, prefixed "[Test]"                                                                      |
| Refund larger than the payment; refund on a payment that is not ours | `refund_mismatch` anomaly; `unknown_payment`                                                  |
| Full refund after an operator added 10 days                          | `unchanged_later_grant`, the 10 days kept                                                     |
| Dispute opened, then lost                                            | Window removed, `lost=true` (cancels AutoPay), 2 events, 2 notices                            |
| A late "won" after "lost"                                            | Ignored, stays `lost`                                                                         |
| Plan mismatch on a snapshot                                          | Anomaly, 1 critical "[Test] Billing check failed" notice                                      |
| Duplicate webhook insert                                             | Refused by the unique key                                                                     |
| Event claim twice; failed retry not yet due; crash-looping event     | 2 then 0; only the due one; parked as `dead`                                                  |
| Outbox claim for test/dev                                            | Only test/dev (and env-less test) rows, never prod or live; 6-attempt cap honoured; reclaim 0 |
| Reconciliation candidates                                            | `orphan_check` for a dead claim, `unauthorised` for an expired checkout                       |

## 2. Server code

New:

| File                                            | Purpose                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/billing/razorpay/webhook/route.ts` | Raw body, size cap (256 KB), HMAC on the exact bytes (current and previous secret), store once per `x-razorpay-event-id`, answer 200, process in `after()`. Returns 500 only if storing fails, so Razorpay retries.                                                         |
| `src/app/api/billing/cron/route.ts`             | `x-cron-secret` (the existing `AUTOMATION_CRON_SECRET`). Runs reconciliation and the outbox, then returns counts for `cron.log`.                                                                                                                                            |
| `src/lib/billing/razorpay/events.ts`            | Event router. Re-reads subscriptions, payments, invoices, refunds and disputes. Ignores other-environment objects, objects that are not ours, and unknown types. Retry backoff: 1 m, 5 m, 15 m, 1 h, 4 h, 12 h; after 6 attempts the event is dead and an operator is told. |
| `src/lib/billing/razorpay/reconcile.ts`         | Plan section 3.8 (a) to (e), plus retention. Bounded per tick (20 subscriptions, 25 events, 40 s budget). Cleans up orphan subscriptions by `notes.checkout_id`.                                                                                                            |
| `src/lib/billing/razorpay/store.ts`             | Typed access to events, outbox, refund/dispute functions, reconciliation runs, retention.                                                                                                                                                                                   |
| `src/lib/billing/razorpay/webhook-mapping.ts`   | Refund and dispute snapshots. Webhook parsing and entity-id extraction (only well-formed Razorpay ids survive).                                                                                                                                                             |
| `src/lib/billing/razorpay/jobs.ts`              | Wiring for the webhook, cron and after() delivery.                                                                                                                                                                                                                          |
| `src/lib/billing/notifications/deliver.ts`      | Outbox sender. Resolves the owner's address at send time, skips anything older than 48 hours, retries with backoff (1 m, 5 m, 30 m, 2 h, 6 h), at most 6 attempts.                                                                                                          |
| `src/lib/email/autopay.ts`                      | The nine AutoPay email templates. "AutoPay set up" always says the customer has not been charged and is never called a receipt. Dates are IST and say so. Card details are network + last 4 only.                                                                           |

Changed:

- `verify` and `status` routes: send any email the sync produced from `after()`.
- `src/lib/billing/razorpay/client.ts`: `fetchRefund`, `fetchDispute`.
- `src/lib/billing/razorpay/types.ts`: refund, dispute, webhook, outbox types.
- Super-admin notification types, labels and icons:
  - `notification-store.ts`
  - `super-admin/notifications/page.tsx`
  - `components/super-admin/header.tsx`
- `deploy/cron-ping.sh`: `billing` added to the endpoint loop, with the usual safety note.

Tests (65 new):

- `events.test.ts`, `reconcile.test.ts`, `webhook-mapping.test.ts`
- `notifications/deliver.test.ts`, `email/autopay.test.ts`
- `webhook/route.test.ts` (covers the webhook and cron routes)
- `__fixtures__/phase3.ts`

## 3. Verification

| Check                                                                     | Result                                                                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                        | clean                                                                                                                               |
| `npx vitest run`                                                          | 193 files, 2,418 tests passed                                                                                                       |
| `npx eslint` on changed paths                                             | clean                                                                                                                               |
| `npx prettier --write`                                                    | applied. Five unrelated billing routes it also reformatted were restored with `git checkout`.                                       |
| `next build` (`.next-verify3`)                                            | compiled, with `/api/billing/cron` and `/api/billing/razorpay/webhook` built. Output deleted, `tsconfig.json` reverted.             |
| Live, dev server: wrong signature                                         | 400, nothing stored                                                                                                                 |
| Live: signed `subscription.authenticated` for `sub_TqTtwUDRjijZys`        | 200 in 176 ms. Processed (re-read from Razorpay, applied). The pending "AutoPay set up" email was sent to the demo owner 3 s later. |
| Live: same event 5 more times                                             | 200 `duplicate:true`, 67 to 92 ms, no second processing                                                                             |
| Webhook response times (6 signed calls)                                   | 67, 69, 70, 76, 92, 176 ms. All under the 1 s target. 6 samples are too few for a real p95.                                         |
| Live: signed `refund.processed` for the real ₹5 refund                    | Processed. Refund recorded as `none_not_a_charge`. No email, no notice, account unchanged.                                          |
| Live: cron without or with the secret                                     | 401 / 200 in 407 ms, a `billing_reconciliation_runs` row `succeeded`                                                                |
| Public URL `https://devcrm.junkiescoder.com/api/billing/razorpay/webhook` | Reachable; a wrong signature gets 400                                                                                               |

Mapped to the plan's Phase 3 acceptance tests:

| Test                                                         | Status                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| T11 Replay and duplicates                                    | Pass (live duplicates; SQL replay; route test)                                                                            |
| T12 Out of order                                             | Pass (SQL test)                                                                                                           |
| T13 Webhook before verify                                    | Pass in code and SQL: whichever arrives first applies, the second is a no-op. Not yet seen with a real Razorpay delivery. |
| T15 Invalid signature                                        | Pass (live and route test)                                                                                                |
| T14 App down during an event                                 | Logic in place (store first, 500 on store failure, cron retries). Needs the Dashboard webhook to test for real.           |
| T3 Charge after authorisation, T5 Pay now, T8 Failed renewal | Need a real charge. Now that UPI works, these can be run once the Dashboard webhook is added (section 5).                 |
| Fixture replay, one email per dedupe key                     | Pass (SQL test)                                                                                                           |
| `cron.log` evidence                                          | Not yet: the server copy of `cron-ping.sh` has to be updated at deploy time (section 5).                                  |

## 4. Deviations from the plan

- **Templates live in `src/lib/email/autopay.ts`**, a sibling of `billing.ts`, rather than inside it. It keeps the AutoPay copy apart from the manual-UPI emails.
- **`payment_retry_final` is not sent yet.** The template exists, but Razorpay's exact retry count for UPI and cards is not confirmed, and "final attempt" must not be said early. It will be enabled after T8 shows the real attempt count.
- **Authorisation payments arriving by webhook are ignored.** Razorpay's ₹5 verification payment carries no invoice and no notes, so the event cannot be tied to a subscription (checked on real payments). The verify route records them, and their refunds are matched through that record.
- **Operator notices come from a database trigger** on the billing event types, so they cannot be lost between the state change and the notice.
- **Retention runs in the cron:** webhook payloads are nulled after 90 days, and finished outbox rows are deleted after 1 year (plan section 6.6).

## 5. Your actions

1. **Add the webhook in the Razorpay Dashboard** (Test Mode → Accounts & Settings → Webhooks → Add). The MCP cannot do this.
   - URL: `https://devcrm.junkiescoder.com/api/billing/razorpay/webhook`
   - Secret: the value of `RAZORPAY_WEBHOOK_SECRET` in `.env.local` (exactly, no quotes)
   - Alert email: `junkiescoder@gmail.com`
   - Events:
     - `subscription.authenticated`, `activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, `updated`, `paused`, `resumed`
     - `payment.authorized`, `captured`, `failed`
     - `invoice.paid`, `partially_paid`, `expired`
     - `refund.created`, `processed`, `failed`
     - `payment.dispute.created`, `won`, `lost`, `closed`, `under_review`, `action_required`
2. **Update the Razorpay MCP key.** The app now uses the test key starting `rzp_test_TqSJ`, but the MCP in Kiro still uses the older key. It answered "does not exist" for `pay_TqTu6O7IN25VyI`, which the app's key reads fine. Put the new key id and secret into the MCP's Basic auth header in `~/.kiro/settings/mcp.json`, so MCP checks see the same payments as the app.
3. **On the next deploy**, copy `deploy/cron-ping.sh` to `/opt/wacrm/cron-ping.sh` (CI does not do it). Then check `tail /opt/wacrm/cron.log` for a `billing http=200` line. Until production has Razorpay keys it will say `{"skipped":"not_configured"}`, which is expected.
4. **Dev has no cron.** On dev, webhooks and the payment page process everything straight away. To run reconciliation by hand, call `GET /api/billing/cron` with the `x-cron-secret` header.

## 6. Test records left in place

These are kept because they are accurate records of your real test:

- `sub_TqTtwUDRjijZys` (authenticated)
- its UPI verification payment and refund
- the sent "AutoPay set up" email row
- one reconciliation run row

Two synthetic signed events from the smoke test also remain. Their ids start `evt_P3Smoke` and `evt_P3Refund`, and they contain no personal data. The plan's end-of-testing clean-up (after Phase 5) removes all demo `billing_*` rows.

## 7. Open items

- T3, T5, T8, T13 and T14 with real Razorpay deliveries, once the Dashboard webhook is added.
- Confirm Razorpay's retry count, then enable `payment_retry_final`.
- Card mandates still fail with `SERVER_ERROR` at `card_mandate_process`. That needs Razorpay support (Phase 2 report). UPI is unaffected.
- Phase 4: the AutoPay card in Settings → Billing (status, cancel, change method, renew) and the billing history with receipts.
