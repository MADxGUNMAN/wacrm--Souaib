# Implementation Plan: complete Razorpay payment details (description, notes, prefill, UI)

Repo: `d:\Junkies Coder\whatsapp-crm-nextjs` (Windows, PowerShell, Next.js 16.2.6). Test mode only.
The working tree has many uncommitted changes from earlier phases (Phase 6 etc.). Never revert,
stash or checkout anything except `tsconfig.json` after the build (see Verification). No commits,
no Scrum.txt, no Google Sheets.

## 0. Facts checked against the code and data (read-only)

| Brief claim | Result |
| --- | --- |
| Checkout description = `settings.razorpay_checkout_description \|\| \`${planName} · ${cycleLabel}\`` | Confirmed, `src/app/api/billing/razorpay/checkout/route.ts` lines 196-205. DB row `subscription_settings.razorpay_checkout_description` = `'Replai subscription'` (seeded by migration `20261021020000_razorpay_billing_settings_copy.sql` line 43), so plan/cycle never show. `payment_provider` = `manual_upi` (do not touch). |
| Card-change description | `src/app/api/billing/razorpay/payment-method/route.ts` hardcodes `'Change the card for AutoPay'`. |
| Subscription notes set in `startCheckout` | Confirmed (`account_id, checkout_id, env, intent`), `service.ts` ~line 455. |
| Payment notes empty | Confirmed with the Razorpay MCP: `pay_TqwHJmORjkgpjt` notes `[]`, description `"Replai subscription"`; `pay_TqTu6O7IN25VyI` notes `[]`, description `"Replai subscription"`. |
| Client | `src/lib/billing/razorpay/client.ts`; `request()` already supports `PATCH` (POST-like retry: only on 429). No `updatePaymentNotes` yet. `RazorpayPayment` type has no `notes` field. |
| Apply paths | Three call sites of `deps.db.applyPayment`: `syncPayment` (service.ts, used by `verifyCheckout`), the loop in `refreshSubscription` (service.ts, used by status polling, reconciliation and admin "Sync now"), and `applyPayment` in `events.ts` (webhooks, refunds, disputes). `reconcile.ts` itself calls `refreshSubscription`, not `syncPayment`. |
| `refreshSubscription` | Only walks `listSubscriptionInvoices(pid, {count:5})`, and SKIPS payments already applied (`isPaymentApplied`). An authorisation payment has no invoice, so it is never visited. So a backfill path is needed for existing payments and for natural retry. |
| `kind` | Set by SQL `billing_apply_payment` (`20261022000000_razorpay_billing_phase3.sql` line ~290): `'authorization'` when there is no invoice, else `'charge'`. `'upfront'`/`'unknown'` are never produced today. The receipt email already uses "first payment = no other applied payment on this subscription". |
| `formatBillingDate` | `src/lib/billing/razorpay/format.ts`, pure, IST, "22 Oct 2026". |
| Owner phone | `profiles.phone` (migration `20260919120000_profiles_phone.sql`), E.164, nullable, keyed by `profiles.user_id`. `BillingDb.getContact(userId)` (db.ts) reads `full_name, email` only. Both checkout routes call it with `ctx.userId`, and both are owner-only, so it is the owner. Validator: `isValidE164` in `src/lib/whatsapp/phone-utils.ts`. Both relevant owners currently have `phone = NULL`, so live prefill will omit `contact`. |
| Workspace name | `ctx.account.name` in routes (`AccountContext`); `accounts.name` in SQL. |
| App Name / App ID | Not settable with our keys (Partner OAuth only). Do not attempt. |

### Billing rows (read via Supabase MCP, project `dknolotutfiesuhbhmze`)

- Demo account `c1db92d7-7ae4-44ac-aae7-b62e152b0341` ("Replai Demo"): ONE payment, `pay_TqTu6O7IN25VyI`
  (kind `authorization`, status `refunded`, ₹5, UPI, no invoice) on `sub_TqTtwUDRjijZys`
  (Replai / Yearly, `authenticated`, intent `defer_to_paid_end`, env `dev`). Safe to patch.
