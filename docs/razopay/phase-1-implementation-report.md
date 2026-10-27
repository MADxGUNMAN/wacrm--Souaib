# Phase 1 report: database tables and server foundation

Date: 21-10-2026 (IST). Plan: [razorpay-subscriptions-plan.md](./razorpay-subscriptions-plan.md), section 15, Phase 1.

**Customer impact: none.** No route, page or email uses the new code yet. `subscription_settings.payment_provider` is `manual_upi`, so the existing QR + UTR flow is unchanged. Nothing is committed or deployed.

## 1. Database (applied to the shared Supabase project `dknolotutfiesuhbhmze`)

These migrations hit production immediately, because dev and prod share one database. All three are additive: they create tables and columns and widen CHECK lists, and they update or delete no existing row.

| Migration                                                               | What it adds                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261021000000_razorpay_billing_schema.sql`        | 10 tables: `billing_provider_plans`, `billing_customers`, `billing_subscriptions`, `billing_invoices`, `billing_payments`, `billing_refunds`, `billing_disputes`, `billing_webhook_events`, `billing_notifications`, `billing_reconciliation_runs`. Adds `accounts.billing_grace_ends_at`, plus `subscription_events.billing_subscription_id`, `billing_payment_id` and `source`. 15 new event types. |
| `supabase/migrations/20261021010000_razorpay_billing_functions.sql`     | Checkout claim and attach, mark failed/superseded, apply subscription snapshot, apply payment and invoice, autopay grace, outbox enqueue, and helpers                                                                                                                                                                                                                                                 |
| `supabase/migrations/20261021020000_razorpay_billing_settings_copy.sql` | `payment_provider` (default `manual_upi`), `autopay_grace_days` (default 3, D2), Checkout name and description, consent, summary and cancel copy                                                                                                                                                                                                                                                      |

### Key safeguards in the schema

- **One live AutoPay per account:** partial unique index `billing_subscriptions_one_live`. This is what stops two tabs or a double click creating two mandates.
- **Idempotency:** unique constraints on every provider id (subscription, payment, invoice, refund, dispute), on `(mode, x-razorpay-event-id)` for webhooks, and on `dedupe_key` for emails.
- **Money:** integer paise (`BIGINT`) plus `CHAR(3)` currency, with `CHECK`s. Card last4 must be 4 digits. No PAN, CVV, full VPA, email or phone columns.
- **`mode` on every row** (`test`/`live`), so test activity on the shared database stays separate.

### Verified after applying

| Check                                                    | Result                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS on all 10 new tables                                 | yes                                                                                                                                                      |
| Client policies                                          | 0 on every new table                                                                                                                                     |
| `anon` / `authenticated` table privileges                | 0 (revoked)                                                                                                                                              |
| `anon` / `authenticated` EXECUTE on the 11 new functions | none; `service_role` only                                                                                                                                |
| Accounts with `billing_grace_ends_at` set                | 0 (no behaviour change)                                                                                                                                  |
| `payment_requests` rows                                  | 6, unchanged                                                                                                                                             |
| `subscription_events` rows                               | 90, unchanged                                                                                                                                            |
| Supabase security advisor                                | No new warnings. New tables appear only under the INFO "RLS enabled, no policy" item, which is intended (service role only, like `subscription_events`). |

### SQL behaviour test (19 scenarios, rolled back)

I ran the functions against the demo account inside one transaction that raises an exception at the end, so **nothing persisted**. Afterwards: 0 billing rows, demo account unchanged.

| #   | Scenario                                     | Result                                                               |
| --- | -------------------------------------------- | -------------------------------------------------------------------- |
| 1   | New checkout claim                           | `claimed`                                                            |
| 2   | Second tab while the first is still creating | `in_progress`                                                        |
| 3   | Provider subscription attached               | `attached`                                                           |
| 4   | Second tab after creation                    | `reuse` (same subscription)                                          |
| 5   | Different plan or intent while one is open   | `supersede_required`                                                 |
| 6   | Mandate authorised                           | `created -> authenticated`                                           |
| 7   | Same snapshot replayed                       | 1 event, 1 mandate email (no duplicate)                              |
| 7b  | Grace while the first charge is due          | paid-through + 3 days                                                |
| 8   | Older snapshot arriving late                 | `stale`, ignored                                                     |
| 9   | `notes.account_id` mismatch                  | `account_mismatch` anomaly, nothing changed                          |
| 10  | ₹5 authorisation payment                     | Stored as `authorization`. Card summary saved. **Access unchanged.** |
| 11  | Subscription goes active                     | `authenticated -> active`                                            |
| 12  | Payment captured but invoice not yet `paid`  | `awaiting_invoice`, no access granted                                |
| 13  | Captured payment + paid invoice              | `granted`. Paid-through + exactly 30 days, status `active`.          |
| 14  | Same payment replayed                        | No extra time, 1 receipt email, 1 success event                      |
| 14b | Stale "authorized" after "captured"          | Status stays `captured`                                              |
| 15  | Wrong amount (₹500 instead of ₹990)          | `amount_mismatch` anomaly, no extra time                             |
| 15b | Invoice names a different payment            | `invoice_payment_mismatch` anomaly                                   |
| 16  | Failed payment seen twice                    | 1 failure event                                                      |
| 17  | Renewal fails (`pending`)                    | 1 failure email, grace = due date + 3 days                           |
| 18  | Retries exhausted (`halted`)                 | Grace cleared, 1 action-required email                               |
| 19  | Event for another mode                       | `unknown_subscription`, ignored                                      |

## 2. Server code

New, under `src/lib/billing/razorpay/`:

| File                  | Purpose                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`           | Reads env and fails closed. Refuses: a key prefix that doesn't match the mode, test mode when `BILLING_ENV=prod`, test mode without an account allowlist, short or missing secrets. Error messages never contain values. |
| `client.ts`           | Typed REST client (no new npm dependency). Retries GETs on 429/5xx/network errors and POSTs only on 429. Recognises Razorpay's 400 "not found" and "already cancelled".                                                  |
| `signature.ts`        | Checkout and webhook HMAC checks: constant time, hex only, current + previous webhook secret.                                                                                                                            |
| `money.ts`            | Rupees ↔ paise. Refuses sub-paise amounts instead of rounding silently.                                                                                                                                                  |
| `mapping.ts`          | Razorpay entities → snapshots for SQL (no email/phone; masked VPA; card last4 only). Customer-facing state labels (plan section 3.5) and plain-language failure reasons.                                                 |
| `checkout.ts`         | Pure rules: first charge at the end of current coverage (trial end, paid end, or queued paid window), else immediate; 10-minute safety margin; 10-year `total_count`; trial-offer visibility.                            |
| `plans.ts`            | Catalogue → Razorpay daily plan (30/360 days, D1), price-change aware, safe under concurrent checkouts.                                                                                                                  |
| `types.ts`            | Entity and row types.                                                                                                                                                                                                    |
| `__fixtures__/*.json` | Redacted real Phase 0 responses used by the tests.                                                                                                                                                                       |

