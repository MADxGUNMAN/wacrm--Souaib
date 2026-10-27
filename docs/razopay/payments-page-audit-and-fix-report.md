# Payments page audit and fix

Date: 23-10-2026. Scope: `/super-admin/payments`, `src/components/super-admin/billing/*`, `src/app/api/super-admin/billing/*`. No database writes, no migrations, no Razorpay actions.

## 1. Summary

The complaint: "I cannot understand which payment was made how. If I manually add a payment it shows Manual, and if the user used AutoPay it also shows Manual. The filters are not proper. The new Razorpay configuration is not done in this page."

The cause was a pre-Razorpay events API that derived a binary `source: 'payment' | 'manual'` from the event type alone. Every Razorpay event, and every admin grant, became "Manual"; the filters and tiles were built on that split; amounts defaulted to USD.

What changed:

- One server-side classification, the **channel** (Razorpay AutoPay, Manual UPI, Admin action, Customer action, System), used by the Activity log, the Manage dialog and the AutoPay drawer.
- Activity log rebuilt: per-channel tiles that filter the table, Channel, grouped Event type (all 25), Razorpay mode and Date filters, all server-side; plain-sentence descriptions with one copyable reference; INR amounts with a caption saying what the number means; Initiated by.
- New **All payments** ledger, the default Payments view, merging Razorpay payments and manual UPI requests.
- New **Collected** card on the Overview: money by channel, live and test separate.
- Workspaces list and Manage dialog show **Access via**.
- Currency fixed everywhere on the page (row currency, INR default, en-IN grouping).

Outcome on live data (106 events, read-only check after the build): Razorpay AutoPay 7, Manual UPI 14, Admin actions 84, Customer actions 1, System 0. The old screen showed "From payments 14 / Manual 92".

## 2. Audit findings

