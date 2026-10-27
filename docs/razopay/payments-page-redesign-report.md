# Payments page redesign report

Date: 22-10-2026. Scope: `/super-admin/payments` UI only. No database writes, no migrations, no API route or `src/lib` changes, no new dependencies, nothing under `src/components/ui` changed. Plan: `.agents/tasks/payments-redesign/plan.md`.

## Summary

The nine flat tabs are now five sections on the shared shadcn/Base UI `Tabs` primitive, three of them with a secondary segmented control. Every status badge reads from one shared label table, every list uses the same toolbar, empty state and pagination, duplicated or low-value fields moved out of the rows, and the Overview has a **User Guide** button that opens a side sheet explaining all nine original modules.

## Old to new navigation

| #   | Section           | Views                                                                                             | Holds (old tabs)                           |
| --- | ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | Overview          | none                                                                                              | Overview                                   |
| 2   | Manual UPI        | none (label "Manual UPI (history)" once intake is partial or retired, plus an amber pending pill) | Manual payments                            |
| 3   | Subscriptions     | AutoPay mandates (default), Workspaces                                                            | AutoPay subscriptions, Subscribers         |
| 4   | Payments          | Transactions (default), Invoices, Refunds & disputes                                              | Transactions, Invoices, Refunds & disputes |
| 5   | Activity & health | Activity log (default), Webhooks, Reconciliation                                                  | Activity, Webhooks & reconciliation        |

Manual UPI sits second because production has no Razorpay keys, so it is the only working queue there. The order is fixed so the bar never shifts between servers. At 1024 px the five labels fit without scrolling; icons only show from `xl` and the list wraps on phones (no `overflow-x-auto`).

## What was merged and why

- **AutoPay subscriptions + Subscribers -> Subscriptions.** Both answer "what is this workspace's subscription"; one from Razorpay's side, one from access dates.
- **Transactions + Invoices + Refunds & disputes -> Payments.** All three are money records from Razorpay, searched by the same ids.
- **Activity + Webhooks & reconciliation -> Activity & health.** Audit trail and system health. The old combined Webhooks & reconciliation tab is split into two views: each list had its own pagination and toolbar, and stacking them was a large part of the crowded feel.
- **Refunds & disputes stays one view** with two stacked tables: one search and mode filter, read together during a dispute.
- The AutoPay drawer moved to page level and opens over any view when `?sub=` is set, so Transactions and Invoices rows open it in place and closing returns to the same list.
- The Razorpay overview JSON is fetched once by the page and shared with the Overview, the Webhooks and Reconciliation views (server mode) and the not-configured notice. The webhooks panel no longer fetches it a second time.

## Legacy URL mapping

Canonical form: `?tab=<section>&view=<view>&sub=<uuid>` (`view` only for sections with views, `sub` only while the drawer is open). Logic: `src/components/super-admin/billing/payments-nav.ts`.

| Incoming `?tab=` | Opens                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| missing, unknown | Overview (with a valid `sub`: Subscriptions › AutoPay mandates + drawer) |
| `overview`       | Overview                                                                 |
| `subscriptions`  | Subscriptions › `view` if valid, else AutoPay mandates                   |
| `transactions`   | Payments › Transactions                                                  |
| `invoices`       | Payments › Invoices                                                      |
| `refunds`        | Payments › Refunds & disputes                                            |
| `webhooks`       | Activity & health › Webhooks                                             |
| `subscribers`    | Subscriptions › Workspaces                                               |
| `activity`       | Activity & health › `view` if valid, else Activity log                   |
| `manual`         | Manual UPI                                                               |
| `payments`       | Payments › `view` if valid, else Transactions                            |

`sub` is kept only when it is a UUID, on whatever view resolves. Switching section or view clears `sub`; closing the drawer clears only `sub`. The page calls `canonicalPaymentsQuery` on every query change and rewrites legacy or incomplete queries once with `replaceSearchParams` (history `replaceState`, no server navigation). A bare `/super-admin/payments` is left untouched, so notification links keep landing on Overview. The F6 AutoPay warning link is now `?tab=subscriptions&view=autopay&sub=<id>`.

## Shared labels (condensed)

`src/components/super-admin/billing/billing-labels.ts` is the single source for status words and tones, scoped by domain because the same raw value means different things (`pending` is "Payment pending" for an AutoPay, "Pending" for a refund, "Pending review" for a manual request).

| Domain    | Notable labels                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AutoPay   | Starting checkout, Awaiting authorisation, Authorised, Active, Payment pending, Halted, Replaced; filter "Not ended yet" (was "Live AutoPay (can charge)", which read like Live mode) |
| Payment   | Created, Authorised, Captured, Refunded, Failed; kinds Authorisation, Recurring charge, Upfront                                                                                       |
| Invoice   | Draft, Issued, Partly paid, Paid, Expired, Cancelled, Deleted                                                                                                                         |
| Refund    | Pending, Processed, Failed; speed Instant, Normal, "Optimum requested"                                                                                                                |
| Access    | Access removed, No change (with the reason), Already removed, Not applied yet                                                                                                         |
| Dispute   | Open, Under review, Won, Lost, Closed; phases Chargeback, Pre-arbitration, ...                                                                                                        |
| Webhook   | Received, Processing, Processed, Ignored, Failed, Dead; filter "Failed or dead"                                                                                                       |
| Manual    | Pending review, Approved, Rejected                                                                                                                                                    |
| Workspace | Trialing, Active, Expired, Ungated                                                                                                                                                    |
| Events    | 25 event types; `subscription_revoked` is "Access removed" (it is also written by refunds, so "Access blocked" was wrong)                                                             |

