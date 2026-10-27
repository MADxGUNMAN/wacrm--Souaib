# Review: Razorpay payment details (resume pass)

Verdict: APPROVED, with no blocking findings.

Scope: the 32 files in `touched.txt`, checked against `plan.md` and the coder's report. Phase 6 work was left out of scope. Nothing was re-run. Tests, lint, prettier and the build were judged from the recorded evidence, and I did not run a spot-check.

## Evidence by check

1. Description. `composeCheckoutDescription` (payment-details.ts) ignores the legacy `replai subscription` setting in any case, keeps any other setting as a prefix, avoids doubling "Replai" or "plan" and clips to 255. The checkout route uses it. The payment-method route uses `composeCardChangeDescription` and returns "Replai · Update AutoPay card". routes.test.ts asserts the null setting, the legacy setting and the custom prefix (lines 278-296), plus the card-change text (line 586).
2. Notes. `buildPaymentNotes` writes 12 keys at most, drops empty values and clips each value to 256. `mergeNotes` caps the total at 15. `notesNeedUpdate` makes a repeat run a no-op. `ensurePaymentNotesSafely` runs after `applyPayment` resolves in `syncPayment`, in the `refreshSubscription` loop and in the events.ts `applyPayment`. It catches every error and the apply result is returned unchanged. The backfill runs from admin Sync (inside try/catch) and only on reconcile `sweep` candidates (with `.catch`). The ownership guard checks mode and env through `getPaymentNoteContext`. The Checkout `notes` option is passed only when it is not empty.
3. Contact. `getContact` now selects `phone` and keys on `user_id`. `normalizePrefillContact` uses `isValidE164`. The contact key is added only when the number is valid. Route tests cover a valid phone, a null phone and an invalid one.
4. UI. Customer history shows plan · cycle as the title, the charge label as a tag, and an expandable `<dl>` with Plan, Billing cycle, Charge type, Period covered, Amount, Refunded, Method, Date, Payment ID and Invoice ID. Missing values show "—", "Not applicable" or "Not issued", never a made-up value. The admin Transactions tab and the drawer show the charge cell with plan and cycle, the period, the method, and the invoice id or "No invoice". `PAYMENT_COLUMNS` now includes `invoice_id`, which both admin queries use.
5. Tests. payment-notes.test.ts asserts the exact PATCH arguments, the `getPaymentNoteContext('test', id)` arguments, `listPaymentIdsForNotes('row-1', 10)`, the order (apply before notes), and failure isolation in sync, in refresh and in a webhook `payment.captured`. The client, history, admin, reconcile, lifecycle and route tests are all extended. The PostgREST embeds in `getPaymentNoteContext` have no unit test. The live run confirmed them: the computed notes, including `invoice_id`, matched the notes on Razorpay, so the run returned `updated:0`.
6. Hard constraints. The only untracked migration is the Phase 6 one, so this task added none. The task wrote no database rows and changed no settings. `scratch/` is empty. `next.config.js` is absent. HEAD is unchanged, so there are no commits. The live notes went to the two approved payments only, and the before and after notes are recorded in report §6. No subscriptions were cancelled. The new copy has no exclamation marks.
7. Report. §8 says App Name and App ID are set only through Partner OAuth. §3 explains that renewal descriptions come from Razorpay and that plan items cannot be edited. The README row is present at line 15.

Verification evidence was recorded: tsc 0 errors, vitest 208 files and 2,665 tests passing, eslint clean on the touched files, prettier run, and the `.next-verify3` build succeeded.

## Non-blocking notes

- If `loadFirstAppliedChargeAt` fails in customer history, that error is logged and the page still loads. In that case every charge is labelled "First payment". This only happens when that database read fails.
- The drawer's Period column uses the existing "—" placeholder for empty cells.
