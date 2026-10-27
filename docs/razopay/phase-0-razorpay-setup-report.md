# Phase 0 report: Razorpay test-mode setup and capability checks

Date: 21-10-2026 (IST). Mode: **Test Mode only** (`rzp_test_…` key). Account KYC: pending.
Plan: [razorpay-subscriptions-plan.md](./razorpay-subscriptions-plan.md), section 15, Phase 0.

## 1. Summary

| Question                                                        | Answer                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1. Are daily plans with interval 30 and 360 accepted?          | **Yes.** Both created. Interval below 7 is rejected.                                                                                                                                                                                                           | `plan_TqQrS94ZhLiMLh` (daily × 30, ₹990), `plan_TqQrSLdcZJtDC3` (daily × 360, ₹9,000). Interval 6 → `400 "Interval provided is less than the minimum interval (7)…"`                                                                        |
| Q2. What is charged when AutoPay is set up with a future start? | **Cards: ₹5, refundable.** Immediate start charges the full plan amount. UPI: **not testable** (UPI AutoPay not enabled on the account).                                                                                                                       | Deferred auth attempt `pay_TqRBdZ9TAT3iGD` amount 500 paise. Immediate auth attempts `pay_TqR29rMPR9oRf4` amount 99000. Checkout text: "a refundable amount of ₹5 will be charged now. Replai (spike) will then charge ₹990 every 30 days…" |
| Q3. How soon can `start_at` be?                                 | Must be later than **Razorpay's** clock. This machine's clock ran about 60 s behind Razorpay, so `+60 s` was rejected and `+30 min` was accepted. Whether a very near start charges on time could not be observed (no authorisation completed, see Q-blocker). | `400 "start_at cannot be lesser than the current time."` for +60 s. Local `now` 1792558130, Razorpay `created_at` 1792558193.                                                                                                               |
| Q4. Maximum `total_count`?                                      | At least **1,200 cycles of 30 days** and **100 cycles of 360 days** (about 98 years) were accepted. The 10-year limit mentioned in one Razorpay page did not apply at creation.                                                                                | `sub_TqQrWY4ZzEFCer` (1,200), `sub_TqQrYYoi320FVs` (100), both cancelled afterwards                                                                                                                                                         |
| Q5. Can an unauthorised (`created`) subscription be cancelled?  | **Yes**, immediately, status becomes `cancelled`. Cancelling again returns 400 "not cancellable in cancelled status", so our cancel must treat that as already done.                                                                                           | 8 subscriptions cancelled from `created`                                                                                                                                                                                                    |
| Q6. Event when a customer cancels a UPI mandate                 | **Not testable** until Razorpay grants UPI AutoPay.                                                                                                                                                                                                            | n/a                                                                                                                                                                                                                                         |
| Q7. Checkout signature format                                   | Implemented exactly as Razorpay documents: HMAC-SHA256 of `razorpay_payment_id + "                                                                                                                                                                             | " + subscription_id` (our stored id) with the key secret. **Not yet confirmed against a real Checkout response** because no authorisation completed.                                                                                        | Covered by unit tests in Phase 1. Confirm on the first successful authorisation. |
| Q8. Hosts Checkout loads (for CSP)                              | Recorded from a real test Checkout session in Edge (list in section 4).                                                                                                                                                                                        | Browser request log                                                                                                                                                                                                                         |

### Blocker found: card authorisation does not complete in headless automation

I drove Razorpay Standard Checkout on a local test page with Edge (headless) and the Visa subscription test card `4718 6091 0820 4366`. Every attempt stopped at Razorpay's **"Securely saving your card"** step (RBI card tokenisation OTP, 6 digits, sent to the phone number on the payment):

- OTP `123456` → "Verification failed because of incorrect OTP".
- **Skip OTP** → payment failed with `SERVER_ERROR`, `error_source: internal`, `error_step: card_mandate_process`, "We are facing some trouble completing your request…". This happened on both an immediate and a deferred subscription.
- The Mastercard test card `5104 0600 0000 0008` was rejected with `international_transaction_not_allowed`, "this business accepts domestic (Indian) card payments only". So **international cards are off** on this account, which matches D5.