| #        | Before                                                                                                                              | After                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1       | `events/route.ts` derived `source: payment\|manual`; all Razorpay events were "manual"; ignored `source`, billing links, actor role | `channel` from `classifyBillingEvent` (`src/lib/billing/event-channel.ts`)                                                                                       |
| F2       | Event type filter listed 9 legacy types                                                                                             | 25 types in Base UI Select groups (Razorpay AutoPay, Manual UPI, Access changes, Admin)                                                                          |
| F3       | Source filter "Payments & manual / From payments / Manual only", tiles 14 / 92                                                      | Channel filter and six tiles (All + 5 channels), each a filter button with `aria-pressed`                                                                        |
| F4       | `formatCurrency(e.amount)` defaulted to USD: "$9,000"                                                                               | `formatMoneyMajor(amount, currency)`, INR default: "₹9,000"                                                                                                      |
| F5       | `eventSourceLabel`: `payment` "Paid", `manual` "Manual"                                                                             | Removed; `sourceInitiatorLabel` and `CHANNEL_META`                                                                                                               |
| F6       | Raw notes in italic quotes ("Razorpay sub_X: created -> authenticated")                                                             | `describeBillingEvent`: "AutoPay status changed from Awaiting authorisation to Authorised." plus one `sub_` chip                                                 |
| F7       | Plan price on AutoPay status rows read as revenue                                                                                   | `amountKind`: bold only for Paid via AutoPay / Paid via manual UPI / Refunded; muted "Plan price, no payment", "Claimed, under review", "Not accepted" otherwise |
| F8       | "Done by" mixed customers and admins, webhooks read "System"                                                                        | Initiated by: name plus Customer / Super admin, "Razorpay / Webhook", "Reconciliation / Scheduled job", "System"                                                 |
| F9       | Default page size 25 not in the 10/20/50/100 select (blank)                                                                         | 20                                                                                                                                                               |
| F10      | `.limit(1000)` then in-memory filters capped counts silently                                                                        | `fetchAllRows` chunked reader, cap 10,000, `truncated` flag and notice                                                                                           |
| F11      | `accountId` unvalidated (PostgREST 500)                                                                                             | UUID check, 400                                                                                                                                                  |
| F12      | No test/live on events                                                                                                              | `mode` from `billing_subscriptions.mode` / `billing_payments.mode`, Test pill, Razorpay mode filter                                                              |
| F13      | No date filter                                                                                                                      | `since` = 7d / 30d / 90d / all, applied in SQL                                                                                                                   |
| F14      | Manage dialog history coloured by binary source                                                                                     | Channel badge, description, amount with caption, initiator                                                                                                       |
| F15      | Workspaces could not say how access was obtained                                                                                    | Access via column and dialog header                                                                                                                              |
| F16      | `method_summary` selected but dropped ("UPI")                                                                                       | Carried as `methodSummary` ("UPI te****@razorpay")                                                                                                               |
| F17      | Drawer status pair used subscription labels for account statuses, shown when unchanged                                              | `accountStatusLabel`, only when changed                                                                                                                          |
| F18      | Drawer printed "Checkout" / "Razorpay webhook"                                                                                      | `sourceInitiatorLabel` ("Customer at checkout", "Razorpay")                                                                                                      |
| F19      | Drawer raw note                                                                                                                     | `describeBillingEvent`, drawer's own `sub_` suppressed                                                                                                           |
| F20      | Webhooks title was `subscription.authenticated`                                                                                     | "Subscription authenticated" with the raw name below in mono                                                                                                     |
| F21, F22 | No single list of payments; Payments defaulted to Transactions                                                                      | All payments ledger, default view; `?tab=transactions` still opens Transactions                                                                                  |
| F23      | Overview had no money figures                                                                                                       | Collected card                                                                                                                                                   |
| F24      | AutoPay tiles omitted `created`, `paused`, `expired`, `superseded` and others                                                       | Any other non-zero status gets its own tile                                                                                                                      |
| F25      | "View transactions" opened an unfiltered list                                                                                       | "View failed payments" opens All payments with Razorpay + Failed                                                                                                 |
| F26      | Manual UPI amounts used browser-locale grouping                                                                                     | `formatMoneyMajor` (en-IN) in the queue and review drawer                                                                                                        |
| F27      | Guide described "Paid or Manual" and "filter by source"                                                                             | Guide rewritten (topics "How each entry happened", "All payments and Collected")                                                                                 |
| F28      | Page and nav comments omitted the new view                                                                                          | Updated                                                                                                                                                          |
| F29      | No link from an event to its AutoPay or request                                                                                     | Reference chip with Open in Razorpay, Open AutoPay, Open request                                                                                                 |
| F30      | Search covered note text only                                                                                                       | Workspace, owner email, initiator, plan, note, `sub_` / `pay_` id, UTR                                                                                           |

## 3. Channel rules

Precedence, first match wins (`classifyBillingEvent`):

| #   | Condition                                                                                                                              | Channel          | Context                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| 1   | `source = 'admin'` or `billing_admin_action`                                                                                           | Admin action     | autopay if a billing id is set, manual_upi if a payment request is set |
| 2   | `source = 'customer'`                                                                                                                  | Customer action  | autopay if a billing id is set                                         |
| 3   | `billing_subscription_id` or `billing_payment_id`, or source in razorpay_webhook / checkout / reconciliation, or a Razorpay event type | Razorpay AutoPay | autopay                                                                |
| 4   | `payment_request_id`, or payment_submitted / approved / rejected                                                                       | Manual UPI       | manual_upi                                                             |
| 5   | actor is a super admin                                                                                                                 | Admin action     | none                                                                   |
| 6   | actor is anyone else                                                                                                                   | Customer action  | none                                                                   |
| 7   | nobody acted (legacy NULL source or `system`)                                                                                          | System           | none                                                                   |

Initiated by:

| Condition                                     | Label                                 | Detail        |
| --------------------------------------------- | ------------------------------------- | ------------- |
| super admin actor                             | name, else email, else "Super admin"  | Super admin   |
| other actor                                   | name, else email, else "Unknown user" | Customer      |
| no actor, `razorpay_webhook`                  | Razorpay                              | Webhook       |
| no actor, `reconciliation`                    | Reconciliation                        | Scheduled job |
| no actor, `checkout` or `customer`            | owner email, else "Customer"          | Customer      |
| no actor, `subscription_expired`, NULL source | Scheduled job                         |               |
| otherwise                                     | System                                |               |