- `pay_TqwHJmORjkgpjt` is NOT on the demo account. It belongs to account
  `3430edae-763b-4aac-9b82-1c2364936d79` ("Souaib Ansari", not the protected b69f6811 account):
  kind `charge`, captured, ₹9,000, UPI, invoice `inv_TqwGxOmj8cMGXS`
  (billing 22 Oct 2026 to 17 Oct 2027), subscription `sub_TqwGwrNJq0ZNBa` (Replai / Yearly,
  `active`, intent `immediate`, env `dev`), granted 22 Oct 2026 to 17 Oct 2027. Current notes `[]`.
  The brief allows patching it but also says "live checks only on demo account". Resolve in step 10
  by asking (send_message severity `warning`) before patching it. Do not patch it without a yes.

## 1. Design decisions

- D-a Pure module `src/lib/billing/razorpay/payment-details.ts` (no I/O, browser-safe, imports only
  `./format` and `@/lib/whatsapp/phone-utils`). Holds description composers, notes builder/merge/compare,
  charge-type derivation and labels, prefill contact normaliser. Browser-safe so `billing-history.tsx`
  and super-admin panels can import `chargeTypeLabel`.
- D-b Side-effect module `src/lib/billing/razorpay/payment-notes.ts` (server): `ensurePaymentNotes`,
  `ensurePaymentNotesSafely`, `backfillPaymentNotes`. Separate from service.ts to keep service.ts focused;
  it imports `type BillingDeps` from `./service` (type-only, no runtime cycle).
- D-c Description: `composeCheckoutDescription({ setting, planName, cycleLabel })`.
  Plan part = `${planName} plan`, prefixed with `Replai ` unless `planName` already starts with
  "Replai" (case-insensitive); do not double " plan" if the name already ends with "plan".
  Result `[prefix?, planPart, cycleLabel, 'AutoPay'].join(' · ')`, clipped to 255 chars.
  `prefix` = trimmed setting unless empty or in `LEGACY_CHECKOUT_DESCRIPTIONS` (`'replai subscription'`, compared lowercase).
  Examples: QUOTE (Replai / Monthly) -> `Replai plan · Monthly · AutoPay`; Pro/Monthly ->
  `Replai Pro plan · Monthly · AutoPay`; setting "Acme Ltd" -> `Acme Ltd · Replai Pro plan · Monthly · AutoPay`.
  Card change: `composeCardChangeDescription(business)` -> `${business || 'Replai'} · Update AutoPay card`.
  The DB setting row is not changed.
- D-d Note keys, in this order (12, cap 15): `product` ("Replai"), `workspace`, `account_id`, `plan`,
  `billing_cycle`, `charge_type`, `period_start`, `period_end`, `subscription_id`, `invoice_id`,
  `env`, `mode`. Empty values are omitted (verification has no period or invoice). Each value
  trimmed, control characters removed, clipped to 256. No email, phone or card data.
- D-e `charge_type` (`'first_payment' | 'renewal' | 'card_verification'`), via
  `chargeTypeFor({ kind, hasInvoice, createdAt, firstAppliedChargeAt })`:
  `kind === 'authorization'` or no invoice -> `card_verification` (₹5 setup check, card change, UPI
  mandate check). Otherwise `first_payment` when there is no applied charge on the same subscription
  created strictly earlier (`firstAppliedChargeAt` null or `createdAt <= firstAppliedChargeAt`), else
  `renewal`. This labels a failed first attempt and its successful retry as first payment, and matches
  the SQL receipt's `first_payment` rule. Labels: First payment / Renewal / AutoPay setup check
  (existing customer copy uses "AutoPay setup check").
- D-f Period: `granted_from`/`granted_until` when access was applied, else the invoice's
  `billing_start`/`billing_end`, formatted with `formatBillingDate`. Verification: omitted.
- D-g Idempotency: `notesNeedUpdate(existing, ours)` is true when any of OUR keys is missing or
  different. PATCH body = `mergeNotes(existing, ours)`: our keys first, then existing foreign string
  keys while total <= 15 (Razorpay replaces the notes object). Second run is a no-op.