The failure is either a Razorpay test-account setting for recurring cards or Razorpay's bot protection reacting to a headless browser (hCaptcha and Sardine fingerprinting load during Checkout). I can't tell which from outside. Section 5 has the one manual step that settles it.

## 2. What I changed in Razorpay

**No account settings were changed.** The Razorpay MCP server and the Razorpay REST API have no endpoints for Subscriptions settings, Flash Checkout, webhooks or international payments. Those are Dashboard-only (section 5).

Test objects I created through the REST API with the test key (the MCP has no plan or subscription tools):

| Object        | Id                                                               | Details                                                                          | State now                                           |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Plan          | `plan_TqQrS94ZhLiMLh`                                            | `[spike] Replai Monthly (30 days)`, daily × 30, ₹990, INR                        | Active (Razorpay plans cannot be deleted)           |
| Plan          | `plan_TqQrSLdcZJtDC3`                                            | `[spike] Replai Yearly (360 days)`, daily × 360, ₹9,000, INR                     | Active (cannot be deleted)                          |
| Subscription  | `sub_TqQrSZl9fuHjgT`                                             | 30-day plan, immediate start, 120 cycles, `customer_notify=1`, `expire_by` +24 h | **created**, kept for the manual check in section 5 |
| Subscription  | `sub_TqQrUBh0Ic4tPv`                                             | 360-day plan, `start_at` +14 days, 10 cycles                                     | **created**, kept for the manual check in section 5 |
| Subscriptions | 10 others (`+30 min`, `+2 h`, `+40 h`, count probes)             | Limit and timing probes                                                          | **cancelled**                                       |
| Payments      | `pay_TqR29rMPR9oRf4`, `pay_TqR50VbIHYJD5j`, `pay_TqRBdZ9TAT3iGD` | Failed authorisation attempts (₹990, ₹990, ₹5)                                   | **failed**, nothing captured, no refunds needed     |

Verified with the Razorpay MCP tools: `fetch_all_payments` (3 failed payments, 0 captured), `fetch_order` and `fetch_order_payments` for `order_TqQrTLQEv8OslS` (status `attempted`, `amount_paid` 0), `fetch_payment_card_details` (Visa credit, last4 4366, issuer UTIB, domestic), `fetch_all_refunds` (0). No real money is involved in test mode.

Local settings added to `.env.local` (dev only, gitignored):

- `RAZORPAY_MODE=test`
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (the test key you shared)
- `RAZORPAY_WEBHOOK_SECRET` (newly generated, 64 hex characters, not shown here; paste it into the Dashboard webhook in Phase 3)
- `RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS` = the demo account only
- `BILLING_ENV=dev`

## 3. Other facts learned (they change the code)

| Finding                                                                                                                                                              | Consequence for implementation                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Razorpay returns **HTTP 429** after a quick burst of about 10 GET requests.                                                                                          | The REST client retries 429 with backoff, and reconciliation paces its calls.                                                           |
| An unknown or malformed id returns **400** `BAD_REQUEST_ERROR` "The ID provided is invalid or could not be found." (not 404).                                        | The client maps this to a "not found" error code instead of trusting the status.                                                        |
| An immediate-start subscription gets an **`issued` invoice and an order at creation**, before the customer pays. A deferred one has **no invoice** until `start_at`. | "Invoice exists" never means "paid". Only `paid` + captured payment counts.                                                             |
| `remaining_count` is `total_count − 1` for immediate start (the first cycle is the authorisation payment). `end_at` is the start of the last cycle.                  | `total_count` and display maths in `checkout.ts` follow this.                                                                           |
| `auth_attempts` stayed 0 after failed authorisation attempts.                                                                                                        | Failed attempts are tracked from `payment.failed`, not from `auth_attempts`.                                                            |
| Checkout shows **EMandate** next to Cards because eMandate is enabled on the account.                                                                                | D5 says eMandate off. Turn it off in the Dashboard (section 5), and Phase 2 also hides it in the Checkout config.                       |
| Checkout's own summary does not show the first charge date for a deferred start.                                                                                     | Our payment page must show it (plan section 8.2).                                                                                       |
| This machine's clock is about 60 s behind Razorpay's.                                                                                                                | Never send a `start_at` closer than a safety margin (Phase 1 uses 10 minutes). Use Razorpay timestamps, not local time, when comparing. |

