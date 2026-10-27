# Phase 5 report: super-admin automated billing, delete/ban integration

Date: 22-10-2026. Razorpay mode: Test. Scope: super-admin Payments page, account delete and ban, and the Subscribers tab. Production is unchanged in behaviour: Razorpay is not configured there, so the new panels show "not configured" and the manual UPI flow keeps working under the Manual payments tab.

Review verdict: APPROVED, no findings.

## Summary

- **Super-admin Payments** now has 9 tabs: Overview, AutoPay subscriptions, Transactions, Invoices, Refunds & disputes, Webhooks & reconciliation, Subscribers, Activity, Manual payments. Every list paginates, filters, sorts and searches (by Razorpay id or account name), and every test-mode row carries an amber "Test" pill.
- **Subscription drawer** with invoices, payments, an event timeline (who did what) and webhook events. Actions are split into "Read-only" (Sync now, Copy id, Open in Razorpay) and "Changes billing" (Cancel AutoPay, which needs a typed reason, the admin password, 2FA when enabled, and a confirmation checkbox).
- **Webhook retry and on-demand reconciliation**, both audited with who triggered them.
- **Account delete cancels live AutoPay first (F7, D9).** If Razorpay refuses, nothing is deleted.
- **Account ban asks for a second confirmation when AutoPay exists**, enforced by the server. The ban always happens; the AutoPay cancel follows, and a failure is reported and raises a super-admin notification.
- **Subscribers tab shows an AutoPay column** and warns before a manual time grant or end of access on an account Razorpay will still charge (F6).

## 1. Database

Migration `supabase/migrations/20261024000000_razorpay_billing_phase5.sql`, applied to project `dknolotutfiesuhbhmze`. Additive and idempotent.

| Change                                                            | What                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscription_events_type_check`                                  | Dropped and re-added with all 24 previous values plus `billing_admin_action`. Customers never see it, because Plan activity uses an allowlist.                                                                                   |
| `billing_webhook_events`                                          | New columns `requeued_at`, `requeued_by` (FK `auth.users`, `ON DELETE SET NULL`), `requeue_count` (default 0).                                                                                                                   |
| `billing_reconciliation_runs`                                     | New column `triggered_by` (FK `auth.users`, `ON DELETE SET NULL`).                                                                                                                                                               |
| `billing_admin_audit(account, billing_subscription, actor, note)` | Writes a `billing_admin_action` event with `source='admin'`, the actor and the note (max 1000 chars). Refuses a missing actor or blank note.                                                                                     |
| `billing_admin_requeue_webhook_event(id, actor)`                  | One conditional `UPDATE` that resets a `failed` or `dead` event to `received` with 0 attempts, keeps `last_error`, records who did it, and audits when the account is known. Returns `requeued`, `not_retryable` or `not_found`. |
| `billing_admin_overview()`                                        | One STABLE query for the Overview tab: subscriptions by mode and status, trialing with AutoPay, charges due in 7 days, failed payments in 7 days, webhook health and the last reconciliation run per mode.                       |

Grants: all three functions are `SECURITY DEFINER` with `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role`. Checked live: `authenticated` and `anon` cannot execute them.

The notification CHECK already had the billing types from Phase 3, so no change was needed there.

### Live checks

| Check                                                        | Result                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `md5(prosrc)` vs file body (LF)                              | Identical. `billing_admin_audit` 2d4f168445373d3842a243617283b2c8, `billing_admin_overview` e10eca221a48feb607b7f53b8ce1cea0, `billing_admin_requeue_webhook_event` 374475192eebec5a487dbd60604582cd                                     |
| Rolled-back function test (demo account only)                | Audit row written with type, source and actor; blank note refused; a fake dead event requeued to `received`, attempts 0, count 1, `last_error` kept; second call `not_retryable`; unknown id `not_found`; overview returned all six keys |
| Rolled-back list test with 26 seeded test-mode subscriptions | Pagination, sort, status, `live` group, method, exact `sub_` id and account-name search all returned the expected counts                                                                                                                 |
| Demo account `md5(row_to_json(a)::text)` before / after      | c5fd666db77009366a38bd13be923fdd / c5fd666db77009366a38bd13be923fdd (unchanged)                                                                                                                                                          |
| Table counts before / after                                  | `subscription_events` 92/92, `billing_webhook_events` 3/3, `billing_subscriptions` 1/1, `billing_payments` 1/1; seeded rows after rollback: 0                                                                                            |

Not touched: `subscription_settings.payment_provider`, account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d`, and the working test mandate `sub_TqTtwUDRjijZys`. No Razorpay calls were made.