- D-h Ownership guard: notes are only written for a payment that exists in `billing_payments` with a
  linked `billing_subscriptions` row in `deps.config.mode` AND `subscription.env === deps.config.env`.
  The context lookup returns null otherwise, which also keeps the other project's payments in the
  shared Razorpay test account untouched.
- D-i Hook placement: `ensurePaymentNotesSafely(deps, payment)` runs AFTER `await deps.db.applyPayment(...)`
  resolves, in all three call sites, and the apply result is returned unchanged. It catches every error,
  logs `[razorpay] payment notes <id>: <message>` with `console.error`, and returns
  `'failed'`. It never throws, so it cannot break application or a webhook event. If apply throws,
  notes are not attempted (event retries handle it).
- D-j Natural retry/backfill: `backfillPaymentNotes(deps, row, limit = 10)` reads our stored
  provider payment ids for the subscription, fetches each payment and runs the safe ensure. Called by
  `adminSyncSubscription` ("Sync now") and by `runReconciliation` only for candidates with
  `reason === 'sweep'` (the daily sweep), so failed PATCHes retry within a day without adding calls to
  every 5-minute tick.
- D-k Checkout `notes`: the checkout and payment-method routes return `checkout.notes` built with the
  same builder; `openRazorpayCheckout` passes `notes` to Razorpay. pay_now -> `first_payment` with
  period today to `display.accessUntil`; authorise -> `card_verification`; card change ->
  `card_verification`. Whether Razorpay copies Checkout notes onto a subscription payment is not
  verified yet; the server PATCH covers it either way. Record what was observed in the report.
- D-l Prefill: `getContact` also returns `phone`; `normalizePrefillContact(phone)` returns
  `+<digits>` only when `isValidE164`, else null; the route adds `contact` only when non-null.
  Note in the report that this sends the owner's own number to Razorpay (the payment processor),
  while `profiles.phone` is otherwise an ops-only field.
- D-m No migration. All UI data already exists: `billing_payments` (kind, granted_*, invoice_id),
  `billing_invoices` (provider_invoice_id, billing_*), `billing_subscriptions` (plan_name,
  cycle_label, provider_subscription_id). First-charge detection is one extra read per page.
- D-n No change to `plans.ts` (Razorpay plan items are immutable; renewal descriptions come from
  Razorpay). Mention in the report.

## 2. Steps

- [ ] 1. Read the Next 16 docs that apply (route handlers) before editing routes.
      Files: `node_modules/next/dist/docs/` (route handler guide). No code.
      Verify: n/a (reading).

- [ ] 2. Create the pure module and its tests.
      `src/lib/billing/razorpay/payment-details.ts` exports:
      ```ts
      export const LEGACY_CHECKOUT_DESCRIPTIONS: ReadonlySet<string>; // 'replai subscription'
      export const MAX_PAYMENT_NOTES = 15; export const MAX_NOTE_VALUE = 256;
      export const PAYMENT_NOTE_KEYS: readonly string[]; // order from D-d
      export type ChargeType = 'first_payment' | 'renewal' | 'card_verification';
      export function composeCheckoutDescription(i: { setting: string | null | undefined; planName: string; cycleLabel: string }): string;
      export function composeCardChangeDescription(business: string | null | undefined): string;
      export function chargeTypeFor(i: { kind: string | null; hasInvoice: boolean; createdAt: string | null; firstAppliedChargeAt: string | null }): ChargeType;
      export function chargeTypeLabel(t: ChargeType): string; // First payment | Renewal | AutoPay setup check
      export function firstAppliedChargeAtBySubscription(rows: Array<{ subscription_id: string | null; provider_created_at: string | null; created_at: string }>): Map<string, string>;
      export interface PaymentNotesInput { workspace: string | null; accountId: string; planName: string | null; cycleLabel: string | null; chargeType: ChargeType; periodStart: Date | string | null; periodEnd: Date | string | null; subscriptionId: string | null; invoiceId: string | null; env: string; mode: string; }
      export function buildPaymentNotes(i: PaymentNotesInput): Record<string, string>;
      export function mergeNotes(existing: unknown, ours: Record<string, string>): Record<string, string>; // handles Razorpay's [] / null
      export function notesNeedUpdate(existing: unknown, ours: Record<string, string>): boolean;
      export function normalizePrefillContact(phone: string | null | undefined): string | null;
      ```
      New test `src/lib/billing/razorpay/payment-details.test.ts`: legacy default ignored (case-insensitive),
      null setting, custom prefix kept, "Replai" not doubled, 255 clip; card-change text; notes keys/order,
      empties omitted for verification, IST dates ("22 Oct 2026" for `2026-10-22T11:33:58Z`, and a date
      that is the next day in IST), every value <= 256 with a 300-char workspace, never more than 15 keys
      after merge with 10 foreign keys, no email/phone keys; `mergeNotes([] , ours)`; `notesNeedUpdate`
      false when present, true when one value differs or a key is missing; `chargeTypeFor` all branches
      incl. failed first attempt; `normalizePrefillContact` (`+919876543210` ok, `919876543210` -> `+919876543210`, `abc`/null -> null).
      Files: `src/lib/billing/razorpay/payment-details.ts`, `src/lib/billing/razorpay/payment-details.test.ts`
      Verify: `npx vitest run src/lib/billing/razorpay/payment-details.test.ts` passes.

