# Phase 7 report: live cutover

Date: 23-10-2026. Spec: `docs/razopay/razorpay-subscriptions-plan.md` section 15 (Phase 7).

Production (`wacrm.junkiescoder.com`) now sells every plan through Razorpay Subscriptions (AutoPay) in **live mode**, for every account.

## 1. What was done

| Step             | Result                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Razorpay account | KYC approved, live mode active. Card and UPI AutoPay tested by the owner (the earlier test-mode `card_mandate_process` failure no longer occurs).                                                                                |
| Live webhook     | `https://wacrm.junkiescoder.com/api/billing/razorpay/webhook`, live secret, 25 events (10 `subscription.*`, 3 `payment.*`, 3 `invoice.*`, 3 `refund.*`, 6 `payment.dispute.*`), alerts to `junkiescoder@gmail.com`.              |
| Production env   | `PROD_ENV` GitHub secret: `RAZORPAY_MODE=live`, `BILLING_ENV=prod`, `rzp_live_` key and secret, webhook secret, `RAZORPAY_LIVE_PILOT_ACCOUNT_IDS` empty. Checked in `/opt/wacrm/.env` and inside the `wacrm` container; no CRLF. |
| Deploy           | `wip/souaib` merged to `master` (HEAD `0324617`), CI deployed, container healthy, `/api/health` 200.                                                                                                                             |
| Route checks     | Public webhook rejects an unsigned request (400). `/api/billing/cron` without the secret answers 401.                                                                                                                            |
| Billing cron     | The server ran the 7 Oct `cron-ping.sh` without `billing`. Replaced with the repo version (backup `cron-ping.sh.bak-<timestamp>` kept). All 8 endpoints `http=200`; billing reports `mode: live`, 0 errors, every 5 minutes.     |
| Live plan        | Created automatically on the first live checkout (`plan_TrM2WRG0uh7FIv`, Yearly, ₹9,000 / 360 days). The Monthly live plan is created the same way on its first checkout.                                                        |
| Pilot            | Owner accounts tested through `RAZORPAY_LIVE_PILOT_ACCOUNT_IDS`, then the list was cleared.                                                                                                                                      |
| Cutover          | `update subscription_settings set payment_provider = 'razorpay';` run on 23-10-2026 at the owner's request, with 0 pending manual payments. Every account now gets Razorpay; manual UPI answers 410 `manual_payments_retired`.   |
| Refund policy    | Published (`legal_pages.refund-and-cancellation-policy`, `is_published = true`).                                                                                                                                                 |

Live state at the time of writing (read-only SQL): 2 live payments, both the ₹5 UPI mandate check, both refunded automatically; 2 live refunds; 18 live webhook events (10 processed, 8 ignored, 0 failed); 205 live reconciliation runs, all succeeded. No live plan charge has been collected yet.

## 2. Lesson recorded

Clearing `RAZORPAY_LIVE_PILOT_ACCOUNT_IDS` does **not** switch anyone to Razorpay. In live mode an empty pilot list hands the decision to the shared DB flag, which was still `manual_upi`, so every account fell back to the QR flow until the flag was set. The `.env.docker` comment that said otherwise is corrected, and the rule is in `AGENTS.md` section 8 and `docs/billing-runbook.md` section 8.

## 3. Rollback

```sql
update subscription_settings set payment_provider = 'manual_upi';
select payment_provider from subscription_settings;
```

Instant, no redeploy. Existing AutoPay mandates keep charging at Razorpay; cancel them in Super-admin -> Payments -> Subscriptions if they must stop. Harder fallback: remove the live keys from `PROD_ENV` and redeploy. devcrm and local are unaffected (test mode uses `RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS`).

## 4. Still open

- **First real plan charge.** Both owner accounts had paid or trial time left, so the first live ₹990 / ₹9,000 charge is deferred. Watch the first one arrive: Activity log (Razorpay AutoPay, Live), All payments, Collected (live), receipt email.
- **Cases that need real renewals:** test cases T3, T5, T8, T13, T14, a failed renewal and retries, and a dispute. Admin alerts for these are in place.
- **`payment_retry_final` email** stays off until a real failed renewal shows Razorpay's retry count.
- **Runbook wording:** `docs/billing-runbook.md` section 4 says a full refund cancels AutoPay; the code only cancels after a lost dispute. Decide which is wanted.
- **Two unfinished live checkouts** (status `created`) expire on their own after 24 hours; the cron supersedes them.
