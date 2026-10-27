# Phase 6 report: existing-customer transition and manual-flow retirement

Date: 22-10-2026. Spec: `docs/razopay/razorpay-subscriptions-plan.md` section 15 (Phase 6), section 11, section 7.2 last row, sections 8.1 and 8.3, section 3.4 flow D, section 9 item 9, F11.

Production is unchanged: it has no Razorpay keys, so every production account still gets the manual UPI flow, and the shared `subscription_settings.payment_provider` stays `manual_upi` (never written in this phase).

## Summary

- **Dev provider switch without touching the shared database.** New dev-only env var `BILLING_PROVIDER_OVERRIDE` (`manual_upi` or `razorpay`). `manual_upi` puts the whole dev deployment back on the QR flow; removing it gives allowlisted accounts Razorpay again. Ignored when `BILLING_ENV=prod`.
- **Manual UPI retired per account.** `POST /api/billing/payment-requests` and `GET /api/billing/upi-qr` answer `410 { code: 'manual_payments_retired' }` when the account's purchase flow is Razorpay. History (`GET /api/billing/payment-requests`) is never retired and no manual code was deleted.
- **Checkout refuses while a manual payment is under review** (Phase 2 open item). Checkout `GET` and `POST` answer `409 { code: 'manual_payment_pending' }` before any claim or Razorpay call.
- **Opt-in AutoPay prompts** for existing customers: "You're paid until X. Set up AutoPay to renew automatically on X." (paid), a trial variant and a lapsed variant. Same words on the Billing AutoPay card and on `/upgrade-plan`.
- **Manual payments tab read-only** for reviewed rows; Approve/Reject only for rows still pending. Label and notice follow the server's `manualIntake`.
- **Refund and Cancellation Policy** drafted as an **unpublished** `legal_pages` row. The payment page links to it only once it is published.
- **`docs/billing-runbook.md`** written.

## 1. Provider-switch mechanism

`readRazorpayConfig` (`src/lib/billing/razorpay/config.ts`) reads `BILLING_PROVIDER_OVERRIDE` only when `BILLING_ENV=dev`. Empty means no override. An invalid value on dev is refused with `RazorpayConfigError` naming the variable (not its value), which makes Razorpay unavailable on that deployment, so it fails closed to manual UPI. With `BILLING_ENV=prod` the variable is ignored rather than refused, because a config error would also stop the webhook processor.

`resolvePaymentProvider` (`src/lib/billing/razorpay/provider.ts`) now decides in this order:

| Rule | Condition                       | Answer                                                        |
| ---- | ------------------------------- | ------------------------------------------------------------- |
| 1    | no Razorpay config (production) | `manual_upi`                                                  |
| 2    | override = `manual_upi`         | `manual_upi` for every account on this deployment             |
| 3    | test mode                       | allowlist decides (an override of `razorpay` changes nothing) |
| 4    | live mode with a pilot list     | pilot list decides                                            |
| 5    | live mode                       | override if set, else the DB flag                             |

How to flip on devcrm:

- **QR flow:** add `BILLING_PROVIDER_OVERRIDE=manual_upi` to `.env.local`. Next dev reloads env files; restart the dev server if the log does not show the reload.
- **Razorpay again:** remove the line (or set it to `razorpay`).

Why production cannot be affected: rule 1 (no keys there), `BILLING_ENV=prod` ignores the override, and the DB flag is never written.

A matching pure resolver `resolveManualIntake` answers `open` (no config, or override `manual_upi`, or live with the flag on manual), `partial` (test mode or live pilot) or `retired` (live with the override or flag on Razorpay). It only drives super-admin wording.

## 2. Database changes