Money and amount captions:

| Event                                                    | Money involved | Caption                       |
| -------------------------------------------------------- | -------------- | ----------------------------- |
| payment_succeeded                                        | AutoPay        | Paid via AutoPay              |
| payment_failed                                           | none           | Not collected                 |
| refund_processed                                         | refund         | Refunded                      |
| payment_approved                                         | manual UPI     | Paid via manual UPI           |
| payment_submitted                                        | none           | Claimed, under review         |
| payment_rejected                                         | none           | Not accepted                  |
| subscription_activated / extended with a payment request | manual UPI     | Covered by manual UPI payment |
| any other row with an amount                             | none           | Plan price, no payment        |

Live distribution and resulting tiles (106 = 7 + 14 + 84 + 1 + 0): the 16 row shapes are each a test case in `event-channel.test.ts` and seeded at their live counts in `events/route.test.ts`.

## 4. Activity log

- Filters before: Source (3 options), Event type (9). After: Search, Channel (All channels + 5), Event type (25, grouped), Razorpay mode (All / Live / Test), Date (Any time / 7 / 30 / 90 days). Any change resets to page 1.
- API `GET /api/super-admin/billing/events`: `channel`, `type`, `mode`, `since`, `search`, `accountId`, `page`, `pageSize` (5..100, default 20). Invalid values answer 400. Response `{ events, counts: { total, byChannel }, page, pageSize, totalPages, truncated }`.
- Counts: `byChannel` counts rows matching every filter except channel; `total` includes channel. The tiles therefore always agree with the table.
- Razorpay mode decision: manual and admin rows have no mode, so Live or Test hides them. The select is labelled "Razorpay mode".
- Row: Event (title, sentence, plan, note, reference chip), Channel (badge, Test pill), Workspace (name, owner email), Access change (time given, window, end date before to after), Status (only when changed), Amount (right-aligned, tabular, currency, caption), Initiated by, When (IST, relative on hover).

## 5. All payments ledger

- Route `GET /api/super-admin/billing/ledger` (super admin, `force-dynamic`, SELECT only): `channel` (all / razorpay / manual_upi), `status` (all / paid / pending / failed / rejected / refunded / partially_refunded), `mode`, `search`, `sort` (date:desc / date:asc / amount:desc), `page`, `pageSize` (10 / 20 / 50 / 100). Response `{ items, total, page, pageSize, totalPages, counts: { channel, status }, truncated }`.
- Status mapping: Razorpay captured with nothing refunded is Paid, partly refunded is Partly refunded, refunded in full is Refunded, failed is Failed, created / authorised is Pending. Manual approved is Paid, pending is Pending, rejected is Rejected. Filter Refunded also matches Partly refunded.
- Columns: Date, Workspace, Channel, Type (First payment, Renewal, AutoPay setup check, Manual payment), Plan & cycle, Period covered, Amount (refunded and expected-mismatch lines), Method (UPI / card with masked id, or UPI QR with payer UPI id), Status, Reference (`pay_` id with Open in Razorpay, or UTR), Details.
- Details: a Razorpay row expands the same details block as Transactions (with Open AutoPay); a manual row opens the existing Manual UPI review drawer via the new read-only `GET /api/super-admin/billing/payment-requests?id=`.
- Transactions, Invoices and Refunds & disputes are unchanged and still reachable.

## 6. Overview Collected

Definitions (`src/lib/billing/collected.ts`): AutoPay collected counts captured payments excluding `kind = 'authorization'`; refunds count processed refunds excluding `access_effect = 'none_not_a_charge'`; manual UPI counts approved requests (real money outside Razorpay, never in test figures); Net (live) is AutoPay live plus manual UPI minus live refunds. Per currency, never summed across currencies or modes. Windows: rolling 30 days and all time.

Live snapshot (unit-tested): Manual UPI approved ₹45,150 (2), AutoPay live ₹0, AutoPay test ₹9,000 (1) in the amber test block, setup checks ₹10 test excluded, Net (live) ₹45,150.

