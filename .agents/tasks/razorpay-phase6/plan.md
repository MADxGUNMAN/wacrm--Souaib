# Implementation Plan: Razorpay Phase 6 (existing-customer transition, manual-flow retirement)

Repo: `d:\Junkies Coder\whatsapp-crm-nextjs` (Next 16.2.6, Windows, PowerShell). Always use absolute paths.
Spec: `docs/razopay/razorpay-subscriptions-plan.md` §15 Phase 6, §11, §7.2 last row, §8.1/8.3, §3.4 flow D, §9 item 9, F11, §12.1 item 3, §16.
Read first: `AGENTS.md` (§1 traps, §2 verification bar, §4 data landmines), `docs/razopay/phase-5-implementation-report.md` (report format), `docs/razopay/README.md`.

## Hard safety rules (apply to every item)

- Never write `subscription_settings.payment_provider` (shared by dev and production; it is `manual_upi` today and stays that way).
- Never touch account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d`. Never cancel `sub_TqTtwUDRjijZys`. Razorpay test mode only, no Razorpay write calls.
- No UPDATE/DELETE of existing customer rows. Only DB write in this phase: one additive `INSERT ... ON CONFLICT (slug) DO NOTHING` of an UNPUBLISHED legal draft.
- Live SQL tests only on demo account `c1db92d7-7ae4-44ac-aae7-b62e152b0341`, inside a `DO` block ending with `RAISE EXCEPTION` (rolled back).
- Do not run `next build` with the default dist dir (dev server may be live). Do not edit `.env.local` (secrets; the user flips the provider). No commits, no git config changes, no logging to Scrum.txt.
- Tooling: verify each edit with `Select-String`; for multi-line edits that `str_replace` fumbles, use a node script in `scratch/` (gitignored) and delete it at the end. PowerShell expands `$$` in `node -e`, so use script files.
- Copy: plain prose, no exclamation marks, no em dashes.

## Design decisions (made here, do not re-decide)

D-A. Provider switch = env-scoped override, never a DB flip. New optional server-only env var `BILLING_PROVIDER_OVERRIDE` (`manual_upi` | `razorpay`), parsed in `readRazorpayConfig` ONLY when `BILLING_ENV=dev`; with `BILLING_ENV=prod` it is ignored (not an error, because a config error would also stop the webhook processor and access must keep following money). An invalid value on dev throws `RazorpayConfigError` naming the variable (fails closed to manual UPI on dev only). Rules in `resolvePaymentProvider`:
  1. no config -> `manual_upi` (production today: no Razorpay keys, so production stays manual whatever happens on dev)
  2. `config.providerOverride === 'manual_upi'` -> `manual_upi` for every account on this deployment
  3. test mode -> allowlist decides (unchanged; `razorpay` override means the same as unset, a non-allowlisted account can never get Razorpay in test mode)
  4. live + pilot list -> pilot decides (unchanged)
  5. live -> `config.providerOverride ?? settingsProvider` (override replaces the DB flag only on a dev deployment)
  Dev flip: today `.env.local` has no override, so the demo account (allowlisted) gets Razorpay. Flip back to QR: add `BILLING_PROVIDER_OVERRIDE=manual_upi` to `.env.local` (Next dev reloads env files; restart the existing dev server if the log does not show "Reload env"). Flip to Razorpay again: remove the line or set `razorpay`. Production stays `manual_upi` because it has no Razorpay config (rule 1), its `BILLING_ENV=prod` makes the override ignored, and the DB flag is never written. Rationale: the only switch that cannot leak into production on a shared DB is one that lives in the deployment's own env.

D-B. "When payment_provider='razorpay'" (§7.2) is interpreted as "when `resolvePaymentProvider` answers `razorpay` for THIS account on THIS deployment", the same answer the UI and Razorpay routes already use. Retiring on the raw DB flag would leave dev's demo account able to POST manual payments while its UI shows Razorpay, and would 410 nobody on dev. The DB flag still drives it after the Phase 7 cutover via rule 5.

D-C. Pending manual payment refusal: checkout GET (preview) and POST answer 409 `{code:'manual_payment_pending'}` when `getPendingPaymentRequest(accountId)` returns a row, checked after the provider check and before any claim or Razorpay call. Message: "A manual UPI payment for this workspace is still being reviewed. You can set up AutoPay once it has been approved or rejected."

D-D. Opt-in prompts are a pure, client-safe function `autopayOptIn` (new `src/lib/billing/razorpay/opt-in.ts`) used by both the Billing AutoPay card (none state) and `/upgrade-plan`'s coverage notice, so both render identical words. Strings are hard-coded like the rest of the Phase 4 AutoPay card copy (not new `subscription_settings` columns), to avoid a settings migration for copy; noted as a deviation from §8's "admin-editable" line.

D-E. Manual payments tab: the server reports `manualIntake: 'open' | 'partial' | 'retired'` (pure `resolveManualIntake` in provider.ts) on the super-admin payment-requests GET. Approve/Reject stays available only for `status='pending'` rows (already true in the drawer and enforced in SQL by `approvePaymentRequest`'s `WHERE status='pending'` claim); new pending rows cannot appear for Razorpay accounts because POST is 410, so "pending" equals "pending at cutover". Production (`open`) keeps its working queue, so production behaviour is unchanged.

D-F. Refund and Cancellation page: one migration inserts slug `refund-and-cancellation-policy` with `is_published = false`. Not published by us. The payment page links to it only when it is published (server-checked), so no dead link exists before the user publishes.

D-G. No SQL functions are needed in Phase 6, so there is no `md5(prosrc)` to compare. The report states this explicitly. If the implementer finds a function is needed after all, it must follow the Phase 5 pattern (SECURITY DEFINER, `SET search_path = public`, REVOKE from PUBLIC/anon/authenticated, GRANT service_role) and get the md5(prosrc) check.

D-H. Historical-data acceptance is checked two ways because subscription_events can legitimately grow during the phase (Razorpay webhooks, admin sync on dev): (1) full table count + checksum; (2) checksum of only the rows that existed at baseline (`created_at <= baseline_ts`). (2) must be identical; if (1) differs, the report lists the added rows (id, type, created_at) to show they are additions, not rewrites.

## Plan

- [ ] 1. Baseline BEFORE any code or migration (read-only SQL via Supabase MCP `execute_sql`, project `dknolotutfiesuhbhmze`).
      Run exactly this and save the JSON result into `d:\Junkies Coder\whatsapp-crm-nextjs\.agents\tasks\razorpay-phase6\baseline.json` (with the timestamp):
      ```sql
      select now() as baseline_ts,
       (select count(*) from payment_requests) pr_count,
       (select md5(coalesce(string_agg(md5(row_to_json(p)::text), ',' order by p.id), '')) from payment_requests p) pr_md5,
       (select count(*) from payment_requests where status = 'pending') pr_pending,
       (select count(*) from subscription_events) se_count,
       (select md5(coalesce(string_agg(md5(row_to_json(e)::text), ',' order by e.id), '')) from subscription_events e) se_md5,
       (select max(created_at) from subscription_events) se_max_created,
       (select md5(row_to_json(a)::text) from accounts a where id = 'c1db92d7-7ae4-44ac-aae7-b62e152b0341') demo_md5,
       (select payment_provider from subscription_settings limit 1) provider,
       (select string_agg(slug || ':' || is_published, ', ' order by slug) from legal_pages) legal;
      ```
      Reference values seen at planning time (22-10-2026 10:41 UTC): pr_count 6, pr_md5 6553080635e375d5543525cb10367c6f, pr_pending 0, se_count 94, se_md5 299a80642dcbfc8a8bc369914dd6116f, demo_md5 c5fd666db77009366a38bd13be923fdd, provider manual_upi, 5 published legal pages, no refund page. Stop and report if demo_md5 differs from c5fd666db77009366a38bd13be923fdd or provider is not manual_upi.
      Files: `.agents/tasks/razorpay-phase6/baseline.json`
      Verify: file exists with all ten fields; demo_md5 matches.

- [ ] 2. Provider override in config and resolver, plus manual-intake resolver.
      - `src/lib/billing/razorpay/config.ts`: export `type ProviderOverride = 'manual_upi' | 'razorpay'`; add optional `providerOverride?: ProviderOverride | null` to `RazorpayConfig` (optional so existing literals in tests and `__fixtures__/factories.ts` still compile); in `readRazorpayConfig` read `BILLING_PROVIDER_OVERRIDE` only when `billingEnv === 'dev'`: empty -> null, `manual_upi`/`razorpay` -> value, anything else -> `throw new RazorpayConfigError('BILLING_PROVIDER_OVERRIDE must be "manual_upi" or "razorpay"')`. With `prod` always null. Update the header comment.
      - `src/lib/billing/razorpay/provider.ts`: implement rules 1-5 of D-A; update the header comment to describe the override. Add `export type ManualIntake = 'open' | 'partial' | 'retired'` and `resolveManualIntake({ settingsProvider, config })`: no config -> open; override manual_upi -> open; test mode -> partial; live + pilot -> partial; live -> (override ?? settings) === 'razorpay' ? retired : open.
      - `src/lib/billing/razorpay/__fixtures__/factories.ts`: `makeConfig` default `providerOverride: null`.
      - `.env.local.example`: document `# BILLING_PROVIDER_OVERRIDE=` (dev only, ignored when BILLING_ENV=prod, `manual_upi` restores the QR flow for every account on this deployment, never flip the DB flag on dev).
      - Tests (permanent): extend `src/lib/billing/razorpay/config.test.ts` (dev parses both values; prod ignores a set value; invalid value on dev refused with the variable name and no value echoed; unset -> null) and `src/lib/billing/razorpay/provider.test.ts` (override manual_upi beats the allowlist in test mode and the DB flag/pilot in live; override razorpay in test mode does not admit a non-allowlisted account; live dev override replaces the DB flag; config null ignores everything; `resolveManualIntake` for every branch).
      Files: config.ts, provider.ts, __fixtures__/factories.ts, config.test.ts, provider.test.ts, .env.local.example
      Verify: `npx vitest run src/lib/billing/razorpay` passes; `npx tsc --noEmit 2>&1 | Select-String "error TS"` empty.

