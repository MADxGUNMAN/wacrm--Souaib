# Payments & Subscriptions page redesign: implementation plan

Repo root: `d:\Junkies Coder\whatsapp-crm-nextjs` (Windows, PowerShell). All paths below are relative to it.
UI-only refactor. No database writes, no migrations, no API route or `src/lib` changes, no new npm dependencies.

## 0. Ground rules for the coder (read first)

- Read before editing the page: `AGENTS.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` (Suspense boundary for `useSearchParams`) and `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` section "Native History API" (`window.history.replaceState` keeps `useSearchParams` in sync; this is what `src/lib/url-state.ts` `replaceSearchParams` does). Keep the existing `Suspense` wrapper in `page.tsx` and keep using `replaceSearchParams`, never `router.replace`.
- Working tree at plan time: HEAD `4f2a2cd` on `wip/souaib`; only `src/app/sitemap/page.tsx` and `src/components/sitemap/sitemap-explorer.tsx` are modified, and they are unrelated. Do not touch them. Never run `git checkout/reset/stash/clean` except `git checkout -- tsconfig.json` after the build. No commits, no git config changes, no Scrum.txt or Google Sheets logging (the user brief overrides the AGENTS.md logging line).
- No database writes. Do not touch account `b69f6811-ab01-4b6d-b89e-68b65bdcba5d`. Never cancel a Razorpay subscription. Do not click Cancel AutoPay, Retry, Run reconciliation, Approve, Reject or Manage actions in any live check.
- Copy: plain prose, no exclamation marks, no em dashes in user-visible strings (the `'—'` empty-cell glyph returned by `formatIst`/`formatMinor` stays). Light slate palette, existing Tailwind conventions, `#25D366` accent.
- `read_file`/`str_replace` can show stale buffers: confirm edits on disk with `Select-String`. For scripted edits use files in `scratch/` (gitignored), never inline `node -e` (PowerShell expands `$$`), and delete them afterwards.
- Test environment is vitest `environment: "node"` with no jsdom or Testing Library. UI tests use `renderToStaticMarkup` (pattern: `src/components/super-admin/billing/autopay-warning.test.tsx`). Base UI portals (Sheet, Dialog, Tooltip popups) render nothing in static markup, so test their contents through the non-portal body component.

## (a) Final structure

Five primary sections (shared `Tabs` primitive, `variant="line"`), three of them with a secondary segmented control (nested `Tabs`, `variant="default"`, the muted pill look).

| # | Section id | Label | Sub-views (id: label) | Default view | Holds (old tabs) |
|---|---|---|---|---|---|
| 1 | `overview` | Overview | none | none | Overview |
| 2 | `manual` | Manual UPI (label becomes "Manual UPI (history)" when `manualIntake` is `partial` or `retired`), plus a pending-count pill | none | none | Manual payments |
| 3 | `subscriptions` | Subscriptions | `autopay`: AutoPay mandates; `workspaces`: Workspaces | `autopay` | AutoPay subscriptions, Subscribers |
| 4 | `payments` | Payments | `transactions`: Transactions; `invoices`: Invoices; `refunds`: Refunds & disputes | `transactions` | Transactions, Invoices, Refunds & disputes |
| 5 | `activity` | Activity & health | `log`: Activity log; `webhooks`: Webhooks; `reconciliation`: Reconciliation | `log` | Activity, Webhooks & reconciliation |

Decisions and rationale:

- One deviation from the recommended order: **Manual UPI is second**, right after Overview. Production has no Razorpay keys (`resolvePaymentProvider` returns `manual_upi` when config is null, `src/lib/billing/razorpay/provider.ts`), so on production it is the only working queue; putting it next to Overview keeps the pending pill in the first glance. The order is fixed (not dynamic) so the bar never shifts between servers.
- Section ids reuse the legacy ids where the meaning is unchanged (`overview`, `subscriptions`, `activity`, `manual`), so those legacy URLs need no special case: a legacy `?tab=subscriptions` resolves to the section's default view `autopay`, which is exactly the old tab, and `?tab=activity` to `log`, the old Activity tab.
- Old "Webhooks & reconciliation" is split into two views. Each list had its own pagination and toolbar, and the stacked layout was a large part of the "crowded" feel; the old `?tab=webhooks` lands on Webhooks, the top half of the old tab.
- Refunds & disputes stays one view with its two stacked tables: they share one search and mode filter and are always read together during a dispute.
- Primary tab bar fits 1024 px: content width there is 768 px (sidebar `lg:w-64`) minus `p-6`, about 720 px; five text labels need about 600 px. Icons render only from `xl` up (`hidden xl:inline-block`) and the list uses `flex-wrap h-auto`, so it can never overflow horizontally (wraps on phones instead). No `overflow-x-auto` anywhere.
- Accessibility comes from Base UI Tabs (`@base-ui/react/tabs` via `src/components/ui/tabs.tsx`): `role=tablist/tab/tabpanel`, `aria-selected`, roving focus with arrow keys, `focus-visible` ring already in `TabsTrigger`. Give each `TabsList` an `aria-label` ("Payments sections", "<Section> views"). `TabsContent` unmounts inactive panels by default (`keepMounted` false), so each panel still owns and refetches its own state on mount, as today.
- The AutoPay subscription drawer moves to page level and opens on **any** section whenever `?sub=<uuid>` is present, so Transactions and Invoices rows can open it in place ("Open AutoPay") and closing returns to the same view. This is where secondary ids (invoice id, subscription id) and detail now live.
- The Razorpay overview JSON (`GET /api/super-admin/billing/razorpay/overview`, `{ configured, mode, overview }`) is fetched once by the page with `useAdminJson` and passed down: to the Overview panel (data), to Webhooks and Reconciliation (`serverMode`, replacing the extra fetch inside `razorpay-webhooks-panel.tsx`) and to the not-configured notice.

## (b) Legacy id to {tab, view} mapping

Canonical URL: `?tab=<section>&view=<view>&sub=<uuid>` (`view` only for sections that have views, `sub` only when the drawer is open). Other query params are preserved; `tab`, `view`, `sub` are always written last in that order.

| Incoming `?tab=` | Resolves to section | view | Notes |
|---|---|---|---|
| (missing) | `overview` | none | if `sub` is a valid UUID: `subscriptions` / `autopay` with drawer |
| `overview` | `overview` | none | `view` ignored and dropped |
| `subscriptions` (legacy and new) | `subscriptions` | `view` param if valid for the section, else `autopay` | old AutoPay subscriptions tab |
| `transactions` (legacy) | `payments` | `transactions` | `view` param ignored |
| `invoices` (legacy) | `payments` | `invoices` | `view` param ignored |
| `refunds` (legacy) | `payments` | `refunds` | `view` param ignored |
| `webhooks` (legacy) | `activity` | `webhooks` | `view` param ignored |
| `subscribers` (legacy) | `subscriptions` | `workspaces` | `view` param ignored |
| `activity` (legacy and new) | `activity` | `view` param if valid, else `log` | old Activity tab |
| `manual` (legacy and new) | `manual` | none | `view` ignored and dropped |
| `payments` (new) | `payments` | `view` param if valid, else `transactions` | |
| any unknown value | `overview` | none | if `sub` is a valid UUID: `subscriptions` / `autopay` with drawer |

`?sub=` rules: accepted only when it matches the existing UUID regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, moved from `page.tsx`); otherwise dropped. A valid `sub` is kept on whatever section/view resolves (so legacy `?tab=subscriptions&sub=X` = `subscriptions/autopay` + drawer, `?tab=subscribers&sub=X` = Workspaces + drawer). Switching section or view always clears `sub`; closing the drawer clears only `sub`.

Canonicalisation: on load and on every search-param change the page calls `canonicalPaymentsQuery(searchParams)`; when it returns a string the page calls `replaceSearchParams(new URLSearchParams(result))`, so legacy links are rewritten once to the canonical form. A bare `/super-admin/payments` (no `tab`, `view` or `sub`) is left untouched. Notification links in the DB (`/super-admin/payments`, no query) keep landing on Overview.

## (c) URL-mapping helper (pure, testable)

New file `src/components/super-admin/billing/payments-nav.ts` (no React, no `'use client'`; only a type import of `ManualIntake` from `@/lib/billing/razorpay/provider`).