- [ ] 3. Client and types.
      Add `notes?: Record<string, string> | unknown[] | null` to `RazorpayPayment` in `types.ts`.
      Add to `RazorpayClient`:
      `updatePaymentNotes(id: string, notes: Record<string, string>): Promise<RazorpayPayment>` ->
      `this.request('PATCH', \`/payments/${encodeURIComponent(id)}\`, { notes })`.
      Add `'updatePaymentNotes'` to the `RazorpayClientLike` Pick in `service.ts`.
      Add `updatePaymentNotes: vi.fn<RazorpayClientLike['updatePaymentNotes']>(unexpected('updatePaymentNotes'))`
      to `makeClient()` in `__fixtures__/factories.ts`.
      Test in `client.test.ts`: PATCH method, URL `https://api.razorpay.com/v1/payments/pay_123`, body `{ notes }`,
      and that a 500 on PATCH is not retried (only 429 is).
      Files: `src/lib/billing/razorpay/types.ts`, `client.ts`, `client.test.ts`, `service.ts`, `__fixtures__/factories.ts`
      Verify: `npx vitest run src/lib/billing/razorpay` passes; `npx tsc --noEmit 2>&1 | Select-String "error TS"` empty.

- [ ] 4. BillingDb additions (db.ts) and fixture defaults.
      - `getContact` returns `{ name, email, phone }` (select `full_name, email, phone`).
      - Exported helper `loadFirstAppliedChargeAt(admin: SupabaseClient, subscriptionIds: string[]): Promise<Map<string, string>>`:
        select `subscription_id, provider_created_at, created_at` from `billing_payments`
        `.in('subscription_id', ids).eq('kind','charge').not('access_applied_at','is',null)`, reduced with
        `firstAppliedChargeAtBySubscription`. Empty input -> empty map without a query. Throws `BillingDbError` on error.
      - New method `getPaymentNoteContext(mode, providerPaymentId): Promise<PaymentNoteContext | null>`:
        one select on `billing_payments` by `(mode, provider_payment_id)` with
        `id, kind, status, account_id, subscription_id, granted_from, granted_until, access_applied_at, provider_created_at, created_at, invoice:billing_invoices(provider_invoice_id, billing_start, billing_end), subscription:billing_subscriptions(provider_subscription_id, plan_name, cycle_label, env, mode), account:accounts(name)`;
        null when no row or no subscription; plus `loadFirstAppliedChargeAt` for that subscription.
        `PaymentNoteContext = { accountId, workspace, env, mode, planName, cycleLabel, subscriptionId (provider), invoiceId (provider) | null, kind, createdAt, periodStart, periodEnd, firstAppliedChargeAt }`
        (period per D-f).
      - New method `listPaymentIdsForNotes(subscriptionId: string, limit: number): Promise<string[]>`:
        `provider_payment_id` where `subscription_id = id` and `status <> 'created'`, newest first.
      - `makeDb()` defaults: `getContact` adds `phone: null`; `getPaymentNoteContext` -> `null`;
        `listPaymentIdsForNotes` -> `[]` (so every existing test stays silent and makes no extra calls).
      Files: `src/lib/billing/razorpay/db.ts`, `src/lib/billing/razorpay/__fixtures__/factories.ts`
      Verify: tsc filter empty; `npx vitest run src/lib/billing/razorpay src/app/api/billing` all pass (unchanged behaviour).

