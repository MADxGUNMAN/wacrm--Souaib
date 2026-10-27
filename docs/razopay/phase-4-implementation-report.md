# Phase 4 report: customer billing page and AutoPay lifecycle actions

Date: 21-10-2026. Razorpay mode: Test. Scope: the demo workspace `c1db92d7-7ae4-44ac-aae7-b62e152b0341`. Production is unchanged: Razorpay is not configured there, so it renders nothing new for manual-UPI workspaces and skips no reminders.

## Summary

- The Razorpay MCP is working with the app's current test key (`rzp_test_TqSJ…`). It now sees the same payments the app does.
- Razorpay delivered its first real webhook to devcrm. The signature checked out, the event was stored, and it was processed.
- Settings → Billing has a new **AutoPay card**. It shows the status in plan section 3.5 wording, the payment method (masked), and the next charge in IST, plus actions:
  - Cancel AutoPay (with a confirmation dialog)
  - Change card (card mandates)
  - Renew now (halted)
  - Set up a new AutoPay (paused)
  - Set up again (cancelled or completed)
  - Finish setting up (not completed)
- **Billing history** lists AutoPay payments with Razorpay receipt links. The old manual list is renamed "Earlier manual payments", and Plan activity now shows AutoPay changes and refunds.
- **Trial banner**, **member screen** and `/upgrade-plan` now account for AutoPay.
- **Auto-mail** no longer sends "your plan ends, act now" reminders to accounts whose AutoPay will renew them (F5). This applies to the cron and to the super-admin "Send now".
- **Not verified in a real browser:** the local dev server stopped during this phase, so devcrm shows 530. The Billing page is covered by render tests for every state, but a live click-through is pending (section 6).

## 1. Razorpay MCP check

All calls use the updated key in `~/.kiro/settings/mcp.json`:

| Tool                                 | Result                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `fetch_payment pay_TqTu6O7IN25VyI`   | Found: ₹5 UPI verification, `refunded`, customer `cust_TqTu7bdaHoI9lB` (Phase 3 it said "does not exist")                  |
| `fetch_multiple_refunds_for_payment` | `rfnd_TqTuBfqVr07sWU`, ₹5, `processed`                                                                                     |
| `fetch_order order_TqTu6YuGgftA63`   | ₹5 order, `attempted`                                                                                                      |
| `fetch_tokens cust_TqTu7bdaHoI9lB`   | 1 UPI recurring token for `sub_TqTtwUDRjijZys`, `recurring_details.status: confirmed`, mandate limit ₹9,000                |
| `fetch_all_payments`                 | Works. This test account also holds payments from another Junkies Coder project, so MCP checks should always filter by id. |

## 2. Real webhook delivery

To trigger a delivery I created a throwaway test subscription directly at Razorpay, outside our database (`sub_TqYHpeUyEO2ltW`, `notes.source=phase4-webhook-probe`), and cancelled it at once.

Razorpay sent `subscription.cancelled` to `https://devcrm.junkiescoder.com/api/billing/razorpay/webhook` about a minute later. The route:

- verified the signature with the secret you configured
- stored the event under Razorpay's real event id (`TqYHsc23921wqu`)
- processed it as `ignored / not_ours`, which is correct because that subscription is not in our database

The demo account was not touched. This confirms the Dashboard URL, the secret and the event id header end to end.

## 3. What changed

### Database (2 small migrations, applied, service role only)

- **`20261023000000_razorpay_billing_phase4.sql`:** `billing_mark_cancel_requested(id, actor)`. It records who asked for an AutoPay to stop, called only after Razorpay accepts the cancel. The first request wins, and an unknown actor is refused.
- **`20261023010000_razorpay_billing_method_summary.sql`:** `billing_refresh_method_summary(subscription)`. After a card change it shows the newest successful payment's card. It stores only network and last 4 or a masked VPA.

Both function bodies in the database match the files (md5 of `prosrc`). `authenticated` cannot execute them.

### Server