```ts
export type PaymentsSection = 'overview' | 'manual' | 'subscriptions' | 'payments' | 'activity';
export type PaymentsView =
  | 'autopay' | 'workspaces'
  | 'transactions' | 'invoices' | 'refunds'
  | 'log' | 'webhooks' | 'reconciliation';
export type LegacyTab =
  | 'overview' | 'subscriptions' | 'transactions' | 'invoices' | 'refunds'
  | 'webhooks' | 'subscribers' | 'activity' | 'manual';

export interface PaymentsViewDef { id: PaymentsView; label: string }
export interface PaymentsSectionDef { id: PaymentsSection; label: string; views: readonly PaymentsViewDef[] }
export interface PaymentsTarget { section: PaymentsSection; view?: PaymentsView | null; sub?: string | null }
export interface PaymentsLocation { section: PaymentsSection; view: PaymentsView | null; sub: string | null }

export const PAYMENTS_SECTIONS: readonly PaymentsSectionDef[];            // order and labels from table (a)
export const DEFAULT_VIEW: Readonly<Record<PaymentsSection, PaymentsView | null>>;
export const LEGACY_TAB_IDS: readonly LegacyTab[];                        // the 9 old ids, old tab order
export const LEGACY_TAB_MAP: Readonly<Record<LegacyTab, { section: PaymentsSection; view: PaymentsView | null }>>;

export function isBillingSubscriptionId(value: string | null | undefined): value is string;
export function sectionDef(section: PaymentsSection): PaymentsSectionDef;
export function viewsFor(section: PaymentsSection): readonly PaymentsViewDef[];
export function resolvePaymentsLocation(params: { get(name: string): string | null }): PaymentsLocation;
/** Copies `base`, deletes tab/view/sub, then appends tab, view (only if the section has views; default view when omitted or invalid), sub (only if a valid UUID). */
export function paymentsSearchParams(target: PaymentsTarget, base?: string | URLSearchParams): URLSearchParams;
/** "?tab=subscriptions&view=autopay&sub=<id>" (no base params). */
export function paymentsHref(target: PaymentsTarget): string;
/** Canonical query string when the current one needs rewriting, else null. Null when none of tab/view/sub is present. */
export function canonicalPaymentsQuery(params: URLSearchParams): string | null;
/** "Overview", "Manual UPI", "Subscriptions › AutoPay mandates", "Payments › Refunds & disputes". */
export function locationLabel(loc: { section: PaymentsSection; view?: PaymentsView | null }): string;
/** "Manual UPI" for open/null, "Manual UPI (history)" for partial/retired. */
export function manualSectionLabel(intake: ManualIntake | null): string;
```

## (d) Shared status-badge mapping and label table

New pure file `src/components/super-admin/billing/billing-labels.ts` (no JSX):

```ts
export type Tone = 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'violet';
export type StatusDomain = 'subscription' | 'payment' | 'invoice' | 'refund' | 'dispute' | 'webhook' | 'reconciliation' | 'manual' | 'workspace';
export interface LabelMeta { label: string; tone: Tone; hint?: string }
export const TONE_BADGE_CLASS: Readonly<Record<Tone, string>>;   // green: 'border-emerald-200 bg-emerald-50 text-emerald-700', blue: 'border-blue-200 bg-blue-50 text-blue-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', red: 'border-red-200 bg-red-50 text-red-700', slate: 'border-slate-200 bg-slate-100 text-slate-600', violet: 'border-violet-200 bg-violet-50 text-violet-700'
export const STATUS_META: Readonly<Record<StatusDomain, Readonly<Record<string, LabelMeta>>>>;
export function sentenceCase(raw: string | null | undefined): string;  // 'partially_paid' -> 'Partially paid', '' or null -> '—'
export function statusMeta(domain: StatusDomain, value: string | null | undefined): LabelMeta; // fallback { label: sentenceCase(value), tone: 'slate' }
export function statusOptions(domain: StatusDomain, values: readonly string[], allLabel?: string): { value: string; label: string }[]; // first item { value: 'all', label: allLabel ?? 'All statuses' }
export const ACCESS_EFFECT_META: Readonly<Record<string, LabelMeta>>;
export function accessEffectMeta(value: string | null | undefined): LabelMeta;
export function paymentKindLabel(kind: string | null | undefined): string;
export function refundSpeedLabel(processed: string | null, requested: string | null): string;
export function disputePhaseLabel(phase: string | null | undefined): string;
export function disputeReasonLabel(code: string | null | undefined): string;   // sentenceCase, '—' when empty
export const METHOD_LABEL: Readonly<Record<string, string>>;
export function methodLabel(method: string | null | undefined): string;
export const BILLING_EVENT_LABEL: Readonly<Record<string, string>>;
export function billingEventLabel(eventType: string): string;
export function eventSourceLabel(source: string | null | undefined): string;
export function cancelledByLabel(by: string | null | undefined): string;
export function runTriggerLabel(run: { scope: string; triggeredBy: string | null; triggeredByName: string | null }): string;
export function accountStatusLabel(value: string | null | undefined): string; // workspace label, else subscription label, else sentenceCase
```

`statusMeta` is domain-scoped on purpose: `pending` means "Payment pending" for an AutoPay, "Pending" for a refund and "Pending review" for a manual request; `created` means "Awaiting authorisation" for an AutoPay but "Created" for a payment. One table, no per-panel maps. The existing `STATUS_TONE`, `STATUS_LABEL` and `statusLabel` in `razorpay-shared.tsx`, `STATUS_STYLE` in `page.tsx`, `subscribers-panel.tsx` and `payment-request-drawer.tsx`, `KIND_LABEL` in the transactions panel, `EVENT_LABELS` in the drawer and the label strings of `EVENT_META`/`LABELS` in `activity-panel.tsx`/`subscribers-panel.tsx` RecentHistory are all replaced by this module (Activity keeps its icon and tone per event, takes the label from `billingEventLabel`).

Raw values (source: CHECK constraints in `supabase/migrations/20261021000000_razorpay_billing_schema.sql`, list specs in `src/lib/billing/razorpay/admin-db.ts`, functions in `20261022000000_razorpay_billing_phase3.sql`, `src/types/super-admin.ts`, `src/lib/subscription/types.ts`):

**subscription** (`billing_subscriptions.status`, `BILLING_SUBSCRIPTION_STATUSES`)

| raw | label | tone | hint |
|---|---|---|---|
| initiating | Starting checkout | slate | Checkout started, not created at Razorpay yet |
| failed_to_create | Failed to create | red | |
| created | Awaiting authorisation | slate | Created at Razorpay, the customer has not authorised it |
| authenticated | Authorised | blue | Mandate authorised, first charge still to come |
| active | Active | green | |
| pending | Payment pending | amber | A charge failed and Razorpay is retrying |
| halted | Halted | red | Razorpay stopped charging after repeated failures |
| paused | Paused | slate | |
| cancelled | Cancelled | slate | |
| completed | Completed | slate | |
| expired | Expired | slate | |
| superseded | Replaced | slate | Replaced by a newer checkout (`service.ts` markSuperseded) |

Filter-only value `live` (all `LIVE_AUTOPAY_STATUSES`): option label "Not ended yet" (was "Live AutoPay (can charge)", which read like Live mode).

**payment** (`billing_payments.status`): created Created slate; authorized Authorised blue; captured Captured green; refunded Refunded slate; failed Failed red.
Payment `kind`: authorization Authorisation; charge Recurring charge; upfront Upfront; unknown Unknown.
Payment `refund_status` is no longer rendered in the row (redundant with the Refunded pill and the "₹x refunded" amount line).

**invoice** (`billing_invoices.status`): draft Draft slate; issued Issued blue; partially_paid Partly paid amber; paid Paid green; expired Expired slate; cancelled Cancelled slate; deleted Deleted slate.

**refund** (`billing_refunds.status`): pending Pending amber; processed Processed green; failed Failed red.
Refund speed: processed `instant` Instant, `normal` Normal; requested only: `optimum` "Optimum requested", `normal` "Normal requested"; both empty '—'; other values sentenceCase.

**access effect** (`billing_refunds.access_effect`, set by `billing_apply_refund` / `billing_remove_payment_window`):

