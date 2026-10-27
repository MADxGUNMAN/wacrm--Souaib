# Localized pricing and multi-currency Razorpay billing: plan

Repo: `d:\Junkies Coder\whatsapp-crm-nextjs` (Windows, PowerShell, Next.js 16.2.6).
Before writing any route handler or page code, read the relevant guide in
`node_modules/next/dist/docs/` (route handlers, server components, `proxy.ts`).
Rules that apply to every item: AGENTS.md sections 2, 4, 7, 8. No git commits,
no Scrum.txt / Google Sheets logging, never touch account
`b69f6811-ab01-4b6d-b89e-68b65bdcba5d`, live checks only on demo account
`c1db92d7-7ae4-44ac-aae7-b62e152b0341`, never cancel a Razorpay subscription,
no real-money actions. Copy: plain prose, no exclamation marks, no em dashes.

---

## A. Razorpay findings

### A.1 Test-mode probe (run 25-10-2026, deleted afterwards)

Throwaway `scratch/probe-usd-plan.cjs` read the `rzp_test_` key from
`.env.local` (refused to run on a non-test key, printed no secret), called
`POST /v1/plans` then `GET /v1/plans/{id}`. No subscription was created.

| Request                                         | Create   | Fetch    | Returned plan                                 |
| ----------------------------------------------- | -------- | -------- | --------------------------------------------- |
| USD, period monthly, interval 1, amount 100     | HTTP 200 | HTTP 200 | `plan_TspUOkUrt9hHpV`, item.currency `USD`    |
| USD, period daily, interval 30, amount 6000     | HTTP 200 | HTTP 200 | `plan_TspUP2Ytfet3mY`, `USD`, 6000 (= $60/30d) |
| AED, period daily, interval 30, amount 2000     | HTTP 200 | HTTP 200 | `plan_TspUPFVuByEM3D`, `AED`                  |

The three probe plans stay in the test account (Razorpay has no plan delete
API); they are unreferenced and harmless. Name prefix `PROBE ... (delete me)`.

### A.2 Documentation