| File                                                         | What                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/billing/razorpay/lifecycle.ts` (new)                | `cancelAutopay` and `paymentMethodAction`. Cancel needs `{confirm: true}`. The status written comes from a fresh Razorpay fetch.                                       |
| `src/app/api/billing/razorpay/cancel/route.ts` (new)         | Owner only, same-origin, 5 per hour. Sends the "AutoPay cancelled" email from `after()`.                                                                               |
| `src/app/api/billing/razorpay/payment-method/route.ts` (new) | Returns `card_change` (Checkout options with `subscription_card_change`), `renew`, or `unsupported` (UPI). Changes nothing itself.                                     |
| `src/lib/billing/razorpay/service.ts`                        | A checkout that finds a **halted or paused** AutoPay replaces it, but only after Razorpay confirms it is still stopped. Verify refreshes the shown method.             |
| `src/lib/billing/razorpay/view.ts`                           | `hasMandate` now means "will charge" (authorised, active, retrying). New `canReplace` (halted or paused) and `planId`/`cycleId` for renew links.                       |
| `src/lib/billing/razorpay/history.ts` (new)                  | Customer projection of `billing_payments` for the history list.                                                                                                        |
| `src/app/api/billing/history/route.ts`                       | Adds `transactions` (this deployment's mode only), paged on its own.                                                                                                   |
| `src/app/api/billing/subscription/route.ts`                  | Adds `autopayCancelNote`: the admin-editable cancel text with `{access_until}` filled in IST.                                                                          |
| `src/lib/subscription/queries.ts`                            | Plan activity shows AutoPay set up, stopped, paused, resumed, cancelled, completed, and refund processed. Payments, retries, disputes and internal checks stay hidden. |
| `src/lib/auto-mail/reminders.ts`, both auto-mail routes      | Skip accounts with a working AutoPay in this deployment's mode.                                                                                                        |

### Customer pages

- **`src/components/settings/autopay-card.tsx` (new):** the AutoPay card. `AutopayCardView` is presentational, so every state is render-tested. Members see the facts without actions.
- **`billing-settings.tsx`:**
  - With a working AutoPay, the plan line says "renews automatically on {date}".
  - The "Upgrade Plan" button is replaced by a note.
  - The unpaid "Upcoming plan" card is hidden.
- **`billing-history.tsx`:** the new "AutoPay payments" section shows:
  - date, method, the Razorpay id (quoted to support) and the period covered
  - a **Receipt** link only for a paid invoice, otherwise "Receipt not available"
  - the ₹5 check marked as a refunded "setup check"
  - plain-language failure reasons
- **`trial-banner.tsx`:**
  - A red banner while Razorpay retries or after it stops, with "Manage billing" or "Renew now" (owner only).
  - During a trial with an authorised AutoPay: "Trial ends {date} · AutoPay set up (₹X on {date})", with no upgrade button.
- **`subscription-required/page.tsx` (members):** "The owner's AutoPay payment couldn't be collected" when it failed.
- **`/upgrade-plan` and the payment step:**
  - A blocked owner is never sent to Settings, which would bounce them back; they get "Check status" instead.
  - The payment step warns before consent when it will replace a stopped or paused AutoPay.

## 4. Decisions made in this phase

- **Cancel stops the Razorpay mandate immediately.** Access is not Razorpay's to end, because it lives in `accounts.subscription_ends_at`, which a cancel never touches. The customer keeps every day already paid for (D3), and no charge or retry can happen after they said stop. This also handles the case the plan flags: a "cancel at cycle end" on a halted or retrying mandate could still collect. The cancel dialog uses your `autopay_cancel_note` copy, filled with the real access end date.
- **A stopped or paused AutoPay is replaced, not repaired.** Pressing Renew cancels it and creates a new subscription. This follows plan section 2.7: a card change after a halt does not charge the missed invoices, and UPI mandates cannot be updated.
- **UPI has no "change method" button.** UPI mandates are managed in the customer's UPI app. The card says so, and to switch, the customer cancels and sets up again.
- **"Total paid" is relabelled** "Paid by manual transfer" when AutoPay payments are also listed, because it only ever summed manual transfers.

## 5. Verification

| Check                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                     | clean                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npx vitest run`                                       | **198 files, 2,467 tests passed** (49 new)                                                                                                                                                                                                                                                                                                                                                                                               |
| `npx eslint` / `npx prettier --write` on changed paths | clean / applied (diffs checked: only my edits)                                                                                                                                                                                                                                                                                                                                                                                           |
| `next build` (`.next-verify3`)                         | compiled, with `/api/billing/razorpay/cancel` and `/payment-method`. Output deleted, `tsconfig.json` reverted.                                                                                                                                                                                                                                                                                                                           |
| Rolled-back SQL test (demo account only)               | Cancel during paid time: access kept to the day, grace cleared, 1 `autopay_cancelled` event (`source=customer`), 1 email (test/dev), and a new checkout claim allowed. Actor recorded once, a second call keeps it, a bad actor is refused. Method summary moves to the newest card (MasterCard 5555, not the failed RuPay); a repeat call is a no-op. Afterwards the account hash, the real subscription and all counts were unchanged. |
| Reminder dry run over all real accounts (read-only)    | At 11 dates from today to +168 days, the due list was identical with and without the skip for every other account. The demo account has auto-mail turned off, so the skip's effect is shown by unit tests.                                                                                                                                                                                                                               |