- [ ] 5. Notes sync module and hook into the three apply paths.
      `src/lib/billing/razorpay/payment-notes.ts`:
      ```ts
      export type NotesOutcome = 'updated' | 'unchanged' | 'not_ours' | 'failed';
      export async function ensurePaymentNotes(deps: BillingDeps, payment: RazorpayPayment): Promise<Exclude<NotesOutcome,'failed'>>;
      // context = deps.db.getPaymentNoteContext(deps.config.mode, payment.id); null or env/mode mismatch -> 'not_ours'
      // ours = buildPaymentNotes({... chargeType: chargeTypeFor(...), env: deps.config.env, mode: deps.config.mode })
      // !notesNeedUpdate(payment.notes, ours) -> 'unchanged'; else deps.client.updatePaymentNotes(payment.id, mergeNotes(payment.notes, ours)) -> 'updated'
      export async function ensurePaymentNotesSafely(deps: BillingDeps, payment: RazorpayPayment): Promise<NotesOutcome>; // try/catch, console.error, never throws
      export async function backfillPaymentNotes(deps: BillingDeps, row: BillingSubscriptionRow, limit = 10): Promise<{ checked: number; updated: number; failed: number }>;
      // ids = deps.db.listPaymentIdsForNotes(row.id, limit); for each: fetchPayment (errors counted as failed, logged) then ensurePaymentNotesSafely
      ```
      Hooks (apply result returned unchanged, notes awaited after apply):
      - `service.ts` `syncPayment`: `const res = await deps.db.applyPayment(...); await ensurePaymentNotesSafely(deps, payment); return res;`
      - `service.ts` `refreshSubscription` loop: same after each `applyPayment`.
      - `events.ts` `applyPayment`: keep `const res = await deps.db.applyPayment(...)`, then `await ensurePaymentNotesSafely(deps, payment)`, then `return fromApply(res)`.
      - `admin.ts` `adminSyncSubscription`: after `refreshSubscription`, `const notes = await backfillPaymentNotes(deps, row)`; add `notesUpdated: number` to `AdminSyncResult`; append `, notes updated on N payment(s)` to the audit note. (`backfillPaymentNotes` never throws for a single payment; wrap the call in try/catch too so a DB read error cannot fail the sync.)
      - `reconcile.ts`: after `refreshSubscription` for a candidate with `reason === 'sweep'`, `await backfillPaymentNotes(deps, row)` inside the existing per-candidate try.
      Check the super-admin sync route/UI for `AdminSyncResult` consumers (`grep adminSyncSubscription`) and keep them compiling.
      New test `src/lib/billing/razorpay/payment-notes.test.ts` (use `makeDb/makeClient/makeConfig/makeRazorpayPayment`, `makeEventDeps`):
      skipped (no PATCH) when notes already match; PATCHes merged notes when notes are `[]`; `not_ours` when
      context is null and when context env differs; second run after an update is `unchanged`;
      `syncPayment` returns the applyPayment result and logs when `updatePaymentNotes` rejects (500);
      `syncPayment` still returns when `getPaymentNoteContext` rejects; `refreshSubscription` patches a newly applied payment;
      webhook `processWebhookEvent` for `payment.captured` stays `processed` when the PATCH fails;
      `backfillPaymentNotes` counts updated/failed. Extend `admin.test.ts` (sync calls backfill, `notesUpdated`)
      and `reconcile.test.ts` (sweep candidate backfills; `charge_overdue` does not).
      Files: `src/lib/billing/razorpay/payment-notes.ts`, `payment-notes.test.ts`, `service.ts`, `events.ts`, `admin.ts`, `admin.test.ts`, `reconcile.ts`, `reconcile.test.ts`
      Verify: `npx vitest run src/lib/billing/razorpay` all pass; tsc filter empty.