## 7. Workspaces

`deriveAccessVia` (`src/lib/billing/access-via.ts`) reads the newest grant event per workspace (payment_succeeded, payment_approved, subscription_activated, subscription_extended), classified by channel: Razorpay AutoPay, Manual UPI payment, Admin grant, Trial, Ungated, or "Not recorded" when nothing explains the access. Expired workspaces show "Last access:". The Manage dialog header shows the same pill and its Recent billing history uses channel badges.

## 8. Currency and polish

- `formatMoneyMinor` / `formatMoneyMajor` in `src/lib/billing/money-format.ts`: row currency, INR default, en-IN grouping (₹45,15,000), paise only when present, invalid codes fall back to "XYZ 1,234". `formatMinor` now delegates to it.
- No `formatCurrency` (USD default) remains on the Payments page. `plans-panel.tsx` is not on this page and was left alone.
- Skeleton rows on first load for every list (`TableSkeletonRows` inside `TableStateRow`, with a screen-reader status line); right-aligned tabular amounts; channel badges with distinct colour and icon (new `cyan` tone for Customer action); sentence-case empty states.

## 9. Files changed and tests added

New: `src/lib/billing/{event-channel,event-query,money-format,fetch-all,admin-lookups,ledger,ledger-db,ledger-status,collected,access-via}.ts`, `src/lib/billing/__fixtures__/fake-admin.ts`, `src/app/api/super-admin/billing/{ledger,collected}/route.ts`, `src/components/super-admin/billing/{channel-badge,event-description,manual-request-opener,payments-ledger-panel}.tsx|ts`.

Changed: events, payment-requests and subscriptions routes; activity, subscribers, overview, drawer, webhooks, transactions, invoices, refunds, subscriptions, manual panels and drawer; `billing-labels.ts`, `razorpay-shared.tsx`, `payments-nav.ts`, `payments-guide-content.ts`, `admin-db.ts`, `src/types/super-admin.ts`, `page.tsx`, this folder's README and `docs/billing-runbook.md`.

Tests added: `event-channel`, `event-query`, `money-format`, `fetch-all`, `ledger`, `collected`, `access-via`, `event-description`, events route, ledger route, collected route; updated `billing-labels`, `payments-nav`, `payments-guide`. The route tests use a fake client that applies filters and records the column of each `.eq`, and assert no writes.

## 10. Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: 222 files, 2,924 tests passed (baseline 211 / 2,778).
- `npx eslint` on touched files: 0 errors, 0 warnings.
- `npx prettier --write` on touched files.
- `NEXT_DIST_DIR=.next-verify3 npm run build`: succeeded; `tsconfig.json` restored and `.next-verify3` removed.
- Read-only SQL after the build: channel split 7 / 14 / 84 / 1 / 0, matching the tiles.

Not verified: the page in a browser (checklist below).

## 11. Browser checklist (devcrm)

1. Activity & health › Activity log: tiles read 7 / 14 / 84 / 1 / 0; each tile filters the table and the count below matches.
2. Event type lists 25 types under four group headings.
3. Razorpay mode = Test shows only Razorpay-linked rows, each with a Test pill.
4. An autopay_authenticated row reads "AutoPay status changed from Awaiting authorisation to Authorised." with a copyable `sub_` chip, Open in Razorpay and Open AutoPay.
5. Amounts show ₹ with captions; only the payment_succeeded and payment_approved rows are bold.
6. A payment_submitted row shows its UTR chip and Open request opens the review drawer.
7. Payments opens on All payments with 3 Razorpay and 6 manual rows; Details expands a Razorpay row, Review opens a manual request.
8. Overview Collected: Manual UPI ₹45,150, AutoPay live ₹0, AutoPay test ₹9,000 in the amber block, setup-check footnote; tiles open All payments filtered.
9. Subscriptions › Workspaces: Access via column; Manage dialog header pill and history badges.
10. Activity & health › Webhooks titles read "Subscription authenticated".
11. `?tab=transactions` still opens Payments › Transactions.
