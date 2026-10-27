# Review: localized pricing and multi-currency Razorpay billing (pass 1)

Verdict: APPROVED. No high or medium findings.

## Evidence read

- Plan, progress and verification notes in `.agents/tasks/localized-pricing/`.
- `git status` / `git diff` for every modified file, plus the untracked files: migration
  `20261026000000_localized_pricing_regions.sql`, `src/lib/billing/pricing/regions.ts`,
  `region-store.ts`, `regions/route.ts`, `regions/copy/route.ts`, `region-header.tsx`,
  `region-selector.tsx`, the report.
- I also read the unchanged code these changes depend on: `findCountryByDialPrefix` (longest first),
  `MANDATE_STATUSES` vs `AUTOPAY_STATUSES` (same five statuses), `requireSuperAdmin` (returns
  `userId`), `formatCurrency`, `resolvePaymentProvider`, and the `billing_cycles` columns that
  the copy route uses (`unit_label`, `discount_label` exist in migration 050).
- Verification evidence (`verification.md`): tsc src = 0, vitest 227 files / 3031 tests green,
  eslint 0 errors (1 warning already present at HEAD), prettier applied (reflow of 6 files that were not
  Prettier-clean before is disclosed), build into `.next-verify3` exit 0 with cleanup. The browser
  checklist is still open because no session was available. That is disclosed and listed in report §11.
  I did not rerun anything.

## Requirement checks

- Zero behaviour change. Global is implicit: it is the `subscription_settings` row plus the
  `region='global'` cycles that the constant DEFAULT backfills. `formatPlanAmount(…,'INR')`
  hands off to `formatCurrency(…,'INR')`. The exact INR literals (`₹0.00 (Free Setup)`, `₹5` note)
  are kept. With `pricing_regions` empty, the resolver always answers Global and skips the catalogue
  read. The PricingSection CMS override (USD $2/$60) still applies to the Global bundle, so the
  current landing page is unchanged.
- Migration (`…regions.sql`). The migration only adds things and can be re-run safely: `IF NOT EXISTS`,
  and each CHECK is dropped then re-added. It has no UPDATE, DELETE, rename or column drop, and it does
  not touch `subscription_settings`. The CHECK `region='global' OR is_visible=FALSE` keeps country cycles
  hidden from older code. The provider-plan unique index is unchanged by design (plan D7): each region
  owns its cycles, so `(mode, plan_id, cycle_id)` already implies the region, and `matches()` compares
  currency. This meets the uniqueness requirement without rebuilding a live index.
- Resolver (`regions.ts` 570-625, `region-store.ts` 130-245):
  - Uses the owner's phone, read with `profiles.eq('user_id', owner)`.
  - Matches the longest dialing prefix, then applies `SHARED_DIAL_CODE_DEFAULT` (+1 to US, +7 to RU).
  - A live mandate pins its cycle's region.
  - Global is the fallback for no phone, an unknown code, a country that is not configured, disabled
    or incomplete, a currency that cannot be charged, and manual UPI with a non-INR currency.
  - It never throws (`lookup_failed`).
- Checkout (`checkout/route.ts` 124-217, `queries.ts` resolveQuote):
  - The region is resolved on the server, and `resolveQuote` refuses a cycle from another region.
  - Currency comes from the resolution. `buildCheckoutDisplay` computes `amountMinor` with
    `toMinor(amount, currency)`, and the claim stores both on `billing_subscriptions`.
  - `ensureProviderPlan` writes `region` and adds region and currency to the notes.
  - A currency rejection gives 409 `currency_not_supported`, and Razorpay's own text is kept in
    `markCreateFailed`.
  - `upi-qr` and `payment-requests` return 409 `manual_upi_inr_only` for any non-INR quote.
- Super-admin:
  - Selector: Global first, then `Name (+dial)` with flags and status dots, region kept in `?region=`.
  - Every tab is keyed and scoped to the region. A country with no data opens blank, with Global
    wording as placeholders.
  - The enable switch is validated on the server (422 with a list of problems), with a Razorpay
    preflight for non-INR. The currency is locked while a country is enabled.
  - Notice copy: "Customers in <country> see the Global plan until this is enabled."
  - The cycles, settings, prices and plans APIs scope by region and read it from the stored row on
    PUT. Every route still calls `requireSuperAdmin`.
  - The Subscribers tab shows a Pricing badge from the same resolver.
- Customer display: `/api/billing/plans`, `/api/billing/subscription`, `select-plan`, landing
  (`getLandingPlansBundle`) and the upgrade page all use the resolved region. The upgrade page's
  only currency source is `bundle.settings.currency`.
- Tests: regions.test has the +1/+1876/+7/no-plus/unknown/disabled/incomplete/not-chargeable/manual/
  mandate cases. Tests were also added for the region store, region queries, routes, the
  super-admin regions routes and the subscriptions route.
- Docs: the report covers findings with sources and the probe, data model with the invariant, the +1
  rule, checkout and fail-closed behaviour, migration with results, deploy order, rollback, the
  Razorpay international enablement steps and the browser checklist. README row, status line and
  runbook §9 are present.
- Constraints:
  - No `next.config.js` or `.mjs` exists, and no cache headers were added.
  - Account b69f… is not referenced in any changed file.
  - No commits, and nothing was logged to Scrum.txt or Sheets.
  - No `!` or em dash in new user-facing copy. The only em dash is in a code comment
    (`region-store.ts` line 2).

## Findings (non-blocking, low)

1. Low. `src/app/api/billing/subscription/route.ts` 101-129: `getAccountPricingRegion` is now called
   without `settings`, so the hot subscription poll does an extra `subscription_settings` read on
   top of the `pricing_regions`, `accounts`, `profiles` and `billing_subscriptions` reads. Results are
   correct. Suggested fix: pass `{ settings: globalSettings }` once the settings promise resolves, or
   move the call after the first `Promise.all`.
2. Low. `src/app/(super-admin)/super-admin/plans/page.tsx`: the region summaries (status dot,
   `cycle_count` that controls "Copy from Global") reload only after a header action. They do not
   reload after cycles or prices are added in the tabs, so the dot and the Copy button can be stale
   until the page reloads. This is safe because the copy route returns 409 when cycles exist and
   enabling is validated on the server. Suggested fix: pass `loadRegions` to the panels as an
   `onSaved` callback.