## 4. Hosts loaded by Checkout (CSP input for Phase 2)

From a real test Checkout session (Edge 155):

- Razorpay: `checkout.razorpay.com`, `api.razorpay.com` (Checkout iframe), `cdn.razorpay.com`, `checkout-static-next.razorpay.com`, `lumberjack.razorpay.com`
- Fraud and bot checks loaded by Razorpay: `*.hcaptcha.com`, `hcaptcha.com`, `api.sardine.ai`, `*.d.sardine.ai`, `p.sardine.ai`, `js.stripe.com`, `m.stripe.com`, `m.stripe.network`, `r.stripe.com`, `api.stripe.com`, `b.stripecdn.com`
- Error reporting: `browser.sentry-cdn.com`, `o515678.ingest.sentry.io`
- Also probes `localhost:7070`, `localhost:7071` and `localhost:37857` (device fingerprinting)

Most of these load **inside Razorpay's iframe** (`api.razorpay.com`), whose own CSP applies, not ours. Our page needs only: `script-src https://checkout.razorpay.com`, `frame-src https://api.razorpay.com https://checkout.razorpay.com`, plus `connect-src`/`img-src` for `https://*.razorpay.com`. Phase 2 confirms with console violations.

## 5. Your actions in the Razorpay Dashboard (Test Mode)

1. **Turn off eMandate** for Subscriptions: Subscriptions → Settings → eMandate off (D5). Keep Cards on.
2. **Check Flash Checkout**: Account & Settings → Flash Checkout → enabled. Razorpay's subscription guide says Checkout fails without it.
3. **Complete one test authorisation by hand** (settles the blocker). Open the link below in your normal browser and pay with Visa `4718 6091 0820 4366`, any future expiry, any CVV:
   - Immediate (₹990 now): `https://rzp.io/rzp/pTph8iMF`
   - Deferred (₹5 refundable now, ₹9,000 in 14 days): `https://rzp.io/rzp/pPBNcdM`

   Both links expire about 24 hours after 10:18 AM IST on 21-10-2026. If the tokenisation OTP or "Skip OTP" fails for you too, raise a ticket with Razorpay support quoting payment `pay_TqRBdZ9TAT3iGD` and error step `card_mandate_process`, and ask them to enable recurring card mandates in Test Mode. Tell me the result and I'll verify it with the MCP tools.

4. **UPI AutoPay**: wait for Razorpay to approve your "Request access". Until then, UPI is covered by unit tests with mocked payloads only.
5. **Webhook**: do **not** add it yet. Add it at the start of Phase 3, when the receiving route exists, otherwise Razorpay retries for 24 hours and then disables it:
   - URL `https://devcrm.junkiescoder.com/api/billing/razorpay/webhook`
   - Secret: the value of `RAZORPAY_WEBHOOK_SECRET` in `.env.local`
   - Alert email `junkiescoder@gmail.com`
   - Events: plan section 2.9
6. **Regenerate the test key secret** before Phase 2 (it was shared in chat). Then update `.env.local` and the Base64 token in your Kiro MCP config.

## 6. Clean-up

- Throwaway scripts in `scratch/` and the browser driver in `%TEMP%\pptr-rzp` were deleted after the run.
- Redacted API samples (no email, phone or name) were kept as unit-test fixtures in `src/lib/billing/razorpay/__fixtures__/`.