- [ ] 6. Checkout routes: description, notes, contact.
      - `checkout/route.ts` POST: `description: composeCheckoutDescription({ setting: settings.razorpay_checkout_description, planName: quote.planName, cycleLabel: quote.cycleLabel })`;
        `notes: buildPaymentNotes({ workspace: ctx.account?.name ?? null, accountId: ctx.accountId, planName: quote.planName, cycleLabel: quote.cycleLabel, chargeType: started.display.mode === 'pay_now' ? 'first_payment' : 'card_verification', periodStart: pay_now ? now : null, periodEnd: started.display.accessUntil, subscriptionId: started.subscriptionId, invoiceId: null, env: deps.config.env, mode: deps.config.mode })`
        (use `new Date()` for now; check the exact `AccountContext` shape in `src/lib/auth/account.ts`);
        `prefill: { name, email, ...(contact ? { contact } : {}) }` with `normalizePrefillContact(contact.phone)`. Update the "Name and email only" comment.
      - `lifecycle.ts`: card_change action gains `planName: row.plan_name, cycleLabel: row.cycle_label`; update the `toEqual` in `lifecycle.test.ts` (~line 160).
      - `payment-method/route.ts`: `description: composeCardChangeDescription(settings.razorpay_checkout_name)`; notes with `chargeType: 'card_verification'`, plan/cycle from the action, `subscriptionId: action.subscriptionId`, workspace from `ctx.account`; same prefill contact rule.
      - `routes.test.ts`: checkout returns `description: 'Replai plan · Monthly · AutoPay'` with setting null and also with the setting mocked to `'Replai subscription'` (make the mocked settings mutable via `h`); custom setting becomes a prefix; `checkout.notes` has `product`, `account_id`, `charge_type`; `prefill.contact` present when `db.getContact` resolves `phone: '+919876543210'`, absent (no key) when `phone: null` or invalid; payment-method returns `description: 'Replai · Update AutoPay card'`, `notes.charge_type: 'card_verification'`.
      Files: `src/app/api/billing/razorpay/checkout/route.ts`, `src/app/api/billing/razorpay/payment-method/route.ts`, `src/lib/billing/razorpay/lifecycle.ts`, `lifecycle.test.ts`, `src/app/api/billing/razorpay/routes.test.ts`
      Verify: `npx vitest run src/app/api/billing src/lib/billing/razorpay` pass; tsc filter empty.

- [ ] 7. Browser Checkout passes notes and contact.
      `razorpay-checkout.tsx`: options gain `notes?: Record<string, string>` and `prefill: { name?; email?; contact? }`; pass `notes` to `new Razorpay({...})` only when non-empty. Update the response types in
      `razorpay-payment.tsx` (`StartResponse.checkout`) and `autopay-card.tsx` (inline type ~line 470) and forward `notes: body.checkout.notes`.
      Files: `src/components/billing/razorpay-checkout.tsx`, `src/components/billing/razorpay-payment.tsx`, `src/components/settings/autopay-card.tsx`
      Verify: tsc filter empty; `npx vitest run src/components` pass (autopay-card.test.tsx).

