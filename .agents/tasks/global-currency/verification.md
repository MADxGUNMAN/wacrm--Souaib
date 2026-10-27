# Global currency option: verification (iteration 1)

No review.json existed, so this is the first iteration, implemented from
`plan.md`. No data was written to the shared Supabase project, no saving API
was called, `payment_provider` was not touched, no git commit was made.

## Commands and results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit 2>&1 \| Select-String "^src.*error TS"` | no output |
| `npx vitest run` | 229 files / 3,090 tests, all passed (baseline 227 / 3,031; +2 new files, +59 tests) |
| `npx eslint <26 touched .ts/.tsx>` | no output (clean) |
| `npx prettier --write <touched .ts/.tsx/.md>` | done; see note below |
| `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` | exit 0, `/super-admin/plans` built |
| cleanup | `Remove-Item Env:NEXT_DIST_DIR`, `git checkout -- tsconfig.json`, `.next-verify3` deleted, scratch file deleted |
| migration grep `payment_provider\|DELETE\|DROP\|ALTER TABLE\|INSERT` | comment lines 21 and 29 only; file sorts last |

Prettier note: every pre-existing touched file was CRLF in the working tree
(`core.autocrlf=true`, `.prettierrc` `endOfLine: lf`), so `prettier --check`
flagged them all. `--write` converted them to LF; git normalises line
endings, so `git diff --stat` shows only the real edits (22 modified files,
439+/48-). No file was reflowed beyond the change.

## Files touched

New:
- `supabase/migrations/20261028000000_global_currency_change.sql` (NOT applied, awaiting approval)
- `src/lib/billing/pricing/global-currency.ts`, `global-currency.test.ts`
- `src/app/api/super-admin/billing/global-currency/route.ts`, `route.test.ts`
- `src/components/super-admin/billing/global-currency-dialog.tsx`
- `src/components/super-admin/billing/global-region-header.tsx`

Modified:
- `src/lib/billing/pricing/regions.ts` (+ `regions.test.ts`): `mandateCurrency` on live-mandate resolutions
- `src/lib/subscription/types.ts`, `src/types/super-admin.ts`: optional `mandateCurrency`
- `src/lib/subscription/queries.ts` (+ `queries.region.test.ts`): `resolveQuote` read sandwich, `PRICES_CHANGED_MESSAGE`
- `src/app/api/billing/subscription/route.ts`: `pricingRegion.mandateCurrency`
- `src/app/api/super-admin/billing/settings/route.ts`: 409 `use_global_currency_header`, unchanged currency dropped
- `src/app/api/super-admin/billing/prices/route.ts`: Global prices checked against the Global currency's minor units
- `src/app/api/super-admin/billing/regions/routes.test.ts`: 3 new tests
- `src/app/(super-admin)/super-admin/plans/page.tsx`: Global header
- `src/components/super-admin/billing/billing-config-panel.tsx`: currency read-only, not sent, UPI note when not INR
- `src/components/super-admin/billing/plans-panel.tsx`: placeholder `auto: …` (em dash removed; labels already used the region currency)
- `src/components/super-admin/billing/subscribers-panel.tsx`: "· AutoPay INR" when the mandate currency differs
- `src/components/settings/billing-settings.tsx`, `autopay-card.tsx`, `billing-history.tsx` (Razorpay rows), `src/components/billing/trial-banner.tsx`: `formatPlanAmount`
- `src/lib/email/autopay.ts` (+ `autopay.test.ts`): `formatPlanAmount`; ₹5 note for INR only
- `src/lib/billing/money-format.test.ts`: non-INR formatting cases
- `docs/razopay/localized-pricing-report.md`: section 12 appended

## Decision for requirement 3 (prices and currency never disagree)

One Postgres function, `fn_change_global_currency(expected, new, prices)`,
SECURITY DEFINER, service_role only. It locks the settings row and all
Global price rows, requires the submitted set to equal exactly the set of
Global price rows (any plan, visible or hidden), validates amounts, updates
every price (daily rate replaced, compare-at cleared) and the currency, and
commits once. Supabase JS has no transactions, so any two-write route would
have a window or a crash state where 990 is charged in the wrong currency.

The route (`PUT /api/super-admin/billing/global-currency`) validates first
(super admin, JSON, stale `expected_currency`, ISO code, unchanged,
chargeability, every price present and representable), runs the Razorpay
preflight for non-INR, then calls the function once. It never writes
settings or prices itself (asserted by tests). Without the migration it
answers 503 `migration_required` and changes nothing.

Reader side: `resolveQuote` reads the currency before the price and again
after it for a Global quote, and throws "Prices were just updated. Reload
the page to see current prices." on a mismatch, so a racing checkout cannot
pair a new price with the old currency.

The old unguarded path (Global Page & UPI settings Currency input) is
closed: read-only in the UI, refused by the API (409).

Chargeability rule: INR always; any other currency only where
`payment_provider = 'razorpay'` and `resolveManualIntake` is `retired`
(no test allowlist, no pilot list), and the currency is in
`RAZORPAY_CHARGE_CURRENCIES` with Razorpay configured. Consequence: dev
(test mode, partial) can only keep or restore INR.

## Decision for requirement 4 (existing subscribers, provider plans)

Verified by reading the code (see plan section (e)); no change needed for
charging:
- Renewals use the subscription's stored `provider_plan_id`; a Global
  currency change touches neither `billing_subscriptions` nor Razorpay.
- Invoices/payments are stored from Razorpay's payload with its amount and
  currency; history and emails format the row currency.
- `/api/billing/razorpay/status` and `/api/billing/subscription` build the
  AutoPay view from the subscription row.
- `ensureProviderPlan` keys by `(mode, plan_id, cycle_id, is_current)` and
  compares amount, currency, period and interval, so a new amount/currency
  creates a new Razorpay plan per mode and retires the old row; the saving
  deployment's mode is created up front by the preflight.

Added for display only: `mandateCurrency` on live-mandate resolutions, shown
in the Subscribers badge and returned by `/api/billing/subscription`.

## Migration status

Approved by the user ("yes") and applied to `dknolotutfiesuhbhmze` with the
Supabase MCP `apply_migration` (name `global_currency_change`, body = the
file). Read-only checks afterwards:

- `pg_proc`: 1 row `fn_change_global_currency`, `prosecdef=true`,
  `anon_exec=false`, `auth_exec=false`, `svc_exec=true`.
- `select currency, payment_provider from subscription_settings;` ->
  `INR`, `razorpay` (unchanged).
- No-write smoke call
  `select public.fn_change_global_currency('ZZZ','USD','[]'::jsonb);` ->
  `{"outcome":"stale","currency":"INR"}` (returns before any UPDATE).

No other data was written. The doc section 12 records the applied status.