- [ ] 3. Retire the manual POST and QR routes with 410 when the account's provider is Razorpay.
      - New `src/lib/billing/manual-retirement.ts` (server-only): `export const MANUAL_RETIRED_CODE = 'manual_payments_retired'`; `async function manualPaymentsRetiredResponse(accountId: string): Promise<NextResponse | null>` that loads `getSubscriptionSettings()` and `getRazorpayConfig()`, calls `resolvePaymentProvider`, and when `razorpay` returns `NextResponse.json({ error: 'Manual UPI payments have been replaced by AutoPay. Go to Upgrade plan to set up AutoPay.', code: 'manual_payments_retired' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })`, else null.
      - `src/app/api/billing/payment-requests/route.ts` POST: after `requireBillingOwner()` and before the rate limit/body parse, `const retired = await manualPaymentsRetiredResponse(ctx.accountId); if (retired) return retired;`. GET (history) unchanged. Add a header-comment line about Phase 6. Do not delete code (§7.2).
      - `src/app/api/billing/upi-qr/route.ts` GET: same check right after `requireBillingOwner()`.
      - New permanent test `src/app/api/billing/manual-retirement.test.ts` (pattern: `src/app/api/billing/razorpay/routes.test.ts` mocks of `next/server` `after`, `@/lib/subscription/guard`, `@/lib/subscription/queries`, `vi.stubEnv` for Razorpay env): (a) allowlisted demo account in test mode -> POST payment-requests 410 with `code` `manual_payments_retired` and no `payment_requests` insert (assert `supabaseAdmin().from` not called with 'payment_requests' insert), upi-qr 410 and `resolveQuote` not called; (b) same account with `BILLING_PROVIDER_OVERRIDE=manual_upi` -> not 410 (reaches validation / QR path); (c) no Razorpay env (production) -> not 410; (d) non-allowlisted account -> not 410; (e) GET payment-requests history still 200 for a Razorpay account; (f) member still gets the owner-only 403 before any provider lookup.
      Files: src/lib/billing/manual-retirement.ts, src/app/api/billing/payment-requests/route.ts, src/app/api/billing/upi-qr/route.ts, src/app/api/billing/manual-retirement.test.ts
      Verify: `npx vitest run src/app/api/billing` passes.

