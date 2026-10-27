# Review: Global (Universal) currency option (iteration 1)

Verdict: APPROVED. No blocking findings.

## Evidence checked

- `git status` / `git diff`: 22 modified files plus new route, route test, pure module and test,
  dialog, header, migration. No commit, `tsconfig.json` restored.
- Recorded verification (`verification.md`): tsc filter clean, vitest 229 files / 3,090 tests
  passed, eslint clean on touched files, prettier written (CRLF to LF only), build into
  `.next-verify3` exit 0, cleanup done. Not re-run; no spot-check needed.
- Migration applied only after the user's explicit "yes"; DDL only (function plus grants).
  Read-only checks recorded: `service_role` only, `subscription_settings` still `INR` /
  `razorpay`; smoke call returned `stale` before any UPDATE. No data write, `payment_provider`
  untouched, account `b69f6811-...` not referenced anywhere in the change.

## Requirements

1. Header: `global-region-header.tsx` uses lucide `Globe`, `GLOBAL_REGION_LABEL`, short
   description, Currency input with `CURRENCIES` datalist, Save. No enable switch, no Copy from
   Global. Rendered for Global in `plans/page.tsx:153-161`, country header unchanged.
2. Server validation: `PUT /api/super-admin/billing/global-currency` calls `requireSuperAdmin`
   first, then JSON parse, `expected_currency` stale check, `checkGlobalCurrencyChange`
   (ISO 4217 via `isValidCurrencyCode`, INR always allowed, non-INR refused unless
   `payment_provider = 'razorpay'`, intake `retired`, Razorpay configured and code in
   `RAZORPAY_CHARGE_CURRENCIES`). Refusal messages are plain prose and shown client-side in the
   header and server-side in the dialog alert with the `problems` list.
3. No silent ₹990 to $990: dialog requires a total for every Global price row (superset of visible
   cycles, plan D2); confirm disabled until each parses above zero. Prices and currency go in ONE
   request and ONE `fn_change_global_currency` call that locks the settings row and all Global
   price rows, verifies the submitted set equals the Global set, and updates both in one
   transaction. Old path closed: settings PUT returns 409 `use_global_currency_header` for a
   different currency and drops an equal one (`settings/route.ts:382-411`); panel no longer sends
   it. No other writer of `subscription_settings` exists (grep). Reader side: `resolveQuote` reads
   the currency before the price and re-reads after for Global quotes (`queries.ts:443`,
   `:510-526`); every caller (`checkout`, `upi-qr`, `payment-requests`) resolves pricing before the
   quote, so a racing checkout cannot pair a new price with the old currency. The only pre-commit
   write is the Razorpay provider-plan preflight, which is self-healing and documented (D6).
4. Mandate pinning: renewals use the stored `provider_plan_id`, invoices/payments come from
   Razorpay payloads, status routes build from the subscription row; `mandateCurrency` added to
   live-mandate resolutions and surfaced in Subscribers badge and `/api/billing/subscription`.
   `ensureProviderPlan` keys by mode/plan/cycle and compares amount and currency, preflight run in
   the saving deployment's mode.
5. Displays: upgrade page, landing (`PricingSection` uses CMS override or settings currency) and
   checkout copy already followed the currency; billing settings, AutoPay card, trial banner,
   Razorpay history rows and AutoPay emails now use `formatPlanAmount`; ₹5 email note gated on
   INR. `plans-panel.tsx` "Total charged ({currency})" and `auto: …` placeholder follow the region
   currency; em dash removed. The upcoming-plan card is hidden for live AutoPay, so a pinned INR
   subscriber is not shown the new Global price as their bill.
6. Dialog amber box states dev and production share one database and the change hits production
   immediately.

## Constraints and security

- Copy: no em dashes or exclamation marks in new UI/route/module text or doc section 12.
- Slate palette, lucide icons; dialog built from the shared dialog primitives with the confirm
  dialog's layout because `ConfirmDialog` cannot hold form inputs (approved in plan).
- Tests under `src/`: `global-currency.test.ts`, `global-currency/route.test.ts`, plus additions to
  regions, queries, money-format, autopay email and settings/prices route tests.
- Doc section 12 covers option, safeguards, error codes, existing subscribers, migration status
  and rollback.
- Route security: super-admin guard on GET and PUT; `/api/super-admin` is ungated in the proxy but
  the guard is the authority, as for sibling routes. No mass assignment: only `currency`,
  `expected_currency` and validated `prices` are read, and the RPC payload is rebuilt server-side
  from the required rows. Function is `SECURITY DEFINER`, `search_path = public`, EXECUTE revoked
  from PUBLIC/anon/authenticated and granted to `service_role` only. GET returns no secrets.

## Non-blocking note

- Setting a non-INR Global in production and later following the AGENTS.md section 8 rollback to
  `manual_upi` would leave Global workspaces unable to pay until Global is set back to INR. The
  header's amber warning and the doc's "no Global workspace can pay by UPI" line cover it
  indirectly; an explicit line in the rollback section would help operators.
