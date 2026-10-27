# Razorpay Phase 5 verification (iteration 1)

Iteration 1: no `review.json` existed, so this pass was cross-feature integration verification. No source edits were needed; every seam checked matched.

## Integration checks

| Seam | Result |
| --- | --- |
| FEAT-003 panels vs FEAT-001 route shapes | Match. Panels import `AdminSubscriptionRow`, `AdminSubscriptionDetailRow`, `AdminPaymentRow`, `AdminInvoiceRow`, `AdminRefundRow`, `AdminDisputeRow`, `AdminWebhookEventRow`, `AdminBillingEventRow` as types straight from `admin-db.ts`, so tsc checks them. Drawer `DetailResponse` = `{subscription, invoices, payments, events, webhookEvents, canAct, configuredMode}` (detail route). Sync reads `{subscription, applied}`, cancel reads `{alreadyCancelled, synced}`, overview reads `{configured, mode, overview}` with the exact `billing_admin_overview()` keys (`subscriptions` `"<mode>:<status>"`, `trialing_with_autopay`, `upcoming_charges_7d`, `failures_7d`, `webhooks{last_received_at,failed,dead,anomalies}`, `last_runs{...,error_count,triggered_by}`). List envelope `{items,total,page,pageSize,totalPages}`; panels send `mode/status/method/kind/sort/dir/search/page/pageSize`, `all` omitted; every status/sort value used by a panel is in the matching `*_LIST_SPEC` allowlist (`live` for subscriptions, `retryable` for webhook events). All 12 URLs the panels call exist. |
| FEAT-002 uses FEAT-001 | `account-autopay.ts` imports `LIVE_AUTOPAY_STATUSES` and `INITIATING_GRACE_MS` from `admin-status.ts` and `adminAudit` from `admin-db.ts`. Subscribers route uses `CHARGING_STATUSES` from `admin-status.ts`; drawer uses `ADMIN_CANCELLABLE`. |
| Delete dialog consumes `live_autopay` | `delete/verify` returns `live_autopay: [{mode, status, provider_subscription_id}]` (cancellable rows); `delete-account-dialog.tsx` stores it after verify and renders the amber `role="note"` on the confirm and final steps. Delete refusals (`autopay_cancel_failed` 502, `autopay_unreachable` 409, `checkout_in_progress` 409) render via `data.error`. |
| Ban UI vs ban route | Page resends with `confirmAutopayCancel: true` after the 409 `autopay_confirmation_required`, reads `payload.autopay.outcome` / `.message` exactly as the route returns. |
| Payments page | Passes `onOpenAutopay` to `SubscribersPanel` (F6 warning link) and `onOpenTab` to the overview panel; drawer opens on `tab=subscriptions&sub=<uuid>`. |

## Plan acceptance (spec §15 Phase 5)

| Criterion | Status |
| --- | --- |
| Every list paginates, filters and searches, checked with 25+ seeded demo-mode rows in a rolled-back transaction | Pass (SQL level). One `DO` block on demo account `c1db92d7-7ae4-44ac-aae7-b62e152b0341` only, ending in `RAISE EXCEPTION`, inserted 26 test-mode `billing_subscriptions` rows (non-live statuses, so the `one_live` index is untouched), selected every `SUBSCRIPTION_COLUMNS` column, and ran the list equivalents: mode test 27, live 0; page 2 of 10 = 10 rows, page 3 = 7; sort `amount_minor desc` top 2 correct; status cancelled 6; `live` group 1; method card 8; method unknown (null or unknown) 9; exact `sub_` id 1; account-name ilike 27; `billing_admin_overview()` `test:cancelled` 6. Route/param logic itself is covered by `admin-query.test.ts` and `routes.test.ts`. |
| Cancel and retry are audited | Pass: `routes.test.ts` asserts rpc `billing_admin_audit` with `p_actor` and the reason on cancel, and `billing_admin_requeue_webhook_event` with the actor on retry; the SQL function writes its own audit row (FEAT-001 rolled-back test). |
| Deleting an account with a live test sub cancels it first, or refuses | Pass in logic and tests (`delete-account.test.ts`: cancel before `sa_delete_account`; 502 and 409 refusals with `sa_delete_account` not called). Not run live: the only live test sub is `sub_TqTtwUDRjijZys`, which must not be cancelled. Real run is the user's call. |
| Banning follows D9 | Pass: `ban-route.test.ts` (409 confirmation without banning, ban then cancel, failure stays banned with `outcome: failed` and `notifyAdmin`, none). |

## Database (project `dknolotutfiesuhbhmze`)

Migration file unchanged this iteration, not re-applied.

| Check | Result |
| --- | --- |
| `md5(prosrc)` live | `billing_admin_audit` 2d4f168445373d3842a243617283b2c8, `billing_admin_overview` e10eca221a48feb607b7f53b8ce1cea0, `billing_admin_requeue_webhook_event` 374475192eebec5a487dbd60604582cd |
| md5 of file bodies (LF), `node scratch/phase5-md5.js` | identical for all 3 |
| Demo account `md5(row_to_json(a)::text)` before / after the seeded block | c5fd666db77009366a38bd13be923fdd / c5fd666db77009366a38bd13be923fdd |
| Counts before / after | `subscription_events` 92/92, `billing_webhook_events` 3/3, `billing_subscriptions` 1/1, `billing_payments` 1/1; seeded `sub_SEEDCHK%` rows after rollback: 0 |