- [ ] 8. Customer billing history shows full details.
      `history.ts`: COLUMNS add `subscription_id` and embeds
      `invoice:billing_invoices(short_url, status, provider_invoice_id, billing_start, billing_end), subscription:billing_subscriptions(provider_subscription_id, plan_name, cycle_label)`.
      `CustomerAutopayPayment` gains `planName: string | null`, `cycleLabel: string | null`, `chargeType: ChargeType`,
      `chargeLabel: string`, `invoiceReference: string | null`. `toCustomerAutopayPayment(row, firstAppliedAt: ReadonlyMap<string,string> = new Map())`;
      `listAutopayPayments` calls `loadFirstAppliedChargeAt(admin, subscriptionIds of the page)` (catch: log and use an empty map, as the existing read does). Keep periods applied-only (do not substitute invoice dates for an unpaid row).
      `billing-history.tsx` `AutopayPaymentRow`: title `planName · cycleLabel` (fallback "AutoPay payment") with the charge label as a muted tag; collapsed line keeps date, method, payment id; make it expandable like `PaymentRow` (button with `aria-expanded`, `ChevronDown`) and render a `<dl>` with the existing `Detail` component: Plan, Billing cycle, Charge type, Period covered, Amount, Refunded (if > 0), Method, Payment ID (mono), Invoice ID (mono, "Not issued" for verification), Date. Keep the verification note, failure note and receipt link. Plain copy, no exclamation marks, no em dashes in new strings.
      Update `history.test.ts` (the exact `toEqual` at ~line 65 and new cases: first payment, renewal, verification, invoice id).
      Files: `src/lib/billing/razorpay/history.ts`, `history.test.ts`, `src/components/settings/billing-history.tsx`
      Verify: `npx vitest run src/lib/billing/razorpay/history.test.ts` pass; tsc filter empty.

- [ ] 9. Super-admin payment rows show full details.
      `admin-db.ts`: add `invoice_id` to `PAYMENT_COLUMNS`; `AdminPaymentRow` gains `planName`, `cycleLabel`, `providerInvoiceId`, `chargeType`.
      Add helpers `subscriptionLabels(admin, ids)` -> Map id -> `{ providerSubscriptionId, planName, cycleLabel }` (replaces the `providerIds('billing_subscriptions')` call in `listAdminPayments`) and extend `providerIds` to accept `'billing_invoices'` (`provider_invoice_id`). `toAdminPayment(r, accountName, sub, providerInvoiceId, firstAppliedAt)` computes `chargeType` with `chargeTypeFor`.
      `listAdminPayments` and `getAdminSubscriptionDetail` both call `loadFirstAppliedChargeAt`; in the detail use the row's plan/cycle and the fetched invoices for invoice ids (fallback lookup for any missing).
      Move `paymentMethodText` from `razorpay-transactions-panel.tsx` into `razorpay-shared.tsx` as exported `adminPaymentMethodText(p: AdminPaymentRow)`.
      `razorpay-transactions-panel.tsx`: Kind column becomes "Charge" showing `chargeTypeLabel` plus `planName · cycleLabel` and the period (`formatIst(grantedFrom) to formatIst(grantedUntil)` when present); Payment column adds the invoice id `CopyId` under the payment id.
      `razorpay-subscription-drawer.tsx` payments MiniTable head `['Payment', 'Charge', 'Status', 'Amount', 'Period', 'Method', 'When']` with invoice id under the payment id and plan/cycle under the charge label.
      Keep the existing KIND filter (filters on `kind`, unchanged).
      Files: `src/lib/billing/razorpay/admin-db.ts`, `src/components/super-admin/billing/razorpay-shared.tsx`, `razorpay-transactions-panel.tsx`, `razorpay-subscription-drawer.tsx`
      Verify: tsc filter empty; `npx vitest run src/lib/billing/razorpay src/components/super-admin` pass.

