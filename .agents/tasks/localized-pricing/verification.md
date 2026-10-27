# Verification (iteration 1, 27-10-2026)

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit 2>&1 \| Select-String "^src.*error TS"` | 0 lines |
| Tests | `npx vitest run` | 227 files passed, 3031 tests passed, 0 failed (baseline 222 / 2,924; +5 new files, +107 tests) |
| Lint | `npx eslint <46 touched src files>` | 0 errors, 1 warning: `src/app/page.tsx` `'_pricing' is assigned a value but never used` (pre-existing at HEAD, not introduced here) |
| Format | `npx prettier --write <46 touched src files>` and `npx prettier --check` on the 3 docs | Docs: all clean. Source: Prettier reformatted lines beyond my edits (trailing commas, wrapping) in 6 files that were not Prettier-clean before: `src/app/api/super-admin/billing/cycles/route.ts`, `plans/route.ts`, `prices/route.ts`, `settings/route.ts`, `src/components/super-admin/billing/billing-config-panel.tsx`, `plans-panel.tsx`. Small extra reflow in `super-admin/plans/page.tsx`, `razorpay/routes.test.ts`, `service.test.ts`. All other touched files were already clean. |
| Build | `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` | exit 0, "Compiled successfully", `/super-admin/plans` and `/upgrade-plan` built static (Suspense wrapper for `useSearchParams` in place) |
| Cleanup | `git checkout -- tsconfig.json`; `Remove-Item -Recurse .next-verify3` | tsconfig.json restored (build had added 3 lines); `.next-verify3` removed; all `scratch/` files deleted |
| Dev server after build | probe of `/super-admin/plans`, `/upgrade-plan`, `/api/billing/plans`, `/api/super-admin/billing/regions` on :3000 | 307 / 307 / 401 / 401 as expected without a session; no errors in `.next/dev/logs/next-development.log` |

Targeted runs during the items (all green): config 21/21; pricing + subscription 68/68; plans 7/7; money-format + service 38/38; `src/app/api/billing` + `src/lib/billing/razorpay` 348/348; `src/app/api/super-admin/billing` 94/94; subscriptions route 2/2.

## Shared database (migration gate approved by the user)

- Rolled-back DO block (body executed twice, then RAISE to roll back): `cols=3 cons=3 nonglobal_cycles=0 nonglobal_provider_plans=0 pricing_regions=0`.
- `apply_migration localized_pricing_regions`: success.
- Read-only after: 3 new columns with defaults `'global'` / `'global'` / `false`; 3 CHECKs present; `billing_cycles` = global x2 (both visible); `billing_provider_plans` = global x4; `pricing_regions` = 0 rows; `payment_provider` = `razorpay`; RLS on, no anon/authenticated SELECT.
- No regional rows created. No account rows touched. No Razorpay calls made.

## Not verified in a browser

No super-admin or demo-owner session is available in this shell, so the
browser checklist in `docs/razopay/localized-pricing-report.md` section 11
is open. Logged-out landing page fetched on the dev server: shows
"Monthly $2 / day = $60 for 30 days" and "Yearly $1 / day = $360 for 360
days", which is the pre-existing CMS override (`landing_sections.extra_data`
`price_currency USD`, `price_overrides`), identical before and after; the
Global DB prices are INR 990 / 9,000.

## Files touched

New:
- `supabase/migrations/20261026000000_localized_pricing_regions.sql`
- `src/lib/billing/pricing/regions.ts`, `regions.test.ts`, `region-store.ts`, `region-store.test.ts`
- `src/lib/subscription/queries.region.test.ts`
- `src/app/api/super-admin/billing/regions/route.ts`, `regions/copy/route.ts`, `regions/routes.test.ts`
- `src/app/api/super-admin/billing/subscriptions/route.test.ts`
- `src/components/super-admin/billing/region-selector.tsx`, `region-header.tsx`
- `docs/razopay/localized-pricing-report.md`

Modified:
- `.env.local.example`
- `src/lib/billing/razorpay/config.ts`, `config.test.ts`, `plans.ts`, `plans.test.ts`, `types.ts`, `service.ts`, `service.test.ts`
- `src/lib/billing/money-format.ts`, `money-format.test.ts`
- `src/lib/subscription/queries.ts`, `types.ts`
- `src/types/super-admin.ts`
- `src/app/api/billing/plans/route.ts`, `select-plan/route.ts`, `subscription/route.ts`, `upi-qr/route.ts`, `payment-requests/route.ts`, `razorpay/checkout/route.ts`, `razorpay/payment-method/route.ts`, `razorpay/routes.test.ts`, `manual-retirement.test.ts`
- `src/app/api/super-admin/billing/cycles/route.ts`, `plans/route.ts`, `prices/route.ts`, `settings/route.ts`, `subscriptions/route.ts`
- `src/app/(super-admin)/super-admin/plans/page.tsx`
- `src/app/page.tsx` (only the bundle import/call; the file's other uncommitted changes are the user's pre-existing work)
- `src/app/upgrade-plan/page.tsx`
- `src/components/landing/PricingSection.tsx`
- `src/components/billing/razorpay-payment.tsx`
- `src/components/super-admin/billing/plans-panel.tsx`, `cycles-panel.tsx`, `billing-config-panel.tsx`, `subscribers-panel.tsx`
- `docs/razopay/README.md`, `docs/billing-runbook.md`

Pre-existing uncommitted user edits left untouched: `activity-panel.tsx`, `manual-payments-panel.tsx`, `razorpay-shared.tsx` (and part of `src/app/page.tsx`).