Changed:

- `src/lib/subscription/status.ts`: `resolveSubscriptionState` honours `billing_grace_ends_at` and exposes `autopayGraceEndsAt`. It never overrides an operator's forced `expired`, and it has no effect when the column is null.
- `src/lib/subscription/types.ts`: `billing_grace_ends_at` on the account row, plus the new settings fields.
- `src/lib/subscription/queries.ts`: selects the grace column, and adds fallback defaults for the new settings.
- `src/proxy.ts`: the gate's existing account query also reads `billing_grace_ends_at` (no extra round trip).
- `.env.local.example`: Razorpay section. `.env.docker.example` got the same section, but that file is gitignored, so the change exists only on this machine.

## 3. Verification

| Check                                                                           | Result                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` (src)                                                        | 0 errors                                                                                                 |
| `npx vitest run`                                                                | **181 files, 2288 tests passed** (66 new)                                                                |
| `npx eslint` on touched paths                                                   | 0 errors, 0 warnings                                                                                     |
| `npx prettier --write`                                                          | Applied. The four edited existing files were already Prettier-clean, so their diffs are only my changes. |
| `NEXT_DIST_DIR=.next-verify3 npm run build`                                     | Succeeded. The build's temporary `tsconfig.json` edit was reverted and the output deleted.               |
| Resolver before/after diff, all 19 real accounts at now, +1, +7, +30, +200 days | **0 differences** (95 comparisons)                                                                       |
| Real Razorpay test API, read-only smoke test of client + config + mapping       | 4/4 passed                                                                                               |

## 4. Deviations from the plan (and why)

- **Refund and dispute SQL functions** (`billing_apply_refund`, `billing_apply_dispute`, `billing_recompute_paid_through`) move to **Phase 3**, where the webhook events that drive them arrive. Phase 1 instead records `billing_payments.paid_through_before` at every grant, so a full refund can later roll back exactly the time that payment bought.
- **Grace rule made precise.** Grace applies only while a mandate is `authenticated`/`active`/`pending` and Razorpay's due date falls within the grace window. Example: if an admin shortens a trial after the customer authorised, the customer gets no free days until the original charge date.
- **Only day-based cycles can use AutoPay.** A calendar-month cycle is refused with a clear error rather than converted (D1). Both live cycles are day-based.
- **The real Checkout signature formula is not yet confirmed** against a live response, because of the Phase 0 authorisation blocker. It is implemented and unit-tested exactly as Razorpay documents it.

## 5. Open items carried forward

1. The Phase 0 blocker: complete one test authorisation by hand (Phase 0 report, section 5, step 3).
2. Turn off eMandate and check Flash Checkout in the Dashboard (Phase 0 report, section 5).
3. UPI AutoPay access is pending with Razorpay.
4. Emails enqueued by these functions are delivered only from Phase 3. The Phase 3 sender skips anything older than 48 hours, so nothing stale is ever sent.
5. Regenerate the test key secret before Phase 2.
