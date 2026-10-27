# Implementation Plan: Currency option for Global (Universal) on /super-admin/plans

Repo: `d:\Junkies Coder\whatsapp-crm-nextjs` (Windows, PowerShell, Next.js 16.2.6).
Mandatory reading before code: `AGENTS.md`, `.agents/tasks/localized-pricing/progress.md`,
`docs/razopay/localized-pricing-report.md`, and for the route handler
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.

Hard constraints (restated): the Supabase project `dknolotutfiesuhbhmze` is shared by dev AND
production. Write no data (no SQL UPDATE/INSERT/DELETE, no saving API call, no browser Save
click against the shared DB). Never change `subscription_settings.payment_provider`. Never touch
account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d`. No git commits or git config changes. UI copy:
plain prose, no `!`, no em dashes. Tests live under `src/`. Delete scratch files.

## Facts established during planning (read-only checks, 28-10-2026)

Read-only SELECTs on the shared DB (no writes):

- `subscription_settings`: 1 row, `currency = 'INR'`, `payment_provider = 'razorpay'`.
- One plan `Replai` (`aaa689df-4c95-44b5-b52b-605239d41edd`, visible).
- Global cycles: Monthly `9c1f8a3f-7873-4bb7-adb7-2f38511a54c3` (30 days, visible, price 990),
  Yearly `84b50ffa-3c2d-47a0-8261-417b29fade68` (360 days, visible, price 9000). No
  `per_day_amount` or `compare_at_amount` on any price.
- Country rows now exist: `pricing_regions` has 3 rows (IN, US, AE), with hidden country cycles.
- `billing_provider_plans`: Global Monthly/Yearly INR rows current in both `test` and `live`.
- Live mandates (authenticated/active/pending/halted/paused): none.
- `landing_sections` `pricing` section has a CMS display override: `price_currency = 'USD'`,
  `price_overrides` Monthly 60/2, Yearly 360/1 (applies to the Global bundle only,
  `src/components/landing/PricingSection.tsx:83-93`, `:113-117`).
- Table columns: `subscription_plan_prices(id, plan_id uuid, cycle_id uuid, amount numeric,
  compare_at_amount numeric null, is_visible, created_at, updated_at, per_day_amount numeric null)`;
  `subscription_settings(id uuid, currency text not null, updated_at, payment_provider, ...)`.
- Latest migration file: `supabase/migrations/20261026000000_localized_pricing_regions.sql`.

Code facts that shape the design:

- The Global currency is ALREADY editable today without any safeguard: the Global
  "Page & UPI settings" panel has a Currency input
  (`src/components/super-admin/billing/billing-config-panel.tsx:495-512`) and sends the whole
  settings row on Save (`:365-390`), and `PUT /api/super-admin/billing/settings` accepts
  `currency` in `TEXT_FIELDS` (`src/app/api/super-admin/billing/settings/route.ts:37`, validated
  only as `/^[A-Z]{3}$/` at `:158-167`). That is the exact "₹990 silently becomes $990" hole, so
  it must be closed as part of this work.
- `plans-panel.tsx` labels already follow the region currency: for Global
  `currency = bundle.settings.currency` (`plans-panel.tsx:79-81`), "Total charged
  ({currency})" (`:476`) and the placeholder `auto — ${formatPlanAmount(derivedPerDay, currency)}`
  (`:501-505`). Only the em dash in that placeholder needs changing.
- The shared confirm (`src/components/ui/confirm-dialog.tsx`) renders a static `description`
  and has no form state, so it cannot collect required price inputs. The dialog for this
  feature is built from the same primitives (`@/components/ui/dialog`, `@/components/ui/button`)
  and copies the confirm dialog's layout (icon tile, title, description, outline Cancel,
  default confirm button).
- `resolveManualIntake({ settingsProvider, config })` in `src/lib/billing/razorpay/provider.ts:63-77`
  answers `open` (every account on manual UPI: no Razorpay config, or override `manual_upi`, or
  flag not razorpay), `partial` (test mode always, or a live pilot list), `retired` (live, no pilot
  list, flag razorpay: every account on AutoPay).

## Decisions

D1. Atomic change through a Postgres function (requirement 3). Supabase JS has no
transactions and a PostgREST call touches one table, so a route that writes prices and then
the currency always has a window where they disagree, and a crash between the two writes leaves
them disagreeing with no compensation. A checkout in that window charges the wrong amount
(prices first: ₹12 instead of ₹990; currency first: $990). The clean, safe fix is one
`plpgsql` function, `public.fn_change_global_currency(p_expected_currency, p_new_currency,
p_prices)`, that locks the settings row and every Global price row, verifies the submitted set is
exactly the set of Global price rows, updates every price and the currency, and commits once.
This needs ONE additive, idempotent migration (CREATE OR REPLACE FUNCTION plus grants, no table
change, no data change). It must not be applied without the user's explicit approval (item 2).
Until it is applied the new route answers 503 `migration_required` and changes nothing, so the
code is safe to ship either way.

D2. Required prices = every `subscription_plan_prices` row whose cycle has `region = 'global'`
(any plan, visible or hidden cycle). This is a superset of "every visible Global cycle" and
makes the invariant total: after the call no Global number is left in the old currency, so a
hidden cycle cannot later reappear priced in the wrong currency. Today that is exactly 2 rows.
`per_day_amount` is replaced by the optional new daily rate (blank clears it). `compare_at_amount`
is cleared (not editable anywhere in the UI; none exist today). No row is deleted.

D3. Reader-side consistency in `resolveQuote`. An atomic writer is not enough: the charge path
reads the currency (`getAccountPricingRegion` -> `getSubscriptionSettings`) and the price
(`resolveQuote`) in different statements. Use a read sandwich: currency S1 is read before the
price (already true on every customer route, which pass `pricing`; make it true when `pricing`
is omitted too), then after the price read, for a Global quote, re-read
`subscription_settings.currency` (S2). If S2 differs from the currency being quoted, throw
`QuoteError(PRICES_CHANGED_MESSAGE)`. Because the function commits currency and prices at one
instant, S1-P-S2 can never produce a mismatched pair. Display reads (upgrade page, landing) can
show a mismatched pair for one page load at the instant of the change; a reload fixes it and
nothing is charged from them.

D4. Where a non-INR Global currency is allowed: only where every workspace on the saving
deployment pays by AutoPay, that is `payment_provider = 'razorpay'` (DB flag) AND
`resolveManualIntake(...) === 'retired'`, AND the currency is chargeable here
(`isCurrencyChargeable`: Razorpay configured and the code in `RAZORPAY_CHARGE_CURRENCIES`).
Reason: Global is the fallback for every workspace, and manual UPI accepts INR only, so a
workspace on manual UPI would be left with prices it cannot pay (`upi-qr` and
`payment-requests` answer 409 `manual_upi_inr_only`). Consequence, stated in the UI and the doc:
a dev deployment in Razorpay test mode is always `partial`, so a non-INR Global can only be
saved from production (which is the deployment whose customers it affects, given the shared
DB). Changing back TO INR is always allowed everywhere (it is the rollback path), still with
prices.

D5. Currency validation uses `isValidCurrencyCode` from `src/lib/billing/pricing/regions.ts`
(ISO 4217 via `Intl.supportedValuesOf`), exactly like the country header, with the `CURRENCIES`
datalist from `src/lib/currency.ts` as suggestions. The chargeability rule then restricts the
real choice to INR plus `RAZORPAY_CHARGE_CURRENCIES`.

D6. Razorpay preflight for a non-INR target, mirroring country enable
(`regions/route.ts:111-163`): before calling the function, `ensureProviderPlan` is run for every
submitted row whose plan, cycle and price are visible, with the NEW amount and currency, in this
deployment's mode. Any refusal returns 422 with Razorpay's wording and nothing is changed. Side
effect, accepted and documented: the preflight retires the old INR `billing_provider_plans` row
for that mode and inserts the new one (as checkout would). If the function then refuses (stale),
the next INR checkout simply creates a fresh INR Razorpay plan (plan objects are free and
immutable; existing subscriptions reference `provider_plan_id` directly).

D7. New route `src/app/api/super-admin/billing/global-currency/route.ts` (GET preview, PUT
commit) rather than overloading `PUT /api/super-admin/billing/regions` (which refuses Global by
design at `regions/route.ts:182-187`). The GET returns the exact required price rows, so the
dialog and the server agree on what must be entered.

D8. Close the old path: the Global settings PUT refuses a `currency` that differs from the
stored one (409 `use_global_currency_header`) and silently drops an equal one (the open Global
settings form sends it on every save). The Global settings panel shows the currency read-only
and stops sending it.

D9. Display gap for pinned Global mandates (requirement 4): the resolver reports the CURRENT
Global currency for a live Global mandate (`regions.ts:588-595`), so after INR -> USD a
subscriber still charged ₹990 shows "Global · USD" in the Subscribers tab. Add optional
`mandateCurrency` to `PricingRegionResolution` for `live_mandate` resolutions and show
"AutoPay INR" next to the badge when it differs. Charging is already correct (section (e)).

## (e) Verified: mandate pinning and provider plans under a Global currency change

- Renewals: Razorpay charges the subscription's own immutable plan. The plan id is stored on the
  claim (`src/lib/billing/razorpay/service.ts:411-412`, `provider_plan_id`) and used to create
  the subscription (`service.ts:472`). A Global currency change touches neither
  `billing_subscriptions` nor anything at Razorpay. Reconcile also uses the row's
  `provider_plan_id` (`reconcile.ts:71`). Nothing reads `billing_provider_plans` for an existing
  subscription (only `plans.ts` and the claim), so retiring the old INR row
  (`plans.ts:159-170`) cannot affect a live mandate.
- Invoices and payments: stored from Razorpay's payload with Razorpay's amount and currency
  (`mapping.ts:114-115` payments, `:154-160` invoices); customer history formats with the row's
  currency (`history.ts:138-157`). Emails format `data.currency` from those rows
  (`src/lib/email/autopay.ts:64-74`), except one hardcoded "₹5" (inventory item 9 below).
- Status: `/api/billing/razorpay/status` builds `loadAutopayView(deps.db, row, now)`
  (`status/route.ts:87`) whose amount and currency come from the subscription row
  (`view.ts:108-110`). `/api/billing/subscription` builds `autopay` the same way
  (`subscription/route.ts:139-152`). Its `pricingRegion` and `selectedPlan` follow the current
  Global currency, which is correct for the catalogue (prices and currency agree) but hides the
  mandate's own currency: gap D9.
- Checkout for a mandate holder: the claim answers `autopay_exists`
  (`20261021010000_razorpay_billing_functions.sql:189-191`, `service.ts:432-450`), except a
  halted/paused mandate the customer replaces; that is a NEW purchase at the current Global
  price and currency (document it).
- In-flight unauthorised checkout: the claim reuses a `created` subscription only for the same
  `provider_plan_id` (`20261021010000_razorpay_billing_functions.sql:200-212`); a new currency
  creates a new provider plan, so the old one is superseded, never reused. A popup already open
  before the change that the customer completes becomes an INR mandate at the old price, which is
  what that customer was shown, and is then pinned like any other.
- Provider plans per mode: `ensureProviderPlan` (`plans.ts:101-201`) reads the current row by
  `(mode, plan_id, cycle_id, is_current)`, compares `amount_minor`, `currency`, `period`,
  `interval` (`matches()` `:77-91`); on any difference it creates a Razorpay plan in the quote's
  currency (notes carry `region` and `currency`), retires the old row and inserts the new one
  with `region = 'global'`, race-safe on the unique `(mode, plan_id, cycle_id)` current index.
  Test and live are independent rows; each mode creates its plan at its first checkout (the
  saving deployment's mode is created up front by the preflight, D6). No gap.
- Gap 2 (charge race): closed by D3.

## (d) Inventory: customer-facing Global price displays

| # | Location | Today | Action |
|---|----------|-------|--------|
| 1 | `src/app/upgrade-plan/page.tsx:298` (`currency = settings?.currency ?? 'INR'`), amounts at `:695`, `:703`, `:712`, `:881`, `:892`, `:983` | Bundle currency from `/api/billing/plans` (Global = `subscription_settings.currency`) via `formatPlanAmount` | None. Lines `:9-10` are comments. |
| 2 | Landing `src/app/page.tsx:129` (`getLandingPlansBundle`, `force-dynamic` at `:69`) -> `src/components/landing/PricingSection.tsx:85-93`, `:219`, `:227`, `:236` | `formatPlanAmount(…, currency)`; currency = CMS `price_currency` override (Global only) or `settings.currency` | No code change. The CMS override (USD 60 / USD 360 today) keeps controlling the logged-out landing cards; the dialog and doc must say so (it is edited in CMS, Landing sections, `sections-client.tsx:875-915`). |
| 3 | Checkout copy `src/lib/billing/razorpay/service.ts:169` (amount), `:194-197` (₹5 note gated on INR) | Quote currency | None. |
| 4 | `src/components/billing/razorpay-payment.tsx:96-99`, `:673`, `:681-684` ("₹0.00 (Free Setup)" gated on INR), `:957`, `:1050` | Display/mandate currency via `formatPlanAmount` | None. |
| 5 | `src/components/settings/billing-settings.tsx:342-346` (pending manual payment), `:490` (upcoming plan `selectedPlan.amount/currency`) | `formatCurrency` from `@/lib/currency` (browser locale, 0 decimals) | Switch both to `formatPlanAmount` (`@/lib/billing/money-format`). INR output identical (delegates to `formatCurrency(v,'INR')`); non-INR gets the same rendering as the upgrade page. |
| 6 | `src/components/settings/autopay-card.tsx:90` | `formatCurrency(fromMinor(...), a.currency)` | Switch to `formatPlanAmount`. |
| 7 | `src/components/billing/trial-banner.tsx:138-141` | `formatCurrency(fromMinor(...), autopay.currency)` | Switch to `formatPlanAmount`. |
| 8 | `src/components/settings/billing-history.tsx:881`, `:885`, `:918`, `:922` (Razorpay transaction rows) | `formatCurrency(t.amount, t.currency)` | Switch to `formatPlanAmount`. Leave `:398`, `:699-735` (manual UPI rows, INR only). |
| 9 | Email `src/lib/email/autopay.ts:70` (`money()`), `:168` hardcoded "a small verification charge of ₹5" in `mandate_authenticated` | Row currency; ₹5 always | `money()` -> `formatPlanAmount`; gate the ₹5 sentence on `str(data,'currency') ?? 'INR'` being INR, else "If you used a card, a small verification charge is made and refunded automatically. …" (rest of the sentence unchanged). |
| 10 | Manual UPI screens and emails (`manual-upi-payment.tsx:436/552/570`, `payment-submission-form.tsx:153/241`, `src/lib/email/billing.ts:155/220/397`) | Row/quote currency; manual UPI is INR only and refuses non-INR (409) | None. |
| 11 | Super-admin `plans-panel.tsx:476` "Total charged ({currency})", `:501-505` placeholder | Already region currency | Only replace the em dash: placeholder `auto: ${…}`. |

`PLATFORM_BILLING_CURRENCY = 'INR'` (`money-format.ts:18`) is only a fallback for rows with no
currency (ledger/events/collected); leave it.

## (f) Migration

Needed: yes, one, function only (D1). File
`supabase/migrations/20261028000000_global_currency_change.sql`. Additive and idempotent
(`CREATE OR REPLACE FUNCTION`, `REVOKE`/`GRANT` are repeatable), no table change, no UPDATE,
INSERT or DELETE at migration time. Apply only after explicit user approval (item 2).

---

# Implementation Plan

- [ ] 1. Write the migration file (do not apply it).
      Create `supabase/migrations/20261028000000_global_currency_change.sql` with a header
      comment (purpose, D1, "applied only after approval", rollback
      `DROP FUNCTION IF EXISTS public.fn_change_global_currency(TEXT, TEXT, JSONB);`) and this body:
      ```sql
      CREATE OR REPLACE FUNCTION public.fn_change_global_currency(
        p_expected_currency TEXT,
        p_new_currency TEXT,
        p_prices JSONB
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_id UUID;
        v_current TEXT;
        v_new TEXT := upper(btrim(coalesce(p_new_currency, '')));
        v_have INT;
        v_given INT;
        v_distinct INT;
        v_matched INT;
        v_updated INT;
      BEGIN
        IF v_new !~ '^[A-Z]{3}$' THEN
          RETURN jsonb_build_object('outcome', 'invalid_currency');
        END IF;
        IF p_prices IS NULL OR jsonb_typeof(p_prices) <> 'array' THEN
          RETURN jsonb_build_object('outcome', 'invalid_prices');
        END IF;

        SELECT id, upper(btrim(currency)) INTO v_id, v_current
          FROM subscription_settings LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('outcome', 'settings_missing');
        END IF;
        IF v_current IS DISTINCT FROM upper(btrim(coalesce(p_expected_currency, ''))) THEN
          RETURN jsonb_build_object('outcome', 'stale', 'currency', v_current);
        END IF;
        IF v_new = v_current THEN
          RETURN jsonb_build_object('outcome', 'unchanged', 'currency', v_current);
        END IF;

        -- A concurrent single-price edit waits for this transaction.
        PERFORM 1 FROM subscription_plan_prices pp
          JOIN billing_cycles c ON c.id = pp.cycle_id
         WHERE c.region = 'global'
           FOR UPDATE OF pp;

        SELECT count(*) INTO v_have
          FROM subscription_plan_prices pp
          JOIN billing_cycles c ON c.id = pp.cycle_id
         WHERE c.region = 'global';

        SELECT count(*), count(DISTINCT (w.plan_id, w.cycle_id))
          INTO v_given, v_distinct
          FROM jsonb_to_recordset(p_prices)
            AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC);

        SELECT count(*) INTO v_matched
          FROM jsonb_to_recordset(p_prices)
            AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
          JOIN subscription_plan_prices pp
            ON pp.plan_id = w.plan_id AND pp.cycle_id = w.cycle_id
          JOIN billing_cycles c ON c.id = pp.cycle_id AND c.region = 'global';

        IF v_given <> v_distinct OR v_matched <> v_given OR v_matched <> v_have THEN
          RETURN jsonb_build_object('outcome', 'prices_mismatch',
            'expected', v_have, 'given', v_given);
        END IF;

        IF EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_prices)
            AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
           WHERE w.amount IS NULL OR w.amount <= 0 OR w.amount > 9999999999
              OR w.amount <> round(w.amount, 2)
              OR (w.per_day_amount IS NOT NULL AND (
                    w.per_day_amount <= 0 OR w.per_day_amount > w.amount
                    OR w.per_day_amount <> round(w.per_day_amount, 2)))
        ) THEN
          RETURN jsonb_build_object('outcome', 'invalid_amount');
        END IF;

        UPDATE subscription_plan_prices pp
           SET amount = w.amount,
               per_day_amount = w.per_day_amount,
               compare_at_amount = NULL,
               updated_at = now()
          FROM jsonb_to_recordset(p_prices)
            AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
         WHERE pp.plan_id = w.plan_id AND pp.cycle_id = w.cycle_id;
        GET DIAGNOSTICS v_updated = ROW_COUNT;

        UPDATE subscription_settings
           SET currency = v_new, updated_at = now()
         WHERE id = v_id;

        RETURN jsonb_build_object('outcome', 'changed',
          'previous', v_current, 'currency', v_new, 'prices', v_updated);
      END;
      $$;

      REVOKE ALL ON FUNCTION public.fn_change_global_currency(TEXT, TEXT, JSONB)
        FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.fn_change_global_currency(TEXT, TEXT, JSONB)
        TO service_role;
      ```
      It never touches `payment_provider`, `billing_subscriptions`, `pricing_regions` or any
      country cycle.
      Files: `supabase/migrations/20261028000000_global_currency_change.sql`
      Verify: `Select-String -Path supabase/migrations/20261028000000_global_currency_change.sql
      -Pattern 'payment_provider|DELETE|DROP TABLE|ALTER TABLE|INSERT'` returns only the rollback
      comment line (no statement). File sorts last in `supabase/migrations`.

- [ ] 2. Pause for approval, then apply (or skip) the migration.
      Call `send_message` severity `warning`: "Migration 20261028000000_global_currency_change.sql
      adds one function, public.fn_change_global_currency (service_role only). It changes no
      table and no row. Dev and production share the database, so the function becomes available
      to both at once. May I apply it to dknolotutfiesuhbhmze?" Wait for the answer.
      If approved: apply with the Supabase MCP `apply_migration` (name
      `global_currency_change`, body = the file). Then read-only checks with `execute_sql`:
      `select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon_exec,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
      has_function_privilege('service_role', p.oid, 'execute') as svc_exec
      from pg_proc p where p.proname = 'fn_change_global_currency';` (expect 1 row,
      `anon_exec=false`, `auth_exec=false`, `svc_exec=true`) and
      `select currency, payment_provider from subscription_settings;` (expect INR, razorpay).
      Optional no-write smoke call: `select public.fn_change_global_currency('ZZZ','USD','[]'::jsonb);`
      must return `{"outcome":"stale","currency":"INR"}` (returns before any UPDATE).
      If declined: do not apply; continue. The route returns 503 `migration_required` (item 5)
      and the doc (item 9) records "not applied".
      Record the outcome in `.agents/tasks/global-currency/progress.md`.
      Files: `.agents/tasks/global-currency/progress.md`
      Verify: the read-only query results above, recorded in progress.md.

- [ ] 3. Pure Global-currency rules module (client-safe) with unit tests.
      Create `src/lib/billing/pricing/global-currency.ts`. Imports only pure modules:
      `isValidCurrencyCode`, `isCurrencyChargeable`, `type ChargeContext` from `./regions`;
      `toMinor` from `@/lib/billing/razorpay/money`; `import type { ManualIntake } from
      '@/lib/billing/razorpay/provider'` (type-only, erased, so client-safe). Exports:
      - `interface GlobalPriceRow { planId; planName; planVisible: boolean; cycleId; cycleLabel;
        cycleVisible: boolean; durationDays: number | null; months: number; amount: number;
        perDayAmount: number | null; compareAtAmount: number | null; priceVisible: boolean }`
      - `interface GlobalPriceInput { plan_id: string; cycle_id: string; amount: number;
        per_day_amount: number | null }`
      - `interface GlobalCurrencyContext { ctx: ChargeContext; settingsProvider: string | null;
        manualIntake: ManualIntake }`
      - `type GlobalCurrencyCode = 'invalid_currency' | 'unchanged' | 'manual_upi_inr_only' |
        'currency_not_chargeable'` and `interface GlobalCurrencyRefusal { code; status: 400 | 409;
        message: string }`
      - `globalCurrencyRefusal(currency, c: GlobalCurrencyContext): GlobalCurrencyRefusal | null`:
        INR -> null. Else in order: `settingsProvider !== 'razorpay'` or `manualIntake === 'open'`
        -> 409 `manual_upi_inr_only` "Workspaces on this deployment pay by manual UPI, which
        accepts INR only, so the Global currency must stay INR."; `manualIntake === 'partial'` ->
        409 `manual_upi_inr_only` "Some workspaces on this deployment still pay by manual UPI
        (the Razorpay test allowlist or the live pilot list decides who gets AutoPay), and UPI
        accepts INR only. Global is the fallback for every workspace, so its currency can change
        only on a deployment where every workspace pays by AutoPay."; `!ctx.razorpayConfigured`
        -> 409 `currency_not_chargeable` "Razorpay is not configured on this deployment, so
        {CUR} cannot be charged. Global must always be chargeable."; not in
        `ctx.chargeCurrencies` -> 409 `currency_not_chargeable` "{CUR} is not enabled for
        charging on this deployment. Add it to RAZORPAY_CHARGE_CURRENCIES after Razorpay
        activates International payments."
      - `checkGlobalCurrencyChange({ current, next, ...c })`: `!isValidCurrencyCode(next)` -> 400
        `invalid_currency` "Enter a 3-letter ISO 4217 currency code, for example USD.";
        `next === current` -> 400 `unchanged` "The Global currency is already {CUR}."; else
        `globalCurrencyRefusal(next, c)`.
      - `allowedGlobalCurrencies(c)`: `['INR', ...sorted chargeCurrencies]` deduped, filtered by
        `globalCurrencyRefusal(code, c) === null`.
      - `parseMoneyInput(value): number | null` (same tolerance as `prices/route.ts:31-50`:
        number, or string with `[^0-9.]` stripped; null for blank/non-finite; rounded to 2dp).
      - `globalPriceRowLabel(row, soldPlanId)`: cycle label, prefixed by plan name when the row's
        plan is not the sold plan.
      - `validateGlobalPriceInputs(required: GlobalPriceRow[], submitted: unknown, currency)`
        -> `{ ok: true; prices: GlobalPriceInput[] } | { ok: false; problems: string[] }`.
        Rules: `submitted` must be an array of objects with string `plan_id`/`cycle_id`; any
        pair not in `required` or duplicated -> "One of the prices does not belong to a Global
        billing cycle. Reload the page and try again." For each required row (sold plan
        = first visible plan by order of `required`): missing/blank -> "Enter the new {label}
        price in {CUR}."; `<= 0` or not a number -> "The new {label} price must be a number above
        zero."; `> 9_999_999_999` -> "The new {label} price is too large."; `toMinor(amount,
        currency)` throws -> "{amount} {CUR} on the {label} cycle is not a whole number of {CUR}
        minor units."; `per_day_amount` blank -> null, else must be `> 0`, `<= amount` and
        representable, otherwise "The {label} daily rate must be above zero and no more than the
        total, or left blank." Collect every problem (do not stop at the first).
      - Message constants exported for reuse by the route and UI:
        `GLOBAL_PRICES_REQUIRED_MESSAGE = 'Enter the new price of every Global billing cycle before
        changing the currency.'`, `GLOBAL_CURRENCY_STALE_MESSAGE(cur)`, etc. (exact strings in
        item 5).
      Add `src/lib/billing/pricing/global-currency.test.ts`: invalid code ('US', 'usd' after
      caller upper-casing is valid, 'ZZZ' refused), unchanged, INR always allowed (even with
      `manualIntake: 'partial'` and Razorpay null), flag `manual_upi` refuses USD, intake
      `open`/`partial` refuse USD with their messages, retired + `chargeCurrencies` {INR} refuses
      USD with the RAZORPAY_CHARGE_CURRENCIES message, retired + {INR,USD} allows USD,
      `allowedGlobalCurrencies` for those cases; `parseMoneyInput('₹1,200')` = 1200, `'12.345'`
      = 12.35, `''` = null; `validateGlobalPriceInputs` missing row, duplicate row, unknown row,
      zero, JPY 12.5 refused, USD 12.5 accepted, per-day above total refused, per-day blank ->
      null, all problems collected.
      Files: `src/lib/billing/pricing/global-currency.ts`, `src/lib/billing/pricing/global-currency.test.ts`
      Verify: `npx vitest run src/lib/billing/pricing` all pass; `npx tsc --noEmit 2>&1 |
      Select-String "^src.*error TS"` no output.