- [ ] 4. Checkout refuses an account with a pending manual UPI payment (Phase 2 open item).
      - `src/app/api/billing/razorpay/checkout/route.ts`: add `async function assertNoPendingManualPayment(accountId)` using `getPendingPaymentRequest` from `@/lib/subscription/queries`; throw `new BillingServiceError('manual_payment_pending', <D-C message>, 409)`. Call it in GET (after `assertRazorpayProvider`) and POST (after `assertRazorpayProvider`, before reading the body / `resolveQuote` / `startCheckout`). Confirm `toRazorpayErrorResponse` maps `BillingServiceError` to `{ error, code }` with its status (read `src/lib/billing/razorpay/runtime.ts`).
      - `src/app/api/billing/razorpay/routes.test.ts`: extend the queries mock with `getPendingPaymentRequest: async () => h.pending` (`h.pending = null` in beforeEach); add tests: POST with a pending row -> 409 `manual_payment_pending`, `db.claimCheckout` and `client.createSubscription` not called; GET preview -> 409; no pending -> existing tests still pass.
      - `src/components/billing/razorpay-payment.tsx`: in the preview fetch (~line 256) and start fetch (~line 372), when `body.code === 'manual_payment_pending'` show the server message with a link to `/settings?tab=billing` (reuse the existing error display; read the component first).
      - `src/app/upgrade-plan/payment/page.tsx`: `reviewingManualPayment = Boolean(subscription?.pendingPayment) || (searchParams.get('status') === 'pending' && subscription?.paymentProvider !== 'razorpay')`, so a stale `?status=pending` URL cannot send a Razorpay account into the retired QR fetch. Update the header comment.
      - `src/components/billing/manual-upi-payment.tsx`: when the QR fetch returns `code === 'manual_payments_retired'`, show the server message and a primary link "Choose a plan" to `/upgrade-plan` instead of the generic error. `src/components/billing/payment-submission-form.tsx`: the existing `body.error` display already covers a 410; verify by reading, change nothing else.
      Files: checkout/route.ts, routes.test.ts, razorpay-payment.tsx, upgrade-plan/payment/page.tsx, manual-upi-payment.tsx
      Verify: `npx vitest run src/app/api/billing/razorpay` passes; tsc clean.