- [ ] 10. Live check (test mode, real code path) and report data.
      Before: record notes of `pay_TqTu6O7IN25VyI` and `pay_TqwHJmORjkgpjt` (both `[]` with description "Replai subscription" as of planning) via Razorpay MCP `fetch_payment`.
      Write `scratch/vitest.live.config.ts` (`resolve.tsconfigPaths: true`, `test.include: ['scratch/**/*.live.ts']`, environment node) and `scratch/notes.live.ts` that loads `.env.local` with `loadEnvConfig` from `@next/env`, builds `getBillingDeps()`, asserts `deps.config.mode === 'test'`, reads the demo row via `createBillingDb().getLatestSubscription('c1db92d7-7ae4-44ac-aae7-b62e152b0341','test')`, asserts `row.account_id` is the demo id and `row.provider_subscription_id === 'sub_TqTtwUDRjijZys'`, then calls `backfillPaymentNotes(deps, row)` and prints the result. Never call cancel. Run `npx vitest run --config scratch/vitest.live.config.ts`; run it twice to show the second run is `unchanged`.
      For `pay_TqwHJmORjkgpjt`: it is on account 3430edae ("Souaib Ansari"), not the demo account. Call send_message severity `warning` asking whether to patch it; only on a yes, run the same script against that account's row (`sub_TqwGwrNJq0ZNBa`) via `getLatestSubscription('3430edae-763b-4aac-9b82-1c2364936d79','test')` with the same assertions. Otherwise record it as not patched.
      After: fetch notes again with the MCP and record them. Delete both scratch files.
      Files: `scratch/vitest.live.config.ts`, `scratch/notes.live.ts` (temporary, deleted)
      Verify: MCP `fetch_payment pay_TqTu6O7IN25VyI` shows `product: Replai`, `charge_type: card_verification`, `subscription_id: sub_TqTtwUDRjijZys`, no period keys.

- [ ] 11. Report and README.
      Write `docs/razopay/payment-details-report.md`: what changed (files), description rules with examples, note keys and charge_type rules, where the PATCH runs and why a failure cannot break application, backfill (admin Sync now + daily sweep), prefill contact, UI changes, why App Name/App ID stay "--" (Partner OAuth only), that description is fixed after payment and renewal descriptions come from Razorpay, before/after notes of `pay_TqTu6O7IN25VyI` and `pay_TqwHJmORjkgpjt` (and the account finding), whether Checkout notes were copied onto a payment (not observed unless a new checkout ran), verification results. Plain prose, no exclamation marks, avoid em dashes.
      Add a row to the documents table in `docs/razopay/README.md` (`Payment details report`).
      Files: `docs/razopay/payment-details-report.md`, `docs/razopay/README.md`
      Verify: files exist on disk (`Select-String` the new row).

## 3. Verification (run at the end, in this order)

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS"          # expect nothing
npx vitest run                                              # baseline 206 files / 2,612 tests; expect 208 files, all green
npx eslint <touched files>                                  # known pre-existing: 3 no-explicit-any in whatsapp-setup.tsx (not touched)
npx prettier --write <touched files>                        # may reformat whole files; say so in the report
git status --short -- tsconfig.json                         # must be clean before the build
$env:NEXT_DIST_DIR=".next-verify3"; npm run build
git checkout -- tsconfig.json                               # only because the build rewrote it and it was clean before
Remove-Item -Recurse -Force .next-verify3
```

- Never run `next build` into `.next` (a dev server may be live).
- PowerShell expands `$$` in inline `node -e`; use script files in `scratch/` and delete them.
- `read_file`/`str_replace` can show stale buffers; confirm edits on disk with `Select-String`.

## 4. Files to change

New: `src/lib/billing/razorpay/payment-details.ts`, `payment-details.test.ts`, `payment-notes.ts`,
`payment-notes.test.ts`, `docs/razopay/payment-details-report.md`.

Modified: `src/lib/billing/razorpay/types.ts`, `client.ts`, `client.test.ts`, `service.ts`, `db.ts`,
`events.ts`, `admin.ts`, `admin.test.ts`, `reconcile.ts`, `reconcile.test.ts`, `lifecycle.ts`,
`lifecycle.test.ts`, `history.ts`, `history.test.ts`, `admin-db.ts`, `__fixtures__/factories.ts`,
`src/app/api/billing/razorpay/checkout/route.ts`, `payment-method/route.ts`, `routes.test.ts`,
`src/components/billing/razorpay-checkout.tsx`, `razorpay-payment.tsx`,
`src/components/settings/autopay-card.tsx`, `billing-history.tsx`,
`src/components/super-admin/billing/razorpay-shared.tsx`, `razorpay-transactions-panel.tsx`,
`razorpay-subscription-drawer.tsx`, `docs/razopay/README.md`.

No migration. No settings row change. No Razorpay subscription cancelled.