- [ ] 4. Resolver `mandateCurrency` and the `resolveQuote` read sandwich (D3, D9).
      (a) `src/lib/subscription/types.ts:265-274`: add optional
      `mandateCurrency?: string | null` to `PricingRegionResolution` with a doc comment
      ("Currency the live AutoPay mandate is charged in; set for reason 'live_mandate'. Can differ
      from `currency` after a Global currency change.").
      (b) `src/lib/billing/pricing/regions.ts` `resolvePricingRegion` (`:580-608`): in the pinned
      Global branch return `{ ...globalResolution(globalCurrency, 'live_mandate', country,
      'subscription'), mandateCurrency: (mandate.currency ?? null)?.toUpperCase() ?? null }`; in
      the pinned country branch add the same `mandateCurrency`. No other behaviour change.
      (c) `src/types/super-admin.ts:705-715`: add `mandateCurrency?: string | null` to
      `SubscriberPricingRegion` (the route spreads the resolution, `subscriptions/route.ts:345-348`,
      so no route change is needed).
      (d) `src/app/api/billing/subscription/route.ts:242-246`: add
      `mandateCurrency: pricing.mandateCurrency ?? null` to `pricingRegion`.
      (e) `src/lib/subscription/queries.ts` `resolveQuote` (`:425-502`): when
      `pricing?.currency` is absent, read the settings currency BEFORE the plan/cycle/price
      `Promise.all` (move `getSubscriptionSettings()` out of it) so S1 precedes P; after the
      reads and the existing checks, when `region === GLOBAL_REGION`, read
      `admin.from('subscription_settings').select('currency').limit(1).maybeSingle()` (S2, a
      direct read so `getSubscriptionSettings` call counts in other tests do not change). If S2
      has a currency and `S2.toUpperCase() !== quotedCurrency`, throw
      `new QuoteError(PRICES_CHANGED_MESSAGE)`; export
      `PRICES_CHANGED_MESSAGE = 'Prices were just updated. Reload the page to see current prices.'`.
      An S2 read error is logged and ignored (do not block checkout on a transient read).
      (f) Tests: `src/lib/billing/pricing/regions.test.ts` add "a live Global mandate reports the
      mandate currency after a Global currency change" (globalCurrency 'USD', mandate
      `{ cycleRegion: 'global', currency: 'INR' }` -> region global, currency USD,
      mandateCurrency INR). `src/lib/subscription/queries.region.test.ts` add "refuses a Global
      quote when the Global currency changes between reads" (fake settings currency differs on
      the second read) and confirm the existing "keeps the Global quote unchanged" still passes.
      If other suites (`src/app/api/billing/**` routes tests, `manual-retirement.test.ts`) mock
      the admin client without `subscription_settings`, adjust only their fakes so the S2 read
      returns the same currency; do not weaken assertions.
      Files: `src/lib/subscription/types.ts`, `src/lib/billing/pricing/regions.ts`,
      `src/types/super-admin.ts`, `src/app/api/billing/subscription/route.ts`,
      `src/lib/subscription/queries.ts`, `src/lib/billing/pricing/regions.test.ts`,
      `src/lib/subscription/queries.region.test.ts` (plus any fake that needs the extra read)
      Verify: `npx vitest run src/lib/billing src/lib/subscription src/app/api/billing` all pass;
      tsc filter shows no output.