## 2. Routes

All under `/api/super-admin/billing/razorpay/`. Every handler checks `requireSuperAdmin` first and answers `Cache-Control: no-store` with errors as `{ error, code }`. POSTs check same-origin straight after the guard (403 `bad_origin`), validate the id and are rate limited. List responses are `{ items, total, page, pageSize, totalPages }`; query params are allowlisted and fall back to defaults.

| Route                                             | Method     | What                                                                                                                                                                  |
| ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptions`                                   | GET        | AutoPay subscriptions list (12 statuses plus a `live` group; card, upi, emandate, nach, unknown)                                                                      |
| `subscriptions/[id]`                              | GET        | Detail with invoices, payments, events, webhook events, `canAct`, `configuredMode`                                                                                    |
| `subscriptions/[id]/sync`                         | POST       | Refresh from Razorpay and audit; 30 per 10 min                                                                                                                        |
| `subscriptions/[id]/cancel`                       | POST       | `{ password, code?, reason, confirm: true }`; 5 per 15 min, counted before the password check; immediate cancel, audit with the reason, customer email from `after()` |
| `transactions`, `invoices`, `refunds`, `disputes` | GET        | Lists                                                                                                                                                                 |
| `webhook-events`                                  | GET        | List with explicit columns only; the raw `payload` is never selected                                                                                                  |
| `webhook-events/[id]/retry`                       | POST       | Requeue a failed or dead event and process it from `after()`; 30 per 10 min                                                                                           |
| `reconcile`                                       | GET / POST | Recent runs; run now with `scope='admin'` and the actor; 3 per 10 min                                                                                                 |
| `overview`                                        | GET        | `{ configured, mode, overview }`; works when Razorpay is not configured                                                                                               |

Any action that calls Razorpay requires the row's mode to match the server's mode, otherwise 409 `mode_unavailable`. Razorpay errors are shown to the operator with Razorpay's own wording and HTTP status (502 `provider_error`).

Shared library: `admin-query.ts`, `admin-status.ts`, `admin-db.ts`, `admin-http.ts`, `admin.ts`, `account-autopay.ts` in `src/lib/billing/razorpay/`, and `src/lib/super-admin/reauth.ts`. The delete flow's password and 2FA check moved into `reauth.ts`, with the same messages and codes, so delete and cancel use identical checks.

## 3. UI

- **`/super-admin/payments`:** tab and open subscription live in the URL (`?tab=…&sub=…`), unknown tabs fall back to Overview, and the tab bar scrolls horizontally. The manual pending count shows on its tab label from page load.
- **Overview:** configured/mode banner, manual pending tile, and per-mode blocks (live first) for trialing with AutoPay, active, authorised, pending, halted, cancelled, completed, charges due, failures, webhook health and the last reconciliation run.
- **Subscriptions, Transactions, Invoices, Refunds & disputes:** filterable tables. Disputes due within 3 days are highlighted with "Due in N days", "Due today" or "Deadline passed".
- **Webhooks & reconciliation:** events default to "Failed or dead", with an anomaly toggle and Retry (with a confirm) on failed or dead rows. The runs table shows who triggered each run, plus "Run reconciliation now".
- **Drawer actions are disabled with the reason** when the row's mode is not this server's, there is no Razorpay id, or the status cannot be cancelled. The 2FA field appears after the server asks for it.
- **Subscribers:** new AutoPay column (status, Test pill, method, next charge, or "None"/"Unknown"). The manage dialog shows the F6 warning with a link to the subscription.
- **Activity:** labels for `billing_admin_action` ("Admin billing action") and the AutoPay, payment, refund and dispute event types.

## 4. Delete and ban behaviour

Live AutoPay statuses: `created`, `authenticated`, `active`, `pending`, `halted`, `paused`. Razorpay answers "already cancelled" or "not found" are treated as done; anything else is a failure.

**Delete** (`DELETE /api/super-admin/accounts/[id]`): token, confirm word and existing checks, then cancel every live AutoPay, then `sa_delete_account`, then storage purge. Reachability is checked for every subscription before any is cancelled, so a refusal never leaves a half-done state. The verify step returns `live_autopay` so the dialog can say "Razorpay AutoPay {id} ({mode}, {status}) will be cancelled first. If Razorpay refuses, nothing is deleted." No email is sent, because the outbox rows go with the account.

Refusals:

| Code                    | Status | Message                                                                                                                                                                           |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout_in_progress`  | 409    | A Razorpay checkout is being set up for this workspace right now. Wait 15 minutes, then try again.                                                                                |
| `autopay_unreachable`   | 409    | This workspace has a Razorpay AutoPay in {mode} mode ({sub_id}) that this server cannot reach. Cancel it from Payments on the server where {mode} mode is set up, then try again. |
| `autopay_cancel_failed` | 502    | Razorpay did not cancel this workspace's AutoPay ({sub_id}), so nothing was deleted. Razorpay said: {message}. Try again in a minute.                                             |