| raw | label | tone | hint (shown as a muted second line) |
|---|---|---|---|
| window_removed | Access removed | red | The paid time this payment bought was taken off |
| none_not_a_charge | No change | slate | Not a plan charge, for example the AutoPay setup check |
| none_partial | No change | slate | Partial refund |
| none_not_granted | No change | slate | This payment never granted access |
| unchanged_later_grant | No change | slate | A later payment covers this period |
| unchanged | No change | slate | The access end date did not need to move |
| already_removed | Already removed | slate | Removed by an earlier refund or dispute |
| null | Not applied yet | slate | Recorded when the refund is processed |

**dispute** (`billing_disputes.status`): open Open red; under_review Under review amber; won Won green; lost Lost red; closed Closed slate.
Dispute phase: chargeback Chargeback; pre_arbitration Pre-arbitration; arbitration Arbitration; retrieval Retrieval request; fraud Fraud; anything else sentenceCase. Reason code: sentenceCase.

**webhook** (`billing_webhook_events.status`): received Received blue; processing Processing blue; processed Processed green; ignored Ignored slate; failed Failed amber (hint: will be retried automatically); dead Dead red (hint: automatic retries exhausted). Filter-only `retryable`: "Failed or dead".

**reconciliation** (`billing_reconciliation_runs.status`): running Running blue; succeeded Succeeded green; failed Failed red.
Trigger (`runTriggerLabel`): `triggeredByName` if present; else `triggeredBy` set: "Unknown user"; scope `cron`: "Scheduled run"; scope `admin`: "A super admin"; other: sentenceCase(scope).

**manual** (`payment_requests.status`): pending Pending review amber; approved Approved green; rejected Rejected red.

**workspace** (`SubscriberRow.liveStatus`, also used for `storedStatus` and the Activity from/to columns): trialing Trialing blue; active Active green; expired Expired red; none Ungated slate (hint: never gated, internal or demo).

**method** (`METHOD_LABEL`): card Card; upi UPI; emandate eMandate; nach NACH; netbanking Netbanking; wallet Wallet; unknown Not known yet.