- [ ] 5. New API route `GET`/`PUT /api/super-admin/billing/global-currency` with tests.
      Create `src/app/api/super-admin/billing/global-currency/route.ts`
      (`export const dynamic = 'force-dynamic'`; header comment linking the report and D1-D6;
      error-handling shape copied from `regions/route.ts`: `if (err instanceof NextResponse)
      return err;`, `console.error('[super-admin/billing/global-currency] … failed:', err)`).
      Shared loader `loadGlobalPriceRows(admin)`: read `billing_cycles` `id, label, months,
      duration_days, is_visible, position` `.eq('region','global')`; if none, `[]`; read
      `subscription_plan_prices` `plan_id, cycle_id, amount, per_day_amount, compare_at_amount,
      is_visible` `.in('cycle_id', ids)`; read `subscription_plans` `id, name, is_visible,
      position` `.in('id', planIds)`; map to `GlobalPriceRow` (use `toAmount` from
      `@/lib/subscription/plans` for NUMERIC strings), sorted by plan position then cycle
      position. Any read error throws (500).
      Context: `config = getRazorpayConfig()`, `ctx = chargeContextOf(config)` (from
      `region-store.ts`), settings row read directly
      `select('id, currency, payment_provider').limit(1).maybeSingle()`,
      `manualIntake = resolveManualIntake({ settingsProvider: row.payment_provider, config })`.
      GET (after `await requireSuperAdmin(request)`) returns `{ currency, paymentProvider,
      manualIntake, razorpay: { configured, mode, chargeCurrencies (sorted) },
      allowedCurrencies: allowedGlobalCurrencies(...), prices: GlobalPriceRow[], landingOverride }`
      where `landingOverride` is read from `landing_sections` `.eq('section_key','pricing')`
      `.maybeSingle()` `extra_data`: `{ currency: price_currency or null, cycles: Object.keys(
      price_overrides ?? {}) }` when either is set, else null; a read error yields null (best
      effort, logged).
      PUT validation order and responses (all JSON, `Cache-Control` default):
      1. `requireSuperAdmin(request)` (guard's own 401/403).
      2. Body JSON parse failure -> 400 `{ error: 'Invalid JSON body', code: 'bad_request' }`.
      3. `currency = String(body.currency ?? '').trim().toUpperCase()`;
         `expected = String(body.expected_currency ?? '').trim().toUpperCase()`; missing expected
         -> 400 `{ error: 'Reload the page and try again.', code: 'bad_request' }`.
      4. Read settings row; none -> 500 `{ error: 'The subscription settings row is missing.
         Nothing was changed.', code: 'settings_missing' }`.
      5. `expected !== stored` -> 409 `{ error: 'The Global currency changed to {STORED} since
         this page loaded. Reload the page and try again.', code: 'stale' }`.
      6. `checkGlobalCurrencyChange({ current: stored, next: currency, ctx, settingsProvider,
         manualIntake })` -> its `{ error: message, code, field: 'currency' }` with its status
         (400 `invalid_currency`, 400 `unchanged`, 409 `manual_upi_inr_only`, 409
         `currency_not_chargeable`).
      7. `rows = loadGlobalPriceRows(admin)`; `validateGlobalPriceInputs(rows, body.prices,
         currency)` failure -> 422 `{ error: GLOBAL_PRICES_REQUIRED_MESSAGE, code:
         'prices_required', problems }`.
      8. If `currency !== 'INR'`: preflight (D6) via `getBillingDeps()` (catch -> 422
         `razorpay_refused` with problem "Razorpay is not configured on this deployment: {msg}.")
         then `ensureProviderPlan({ admin, client: deps.client, mode: deps.config.mode, env:
         deps.config.env, quote: { planId, planName, cycleId, cycleLabel, cycleMonths,
         cycleDurationDays, amount: newAmount, currency, region: 'global' } })` for each input
         whose row has `planVisible && cycleVisible && priceVisible`; collect failures as
         "Razorpay refused the {label} plan in {CUR}: {message}". Any -> 422 `{ error: 'Razorpay
         refused the new Global prices. Nothing was changed.', code: 'razorpay_refused', problems }`.
      9. `admin.rpc('fn_change_global_currency', { p_expected_currency: stored,
         p_new_currency: currency, p_prices: prices })`. Map: error with `code === 'PGRST202'`
         or message containing `fn_change_global_currency` -> 503 `{ error: 'Changing the Global
         currency needs the database function from migration
         20261028000000_global_currency_change.sql, which is not applied yet. Nothing was
         changed.', code: 'migration_required' }`; other error -> 500 `{ error: error.message }`;
         outcome `stale` -> 409 as step 5 with the returned currency; `unchanged` -> 400 as step
         6; `prices_mismatch` -> 409 `{ error: 'Global prices or billing cycles changed while you
         were editing. Reload the page and try again.', code: 'catalogue_changed' }`;
         `invalid_amount`/`invalid_prices`/`invalid_currency` -> 400 `{ error: 'One of the new
         prices is not valid. Check the amounts and try again.', code: 'invalid_amount' }`;
         `settings_missing` -> 500 as step 4; `changed` -> 200 `{ currency, previousCurrency,
         pricesUpdated }` plus `console.info('[super-admin/billing/global-currency] changed',
         { userId, from, to, prices })`.
      The route never writes `subscription_settings` or prices directly and never touches
      `payment_provider`.
      Add `src/app/api/super-admin/billing/global-currency/route.test.ts` with its own
      in-memory fake (pattern of `regions/routes.test.ts:12-107`, plus `rpc(name, args)` that
      records calls and returns `h.rpcResult`), mocks for `@/lib/auth/admin-client`,
      `@/lib/super-admin/guard`, `@/lib/billing/razorpay/config` (`getRazorpayConfig: () =>
      h.config`), `@/lib/billing/razorpay/runtime` (`getBillingDeps` with `createPlan: h.createPlan`).
      Config fixtures: live retired = `{ mode: 'live', env: 'prod', chargeCurrencies: new
      Set(['INR','USD']), livePilotAccountIds: null, providerOverride: null, ... }` with
      settings `payment_provider: 'razorpay'`; test-mode partial = `{ mode: 'test', ... }`. Cases:
      GET shape (rows sorted, allowedCurrencies ['INR','USD'] when retired, ['INR'] in test mode,
      landingOverride from the pricing section); PUT invalid JSON 400; invalid currency 400; same
      currency 400 `unchanged`; expected mismatch 409 `stale`; flag `manual_upi` + USD 409 and no
      rpc call; test mode + USD 409 partial message; retired + {INR} only + USD 409
      `currency_not_chargeable`; missing Yearly price 422 listing "Enter the new Yearly price in
      USD."; JPY with 12.5 422; Razorpay `createPlan` throwing `RazorpayApiError` 422
      `razorpay_refused` with its wording and no rpc call; success: rpc called once with exactly
      `{ p_expected_currency: 'INR', p_new_currency: 'USD', p_prices: [{ plan_id, cycle_id,
      amount: 12, per_day_amount: null }, …] }`, 200 body, and no `update`/`upsert` write on
      `subscription_settings` or `subscription_plan_prices` recorded; USD -> INR in test mode
      allowed with no `createPlan` call; rpc outcome `stale` 409, `prices_mismatch` 409
      `catalogue_changed`, rpc error `{ code: 'PGRST202' }` 503 `migration_required`.
      Files: `src/app/api/super-admin/billing/global-currency/route.ts`,
      `src/app/api/super-admin/billing/global-currency/route.test.ts`
      Verify: `npx vitest run src/app/api/super-admin/billing` all pass; tsc filter no output.

- [ ] 6. Close the old unguarded paths (D8) and validate Global price representability.
      (a) `src/app/api/super-admin/billing/settings/route.ts` Global PUT (`:357-396`): change the
      existing-row read to `.select('id, currency')`. After `buildPatch`, if `'currency' in patch`
      and a row exists: equal (case-insensitive) -> `delete patch.currency`; different -> return
      409 `{ error: 'Change the Global currency from the Global header on Plans & prices, so every
      Global price is converted at the same time.', code: 'use_global_currency_header', field:
      'currency' }` without writing. Keep the fresh-DB insert path unchanged. If deleting
      currency leaves the patch empty, return the existing 400 "No editable fields were
      supplied". Update the header comment.
      (b) `src/app/api/super-admin/billing/prices/route.ts` `assertRepresentableInCycleCurrency`
      (`:53-84`): for a Global cycle read `subscription_settings.currency` (`.select('currency')
      .limit(1).maybeSingle()`) and run the same `toMinor` check instead of returning early
      (for INR this accepts every 2dp value as before).
      (c) Tests in `src/app/api/super-admin/billing/regions/routes.test.ts`: "Global settings
      PUT refuses a different currency and writes nothing" (seed `subscription_settings` with
      INR, PUT `{ currency: 'USD', page_heading: 'x' }` -> 409, no write recorded); "Global
      settings PUT drops an unchanged currency" (PUT `{ currency: 'INR', page_heading: 'x' }` ->
      200, recorded update payload has no `currency`); "a Global price must be representable in
      the Global currency" (settings JPY, PUT price 12.5 on a Global cycle -> 400). Existing
      Global settings/price tests must still pass unchanged.
      Files: `src/app/api/super-admin/billing/settings/route.ts`,
      `src/app/api/super-admin/billing/prices/route.ts`,
      `src/app/api/super-admin/billing/regions/routes.test.ts`
      Verify: `npx vitest run src/app/api/super-admin/billing` all pass.

