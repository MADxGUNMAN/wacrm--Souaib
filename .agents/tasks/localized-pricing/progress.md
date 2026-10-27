# Progress

## Item 1: migration file (done)
- File: supabase/migrations/20261026000000_localized_pricing_regions.sql (sorts last).
- Select-String for UPDATE/DELETE/DROP TABLE/DROP COLUMN/RENAME/subscription_settings: only comments, `ON DELETE SET NULL` FKs and the `BEFORE UPDATE` trigger match. No statement changes existing rows.
- Not applied. Pre-existing uncommitted user edits (not ours): src/app/page.tsx, activity-panel.tsx, manual-payments-panel.tsx, razorpay-shared.tsx. Do not revert them.

## Item 2: migration applied (done, approved by user)
- (a) Rolled-back DO block on shared DB: body EXECUTEd twice, then RAISE EXCEPTION to roll back. Result: cols=3 cons=3 nonglobal_cycles=0 nonglobal_provider_plans=0 pricing_regions=0.
- (b) apply_migration name localized_pricing_regions: success.
- (c) Read-only: columns billing_cycles.region text default 'global', billing_cycles.is_visible_in_region boolean default false, billing_provider_plans.region text default 'global'; 3 CHECKs present; billing_cycles: global n=2 visible=2; billing_provider_plans: global n=4; pricing_regions=0; payment_provider=razorpay; RLS on; anon/authenticated SELECT false.
- Do NOT create regional rows on the shared DB. Dev-server /upgrade-plan check pending (do at item 9).

## Item 3: charge-currency config (done)
- config.ts: RazorpayConfig.chargeCurrencies? (optional), parseChargeCurrencies(env), chargeCurrenciesOf(config) (INR only when absent/null).
- config.test.ts: 3 new cases (unset, 'usd, AED', 'US$,USD' with warn). 21/21 pass.
- .env.local.example: RAZORPAY_CHARGE_CURRENCIES documented after BILLING_PROVIDER_OVERRIDE.

## Item 4: pure region library (done)
- src/lib/billing/pricing/regions.ts: GLOBAL_REGION, isRegionCode, parseRegionParam, regionLabel, REGION_OPTIONS, SHARED_DIAL_CODE_DEFAULT {1:US,7:RU}, isE164Phone, countryFromPhone, regionCycleKey/stripRegionCycleKey, REGION_SETTINGS_KEYS, PLATFORM_WIDE_SETTING_KEYS, sanitizeRegionSettings (null = clear; UPI dropped unless INR; UPI-id format validated in the ROUTE because upi.ts imports qrcode), applyRegionSettingsPatch, mergeRegionSettings (clears upi for non-INR), pricedCycles, isCurrencyChargeable, assessRegion, validateRegionEnable, resolvePricingRegion, globalResolution, describePricingReason. Client-safe (pure imports only).
- Types added in src/lib/subscription/types.ts: BillingCycle.region?, PricingRegionReason, PricingRegionResolution, PlansBundleRegion, PlansBundle.region?.
- regions.test.ts: 45 tests pass.

## Item 5: region data layer + region-aware queries (done)
- queries.ts: exported cycleRowVisible + normaliseCycle (region, D3 visibility), getPricingRegionRow, getRegionSettings(region, currency?), getPlansBundle({includeHidden, region, currency}) (cycles .eq('region'), visibility column by region, prices .in('cycle_id', ids), adds bundle.region), resolveQuote(planId, cycleId, pricing?) (region mismatch -> QuoteError REGION_MISMATCH_MESSAGE; ResolvedQuote.region), getSelectedPlan(accountId, pricing?), setSelectedPlan(..., pricing?). pricing param optional (defaults Global) so old callers/tests compile.
- region-store.ts: loadPricingRegions, loadRegionCatalogue, chargeContextOf, getAccountPricingRegion (never throws; skips catalogue read when no regions exist), getLandingPlansBundle (item 9 helper, already written).
- Tests: queries.region.test.ts (10), region-store.test.ts (7). tsc src errors = 0.