- [ ] 5. Opt-in AutoPay prompts (flow D, §8.1, §8.3).
      - New `src/lib/billing/razorpay/opt-in.ts` (pure, no server imports, client-safe):
        ```ts
        export type AutopayOptInKind = 'paid' | 'trial' | 'lapsed' | 'none';
        export interface AutopayOptIn { kind: AutopayOptInKind; renewsOn: string | null; headline: string; detail: string }
        export function autopayOptIn(input: {
          paymentProvider: 'manual_upi' | 'razorpay' | undefined;
          hasMandate: boolean;
          state: { isTrialing: boolean; isActive: boolean; isExpired: boolean; isBlocked: boolean; billingDisabled: boolean;
                   endsAt: string | null; pendingWindow: { type: string; endsAt: string } | null };
          now?: Date;
        }): AutopayOptIn
        ```
        Rules: provider not razorpay, `hasMandate`, or billingDisabled -> `none`. Coverage end = latest future of `endsAt` and `pendingWindow.endsAt` (same rule as `computeCoverageEnd` in checkout.ts), null when blocked/expired. Date label via `formatBillingDate` from `./format` (IST, same as the card). `paid` when coverage and (`isActive` or `pendingWindow.type === 'active'`): headline `You're paid until ${d}.`, detail `Set up AutoPay to renew automatically on ${d}. Nothing is charged before then.` `trial` when coverage otherwise: headline `Your free trial runs until ${d}.`, detail `Set up AutoPay now and your first charge is on ${d}. Nothing is charged before then.` `lapsed` when no coverage: headline `Your access has ended.`, detail `Set up AutoPay to pay now and renew automatically.`
      - `src/components/settings/autopay-card.tsx`: `AutopayCardView` gets optional prop `optIn?: AutopayOptIn | null`; in the `!a` branch render `optIn.headline` + `optIn.detail` when kind is paid/trial/lapsed, else the current "Not set up..." text; owner CTA stays "Set up AutoPay" to `/upgrade-plan`; members keep "Only the workspace owner can change billing." `AutopayCard` computes `optIn` from `data` (`paymentProvider`, `autopay?.hasMandate`, `data.state`).
      - `src/app/upgrade-plan/page.tsx`: in `CurrentCoverageNotice`, replace the Razorpay small print ("Set up AutoPay now and your first charge is on ...") with `optIn.headline` + `optIn.detail` from `autopayOptIn`; keep the manual UPI branch text byte-for-byte; keep `autopayFirstChargeDate` (used by the sticky bar) or reimplement it via `autopayOptIn(...).renewsOn`, whichever leaves the sticky-bar text unchanged.
      - Tests (permanent): new `src/lib/billing/razorpay/opt-in.test.ts` (manual provider -> none; mandate -> none; billing disabled -> none; active paid window -> paid with IST date; queued paid window during trial -> paid with the later end; trial only -> trial; expired/blocked -> lapsed; past dates ignored); extend `src/components/settings/autopay-card.test.tsx` (none state with paid opt-in shows "You're paid until" and the CTA for owner; trial variant; member sees the prompt text but no CTA).
      Files: opt-in.ts, opt-in.test.ts, autopay-card.tsx, autopay-card.test.tsx, upgrade-plan/page.tsx
      Verify: `npx vitest run src/lib/billing/razorpay src/components/settings` passes.

