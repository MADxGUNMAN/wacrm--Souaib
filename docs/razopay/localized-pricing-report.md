# Localized pricing and multi-currency billing: report

Status (27-10-2026): code complete and verified locally; migration applied
to the shared database. No country plan exists anywhere yet, so every
customer, in dev and production, still sees and pays the Global INR plan
exactly as before.

Plan: `.agents/tasks/localized-pricing/plan.md`. Migration:
`supabase/migrations/20261026000000_localized_pricing_regions.sql`.

## 1. What changed for the user

- The current INR catalogue (one plan "Replai"; Monthly 30 days INR 990
  shown as INR 33/day, Yearly 360 days INR 9,000 shown as INR 25/day, and all
  page and UPI settings) is now the **Global (Universal)** plan. It is the
  fallback for every country without an enabled localized plan.
- `/super-admin/plans` has a pricing region selector at the right end of the
  tabs bar: "Global (Universal)" first and default, then every country as
  "Name (+dial)", for example "India (+91)", "United States (+1)", "United
  Arab Emirates (+971)".
- A country opens blank on all three tabs. The admin sets its currency,
  billing cycles, totals and daily display rates, and page copy, then turns
  on "Enable localized plan".
- A workspace's pricing country comes from the account owner's phone
  (`profiles.phone`, E.164). Billing is per workspace and the owner pays.
- Checkout re-resolves the country and price on the server and sends that
  exact amount and currency to Razorpay.

## 2. Razorpay currency findings