**event source** (`subscription_events.source` CHECK + the events route's derived `payment|manual`): customer Customer; admin Super admin; razorpay_webhook Razorpay webhook; reconciliation Reconciliation; checkout Checkout; system System; payment Paid; manual Manual.

**cancelled_by**: customer "the customer"; admin "a super admin"; provider "Razorpay"; system "the system".

**billing events** (`SubscriptionEventType`, 25 values): trial_started Trial started; trial_extended Trial extended; payment_submitted Payment submitted; payment_approved Payment approved; payment_rejected Payment rejected; subscription_activated Subscription activated; subscription_extended Subscription extended; subscription_revoked Access removed (it is written by Block, by set-status expired and by `billing_remove_payment_window`, so "Access blocked" was wrong for refunds); subscription_expired Expired; autopay_checkout_created AutoPay checkout started; autopay_authenticated AutoPay authorised; autopay_activated AutoPay active; payment_succeeded AutoPay payment succeeded; payment_failed AutoPay payment failed; autopay_pending AutoPay payment pending; autopay_halted AutoPay halted; autopay_paused AutoPay paused; autopay_resumed AutoPay resumed; autopay_cancelled AutoPay cancelled; autopay_completed AutoPay completed; refund_processed Refund processed; dispute_opened Dispute opened; dispute_closed Dispute closed; billing_anomaly Billing anomaly; billing_admin_action Admin billing action.

## (e) Per-panel field cleanup

General, every list: shared `StatusPill domain=...`; dates through `formatIst` (IST, `{ time: true }` where a time matters); test rows keep the amber `ModeBadge` pill and `bg-amber-50/20` tint; keep every "Open in Razorpay" link (`RazorpayLink`); remove per-panel count badges that repeat the pagination footer total; toolbar, empty state and footer from (f).

1. **AutoPay mandates** (`razorpay-subscriptions-panel.tsx`): header "Plan · cycle" becomes "Plan" (plan name, cycle label below); the amount moves out of the cycle line into its own right-aligned "Amount" column; anomaly line gets `title={r.anomaly}`; status filter `live` option relabelled "Not ended yet"; method options from `METHOD_LABEL`; status options from `statusOptions('subscription', BILLING_SUBSCRIPTION_STATUSES)`. Columns: Workspace, Plan, Amount, Status, Method, Next charge, Cycle ends, Razorpay id (CopyId + Open in Razorpay, or "Not created at Razorpay"), Details. Accept a `className` for the frame height constant.
2. **AutoPay drawer** (`razorpay-subscription-drawer.tsx`): StatusPill domains (`subscription`, `invoice`, `payment`, `webhook`); event timeline label from `billingEventLabel`, from/to via `statusMeta('subscription', x).label` ("Authorised to Active", not "authenticated to active"), source via `eventSourceLabel` ("Razorpay webhook", not "source: razorpay webhook"); "Cancel requested … by" via `cancelledByLabel`; cancel-blocked sentence uses the label lowercased; Payments mini-table drops the "No invoice" line (charge type "AutoPay setup check" already says it), keeps payment id, Open in Razorpay and the invoice CopyId when present. No change to Sync/Cancel logic or copy.
3. **Workspaces** (`subscribers-panel.tsx`, table and toolbar only; dialog logic untouched): remove the "N subscribers" pill; status via `StatusPill domain="workspace"`; add a "Blocked" badge when `row.isBlocked` (the field is counted in the tiles and filter but was never shown on the row); "in grace period" becomes "In grace period"; drift text becomes "Stored as <label>" with `title="The stored status has not caught up with the dates. The live status is shown."`; AutoPay cell becomes two lines: pill (+ Test badge), then "<method> · next charge <date>" or "<method> · not charging"; Ends uses `formatIst`; queued window text "Paid plan queued from <date>" / "<n>-day trial queued"; `PhoneDisplay emptyPlaceholder="No phone on file"`; hand-rolled footer replaced by `ListPagination` (client-side paging kept); `formatDate` delegates to `formatIst` so the dialog dates are IST too; dialog `DialogDescription` uses the status label; em dashes in visible dialog strings become commas or full stops.
4. **Transactions** (`razorpay-transactions-panel.tsx`): main row columns Workspace, Payment (CopyId `pay_` + Open in Razorpay), Charge (`PaymentChargeCell`: charge type, then plan · cycle), Status (pill only), Amount (+ "₹x refunded" when above zero), Method, Error (code: reason, description clamped to 2 lines with `title`), Created (IST date and time), and a details toggle. Removed from the row: invoice id and "No invoice", "for sub_…", the kind line ("Recurring charge" repeated the charge type), "Covers …", the Fee / tax column, card issuer/type, error source/step, "Captured …", the "Refund partial/full" line. These move to an expandable details row (toggle button with `aria-expanded`, `aria-controls`, `aria-label="Show details for <pay_id>"`), a `<dl>` grid: Invoice (CopyId, or "Not issued (AutoPay setup check)" for `card_verification`, else "Not issued"), AutoPay (CopyId of `providerSubscriptionId` plus an "Open AutoPay" button when `subscriptionId` and `onOpenSubscription` exist), Period covered (`adminPaymentPeriodText` or "Not applied yet"), Kind (`paymentKindLabel`), Fee / tax, Card (issuer · type, card payments only), Error source (source at step, sentence case), Captured (IST), Access applied (IST or "Not applied"). New optional prop `onOpenSubscription?: (billingSubscriptionId: string) => void`. All payment-details fields stay on this screen (one click away), which keeps the earlier approved payment-details work intact.
5. **Invoices** (`razorpay-invoices-panel.tsx`): Amount shows the amount and a "Due ₹x" line only when due is above zero (the "Paid ₹x" line repeated amount plus the Paid pill); tax moves to `title`; "Issued / paid" splits into "Issued" and "Paid" columns ("Paid" shows paid date, "Expired <date>" or "Not paid"); add an "Open AutoPay" ghost button column when `subscriptionId` exists (same optional `onOpenSubscription` prop).
6. **Refunds & disputes** (`razorpay-refunds-disputes-panel.tsx`): Access column uses `accessEffectMeta` (label plus muted hint line; "none not a charge" becomes "No change / Not a plan charge, for example the AutoPay setup check"); Speed uses `refundSpeedLabel`; "Created / processed" splits into "Created" and "Processed" ("Not processed yet"); dispute phase via `disputePhaseLabel`, reason via `disputeReasonLabel`; the `Respond by` urgency logic stays exactly as is. Top toolbar becomes `FilterToolbar` (search left, Mode right, Reset); each table toolbar keeps its heading left and status (and dispute sort) right, with its own Reset when dirty.
7. **Webhooks** (`razorpay-webhooks-panel.tsx`, `RazorpayWebhookEventsPanel`): visible "Webhook events" heading leaves the toolbar (the segmented control names the view; keep `aria-label` on the section); `FilterToolbar` with search left and Mode, Event status, "Anomalies only" checkbox right, Reset back to `mode all / status retryable / anomaly off / search empty`; Re-queued becomes "Never" or "<n> time(s)" plus one muted line "Last <IST time> by <name>"; Retry logic, confirm copy and `modeBlock` unchanged.
8. **Reconciliation** (`RazorpayReconciliationPanel`): toolbar with Mode filter and the "Run reconciliation now" button on the right, the blocked sentence below; Triggered by via `runTriggerLabel`; status domain `reconciliation`; table unchanged otherwise.
9. **Activity log** (`activity-panel.tsx`): toolbar to `FilterToolbar` (search left; Source and Type right; Reset); table header cells use the shared `Th`; event label from `billingEventLabel`; from/to status via `accountStatusLabel` (no more raw `capitalize` text); End date via `formatIst`; When shows `formatIst(createdAt, { time: true })` with the relative time as `title`; Paid/Manual tag as a toned badge; footer becomes `ListPagination` using `counts.total` and `totalPages` from the route with selectable page size (route caps at 100, `MAX_PAGE_SIZE`); `TableStateRow` for loading, error and empty; wrap in `ListFrame`.
10. **Manual UPI** (new `manual-payments-panel.tsx`, moved out of `page.tsx`): status tiles show label and count once (the duplicate pill inside each tile goes) and become buttons with `aria-pressed` that set the status filter; remove the "N requests" pill; Expected and Paid merge into one "Amount" column showing the paid amount, and only on a mismatch a red line "Expected ₹x, short by ₹y" / "over by ₹y" (the mismatch must stay visible in the row); Submitted shows `formatIst(created_at, { time: true })` with relative time as `title`; add a last "Action" column with a "Review" (pending) or "View" (reviewed) button so the drawer is keyboard reachable (rows stay clickable); load errors show the server's own text via `errorMessage(res.status, body)`; `ListPagination`, `ListFrame`, `FilterToolbar` (search left; Status and Sort right; Reset to `all / newest / empty`). Keep the first-load auto-switch to Pending, the intake notice and the count callbacks.
11. **Manual payment drawer** (`payment-request-drawer.tsx`): replace the hand-rolled `fixed` overlay (`z-[100]`/`z-[110]`, no focus trap, unlabeled close button) with `Sheet`/`SheetContent side="right" showCloseButton={false}` and `SheetTitle`, mirroring `razorpay-subscription-drawer.tsx`; close button gets `aria-label="Close payment request"`; dates via `formatIst`; status pill `domain="manual"`; "Workspace status" uses `accountStatusLabel`; em dashes in visible strings replaced. Approve/Reject logic, preview arithmetic, request bodies and the read-only footer stay byte-for-byte the same.
12. **Overview**: see (g).

## (f) Shared components (extend `razorpay-shared.tsx`, reuse what exists)

Reused as they are: `SearchBox`, `FilterSelect`, `Th`, `CopyId`, `RazorpayLink`, `formatIst`, `formatMinor`, `methodText`, `useAdminJson`, `useAdminList`, `useDebounced`, `postJson`, `errorMessage`.

Changed or added in `src/components/super-admin/billing/razorpay-shared.tsx`:

- `StatusPill({ domain, status, className? })`: `domain` is required; renders `Badge variant="outline"` (`src/components/ui/badge.tsx`) with `TONE_BADGE_CLASS[meta.tone]`, `text-[10px] font-semibold`, and `title={meta.hint}`. `statusLabel`, `STATUS_TONE`, `STATUS_LABEL` are deleted.
- `ModeBadge`: same API, rendered with `Badge variant="outline"`, same amber/slate classes and title.
- `methodText` fallback uses `methodLabel`.
- `usePagedFilters` returns also `dirty: boolean` (filters differ from the initial object) and `reset(): void` (initial filters, page 1).
- `FilterToolbar({ search?, filters?, actions?, heading?, active, onReset })`: one row on `lg+`: heading and search on the left (`w-full lg:w-[280px]`), filters on the right (`flex flex-wrap items-center gap-2 lg:justify-end`), then a `Button variant="ghost" size="sm"` with `RotateCcw` "Reset filters" only when `active`, then `actions`. Stacks on small screens.
- `ListFrame`: toolbar slot uses `lg:` instead of `xl:` breakpoints; export `LIST_HEIGHT = 'h-[calc(100vh-17rem)] min-h-[420px]'` for the tall lists (accounts for the new secondary bar).
- `EmptyState({ icon?, title, hint?, action?, className? })`: centred, `Inbox` icon default, `text-xs` title, `text-[11px]` hint.
- `TableStateRow` keeps its props and adds `emptyHint?: string` and `onReset?: () => void`; the empty case renders `EmptyState` with a "Reset filters" action when `onReset` is passed. Error and loading branches unchanged (error keeps `role="alert"` and the server text).
- `ListPagination`: unchanged API; used by every list including Manual UPI, Workspaces and Activity (their three hand-rolled footers are deleted).
- `type RazorpayServerMode = RazorpayMode | null | undefined` (undefined = still loading, null = not configured) and `interface RazorpayOverviewResponse` (moved from the overview panel so the page can type its fetch).
- `RazorpayNotConfiguredNotice({ onOpenManual })`: amber `role="note"` box: "Razorpay is not set up on this server. These lists show billing records already stored in the shared database, for reference. Sync now, Cancel AutoPay, Retry and Run reconciliation are unavailable here. Manual UPI payments are reviewed in the Manual UPI section." plus a small "Open Manual UPI" button.

## (g) Overview grouping and not-configured behaviour

`razorpay-overview-panel.tsx` becomes a presentational panel. New props:

```ts
{
  overview: { data: RazorpayOverviewResponse | null; loading: boolean; error: string | null };
  manualCounts: { pending: number; approved: number; rejected: number } | null;
  manualIntake: ManualIntake | null;
  onRefresh: () => void;               // page reloads the overview and the manual counts
  onNavigate: (target: PaymentsTarget) => void;
}
```

Layout, top to bottom:

1. Header row: the existing mode banner (configured: "This server is set up for Razorpay <mode> mode…"; not configured: "Razorpay is not set up on this server. Manual UPI is the payment method in use here. AutoPay and health figures below come from records already stored and are for reference; Sync now, Cancel AutoPay, Retry and Run reconciliation are unavailable."), then on the right `PaymentsGuideButton` ("User Guide", outline) and the Refresh button. Error alert under it (server text).
2. Card "Manual UPI" (`Card size="sm"`, `CardHeader`/`CardTitle`/`CardDescription`/`CardAction`): description is the intake sentence (open: "Customers pay by UPI QR and submit a UTR. Each request is approved or rejected here."; partial/retired: the existing `MANUAL_INTAKE_NOTICE` text). Tiles: Pending review (amber when above zero, with "Review now" link to `manual`), Approved, Rejected. `CardAction`: "Open Manual UPI". Shows "…" while counts are null. This replaces the lone "Manual payments pending" tile.
3. Card "AutoPay": per mode, live first, a sub-heading with `ModeBadge` and "Live mode" / "Test mode (no real money)" (test block keeps the amber tint), then tiles: Trialing with AutoPay, Active, Authorised, Payment pending, Halted, Cancelled, Completed, Charges due in 7 days, Failed payments in 7 days (when above zero, a "View transactions" link to `payments/transactions`). `CardAction`: "Open AutoPay mandates" (`subscriptions/autopay`). No modes: `EmptyState` "No AutoPay recorded yet." with hint "Razorpay is not set up on this server." when `configured` is false.
4. Card "System health": per mode, two cells side by side (`lg:grid-cols-2`): Webhooks (last received, failed, dead, anomalies in 7 days; "Review failed events" link to `activity/webhooks` when failed or dead are above zero) and Last reconciliation run (status pill, started, triggered by via `runTriggerLabel`-equivalent text, checked / changed, errors, took; "Open reconciliation" link to `activity/reconciliation`). `CardAction`: "Open Activity & health". No data: `EmptyState` "No webhook events or reconciliation runs recorded yet."

Quick links to the other sections are the `CardAction` buttons and the inline links above; the primary tab bar sits directly above as well.

Not configured (production today): Overview still shows the Manual UPI card with live counts (separate `payment-requests` fetch), and the AutoPay/System health cards show stored rows or the empty states, never an error. In Subscriptions › AutoPay mandates, all three Payments views, Activity & health › Webhooks and › Reconciliation, the page renders `RazorpayNotConfiguredNotice` above the panel when `overview.data?.configured === false`. Lists still load (list routes read the DB and do not depend on Razorpay config, see `transactions/route.ts`), and every Razorpay action is already disabled with a reason (`modeBlock`, drawer `unreachableReason`). Workspaces, Activity log and Manual UPI never show the notice because they do not depend on Razorpay.

## (h) Guide data file and component

### Schema: `src/components/super-admin/billing/payments-guide-content.ts` (pure, typed)

```ts
import { LEGACY_TAB_MAP, type LegacyTab, type PaymentsSection, type PaymentsView } from './payments-nav';

export interface GuideTerm { term: string; meaning: string }
export interface GuideAction { name: string; what: string; when?: string; caution?: string }
export interface GuideModule {
  id: LegacyTab;                       // one per original tab
  title: string;                       // original tab name
  location: { section: PaymentsSection; view: PaymentsView | null }; // MUST be LEGACY_TAB_MAP[id]
  summary: string;
  columns?: GuideTerm[];
  statuses?: GuideTerm[];
  actions?: GuideAction[];
  notes?: string[];
}
export interface GuideTopic { id: string; title: string; paragraphs: string[]; terms?: GuideTerm[] }
export interface GuideTask { id: string; title: string; steps: string[] }
export interface PaymentsGuide {
  title: string;
  intro: string[];
  topics: GuideTopic[];    // 'layout', 'modes', 'transition'
  modules: GuideModule[];  // exactly 9, in LEGACY_TAB_IDS order
  tasks: GuideTask[];
}
export const PAYMENTS_GUIDE: PaymentsGuide;
```

Location labels are never hand-written: the renderer calls `locationLabel(module.location)`.

### Renderer: `src/components/super-admin/billing/payments-guide.tsx` (`'use client'`)

- `PaymentsGuideBody()`: not portaled, so testable. "On this page" `nav aria-label="Guide contents"` listing topics, the 9 modules and the tasks as buttons; clicking one opens that accordion item (controlled `Accordion multiple value`) and scrolls it into view. Then: "Where everything lives" table (Original tab, Now in) generated from `modules`; topic blocks; `Accordion` (`src/components/ui/accordion.tsx`) with one item per module (summary, "Now in: <location>", Columns `dl`, Statuses `dl`, Actions list with caution lines, Notes); "Common tasks" accordion with ordered steps. Each item gets `id="guide-<id>"`.
- `PaymentsGuideSheet({ open, onOpenChange })`: `Sheet` + `SheetContent side="right" className="w-full gap-0 border-slate-200 bg-white p-0 text-slate-900 sm:max-w-2xl data-[side=right]:sm:max-w-2xl"`, header with `SheetTitle` "Payments & Subscriptions guide" and `SheetDescription`, scrolling body (`flex-1 overflow-y-auto px-5 py-4`) containing `PaymentsGuideBody`. Default close button kept (sr-only "Close").
- `PaymentsGuideButton()`: `Sheet` root holding state, `SheetTrigger render={<Button variant="outline" size="sm" />}` with `BookOpen` icon and text "User Guide" (Base UI renders `aria-haspopup="dialog"` and `aria-expanded` on the trigger, `DialogTrigger.js:79`).

### Outline (every factual claim with the code it comes from)

Topics:
1. **layout**: five sections and the old-to-new table (`payments-nav.ts` `LEGACY_TAB_MAP`); old links still open the right place (`resolvePaymentsLocation`).
2. **modes** (test vs live): both modes live in one shared database, every row carries its mode and test rows get an amber Test pill (`razorpay-shared.tsx` header comment, `ModeBadge`); test and live figures are never added together (`razorpay-overview-panel.tsx` header); Sync now, Cancel AutoPay and Retry work only on rows of the mode this server is set up for, other rows are for reference (overview banner text; drawer `canAct`/`unreachableReason`; webhooks `modeBlock`); when Razorpay is not set up, stored data is shown and those actions are unavailable (overview banner; `RazorpayNotConfiguredNotice`).
3. **transition** (manual UPI to AutoPay): which flow an account gets is decided per request on the server (`resolvePaymentProvider`, `provider.ts`); production has no Razorpay keys, so everyone pays by manual UPI (`provider.ts` header, `docs/billing-runbook.md` section 8); manual intake states: Open, Partial (accounts on AutoPay on this server can no longer pay by manual UPI, others still can), Retired (list is history) (`resolveManualIntake`; `MANUAL_INTAKE_NOTICE`); an account on Razorpay that tries manual UPI gets refused (`src/lib/billing/manual-retirement.ts`, 410 `manual_payments_retired`); reviewed requests are read-only and Approve/Reject only work on pending rows, which after cutover means rows pending at cutover (`payment-requests/route.ts` header; `payment-request-drawer.tsx` read-only footer); AutoPay checkout is refused while a manual request for the workspace is under review, so review pending requests promptly (`src/app/api/billing/razorpay/checkout/route.ts` `assertNoPendingManualPayment`); manual history is never deleted (phase 6 report section 3: "History is never retired").

Modules (title, then where it lives, then content):
1. **Overview** → Overview. Manual UPI card counts (`payment-requests` GET `counts`); AutoPay tiles and their meaning from `billing_admin_overview()` (`20261024000000_razorpay_billing_phase5.sql`): Trialing with AutoPay = authorised AutoPay on a workspace still in trial; Charges due in 7 days = authorised/active/payment-pending AutoPay with a charge in the next 7 days; Failed payments in 7 days = failed Razorpay payments created in the last 7 days; System health: last webhook received, failed, dead, anomalies in 7 days, last reconciliation run. Actions: Refresh, User Guide, card links.
2. **AutoPay subscriptions** → Subscriptions › AutoPay mandates. Columns (e1). Statuses: subscription table in (d). Filters: Mode, Status (incl. Not ended yet), Method, Sort; search by workspace or `sub_`, `plan_`, `cust_` id. Actions: Details opens the drawer (summary, invoices, payments, event timeline, webhook events); **Sync now** re-reads the subscription and recent invoices from Razorpay and applies anything missed, never changes what is charged, audited, 30 per 10 minutes (`subscriptions/[id]/sync/route.ts`, drawer "Read-only" box); **Cancel AutoPay** stops the mandate at Razorpay immediately and cannot be undone, paid access already granted is not changed, the customer is emailed, needs a reason (5 to 500 characters), your password, your authenticator code when 2FA is on and a confirmation tick, 5 per 15 minutes, allowed for Awaiting authorisation, Authorised, Active, Payment pending, Halted, Paused (`cancel/route.ts`; `CancelForm`; `ADMIN_CANCELLABLE`); **Open in Razorpay** opens the Dashboard page in a new tab (`dashboardUrl`); both actions are disabled with the reason shown when this server cannot reach the row's mode.
3. **Transactions** → Payments › Transactions. Columns (e4), charge types First payment, Renewal, AutoPay setup check (`chargeTypeLabel`, rule in `chargeTypeFor`); the ₹5 setup check is refunded automatically by Razorpay and is not a plan payment (runbook section 4; `service.ts` checkout copy); statuses Created, Authorised, Captured, Refunded, Failed; the Error column shows Razorpay's own code, reason and description so you can tell a customer-side decline from a Razorpay error (transactions panel header); details row contents; Open AutoPay.
4. **Invoices** → Payments › Invoices. Columns (e5), statuses from (d), Open invoice uses Razorpay's invoice link (`shortUrl`), search by `inv_`, `sub_`, `pay_`.
5. **Refunds & disputes** → Payments › Refunds & disputes. Refunds are made only in the Razorpay Dashboard and recorded here from webhooks or reconciliation (runbook intro and section 4); Access column meanings from the access-effect table; a full refund of a plan charge removes the paid time that payment bought, a partial refund changes nothing (`billing_apply_refund`, phase 3 migration); a refund does not cancel AutoPay by itself, so cancel it in the drawer if the customer should not be charged again (`events.ts` cancels only for a lost dispute); disputes: statuses, respond in the Razorpay Dashboard before Respond by, rows due within 3 days are highlighted with "Due in N days", "Due today" or "Deadline passed" (`daysToRespond`); a lost dispute removes the paid time and stops AutoPay, a won dispute changes nothing (`events.ts` D4 block, phase 3 migration line ~822, runbook section 5).
6. **Webhooks & reconciliation** → Activity & health › Webhooks and › Reconciliation. Webhook statuses; list opens on "Failed or dead"; **Retry** (re-queue) works only on failed or dead events, resets attempts, keeps the last error, records who did it, processed again within about a minute, 30 per 10 minutes (`retry/route.ts`; confirm copy in `RazorpayWebhookEventsPanel`); Anomalies only filter; **Run reconciliation now** asks Razorpay for the current state of every AutoPay in this server's mode and applies changes it missed, does not charge or cancel anything, 3 runs per 10 minutes, audited (`reconcile/route.ts`; confirm copy); the scheduled run happens every 5 minutes (runbook section 6); run columns Started, Mode, Triggered by, Status, Checked, Changed, Errors, Took.
7. **Subscribers** → Subscriptions › Workspaces. Live status is computed from the dates, the stored status can lag ("Stored as …") (`subscribers-panel.tsx` header); columns (e3); AutoPay column shows "Unknown" when the lookup failed, never "None" (`AutopayCell`); **Manage** dialog: Give access (paid months or days with optional plan name, or trial days; time is added to the end of any remaining window), End access (Let it expire now for trial, paid or both; Block immediately sets a blocked flag), Change end date (paid or trial), Advanced: set status directly (for never-gated internal or demo workspaces), Recent billing history, note kept on the audit trail; manual changes do not move Razorpay's charge date and ending access does not cancel AutoPay; the amber warning links to the AutoPay (`autopay-warning.tsx`).
8. **Activity** → Activity & health › Activity log. Every billing event with what happened, Paid or Manual, workspace, time given, end date change, status change, amount, done by (System when nobody triggered it) and when (`activity-panel.tsx`; source derived in `src/app/api/super-admin/billing/events/route.ts`); filters and search; event labels from (d).
9. **Manual payments** → Manual UPI. Tiles and filters; queue switches to Pending on first load when something is waiting; columns (e10) with the amount mismatch flagged in the row; the drawer compares plan price with what the customer paid and warns on under or over payment; **Approve** shows the exact window before you confirm, extends from the current end date when time is left, optional months or days override, optional internal note, emails the customer; **Reject** needs a reason the customer sees, they can resubmit; two admins cannot approve the same request twice (`payment-requests/route.ts` header, conditional claim); reviewed rows are read-only.

Common tasks (`tasks`):
- `failed-payment`: Overview "Failed payments in 7 days" or Payments › Transactions with Status = Failed; read the Error column; Open in Razorpay for the full record; open the details row and Open AutoPay, then Sync now (read-only) to pull the latest state; Payment pending means Razorpay is retrying, Halted means it stopped.
- `dispute`: Payments › Refunds & disputes, sort disputes by "Respond by, soonest"; respond in the Razorpay Dashboard before the deadline; after a lost dispute check the workspace end date in Subscriptions › Workspaces.
- `webhooks-failing`: Overview System health (failed, dead, last received); Activity & health › Webhooks (opens on Failed or dead); read the last error and fix the cause first; Retry; if Razorpay disabled the webhook after 24 hours of failures, re-enable it in the Dashboard, replay events up to 7 days old, then Run reconciliation now; access is not lost meanwhile because the scheduled reconciliation grants paid time from Razorpay's records (runbook sections 1 and 2).
- `review-manual`: Manual UPI, open a Pending review row, match UTR and amount against the bank statement, Approve or Reject with a reason.
- `adjust-access`: Subscriptions › Workspaces, Manage; read the AutoPay warning before changing access on a workspace with AutoPay.
- `confirm-refund`: after refunding in the Razorpay Dashboard, check Payments › Refunds & disputes for the row and its Access result, then the workspace end date in Workspaces (runbook section 4).

Found while planning (report it, do not change behaviour): `docs/billing-runbook.md` section 4 says a full refund "cancels AutoPay", but the code only cancels AutoPay after a lost dispute (`src/lib/billing/razorpay/events.ts`, the D4 block; refund handling calls `applyRefund` only). The guide states the code behaviour; the runbook sentence is left as is and flagged in the report.

## (i) Tests

Update:
- `src/components/super-admin/billing/autopay-warning.test.tsx`: the link test now expects `href="?tab=subscriptions&amp;view=autopay&amp;sub=11111111-2222-4333-8444-555555555555"`. The `(authorised, test mode)` assertion must still pass (label lowercased from `statusMeta`).

No other existing test imports the page or these panels (checked: only `autopay-warning.test.tsx` lives under `src/components/super-admin`, none under `src/app/(super-admin)`).

Add:
- `src/components/super-admin/billing/payments-nav.test.ts`: no params gives overview; each of the 9 legacy ids maps per table (b) (`it.each` over `LEGACY_TAB_IDS`, compared with `LEGACY_TAB_MAP` and with literal expectations); new section ids with valid views; invalid view and a view from another section fall back to the default; legacy-only ids ignore `view`; overview and manual drop `view`; unknown tab gives overview; `sub` valid without tab gives subscriptions/autopay; `tab=subscriptions&sub=X` and `tab=subscribers&sub=X` and `tab=payments&view=invoices&sub=X` keep the sub; invalid and uppercase UUIDs; `paymentsSearchParams` preserves unrelated params, writes tab/view/sub last, drops view for overview/manual, drops sub when null; `paymentsHref`; `canonicalPaymentsQuery` (legacy rewritten, canonical returns null, bare returns null, missing view added, invalid sub removed); `locationLabel`; `manualSectionLabel` for null/open/partial/retired; `PAYMENTS_SECTIONS` ids unique and every `DEFAULT_VIEW` is one of its section's views.
- `src/components/super-admin/billing/billing-labels.test.ts`: every status in `SUBSCRIPTION_LIST_SPEC`, `PAYMENT_LIST_SPEC`, `INVOICE_LIST_SPEC`, `REFUND_LIST_SPEC`, `DISPUTE_LIST_SPEC`, `WEBHOOK_EVENT_LIST_SPEC`, `RECONCILIATION_RUN_LIST_SPEC` (import from `@/lib/billing/razorpay/admin-db`; safe in node, `supabaseAdmin` is lazy), minus the filter-only `live` and `retryable`, has an explicit entry in its domain, a label with no underscore that starts with a capital; each `PAYMENT_LIST_SPEC.kinds` value has a `paymentKindLabel`; spot checks (authenticated "Authorised", subscription pending "Payment pending", authorized "Authorised", partially_paid "Partly paid", under_review "Under review", manual pending "Pending review", workspace none "Ungated"); all 7 access effects plus null, `none_not_a_charge` gives "No change"; fallback for an unknown value is sentence case and slate; every `Tone` has a class; `refundSpeedLabel`, `disputePhaseLabel`, `methodLabel`, `eventSourceLabel`, `cancelledByLabel`, `runTriggerLabel` cases; every `SubscriptionEventType` (list the 25 literally) has a `BILLING_EVENT_LABEL`.
- `src/components/super-admin/billing/payments-guide.test.tsx`: `PAYMENTS_GUIDE.modules` ids equal `LEGACY_TAB_IDS` in order and each `location` equals `LEGACY_TAB_MAP[id]`; the actions named in the brief exist (Sync now, Cancel AutoPay, Open in Razorpay under subscriptions; Retry and Run reconciliation now under webhooks; Approve and Reject under manual); tasks include `failed-payment`, `dispute`, `webhooks-failing`; no string anywhere in the guide contains `!` or `—` (walk the object); `renderToStaticMarkup(<PaymentsGuideBody />)` contains all 9 module titles and each `locationLabel` (HTML-escape `&` as `&amp;` in expectations) and the topics; `renderToStaticMarkup(<PaymentsGuideButton />)` renders a button with text "User Guide", `aria-haspopup="dialog"` and `aria-expanded="false"` (the trigger that opens the sheet).

Expected count after: 211 test files (208 baseline + 3), all green.

## (j) Files to touch (exhaustive)

New:
1. `src/components/super-admin/billing/payments-nav.ts`
2. `src/components/super-admin/billing/payments-nav.test.ts`
3. `src/components/super-admin/billing/billing-labels.ts`
4. `src/components/super-admin/billing/billing-labels.test.ts`
5. `src/components/super-admin/billing/manual-payments-panel.tsx`
6. `src/components/super-admin/billing/payments-guide-content.ts`
7. `src/components/super-admin/billing/payments-guide.tsx`
8. `src/components/super-admin/billing/payments-guide.test.tsx`
9. `docs/razopay/payments-page-redesign-report.md`

Modified:
10. `src/app/(super-admin)/super-admin/payments/page.tsx`
11. `src/components/super-admin/billing/razorpay-shared.tsx`
12. `src/components/super-admin/billing/razorpay-overview-panel.tsx`
13. `src/components/super-admin/billing/razorpay-subscriptions-panel.tsx`
14. `src/components/super-admin/billing/razorpay-subscription-drawer.tsx`
15. `src/components/super-admin/billing/razorpay-transactions-panel.tsx`
16. `src/components/super-admin/billing/razorpay-invoices-panel.tsx`
17. `src/components/super-admin/billing/razorpay-refunds-disputes-panel.tsx`
18. `src/components/super-admin/billing/razorpay-webhooks-panel.tsx`
19. `src/components/super-admin/billing/subscribers-panel.tsx`
20. `src/components/super-admin/billing/activity-panel.tsx`
21. `src/components/super-admin/billing/payment-request-drawer.tsx`
22. `src/components/super-admin/billing/autopay-warning.tsx`
23. `src/components/super-admin/billing/autopay-warning.test.tsx`
24. `src/components/super-admin/header.tsx` (payments subtitle only: "Manual UPI review, Razorpay AutoPay, payments and billing health")
25. `docs/razopay/README.md` (one table row)
26. `docs/billing-runbook.md` (screen names only: "Webhooks & reconciliation -> Run reconciliation now" becomes "Activity & health -> Reconciliation -> Run reconciliation now" (lines 23 and 73); "Webhooks & reconciliation, open a failed or dead event" becomes "Activity & health -> Webhooks, find a failed or dead event" (line 30); "Payments -> Overview" stays (line 47); "Refunds & disputes" becomes "Payments -> Refunds & disputes" (lines 55, 60); "Subscribers" becomes "Subscriptions -> Workspaces" (line 55). No other runbook edits.)

Workflow files under `.agents/tasks/payments-redesign/` may also be written. **No other file may be modified**: no API routes, nothing in `src/lib`, `src/types`, `supabase/`, `src/components/ui/*`, other super-admin pages, `package.json`, configs, or the two pre-existing sitemap changes.

## (k) Verification commands (from the brief)

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS"           # expect no output (0 errors)
npx vitest run                                             # all green; 211 files (baseline 208 files / 2,665 tests)
npx eslint <every touched .ts/.tsx path from (j)>          # 0 errors
npx prettier --write <every touched path from (j)>         # then note any file Prettier reformatted beyond your edits
$env:NEXT_DIST_DIR=".next-verify3"; npm run build          # must compile; route table lists /super-admin/payments
git checkout -- tsconfig.json
Remove-Item -Recurse -Force .next-verify3
git status --short                                          # only files from (j) plus the 2 pre-existing sitemap files
```

Never run `next build` without `NEXT_DIST_DIR` (a live dev server shares `.next`). Do not start a second `next dev`. Delete any `scratch/` files you created.

---

# Implementation Plan

- [ ] 1. Create the pure navigation module and its tests.
      Implement every export in (c) with the rules in (b): `PAYMENTS_SECTIONS` (order Overview, Manual UPI, Subscriptions, Payments, Activity & health), `DEFAULT_VIEW`, `LEGACY_TAB_IDS`, `LEGACY_TAB_MAP`, UUID check, resolver, builder (delete then append `tab`, `view`, `sub`), `paymentsHref`, `canonicalPaymentsQuery`, `locationLabel` (separator " › "), `manualSectionLabel`. Write the test file from (i).
      Files: `src/components/super-admin/billing/payments-nav.ts`, `src/components/super-admin/billing/payments-nav.test.ts`
      Verify: `npx vitest run src/components/super-admin/billing/payments-nav.test.ts` passes; `npx tsc --noEmit 2>&1 | Select-String "error TS"` prints nothing.

- [ ] 2. Create the shared label module and its tests.
      Implement every export and every row of the tables in (d). `sentenceCase` replaces `_` with spaces and capitalises the first letter only. Write the test file from (i).
      Files: `src/components/super-admin/billing/billing-labels.ts`, `src/components/super-admin/billing/billing-labels.test.ts`
      Verify: `npx vitest run src/components/super-admin/billing/billing-labels.test.ts` passes; typecheck clean.

- [ ] 3. Extend the shared building blocks and switch every status badge to the shared mapping (mechanical, no layout changes yet). Depends on 1 and 2.
      In `razorpay-shared.tsx` apply all of (f): `StatusPill` with required `domain` (Badge based), `ModeBadge` on Badge, delete `statusLabel`/`STATUS_TONE`/`STATUS_LABEL`, `methodText` fallback, `usePagedFilters` `dirty`/`reset`, `FilterToolbar`, `EmptyState`, `TableStateRow` `emptyHint`/`onReset`, `ListFrame` `lg:` breakpoints and `LIST_HEIGHT`, `RazorpayServerMode`, `RazorpayOverviewResponse`, `RazorpayNotConfiguredNotice`. Then add the `domain` prop at every existing `StatusPill` call site (overview: `reconciliation`; subscriptions panel: `subscription`; transactions: `payment`; invoices: `invoice`; refunds: `refund`; disputes: `dispute`; webhooks: `webhook`; runs: `reconciliation`; drawer: `subscription`/`invoice`/`payment`/`webhook`; subscribers `AutopayCell`: `subscription`), replace `statusLabel(...)` in `razorpay-subscriptions-panel.tsx` with `statusOptions(...)` and in `autopay-warning.tsx` with `statusMeta('subscription', status).label.toLowerCase()`, and switch `autopay-warning.tsx` `href` to `paymentsHref({ section: 'subscriptions', view: 'autopay', sub: autopay.id })`; update the link assertion in `autopay-warning.test.tsx` per (i).
      Files: `razorpay-shared.tsx`, `razorpay-overview-panel.tsx`, `razorpay-subscriptions-panel.tsx`, `razorpay-transactions-panel.tsx`, `razorpay-invoices-panel.tsx`, `razorpay-refunds-disputes-panel.tsx`, `razorpay-webhooks-panel.tsx`, `razorpay-subscription-drawer.tsx`, `subscribers-panel.tsx`, `autopay-warning.tsx`, `autopay-warning.test.tsx` (all in `src/components/super-admin/billing/`)
      Verify: typecheck clean; `npx vitest run src/components/super-admin` passes (autopay-warning green with the new href).

- [ ] 4. Move the manual queue out of the page and clean it up; convert its drawer to a Sheet. Depends on 3.
      Create `ManualPaymentsPanel` with everything from `PaymentRequestsPanel`, `StatusTile`, `MANUAL_INTAKE_NOTICE` and `readManualIntake` (exported), props `{ onCountsChange(counts), manualIntake, onManualIntakeChange }`, applying (e10). Apply (e11) to `payment-request-drawer.tsx`. In `page.tsx` only swap the inline panel for the import and track full counts `{ pending, approved, rejected }` instead of `pendingCount` (old tab bar still in place, so the page keeps working).
      Files: `src/components/super-admin/billing/manual-payments-panel.tsx`, `src/components/super-admin/billing/payment-request-drawer.tsx`, `src/app/(super-admin)/super-admin/payments/page.tsx`
      Verify: typecheck clean; `npx eslint` on the three files; `npx vitest run` green.

- [ ] 5. Restructure the page: five sections, sub-view segmented control, URL helper, page-level overview fetch, drawer on any section, not-configured notice, Overview regroup, and the webhooks/reconciliation split. Depends on 1, 3, 4.
      `page.tsx`: keep `Suspense` and `replaceSearchParams`; `loc = resolvePaymentsLocation(searchParams)`; `go(target)` = `replaceSearchParams(paymentsSearchParams(target, searchParams.toString()))`; an effect applies `canonicalPaymentsQuery` once per change; `useAdminJson<RazorpayOverviewResponse>('/api/super-admin/billing/razorpay/overview')` at page level, `serverMode` derived (undefined while loading, null when not configured); manual counts fetch gets a reload nonce used by Overview Refresh; primary `Tabs`/`TabsList variant="line"`/`TabsTrigger` per (a) with green active underline (`after:bg-[#25D366]`, `data-active:text-slate-900`), icons `hidden xl:inline-block`, Manual UPI label from `manualSectionLabel` plus an amber count pill with sr-only " pending"; a local `SectionViews` component renders the nested `Tabs variant="default"` for subscriptions/payments/activity; `TabsContent` per section/view mounting: Overview panel; `ManualPaymentsPanel`; `RazorpaySubscriptionsPanel` / `SubscribersPanel onOpenAutopay={(id) => go({ section: 'subscriptions', view: 'autopay', sub: id })}`; Transactions / Invoices / Refunds; `ActivityPanel` / `RazorpayWebhookEventsPanel serverMode` / `RazorpayReconciliationPanel serverMode`; `RazorpayNotConfiguredNotice` per (g); page-level `RazorpaySubscriptionDrawer` when `loc.sub` (close: `go({ section, view, sub: null })`, `onChanged` bumps `subsReloadKey`). Replace the old file-header comment with one describing the new layout and URL rules. Remove `TABS`, `TabButton`, `resolveTab`, `UUID_RE`, `STATUS_STYLE` from the page.
      `razorpay-webhooks-panel.tsx`: export `RazorpayWebhookEventsPanel({ serverMode })` and `RazorpayReconciliationPanel({ serverMode })` (owns its `runsKey`), delete `RazorpayWebhooksPanel` and its overview fetch.
      `razorpay-overview-panel.tsx`: new props and layout per (g), using `Card` parts from `src/components/ui/card.tsx`; leave a slot where `PaymentsGuideButton` goes (added in item 9).
      Files: `src/app/(super-admin)/super-admin/payments/page.tsx`, `src/components/super-admin/billing/razorpay-webhooks-panel.tsx`, `src/components/super-admin/billing/razorpay-overview-panel.tsx`
      Verify: typecheck clean; `npx vitest run` green; `npx eslint` on the three files; `$env:NEXT_DIST_DIR=".next-verify3"; npm run build` compiles, then `git checkout -- tsconfig.json` and delete `.next-verify3`.

- [ ] 6. Clean up the Payments views. Depends on 3 and 5.
      Apply (e4) to Transactions (expandable details row, `onOpenSubscription`), (e5) to Invoices, (e6) to Refunds & disputes, all with `FilterToolbar` + Reset (`active = search !== '' || dirty`), `LIST_HEIGHT`, and `TableStateRow` empty hints ("No payments yet. Razorpay payments appear here after a checkout, a charge or a reconciliation run." / filtered: "No payments match these filters." with Reset). In `page.tsx` pass `onOpenSubscription={(id) => go({ ...loc, sub: id })}` to Transactions and Invoices.
      Files: `razorpay-transactions-panel.tsx`, `razorpay-invoices-panel.tsx`, `razorpay-refunds-disputes-panel.tsx`, `src/app/(super-admin)/super-admin/payments/page.tsx`
      Verify: typecheck clean; `npx vitest run` green; `npx eslint` on the four files.

- [ ] 7. Clean up the Subscriptions views and the AutoPay drawer. Depends on 3 and 5.
      Apply (e1) to `razorpay-subscriptions-panel.tsx`, (e2) to `razorpay-subscription-drawer.tsx`, (e3) to `subscribers-panel.tsx` (table, toolbar, footer, IST dates, visible-copy em dashes; `ManageSubscriptionDialog` behaviour, request bodies and confirm labels unchanged).
      Files: `razorpay-subscriptions-panel.tsx`, `razorpay-subscription-drawer.tsx`, `subscribers-panel.tsx`
      Verify: typecheck clean; `npx vitest run src/components/super-admin` green (autopay-warning still passes); `npx eslint` on the three files.

- [ ] 8. Clean up the Activity & health views. Depends on 3 and 5.
      Apply (e7) and (e8) to `razorpay-webhooks-panel.tsx` and (e9) to `activity-panel.tsx` (pass `pageSize` to `/api/super-admin/billing/events`, which already accepts 5 to 100).
      Files: `razorpay-webhooks-panel.tsx`, `activity-panel.tsx`
      Verify: typecheck clean; `npx vitest run` green; `npx eslint` on both files.

- [ ] 9. Add the User Guide (data file, renderer, Overview button) and its tests. Depends on 1, 2, 5 to 8 (the guide describes the final UI; re-read each panel's final column names before writing the content).
      Write `PAYMENTS_GUIDE` per the schema and outline in (h), checking each claim against the referenced code; plain prose, no `!`, no em dashes. Build `PaymentsGuideBody`, `PaymentsGuideSheet`, `PaymentsGuideButton` per (h) and render `PaymentsGuideButton` in the Overview header row. Write `payments-guide.test.tsx` per (i).
      Files: `src/components/super-admin/billing/payments-guide-content.ts`, `src/components/super-admin/billing/payments-guide.tsx`, `src/components/super-admin/billing/payments-guide.test.tsx`, `src/components/super-admin/billing/razorpay-overview-panel.tsx`
      Verify: `npx vitest run src/components/super-admin/billing/payments-guide.test.tsx` passes; typecheck clean; `npx eslint` on the four files.

- [ ] 10. Header subtitle, runbook screen names, report and README row.
      `header.tsx`: payments subtitle per (j) item 24. `docs/billing-runbook.md`: only the screen-name edits listed in (j) item 26. Write `docs/razopay/payments-page-redesign-report.md`: summary; old to new navigation map (table (a)); what was merged and why; legacy URL mapping (table (b)) and canonical rewrite; field cleanups per panel (e); shared label table (d, condensed); guide summary (sections and the 9 modules); not-configured behaviour; verification results with real numbers; files touched, noting any file Prettier reformatted beyond the edits; the runbook refund/AutoPay discrepancy from (h); what the user should check in the browser on devcrm as `junkiescoder@gmail.com`: (1) at 1024 px wide the five tabs fit with no horizontal scroll; (2) Tab and arrow keys move across tabs and views, Enter activates, focus ring visible; (3) old links `?tab=transactions`, `?tab=webhooks`, `?tab=subscribers`, `?tab=manual`, `?tab=subscriptions&sub=<demo AutoPay id>` open the right view and rewrite the URL; (4) Overview shows Manual UPI, AutoPay and System health cards, the demo AutoPay under Test; (5) User Guide opens, scrolls, contents jump to sections, Escape closes; (6) Transactions details row and Open AutoPay open the drawer over Transactions, closing returns there; (7) Refunds Access column reads "No change" with its reason; (8) Workspaces Manage still shows the amber AutoPay warning and its link opens the drawer; (9) Manual UPI queue, tiles filter, Review opens the Sheet drawer (no Approve/Reject click needed); (10) Sync now is the only drawer action to try; do not press Cancel AutoPay, Retry or Run reconciliation unless intended. Add one row to the table in `docs/razopay/README.md`: "Payments page redesign | [`docs/razopay/payments-page-redesign-report.md`](./payments-page-redesign-report.md) | Five-section layout for /super-admin/payments, legacy URL mapping, shared status labels, cleaned tables, in-app User Guide".
      Files: `src/components/super-admin/header.tsx`, `docs/billing-runbook.md`, `docs/razopay/payments-page-redesign-report.md`, `docs/razopay/README.md`
      Verify: `npx prettier --write` on the four files; typecheck clean.

- [ ] 11. Full verification and cleanup.
      Run every command in (k) on the full touched list from (j); fix anything that fails and re-run. Record the exact numbers (test files, tests, eslint result, build line) in the report's verification section. Confirm with `git status --short` that only (j) files plus the two pre-existing sitemap files changed and that `scratch/` holds nothing you created.
      Files: any from (j) that need fixes; `docs/razopay/payments-page-redesign-report.md` (numbers)
      Verify: `npx tsc --noEmit 2>&1 | Select-String "error TS"` empty; `npx vitest run` all green (211 files); eslint 0 errors; build compiled; `tsconfig.json` clean in `git status`; `.next-verify3` deleted.