- [ ] 6. Read-only Manual payments tab (§9 item 9).
      - `src/app/api/super-admin/billing/payment-requests/route.ts` GET: add `manualIntake: resolveManualIntake({ settingsProvider: (await getSubscriptionSettings()).payment_provider, config: getRazorpayConfig() })` to the JSON. PATCH unchanged (approve/reject already only succeed on `pending` via the conditional claim); add a comment explaining why that equals "pending at cutover".
      - `src/app/(super-admin)/super-admin/payments/page.tsx`: store `manualIntake` from the existing pending-count fetch (~line 149) and the manual tab's own fetch (~line 646 area; read the file). Tab label: "Manual payments" when `open`, "Manual payments (history)" otherwise. Above the manual table render a notice: `partial`: "Accounts on Razorpay AutoPay on this server can no longer pay by manual UPI. Other accounts still can." `retired`: "Manual UPI payments are retired. This list is history. Approve and Reject stay available only for requests that were still pending at cutover." `open`: no notice. Update the header comment lines 15-25 (they say "until Phase 6").
      - `src/components/super-admin/billing/payment-request-drawer.tsx`: for non-pending rows show a short "Read-only. This request has already been reviewed." note where the action buttons would be; pending rows keep Approve/Reject exactly as now. No other behaviour changes.
      - Tests: `resolveManualIntake` is covered in item 2; no new route test (the GET change is one field).
      Files: super-admin payment-requests route.ts, payments/page.tsx, payment-request-drawer.tsx
      Verify: tsc clean; `npx vitest run src/components/super-admin src/app/api/super-admin` passes.