| Question                               | Finding                                                                                                                                                               | Source                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Can a Subscriptions plan be non-INR?   | Yes. Test-mode probe on 25-10-2026 created and fetched USD and AED plans (table below). The older page saying only INR is supported is out of date for plan creation. | Probe; [Create plans](https://razorpay.com/docs/payments/subscriptions/create-plans/)                              |
| Which recurring methods take non-INR?  | Cards only. UPI AutoPay supports INR only; eMandate is INR only.                                                                                                      | [Subscriptions settings](https://razorpay.com/docs/payments/subscriptions/settings/)                               |
| Are international cards on by default? | No. The merchant requests them from the Dashboard (Account & Settings, International payments under Payment methods).                                                 | [International cards](https://razorpay.com/docs/payments/international-payments/international-debit-credit-cards/) |
| Our account today                      | Test mode: international cards off (test card rejected with `international_transaction_not_allowed`). Live mode: not known; the owner must check.                     | `docs/razopay/README.md`                                                                                           |
| Can the app read the activation state? | No API exists for it.                                                                                                                                                 | Razorpay docs                                                                                                      |

Probe (test mode, plans only, no subscription and no money):

| Request                                     | Create   | Fetch    | Result                                         |
| ------------------------------------------- | -------- | -------- | ---------------------------------------------- |
| USD, period monthly, interval 1, amount 100 | HTTP 200 | HTTP 200 | `plan_TspUOkUrt9hHpV`, currency USD            |
| USD, period daily, interval 30, amount 6000 | HTTP 200 | HTTP 200 | `plan_TspUP2Ytfet3mY`, USD 6000 (USD 60 / 30d) |
| AED, period daily, interval 30, amount 2000 | HTTP 200 | HTTP 200 | `plan_TspUPFVuByEM3D`, AED                     |

The three probe plans stay in the test account (Razorpay has no plan delete
API). They are unreferenced and harmless.

**Verdict.** Razorpay accepts non-INR plans. Charging them depends on
International payments being active for that mode, and only cards can pay.
Because the app cannot read that state, the design fails closed (section 6).

## 3. Data model

- `pricing_regions` (new): one row per configured country. `code` (ISO
  alpha-2, primary key), `currency`, `is_enabled`, `settings` (whitelisted
  copy overrides), audit columns. RLS on, service role only. No row means
  "not set up". There is no row for Global.
- `billing_cycles.region` (new, `NOT NULL DEFAULT 'global'`) and
  `billing_cycles.is_visible_in_region` (new, default false). Prices hang off
  `(plan_id, cycle_id)`, so the cycle fixes the region of every price.
- `billing_provider_plans.region` (new, default `'global'`). Razorpay plan
  notes also carry `region` and `currency`.
- `subscription_settings`, `subscription_plans`, the existing unique index
  `billing_provider_plans_current_key (mode, plan_id, cycle_id)` and every
  existing row are unchanged.

**The legacy-safety invariant.** Dev and production share the database, and
code without region support has no region filter. A CHECK constraint
`billing_cycles_region_hidden_from_legacy` (`region = 'global' OR is_visible
= false`) guarantees a country cycle never looks visible to that code. New
code reads `is_visible` for Global cycles and `is_visible_in_region` for
country cycles. Country `cycle_key` values get a `<code>-` prefix (for
example `us-monthly`) so the unique key stays global.

**Why the provider-plan index was kept.** Each region owns its cycles, so a
US cycle has its own `cycle_id`; the existing `(mode, plan_id, cycle_id)`
key already separates a USD plan from the INR one. A currency change on a
cycle creates a new Razorpay plan and retires the old (the existing
`matches()` compares currency).

## 4. Resolver rules

One pure function, `resolvePricingRegion` in
`src/lib/billing/pricing/regions.ts`, used by the upgrade page, landing
page, checkout, manual UPI routes and the super-admin Subscribers tab.
`getAccountPricingRegion` in `region-store.ts` loads its inputs and never
throws (any read error answers Global with reason `lookup_failed`).

1. **Live mandate pins the region.** If the workspace has a live AutoPay
   mandate in this deployment's mode (status authenticated, active,
   pending, halted or paused), the region of that mandate's cycle wins, so
   a phone change never moves an existing subscriber. If that country has
   since been disabled, rule 2 applies to new checkouts; the mandate itself
   keeps charging its immutable Razorpay plan.
2. **Owner's phone.** Only an E.164 number (`+` and digits) is read, from
   `profiles` by `user_id` (never by `id`). The country is the longest
   matching dialing code in `src/lib/phone/countries.ts`, so `+1876...` is
   Jamaica and `+1242...` is the Bahamas.
3. **Shared dialing codes.** When only a shared code matches, a fixed table
   decides: `+1` is the United States and `+7` is Russia. There is no NANP
   area-code table in the repo, so Canada and other +1 members without
   their own 4-digit entry resolve to the United States. Adding such a table
   later only changes `countryFromPhone`.
4. **Usable country.** The country is used only if its row exists, it is
   enabled, it has a currency, it has at least one visible cycle with a
   visible price above zero for the visible plan, and its currency can be
   charged: INR always; any other currency only when the workspace is on
   Razorpay and the currency is in `RAZORPAY_CHARGE_CURRENCIES`.
   Completeness is recomputed on every request.
5. **Otherwise Global**, with a reason: `no_phone`, `unknown_dial_code`,
   `region_not_configured`, `region_disabled`, `region_incomplete`,
   `currency_not_chargeable`, `manual_upi_inr_only`.

Members of a workspace see the owner's region. Anonymous landing-page
visitors see Global; a signed-in visitor sees their workspace's region.

## 5. Super-admin UX

- **Selector** (`region-selector.tsx`): searchable popover, keyboard
  navigable, `aria-label="Pricing region"`, kept in `?region=` so a reload
  stays on the same country. Status dots: green enabled and live, amber
  enabled but customers still see Global, slate draft, hollow not set up.
- **Country header** (`region-header.tsx`): currency field (ISO list),
  "Enable localized plan" switch, the notice "Customers in <country> see the
  Global plan until this is enabled.", an amber note when the currency cannot
  be charged on this deployment, and "Copy from Global" (copies cycle
  structure and page wording, never amounts, only while the country has no
  cycles). Currency cannot change while enabled.
- **Plans & prices**: only the country's cycles, priced in its currency;
  inputs stay disabled until a currency is set. The plan and its feature
  list are shared and edited under Global.
- **Billing cycles**: country cycles only; visibility is stored as
  `is_visible_in_region`.
- **Page & UPI settings**: every field blank with the Global wording as the
  placeholder; only typed values are stored. UPI fields appear only for an
  INR country; otherwise a notice says UPI is INR only. Trial length, grace,
  enforcement, payment provider and the feature list are Global only and
  are refused for a country with a field error.
- **Enable validation** (`PUT /api/super-admin/billing/regions`, 422 with a
  `problems` list): no currency; currency not ISO 4217; no visible priced
  cycle; a cycle under 7 whole days; an amount that is not whole minor units;
  Razorpay not configured; currency not in `RAZORPAY_CHARGE_CURRENCIES`. For
  a non-INR currency it then creates the Razorpay plan for each priced cycle
  in this deployment's mode and reports Razorpay's own wording if refused.
  Disabling is always allowed.
- **Subscribers tab**: a small pricing badge under the Term cell
  ("Global · INR" or "US · USD") with the reason in the tooltip.

## 6. Checkout flow and fail-closed rules

1. Upgrade page loads `/api/billing/plans`, which resolves the region and
   returns only that region's cycles, prices, copy and currency.
2. "Continue to Payment" and "Start with trial" save the choice through
   `/api/billing/select-plan`, which refuses a cycle from another region.
3. `/api/billing/razorpay/checkout` (preview and start) resolves the region
   again on the server, then `resolveQuote(planId, cycleId, pricing)`
   refuses any cycle outside that region (HTTP 400, "That billing term is not
   available for your workspace. Reload the page to see current prices.") and
   takes the currency from the resolution, never from the browser.
4. The claim stores `amount_minor` and `currency` on
   `billing_subscriptions`; the Razorpay plan is ensured for that region
   and currency (USD 60 on a 30-day cycle is `amount 6000, currency USD,
period daily, interval 30`).
5. If Razorpay refuses the currency or an international payment (plan or
   subscription), the customer gets HTTP 409 `currency_not_supported`
   ("Payments in USD are not available right now. Please contact
   support."), and Razorpay's text is stored in `last_error`. Nothing ever
   retries in INR.

**Charge allowlist.** `RAZORPAY_CHARGE_CURRENCIES` (comma list, INR always
included, invalid codes ignored with a warning) lists the currencies this
deployment may charge. Default is INR only, so a non-INR country cannot be
enabled until the owner adds its currency after Razorpay activates
International payments.

**Manual UPI is INR only.** The resolver never gives a non-INR region to a
manual UPI workspace, and `/api/billing/upi-qr` and
`POST /api/billing/payment-requests` refuse a non-INR quote with 409
`manual_upi_inr_only` ("UPI payments are available in INR only. Please use
card AutoPay for this plan.") before any QR is built. A non-INR country's
merged settings always have no UPI payee.

**Display.** `formatPlanAmount` renders INR through the existing formatter
unchanged; other currencies use en-US grouping and keep cents only when
present (USD 60 shows `$60`, USD 1.99 shows `$1.99`). The INR card
verification text ("Razorpay charges ₹5 ...") and "₹0.00 (Free Setup)" are
unchanged for INR; other currencies get currency-neutral wording.

**Landing page note.** The CMS pricing section (`landing_sections`,
`extra_data.price_currency = USD` and `price_overrides` Monthly 60 / Yearly 360) already shows "$2 / day = $60 for 30 days" to logged-out visitors. That
is existing CMS content, unchanged by this work, and it now applies to the
Global bundle only. A localized bundle always shows its real price.

## 7. Migration

`20261026000000_localized_pricing_regions.sql`: additive and idempotent
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT
IF EXISTS` then `ADD CONSTRAINT`, `CREATE INDEX IF NOT EXISTS`). No UPDATE or
DELETE; the constant `DEFAULT 'global'` is the backfill. Applied on
27-10-2026 to project `dknolotutfiesuhbhmze` after approval.

Verification on the shared database:

- Idempotency: a DO block executed the body twice, then raised to roll
  back. Result `cols=3 cons=3 nonglobal_cycles=0 nonglobal_provider_plans=0
pricing_regions=0`.
- `apply_migration` `localized_pricing_regions`: success.
- Read-only after: `billing_cycles.region` text default `'global'`,
  `billing_cycles.is_visible_in_region` boolean default false,
  `billing_provider_plans.region` text default `'global'`; the 3 CHECKs
  present; `billing_cycles` all `global` (2 rows, both visible);
  `billing_provider_plans` all `global` (4 rows); `pricing_regions` 0 rows;
  `subscription_settings.payment_provider` still `razorpay`; RLS on and no
  `anon` or `authenticated` SELECT on `pricing_regions`.
- No country rows were created on the shared database.

## 8. Deploy order

1. Migration (done).
2. Deploy this code to production (CI). Customers see no change.
3. When Razorpay has activated International payments for live mode, add
   the currency to `RAZORPAY_CHARGE_CURRENCIES` in the `PROD_ENV` secret
   (for example `INR,USD`) and redeploy.
4. On production `/super-admin/plans`, pick the country, set its currency,
   add cycles (or Copy from Global), enter prices, adjust copy.
5. Turn on "Enable localized plan". The server validates and creates the
   Razorpay plans first; any problem is listed and nothing is enabled.

Prove the first non-INR charge in test mode on the demo account
(`c1db92d7-...`) after International cards are active in the test
Dashboard, before enabling a non-INR country in production.

## 9. Rollback

- **Instant, no deploy:** `update pricing_regions set is_enabled = false;`
  Every workspace sees Global on its next page load. Live mandates keep
  their price and currency at Razorpay; cancel them in Super-admin, Payments,
  Subscriptions only if they must stop.
- **Per country:** turn the switch off on `/super-admin/plans`.
- **Code rollback:** redeploy the previous image. No SQL is needed: older
  code ignores the new columns, and the CHECK keeps country cycles hidden
  from it.
- The schema is additive; dropping it is not part of rollback.

## 10. What the owner must do in Razorpay

1. Live and Test Dashboard: Account & Settings, International payments
   (under Payment methods): request activation and provide the documents
   Razorpay asks for. It is not active by default.
2. Subscriptions, Settings: keep **Cards** enabled. UPI AutoPay and
   eMandate cannot collect non-INR, so card is the only method for foreign
   customers.
3. Have the purpose code and export details ready if Razorpay asks for them
   during International activation.
4. Then set `RAZORPAY_CHARGE_CURRENCIES` per deployment (section 8).

## 11. Browser checklist

Global unchanged (do now):

- [ ] Landing page logged out: same cards as before (today the CMS override
      shows USD 60 and USD 360; that is expected).
- [ ] `/upgrade-plan` as the demo owner: INR 33/day = INR 990 for 30 days and
      INR 25/day = INR 9,000 for 360 days; "Continue to Payment" preview shows
      INR 990 and the ₹5 card note.
- [ ] `/super-admin/plans`: Global tabs look and save as before; the selector
      sits at the right of the tabs bar.
- [ ] Selecting "United States (+1)" shows the country header, the notice,
      three blank tabs and the INR-only UPI notice once USD is set. Do not
      save country data on the shared database during this check.
- [ ] Subscribers tab: every workspace shows "Global · INR".

After production setup (owner, when International payments are active):

- [ ] Enabling USD is refused with the RAZORPAY_CHARGE_CURRENCIES message
      until the currency is listed.
- [ ] A test owner with a +1 phone sees USD cards, and checkout shows USD 60
      and a currency-neutral card note.
- [ ] An Indian owner (+91) still sees the Global INR plan.
- [ ] Subscribers tab shows "US · USD" for the US workspace.

## 12. Global currency option (28-10-2026)

Plan: `.agents/tasks/global-currency/plan.md`. Verification:
`.agents/tasks/global-currency/verification.md`.

### What it is

- `/super-admin/plans` now shows a header for Global (Universal) too, in the
  same style as the country header: globe icon, "Global (Universal)", a
  short description, a Currency input (ISO suggestions from
  `src/lib/currency.ts`) and Save. There is no enable switch and no "Copy
  from Global": Global is always on, because it is the fallback for every
  workspace.
- Save checks the currency first, then opens a confirm dialog that states
  the impact and **requires the new price of every Global price row** in the
  new currency (any plan, visible or hidden; today Monthly and Yearly).
  Global prices are plain numbers, so without this 990 INR would silently
  become 990 USD. Daily rate overrides and compare-at prices are cleared
  (a new daily rate can be entered in the dialog).
- Prices and currency are saved by one call,
  `PUT /api/super-admin/billing/global-currency`, which hands both to the
  database function `fn_change_global_currency`. The function locks the
  settings row and every Global price row, checks that the submitted set is
  exactly the set of Global price rows, and writes prices and currency in
  one transaction. There is never a moment where they disagree.
- The old Currency field on Global "Page & UPI settings" is now read-only.
  The settings API refuses a different currency with 409
  `use_global_currency_header` and silently drops an unchanged one.
- Customer-facing amounts follow the row or region currency: the upgrade
  page, landing page and checkout already did; the billing settings card,
  AutoPay card, trial banner, Razorpay rows in billing history and the
  AutoPay emails now use `formatPlanAmount` too. The "₹5 verification
  charge" email sentence is shown for INR mandates only. In
  `plans-panel.tsx` "Total charged (…)" and the daily-rate placeholder
  already follow the region currency.

### Safeguards

- ISO 4217 check (`isValidCurrencyCode`), same as the country header.
- INR is always allowed (it is also the rollback path).
- Any other currency is allowed only when every workspace on the saving
  deployment pays by AutoPay: `payment_provider = 'razorpay'` and no test
  allowlist or live pilot list (`resolveManualIntake` = `retired`), because
  manual UPI accepts INR only. The currency must also be chargeable here:
  Razorpay configured and the code listed in `RAZORPAY_CHARGE_CURRENCIES`.
- For a non-INR target the Razorpay plans of every sold Global cycle are
  created up front in this deployment's mode. A refusal is shown with
  Razorpay's own wording and nothing is changed. Side effect: the current
  `billing_provider_plans` row for that mode moves to the new amount; if the
  change is then refused, the next INR checkout creates a fresh INR plan
  (plans are free and immutable).
- Stale check: the request carries the currency the page loaded with, and
  the function refuses if it changed meanwhile.
- `resolveQuote` reads the Global currency before the price and again
  after it, and refuses a mismatch with "Prices were just updated. Reload
  the page to see current prices." So a checkout that races the change can
  never pair a new price with the old currency or the reverse.
- A Global price edited later through the prices route must be a whole
  number of minor units of the Global currency (for example no 12.5 JPY).

| Code                         | Status | Meaning                                                   |
| ---------------------------- | ------ | --------------------------------------------------------- |
| `invalid_currency`           | 400    | Not a 3-letter ISO 4217 code                              |
| `unchanged`                  | 400    | Already the Global currency                               |
| `stale`                      | 409    | The Global currency changed since the page loaded         |
| `manual_upi_inr_only`        | 409    | Some or all workspaces here pay by manual UPI             |
| `currency_not_chargeable`    | 409    | Razorpay not configured or code not in the charge list    |
| `prices_required`            | 422    | A Global price is missing or invalid (each one is listed) |
| `razorpay_refused`           | 422    | Razorpay refused a plan in the new currency               |
| `catalogue_changed`          | 409    | Global prices or cycles changed while editing             |
| `invalid_amount`             | 400    | The database refused an amount                            |
| `migration_required`         | 503    | `fn_change_global_currency` is not in the database        |
| `use_global_currency_header` | 409    | Currency sent to the Global settings API                  |

### Consequences to know

- Dev runs Razorpay in test mode, which is always "partial", so on dev the
  Global currency can only stay INR or be restored to INR. A non-INR Global
  is set from production, which is the deployment whose customers it
  affects.
- Dev and production share one database. A change is live in both at once,
  and the dialog says so.
- While Global is not INR, no Global workspace can pay by UPI; the Page &
  UPI settings tab says so.
- The landing page CMS display override (`price_currency` USD with 60 and
  360 today) is separate, applies to logged-out visitors only, and is not
  changed by this. Edit it in CMS, Landing sections.

### Existing subscribers

- A live AutoPay mandate keeps its price and currency. Renewals charge the
  subscription's own Razorpay plan (`provider_plan_id` on
  `billing_subscriptions`); invoices and payments are stored from
  Razorpay's payload with Razorpay's amount and currency; the status routes
  build the AutoPay view from the subscription row. Nothing reads
  `billing_provider_plans` for an existing subscription.
- The resolver now also reports the mandate's own currency
  (`mandateCurrency`). The Subscribers tab shows "Global · USD · AutoPay
  INR" when they differ, and `/api/billing/subscription` returns it in
  `pricingRegion`.
- A halted or paused mandate that the customer replaces at checkout is a
  new purchase at the current Global price and currency.
- Provider plans are keyed by `(mode, plan, cycle)`. Each mode creates its
  plan for the new amount and currency at its first checkout (the saving
  deployment's mode is created up front by the preflight).

### Migration

`supabase/migrations/20261028000000_global_currency_change.sql`: one
function plus grants (service_role only), no table or data change,
idempotent. Status: applied to the shared database on 28-10-2026 after the
owner's approval (migration name `global_currency_change`). Checked
read-only afterwards: SECURITY DEFINER, executable by `service_role` only
(not `anon` or `authenticated`); `subscription_settings` still `INR` /
`razorpay`; a no-write smoke call with a wrong expected currency returned
`stale`. Without the function the Global header answers
`migration_required` and nothing changes.

### Rollback

- In the UI: change Global back to INR on `/super-admin/plans` and enter
  the old prices (Monthly 990, Yearly 9000). This works on every
  deployment.
- SQL equivalent, run only deliberately:
  `select public.fn_change_global_currency('USD','INR','[{"plan_id":"aaa689df-4c95-44b5-b52b-605239d41edd","cycle_id":"9c1f8a3f-7873-4bb7-adb7-2f38511a54c3","amount":990},{"plan_id":"aaa689df-4c95-44b5-b52b-605239d41edd","cycle_id":"84b50ffa-3c2d-47a0-8261-417b29fade68","amount":9000}]'::jsonb);`
  (replace `'USD'` with the current Global currency).
- Redeploying older code does not restore INR: the currency is data.
- Drop the function only after a code rollback:
  `DROP FUNCTION IF EXISTS public.fn_change_global_currency(TEXT, TEXT, JSONB);`

### Browser checklist (read-only, do not save on the shared database)

- [ ] `/super-admin/plans` on Global shows the Global header with INR.
- [ ] Typing USD and Save on dev shows the manual UPI refusal (test mode).
- [ ] Page & UPI settings shows the currency read-only with the pointer to
      the header.
