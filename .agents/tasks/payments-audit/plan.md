# Payments & Subscriptions page: audit and implementation plan

Repo `d:/Junkies Coder/whatsapp-crm-nextjs`, HEAD 5f30195, Next.js 16.2.6.
Scope: `/super-admin/payments` (src/app/(super-admin)/super-admin/payments/page.tsx),
`src/components/super-admin/billing/*`, `src/app/api/super-admin/billing/*`.

Hard constraints (repeat for every item): shared production DB, read-only
SQL only, no migrations, no writes, never touch account
`b69f6811-ab01-4b6d-b89e-68b65bdcba5d`, no Razorpay cancels, no commits, no
Scrum.txt / Sheets logging, no new npm deps, plain prose copy (no `!`, no
em dash). Route handlers follow the existing pattern (`requireSuperAdmin`,
`export const dynamic = 'force-dynamic'`, GET only; Route Handlers are not
cached by default per node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
Do not run `next build` while a dev server is live (AGENTS.md §1).

Live data snapshot used by this plan (read-only SQL, 106 events, none in
super-admin-owned workspaces): billing_payments = 3 test rows (2
authorisation refunded ₹5 each, 1 captured charge ₹9,000); payment_requests
= 2 approved (₹45,150 total), 4 rejected, 0 pending; billing_refunds = 2
processed test (`none_not_a_charge`); billing_subscriptions = 3 test
(active, authenticated, cancelled), all INR. `subscription_events.amount` is
NUMERIC major units; on autopay_* rows it is the PLAN PRICE (9000.00), not
money collected.

---

## 1. Audit findings

| # | File:line | What is wrong | Planned fix (item) |
|---|---|---|---|
| F1 | src/app/api/super-admin/billing/events/route.ts:38, :132 | Binary `source: 'payment' \| 'manual'`; every Razorpay event (autopay_*, payment_succeeded/failed, refund_processed, dispute_*, billing_anomaly, billing_admin_action) becomes "manual". Ignores `subscription_events.source`, `billing_subscription_id`, `billing_payment_id`, actor role. | Replace with `channel` from shared helper (P2, P4) |
| F2 | src/components/super-admin/billing/activity-panel.tsx:217-230 | Event-type filter lists 9 legacy types only; the 16 Razorpay types cannot be filtered. | Grouped type filter covering all 25 types (P6) |
| F3 | activity-panel.tsx:232-236, :320-336 | Source filter "Payments & manual / From payments / Manual only" and tiles "From payments 14 / Manual 92" are wrong (true split: Razorpay 7, Manual UPI 14, Admin 84, Customer 1, System 0). Tile hint "Granted by an admin" is false for Razorpay rows. | Channel filter + per-channel tiles (P4, P6) |
| F4 | activity-panel.tsx:570; src/lib/currency.ts:14 | `formatCurrency(e.amount)` defaults to USD: INR amounts render "$9,000". | Currency-aware formatting, default INR (P1, P6) |
| F5 | src/components/super-admin/billing/billing-labels.ts:350-360 | `payment -> 'Paid'`, `manual -> 'Manual'`; "Manual" used for both a verified manual UPI payment and an admin grant with no money. | Remove both keys; add CHANNEL_META (P3) |
| F6 | activity-panel.tsx:470 + drawer :496 | Raw notes shown verbatim ("Razorpay sub_X: created -> authenticated", "Razorpay sub_X created (defer_to_trial_end)", "Razorpay pay_X", "Synced from Razorpay: active -> active, 0 payment(s) applied", "UTR 6149…"). | `describeBillingEvent` rewrites into sentences + one reference chip (P5) |
| F7 | activity-panel.tsx:566-575 | Amount column shows the plan price on non-money events (checkout started, authorised, cancelled, admin grant), so ₹9,000 reads as collected revenue; payment_submitted/rejected amounts read as paid. | `amountKind` with a caption ("Paid via AutoPay", "Plan price, no payment", "Claimed, under review", "Not accepted") (P2, P6) |
| F8 | activity-panel.tsx:399, :576-593 | "Done by" shows a name with an icon only for admins; a customer's name and an admin's name look the same; Razorpay webhook rows read "System". | `initiatedBy` {kind,label} with "Customer", "Super admin", "Razorpay", "Scheduled job", "System" (P2, P6) |
| F9 | activity-panel.tsx:258 | Default `pageSize` 25 is not in PAGE_SIZE_OPTIONS (10/20/50/100, razorpay-shared.tsx) so the "Rows per page" select renders blank. | Default 20 (P6) |
| F10 | events/route.ts:112 | `.limit(1000)` over-fetch then in-memory filters: counts and pagination silently cap at 1,000 rows (AGENTS.md §4 warns about this pattern). | Chunked `fetchAllRows` with explicit cap + `truncated` flag (P1, P4) |
| F11 | events/route.ts:106 | `accountId` is not validated; a non-UUID makes PostgREST 500. | Validate UUID, 400 on bad input (P4) |
| F12 | events route + activity panel | No test/live distinction on events; a test-mode ₹9,000 AutoPay charge looks like revenue. | `mode` from billing_subscriptions/billing_payments, Mode filter, Test pill (P2, P4, P6) |
| F13 | events route | No date filter. | `since` = 7d / 30d / 90d / all (P4, P6) |
| F14 | src/components/super-admin/billing/subscribers-panel.tsx:504, :551 | Manage dialog Recent history colours by the binary `source` (green/blue dot); Razorpay events show as blue "manual". Raw notes again. | Channel badge + description (P9) |
| F15 | subscribers-panel.tsx:290 / src/app/api/super-admin/billing/subscriptions/route.ts:94 | Workspaces list cannot say HOW a workspace has access (AutoPay, manual UPI, admin grant, trial). | `accessVia` derived server-side (P8, P9) |
| F16 | subscribers-panel.tsx:611 + subscriptions/route.ts:94,133 | Route selects `method_summary` but drops it; AutoPay cell shows "UPI" instead of "UPI te****@razorpay". | Carry `methodSummary` in SubscriberAutopay (P8) |
| F17 | src/components/super-admin/billing/razorpay-subscription-drawer.tsx:481 | Event from/to statuses are ACCOUNT statuses (trialing/active/expired) but labelled with the `subscription` domain, and shown even when unchanged ("Active to Active") or half empty ("— to Active"). | `accountStatusLabel`, only when changed (P10) |
| F18 | drawer:492 | `eventSourceLabel(source)` prints "Checkout" / "Razorpay webhook" jargon; no actor reads "System" for Razorpay rows. | Shared initiator wording (P3, P10) |
| F19 | drawer:496 | Raw note. | `describeBillingEvent` (P10) |
| F20 | src/components/super-admin/billing/razorpay-webhooks-panel.tsx:278 | Raw Razorpay event name (`subscription.authenticated`) as the row title. | `webhookEventLabel` title + raw name as mono secondary (P3, P10) |
| F21 | payments page + Payments section | No single answer to "which payment was made how": Razorpay payments live in Transactions, manual UPI in the Manual UPI queue, nothing merges them. | New "All payments" ledger, default view of Payments (P7, P11) |
| F22 | src/components/super-admin/billing/payments-nav.ts:86, :108 | Payments section has no ledger view; default is Transactions. | Add `ledger` view, default; legacy `transactions` keeps mapping (P11) |
| F23 | src/components/super-admin/billing/razorpay-overview-panel.tsx (whole) | Overview has no money figures at all: nothing shows collected AutoPay vs manual UPI vs refunds, per mode. | "Collected" card from new route (P12, P13) |
| F24 | razorpay-overview-panel.tsx:49 | STATUS_TILES omits `created` (Awaiting authorisation), `paused`, `expired`, `superseded`, `initiating`, `failed_to_create`; tile totals can disagree with the AutoPay list count. | Render any non-zero status not in the fixed set as an extra tile (P13) |
| F25 | razorpay-overview-panel.tsx:301 | "View transactions" for failed payments opens an unfiltered list. | Open All payments with status=failed preset (P11, P13) |
| F26 | manual-payments-panel.tsx:375-385, payment-request-drawer.tsx:219-251; src/lib/currency.ts:68 | `formatCurrency` uses the browser locale (`Intl.NumberFormat(undefined)`), so the same ₹45,150 can render with Western or Indian grouping and differs from `formatMinor` (en-IN) on the next tab. | Shared `formatMoneyMajor` en-IN (P1, P14) |
| F27 | src/components/super-admin/billing/payments-guide-content.ts:507 | Guide says Activity shows "whether it was Paid or Manual" and "filter by source": now false. No guide text for channels, All payments, Collected. | Guide update (P15) |
| F28 | payments page header comment (page.tsx:1-27), payments-nav.ts:1-17 | Section/view list in comments omits the new view. | Update comments (P11) |
| F29 | Activity panel rows | Workspace column hides owner when name truncated; no link from an AutoPay event to its drawer or from a UTR to its manual request. | Reference chip with "Open AutoPay" / "Open request" (P6) |
| F30 | events route search | Search does not match reference ids beyond note text, and channel/initiator labels are not searchable. | Search over account, owner email, initiator label, plan, note, reference id (P4) |

No change needed in docs/billing-runbook.md (it never mentions the Paid/Manual source labels; checked lines 23, 30, 73). P16 only adds one sentence pointing to All payments for refund look-ups.

---

## 2. Channel rules

Pure helper `src/lib/billing/event-channel.ts`, exported
`classifyBillingEvent(input): EventClassification`.

Input (one subscription_events row plus lookups):
`eventType, source (nullable), paymentRequestId, billingSubscriptionId,
billingPaymentId, actorUserId, actorIsSuperAdmin, actorName, actorEmail,
ownerEmail, subMode, payMode`.

Output:
```ts
type BillingChannel = 'razorpay' | 'manual_upi' | 'admin' | 'customer' | 'system';
type InitiatorKind = 'customer' | 'admin' | 'razorpay' | 'scheduled' | 'system';
type MoneyInvolved = 'autopay' | 'manual_upi' | 'refund' | 'none';
type AmountKind =
  | 'paid' | 'refund' | 'claimed' | 'rejected' | 'failed'
  | 'covered_by_payment' | 'plan_price' | null;
interface EventClassification {
  channel: BillingChannel;
  /** Which payment system the row concerns even when an admin/customer acted. */
  context: 'autopay' | 'manual_upi' | null;
  initiatedBy: { kind: InitiatorKind; label: string; detail: string | null };
  moneyInvolved: MoneyInvolved;
  amountKind: AmountKind;
  mode: 'test' | 'live' | null;   // payMode ?? subMode ?? null
}
```

Constant sets: `RAZORPAY_EVENT_TYPES` = autopay_checkout_created,
autopay_authenticated, autopay_activated, payment_succeeded, payment_failed,
autopay_pending, autopay_halted, autopay_paused, autopay_resumed,
autopay_cancelled, autopay_completed, refund_processed, dispute_opened,
dispute_closed, billing_anomaly. `MANUAL_UPI_EVENT_TYPES` =
payment_submitted, payment_approved, payment_rejected.
`RAZORPAY_SOURCES` = razorpay_webhook, checkout, reconciliation.

Channel precedence (first match wins):

| # | Condition | channel | context |
|---|---|---|---|
| 1 | `source = 'admin'` OR `eventType = 'billing_admin_action'` | admin | autopay if a billing id is set, manual_upi if payment_request_id set, else null |
| 2 | `source = 'customer'` | customer | autopay if a billing id is set, else null |
| 3 | billing_subscription_id OR billing_payment_id set, OR source in RAZORPAY_SOURCES, OR eventType in RAZORPAY_EVENT_TYPES | razorpay | autopay |
| 4 | payment_request_id set OR eventType in MANUAL_UPI_EVENT_TYPES | manual_upi | manual_upi |
| 5 | actor set AND actorIsSuperAdmin | admin | null |
| 6 | actor set AND not super admin (workspace member acted) | customer | null |
| 7 | otherwise (`source = 'system'` or legacy NULL with no actor) | system | null |

Rationale: rules 1-2 come first because the task defines "Admin action"
(billing_admin_action, admin-driven sync/cancel) and "Customer action"
(customer cancelled AutoPay) by who acted; `context` still records that the
row concerns AutoPay so the UI can show an AutoPay reference chip.

Initiated by:

| Condition | kind | label | detail |
|---|---|---|---|
| actor is super admin | admin | actor full_name, else email, else "Super admin" | "Super admin" |
| actor set, not super admin | customer | actor full_name, else email | "Customer" |
| no actor, source = razorpay_webhook | razorpay | "Razorpay" | "Webhook" |
| no actor, source = reconciliation | scheduled | "Reconciliation" | "Scheduled job" |
| no actor, source in (checkout, customer) | customer | ownerEmail ?? "Customer" | "Customer" |
| no actor, eventType = subscription_expired, source null | scheduled | "Scheduled job" | null |
| no actor otherwise | system | "System" | null |

Money involved / amount kind (amount column shows the money only when
amountKind is paid or refund; other kinds render muted with a caption):

| eventType (and condition) | moneyInvolved | amountKind | caption |
|---|---|---|---|
| payment_succeeded | autopay | paid | Paid via AutoPay |
| payment_failed | none | failed | Not collected |
| refund_processed | refund | refund | Refunded |
| payment_approved | manual_upi | paid | Paid via manual UPI |
| payment_submitted | none | claimed | Claimed, under review |
| payment_rejected | none | rejected | Not accepted |
| subscription_activated / subscription_extended with payment_request_id | manual_upi | covered_by_payment | Covered by manual UPI payment |
| subscription_revoked / dispute_* with billing_payment_id | none | plan_price if amount set | (shown as related payment) |
| any other row with amount set | none | plan_price | Plan price, no payment |
| amount null | none | null | — |

Exact classification of every live row shape (106 rows):

| event_type | source | pr | sub | pay | actor | n | channel | initiatedBy | money / amountKind | mode |
|---|---|---|---|---|---|---|---|---|---|---|
| autopay_activated | razorpay_webhook | | ✓ | | | 1 | razorpay | Razorpay | none / plan_price | test |
| autopay_authenticated | checkout | | ✓ | | | 1 | razorpay | Customer (owner email) | none / plan_price | test |
| autopay_authenticated | razorpay_webhook | | ✓ | | | 1 | razorpay | Razorpay | none / plan_price | test |
| autopay_cancelled | customer | | ✓ | | | 1 | customer (context autopay) | Customer (owner email) | none / plan_price | test |
| autopay_checkout_created | checkout | | ✓ | | customer | 3 | razorpay | customer name | none / plan_price | test |
| billing_admin_action | admin | | ✓ | | admin | 5 | admin (context autopay) | admin name | none / null | test |
| payment_approved | NULL | ✓ | | | admin | 2 | manual_upi | admin name | manual_upi / paid | null |
| payment_rejected | NULL | ✓ | | | admin | 4 | manual_upi | admin name | none / rejected | null |
| payment_submitted | NULL | ✓ | | | customer | 6 | manual_upi | customer name | none / claimed | null |
| payment_succeeded | razorpay_webhook | | ✓ | ✓ | | 1 | razorpay | Razorpay | autopay / paid | test |
| subscription_activated | NULL | | | | admin | 13 | admin | admin name | none / plan_price or null | null |
| subscription_activated | NULL | ✓ | | | admin | 1 | manual_upi | admin name | manual_upi / covered_by_payment | null |
| subscription_expired | NULL | | | | admin | 29 | admin | admin name | none / null | null |
| subscription_extended | NULL | | | | admin | 8 | admin | admin name | none / plan_price or null | null |
| subscription_extended | NULL | ✓ | | | admin | 1 | manual_upi | admin name | manual_upi / covered_by_payment | null |
| trial_extended | NULL | | | | admin | 29 | admin | admin name | none / null | null |

Expected tiles on the live data: All 106, Razorpay AutoPay 7, Manual UPI 14,
Admin actions 84, Customer actions 1, System 0.

Plus synthetic cases the tests must cover: refund_processed (razorpay,
refund), dispute_opened (razorpay), billing_anomaly with only
billing_subscription_id, subscription_revoked with billing_payment_id and no
actor (razorpay, from a full refund), subscription_expired with no actor and
NULL source (system channel, "Scheduled job"), source = 'system' (system),
source = 'reconciliation' (razorpay, "Reconciliation"), trial_started with no
actor (system), actor whose profile is missing (`actorIsSuperAdmin` false,
actor set: customer, label "Unknown user").

Channel labels (billing-labels.ts `CHANNEL_META`):

| channel | label | tone | icon (lucide) | hint |
|---|---|---|---|---|
| razorpay | Razorpay AutoPay | blue | Repeat | Recorded by Razorpay checkout, webhooks or reconciliation |
| manual_upi | Manual UPI | green | QrCode | A customer paid by UPI QR and an admin reviewed it |
| admin | Admin action | violet | UserCog | Done by a super admin, no money moved unless shown |
| customer | Customer action | cyan (new tone) | User | Done by the customer |
| system | System | slate | Cog | Automatic, nobody acted |

---

## 3. Implementation items

Each item ends buildable. "Verify" always includes
`npx tsc --noEmit 2>&1 | Select-String "error TS"` (expect no output) and
the named vitest files; P17 runs the full bar.

- [ ] P1. Money formatting and chunked reader (pure helpers).
      Create `src/lib/billing/money-format.ts`: `PLATFORM_BILLING_CURRENCY = 'INR'`;
      `formatMoneyMinor(minor, currency?)` (move the body of `formatMinor` from
      razorpay-shared.tsx, en-IN, paise only when non-zero, "—" for null);
      `formatMoneyMajor(amount, currency?)` (major units, en-IN, 0 or 2 fraction
      digits, invalid code falls back to `"XYZ 1,234"`, null -> "—").
      Make `formatMinor` in `razorpay-shared.tsx` a re-export/wrapper of
      `formatMoneyMinor` (keeps every caller).
      Create `src/lib/billing/fetch-all.ts`: `fetchAllRows<T>(page: (from, to) => PromiseLike<{data, error}>, { chunk = 1000, cap = 10000 })`
      returning `{ rows, truncated }`; throws on error; stops on a short page.
      Tests: `src/lib/billing/money-format.test.ts` (9000 major -> "₹9,000";
      4515000 major -> "₹45,15,000" (Indian grouping); 99950 minor -> "₹999.50";
      null; bad code; USD row stays "$"), `src/lib/billing/fetch-all.test.ts`
      (0 rows, exactly one chunk, chunk+1, cap reached sets truncated, error throws).
      Files: src/lib/billing/money-format.ts, src/lib/billing/fetch-all.ts, both tests, src/components/super-admin/billing/razorpay-shared.tsx
      Verify: `npx vitest run src/lib/billing/money-format.test.ts src/lib/billing/fetch-all.test.ts src/lib/billing/razorpay/format.test.ts` pass; tsc clean.

- [ ] P2. Channel classifier.
      Create `src/lib/billing/event-channel.ts` exactly per section 2 (types,
      constant sets, `classifyBillingEvent`, `BILLING_CHANNELS` ordered list,
      `isBillingChannel(value)`), plus `ALL_EVENT_TYPES` listing the 25
      `SubscriptionEventType` values typed as `readonly SubscriptionEventType[]`
      and `EVENT_TYPES_BY_CHANNEL` grouping for the filter (AutoPay: the 15
      Razorpay types; Manual UPI: payment_submitted/approved/rejected; Access
      changes: trial_started, trial_extended, subscription_activated,
      subscription_extended, subscription_revoked, subscription_expired; Admin:
      billing_admin_action). No UI strings except initiator labels.
      Test `src/lib/billing/event-channel.test.ts`: one `it.each` row per live
      shape in the section 2 table (asserting channel, context, initiatedBy.kind
      and label, moneyInvolved, amountKind, mode), every synthetic case, and
      "ALL_EVENT_TYPES has 25 unique values and EVENT_TYPES_BY_CHANNEL covers each exactly once".
      Files: src/lib/billing/event-channel.ts, src/lib/billing/event-channel.test.ts
      Verify: `npx vitest run src/lib/billing/event-channel.test.ts` passes.

- [ ] P3. Labels.
      In `billing-labels.ts`: add tone `'cyan'` to `Tone` and
      `TONE_BADGE_CLASS` (`border-cyan-200 bg-cyan-50 text-cyan-700`); add
      `CHANNEL_META: Record<BillingChannel, LabelMeta>` (section 2 table) and
      `channelLabel()`; add `AMOUNT_KIND_CAPTION` + `amountCaption(kind)`;
      replace `EVENT_SOURCE_LABEL`/`eventSourceLabel` with `sourceInitiatorLabel(source)`
      (`razorpay_webhook` "Razorpay", `checkout` "Customer at checkout",
      `reconciliation` "Reconciliation", `customer` "Customer", `admin` "Super
      admin", `system` "System"; no `payment`/`manual` keys); add
      `webhookEventLabel('subscription.authenticated')` -> "Subscription authenticated"
      (split on `.` and `_`, sentence case) ; add status domain `'ledger'`
      (`paid` Paid green, `pending` Pending amber hint "Awaiting capture or review",
      `failed` Failed red, `rejected` Rejected red, `refunded` Refunded slate,
      `partially_refunded` Partly refunded amber) and `'access'` domain for
      access-via (P8): `razorpay_autopay` "Razorpay AutoPay" blue, `manual_upi`
      "Manual UPI payment" green, `admin_grant` "Admin grant" violet, `trial`
      "Trial" blue, `none` "Ungated" slate, `unknown` "Not recorded" slate.
      Create `src/components/super-admin/billing/channel-badge.tsx`
      (`ChannelBadge({ channel, size? })`: icon + label, `title` = hint,
      `aria-label` "Channel: <label>").
      Create `src/lib/billing/ledger-status.ts` exporting
      `LEDGER_STATUSES = ['paid','pending','failed','rejected','refunded','partially_refunded'] as const`
      and `type LedgerStatus` (P7 reuses it).
      Update `billing-labels.test.ts`: replace the `eventSourceLabel` test with
      `sourceInitiatorLabel`; add tone `cyan` to the tone list; add a SPECS row
      `['ledger', LEDGER_STATUSES]` and an `access` row; channel meta covers
      every `BILLING_CHANNELS` value; webhookEventLabel cases.
      Fix callers of `eventSourceLabel`: activity-panel.tsx:461 renders no
      source badge until P6 replaces the row; razorpay-subscription-drawer.tsx:492
      uses `sourceInitiatorLabel`.
      Files: billing-labels.ts, billing-labels.test.ts, channel-badge.tsx, src/lib/billing/ledger-status.ts, activity-panel.tsx, razorpay-subscription-drawer.tsx
      Verify: `npx vitest run src/components/super-admin/billing/billing-labels.test.ts`; tsc clean.

- [ ] P4. Events route rewrite (server-side filters, channel counts).
      Rewrite `src/app/api/super-admin/billing/events/route.ts`. Query params:
      `channel` (all|razorpay|manual_upi|admin|customer|system, else 400),
      `type` (all or one of ALL_EVENT_TYPES, else 400), `mode` (all|live|test),
      `since` (all|7d|30d|90d), `search`, `accountId` (UUID else 400),
      `page` (>=1), `pageSize` (5..100, default 20).
      SQL-side filters: account_id, event_type, `created_at >= now - since`.
      Load rows with `fetchAllRows` (select explicit columns: id, account_id,
      event_type, source, from_status, to_status, ends_at, previous_ends_at,
      plan_name, cycle_label, amount, payment_request_id, billing_subscription_id,
      billing_payment_id, actor_user_id, note, created_at, duration_months,
      duration_days, window_kind), order created_at desc. Batch lookups:
      accounts + profiles (as today), `billing_subscriptions(id, mode, currency,
      provider_subscription_id)` and `billing_payments(id, mode, currency,
      provider_payment_id)` by `.in('id', ids)` chunked 200, `payment_requests(id,
      currency, transaction_ref)`. Exclude super-admin-owned workspaces (keep).
      Classify each row with `classifyBillingEvent`; apply the mode filter:
      `live` keeps only mode='live', `test` only mode='test', `all` everything.
      Decision: non-Razorpay rows have no mode, so an explicit Live or Test
      filter excludes them, and the select is labelled "Razorpay mode" so this
      is visible. Apply search (account name,
      owner email, initiator label, plan, note, provider sub/pay id, UTR).
      Counts: `byChannel` over rows matching every filter EXCEPT channel;
      `total` = rows matching all filters including channel.
      Response:
      ```ts
      {
        events: BillingEventView[];
        counts: { total: number; byChannel: Record<BillingChannel, number> };
        page: number; pageSize: number; totalPages: number;
        truncated: boolean;
      }
      interface BillingEventView {
        id; accountId; accountName; ownerEmail;
        eventType; channel; context; initiatedBy; moneyInvolved; amountKind;
        amount: number | null;        // major units
        currency: string;             // payment/sub currency, payment_requests.currency, else 'INR'
        mode: 'test' | 'live' | null;
        fromStatus; toStatus; endsAt; previousEndsAt;
        durationMonths; durationDays; windowKind;
        planName; cycleLabel; note;
        paymentRequestId; billingSubscriptionId; billingPaymentId;
        providerSubscriptionId: string | null; providerPaymentId: string | null;
        utr: string | null;           // payment_requests.transaction_ref
        createdAt;
      }
      ```
      Put the in-memory filter/count/paginate step in an exported pure function
      `selectEventsPage(rows, { channel, mode, search, page, pageSize })` in
      `src/lib/billing/event-query.ts` so it is unit tested without the route. Move the `BillingEventView` type to
      `src/types/super-admin.ts`. Errors: 500 with the DB message as today;
      `requireSuperAdmin` NextResponse passthrough kept. No writes.
      Tests: `src/app/api/super-admin/billing/events/route.test.ts` using the
      fake-supabase pattern of `razorpay/routes.test.ts` (mock
      `@/lib/super-admin/guard` and `@/lib/auth/admin-client`; tables seeded
      with the 16 live shapes): 403 when not super admin; 400 bad channel/type/
      accountId; counts.byChannel equals {razorpay 7, manual_upi 14, admin 84,
      customer 1, system 0} on a seed scaled to the live counts (or a smaller
      seed with known counts); channel=razorpay returns only razorpay rows and
      total matches; mode=test excludes manual rows; search by `sub_` id and by
      UTR; pagination page 2 window; super-admin-owned workspace excluded;
      amounts carry INR currency; assert the `.eq('account_id', …)` COLUMN when
      accountId is passed (AGENTS.md §4 mocking rule).
      Files: events/route.ts, events/route.test.ts, src/lib/billing/event-query.ts (+ test), src/types/super-admin.ts
      Verify: `npx vitest run src/app/api/super-admin/billing/events src/lib/billing` pass; tsc clean.

- [ ] P5. Human-readable event descriptions (pure, client-safe).
      Create `src/components/super-admin/billing/event-description.ts`:
      `describeBillingEvent(e: Pick<BillingEventView, 'eventType'|'note'|'channel'|'providerSubscriptionId'|'providerPaymentId'|'utr'|...>): { text: string; reference: { kind: 'subscription'|'payment'|'utr'|'refund'|'dispute'; id: string } | null; note: string | null }`.
      Patterns (from migrations 20261021010000:273,424,709, 20261022000000:216,501,722,811,832, admin.ts:117,169, phase5:142, billing/payment-requests route `UTR ${ref}`):
      `Razorpay sub_X: a -> b` -> "AutoPay status changed from {statusMeta('subscription',a)} to {b}." ref sub;
      `Razorpay sub_X created (immediate|defer_to_trial_end|defer_to_paid_end)` -> "AutoPay checkout started. First charge {straight away|when the trial ends|when the current paid period ends}." ref sub;
      `Razorpay pay_X` -> "AutoPay charge captured and access extended." ref pay;
      `Synced from Razorpay: a -> b, n payment(s) applied[, notes updated on m payment(s)]` -> "Synced with Razorpay. Status {unchanged (A)|changed from A to B}. {No new payments applied|n payments applied}{. Payment notes updated on m}." ;
      `Cancelled AutoPay sub_X (mode). Reason: r` -> "AutoPay cancelled by a super admin." note r;
      `Re-queued Razorpay webhook evt_X (type)` -> "Webhook event re-queued for processing." ref none, note type;
      `Refund rfnd_X on pay_Y (full|partial); access: e` -> "{Full|Partial} refund processed. Access: {accessEffectMeta(e).label}." ref pay;
      `Dispute disp_X on pay_Y (...)` / `Dispute disp_X status; access: e` -> "Dispute opened…"/"Dispute {status}…" ref pay;
      `UTR 123` -> "Manual UPI payment submitted for review." ref utr;
      `refund_mismatch on …`, `Razorpay plan … differs …`, `Razorpay notes.account_id …` -> billing_anomaly sentences;
      no note -> a default sentence per event type (e.g. trial_extended "Trial extended.");
      any other note -> default sentence + `note` (shown as "Note: …", not italic quotes).
      Test `event-description.test.ts`: every live note string from the audit query verbatim plus each SQL template, and an unknown note passes through as `note`.
      Files: event-description.ts, event-description.test.ts
      Verify: `npx vitest run src/components/super-admin/billing/event-description.test.ts`.

- [ ] P6. Activity log UI rebuild.
      Rewrite `activity-panel.tsx` to consume P4. Props:
      `{ accountId?: string; onOpenSubscription?: (id: string) => void }`; page.tsx passes `openSubscription`.
      Tiles (hidden with accountId): All channels, then one per channel using
      `CHANNEL_META` tone; each tile is a button that sets the Channel filter
      and shows `aria-pressed`; numbers come from `counts.byChannel`, "All" = sum.
      Filters (FilterToolbar): SearchBox "Workspace, email, admin, reference or note";
      Channel select (All channels + 5); Event type select using `SelectGroup` +
      `SelectLabel` per `EVENT_TYPES_BY_CHANNEL` group (extend `FilterSelect` in
      razorpay-shared.tsx with optional `groups: { label; options }[]`); Razorpay
      mode select (All modes / Live / Test); Date select (Any time / Last 7 days /
      Last 30 days / Last 90 days). Page resets on any filter change. Default
      pageSize 20 (F9). `truncated` shows an amber note "Showing the newest 10,000 events. Narrow the filters to see older ones."
      Columns: Event (icon from EVENT_META, title `billingEventLabel`, description text, reference chip: `CopyId` + `RazorpayLink` + "Open AutoPay" button when `billingSubscriptionId` and `onOpenSubscription`; UTR chip + "Open request" via P7's `useManualRequestOpener`), Channel (`ChannelBadge` + Test pill when mode='test'), Workspace (name + owner email, `title` with full text), Access change (granted span + "Paid access"/"Trial days" + end date before -> after, merged into one cell; "—" when none), Status (only when from != to, `accountStatusLabel`), Amount (right-aligned, `tabular-nums`, `formatMoneyMajor(amount, currency)` bold when amountKind paid/refund, muted otherwise, caption from `amountCaption`), Initiated by (label + detail line), When (IST via `formatIst`, relative in `title`).
      Loading: skeleton rows (5 rows of `animate-pulse` bars) instead of the spinner row when no data yet; keep `TableStateRow` for error/empty. Empty copy: "No events match these filters." / "Nothing recorded yet."
      Files: activity-panel.tsx, razorpay-shared.tsx (FilterSelect groups, `TableSkeletonRows`), page.tsx
      Verify: tsc clean; `npx vitest run src/components/super-admin/billing`; eslint on touched files.

- [ ] P7. All payments ledger: server.
      Create `src/lib/billing/ledger.ts` (pure): `LedgerRow` type, `toLedgerFromRazorpay(p: AdminPaymentRow)`,
      `toLedgerFromManual(r)`, `ledgerStatusFor…`, `selectLedgerPage(rows, params)` (filter channel/status/mode/search, sort `date:desc|date:asc|amount:desc`, tie-break by key, paginate, counts per channel and per status over rows matching all filters except the one being counted).
      `LEDGER_STATUSES` lives in `src/lib/billing/ledger-status.ts` (P3).
      Status mapping: Razorpay `captured` & refunded 0 -> paid; `captured` & 0 < refunded < amount -> partially_refunded; `refunded` or refunded >= amount -> refunded; `failed` -> failed; `created`/`authorized` -> pending. Manual `approved` -> paid; `pending` -> pending; `rejected` -> rejected. Filter `refunded` matches both refunded and partially_refunded.
      Mode: Razorpay rows carry mode; manual rows `mode: null`; `mode=live|test` keeps only Razorpay rows of that mode (same decision as P4, select labelled "Razorpay mode").
      ```ts
      interface LedgerRow {
        key: string;                       // 'rzp:<billing_payments.id>' | 'upi:<payment_requests.id>'
        channel: 'razorpay' | 'manual_upi';
        date: string;                      // provider_created_at ?? created_at | created_at (submitted)
        accountId: string; accountName: string | null; ownerEmail: string | null;
        type: 'first_payment' | 'renewal' | 'card_verification' | 'manual_payment';
        planName: string | null; cycleLabel: string | null;
        periodFrom: string | null; periodTo: string | null;   // granted_from/until | activated_from/until
        amountMinor: number; refundedMinor: number; currency: string;
        expectedMinor: number | null;      // manual only
        status: LedgerStatus; rawStatus: string;
        mode: 'test' | 'live' | null;
        method: string | null;             // razorpay method | 'upi_qr'
        methodDetail: { cardNetwork; cardLast4; vpaMasked; bank; wallet; payerUpiId } ;
        reference: string | null;          // pay_ id | UTR
        billingSubscriptionId: string | null; providerSubscriptionId: string | null;
        paymentRequestId: string | null;
        razorpay: AdminPaymentRow | null;  // for the expandable details
      }
      ```
      In `src/lib/billing/razorpay/admin-db.ts` add exported `listAllAdminPayments(admin, { cap })` reusing `PAYMENT_COLUMNS`, `toAdminPayment`, `namesById`, `subscriptionLabels`, `providerIds`, `loadFirstAppliedChargeAt` over `fetchAllRows` (no search filter in SQL; ledger filters in memory). Manual loader in `src/lib/billing/ledger-db.ts`: payment_requests explicit columns (id, account_id, user_id, plan_name_snapshot, cycle_label_snapshot, expected_amount, paid_amount, currency, transaction_ref, payer_upi_id, payment_method, status, activated_from, activated_until, reviewed_by_user_id, reviewed_at, created_at) with `toMinor(toAmount(x), currency)` from money.ts; owner emails via accounts + profiles; exclude super-admin-owned workspaces in both halves.
      Route `src/app/api/super-admin/billing/ledger/route.ts` (GET, super admin, `dynamic = 'force-dynamic'`): params `channel` (all|razorpay|manual_upi), `status` (all|LEDGER_STATUSES), `mode` (all|live|test), `search`, `sort`, `page`, `pageSize` (10|20|50|100, default 20); invalid enum -> 400. Response `{ items: LedgerRow[]; total; page; pageSize; totalPages; counts: { channel: Record<'razorpay'|'manual_upi', number>; status: Record<LedgerStatus, number> }; truncated: boolean }`. Errors via `adminBillingErrorResponse(err, 'payments ledger')`.
      Also add `id` (UUID) param to GET `src/app/api/super-admin/billing/payment-requests/route.ts` (`.eq('id', id)`, ignores status), read-only, so the ledger and Activity log can open `PaymentRequestDrawer` for one request.
      Tests: `src/lib/billing/ledger.test.ts` (status mapping table incl. partial refund and ₹5 setup check as card_verification refunded; merge sort across both channels with equal timestamps; pagination window; each filter; counts exclude own dimension; manual amount 990.00 -> 99000 minor), `src/app/api/super-admin/billing/ledger/route.test.ts` (403, 400, merged response shape with fake supabase, no `.update/.insert/.delete/.rpc` calls: assert the fake records none).
      Files: src/lib/billing/ledger.ts, ledger-db.ts, ledger.test.ts, admin-db.ts, ledger/route.ts, ledger/route.test.ts, payment-requests/route.ts
      Verify: `npx vitest run src/lib/billing src/app/api/super-admin/billing` pass; tsc clean.

- [ ] P8. Access-via for Workspaces (server).
      Create `src/lib/billing/access-via.ts`: `deriveAccessVia({ liveStatus, autopay, latestGrant })` -> `{ kind: 'razorpay_autopay'|'manual_upi'|'admin_grant'|'trial'|'none'|'unknown'; current: boolean; since: string | null; detail: string | null }`.
      Rules: liveStatus `none` -> none; `trialing` -> trial (detail "AutoPay set up" when autopay status is authenticated/active); `active` -> channel of latestGrant (razorpay -> razorpay_autopay, manual_upi -> manual_upi, admin -> admin_grant), if no grant row but autopay status active -> razorpay_autopay, else unknown ("Not recorded"; never guess, AGENTS.md §6); `expired` -> same mapping with `current: false` (UI prefixes "Last access:").
      latestGrant = newest subscription_events row per account with event_type in (payment_succeeded, payment_approved, subscription_activated, subscription_extended) classified with `classifyBillingEvent`; trial events are not grants.
      In `src/app/api/super-admin/billing/subscriptions/route.ts` GET: add a fourth parallel read via `fetchAllRows` (columns: account_id, event_type, source, payment_request_id, billing_subscription_id, billing_payment_id, actor_user_id, created_at; ordered created_at desc), pick first per account, and the actor super-admin flag from the profiles already loaded (extend that select to include actors: load `profiles(user_id, is_super_admin)` for actor ids). Lookup failure -> `accessVia: undefined` (Unknown) and a console.error, never null. Add `accessVia` to `SubscriberRow` and `methodSummary` to `SubscriberAutopay` (F16) in src/types/super-admin.ts.
      Test `src/lib/billing/access-via.test.ts`: each rule, expired with manual grant, active with only autopay row, active with admin grant newer than an AutoPay payment.
      Files: access-via.ts (+test), subscriptions/route.ts, src/types/super-admin.ts
      Verify: `npx vitest run src/lib/billing/access-via.test.ts`; tsc clean.

- [ ] P9. Workspaces list and Manage dialog UI.
      In `subscribers-panel.tsx`: add "Access via" column after Status (`StatusPill domain="access"`, "Last access:" prefix when `current` false, `since` as muted IST date); AutopayCell uses `methodText(autopay.paymentMethod, autopay.methodSummary)`; COLS updated. Dialog header shows the same access-via pill. `RecentHistory` consumes P4 `BillingEventView`: `ChannelBadge` (small), `billingEventLabel`, description text from P5, amount with caption when amountKind is paid/refund, initiator label, IST date; drop the green/blue dot. Right-align numeric columns, keep sticky header.
      Files: subscribers-panel.tsx
      Verify: tsc clean; `npx vitest run src/components/super-admin/billing`; eslint on file.

- [ ] P10. AutoPay drawer and Webhooks consistency.
      `razorpay-subscription-drawer.tsx` events: status pair via `accountStatusLabel`, only when both set and different (F17); initiator = `actorName ?? sourceInitiatorLabel(source)` (F18); description via `describeBillingEvent` (needs eventType + note only; reference chip suppressed when it equals this drawer's subscription id) (F19). Add `ChannelBadge` per event by calling `classifyBillingEvent` with `billingSubscriptionId` = drawer id and the source (extend `EVENT_COLUMNS` in admin-db.ts:140 with `billing_payment_id, payment_request_id` and `AdminBillingEventRow` with those two fields).
      `razorpay-webhooks-panel.tsx:278`: title `webhookEventLabel(w.eventType)` with raw name below in mono 10px (F20); confirm dialog text uses the label.
      Files: razorpay-subscription-drawer.tsx, razorpay-webhooks-panel.tsx, admin-db.ts
      Verify: `npx vitest run src/lib/billing/razorpay src/components/super-admin/billing`; tsc clean.

- [ ] P11. Navigation and All payments panel UI.
      `payments-nav.ts`: add view `'ledger'` (label "All payments") as the FIRST view of `payments`; `DEFAULT_VIEW.payments = 'ledger'`; `PaymentsView` union gains `'ledger'`; `LEGACY_TAB_MAP.transactions` stays `{ payments, transactions }`; update header comment. Update `payments-nav.test.ts`: defaults now `ledger` (`tab=payments` -> `view=ledger`, invalid view -> ledger, `paymentsSearchParams({section:'payments', sub:'nope'})` -> `tab=payments&view=ledger`, `canon('tab=payments')` -> `tab=payments&view=ledger`), legacy `transactions` still lands on Transactions, new case `tab=payments&view=ledger` canonical (null).
      Create `src/components/super-admin/billing/payments-ledger-panel.tsx`: `useAdminList<LedgerRow>('/api/super-admin/billing/ledger', …)`; prop `initialStatus?: string` and `onOpenSubscription`. Toolbar: search "Workspace, email, pay_ id or UTR", Channel (All channels / Razorpay AutoPay / Manual UPI), Status (`statusOptions('ledger', LEDGER_STATUSES)`), Razorpay mode, Sort (Newest first / Oldest first / Highest amount). Summary strip above the table: counts per channel from `counts.channel`. Columns: Date (IST, time), Workspace (name + owner email), Channel (`ChannelBadge` + Test pill), Type (`chargeTypeLabel` or "Manual payment"), Plan & cycle, Period covered ("6 Apr 2027 to 5 May 2027" or "Not applied yet"), Amount (right, tabular-nums, `formatMoneyMinor`, refunded amount line, manual expected mismatch line "Expected ₹X"), Method (Razorpay `adminPaymentMethodText(row.razorpay)`; manual "UPI QR" + payer UPI id), Status (`StatusPill domain="ledger"`), Reference (`CopyId` pay_ id with `RazorpayLink`, or UTR), Details (button). Details: Razorpay row toggles an expanded row rendering the exported `PaymentDetails` from razorpay-transactions-panel.tsx (export it) which already has "Open AutoPay"; manual row calls `useManualRequestOpener().open(paymentRequestId)` which fetches `/api/super-admin/billing/payment-requests?id=…`, then renders `PaymentRequestDrawer` (onReviewed reloads the ledger). Put the hook in `src/components/super-admin/billing/manual-request-opener.tsx` (shared with P6). Skeleton rows while loading; empty states "No payments match these filters." / "No payments recorded yet."; sticky header; `LIST_HEIGHT`.
      `page.tsx`: register `ledger` panel first under Payments with the not-configured notice; hold `ledgerPreset` state so Overview's failed-payments link can open `{ section: 'payments', view: 'ledger' }` with status `failed` (F25); pass `onOpenSubscription` to ActivityPanel and the ledger; update header comment.
      Files: payments-nav.ts, payments-nav.test.ts, payments-ledger-panel.tsx, manual-request-opener.tsx, razorpay-transactions-panel.tsx, page.tsx
      Verify: `npx vitest run src/components/super-admin/billing/payments-nav.test.ts`; tsc clean; eslint on touched files.

- [ ] P12. Collected summary: server.
      Create `src/lib/billing/collected.ts` (pure): `summariseCollected({ payments, refunds, manual }, now)` -> 
      ```ts
      interface MoneyLine { currency: string; amountMinor: number; count: number }
      interface CollectedWindow {
        autopay: { live: MoneyLine[]; test: MoneyLine[] };     // captured plan charges, kind != 'authorization'
        manualUpi: MoneyLine[];                                // payment_requests approved, by reviewed_at ?? created_at
        refunds: { live: MoneyLine[]; test: MoneyLine[] };     // billing_refunds processed, access_effect != 'none_not_a_charge'
        setupChecks: { live: MoneyLine[]; test: MoneyLine[] }; // authorisation payments and their refunds, shown as a footnote
        netLive: MoneyLine[];                                  // autopay.live + manualUpi - refunds.live, per currency
      }
      interface CollectedResponse { generatedAt: string; last30d: CollectedWindow; allTime: CollectedWindow }
      ```
      Decisions: AutoPay "collected" counts `captured = true` rows (status captured or refunded) excluding `kind = 'authorization'` (the ₹5 setup check is refunded by design); refunds exclude `none_not_a_charge` so setup-check refunds do not net against revenue; manual UPI is real money outside Razorpay and is never added to test figures; per-currency lines, never summed across currencies; windows by IST-agnostic rolling 30 x 24 h from `now`.
      Route `src/app/api/super-admin/billing/collected/route.ts` (GET, super admin, force-dynamic, read-only) loading billing_payments (mode, kind, status, captured, amount_minor, currency, captured_at, created_at, account_id), billing_refunds (mode, status, amount_minor, currency, access_effect, processed_at, created_at, account_id), payment_requests (status, paid_amount, currency, reviewed_at, created_at, account_id) via `fetchAllRows`, excluding super-admin-owned workspaces.
      Tests: `src/lib/billing/collected.test.ts` with the live snapshot (AutoPay test ₹9,000 count 1, setup checks ₹10 test, refunds test 0 after exclusion, manual ₹45,150 count 2, netLive ₹45,150), window boundary (31 days old excluded from last30d), multi-currency lines kept separate; `src/app/api/super-admin/billing/collected/route.test.ts` (403, shape).
      Files: collected.ts (+test), collected/route.ts (+test)
      Verify: `npx vitest run src/lib/billing/collected.test.ts src/app/api/super-admin/billing/collected`.

- [ ] P13. Overview: Collected card and AutoPay tiles.
      In `razorpay-overview-panel.tsx` add a "Collected" card first (own `useAdminJson<CollectedResponse>('/api/super-admin/billing/collected')`, reloaded by the existing Refresh): segmented toggle Last 30 days / All time; a live row of tiles AutoPay collected (live), Manual UPI approved, Refunded (live), Net collected (live); a separate amber "Test mode (no real money)" strip with AutoPay collected (test) and Refunded (test); footnote "AutoPay setup checks (₹X, refunded automatically) are excluded."; every amount via `formatMoneyMinor`, right-aligned `tabular-nums`; each tile links to Payments › All payments with the matching channel/status preset. AutoPay status tiles: keep the fixed list and append any other non-zero `<mode>:<status>` key with `statusMeta('subscription', …)` (F24). Failed-payments link opens the ledger with status failed (F25).
      Files: razorpay-overview-panel.tsx, page.tsx (pass a navigate-with-preset callback)
      Verify: tsc clean; eslint on touched files; `npx vitest run src/components/super-admin/billing`.

- [ ] P14. Currency and polish sweep.
      Replace `formatCurrency` with `formatMoneyMajor` in manual-payments-panel.tsx:375-385 and payment-request-drawer.tsx:219-251 (row currency, default INR) (F26). Consistent table conventions across activity, ledger, transactions, invoices, refunds, subscriptions, workspaces: `Th` right-aligned for numeric columns, amount cells `tabular-nums`, sticky headers already present, one skeleton helper `TableSkeletonRows({ cols, rows })` in razorpay-shared.tsx used by every list in its first load, empty-state copy in full sentences. No behaviour changes beyond presentation. Leave plans-panel.tsx (not on this page).
      Files: manual-payments-panel.tsx, payment-request-drawer.tsx, razorpay-shared.tsx, razorpay-{transactions,invoices,refunds-disputes,subscriptions,webhooks}-panel.tsx
      Verify: tsc clean; `npx vitest run src/components/super-admin/billing`; eslint on touched files.

- [ ] P15. User Guide content.
      `payments-guide-content.ts`: new topic `channels` ("How each entry happened") with `terms` for the five channels (wording = CHANNEL_META hints) and a paragraph on "Initiated by" and amount captions; new topic `money` explaining All payments (one ledger of Razorpay payments and manual UPI requests, the Razorpay mode filter excludes manual rows, statuses) and the Overview Collected card (live and test never mixed, setup checks excluded); rewrite `activity` module summary (line ~507) for channel/event type/mode/date filters and per-channel tiles; `transactions` module notes that All payments is the default view; `overview` module adds the Collected card; `subscribers` module adds the Access via column; intro paragraph mentions All payments. Plain prose, no `!`, no em dash.
      `payments-guide.test.tsx`: add assertions that topics include `channels` and `money`, that each `CHANNEL_META` label appears in the guide strings, and that the activity summary no longer contains "Paid or Manual".
      Files: payments-guide-content.ts, payments-guide.test.tsx
      Verify: `npx vitest run src/components/super-admin/billing/payments-guide.test.tsx`.

- [ ] P16. Report and docs.
      Write `docs/razopay/payments-page-audit-and-fix-report.md` (outline in section 4) and add a row to the table in `docs/razopay/README.md` ("Payments page audit and fix" | link | "Channel classification for every billing event, All payments ledger, Collected summary, Activity filters, INR currency, access via"). In `docs/billing-runbook.md` add one sentence under refunds: look a payment up in Payments › All payments by `pay_` id. Run `npx prettier --write` on the three docs.
      Files: docs/razopay/payments-page-audit-and-fix-report.md, docs/razopay/README.md, docs/billing-runbook.md
      Verify: files exist; prettier reports no errors.

- [ ] P17. Full verification (no code changes unless something fails).
      Run section 4 commands in order; fix regressions; delete any `scratch/` probe files; confirm `.next-verify3` removed and `git status` shows only intended files (no tsconfig.json change).

---

## 4. Verification and report outline

Commands (exactly):
```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS"          # expect no output
npx vitest run                                             # baseline 211 files / 2,778 tests, all green plus new tests
npx eslint <touched files>
npx prettier --write <touched files>
$env:NEXT_DIST_DIR=".next-verify3"; npm run build
git checkout -- tsconfig.json
Remove-Item -Recurse -Force .next-verify3
```
Notes: PowerShell expands `$$` in inline `node -e`; use `scratch/*.js` files and delete them. `read_file`/`str_replace` can show stale buffers; confirm on disk with `Select-String`. Known pre-existing lint errors: 3 `no-explicit-any` in src/components/settings/whatsapp-setup.tsx. Prettier may reformat whole files; mention it. Optional read-only SQL check after the build: re-run the channel distribution query and compare with the tiles.

Report outline, docs/razopay/payments-page-audit-and-fix-report.md:
1. Summary (problem in the user's words, what changed, outcome).
2. Audit findings F1-F30, each with before and after.
3. Channel rules: precedence table, initiated-by table, money/amount-caption table, live distribution with resulting tiles (106 = 7 + 14 + 84 + 1 + 0).
4. Activity log: filters before/after (Source -> Channel, 9 -> 25 event types grouped, Razorpay mode, date), API params and response, counts semantics, `truncated`.
5. All payments ledger: route, params, response, status mapping, mode decision for manual rows, Details behaviour.
6. Overview Collected: definitions (setup checks excluded, refunds exclude `none_not_a_charge`, live and test separate, per currency) and the live-snapshot figures.
7. Workspaces access via and Manage dialog history.
8. Currency fix (USD default, browser-locale grouping) and polish list.
9. Files changed and tests added.
10. Verification results (tsc, vitest counts, eslint, build) and what was not verified.
11. Browser checklist on devcrm: Activity tiles read 7/14/84/1/0 and each tile filters the table; Event type groups list 25 types; Mode=Test shows only Razorpay rows with Test pill; "AutoPay status changed from Created to Authorised" renders with a copyable sub_ chip and Open AutoPay; amounts show ₹ with captions; Payments opens on All payments with 3 Razorpay + 6 manual rows; Details opens the AutoPay details or the manual request drawer; Overview Collected shows ₹45,150 manual, ₹0 live AutoPay, ₹9,000 test AutoPay separate; Workspaces Access via column; Manage dialog history badges; Webhooks titles readable; old `?tab=transactions` still opens Transactions.
