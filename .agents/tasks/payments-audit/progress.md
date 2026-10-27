# Progress

- P1 done: src/lib/billing/money-format.ts (+test), src/lib/billing/fetch-all.ts (+test), razorpay-shared.tsx (formatMinor wraps formatMoneyMinor). Tests green.
- P2 done: src/lib/billing/event-channel.ts (+test, 32 cases incl. every live shape + synthetic). Green.
- P3 done: billing-labels.ts (cyan tone, CHANNEL_META, channelLabel, EVENT_TYPE_GROUP_LABEL, amountCaption, sourceInitiatorLabel replaces eventSourceLabel, webhookEventLabel, ledger + access domains), billing-labels.test.ts, channel-badge.tsx, src/lib/billing/ledger-status.ts. Caller fixes land in P6/P10.
- P4 done: events/route.ts rewritten (channel/type/mode/since/accountId validation, chunked read, lookups), src/lib/billing/event-query.ts (+test), src/lib/billing/admin-lookups.ts, src/lib/billing/__fixtures__/fake-admin.ts, events/route.test.ts, BillingEventView/SubscriberAccessVia types in src/types/super-admin.ts. Green.
- P5 done: event-description.ts (+test, 23 cases: every live note shape and SQL/server template). Green.
- P7 done: src/lib/billing/ledger.ts (+test), ledger-db.ts, admin-db.ts listAllAdminPayments, ledger/route.ts (+test), payment-requests/route.ts id param, admin-lookups throws BillingDbError, fake-admin supports not(). Green.
- P8 done: src/lib/billing/access-via.ts (+test), subscriptions/route.ts (loadLatestGrants, accessVia, methodSummary on SubscriberAutopay).
- P6 done: activity-panel.tsx rewritten (channel tiles, Channel/grouped Event type/Razorpay mode/Date filters, server-side, descriptions + reference chip, INR amounts with captions, initiated by), manual-request-opener.tsx, razorpay-shared.tsx (FilterSelect groups, TableSkeletonRows, skeleton in TableStateRow). page.tsx wiring lands in P11.
- P9 done: subscribers-panel.tsx (Access via column + dialog header, AutoPay method summary, Recent history with channel badges/descriptions/amount captions).
- P10 done: razorpay-subscription-drawer.tsx (channel badge, description, status only when changed, initiator via sourceInitiatorLabel, readable webhook titles), razorpay-webhooks-panel.tsx (webhookEventLabel title + raw mono), admin-db.ts EVENT_COLUMNS/AdminBillingEventRow +billingPaymentId/paymentRequestId.
- P11 (part) payments-nav.ts (+test) ledger view default; payments-ledger-panel.tsx; PaymentDetails exported. page.tsx wiring with P13.
- P12 done: src/lib/billing/collected.ts (+test), collected/route.ts (+test). src/lib/billing + billing API suites green (36 files / 443 tests).
- P13 done: razorpay-overview-panel.tsx (Collected card, extra AutoPay status tiles, failed payments open All payments preset), page.tsx (ledger view, presets, refreshKey, Activity onOpenSubscription), usePagedFilters start presets.
- P11 done (page.tsx wiring complete).
- P14 done: manual-payments-panel.tsx + payment-request-drawer.tsx use formatMoneyMajor (row currency, INR default, en-IN), tabular-nums on amount cells in transactions/invoices/refunds/subscriptions/manual panels, skeleton first-load rows for every list via TableStateRow.
- P15 done: payments-guide-content.ts (channels + money topics, activity filters, overview Collected, Access via, All payments notes), payments-guide.test.tsx assertions. Green.
- P16 done: docs/razopay/payments-page-audit-and-fix-report.md, README row, billing-runbook sentence (prettier run).
- P17 done: tsc 0, vitest 222 files / 2,924 tests, eslint clean, build ok (.next-verify3 removed, tsconfig restored), SQL channel split 7/14/84/1/0. verification.md written. Open: browser checklist only.