- [ ] 7. Unpublished Refund and Cancellation Policy draft (F11, §12.1 item 3) and the payment-page link.
      - New migration `supabase/migrations/20261025000000_razorpay_billing_phase6.sql`: header comment (Phase 6, additive, idempotent, draft only, the user publishes from Super-admin -> CMS -> Legal); `INSERT INTO legal_pages (slug, title, content_markdown, is_published) VALUES ('refund-and-cancellation-policy', 'Refund and Cancellation Policy', '<markdown>', false) ON CONFLICT (slug) DO NOTHING;`. Markdown (single quotes doubled) starts with a blockquote "Draft for review. Check every section, then remove this note and publish." and covers: who we are (Replai, operated by Junkies Coder); plans and AutoPay (charged every 30 or 360 days via Razorpay until cancelled; cards ₹5 verification refunded automatically; UPI AutoPay); deferred first charge for trial and paid customers (no charge until the current access ends); how to cancel (Settings -> Billing -> Cancel AutoPay, or the UPI app; owner only); when access ends (end of the period already paid for; cancelling before the first charge ends AutoPay immediately and the trial continues) per D3; refunds (no pro-rated refunds for partial periods; refunds we agree to are made through Razorpay to the original method; a full refund or a lost dispute removes the time that payment bought and cancels AutoPay; a partial refund does not change access) per D4; failed payments (Razorpay retries, up to 3 days of access while retrying, then the subscription stops); earlier manual UPI payments (unchanged, still shown in Billing); contact: `legal@junkiescoder.com` (the address already used in Terms of Service) with a "[confirm contact]" marker in the draft note. No GST statements (D10 open). No "Last updated" date invented: write "Last updated: on publication".
      - Apply with Supabase MCP `apply_migration` (name `razorpay_billing_phase6`, body = file contents). Verify with `select slug, is_published, length(content_markdown) from legal_pages order by slug;` -> 6 rows, the new one `false`; re-applying is a no-op (ON CONFLICT). md5(prosrc): not applicable (no functions, D-G); record that in the report.
      - New `src/lib/cms/legal-slugs.ts`: `export const REFUND_POLICY_SLUG = 'refund-and-cancellation-policy'`.
      - `src/app/api/billing/subscription/route.ts`: add to the `Promise.all` a best-effort `supabaseAdmin().from('legal_pages').select('slug').eq('slug', REFUND_POLICY_SLUG).eq('is_published', true).maybeSingle()` (error -> null); return `copy.refundPolicyHref: '/legal/refund-and-cancellation-policy' | null`. `src/hooks/use-subscription.ts`: add `refundPolicyHref?: string | null` to the copy type.
      - `src/components/billing/razorpay-payment.tsx`: under the consent checkbox, when `subscription.copy.refundPolicyHref` is set, render `<Link href=... className="underline">Refund and Cancellation Policy</Link>` (opens same tab; accessible text). Nothing renders while the page is a draft.
      Files: supabase/migrations/20261025000000_razorpay_billing_phase6.sql, src/lib/cms/legal-slugs.ts, subscription/route.ts, use-subscription.ts, razorpay-payment.tsx
      Verify: MCP select above; `/legal/refund-and-cancellation-policy` still 404s publicly (draft) because `getLegalPage` filters `is_published = true` (read `src/lib/cms/queries.ts`); tsc clean.