- [ ] 7. Super-admin UI: Global header, change dialog, page wiring, settings panel.
      (a) NEW `src/components/super-admin/billing/global-currency-dialog.tsx`
      (`'use client'`), `GlobalCurrencyDialog({ open, onOpenChange, from, to, rows,
      landingOverride, onChanged })`, built from `Dialog`, `DialogContent`, `DialogTitle`,
      `DialogDescription`, `DialogFooter` (`@/components/ui/dialog`) and `Button`
      (`@/components/ui/button`) with the confirm dialog's layout (amber `AlertTriangle` tile
      `bg-amber-500/10 text-amber-600 border border-amber-500/20`, `sm:max-w-lg`,
      `rounded-2xl`). Content, in order:
      - Title: "Change the Global currency from {FROM} to {TO}?"
      - Amber box: "Dev and production share one database. Saving here changes the Global
        currency and prices for production customers immediately, even from a dev deployment."
      - "Global prices are stored as plain numbers, so they are not converted for you. Enter the
        new price of every Global billing cycle in {TO}. The prices and the currency are saved
        together in one step."
      - "Every workspace without an enabled localized plan sees and pays these prices from its
        next page load. Existing AutoPay subscriptions keep the price and currency they were
        bought with, including renewals and invoices."
      - When `landingOverride`: "The landing page pricing section has its own display override
        ({currency or 'amounts only'}) set in CMS, Landing sections. It is not changed here."
      - When any row has `perDayAmount` or `compareAtAmount`: "Daily rate overrides and
        compare-at prices in {FROM} are cleared. Enter a new daily rate if you want one."
      - One row per `GlobalPriceRow`: label via `globalPriceRowLabel`, "{n} days" (or months),
        a "Hidden" pill when `!cycleVisible || !priceVisible`, "Now {formatPlanAmount(amount,
        FROM)}", a required `Input` labelled "New total ({TO})" (`inputMode="decimal"`,
        `id`/`htmlFor`, `aria-required`), and when `perDayAmount != null` an optional input
        "Daily rate shown ({TO}, optional)". A live preview line "{formatPlanAmount(perDay, TO)} /
        day = {formatPlanAmount(total, TO)}" when the total parses (`parseMoneyInput`,
        `perDayAmount` from `@/lib/subscription/plans`).
      - When `rows.length === 0`: "No Global price exists yet, so only the currency changes."
      - Server error + `problems` list in a `role="alert"` red box (same markup as
        `region-header.tsx:290-307`).
      - Footer: outline "Cancel"; confirm "Change currency to {TO}" (spinner while saving),
        disabled until every required total parses above zero.
      Submit: `PUT /api/super-admin/billing/global-currency` with `{ currency: to,
      expected_currency: from, prices: [{ plan_id, cycle_id, amount, per_day_amount }] }`; on
      200 close and `await onChanged()`; on error show `payload.error` (fallback "Could not
      change the Global currency ({status})") and `payload.problems`.
      (b) NEW `src/components/super-admin/billing/global-region-header.tsx` (`'use client'`),
      `GlobalRegionHeader({ onChanged })`. Fetches `GET /api/super-admin/billing/global-currency`
      on mount (loading: small spinner row inside the same card; load error: red alert "Could not
      load the Global currency"). Markup copies `region-header.tsx:162-237`: `section`
      `aria-label="Global (Universal) pricing"`, lucide `Globe` icon (`h-5 w-5 text-slate-500`)
      in place of the flag, `h2` "Global (Universal)", `p` "The fallback plan for every country
      without an enabled localized plan. Currency: {CUR}." Right side: "Currency" label +
      `Input` (`id="global-currency"`, `list="global-currency-options"`, `maxLength={3}`,
      uppercase, `font-mono w-24 h-9`), `<datalist id="global-currency-options">` from
      `CURRENCIES`, and a "Save" button (`Save`/`Loader2` icons, same classes) disabled while
      loading, empty or unchanged. No enable switch, no Copy from Global. Save runs
      `checkGlobalCurrencyChange` client-side with the GET context; a refusal shows in the red
      alert; otherwise opens `GlobalCurrencyDialog`. Notes under the row:
      - `Info` line when `allowedCurrencies` is `['INR']`: the matching refusal message for a
        non-INR currency (manual UPI or RAZORPAY_CHARGE_CURRENCIES text) so the admin knows why
        only INR is offered.
      - Amber `CircleAlert` box when the STORED currency is not INR and
        `globalCurrencyRefusal(stored, …)` is non-null on this deployment: "{CUR} cannot be
        charged on this deployment: {message} Workspaces served by this deployment cannot pay
        until this is fixed or Global is changed back to INR."
      After a successful change: `await onChanged()` (the page bumps its nonce, remounting this
      header, which refetches).
      (c) `src/app/(super-admin)/super-admin/plans/page.tsx:144-155`: render
      `<GlobalRegionHeader key={`global-${nonce}`} onChanged={async () => { await loadRegions();
      setNonce((n) => n + 1); }} />` when `isGlobal`, keep `RegionHeader` for countries. Update
      the file header comment (Global header with currency).
      (d) `src/components/super-admin/billing/billing-config-panel.tsx`: replace the Global
      Currency `Input` (`:495-512`) with a read-only block (same label; value in a
      `h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-700`
      box; hint "Change it in the Global header above, so prices are converted at the same time.
      UPI settles INR only."); in `save()` add `delete payload.currency;` next to the other
      deletes (`:371-381`) with a comment pointing at D8. When `settings.currency !== 'INR'`, add
      a slate note in the UPI section: "UPI accepts INR only. While Global is in {CUR}, no
      workspace on the Global plan can pay by UPI."
      (e) `src/components/super-admin/billing/plans-panel.tsx:501`: placeholder `auto: ${…}`
      (no em dash). Confirm `:476` and `:501-505` use `currency` (already true).
      Files: `src/components/super-admin/billing/global-currency-dialog.tsx`,
      `src/components/super-admin/billing/global-region-header.tsx`,
      `src/app/(super-admin)/super-admin/plans/page.tsx`,
      `src/components/super-admin/billing/billing-config-panel.tsx`,
      `src/components/super-admin/billing/plans-panel.tsx`
      Verify: tsc filter no output; `npx eslint` on these five files clean (the 3 known
      `whatsapp-setup.tsx` errors are unrelated); `Select-String -Path <the two new files>
      -Pattern '\u2014'` finds no em dash, and a read of the copy finds no `!`. Do NOT click Save
      in a browser against the shared DB.

- [ ] 8. Customer-facing formatting, email note and Subscribers badge.
      (a) Inventory rows 5-9: switch `formatCurrency` to `formatPlanAmount` (import from
      `@/lib/billing/money-format`; drop the `@/lib/currency` import where it becomes unused) in
      `src/components/settings/billing-settings.tsx:342`, `:490`;
      `src/components/settings/autopay-card.tsx:90`; `src/components/billing/trial-banner.tsx:138`;
      `src/components/settings/billing-history.tsx:881`, `:885`, `:918`, `:922` (leave `:398`,
      `:699-735`); `src/lib/email/autopay.ts:70` (`money()`).
      (b) `src/lib/email/autopay.ts:166-169` `mandate_authenticated` notice: INR keeps the exact
      current sentence; any other currency gets "If you used a card, a small verification charge
      is made and refunded automatically. You may also get an email from Razorpay about this
      mandate. You can cancel AutoPay at any time from Billing."
      (c) `src/components/super-admin/billing/subscribers-panel.tsx` `PricingBadge` (`:660-690`):
      when `pricing.mandateCurrency` is set and differs from `pricing.currency`, append
      ` · AutoPay {mandateCurrency}` to the label and " AutoPay keeps charging
      {mandateCurrency} at the price it was bought with." to the `title`.
      (d) Tests: `src/lib/billing/money-format.test.ts` add `formatPlanAmount` cases: 990 INR
      equals `formatCurrency(990,'INR')`, 12 USD '$12', 12.5 USD '$12.50', 1500 JPY '¥1,500'.
      `src/lib/email/autopay.test.ts` add: `mandate_authenticated` with `currency: 'USD',
      amount_minor: 1200` contains '$12' and not '₹5'; with INR still contains 'charge of ₹5'.
      Files: the seven files in (a)-(c), `src/lib/billing/money-format.test.ts`,
      `src/lib/email/autopay.test.ts`
      Verify: `npx vitest run src/lib/billing src/lib/email src/components` all pass; tsc filter
      no output.

- [ ] 9. Append the doc section.
      Append "## 12. Global currency option (28-10-2026)" to
      `docs/razopay/localized-pricing-report.md` (no em dashes, no `!`), covering:
      - What: Global header on `/super-admin/plans` with Currency + Save; the dialog requires the
        new price of every Global billing cycle and saves prices and currency in one database
        transaction (`fn_change_global_currency`); the old Currency field on Page & UPI settings
        is now read-only and the settings API refuses a currency change (409
        `use_global_currency_header`).
      - Safeguards: ISO 4217 check; non-INR only where every workspace pays by AutoPay
        (`payment_provider = razorpay` and no test allowlist or live pilot list), and only for a
        currency in `RAZORPAY_CHARGE_CURRENCIES`; INR always allowed; Razorpay plan preflight;
        stale-check on the old currency; `resolveQuote` re-reads the currency after the price
        and refuses a mismatch; error codes table (`invalid_currency`, `unchanged`, `stale`,
        `manual_upi_inr_only`, `currency_not_chargeable`, `prices_required`, `razorpay_refused`,
        `catalogue_changed`, `invalid_amount`, `migration_required`).
      - Consequence: dev in Razorpay test mode can only keep or restore INR; a non-INR Global is
        set from production. Dev and production share the database, so a change is live in both.
      - Existing subscribers: mandates keep price and currency (renewals, invoices, status come
        from the subscription row and Razorpay); Subscribers badge shows "AutoPay INR" when it
        differs; a halted or paused mandate replaced at checkout is a new purchase at the current
        Global price; provider plans are recreated per mode on demand.
      - Landing page CMS override (USD 60 / USD 360) is separate and not changed.
      - Migration `20261028000000_global_currency_change.sql`: function only, applied on <date>
        after approval, or "not applied" (then the header answers `migration_required`).
      - Rollback: in the UI, change Global back to INR with the old prices (Monthly 990, Yearly
        9000). SQL equivalent (run only deliberately):
        `select public.fn_change_global_currency('USD','INR','[{"plan_id":"aaa689df-4c95-44b5-b52b-605239d41edd","cycle_id":"9c1f8a3f-7873-4bb7-adb7-2f38511a54c3","amount":990},{"plan_id":"aaa689df-4c95-44b5-b52b-605239d41edd","cycle_id":"84b50ffa-3c2d-47a0-8261-417b29fade68","amount":9000}]'::jsonb);`
        Redeploying older code does NOT restore INR (the currency is data). Drop the function only
        after a code rollback: `DROP FUNCTION IF EXISTS public.fn_change_global_currency(TEXT, TEXT, JSONB);`
      - Browser checklist items (read-only): Global header renders with INR; Save with USD on
        dev shows the manual UPI refusal; Page & UPI settings shows the read-only currency.
      Also update the status line at the top of the report only if it would otherwise be wrong.
      Files: `docs/razopay/localized-pricing-report.md`
      Verify: `npx prettier --check docs/razopay/localized-pricing-report.md` passes;
      `Select-String -Path docs/razopay/localized-pricing-report.md -Pattern '\u2014|!'` finds
      nothing new in section 12.

- [ ] 10. Full verification and cleanup.
      Run, in `d:\Junkies Coder\whatsapp-crm-nextjs`:
      - `npx tsc --noEmit 2>&1 | Select-String "^src.*error TS"` -> no output.
      - `npx vitest run` -> all files and tests pass (baseline 227 files / 3,031 tests; expect
        +2 files and the new cases).
      - `npx eslint <every touched .ts/.tsx>` -> no errors.
      - `npx prettier --write <every touched .ts/.tsx/.md file>` (not the .sql); note in the
        summary any file Prettier reflowed beyond the change.
      - `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` -> exit 0; then
        `git checkout -- tsconfig.json` and `Remove-Item -Recurse -Force .next-verify3`; reset
        `$env:NEXT_DIST_DIR` (`Remove-Item Env:NEXT_DIST_DIR`). Never run a build into `.next`
        while a dev server is live (AGENTS.md section 1).
      - Delete any `scratch/` files created. Confirm on disk (Select-String) for files edited via
        buffers.
      - Confirm no data changed: read-only `select currency, payment_provider from
        subscription_settings;` still `INR`, `razorpay`.
      Record results in `.agents/tasks/global-currency/verification.md`. Per the user's global
      rule, end by asking "Do you want me to log this change? (yes/no)" rather than writing to
      `D:\Junkies Coder\Scrum.txt` automatically.
      Files: `.agents/tasks/global-currency/verification.md`
      Verify: all commands above succeed as stated.

## Gaps and assumptions

- Assumed the `stale`, `unchanged` and type checks in the route duplicate the function's checks
  on purpose: the route gives readable messages, the function is the authority under
  concurrency.
- Assumed a non-INR Global saved from dev is not a goal: D4 refuses it in test mode, which the
  user should hear about in the final summary (the reason is the shared database plus manual UPI
  being INR only).
- The landing CMS override is left as is (admin-authored content, out of scope); the dialog and
  doc state it.
- No UI component tests are planned (none exist for these panels); logic lives in the tested pure
  module and route.