`autopay_unreachable` also covers production today: Razorpay is not configured there, so it refuses to delete an account whose AutoPay it cannot reach instead of leaving a mandate charging at Razorpay.

**Ban** (`POST /api/super-admin/accounts/[id]/ban`, now same-origin checked):

1. With a cancellable AutoPay and no `confirmAutopayCancel: true`, the server answers 409 `autopay_confirmation_required` and bans nothing. The page then shows "Ban and cancel AutoPay?", explaining that unbanning does not restore AutoPay.
2. With confirmation, the account is banned first, then AutoPay is cancelled and audited with the reason. The customer gets the normal "AutoPay cancelled" email.
3. If the cancel fails, the account stays banned, the response reports `autopay.outcome: 'failed'` with the message, and a `billing_anomaly` notification "Account banned but AutoPay was not cancelled" is raised. The page toasts "Account banned, but AutoPay was not cancelled: {message}".

Unban is unchanged and does not restore AutoPay.

## 5. Verification

| Check                                        | Result                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                           | clean                                                                                                                               |
| `npx vitest run`                             | **204 files, 2,576 tests passed** (Phase 4 ended at 198 / 2,467, so 6 new files and 109 new tests)                                  |
| `npx eslint` on the 51 Phase 5 source files  | exit 0, 0 errors, 1 pre-existing warning (`accounts/[id]/page.tsx:139` `react-hooks/exhaustive-deps`, a line Phase 5 did not touch) |
| `npx prettier --write` on the same files     | no file changed                                                                                                                     |
| `next build` (`NEXT_DIST_DIR=.next-verify3`) | compiled; route table lists all 12 new routes and `/super-admin/payments`. Output deleted, `tsconfig.json` restored                 |

New or extended tests:

- `admin-query.test.ts`: defaults, allowlists, clamps, provider-id search, ilike escaping
- `admin.test.ts`: cancel and sync order, tolerated errors, mode mismatch, 5xx, audit text
- `account-autopay.test.ts`: live statuses, initiating rule, unreachable mode, refusal, ban audit
- `reconcile.test.ts`: scope and `triggeredBy`
- `billing/razorpay/routes.test.ts`: 403 for non-super-admins on every route, cross-origin 403 on every POST, wrong password refused before any Razorpay call, 2FA, reason and confirm, mode mismatch, rate limits, no `payload` selected
- `delete-account.test.ts`: AutoPay cancelled before `sa_delete_account`; refused on cancel failure and unreachable mode
- `ban/ban-route.test.ts`: confirmation required, ban then cancel, failure reported and notified
- `autopay-warning.test.tsx`: F6 warning per status, test-mode label, give vs end copy