Not touched: `subscription_settings.payment_provider`, account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d`, `sub_TqTtwUDRjijZys`. No Razorpay calls made.

## Verification bar

| # | Command | Result |
| --- | --- | --- |
| 1 | `npx tsc --noEmit 2>&1 \| Select-String "error TS"` | 0 lines (clean, including src/) |
| 2 | `npx vitest run` | 204 files passed (204), 2576 tests passed (2576). Before Phase 5: 198 / 2,467, so +6 files, +109 tests. |
| 3a | `npx eslint <51 Phase 5 src files from git status>` | exit 0, 0 errors, 1 warning: `src/app/(super-admin)/super-admin/accounts/[id]/page.tsx:139` `react-hooks/exhaustive-deps` on `fetchAccount` (pre-existing line, not touched by Phase 5). `whatsapp-setup.tsx` not in the Phase 5 set. |
| 3b | `npx prettier --write <same 51 files>` | No file changed (file hashes identical before and after); `git diff --stat` identical before and after, so nothing to revert. |
| 4 | `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` | exit 0, "Compiled successfully in 27.1s"; route table lists all 12 `/api/super-admin/billing/razorpay/*` routes and `/super-admin/payments`. |
| 4b | `git checkout -- tsconfig.json`; `Remove-Item -Recurse -Force .next-verify3` | done; `tsconfig.json` clean in git status, `.next-verify3` absent. No `next.config.js`/`.mjs` present. |

Permanent tests required by the brief, all present and green:

- non-super-admin 403: `routes.test.ts` `it.each(GETS)` / `it.each(POSTS)` "refuses a non-super-admin"; `ban-route.test.ts` "refuses non-super-admins"; `delete-account.test.ts` "refuses non-super-admins on both steps"
- cross-origin 403: `routes.test.ts` `it.each(POSTS)` (missing Origin and `https://evil.test`, nothing called); `ban-route.test.ts` "refuses cross-site requests and bans nothing"
- wrong password refused: `routes.test.ts` "refuses a wrong password before any Razorpay call"
- delete refused when Razorpay cancel fails: `delete-account.test.ts` "refuses the delete when Razorpay does not cancel, naming the subscription"
- ban cancels AutoPay: `ban-route.test.ts` "with confirmation, bans first, then cancels AutoPay and emails"

## Files Phase 5 created or modified (git status)

Modified (17):

- `src/app/(super-admin)/super-admin/accounts/[id]/page.tsx`
- `src/app/(super-admin)/super-admin/payments/page.tsx`
- `src/app/api/super-admin/accounts/[id]/ban/route.ts`
- `src/app/api/super-admin/accounts/[id]/delete-account.test.ts`
- `src/app/api/super-admin/accounts/[id]/delete/verify/route.ts`
- `src/app/api/super-admin/accounts/[id]/route.ts`
- `src/app/api/super-admin/billing/subscriptions/route.ts`
- `src/components/super-admin/accounts/delete-account-dialog.tsx`
- `src/components/super-admin/billing/activity-panel.tsx`
- `src/components/super-admin/billing/subscribers-panel.tsx`
- `src/lib/billing/razorpay/__fixtures__/phase3.ts`
- `src/lib/billing/razorpay/reconcile.test.ts`
- `src/lib/billing/razorpay/reconcile.ts`
- `src/lib/billing/razorpay/store.ts`
- `src/lib/billing/razorpay/types.ts`
- `src/lib/subscription/types.ts`
- `src/types/super-admin.ts`

Created (35 source/test/migration):

- `supabase/migrations/20261024000000_razorpay_billing_phase5.sql`
- `src/lib/billing/razorpay/account-autopay.ts`, `account-autopay.test.ts`
- `src/lib/billing/razorpay/admin-db.ts`, `admin-http.ts`, `admin-query.ts`, `admin-query.test.ts`, `admin-status.ts`, `admin.ts`, `admin.test.ts`
- `src/lib/super-admin/reauth.ts`
- `src/app/api/super-admin/accounts/[id]/ban/ban-route.test.ts`
- `src/app/api/super-admin/billing/razorpay/` `disputes/route.ts`, `invoices/route.ts`, `overview/route.ts`, `reconcile/route.ts`, `refunds/route.ts`, `routes.test.ts`, `subscriptions/route.ts`, `subscriptions/[id]/route.ts`, `subscriptions/[id]/cancel/route.ts`, `subscriptions/[id]/sync/route.ts`, `transactions/route.ts`, `webhook-events/route.ts`, `webhook-events/[id]/retry/route.ts`
- `src/components/super-admin/billing/` `autopay-warning.tsx`, `autopay-warning.test.tsx`, `razorpay-invoices-panel.tsx`, `razorpay-overview-panel.tsx`, `razorpay-refunds-disputes-panel.tsx`, `razorpay-shared.tsx`, `razorpay-subscription-drawer.tsx`, `razorpay-subscriptions-panel.tsx`, `razorpay-transactions-panel.tsx`, `razorpay-webhooks-panel.tsx`

Workflow files (untracked, not product code): `.agents/tasks/razorpay-phase5/{context.json, plan.md, task.json, features/FEAT-001..003.json, verification.md}`.

Gitignored helpers left in `scratch/`: `phase5-md5.js` (used above for the md5 comparison) and `phase5-routes.js`, kept for the reviewer; plan step 7 deletes them at the end. Phase 5 docs (`docs/razopay/phase-5-implementation-report.md`, README row) are plan step 8 and not written yet.