- [ ] 8. Live SQL check on the demo account (rolled back).
      Via MCP `execute_sql`, one `DO $$ ... $$` block that: (a) asserts `subscription_settings.payment_provider = 'manual_upi'`; (b) asserts the `refund-and-cancellation-policy` row exists with `is_published = false`; (c) re-runs the migration's INSERT inside the block and asserts the row count of `legal_pages` did not change (idempotency); (d) inserts one `payment_requests` row with `status='pending'` for the demo account `c1db92d7-7ae4-44ac-aae7-b62e152b0341` only, asserts the pending lookup the checkout refusal uses (`select ... where account_id = demo and status = 'pending'`) finds it. Each failed assertion raises a distinct exception; success ends with `RAISE EXCEPTION 'phase6 check ok, rolled back'`. No other account is touched. Then re-run the baseline query from item 1.
      Files: none
      Verify: the exception text is the expected one; demo_md5 still c5fd666db77009366a38bd13be923fdd; pr_count/pr_md5 and pre-baseline se checksum unchanged (item 11).

- [ ] 9. `docs/billing-runbook.md` (new). Operator runbook, plain prose, sections:
      1. Webhook disabled by Razorpay (24 h of failures; alert to junkiescoder@gmail.com): check the app/tunnel (`/api/health`, `.next/dev/logs/next-development.log` on dev, `docker compose ps` on prod), fix, re-enable in Dashboard -> Webhooks, replay unacknowledged events (up to 7 days), then "Run reconciliation now" in Super-admin -> Payments -> Webhooks & reconciliation; reconciliation step (d) covers anything older.
      2. Replay and retry: Dashboard replay vs the app's Retry on failed/dead events (`POST /api/super-admin/billing/razorpay/webhook-events/[id]/retry`, audited); duplicates are no-ops (`billing_webhook_events` unique key).
      3. Secret rotation: webhook (`RAZORPAY_WEBHOOK_SECRET_PREVIOUS` = old, new in `RAZORPAY_WEBHOOK_SECRET`, deploy, change in Dashboard, remove previous after 48 h); API key (generate, update `/opt/wacrm/.env`, deploy, revoke old). Note `/opt/wacrm/.env` is not touched by CI.
      4. Refunds: made in the Razorpay Dashboard (D4); the app records them from `refund.processed`; full refund removes the window and cancels AutoPay, partial changes nothing; how to confirm in Super-admin -> Refunds & disputes.
      5. Disputes: respond in the Dashboard before the deadline (tab highlights due dates); lost dispute = full-refund effect.
      6. Reconciliation: what the cron does (§3.8 a-e), how to run it on demand, how to read `billing_reconciliation_runs`, `cron.log` `billing http=200`.
      7. cron-ping deploy: `deploy/cron-ping.sh` must be re-copied to `/opt/wacrm/cron-ping.sh` after changes (AGENTS.md §2), strip CRLF (`tr -d '\r'`), check `tail -n 20 /opt/wacrm/cron.log`.
      8. Provider switch and rollback: dev override `BILLING_PROVIDER_OVERRIDE` (D-A), never flip the DB flag on dev; Phase 7 cutover sets `payment_provider='razorpay'` in super-admin billing config, rollback sets it back to `manual_upi` (QR returns at once; existing AutoPays keep charging and webhooks keep granting access); before cutover re-check `select count(*) from payment_requests where status='pending'`.
      Files: docs/billing-runbook.md
      Verify: `npx prettier --write docs/billing-runbook.md`; every command/route named exists (cross-check with `src/app/api` paths).

- [ ] 10. Full verification bar (AGENTS.md §2 and the brief).
      ```powershell
      npx tsc --noEmit 2>&1 | Select-String "error TS"          # must be empty
      npx vitest run                                              # all green; was 204 files / 2,576 tests; record new totals
      npx eslint <every touched src path>                         # 0 errors (pre-existing warnings named)
      npx prettier --write <every touched src/doc path>           # then `git status` and `git checkout --` any file prettier changed that this phase did not touch
      $env:NEXT_DIST_DIR=".next-verify3"; npm run build           # route table compiles
      git checkout -- tsconfig.json; Remove-Item -Recurse -Force .next-verify3
      ```
      Files: none
      Verify: all commands pass; outputs recorded for the report.