New tests:

- `lifecycle.test.ts`
- `replace.test.ts` (replace halted or paused, never a revived mandate, method refresh)
- `history.test.ts`
- `view.test.ts` (updated)
- `autopay-card.test.tsx`: renders all 10 states and pins each label and its actions. This is the plan's "each section 3.5 state renders with its exact label" check.
- `reminders.autopay.test.ts`
- cancel and payment-method route tests in `routes.test.ts`

Plan acceptance for Phase 4:

| Test                                      | Status                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Each 3.5 state renders with its label     | Pass (render tests, all states)                                                                                                             |
| No reminder for an AutoPay account        | Pass (unit tests and the dry run)                                                                                                           |
| T10 Cancel                                | Logic and SQL pass. A real cancel on `sub_TqTtwUDRjijZys` is your call (section 6), because it ends the only working test mandate.          |
| T9 Renew after halt                       | Logic passes in unit tests. A real halt needs a failed renewal charge; see the Phase 3 open items.                                          |
| T16 Full refund, T17 Existing paid window | T16's refund path passed in the Phase 3 SQL test. T17 matches the demo today (`start_at` = paid end, ₹5 only), shown by MCP `fetch_tokens`. |
| T21 Accessibility                         | Labels, `role="alert"`/`status`, and real buttons and links are in place. The keyboard pass in a browser is pending (section 6).            |

## 6. Your actions

1. **Restart the dev server and the devcrm tunnel.** `localhost:3000` refuses connections and devcrm returns 530. Razorpay retries failed webhooks for 24 hours, then disables the webhook and emails `junkiescoder@gmail.com`. If that happens, re-enable it in the Dashboard.
2. **Check Settings → Billing as the demo owner** (about 2 minutes):
   - The AutoPay card should show "AutoPay authorised", "Nothing has been charged yet. Your first charge of ₹9,000 is on 6 Apr 2027", "UPI te****@razorpay", and a Cancel AutoPay button with no Change card button.
   - History should show the ₹5 "AutoPay setup check" as refunded.
   - Tab through the card with the keyboard.
3. **Decide on T10:** cancelling `sub_TqTtwUDRjijZys` tests cancel for real, but leaves no working test mandate until you set up UPI AutoPay again. I can do it whenever you say.

## 7. Open items

- **Card mandates** still fail inside Razorpay (`card_mandate_process`), so "Change card" cannot be tried for real yet. UPI works.
- **`payment_retry_final`** stays off until a real failed renewal shows Razorpay's retry count (Phase 3).
- **Phase 5:**
  - super-admin AutoPay panels and actions
  - account delete and ban must cancel AutoPay first (F7)
  - the warning on manual time grants for AutoPay accounts (F6)
- **Clean-up after Phase 5:** remove the demo account's `billing_*` rows and the test events (`evt_P3Smoke…`, `evt_P3Refund…`, the probe event `TqYHsc23921wqu`).
