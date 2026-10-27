# Razorpay payment details report

Date: 22-10-2026. Test mode only. Plan: `.agents/tasks/razorpay-payment-details/plan.md` (11 steps).

Every Razorpay payment now carries a specific description (for payments made through our Checkout), a fixed set of notes (on every payment, including renewals), the owner's phone in Checkout when one is stored, and our billing screens show plan, cycle, period, charge type, amount, method, payment id and invoice id.

No migration, no settings row change, no subscription cancelled. Production is unchanged until the next deploy, and `subscription_settings.payment_provider` is still `manual_upi`.

## 1. Step status

This task was resumed after an interrupted run. Steps 1 to 9 were already in the working tree when this pass started; this pass checked each against the plan, re-ran the live check (step 10), and wrote this report (step 11).

| Step | What                                                                                               | Status                                                                              |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | Read the Next 16 route handler docs                                                                | Done (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`) |
| 2    | Pure module `payment-details.ts` and its tests                                                     | Done (one stale `eslint-disable` removed in this pass)                              |
| 3    | `updatePaymentNotes` client method, `notes` on `RazorpayPayment`, fixtures, client tests           | Done                                                                                |
| 4    | `getContact` phone, `loadFirstAppliedChargeAt`, `getPaymentNoteContext`, `listPaymentIdsForNotes`  | Done                                                                                |
| 5    | `payment-notes.ts`, hooks in the three apply paths, admin Sync now and daily sweep backfill, tests | Done                                                                                |
| 6    | Checkout and payment-method routes: description, notes, contact; lifecycle plan/cycle; route tests | Done                                                                                |
| 7    | Browser Checkout passes `notes` and `contact`                                                      | Done                                                                                |
| 8    | Customer Billing history: plan, cycle, charge type, expandable details                             | Done                                                                                |
| 9    | Super-admin Transactions tab and AutoPay drawer: charge, plan, period, method, invoice id          | Done                                                                                |
| 10   | Live notes check on our own test payments                                                          | Done (see section 6)                                                                |
| 11   | This report and the README row                                                                     | Done                                                                                |

## 2. What changed

| Area                       | Files                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules (pure, browser-safe) | `src/lib/billing/razorpay/payment-details.ts`, `payment-details.test.ts`                                                                                                |
| Notes sync                 | `src/lib/billing/razorpay/payment-notes.ts`, `payment-notes.test.ts`                                                                                                    |
| Client and types           | `client.ts`, `client.test.ts`, `types.ts`, `service.ts` (`RazorpayClientLike`), `__fixtures__/factories.ts`                                                             |
| Data access                | `db.ts`                                                                                                                                                                 |
| Apply paths                | `service.ts` (`syncPayment`, `refreshSubscription`), `events.ts` (webhooks)                                                                                             |
| Backfill                   | `admin.ts`, `admin.test.ts` (Sync now), `reconcile.ts`, `reconcile.test.ts` (daily sweep)                                                                               |
| Checkout                   | `src/app/api/billing/razorpay/checkout/route.ts`, `payment-method/route.ts`, `routes.test.ts`, `lifecycle.ts`, `lifecycle.test.ts`                                      |
| Browser Checkout           | `src/components/billing/razorpay-checkout.tsx`, `razorpay-payment.tsx`, `src/components/settings/autopay-card.tsx`                                                      |
| Customer UI                | `src/lib/billing/razorpay/history.ts`, `history.test.ts`, `src/components/settings/billing-history.tsx`                                                                 |
| Super-admin UI             | `src/lib/billing/razorpay/admin-db.ts`, `src/components/super-admin/billing/razorpay-shared.tsx`, `razorpay-transactions-panel.tsx`, `razorpay-subscription-drawer.tsx` |

Several of these files also carry uncommitted Phase 6 changes (checkout route, `razorpay-payment.tsx`, `autopay-card.tsx`, factories, README). Those were left as they were.

## 3. Checkout description

`composeCheckoutDescription` always names the plan and the cycle:

| Setting `razorpay_checkout_description`                   | Plan / cycle     | Description                                  |
| --------------------------------------------------------- | ---------------- | -------------------------------------------- |
| `Replai subscription` (legacy default, any case) or empty | Replai / Yearly  | `Replai plan · Yearly · AutoPay`             |
| empty                                                     | Pro / Monthly    | `Replai Pro plan · Monthly · AutoPay`        |
| `Acme Ltd`                                                | Replai / Monthly | `Acme Ltd · Replai plan · Monthly · AutoPay` |

A custom setting becomes a prefix instead of replacing the plan and cycle. "Replai" and "plan" are never doubled, and the result is clipped to 255 characters. The settings row in the database is not changed.

Card change (Settings, Billing, Change card) now reads `Replai · Update AutoPay card` (the business name from `razorpay_checkout_name`, falling back to Replai) instead of the generic "Change the card for AutoPay".

Razorpay fixes a payment's description when the payment is created, and the Update a Payment API only accepts `notes`. So the two existing payments keep `Replai subscription` as their description. Renewals are created by Razorpay itself, not by our Checkout, so their description comes from Razorpay (the plan item it charges). Razorpay plan items cannot be edited, which is why `plans.ts` was not changed. The notes below are what makes a renewal identifiable.

## 4. Notes on every payment

Keys, in this order (12 at most, Razorpay allows 15):

`product`, `workspace`, `account_id`, `plan`, `billing_cycle`, `charge_type`, `period_start`, `period_end`, `subscription_id`, `invoice_id`, `env`, `mode`.

- Empty values are left out. A setup check has no period and no invoice, so it carries 9 or 10 keys.
- Each value is trimmed, control characters are removed, and it is clipped to 256 characters.
- No email, phone or card data is ever written to notes.
- Dates are IST calendar dates, for example `22 Oct 2026`.
- `charge_type`: `card_verification` when the payment has no invoice (the ₹5 setup check, a card change, a UPI mandate check); otherwise `first_payment` unless an applied charge on the same subscription was created strictly earlier, else `renewal`. A failed first attempt and its successful retry are both `first_payment`, which matches the receipt email rule.
- Period: the access the payment granted (`granted_from` to `granted_until`); before access is applied, the invoice's billing period.

Where the notes are written:

1. Checkout `notes` option for the first payment (and for a card change). The checkout and payment-method routes build them with the same builder; the browser passes them to Razorpay only when non-empty.
2. Server-side `PATCH /v1/payments/{id}` with `{ notes }`, run after the payment has been applied in all three apply paths: `syncPayment` (checkout verify), `refreshSubscription` (status polling, reconciliation, admin Sync now) and webhook `applyPayment` (`payment.captured`, refunds, disputes).
3. Backfill: admin "Sync now" and the daily reconciliation sweep (only candidates with reason `sweep`, so the 5-minute ticks make no extra calls) run `backfillPaymentNotes`, which checks up to 10 stored payments of the subscription. This covers the setup check (it has no invoice, so `refreshSubscription` never visits it) and retries any earlier PATCH that failed.

Why a notes failure cannot break payment application:

- The PATCH runs only after `applyPayment` has resolved, and the apply result is returned unchanged.
- `ensurePaymentNotesSafely` catches every error (Razorpay or database), logs `[razorpay] payment notes <id>: <message>` and returns `failed`. It never throws, so a webhook event stays `processed` and is not retried because of notes.
- If `applyPayment` itself throws, notes are not attempted; the normal event retry handles it.

Idempotency and ownership:

- Nothing is sent when every one of our keys already holds our value. Razorpay replaces the whole notes object, so the PATCH body is our keys first, then any other notes already on the payment while there is room (never more than 15).
- Notes are only written for a payment that is in `billing_payments` with a linked `billing_subscriptions` row of this server's mode and env. Anything else returns `not_ours` without a call, which keeps the other project's payments in the shared Razorpay test account untouched.

Whether Razorpay copies Checkout notes onto a subscription payment was not observed in this pass, because no new checkout ran. The server PATCH covers the payment either way.

## 5. Prefill contact

`getContact` now also reads `profiles.phone`. `normalizePrefillContact` sends `contact` only when the stored phone is a valid E.164 number (as `+<digits>`); otherwise the key is left out. This sends the owner's own number to Razorpay, the payment processor, while `profiles.phone` is otherwise an ops-only field. Both relevant owners have no phone stored today, so live Checkout currently prefills name and email only.

## 6. Live notes on our own payments (test mode)

Allowed by the user for these two payments only, both of which exist in our billing tables. No other payment was touched.

| Payment                                             | Account                      | Subscription         | Before (Razorpay MCP, at planning)            | After (Razorpay MCP, this pass) |
| --------------------------------------------------- | ---------------------------- | -------------------- | --------------------------------------------- | ------------------------------- |
| `pay_TqTu6O7IN25VyI` (₹5 UPI setup check, refunded) | `c1db92d7-...` Replai Demo   | `sub_TqTtwUDRjijZys` | notes `[]`, description `Replai subscription` | see below                       |
| `pay_TqwHJmORjkgpjt` (₹9,000 UPI, captured)         | `3430edae-...` Souaib Ansari | `sub_TqwGwrNJq0ZNBa` | notes `[]`, description `Replai subscription` | see below                       |

After, `pay_TqTu6O7IN25VyI`:

```json
{
  "product": "Replai",
  "workspace": "Replai Demo",
  "account_id": "c1db92d7-7ae4-44ac-aae7-b62e152b0341",
  "plan": "Replai",
  "billing_cycle": "Yearly",
  "charge_type": "card_verification",
  "subscription_id": "sub_TqTtwUDRjijZys",
  "env": "dev",
  "mode": "test"
}
```

After, `pay_TqwHJmORjkgpjt`:

```json
{
  "product": "Replai",
  "workspace": "Souaib Ansari",
  "account_id": "3430edae-763b-4aac-9b82-1c2364936d79",
  "plan": "Replai",
  "billing_cycle": "Yearly",
  "charge_type": "first_payment",
  "period_start": "22 Oct 2026",
  "period_end": "17 Oct 2027",
  "subscription_id": "sub_TqwGwrNJq0ZNBa",
  "invoice_id": "inv_TqwGxOmj8cMGXS",
  "env": "dev",
  "mode": "test"
}
```

Descriptions stay `Replai subscription` on both (fixed at creation, see section 3).

How it was run: the interrupted run had already written these notes through the code path before it stopped, and its output was not kept. In this pass a temporary script (`scratch/notes.live.ts`, deleted) loaded `.env.local`, asserted `mode === 'test'`, read each account's latest test subscription, asserted the account id, the subscription id and that the only stored payment id was the approved one, then ran `backfillPaymentNotes` twice per subscription. All four runs returned `{"checked":1,"updated":0,"failed":0}`: the notes on Razorpay are exactly what the code builds, and a repeat run sends nothing. Nothing was cancelled and no database row was written.

`pay_TqwHJmORjkgpjt` belongs to account `3430edae` (Souaib Ansari), not the demo account. The user owns it and approved patching it.

## 7. UI

Customer, Settings, Billing history (AutoPay payments):

- Title is `plan · cycle` (for example `Replai · Yearly`), falling back to "AutoPay payment", with the charge type (First payment, Renewal, AutoPay setup check) as a muted tag next to the status.
- The collapsed line keeps date, method and payment id. Each row now expands (button with `aria-expanded`) into Plan, Billing cycle, Charge type, Period covered, Amount, Refunded (when above zero), Method, Date, Payment ID and Invoice ID ("Not issued" for a setup check). The receipt link stays outside the toggle button.

Super-admin, Payments:

- Transactions tab: the Kind column is now Charge (charge type, `plan · cycle`, "Covers <from> to <to>" when access was applied, and the stored kind underneath). The Payment column shows the invoice id with a copy button, or "No invoice". The KIND filter is unchanged.
- AutoPay drawer, Payments table: columns Payment, Charge, Status, Amount, Period, Method, When, with the invoice id under the payment id.
- The payment method text moved into `razorpay-shared.tsx` as `adminPaymentMethodText` so both views share it.

## 8. App Name and App ID

The "App Name" and "App ID" fields on a payment in the Razorpay Dashboard stay empty ("--"). They are filled only for payments created through a Razorpay Partner OAuth application, which identifies the app that made the call. Our integration uses the account's own API key and secret, and neither the Checkout options nor the payments API accept a value for those fields. They cannot be set from our side. The notes (`product`, `workspace`, `account_id`) carry that identification instead.

## 9. Verification

| Check                                               | Result                                                                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit 2>&1 \| Select-String "error TS"` | 0 errors                                                                                                                                                                                                                      |
| `npx vitest run`                                    | 208 files, 2,665 tests, all passed (baseline before this task: 206 files, 2,612 tests)                                                                                                                                        |
| `npx eslint` on the 30 touched source files         | 0 errors, 0 warnings (after removing one unused `eslint-disable` directive)                                                                                                                                                   |
| `npx prettier --write` on the touched files         | Done. Reformatted `payment-details.ts`, `payment-details.test.ts`, `billing-history.tsx`, `razorpay-shared.tsx`, `razorpay-transactions-panel.tsx`, this report and the README (formatting only); the rest were already clean |
| `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` | Succeeded. Then `git checkout -- tsconfig.json` (the build rewrote it) and `.next-verify3` deleted                                                                                                                            |

Live: Razorpay MCP `fetch_payment` on both payments (section 6) and the code path run twice per payment, all `unchanged`.