Removed per-panel maps: `STATUS_TONE`, `STATUS_LABEL`, `statusLabel` (shared), `STATUS_STYLE` (page, workspaces, manual drawer), `KIND_LABEL` (transactions), `EVENT_LABELS` (drawer) and the label strings in Activity and Recent billing history.

## Field cleanups per panel

- **All lists:** shared `StatusPill`/`ModeBadge` on `Badge`; IST dates via `formatIst`; `FilterToolbar` (search left, filters right, Reset filters when anything is set); `TableStateRow` with an empty hint and a Reset action; `ListPagination` everywhere; duplicate "N items" count pills removed.
- **AutoPay mandates:** "Plan · cycle" became Plan (cycle below) plus a separate right-aligned Amount column; anomaly has a hover title.
- **AutoPay drawer:** event labels and from/to statuses in words ("Authorised to Active"), source as "Razorpay webhook", "Cancel requested … by a super admin", "No invoice" line dropped. Sync and Cancel logic and copy unchanged.
- **Workspaces:** status pill, new Blocked badge (counted in tiles but never shown on a row before), "In grace period", "Stored as <label>" with an explanation, AutoPay as pill then "<method> · next charge <date>", "Paid plan queued from <date>", "No phone on file", IST dates in table and dialog, em dashes removed from dialog copy. Dialog behaviour, request bodies and confirm labels unchanged.
- **Transactions:** row is Workspace, Payment, Charge, Status, Amount (+ refunded), Method, Error (2-line clamp), Created, Details. Invoice, AutoPay (+ Open AutoPay), Period covered, Kind, Fee / tax, Card, Error source, Captured and Access applied moved to an expandable details row (`aria-expanded`, `aria-controls`). All payment-details fields stay one click away.
- **Invoices:** Amount shows "Due ₹x" only when due; tax on hover; Issued and Paid are separate columns; Open AutoPay column.
- **Refunds & disputes:** Access uses the access-effect labels with a reason line; Speed in words; Created and Processed split; dispute phase and reason in words; Respond by urgency logic unchanged.
- **Webhooks:** heading moved to the view tab; toolbar with Mode, Event status, Anomalies only and Reset (back to Failed or dead); Re-queued reads "Never" or "N times / Last <time> by <name>". Retry logic and confirm copy unchanged.
- **Reconciliation:** Mode filter and Run reconciliation now on the right, blocked reason below; Triggered by via `runTriggerLabel` ("Scheduled run" instead of "Cron").
- **Activity log:** shared toolbar, headers and pagination with selectable page size (route caps at 100), event labels from the shared table, statuses in words, IST End date and When (relative time on hover), Paid/Manual as toned badges, server error text shown.
- **Manual UPI:** moved to `manual-payments-panel.tsx`. Tiles are toggle buttons (`aria-pressed`) that filter, with one label and count each; Expected and Paid merged into Amount with a red "Expected ₹x, short by ₹y" line on mismatch; Submitted in IST with relative time on hover; Review / View button column so the drawer is keyboard reachable; server error text shown.
- **Manual payment drawer:** now the shared `Sheet` (focus trap, Escape, labelled title, "Close payment request"), IST dates, shared status pill, workspace status in words, em dashes removed. Approve/Reject logic, preview arithmetic, request bodies and the read-only footer unchanged.
- **Header subtitle:** "Manual UPI review, Razorpay AutoPay, payments and billing health".

## Overview and not-configured behaviour

Overview is a presentational panel with three `Card`s: **Manual UPI** (Pending review, Approved, Rejected, Review now), **AutoPay** (per mode, live first: Trialing with AutoPay, Active, Authorised, Payment pending, Halted, Cancelled, Completed, Charges due in 7 days, Failed payments in 7 days with View transactions) and **System health** (per mode: Webhooks and Last reconciliation run, with links). Each card has a button to its section. User Guide and Refresh sit next to the mode banner.

When Razorpay is not set up (production today), the Manual UPI card still shows live counts, the other cards show stored rows or an empty state, and an amber `RazorpayNotConfiguredNotice` appears above AutoPay mandates, the three Payments views, Webhooks and Reconciliation, with an "Open Manual UPI" button. Workspaces, Activity log and Manual UPI never show it.

## User Guide

`payments-guide-content.ts` (typed data) and `payments-guide.tsx` (renderer). The button opens a right-hand `Sheet` titled "Payments & Subscriptions guide" with:

- An "On this page" contents list that opens and scrolls to any section.
- "Where everything lives": original tab to new location, generated from the navigation model.
- Topics: how the page is organised, test and live mode, manual UPI and AutoPay together (intake Open / Partial / Retired).
- Nine modules, one per original tab (Overview, AutoPay subscriptions, Transactions, Invoices, Refunds & disputes, Webhooks & reconciliation, Subscribers, Activity, Manual payments): summary, where it lives now, columns, statuses, every action with its limits and cautions (Sync now, Cancel AutoPay, Open in Razorpay, Open AutoPay, Retry, Run reconciliation now, Manage, Approve, Reject), and notes.
- Common tasks: failed payment, dispute, failing webhooks, review a manual payment, adjust access, confirm a refund.

Location labels are derived with `locationLabel`, and a test fails if a module's location differs from `LEGACY_TAB_MAP` or any string contains `!` or an em dash.

## Runbook discrepancy found in planning (not changed)

`docs/billing-runbook.md` section 4 says a full refund "cancels AutoPay". The code only cancels AutoPay after a **lost dispute** (`src/lib/billing/razorpay/events.ts`, D4 block); refund handling only calls `applyRefund`. The guide states the code behaviour ("A refund on its own does not cancel AutoPay"). The runbook sentence is left as is for you to decide. The only runbook edits are screen names (lines 23, 30, 55, 60, 73).

## Verification

Run from the repo root on 22-10-2026:

| Command                                                                                                                            | Result                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npx vitest run src/components/super-admin/billing/payments-nav.test.ts src/components/super-admin/billing/billing-labels.test.ts` | 2 files, 97 tests passed                                                                             |
| `npx vitest run src/components/super-admin`                                                                                        | 4 files, 126 tests passed (autopay-warning green with the new href)                                  |
| `npx tsc --noEmit 2>&1 \| Select-String "error TS"`                                                                                | 0 lines                                                                                              |
| `npx vitest run`                                                                                                                   | **211 files, 2,778 tests passed** (baseline 208 / 2,665; +3 files)                                   |
| `npx eslint <22 touched .ts/.tsx files>`                                                                                           | 0 errors, 0 warnings (after renaming a `module` variable in the guide test)                          |
| `npx prettier --write <touched files>`                                                                                             | run; see note below                                                                                  |
| `$env:NEXT_DIST_DIR=".next-verify3"; npm run build`                                                                                | exit 0, "Compiled successfully in 26.4s", route table lists `○ /super-admin/payments`                |
| `git checkout -- tsconfig.json`; `Remove-Item -Recurse -Force .next-verify3`                                                       | done                                                                                                 |
| `git status --short`                                                                                                               | only plan (j) files, the two docs files, the workflow folder and your two pre-existing sitemap files |

Prettier: `header.tsx` was re-wrapped onto two lines because the new subtitle is longer (3-line diff). No other file outside the edited ones was reformatted. Most panel diffs are large because those panels were rewritten (toolbar, table and footer), not because of formatting.

Not verified here: anything in a real browser. That is the checklist below.

## Files touched

New: `payments-nav.ts`, `payments-nav.test.ts`, `billing-labels.ts`, `billing-labels.test.ts`, `manual-payments-panel.tsx`, `payments-guide-content.ts`, `payments-guide.tsx`, `payments-guide.test.tsx` (all in `src/components/super-admin/billing/`), this report.

Modified: `src/app/(super-admin)/super-admin/payments/page.tsx`; in `src/components/super-admin/billing/`: `razorpay-shared.tsx`, `razorpay-overview-panel.tsx`, `razorpay-subscriptions-panel.tsx`, `razorpay-subscription-drawer.tsx`, `razorpay-transactions-panel.tsx`, `razorpay-invoices-panel.tsx`, `razorpay-refunds-disputes-panel.tsx`, `razorpay-webhooks-panel.tsx`, `subscribers-panel.tsx`, `activity-panel.tsx`, `payment-request-drawer.tsx`, `autopay-warning.tsx`, `autopay-warning.test.tsx`; `src/components/super-admin/header.tsx`; `docs/billing-runbook.md`; `docs/razopay/README.md`.

## Browser checklist (devcrm, signed in as `junkiescoder@gmail.com`)

1. At 1024 px wide the five tabs fit with no horizontal scroll.
2. Tab and arrow keys move across tabs and views, Enter activates, the focus ring is visible.
3. Old links `?tab=transactions`, `?tab=webhooks`, `?tab=subscribers`, `?tab=manual` and `?tab=subscriptions&sub=<demo AutoPay id>` open the right view and the URL is rewritten.
4. Overview shows the Manual UPI, AutoPay and System health cards, with the demo AutoPay under Test.
5. User Guide opens, scrolls, the contents list jumps to sections, Escape closes it.
6. In Transactions, the details row and Open AutoPay open the drawer over Transactions; closing returns there.
7. Refunds: the Access column reads "No change" with its reason.
8. Workspaces › Manage on the demo account still shows the amber AutoPay warning and its link opens the drawer.
9. Manual UPI: the queue loads, the tiles filter, Review opens the Sheet drawer (no Approve or Reject click needed).
10. In the AutoPay drawer, Sync now is the only action to try. Do not press Cancel AutoPay, Retry or Run reconciliation unless you intend to.