## 6. Plan acceptance (Phase 5)

| Criterion                                                             | Status                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Every list paginates, filters and searches (25+ seeded rows)          | Pass at SQL level with 26 seeded rows in a rolled-back block; route and param logic covered by unit tests                                   |
| Cancel and retry are audited                                          | Pass (route tests assert the audit and requeue calls with the actor; the SQL function writes its own row)                                   |
| Deleting an account with a live test sub cancels it first, or refuses | Pass in logic and tests. Not run live, because the only live test sub is `sub_TqTtwUDRjijZys` on the demo account. A real run is your call. |
| Banning follows D9                                                    | Pass (route tests)                                                                                                                          |

## 7. Deviations from the plan

- **Admin cancel is always immediate**, not "immediate or at cycle end" (§7.4). Same reasoning as the customer cancel in Phase 4: access lives in `accounts.subscription_ends_at`, which a cancel never touches, so paid time is kept either way, and "at cycle end" on a pending or halted mandate could still collect.
- **Admin cancel re-auth is one step** (password and 2FA in the same request as the reason), not the delete flow's token handshake, because there is only one call. The checks themselves are shared.
- **Manual payments stays actionable** for pending rows instead of read-only (§9), because production still runs manual UPI. Phase 6 retires it.
- **Webhook events list accepts a `retryable` status group** (failed or dead) so the tab can default to it.
- **The subscriptions list shows "Cycle ends"** (Razorpay `current_end`), not paid-through, because the list has no paid-through value and showing one as the other would be a guess. Paid-through is in the drawer.
- **Transactions have no settlement id**, because `billing_payments` has no such column.
- **Audit writes are best-effort.** A failed audit never turns a completed Razorpay cancel into an error; it is logged.
- **Ban with only a fresh checkout claim** (no Razorpay id yet) does not ask for confirmation, since there is nothing to cancel. The cancel step then reports `checkout_in_progress` as a failure and raises the notification.

## 8. Open items

- **Razorpay Dashboard deep links are unverified.** "Open in Razorpay" uses `https://dashboard.razorpay.com/app/subscriptions/{id}` and `/app/payments/{id}`. Please click one and tell me if it lands on the wrong page.
- **A stale `initiating` claim is not searched at Razorpay on delete.** If a checkout created a subscription at Razorpay but never recorded its id, delete cannot cancel it. This needs a manual check in the Dashboard if it ever happens.
- **Not clicked through in a browser yet.** The new Payments tabs, drawer, ban confirm and delete note are covered by tests and the build, but not by a live session.
- **Sync and retry rate limits** are checked by reading the code; tests cover only the cancel and reconcile limits.
- **One existing reconciliation run** has `finished_at` about a minute before `started_at` (app clock vs database clock). The UI hides negative durations; the data is unchanged.
- **Carried over:** card mandates still fail inside Razorpay (`card_mandate_process`); `payment_retry_final` stays off until a real failed renewal; demo billing clean-up (the demo account's `billing_*` rows and the test events `evt_P3Smoke…`, `evt_P3Refund…`, `TqYHsc23921wqu`) is still to do.

## 9. Your actions

1. **Open `/super-admin/payments` on devcrm** as `junkiescoder@gmail.com` (about 5 minutes):
   - Overview should show the demo AutoPay under Test as authorised.
   - AutoPay subscriptions should list `sub_TqTtwUDRjijZys` with a Test pill. Open it and press **Sync now** (read-only). Do not cancel it unless you want to end the only working test mandate.
   - Try **Open in Razorpay** and confirm the link format.
   - Webhooks & reconciliation: press **Run reconciliation now** once and check the run shows you as the trigger.
2. **Subscribers:** open Manage on the demo account and check the amber AutoPay warning appears.
3. **Decide on the live delete/ban test.** Doing it for real would cancel `sub_TqTtwUDRjijZys`. If you want it, I would set up a second throwaway test workspace with its own UPI AutoPay first.
4. **Decide when to run the demo billing clean-up** listed above.
