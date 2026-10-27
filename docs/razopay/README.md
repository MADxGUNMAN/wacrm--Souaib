# Razorpay Subscriptions — documents and reports

All Razorpay work for the CRM lives in this folder (`docs/razopay/`).

| Document                    | Path                                                                                            | What it is                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation plan         | [`docs/razopay/razorpay-subscriptions-plan.md`](./razorpay-subscriptions-plan.md)               | Full design, scenario matrix, schema, phases, decisions D1 to D12 (all accepted with defaults)                                                                                     |
| Phase 0 report              | [`docs/razopay/phase-0-razorpay-setup-report.md`](./phase-0-razorpay-setup-report.md)           | Test-mode checks against Razorpay, objects created, what is and is not configurable through the MCP, Dashboard actions for you                                                     |
| Phase 1 report              | [`docs/razopay/phase-1-implementation-report.md`](./phase-1-implementation-report.md)           | Database tables and functions applied, server library, verification results                                                                                                        |
| Phase 2 report              | [`docs/razopay/phase-2-implementation-report.md`](./phase-2-implementation-report.md)           | Checkout routes and payment UI, payment-attempt record from the MCP, browser and CSP checks, open items                                                                            |
| Phase 3 report              | [`docs/razopay/phase-3-implementation-report.md`](./phase-3-implementation-report.md)           | Webhook receiver, reconciliation cron, billing emails, refunds and disputes, SQL and live checks, your Dashboard actions                                                           |
| Phase 4 report              | [`docs/razopay/phase-4-implementation-report.md`](./phase-4-implementation-report.md)           | MCP re-check, first real webhook, AutoPay card and actions, history with receipts, banners, reminder skip, verification                                                            |
| Phase 5 report              | [`docs/razopay/phase-5-implementation-report.md`](./phase-5-implementation-report.md)           | Super-admin billing tabs and drawer, admin cancel/sync/retry/reconcile with audit, delete and ban cancel AutoPay first, F6 warning, verification                                   |
| Phase 6 report              | [`docs/razopay/phase-6-implementation-report.md`](./phase-6-implementation-report.md)           | Dev provider switch, manual UPI retirement (410), pending-manual checkout refusal, opt-in AutoPay prompts, read-only Manual tab, refund draft                                      |
| Payment details report      | [`docs/razopay/payment-details-report.md`](./payment-details-report.md)                         | Specific Checkout description, notes on every payment (PATCH after apply, backfill), prefill contact, plan/cycle/period/charge type in billing UIs, why App Name/App ID stay empty |
| Payments page redesign      | [`docs/razopay/payments-page-redesign-report.md`](./payments-page-redesign-report.md)           | Five-section layout for /super-admin/payments, legacy URL mapping, shared status labels, cleaned tables, in-app User Guide                                                         |
| Payments page audit and fix | [`docs/razopay/payments-page-audit-and-fix-report.md`](./payments-page-audit-and-fix-report.md) | Channel classification for every billing event, All payments ledger, Collected summary, Activity filters, INR currency, access via                                                 |
| Phase 7 report              | [`docs/razopay/phase-7-go-live-report.md`](./phase-7-go-live-report.md)                         | Live cutover: live webhook and env, deploy, billing cron fix on the server, provider switch for every account, rollback SQL, open items                                            |
| Billing runbook             | [`docs/billing-runbook.md`](../billing-runbook.md)                                              | Operator procedures: webhook disabled, replay, secret rotation, refunds, disputes, reconciliation, cron-ping deploy, provider switch                                               |
| Localized pricing report    | [`docs/razopay/localized-pricing-report.md`](./localized-pricing-report.md)                     | Country pricing plans and multi-currency checkout: Razorpay currency findings, data model, resolver (+1 rule), super-admin UX, fail-closed checkout, migration, rollback           |

## Status (23-10-2026)

| Phase                                    | State                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Setup and capability checks           | Done. Card and UPI AutoPay both work (the earlier test-mode card mandate failure was resolved before go-live).                                                                          |
| 1. Schema and server foundation          | Done. Migrations applied.                                                                                                                                                               |
| 2. Checkout                              | Done. A real UPI AutoPay is set up on the demo account (`sub_TqTtwUDRjijZys`, first charge 6 Apr 2027).                                                                                 |
| 3. Webhooks, reconciliation, emails      | Done. The Dashboard webhook is added and a real Razorpay delivery was received and processed. T3, T5, T8, T13 and T14 still need real charges.                                          |
| 4. Customer billing page and actions     | Done. Settings → Billing checked live on devcrm as the demo owner (AutoPay card, refunded ₹5 setup check, Plan activity).                                                               |
| 5. Super-admin billing, delete/ban       | Done and verified in the browser on devcrm (all tabs, drawer, sync, reconcile, F6 warning). The live delete/ban on the demo AutoPay was skipped by choice.                              |
| 6. Existing customers, manual retirement | Done. Manual UPI retires per account; the Refund and Cancellation Policy is published.                                                                                                  |
| 7. Live cutover                          | Done 23-10-2026. Live keys and webhook on production, billing cron running, `payment_provider = 'razorpay'` for every account. First real plan charge still to arrive (Phase 7 report). |

Localized pricing (27-10-2026): code and migration done. No country plan is
enabled, so every workspace stays on the Global INR plan. Non-INR countries
need International payments activated in Razorpay and
`RAZORPAY_CHARGE_CURRENCIES` set first (localized pricing report, section 8).

## Razorpay account facts (Live Mode, production)

- KYC approved and live mode active (23-10-2026). Production uses the `rzp_live_` key from the `PROD_ENV` GitHub secret.
- Live webhook: `https://wacrm.junkiescoder.com/api/billing/razorpay/webhook`, 25 events, alerts to `junkiescoder@gmail.com`.
- Rollback to manual UPI: `update subscription_settings set payment_provider = 'manual_upi';` (Phase 7 report section 3, `AGENTS.md` section 8).

## Razorpay account facts (Test Mode)

- Test keys stay in use on devcrm and local; test checkouts are limited to `RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS`.
- Subscriptions settings: Cards on, eMandate **off**, Flash Checkout on, UPI AutoPay working in test mode.
- International cards: off. Razorpay rejected the test card with `international_transaction_not_allowed`.
- Webhook: `https://devcrm.junkiescoder.com/api/billing/razorpay/webhook`, added in the Dashboard, alert email `junkiescoder@gmail.com`. Razorpay disables it after 24 hours of failed deliveries, so keep the dev server and tunnel running.
- App test key: starts `rzp_test_TqSJ`. The Razorpay MCP in Kiro uses the same key (checked in Phase 4).
- The MCP covers read-only checks (payments, orders, refunds, tokens, settlements). It has no tools for plans, subscriptions, webhooks or settings. The test account also holds payments from another project, so filter MCP checks by id.
- Test plans in use by the app: `plan_TqTFFd6DbOjteX` (daily × 30, ₹990) and `plan_TqTtwBXlbBxhRM` (Yearly), created by checkout on first use.
