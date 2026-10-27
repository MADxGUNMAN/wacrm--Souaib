# Phase 2 report: checkout (test mode, demo account only)

Date: 21-10-2026. Razorpay mode: Test. Scope: the demo workspace `c1db92d7-7ae4-44ac-aae7-b62e152b0341` only (test allowlist). Production still runs manual UPI, because Razorpay is not configured there.

## Summary

- The payment step now offers Razorpay AutoPay to accounts the server picks, and keeps the manual UPI flow unchanged for everyone else.
- The full server path works against Razorpay in a real browser: preview, consent, subscription creation (deferred to the demo's paid end, 6 Apr 2027), Checkout opening, and reuse of the same subscription on later attempts.
- The CSP check in Edge found one missing host (`cdn.razorpay.com`). It is fixed, and a re-run showed no violations on our page.
- Still blocked on Razorpay's side: a real card authorisation (every attempt fails with `SERVER_ERROR` at `card_mandate_process`) and UPI AutoPay (access pending). So the "paid" and "AutoPay authorised" screens are covered by unit tests, not yet by a live payment.

## 1. Latest payment attempts (Razorpay MCP `fetch_all_payments`)

These are the attempts from your manual test links, recorded as requested. All are on customer `cust_TqS6C4hb4VZ0D7`, which has 0 saved tokens. Contact details in the Razorpay records are deliberately not copied here.

| Payment              | Time (IST, 21-10-2026) | Amount | Invoice / order                               | Result                                                               |
| -------------------- | ---------------------- | ------ | --------------------------------------------- | -------------------------------------------------------------------- |
| `pay_TqS47DrLl0bkaW` | 11:30:35               | ₹990   | `inv_TqQrTFVHzXi53f` / `order_TqQrTLQEv8OslS` | failed: `SERVER_ERROR`, source internal, step `card_mandate_process` |
| `pay_TqS6Bn3CB7Xcsj` | 11:32:33               | ₹990   | same                                          | same                                                                 |
| `pay_TqS8uXoOM1tC7K` | 11:35:07               | ₹990   | same                                          | same                                                                 |
| `pay_TqS95hUbIR3rtk` | 11:35:18               | ₹990   | same                                          | same                                                                 |
| `pay_TqS9ksz9LXNPqU` | 11:35:55               | ₹5     | none (deferred start)                         | same                                                                 |
| `pay_TqSL0h76rnJJnq` | 11:46:35               | ₹990   | same as the first row                         | same                                                                 |

Phase 0 attempts, for reference: `pay_TqR29rMPR9oRf4` (₹990), `pay_TqR50VbIHYJD5j` (Mastercard ending 0008, rejected as international) and `pay_TqRBdZ9TAT3iGD` (₹5).

The error is the same with eMandate off and Flash Checkout on, from a real browser, for both immediate (₹990) and deferred (₹5) subscriptions. It happens inside Razorpay before any bank step, so this needs Razorpay support to enable recurring card mandates on the test account. Our code is not involved: these subscriptions were created directly through the API.

## 2. What the customer sees

On `/upgrade-plan` (Razorpay accounts only):

- The coverage notice ends with "Set up AutoPay now and your first charge is on {date}, when your current access ends."
- The small print under the bar has three variants:
  - access has ended: "You'll pay ₹X today, then every N days until you cancel."
  - trial still on offer: "Start free with no payment method, or set up AutoPay now and pay nothing until {date}."
  - otherwise: "You'll set up AutoPay now and won't be charged until {date}."
- If AutoPay already exists, the bar shows its status and a "Manage billing" link (`/settings?tab=billing`) instead of "Continue", and "Start with trial" is hidden.

On `/upgrade-plan/payment`:

1. A summary from the server preview, shown before anything is created: due today (₹0 for a deferred start), first charge date, "₹990 every 30 days until you cancel", the summary sentence, and the ₹5 card-verification note.
2. A required consent checkbox with the consent text. The button stays disabled until it is ticked, and reads "Set up AutoPay" (deferred start) or "Pay ₹990" (immediate start).
3. Razorpay Checkout opens on the subscription the server created. The browser never sends an amount.
4. After Checkout, there is one result screen at a time:
   - Payment successful: access was granted, or the current cycle is paid.
   - AutoPay is set up: a deferred start whose mandate is authorised, with no charge today.
   - Confirming your payment: polls the status route every 4 s for up to 2 minutes, then says so and offers "Check again".
   - Checkout not completed: Checkout was closed, with the last failure reason in plain language if there was one.
   - Payment failed: Razorpay is retrying or has halted, or the response did not verify (shown with the payment ID for support).
5. If AutoPay already exists, an "AutoPay is already set up" card is shown instead of the form.

All dates are in IST. Status changes use `aria-live` regions, and focus moves to each result heading.

Which flow an account gets is decided by the server (`paymentProvider` on `/api/billing/subscription`). The page waits for that answer before rendering, so a Razorpay account never sees the QR flash up. A manual UPI payment that is already under review always gets the manual review screen.

## 3. Files

New:

- `src/app/api/billing/razorpay/checkout/route.ts`: `GET` is a side-effect-free preview; `POST` creates or reuses the subscription. Owner only. `POST` is same-origin and rate limited (10 per 10 min).
- `src/app/api/billing/razorpay/verify/route.ts`: `POST`, owner only, same-origin, 30 per 10 min.
- `src/app/api/billing/razorpay/status/route.ts`: `GET`, any member, 60 per min. Refreshes from Razorpay at most every 30 s per subscription.
- `src/lib/billing/razorpay/service.ts`: preview, start (claim, create, attach), supersede, verify, sync, refresh.
- `src/lib/billing/razorpay/db.ts`: a typed `BillingDb` over the Phase 1 SQL functions.
- `src/lib/billing/razorpay/runtime.ts`: dependency wiring, plus one error mapper so every route answers `{ error, code }`.
- `src/lib/billing/razorpay/provider.ts`: `resolvePaymentProvider`.
- `src/lib/billing/razorpay/view.ts`: the customer-safe AutoPay projection.
- `src/lib/billing/razorpay/outcome.ts`: decides which result screen to show.
- `src/lib/billing/razorpay/format.ts`: IST date formatting.
- `src/components/billing/razorpay-checkout.tsx`: loads `checkout.js` on demand and opens Checkout.
- `src/components/billing/razorpay-payment.tsx`: the AutoPay payment step.
- `src/components/billing/manual-upi-payment.tsx`: the old payment page, moved verbatim. A line diff against `HEAD` shows only the export name, the dropped `Suspense` import and wrapper, and the header comment changed.
- `src/lib/http/request-origin.ts`: the shared `isSameOrigin`. `src/lib/super-admin/request-origin.ts` now re-exports it.
- Tests:
  - `service.test.ts`, `view.test.ts`, `outcome.test.ts`, `provider.test.ts`, `format.test.ts`
  - `src/app/api/billing/razorpay/routes.test.ts`
  - `__fixtures__/factories.ts`

Changed:

- `src/app/upgrade-plan/payment/page.tsx`: a `Suspense` wrapper that picks Razorpay or manual UPI.
- `src/app/upgrade-plan/page.tsx`: the AutoPay small print, the coverage line and the live-mandate bar, and the trial offer hidden once AutoPay exists.
- `src/app/api/billing/subscription/route.ts`: adds `paymentProvider`, `autopay`, `trialOfferVisible` and `state.autopayGraceEndsAt`.
- `src/hooks/use-subscription.ts`: the new fields, plus a `loaded` flag.
- `src/lib/rate-limit.ts`: three Razorpay budgets.
- `src/lib/billing/razorpay/client.ts`: `fetchPayment` uses `expand[]=card`. The test expectation is updated to match.
- `next.config.ts`: CSP and Permissions-Policy (section 5).

## 4. Security properties (all covered by tests)

- The browser sends only a plan id and a cycle id. Account, amount, currency, start date and subscription come from the server. A route test sends `accountId`, `amount` and `start_at` in the body and shows they are ignored.
- A checkout claim is taken in the database before Razorpay is called. Double clicks and second tabs reuse one subscription. A stale claim that loses its race cancels the orphan it created.
- When superseding an unauthorised subscription, the code first asks Razorpay what it really is. If the customer has just authorised it in another tab, the code records that and answers 409 instead of cancelling it.
- The checkout signature is checked against our stored subscription id, never the one the browser echoes. A bad signature or a mismatched id gets a 400 with no Razorpay call and no database write.
- The verify route never grants access itself. It re-reads the subscription, payment and invoice from Razorpay and hands them to `billing_apply_payment`, the same SQL the webhook will use.
- Test mode serves only allowlisted accounts, whatever `subscription_settings.payment_provider` says. That flag is shared with production, so it was not touched. Members get 403 on checkout and verify.
- The customer view never includes the Razorpay customer id, provider subscription id, short link, internal error text or anomaly notes. Failure reasons are converted to plain language.

## 5. Headers (`next.config.ts`)

CSP, which is still Report-Only:

- `script-src`: adds `https://checkout.razorpay.com https://cdn.razorpay.com`. The second host was found in the browser check: `checkout.js` loads `cdn.razorpay.com/static/cx/razorpay-risk-detection/bundle.js` into our page.
- `frame-src`: new, `'self' https://api.razorpay.com https://checkout.razorpay.com`.
- `connect-src`: adds `https://api.razorpay.com https://lumberjack.razorpay.com`.

Permissions-Policy, which is enforced: `payment=()` becomes `payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")`. The plan said to change this only if the browser showed a denial. I changed it up front because a denial here is silent on our page, and only Razorpay's own frames get the feature. No Permissions-Policy messages were logged in the browser check.

## 6. Verification

Automated:

| Check                                        | Result                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `npx tsc --noEmit`                           | clean                                              |
| `npx vitest run` (full suite)                | 187 files, 2,353 tests passed (65 new, 6 files)    |
| `npx eslint` on all changed paths            | clean                                              |
| `npx prettier --write` on all changed paths  | applied                                            |
| `next build` (`NEXT_DIST_DIR=.next-verify3`) | compiled; output deleted, `tsconfig.json` reverted |

Real browser (headless Edge, `localhost:3000`, demo login):

| Step                                      | Result                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/upgrade-plan` small print               | Showed the "won't be charged until 6 Apr 2027" variant and the AutoPay coverage line                                                              |
| Payment preview                           | ₹0 today, first charge 6 Apr 2027, ₹990 every 30 days; button disabled until consent                                                              |
| Create                                    | `sub_TqTFFytEUCDphK`, `start_at` 6 Apr 2027 11:49:35 UTC (the paid end), intent `defer_to_paid_end`                                               |
| Checkout                                  | Opened from `api.razorpay.com` and showed "a refundable amount of ₹5 will be charged now", matching our note                                      |
| Reuse                                     | Three later sessions got `reused: true` with the same subscription id                                                                             |
| CSP (our page)                            | First run: 1 violation (`cdn.razorpay.com`). After the fix: 0                                                                                     |
| Close Checkout ("Checkout not completed") | **Not verified.** Headless Checkout stops on a mandatory "Contact details" sheet that does not accept automated input, the same limit Phase 0 hit |

Mapped to the plan's Phase 2 acceptance tests:

| Test                   | Status                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| T1 Start with trial    | Code path unchanged. Not re-run, because the demo has paid coverage, so the offer is correctly hidden.      |
| T2 Card AutoPay        | Blocked by Razorpay (`card_mandate_process`)                                                                |
| T4 UPI AutoPay         | Blocked: UPI AutoPay access pending                                                                         |
| T6 Duplicates / 2 tabs | Reuse confirmed live across sessions. Concurrent claims are covered by the Phase 1 SQL test and unit tests. |
| T7 Abandon             | Wiring and unit logic in place. Needs one manual close in a real browser (section 8).                       |
| T18 Not allowlisted    | Pass (route test, 403 `provider_unavailable`)                                                               |
| T19 Member             | Pass (route tests: checkout and verify 403, status readable)                                                |
| T20 CSP / Permissions  | Pass in Edge after the fix. Chrome not run.                                                                 |

## 7. Test objects and clean-up

- Razorpay: `sub_TqTFFytEUCDphK` was cancelled through the API (it had status `created`, with `notes.env=dev`). Plan `plan_TqTFFd6DbOjteX` (daily × 30, ₹990) was created by `ensureProviderPlan` and is kept, along with its `billing_provider_plans` row, so later checkouts reuse it. Razorpay plans cannot be deleted.
- Database: I deleted the one `billing_subscriptions` row and its one `subscription_events` row, matching on account, mode and ids. The demo `accounts` row hash is identical before and after (`5f0c3bfb…`). No other account was touched.
- The demo account was never sent through "Continue", so its selected plan is unchanged.

## 8. Deviations from the plan

- **Server-side syncing moved into Phase 2:** verify and status re-read Razorpay (`syncSubscription`, `syncPayment`, `refreshSubscription`). With no webhook yet, this is the only way a successful payment can land. It uses the same SQL apply functions, so Phase 3 adds a second path rather than a different one.
- **Payment provider resolved per account:** decided per account and per deployment (`resolvePaymentProvider`), not from the shared DB flag alone. This is what keeps production on manual UPI while dev tests Razorpay.
- **eMandate and NACH hidden in Checkout** (`config.display.hide`), on top of the Dashboard setting.
- **Permissions-Policy changed proactively** (section 5).
- **Small fixes:** `attachProviderSubscription` now has its own result type (`attached | not_initiating`). IST formatting and outcome rules live in pure modules so the browser can use them.

## 9. Open items

- **Manual check for you, about 1 minute** (T7):
  1. On `devcrm` as the demo owner, open `/upgrade-plan/payment` with the Monthly plan, tick the box and press "Set up AutoPay".
  2. Close Checkout and confirm the "Checkout not completed" screen.
  3. Press "Try again" and confirm Checkout reopens.
  4. Tell me when you are done and I will cancel the test subscription and remove its rows.
- **Razorpay support:** ask them to enable recurring card mandates on the test account. Quote `pay_TqSL0h76rnJJnq` and `pay_TqS9ksz9LXNPqU` (`SERVER_ERROR`, `card_mandate_process`). Until then, T2 and the live "paid" and "authorised" screens cannot be exercised.
- **UPI AutoPay:** pending Razorpay access (T4).
- **Checkout's end date:** Checkout shows "Replai will then charge ₹990 every 30 days until 19 Sep 2036", because of the 10-year `total_count`. Our copy says "until you cancel". Decide whether that end date is acceptable or whether to shorten the horizon.
- **Pending manual UPI payment:** the page sends such accounts to the review screen, but the checkout API does not refuse them. This only matters once existing customers move over, so I suggest adding the server-side refusal in Phase 6 (transition).
- **Phase 3:** webhook route (`https://devcrm.junkiescoder.com/api/billing/razorpay/webhook`), reconciliation job, and emails.
- **Phase 4:** AutoPay status and cancel in Settings → Billing. The "Manage billing" links already point there.
