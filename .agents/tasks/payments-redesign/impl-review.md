# Implementation review: /super-admin/payments redesign

Verdict: APPROVED (no blocking findings)

## Evidence checked

- `git status`: only plan (j) files, the report, the README row and `.agents/tasks/payments-redesign/` changed, plus the two pre-existing sitemap files. Nothing in `src/lib`, API routes, `supabase/`, `src/components/ui`, `package.json` or configs changed. `tsconfig.json` is clean, `.next-verify3` is gone and `scratch/` is empty.
- Navigation (`payments-nav.ts`): the five sections are in the planned order (Manual UPI second) with the planned views and defaults. `LEGACY_TAB_MAP` covers all 9 old ids (`webhooks` -> activity/webhooks, `subscribers` -> subscriptions/workspaces, `transactions|invoices|refunds` -> payments/*). Legacy-only ids ignore `view`. Overview and Manual drop `view`. An unknown tab or no tab with a valid `sub` resolves to subscriptions/autopay plus the drawer. The UUID guard is in place. `paymentsSearchParams` deletes tab/view/sub and appends them last. `canonicalPaymentsQuery` returns null for a bare URL.
- `page.tsx`: keeps `Suspense` and `replaceSearchParams`, and the canonical rewrite effect is keyed on the query. The overview is fetched once at page level, and `serverMode` is undefined while loading and null when Razorpay is not configured. Primary `Tabs variant="line"` has an aria-label, icons show only from `xl`, and the list uses `flex-wrap` with no `overflow-x-auto`. The Manual label comes from `manualSectionLabel`, with a pending pill and sr-only text. Nested `SectionViews` are labelled "<Section> views". The page-level `RazorpaySubscriptionDrawer` opens on any `?sub`, and closing clears only `sub`. Switching section or view clears `sub`. `RazorpayNotConfiguredNotice` sits above AutoPay mandates, all three Payments views, Webhooks and Reconciliation, and not above Workspaces, Activity log or Manual. Old `TABS`, `resolveTab`, `UUID_RE` and `STATUS_STYLE` are removed.
- Overview (`razorpay-overview-panel.tsx`): a presentational panel with the planned props. It has the mode or not-configured banner, User Guide and Refresh buttons, and the server error text in a `role="alert"` box. The Manual UPI card shows intake text, three counts and Review now. The AutoPay card shows per-mode blocks, live first, with the full tile set and a View transactions link. The System health card shows Webhooks and Last reconciliation run per mode with links. Empty states match (g). No tile from the old overview was lost.
- Shared labels: `billing-labels.ts` is domain-scoped. The old `STATUS_TONE`/`STATUS_LABEL`/`statusLabel`/`KIND_LABEL`/`EVENT_LABELS`/page `STATUS_STYLE` are gone from `src`. The only remaining local map is the `ManageSubscriptionDialog` set-status select, and the plan left that dialog's logic untouched. `StatusPill` has a required `domain`. `FilterToolbar`, `EmptyState`, `TableStateRow` (`emptyHint`/`onReset`), `usePagedFilters` (`dirty`/`reset`), `LIST_HEIGHT` and `RazorpayNotConfiguredNotice` are all present.
- Panel cleanups:
  - Transactions has an expandable details row (`aria-expanded`, `aria-controls`, "Show details for …") with Invoice ("Not issued (AutoPay setup check)"), AutoPay with Open AutoPay, Period covered, Captured and Access applied.
  - Invoices has an Open AutoPay column.
  - Workspaces has a Blocked badge, "In grace period", "Stored as …" with a title, a two-line AutoPay cell, "No phone on file" and `ListPagination`.
  - Activity uses `ListPagination` with `pageSize` passed to the events route and `accountStatusLabel` for statuses.
  - Webhooks and Reconciliation are split into `RazorpayWebhookEventsPanel` and `RazorpayReconciliationPanel` with `serverMode`. The internal overview fetch is gone, and Run reconciliation now uses `runTriggerLabel`.
  - Manual UPI is a separate panel. Tiles are `aria-pressed` filters, and the merged Amount column keeps the red "Expected …, short/over by …" mismatch line. There is a Review/View action button, server error text and `ListPagination`. The first-load switch to Pending and `onReviewed={load}` are unchanged.
  - Payment drawer: moved to `Sheet` with a `SheetTitle`, and the close button has an aria-label. Dates use `formatIst`. Approve/Reject logic and request bodies are unchanged. Only copy, em dashes and labels changed.
- User Guide:
  - `payments-guide-content.ts` has 9 modules in `LEGACY_TAB_IDS` order, and each `location` comes from `at(id)` = `LEGACY_TAB_MAP[id]`. It has the topics layout/modes/transition, the six required tasks and the actions named in the brief.
  - The refund statement matches the code behaviour ("A refund on its own does not cancel AutoPay").
  - `payments-guide.tsx`: the body is not portaled. It has a contents nav, a "Where everything lives" table, topic sections, a controlled module accordion and a tasks accordion.
  - `PaymentsGuideButton` is a `SheetTrigger` with the text "User Guide", rendered in the Overview header.
- Copy: a grep over the touched code finds no `!` in user strings. Every `—` hit is either the allowed empty-cell glyph or inside a code comment.
- Docs:
  - Runbook edits are screen names only (lines 23, 30, 55, 60, 73).
  - The README row was added.
  - The report has every required section: old to new nav, merges and why, legacy URL mapping, shared labels, field cleanups, Overview and not-configured behaviour, User Guide, runbook refund discrepancy, Verification, files touched and the 10-step browser checklist.
- Verification evidence (report and coder summary): tsc 0 errors; vitest 211 files / 2,778 tests passed; eslint 0 errors on 22 touched files; `.next-verify3` build compiled with `/super-admin/payments` in the route table; tsconfig restored. I did not re-run any suite.

## Non-blocking observation

- `activity-panel.tsx` defaults `pageSize` to 25, but `PAGE_SIZE_OPTIONS` is 10/20/50/100, so the page-size select starts on a value it does not list. Paging still works because the route accepts 5 to 100. This is cosmetic only and not a blocker.