- [ ] 11. After-state checksums. Re-run the item-1 query, plus the pre-baseline-only check:
      ```sql
      select count(*) se_pre_count,
        md5(coalesce(string_agg(md5(row_to_json(e)::text), ',' order by e.id), '')) se_pre_md5
      from subscription_events e where e.created_at <= '<baseline se_max_created>';
      ```
      (Run the same pre-baseline query at baseline time too, in item 1, if not already captured; it must equal se_count/se_md5 at baseline.) pr_count/pr_md5 must be identical, demo_md5 c5fd666db77009366a38bd13be923fdd, provider manual_upi, legal shows the new slug `false`. If se_count grew, list the new rows `select id, event_type, source, created_at from subscription_events where created_at > '<se_max_created>'` in the report as additions.
      Files: `.agents/tasks/razorpay-phase6/after.json`
      Verify: values match as stated; any mismatch is reported, not hidden.

- [ ] 12. Reports and cleanup.
      - New `docs/razopay/phase-6-implementation-report.md` following the Phase 5 report's structure: summary; provider-switch mechanism (D-A, how to flip on dev and back, why production stays manual_upi); DB changes (migration, row inserted unpublished, md5(prosrc) N/A); routes (410 contract, checkout 409, super-admin `manualIntake`); UI (payment page, opt-in prompts, Billing card, Manual tab, refund link); historical-data table before/after (item 1 vs item 11); verification table; Phase 6 acceptance table ("Flipping the provider on dev switches the whole purchase UI and flipping back restores QR": pass by tests + user browser check; "Historical rows identical": pass with numbers); deviations (D-B interpretation, D-D hard-coded copy, D-E label varies by intake, legal page drafted not live, refund link hidden until published); open items (browser check of the flip, legal review, Phase 7 cutover re-check of pending manual rows, carried-over Phase 5 items: card mandates `card_mandate_process`); user actions (1. on devcrm add `BILLING_PROVIDER_OVERRIDE=manual_upi` to `.env.local`, open `/upgrade-plan/payment` as demo owner, confirm QR, remove the line, confirm Razorpay; 2. review and publish the Refund and Cancellation Policy in Super-admin -> CMS -> Legal, then check footer and payment-page link; 3. read `docs/billing-runbook.md`).
      - `docs/razopay/README.md`: add Phase 6 row to the documents table, add `docs/billing-runbook.md`, set the status table date and Phase 6 state ("Done in code and database; legal page drafted unpublished; browser flip check pending"), keep "7" as not started.
      - `npx prettier --write docs/razopay/phase-6-implementation-report.md docs/razopay/README.md docs/billing-runbook.md`.
      - Delete any `scratch/phase6-*` files; confirm `scratch/` has no files from this phase. Confirm `.next-verify3` is gone and `tsconfig.json` is unmodified.
      Files: docs/razopay/phase-6-implementation-report.md, docs/razopay/README.md
      Verify: `git status --short` shows only the intended files.

## Ambiguities and decisions taken

- "Flipping the provider on dev" on a shared DB: env override `BILLING_PROVIDER_OVERRIDE` (D-A), never the DB flag.
- "When payment_provider='razorpay'": per-account resolved provider (D-B).
- "Refund and Cancellation legal page live" (§15) conflicts with the brief's "do not publish legal text": drafted unpublished, publishing is a user action; acceptance reports it as pending the user.
- "Read-only manual tab" while production still takes manual UPI: read-only for every non-pending row, Approve/Reject for pending rows only, label/notice driven by `manualIntake` so production's queue keeps working (D-E).
- Opt-in copy hard-coded rather than admin-editable columns (D-D).
- Demo billing clean-up mentioned in the Phase 5 approval: at planning time `billing_webhook_events` is 0 rows, so the test events appear already cleaned; Phase 6 does not delete anything (a delete would also break the subscription_events checksum acceptance). If clean-up is still wanted, it is listed as a separate user action.
- Final message of the workflow: short summary, then exactly "Do you want me to log this change? (yes/no)"; nothing is logged.