| Item           | Detail                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration file | `supabase/migrations/20261025000000_razorpay_billing_phase6.sql`                                                                                                         |
| Applied        | Supabase MCP `apply_migration`, name `razorpay_billing_phase6`, registered as version `20261022105804`                                                                   |
| Change         | One `INSERT ... ON CONFLICT (slug) DO NOTHING` into `legal_pages`: slug `refund-and-cancellation-policy`, title "Refund and Cancellation Policy", `is_published = false` |
| Content check  | DB `md5(content_markdown)` = `1b7ebd3af2b07fd5e8637dceb40bcd8c` (2,720 chars), identical to the md5 of the body in the file                                              |
| Idempotency    | Re-running the INSERT inside the rolled-back check left the row count unchanged and did not overwrite the draft                                                          |
| md5(prosrc)    | Not applicable. Phase 6 creates no SQL functions, so there is nothing to compare                                                                                         |
| Grants         | None needed (no new objects)                                                                                                                                             |
| Customer rows  | No UPDATE or DELETE anywhere                                                                                                                                             |

The draft starts with a "Draft for review" note and a `[confirm contact]` marker, covers plans and AutoPay (30 or 360 days, ₹5 card check refunded), deferred first charge, how to cancel (owner only), when access ends (D3), refunds (D4: no pro-rating, full refund or lost dispute removes the window and cancels AutoPay, partial changes nothing), failed payments (retries, up to 3 days of access), earlier manual UPI payments, and contact `legal@junkiescoder.com` (the address in the Terms of Service). No GST statements (D10 is open). "Last updated: on publication" rather than an invented date.

Public visibility: `getLegalPage`, `getLegalPagesList` and the sitemap all filter `is_published = true`, so `/legal/refund-and-cancellation-policy` 404s and the footer and sitemap do not list it until it is published.

## 3. Routes