- Plans can be created in any Razorpay-supported currency ("Create the plan in
  the currency you want to charge the customer"):
  https://razorpay.com/docs/payments/subscriptions/create-plans/ . The legacy
  page https://razorpay.com/subscriptions/api still says "Currently, only INR is
  supported"; the probe above shows that statement is out of date for plan
  creation.
- Subscriptions settings: UPI AutoPay "Only INR is supported"; eMandate "only in
  INR"; Cards are the only recurring method for other currencies:
  https://razorpay.com/docs/payments/subscriptions/settings/
- International cards must be activated: Dashboard -> Account & Settings ->
  International payments (under Payment methods) -> Activate, plus documents;
  not active by default:
  https://razorpay.com/docs/payments/international-payments/international-debit-credit-cards/
  and https://razorpay.com/docs/payments/international-payments/
- Our own account state (docs/razopay/README.md): test mode International cards
  OFF (test card rejected `international_transaction_not_allowed`). Live mode
  state unknown; the owner must check.

### A.3 Verdict

Razorpay accepts non-INR **plans** (verified). Whether it can **charge** a
non-INR subscription depends on International payments being activated on the
account in that mode, and only cards can pay (UPI AutoPay and eMandate are INR
only). There is no API to read that activation state, and the probe could not
test a charge without creating a subscription (out of bounds). Therefore the
design fails closed: a non-INR currency is chargeable on a deployment only when
it is listed in a new per-deployment env var `RAZORPAY_CHARGE_CURRENCIES`
(default `INR`), which the owner sets after Razorpay activates International
payments. Until then a non-INR country cannot be enabled on that deployment,
and its customers keep seeing Global. The first real non-INR charge must be
proven in test mode on the demo account after International cards are
activated in the test Dashboard.

---

## B. Current schema (read from migrations)

- `subscription_settings` (050, 055, 057, 20260824030000, 20261021020000):
  singleton enforced by `idx_subscription_settings_singleton ON ((TRUE))`;
  `currency TEXT NOT NULL DEFAULT 'INR'`, all page copy, UPI payee,
  `payment_provider` (production = `'razorpay'`).
- `billing_cycles` (050, 055): `cycle_key TEXT NOT NULL UNIQUE`, label, months,
  duration_days, is_default, is_visible, is_recommended, recommended_label,
  position. No region.
- `subscription_plans` (050, 057): name, tagline, features JSONB, is_visible,
  position. One visible plan "Replai".
- `subscription_plan_prices` (050, 055): `UNIQUE (plan_id, cycle_id)`, amount
  NUMERIC(12,2), compare_at_amount, per_day_amount, is_visible. FK cycle ON
  DELETE CASCADE.
- `billing_provider_plans` (20261021000000): `UNIQUE (mode, provider_plan_id)`
  and partial unique `billing_provider_plans_current_key ON (mode, plan_id,
  cycle_id) WHERE is_current AND plan_id IS NOT NULL AND cycle_id IS NOT NULL`.
  Has `currency CHAR(3)`.
- `billing_subscriptions`, `billing_payments`, `billing_invoices`,
  `billing_refunds`: already carry `currency CHAR(3)` and `amount_minor`.
  `billing_claim_checkout(p JSONB)` already stores `p->>'currency'`;
  `billing_apply_payment` already refuses `currency_mismatch`.
- `payment_requests`: `currency TEXT NOT NULL DEFAULT 'INR'`.
- `profiles.phone` (20260919120000): nullable E.164, keyed by `user_id`.
- `accounts.selected_plan_id / selected_cycle_id` (20260824030000).
- Latest migration: `20261025000000_razorpay_billing_phase6.sql`. New file:
  `20261026000000_localized_pricing_regions.sql`.

---

## C. Design decisions

**D1. Regions table, Global stays where it is.** New `pricing_regions` row per
country (`code` ISO alpha-2 PK, `currency`, `is_enabled`, `settings JSONB` copy
overrides, audit columns). Global is implicit and is exactly today's data:
`subscription_settings` singleton + cycles with `region = 'global'`. No Global
row, so nothing about the existing singleton changes and old code keeps
reading it unmodified. A second row in `subscription_settings` is impossible
anyway (singleton index), which rules out a region column there.

**D2. Cycles carry the region; prices inherit it; plans stay shared.**
`billing_cycles.region TEXT NOT NULL DEFAULT 'global'` (constant default, so
every existing row reads `'global'` with no UPDATE: that is the backfill).
Prices hang off `(plan_id, cycle_id)` and the cycle fixes the region, so no
region column on prices (one source of truth, no drift). `subscription_plans`
stays shared: there is one product "Replai" with one feature list; the Plans
tab is really "one card per cycle", so a country with no cycles naturally
loads blank. The plan feature list is edited under Global only and the
country settings tab says so.

**D3. Regional cycles are invisible to pre-localization code by construction.**
Dev and production share the database and production runs old code until it
is redeployed. Old `getPlansBundle` has no region filter and old `resolveQuote`
prices any visible cycle with `settings.currency` (INR), so a visible US cycle
would leak onto every customer's page and be sold in INR. Therefore regional
cycles always keep `is_visible = false` (enforced by CHECK
`region = 'global' OR is_visible = false`) and use a new column
`is_visible_in_region BOOLEAN NOT NULL DEFAULT false`. New code maps
`BillingCycle.is_visible = region === 'global' ? is_visible : is_visible_in_region`
in `normaliseCycle`, and the cycles API writes `is_visible_in_region` for
regional rows. Old code never shows or sells a regional cycle, an old
super-admin attempt to make one visible fails the CHECK, and a code rollback
needs no SQL. `cycle_key` stays globally unique; regional keys are stored with
a `<code lowercased>-` prefix added server-side (`us-monthly`), so no
constraint is dropped.

**D4. One resolver.** Pure `resolvePricingRegion(input)` in
`src/lib/billing/pricing/regions.ts`, plus server loader
`getAccountPricingRegion(accountId)` in `src/lib/billing/pricing/region-store.ts`
used by every consumer. Output
`{ region: 'global' | ISO, currency, countryCode | null, source: 'subscription' | 'phone' | 'fallback', reason }`.
Rules, in order:
1. Pinned: if the account has a live mandate in this deployment's mode
   (latest `billing_subscriptions` row with status in `MANDATE_STATUSES` from
   `checkout.ts`), its region is the region of its `cycle_id` (via
   `billing_cycles.region`; null cycle -> currency `INR` means global). Use it
   if it is `'global'` or still usable (rule 3). Source `subscription`.
2. Phone: owner = `accounts.owner_user_id` -> `profiles.phone` (`.eq('user_id', ...)`,
   never `.eq('id', ...)`). Only an E.164 string starting with `+` is read.
   Country = longest matching dial code (`findCountryByDialPrefix` in
   `src/lib/phone/countries.ts`, which already sorts longest first, so
   `+1876` -> Jamaica, `+1242` -> Bahamas). Shared codes with no longer match
   use an explicit table `SHARED_DIAL_CODE_DEFAULT = { '1': 'US', '7': 'RU' }`:
   `+1` -> United States (Canada and other NANP members without a 4-digit
   entry resolve to US; no NANP area-code table exists in the repo), `+7` ->
   Russia (Kazakhstan shares it). Documented in the report.
3. Usable = row exists, `is_enabled`, currency set, at least one cycle in the
   region with `is_visible_in_region` and a visible price > 0 for the visible
   plan, AND (`currency = 'INR'` OR (`provider === 'razorpay'` AND currency in
   `config.chargeCurrencies`)). Completeness is recomputed at read time, so
   deleting a country's cycles after enabling sends its customers to Global.
4. Otherwise Global (currency = `subscription_settings.currency`). Reasons:
   `no_phone`, `unknown_dial_code`, `region_not_configured`, `region_disabled`,
   `region_incomplete`, `currency_not_chargeable`, `manual_upi_inr_only`.

**D5. Live vs snapshot.** Live for display and new checkouts until a live
mandate exists; then the mandate's region wins (D4 rule 1). Existing mandates
keep charging their immutable Razorpay plan whatever happens later (phone
change, country enabled or disabled). No new snapshot column: the mandate row
already stores `currency`, `amount_minor`, `cycle_id`.

**D6. Server re-resolves at checkout.** `resolveQuote(planId, cycleId, pricing)`
rejects a cycle whose region differs from the resolved region (400, "That
billing term is not available for your workspace. Reload the page to see
current prices.") and takes currency from the resolved region, never from the
client. Same check in `setSelectedPlan`; `getSelectedPlan` returns null for a
selection from another region. `startCheckout` already stores `amount_minor`
and `currency` on `billing_subscriptions` via the claim.

**D7. Provider plans keyed by region and currency.** Add
`billing_provider_plans.region TEXT NOT NULL DEFAULT 'global'`; insert it and
put `region` and `currency` in the Razorpay plan notes. Keep the existing
unique index unchanged: each region owns its cycles, so `(mode, plan_id,
cycle_id)` already separates a USD plan from the INR one, and a currency change
on a region's cycle creates a new plan and retires the old (`matches()` already
compares currency). Dropping or rebuilding a live index is avoided.

**D8. Fail closed for currencies Razorpay cannot charge.** New
`RAZORPAY_CHARGE_CURRENCIES` (comma list, `INR` always included, invalid
tokens dropped with a console warning rather than throwing, because a config
error would also stop the webhook processor). Enabling a non-INR country is
refused unless Razorpay is configured here, the currency is in that list, and a
preflight `ensureProviderPlan` succeeds for every priced visible cycle in this
deployment's mode (creates the Razorpay plans; objects only, no money). The
resolver re-checks per request (D4 rule 3). At checkout a Razorpay error is
stored verbatim in `last_error` and, when it concerns currency or international
acceptance, answered with code `currency_not_supported` and a precise message.
Nothing ever falls back to charging INR for a non-INR plan.

**D9. Manual UPI is INR only.** The resolver never gives a non-INR region to an
account whose provider is `manual_upi` (reason `manual_upi_inr_only`), and
`/api/billing/upi-qr` and `POST /api/billing/payment-requests` refuse a quote
whose currency is not INR with 409 `manual_upi_inr_only` (defence in depth).
Region settings drop `upi_id`/`upi_payee_name` when the currency is not INR.

**D10. Region settings = whitelisted overrides.** `pricing_regions.settings`
holds only copy keys (the `TEXT_FIELDS` of the settings route minus `upi_*`
for non-INR and minus `currency`, plus `show_custom_plan`, `show_trial_badges`,
`member_blocked_show_owner_contact`, `custom_plan_features`). Platform-wide
keys (`is_enabled`, `trial_days`, `grace_days`, `payment_provider`,
`autopay_grace_days`) are Global only. Effective settings =
`{ ...global, ...nonEmptyOverrides, currency: region.currency }`. The tab opens
blank; each field shows the Global value as placeholder ("Blank fields use the
Global wording"). Currency is required and editable only while the country is
disabled.

**D11. Formatting with zero INR change.** New `formatPlanAmount(amount,
currency)` in `src/lib/billing/money-format.ts`: INR delegates to today's
`formatCurrency(amount, 'INR')` (identical output), other currencies use
`en-US` grouping and show minor digits when the amount is not whole ($1.99
stays $1.99). Used by the upgrade page, PricingSection, plans panel, checkout
display, Razorpay payment component. `money-format` uses `en-IN` for INR and
`en-US` otherwise. The hardcoded `₹5` verification note and `₹0.00 (Free
Setup)` become currency-aware.

**D12. Landing page.** `src/app/page.tsx` is `force-dynamic`; it resolves the
signed-in visitor's workspace region (try/catch, any failure -> Global) and
anonymous visitors see Global. The CMS `price_currency` override in
PricingSection applies only to the Global bundle.

**D13. Super-admin UX.** Region selector at the right end of the tabs bar
(Popover + search input from `src/components/ui/popover.tsx`, `input.tsx`):
"Global (Universal)" first and default, then the 224 countries of
`COUNTRIES` as `Name (+dial)` with flag, sorted by name, each with a status dot:
green Enabled, amber "Enabled, not chargeable here", slate Draft (row or
cycles exist, not enabled), hollow Not set up. Selected region in the URL
(`?region=US`) so reloads keep it. For a country: header strip with currency
field, "Enable localized plan" switch (validation errors listed inline), the
notice "Customers in <country> see the Global plan until this is enabled.",
and a "Copy from Global" button (copies cycle structure and page copy, never
amounts, only while the country has no cycles). All three tabs take
`region` as a prop and call the APIs with it.

**D14. Support visibility.** `/api/super-admin/billing/subscriptions` adds
`pricingRegion { region, currency, source, reason }` per row using the pure
resolver (regions and completeness loaded once per request); the Subscribers
panel shows a compact "Pricing" badge (flag + code + currency, or "Global")
with the reason in the existing info-tooltip pattern.

**D15. Rollback.** Instant: `update pricing_regions set is_enabled = false;`
(everyone sees Global; mandates keep running). Code rollback: redeploy the
previous image, no SQL needed (D3). Schema is additive; dropping it is not
part of rollback.

### Migration outline (`20261026000000_localized_pricing_regions.sql`)

```sql
-- Additive and idempotent. No UPDATE or DELETE of existing rows.
CREATE TABLE IF NOT EXISTS public.pricing_regions (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  currency CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_at TIMESTAMPTZ,
  enabled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_regions_settings_object CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT pricing_regions_enabled_needs_currency CHECK (NOT is_enabled OR currency IS NOT NULL)
);
DROP TRIGGER IF EXISTS set_updated_at ON public.pricing_regions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pricing_regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.pricing_regions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pricing_regions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pricing_regions TO service_role;

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS is_visible_in_region BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_region_check;
ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_region_check
  CHECK (region = 'global' OR region ~ '^[A-Z]{2}$');
ALTER TABLE public.billing_cycles DROP CONSTRAINT IF EXISTS billing_cycles_region_hidden_from_legacy;
ALTER TABLE public.billing_cycles ADD CONSTRAINT billing_cycles_region_hidden_from_legacy
  CHECK (region = 'global' OR is_visible = FALSE);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_region_position
  ON public.billing_cycles (region, position);

ALTER TABLE public.billing_provider_plans
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global';
ALTER TABLE public.billing_provider_plans DROP CONSTRAINT IF EXISTS billing_provider_plans_region_check;
ALTER TABLE public.billing_provider_plans ADD CONSTRAINT billing_provider_plans_region_check
  CHECK (region = 'global' OR region ~ '^[A-Z]{2}$');
-- COMMENT ON each new table/column explaining D3 and D7.
```

Both new CHECKs pass on existing rows (all `'global'`). Header comment states:
additive, idempotent, existing rows read `'global'`, old code unaffected,
regional cycles hidden from old code by the CHECK.

---

## D. Implementation items (ordered)

- [ ] 1. Write the migration file (do not apply).
      Content per section C outline, with header comment and COMMENT ON
      statements in the style of `20261021000000_razorpay_billing_schema.sql`.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\supabase\migrations\20261026000000_localized_pricing_regions.sql`
      Verify: file sorts last in `Get-ChildItem supabase/migrations | Sort Name`; it contains no `UPDATE`, `DELETE`, `DROP TABLE`, `DROP COLUMN` or `RENAME` (Select-String check), and no change to `subscription_settings`.

- [ ] 2. **SHARED DATABASE: apply the migration. PAUSE FIRST.**
      Before touching project `dknolotutfiesuhbhmze`, call `send_message` with
      severity `warning` describing: the new table `pricing_regions`, the two
      new `billing_cycles` columns + two CHECKs + index, the new
      `billing_provider_plans.region` column + CHECK; that existing rows read
      `'global'` with no row rewritten; that production code keeps working; and
      that nothing customer-visible changes. Wait for explicit approval. Then:
      (a) idempotency check via `execute_sql`: `BEGIN;` + the migration body
      twice + `SELECT` of the new columns/constraints +
      `SELECT count(*) FROM billing_cycles WHERE region <> 'global'` (expect 0) +
      `ROLLBACK;`; (b) `apply_migration` with name
      `localized_pricing_regions`; (c) read-only verification:
      `information_schema.columns` for the 4 new columns,
      `pg_constraint` for the 3 CHECKs, `select region, count(*) from billing_cycles group by 1`
      (all `global`), `select count(*) from pricing_regions` (0),
      `select payment_provider from subscription_settings` (still `razorpay`).
      Do not create any regional rows on the shared DB in any later item.
      Files: none (database only).
      Verify: the three query results above recorded in the report; dev server `/upgrade-plan` for the demo owner still shows INR 33/day and INR 25/day.

- [ ] 3. Charge-currency config.
      Add `chargeCurrencies: ReadonlySet<string>` to `RazorpayConfig`, parsed
      from `RAZORPAY_CHARGE_CURRENCIES` (uppercase, `^[A-Z]{3}$`, invalid
      tokens dropped with `console.warn` naming the variable, `INR` always
      present; optional field so existing literals compile, treat missing as
      `{INR}` via a helper `chargeCurrenciesOf(config)`). Document in
      `.env.local.example` next to the Razorpay block.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\config.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\config.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\.env.local.example`
      Verify: `npx vitest run src/lib/billing/razorpay/config.test.ts` passes, with new cases: unset -> {INR}; `usd, AED` -> {INR, USD, AED}; `US$,USD` -> {INR, USD}.

- [ ] 4. Pure region library + tests.
      `regions.ts` exports: `GLOBAL_REGION = 'global'`, `isRegionCode`,
      `regionLabel(code)` ("Global (Universal)" or `Name (+dial)`),
      `REGION_OPTIONS` (Global first, then `COUNTRIES` sorted by name),
      `SHARED_DIAL_CODE_DEFAULT`, `countryFromPhone(phone)` (E.164 only,
      longest prefix via `findCountryByDialPrefix`, shared-code table),
      `regionCycleKey(code, slug)`, `REGION_SETTINGS_KEYS` + `sanitizeRegionSettings(body, currency)`
      (whitelist, length limits matching the settings route, drops `upi_*`
      unless INR, normalises `custom_plan_features` via
      `normalisePlanFeatures/serialisePlanFeatures`), `mergeRegionSettings(global, region)`,
      `assessRegion(row, catalogue, ctx)` -> `{ complete, chargeable, problems[] }`,
      `validateRegionEnable(...)` -> list of precise problems (no currency;
      currency not a valid ISO code via `Intl.supportedValuesOf('currency')`;
      no visible priced cycle; cycle under 7 whole days; amount not a whole
      number of minor units via `toMinor`; Razorpay not configured here;
      currency not in `RAZORPAY_CHARGE_CURRENCIES`), and
      `resolvePricingRegion(input)` implementing D4 exactly.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\pricing\regions.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\pricing\regions.test.ts`
      Verify: `npx vitest run src/lib/billing/pricing` passes. Cases: `+919876543210` -> IN; `+14155550100` -> US; `+16135550100` (Canada) -> US by rule; `+18765550100` -> JM; `+971501234567` -> AE; `+77011234567` -> RU; null / `''` / `9876543210` (no plus) -> global `no_phone`; `+999123` -> global `unknown_dial_code`; US disabled -> global `region_disabled`; US enabled with no priced cycle -> `region_incomplete`; USD not chargeable -> `currency_not_chargeable`; manual provider + USD -> `manual_upi_inr_only`; INR country + manual -> that country; live mandate on a global cycle with US phone and US enabled -> global `subscription`; live mandate on a US cycle -> US even if phone is now +91; mandate region later disabled -> falls through to phone rule; enable validation returns each problem.

- [ ] 5. Region data layer and region-aware catalogue queries.
      `region-store.ts` (server only, service role): `loadPricingRegions()`,
      `loadRegionCatalogue()` (cycles with region, visible plan, prices; one
      round trip each), `getAccountPricingRegion(accountId, { settings?, config? })`
      reading `accounts.owner_user_id`, `profiles.phone` by `user_id`, latest
      live `billing_subscriptions` row for `config.mode` (status in
      `MANDATE_STATUSES`) and its cycle region, provider via
      `resolvePaymentProvider`; any read error -> Global with a logged reason
      (never throws on the hot path). In `queries.ts`: `normaliseCycle` maps
      `region` and the D3 visibility rule; `getPlansBundle({ includeHidden, region = 'global' })`
      filters cycles `.eq('region', region)`, visibility by the mapped flag,
      prices `.in('cycle_id', ids)`, settings = `getRegionSettings(region)`
      (Global returns today's `getSubscriptionSettings()` unchanged) and adds
      `region: { code, currency, label, isGlobal }` to `PlansBundle`;
      `resolveQuote(planId, cycleId, pricing)` selects `region` and
      `is_visible_in_region`, rejects a region mismatch, currency from
      `pricing.currency`; `getSelectedPlan(accountId, pricing)` and
      `setSelectedPlan(accountId, planId, cycleId, pricing)` enforce the region.
      Types: `BillingCycle.region`, `PlansBundle.region?`, `PricingRegionResolution`.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\pricing\region-store.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\pricing\region-store.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\subscription\queries.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\subscription\queries.region.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\subscription\types.ts`
      Verify: `npx vitest run src/lib/billing/pricing src/lib/subscription` passes using `src/lib/billing/__fixtures__/fake-admin.ts` (assert `.eq('user_id', ...)` on profiles and `.eq('region', ...)` on cycles): global bundle excludes US cycles; US bundle has only US cycles/prices with currency USD and merged copy; regional cycle with `is_visible_in_region=false` hidden from customers but shown with `includeHidden`; `resolveQuote` with a Global cycle under a US resolution throws `QuoteError`; Global quote unchanged (INR 990). Then `npx tsc --noEmit 2>&1 | Select-String "^src.*error TS"` = 0 (fix every caller of the changed signatures in later items, or pass `GLOBAL` temporarily so this item compiles).

- [ ] 6. Provider plans carry region and currency.
      `PlanQuote` gains `region`; `ensureProviderPlan` inserts `region`, adds
      `region` and `currency` to Razorpay `notes`; selection logic and index
      untouched (D7). `BillingProviderPlanRow` gains `region`.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\plans.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\plans.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\types.ts`
      Verify: `npx vitest run src/lib/billing/razorpay/plans.test.ts` passes; new case: USD 60 on a 30-day US cycle calls `createPlan` with `amount: 6000, currency: 'USD', period: 'daily', interval: 30` and inserts `region: 'US'`; an existing INR row for a different cycle is not retired; existing INR tests unchanged.

- [ ] 7. Money formatting.
      Add `formatPlanAmount(amount, currency)` (D11) and locale rule to
      `money-format.ts`; switch price displays to it in the upgrade page,
      PricingSection, plans panel, `service.ts` (`buildCheckoutDisplay` vars),
      `razorpay-payment.tsx` (including the `₹0.00 (Free Setup)` literal ->
      `formatPlanAmount(0, currency)` + " (Free Setup)"). Card verification
      note: keep the exact INR text for INR, use "Cards: Razorpay makes a
      small verification charge and refunds it automatically." otherwise.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\money-format.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\money-format.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\service.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\billing\razorpay-payment.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\upgrade-plan\page.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\landing\PricingSection.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\plans-panel.tsx`
      Verify: `npx vitest run src/lib/billing/money-format.test.ts src/lib/billing/razorpay/service.test.ts` passes; new cases `formatPlanAmount(990,'INR') === formatCurrency(990,'INR')`, `(9000,'INR')` same, `(60,'USD') === '$60'`, `(1.99,'USD') === '$1.99'`; existing service tests (INR copy) unchanged.

- [ ] 8. Customer routes use the resolved region; checkout re-resolves; manual UPI guard.
      - `/api/billing/plans`: `getAccountPricingRegion(ctx.accountId)` then `getPlansBundle({ region })`.
      - `/api/billing/select-plan` and `/api/billing/subscription`: pass the resolution to `setSelectedPlan` / `getSelectedPlan`; subscription response adds `pricingRegion` (region, currency, label) for the client.
      - `/api/billing/razorpay/checkout` GET and POST: resolve region server-side after `requireBillingOwnerWithState`; `resolveQuote(planId, cycleId, pricing)`; `copyFrom(effective region settings)`; `ensureProviderPlan` with `quote.region`. In `service.ts` `startCheckout`, when `createSubscription` throws a `RazorpayApiError` whose code/description mentions currency or international, throw `BillingServiceError('currency_not_supported', 'Payments in <CUR> are not available right now. Please contact support.', 409)` (Razorpay wording still stored via `markCreateFailed`).
      - `/api/billing/razorpay/payment-method`: use the region settings for checkout name/copy.
      - `/api/billing/upi-qr` and `POST /api/billing/payment-requests`: resolve region, pass to `resolveQuote`, refuse non-INR with 409 `manual_upi_inr_only` ("UPI payments are available in INR only. Please use card AutoPay for this plan."), and use region settings only when INR.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\plans\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\select-plan\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\subscription\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\razorpay\checkout\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\razorpay\payment-method\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\upi-qr\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\payment-requests\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\service.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\razorpay\routes.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\billing\manual-retirement.test.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\razorpay\service.test.ts`
      Verify: `npx vitest run src/app/api/billing src/lib/billing/razorpay` passes. New cases: US owner POST checkout claims `amount_minor: 6000, currency: 'USD'` and `ensurePlan` gets region US; same owner posting a Global cycle id gets 400; Global owner unchanged (99000 INR); Razorpay currency rejection -> 409 `currency_not_supported` and `markCreateFailed` called with Razorpay's text; upi-qr with a USD resolution -> 409 `manual_upi_inr_only` and no QR generated.

- [ ] 9. Upgrade page and landing page.
      Upgrade page needs no structural change (bundle and currency come from
      `/api/billing/plans`); confirm the `currency` variable is the only
      currency source and that the page header shows nothing new for Global.
      Landing: in `src/app/page.tsx` replace `getPlansBundle()` with a helper
      `getLandingPlansBundle()` (in `region-store.ts`) that tries
      `getCurrentAccount()` and the account's region inside try/catch, else
      Global. In `PricingSection.tsx` apply the CMS `price_currency` override
      only when `bundle.region` is absent or Global.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\page.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\landing\PricingSection.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\lib\billing\pricing\region-store.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\upgrade-plan\page.tsx`
      Verify: `npx tsc --noEmit 2>&1 | Select-String "^src.*error TS"` = 0; on the dev server (do not run `next build` while it is live) the landing page logged out and `/upgrade-plan` as the demo owner show exactly INR 33/day = INR 990 for 30 days and INR 25/day = INR 9,000 for 360 days.

- [ ] 10. Super-admin APIs: region scoping, enable validation, copy from Global.
      - `cycles/route.ts`: GET `?region=` (default global, validated with `isRegionCode`), POST takes `region`, prefixes `cycle_key` for countries, writes `is_visible_in_region` and forces `is_visible=false` for countries; PUT reads the stored row's region (never the body) and applies the same mapping; `clearOtherDefaults` and the DELETE "last visible cycle" guard scoped to the region (for a country the guard applies only while it is enabled).
      - `plans/route.ts` GET: `getPlansBundle({ includeHidden: true, region })` plus `regionStatus` from `assessRegion`. Plan POST/PUT/DELETE unchanged (shared plans).
      - `prices/route.ts`: unchanged logic; PUT additionally rejects `per_day_amount`/`amount` not representable in the cycle region's currency (`toMinor`), reading region from the cycle row.
      - `settings/route.ts`: GET/PUT `?region=`; Global path byte-for-byte unchanged; country path reads/writes `pricing_regions.settings` via `sanitizeRegionSettings`, rejects platform-wide keys with a field error, upserts the row with `created_by/updated_by`.
      - New `regions/route.ts`: GET list (every configured region with currency, enabled, cycle/price counts, `assessRegion` result, chargeable on this deployment, Razorpay mode); PUT `{ code, currency?, is_enabled? }` (currency change refused while enabled; enable runs `validateRegionEnable`, then for non-INR the preflight `ensureProviderPlan` per priced visible cycle via `getBillingDeps()`; returns 422 with the problems list on failure; sets `enabled_at/enabled_by_user_id`); disable always allowed.
      - New `regions/copy/route.ts`: POST `{ code }` copies Global cycles (labels, durations, positions, default/recommended flags, `is_visible_in_region` from Global `is_visible`, keys prefixed) and Global copy into `settings`; never copies amounts; 409 if the country already has cycles.
      All guarded by `requireSuperAdmin(request)`.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\cycles\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\plans\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\prices\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\settings\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\regions\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\regions\copy\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\regions\routes.test.ts`
      Verify: `npx vitest run src/app/api/super-admin/billing` passes. New cases: cycles GET `?region=US` filters by `.eq('region','US')`; POST for US stores `region:'US'`, `cycle_key:'us-monthly'`, `is_visible:false`, `is_visible_in_region:true`; `?region=XX` and `?region=../` rejected 400; settings PUT for US with `trial_days` rejected, with `page_heading` stored in `pricing_regions.settings`, Global PUT unchanged; enable fails with each problem (no currency, no priced cycle, 5-day cycle, currency not chargeable, Razorpay preflight error text passed through) and succeeds for INR and for USD when chargeable; copy refuses when cycles exist and never writes `subscription_plan_prices`.

- [ ] 11. Super-admin UI: selector, status, enable switch, notice, copy from Global.
      New `region-selector.tsx` (Popover + search, Global first, status dots
      from the regions GET, keyboard accessible, `aria-label="Pricing region"`)
      placed at the right end of the tabs bar in the plans page; region kept in
      `?region=` via `useSearchParams`/`useRouter` (check the Next 16 docs for
      `useSearchParams` Suspense requirements). New `region-header.tsx`
      (country only): currency input with `CURRENCIES` datalist, "Enable
      localized plan" switch (`switch.tsx`) showing the 422 problems inline,
      notice "Customers in <country> see the Global plan until this is
      enabled.", amber note when enabled but not chargeable on this deployment,
      "Copy from Global" button with confirm. `PlansPanel`, `CyclesPanel`,
      `BillingConfigPanel` take `region` and pass it to every fetch; for a
      country: blank fields with Global placeholders, UPI section replaced by
      the INR-only notice when currency is not INR, platform-wide fields and
      the shared feature list hidden with "Set under Global", currency label
      from the region. Global view unchanged apart from the selector.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\(super-admin)\super-admin\plans\page.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\region-selector.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\region-header.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\plans-panel.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\cycles-panel.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\billing-config-panel.tsx`
      Verify: tsc filter = 0; `npx eslint` on these files clean; on the dev server `/super-admin/plans` Global tabs look and save exactly as before, selecting "United States (+1)" shows three blank tabs and the notice. Do NOT save country data on the shared DB (item 2 rule); UI save paths are covered by item 10 tests.

- [ ] 12. Subscribers panel pricing column.
      Subscriptions route selects `cycle_id, currency, status` on
      `billing_subscriptions` (already queried), loads regions + catalogue once,
      adds `pricingRegion` per row via `resolvePricingRegion`; panel shows a
      compact "Pricing" badge with the reason in the existing info-tooltip
      style, no horizontal scroll regression.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\subscriptions\route.ts`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\components\super-admin\billing\subscribers-panel.tsx`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\src\app\api\super-admin\billing\subscriptions\route.test.ts` (new)
      Verify: `npx vitest run src/app/api/super-admin/billing/subscriptions` passes (US-phone owner with no enabled US -> Global `region_disabled`; enabled US -> US/USD `phone`); dev server Subscribers tab shows "Global" for every current workspace.

- [ ] 13. Report, README row, runbook section.
      `localized-pricing-report.md`: Razorpay findings with sources and the
      probe table (section A), data model and the D3 invariant, resolver rules
      incl. `+1` -> US and `+7` -> RU and the 4-digit NANP entries, live vs
      pinned rule, super-admin UX, checkout flow, manual UPI INR-only rule,
      migration text and the item 2 verification results, deploy order
      (migration -> production deploy -> set `RAZORPAY_CHARGE_CURRENCIES` in
      `PROD_ENV` and redeploy -> configure a country on production
      super-admin -> enable), rollback (D15), what the owner must do in
      Razorpay (activate International payments in live and test, keep Cards
      enabled in Subscriptions settings, note UPI/eMandate are INR only,
      purpose code), and a browser checklist (Global unchanged on landing,
      upgrade, checkout preview; selector and blank tabs; enable refused when
      not chargeable; after production setup: US demo-phone owner sees USD
      cards and checkout shows USD; Indian owner unaffected; subscriber
      pricing badge). README: one table row linking it and a status line.
      Runbook: section 9 "Localized pricing switch-off" with the D15 SQL.
      Files: `d:\Junkies Coder\whatsapp-crm-nextjs\docs\razopay\localized-pricing-report.md`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\docs\razopay\README.md`,
      `d:\Junkies Coder\whatsapp-crm-nextjs\docs\billing-runbook.md`
      Verify: `npx prettier --check` on the three docs passes; no `!` in prose, no em dashes (Select-String for `—` in the new report returns nothing).

- [ ] 14. Full verification.
      `npx tsc --noEmit 2>&1 | Select-String "^src.*error TS"` -> 0 lines;
      `npx vitest run` -> all green (baseline 222 files / 2,924 tests plus the
      new ones); `npx eslint <touched files>` (only the 3 known
      `whatsapp-setup.tsx` errors are pre-existing and not in scope);
      `npx prettier --write <touched files>` (mention whole-file reformatting
      in the summary); `$env:NEXT_DIST_DIR=".next-verify3"; npm run build`,
      then `git checkout -- tsconfig.json` and remove `.next-verify3`. Never
      run the build while relying on the dev server's route table without
      expecting the clash in AGENTS.md section 1. Delete any `scratch/` files
      created. Confirm on disk with Select-String where editor buffers may be
      stale.
      Files: none new.
      Verify: all commands above succeed; `git status` shows only the files listed in items 1 to 13.

---

## E. Gaps and assumptions

- Razorpay charge capability for non-INR cannot be verified without creating a
  subscription; covered by D8 (env allowlist + preflight + precise errors).
- Canada and other NANP members without a 4-digit entry resolve to the United
  States; adding a NANP area-code table later only changes `countryFromPhone`.
- Members of a workspace see the owner's region (billing is per workspace).
- Country copy fields left blank fall back to the Global wording; currency is
  never inherited.
- Production stays on Global until the new code is deployed AND the owner sets
  `RAZORPAY_CHARGE_CURRENCIES` AND enables a country; nothing in this task
  changes `subscription_settings.payment_provider`.