## Item 6: provider plans carry region and currency (done)
- plans.ts: PlanQuote.region? (default 'global'), PLAN_COLUMNS adds region, insert writes region, Razorpay notes add region + currency. Selection logic and unique index untouched.
- types.ts: BillingProviderPlanRow.region?.
- plans.test.ts: +2 cases (USD 6000 daily/30 region US, no retire; Global default). 7/7 pass.

## Item 7: money formatting (done)
- money-format.ts: formatPlanAmount(amount, currency): INR delegates to formatCurrency(amount,'INR') unchanged; others en-US with minor digits only when not whole.
- Switched formatCurrency -> formatPlanAmount in upgrade-plan/page.tsx, PricingSection.tsx, plans-panel.tsx, razorpay-payment.tsx, service.ts.
- Kept exact INR literals: '?0.00 (Free Setup)' and the ?5 verification note stay for INR (deviation from plan's literal replacement to guarantee zero INR change); non-INR get formatPlanAmount(0,cur) + ' (Free Setup)' and the generic verification note.
- money-format.test.ts +3 cases. money-format + service tests 38/38.

## Item 8: customer routes (done)
- plans/route.ts: getAccountPricingRegion -> getPlansBundle({region,currency}).
- select-plan/route.ts: setSelectedPlan(..., pricing).
- subscription/route.ts: pricing resolved in the Promise.all; settings = region settings when non-global; getSelectedPlan(accountId, pricing); response adds pricingRegion {region,currency,label}.
- razorpay/checkout/route.ts: resolveCheckoutPricing (server-side, passes deps.config); resolveQuote(..., pricing); copy + checkout name from region settings; ensureProviderPlan gets quote incl. region.
- razorpay/payment-method/route.ts: region settings for copy.
- upi-qr + payment-requests POST: resolve region, resolveQuote with pricing, non-INR -> 409 manual_upi_inr_only (manualUpiInrOnlyResponse in region-store.ts). upi-qr reads Global settings first and passes them to the resolver (keeps the settings-read count test at 1).
- service.ts: isCurrencyRejection + currency_not_supported 409 for createSubscription and ensurePlan failures (markCreateFailed still stores Razorpay text).
- Tests: routes.test.ts +4 (region-store mocked via h.pricing; resolveQuote mock mirrors region rule), service.test.ts +2, manual-retirement.test.ts +1. src/app/api/billing + src/lib/billing/razorpay: 348/348.

## Item 9: upgrade page + landing (done)
- upgrade-plan/page.tsx: no structural change; currency = bundle.settings.currency (sole source, region-aware via /api/billing/plans). formatPlanAmount swap from item 7.
- page.tsx: getPlansBundle() -> getLandingPlansBundle() (only lines touched; the rest of the file's diff is the user's pre-existing uncommitted work).
- PricingSection.tsx: CMS price_currency AND price_overrides apply only to a Global bundle (overrides on a country bundle would show amounts that are not that country's price).
- Dev-server check (port 3000 live, logged out): landing shows 'Monthly $2 / day = $60 for 30 days' and 'Yearly $1 / day = $360 for 360 days'. This is the PRE-EXISTING CMS override in landing_sections.extra_data (price_currency USD, price_overrides Monthly 60/2, Yearly 360/1), identical before and after this change; DB Global prices are 990/9000 INR. Report must note it. /upgrade-plan as demo owner not browser-checked (no session in this shell); data path verified: Global cycles 990/30d and 9000/360d INR, pricing_regions empty -> every account Global.
- Dev log: no errors.

## Item 10: super-admin APIs (done)
- cycles/route.ts: ?region= (parseRegionParam, 400 on invalid); GET .eq('region'); POST body.region (or query), position per region, country keys prefixed, is_visible->is_visible_in_region and is_visible=false; PUT region from stored row; clearOtherDefaults scoped by region; DELETE last-visible guard per region (country only while enabled). Editor rows: country cycle_key unprefixed + mapped is_visible (toEditorCycle). Global rows returned untouched.
- plans/route.ts GET: ?region, getPlansBundle({includeHidden, region}); country adds regionStatus (assessRegion).
- prices/route.ts PUT: assertRepresentableInCycleCurrency (region from cycle row; toMinor on amount and per_day_amount).
- settings/route.ts: ?region; country GET returns {region, settings: overrides, global}; country PUT sanitizeRegionSettings + isValidUpiId + applyRegionSettingsPatch, insert/update pricing_regions with created_by/updated_by. Global path unchanged.
- NEW regions/route.ts (GET list+readiness+razorpay {configured, mode, chargeCurrencies}; PUT currency/enable/disable with validateRegionEnable + Razorpay preflight ensureProviderPlan for non-INR, 422 {code:'region_not_ready', problems}). NEW regions/copy/route.ts.
- Test: regions/routes.test.ts (28 tests, own in-memory fake with write payloads). src/app/api/super-admin/billing 94/94. tsc 0.

## Item 11: super-admin UI (done, not browser-verified)
- plans/page.tsx: Suspense wrapper + useSearchParams; ?region= via replaceSearchParams (lib/url-state, same as payments page); RegionSelector right of the tabs; RegionHeader for countries; panels keyed by region+nonce and given region.
- NEW region-selector.tsx (Popover + search, Global first, Name (+dial), flags via CountryFlag, status dots, arrow/enter keys, aria-label 'Pricing region', listbox/option roles).
- NEW region-header.tsx (currency input + CURRENCIES datalist, Save; 'Enable localized plan' Switch with 422 problems listed; notice 'Customers in <country> see the Global plan until this is enabled.'; amber not-chargeable note; Copy from Global with confirm, shown only while cycle_count is 0).
- plans-panel.tsx: region prop; currency from bundle.region for countries (inputs disabled until set); Custom card editor Global-only (note for countries).
- cycles-panel.tsx: region prop; GET ?region; POST sends region; country empty state.
- billing-config-panel.tsx: BillingConfigPanel({region}) -> Global panel unchanged (renamed GlobalBillingConfigPanel) or new RegionSettingsPanel (blank fields with Global placeholders, UPI only for INR else INR-only notice, tri-state toggles, platform-wide note, Custom card text group).
- tsc 0, eslint clean on these 6 files. Dev server: pages 307 to login without a session; no compile errors in dev log. Not saved any country data on the shared DB.

## Item 12: subscribers pricing badge (done)
- subscriptions/route.ts: selects cycle_id on billing_subscriptions; loadPricingContext once (regions, catalogue, settings; null on failure -> pricingRegion undefined); newest mandate per account in the deployment mode; per-row pricingRegion via resolvePricingRegion + describePricingReason.
- types/super-admin.ts: SubscriberRow.pricingRegion?, SubscriberPricingRegion.
- subscribers-panel.tsx: PricingBadge (Globe icon, 'Global · INR' or 'US · USD', reason in title tooltip like the other cells) placed UNDER the Term cell, no new column (no horizontal scroll change).
- NEW subscriptions/route.test.ts (2 tests). Dev-server tab not browser-checked (needs super-admin session); pricing_regions is empty so every row resolves Global.

## Item 13: docs (done)
- NEW docs/razopay/localized-pricing-report.md (sections 1-11 incl. findings with sources, probe table, data model + invariant, resolver incl. +1 -> US / +7 -> RU, UX, checkout + fail closed, migration + verification results, deploy order, rollback, owner Razorpay actions, browser checklist).
- docs/razopay/README.md: table row + status line. docs/billing-runbook.md: section 9.
- prettier --check passes on all three; no em dash and no '!' in the report.

## Item 14: full verification (done)
- tsc src errors 0; vitest 227 files / 3031 tests green; eslint 0 errors (1 pre-existing warning in page.tsx); prettier write on touched (6 files had pre-existing non-Prettier formatting reflowed); build into .next-verify3 exit 0; tsconfig.json restored; .next-verify3 and scratch files removed. Details in verification.md.
- Open: browser checklist (report section 11) needs a real session.