| Route                                           | Change                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/billing/payment-requests`            | After the owner check, before rate limit and body parsing: `410 { error, code: 'manual_payments_retired' }`, `Cache-Control: no-store`, when the account resolves to Razorpay. Nothing stored or emailed                                                  |
| `GET /api/billing/payment-requests`             | Unchanged (history)                                                                                                                                                                                                                                       |
| `GET /api/billing/upi-qr`                       | Same 410 right after the owner check, before any price lookup                                                                                                                                                                                             |
| `GET` and `POST /api/billing/razorpay/checkout` | After the provider check: `409 { code: 'manual_payment_pending' }` when `getPendingPaymentRequest` finds a row. Message: "A manual UPI payment for this workspace is still being reviewed. You can set up AutoPay once it has been approved or rejected." |
| `GET /api/billing/subscription`                 | Adds `copy.refundPolicyHref` (`/legal/refund-and-cancellation-policy` only when that page is published; any read error answers null)                                                                                                                      |
| `GET /api/super-admin/billing/payment-requests` | Adds `manualIntake`. A settings read failure does not break the queue. PATCH unchanged: approve and reject already only succeed on `pending` rows via the conditional claim                                                                               |

The 410 helper is `src/lib/billing/manual-retirement.ts`. It skips the settings read entirely when Razorpay is not configured, so production pays no extra query.

## 4. UI

- **`/upgrade-plan/payment`:** a stale `?status=pending` URL no longer sends a Razorpay account to the manual screen (an actual pending payment still does). `RazorpayPayment` shows the 409 message with a "View payment status in Billing" link (only while the dashboard is reachable). Under the consent checkbox, "Read our Refund and Cancellation Policy" appears only once the page is published.
- **`ManualUpiPayment`:** on a 410 from the QR route it shows the server message and a "Choose a plan" button to `/upgrade-plan`. `PaymentSubmissionForm` already displays `body.error`, so a 410 there reads correctly with no change.
- **Settings -> Billing, AutoPay card (not set up):** "You're paid until 21 Nov 2026." / "Set up AutoPay to renew automatically on 21 Nov 2026. Nothing is charged before then." Trial: "Your free trial runs until X." / "Set up AutoPay now and your first charge is on X. Nothing is charged before then." Lapsed: "Your access has ended." / "Set up AutoPay to pay now and renew automatically." Owners get "Set up AutoPay"; members get the text and "Only the workspace owner can change billing."
- **`/upgrade-plan` coverage notice:** the Razorpay small print now uses the same prompt. The manual UPI text and the sticky-bar text are unchanged.
- **Super-admin -> Payments -> Manual payments:** label "Manual payments (history)" when intake is `partial` or `retired`. Notice for `partial`: "Accounts on Razorpay AutoPay on this server can no longer pay by manual UPI. Other accounts still can." For `retired`: "Manual UPI payments are retired. This list is history. Approve and Reject stay available only for requests that were still pending at cutover." `open` (production) renders as before. The drawer shows "Read-only. This request has already been reviewed." for non-pending rows; pending rows keep Approve and Reject.

All dates in the prompts are IST via `formatBillingDate`.

## 5. Historical data (Phase 6 acceptance)

Measured with read-only SQL before any change (`10:44:15 UTC`) and after all work, including the rolled-back live check (`11:07:51 UTC`). Checksum = md5 of the ordered list of per-row `md5(row_to_json(row))`.

| Measure                                           | Before                             | After                              | Same          |
| ------------------------------------------------- | ---------------------------------- | ---------------------------------- | ------------- |
| `payment_requests` rows                           | 6                                  | 6                                  | yes           |
| `payment_requests` checksum                       | `6553080635e375d5543525cb10367c6f` | `6553080635e375d5543525cb10367c6f` | yes           |
| `payment_requests` pending                        | 0                                  | 0                                  | yes           |
| `subscription_events` rows                        | 94                                 | 94                                 | yes           |
| `subscription_events` checksum                    | `299a80642dcbfc8a8bc369914dd6116f` | `299a80642dcbfc8a8bc369914dd6116f` | yes           |
| `subscription_events` checksum, pre-baseline rows | `299a80642dcbfc8a8bc369914dd6116f` | `299a80642dcbfc8a8bc369914dd6116f` | yes           |
| Demo account row md5                              | `c5fd666db77009366a38bd13be923fdd` | `c5fd666db77009366a38bd13be923fdd` | yes           |
| `payment_provider`                                | `manual_upi`                       | `manual_upi`                       | yes           |
| `legal_pages`                                     | 5, all published                   | 5 published + refund draft (false) | additive only |

No `subscription_events` rows were added during the phase.

## 6. Verification

Full log: `.agents/tasks/razorpay-phase6/verification.md`.

| Check                                               | Result                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npx tsc --noEmit 2>&1 \| Select-String "error TS"` | 0 errors (before and after prettier)                                                       |
| `npx vitest run`                                    | 206 files, 2,612 tests, all passed (was 204 / 2,576)                                       |
| `npx eslint` on the 25 touched source files         | exit 0, no errors or warnings                                                              |
| `npx prettier --write` on touched files and docs    | done; see the prettier note below                                                          |
| `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` | exit 0, compiled in 31.5 s; all touched routes in the route table                          |
| Cleanup                                             | `git checkout -- tsconfig.json`; `.next-verify3` deleted; `scratch/` phase-6 files deleted |
| Migration content                                   | DB md5 = file md5 `1b7ebd3af2b07fd5e8637dceb40bcd8c`                                       |
| md5(prosrc)                                         | N/A, no functions                                                                          |
| Live SQL check (demo account, rolled back)          | `phase6 check ok, rolled back`                                                             |
| Before/after checksums                              | identical (section 5)                                                                      |

Permanent tests added:

| File                                                  | Covers                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/billing/manual-retirement.test.ts` (new) | 410 on POST and QR for an allowlisted account, nothing stored, no price lookup; override `manual_upi` restores; no config (production) never 410; non-allowlisted not 410; history 200; member 403 first |
| `src/lib/billing/razorpay/opt-in.test.ts` (new)       | none for manual / mandate / billing off; paid (IST date, queued paid window); trial; lapsed; past dates ignored                                                                                          |
| `src/lib/billing/razorpay/provider.test.ts`           | override beats allowlist, pilot and DB flag; `razorpay` override cannot admit a non-allowlisted account; live dev override replaces the flag; `resolveManualIntake` every branch                         |
| `src/lib/billing/razorpay/config.test.ts`             | override parsing on dev, ignored on prod, invalid value refused naming the variable only                                                                                                                 |
| `src/app/api/billing/razorpay/routes.test.ts`         | checkout POST and preview 409 with a pending manual payment, no claim or Razorpay call; provider check still first                                                                                       |
| `src/components/settings/autopay-card.test.tsx`       | paid and trial prompts, owner CTA, member without CTA, `none` fallback                                                                                                                                   |

Prettier note: it reformatted pre-existing non-Prettier code in three touched files (`src/app/api/super-admin/billing/payment-requests/route.ts`, `src/app/api/billing/upi-qr/route.ts`, `src/components/super-admin/billing/payment-request-drawer.tsx`), so those diffs look larger than the change. No untouched file was modified.

## 7. Phase 6 acceptance

| Criterion                                                                                  | Result                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flipping the provider on dev switches the whole purchase UI, and flipping back restores QR | Pass in tests: the resolver, the 410 routes, the payment-page choice and the opt-in prompt all key on the same `paymentProvider`, and the override test proves the QR route works again. Browser check on devcrm is a user action (section 10) |
| Historical rows identical before and after                                                 | Pass: counts and checksums of `payment_requests` and `subscription_events` identical (section 5)                                                                                                                                               |
| Refund and Cancellation legal page                                                         | Drafted, not live. Publishing is your action (section 10)                                                                                                                                                                                      |

## 8. Deviations from the plan

- **"When `payment_provider='razorpay'`" (section 7.2)** is read as "when `resolvePaymentProvider` answers Razorpay for this account on this deployment". Keying on the raw DB flag would leave the dev demo account able to submit manual payments while its UI shows Razorpay. After the Phase 7 cutover the DB flag drives it through rule 5.
- **Dev switch is an env var, not the DB flag**, because the flag is shared with production.
- **Opt-in copy is hard-coded** like the rest of the Phase 4 AutoPay card copy, rather than new admin-editable `subscription_settings` columns (avoids a settings migration for copy).
- **Lapsed prompt only when the server says expired or blocked.** An account with no future window for another reason gets the generic "Not set up" text rather than a guessed "Your access has ended."
- **Manual tab label varies with intake** ("(history)" only when partial or retired), so production's working queue looks exactly as before.
- **Legal page drafted, not live**, and the payment-page link stays hidden until it is published.

## 9. Open items

- Browser check of the dev flip (section 10, step 1).
- Legal review and publication of the refund policy (section 10, step 2).
- Phase 7 cutover: re-check `select count(*) from payment_requests where status = 'pending'` is 0 (or decide those rows) immediately before setting `payment_provider = 'razorpay'`.
- `getPendingPaymentRequest` returns null on a read error (existing behaviour), so a database error lets checkout continue rather than refusing. The partial unique index still prevents two pending manual rows; flagging it in case you want checkout to fail closed instead.
- Carried over: card mandates still fail inside Razorpay test mode (`SERVER_ERROR` at `card_mandate_process`), needs Razorpay support. Phase 5 browser items as listed in that report.

## 10. Your actions

1. **Flip check on devcrm.** Add `BILLING_PROVIDER_OVERRIDE=manual_upi` to `.env.local`, restart the dev server if needed, open `/upgrade-plan/payment` (pick a plan first) as the demo owner and confirm the QR screen. Remove the line, reload, and confirm the Razorpay AutoPay screen returns. (The demo account already has AutoPay, so the payment page may show "AutoPay is already set up" in the Razorpay state; that is the Razorpay screen.)
2. **Review and publish the Refund and Cancellation Policy** in Super-admin -> CMS -> Legal. Remove the draft note and the `[confirm contact]` marker, then publish. Check the footer link and the "Refund and Cancellation Policy" link under the consent box on the payment page.
3. **Read `docs/billing-runbook.md`** and correct anything that does not match how you operate.
