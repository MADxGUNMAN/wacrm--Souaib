# Billing runbook (Razorpay AutoPay)

Operator procedures for the Razorpay Subscriptions integration. Design and rationale live in `docs/razopay/razorpay-subscriptions-plan.md`; this file is only what to do when something needs doing.

Facts that apply to every section:

- Dev and production share one Supabase project (`dknolotutfiesuhbhmze`). Anything written to the database on dev is visible to production.
- Production config lives in `/opt/wacrm/.env` on the server. CI does not touch it; a change there needs `docker compose up -d` in `/opt/wacrm` to take effect.
- Every money-moving action (refund, dispute response, key rotation) happens in the Razorpay Dashboard. The app records the outcome from webhooks and reconciliation; it never initiates a refund itself.
- Super-admin screens referred to below are all under **Super-admin -> Payments** (`/super-admin/payments`).

## 1. Webhook disabled by Razorpay

Razorpay retries a failing webhook for 24 hours and then disables it, emailing the account owner (alerts go to junkiescoder@gmail.com).

1. Find out why deliveries failed:
   - Production: `cd /opt/wacrm && docker compose ps && curl -s localhost:3000/api/health`, then `docker compose logs --tail 200 wacrm | grep -i razorpay`.
   - Dev: `GET /api/health` on devcrm, and `.next/dev/logs/next-development.log` (search for `[razorpay]`). Check the tunnel is up.
   - A signature failure means the Dashboard secret and `RAZORPAY_WEBHOOK_SECRET` disagree (see section 3).
2. Fix the cause and confirm `POST /api/billing/razorpay/webhook` answers again (an unsigned request should get `400 Invalid signature`, not a timeout or 5xx).
3. Re-enable the webhook in **Razorpay Dashboard -> Account & Settings -> Webhooks**.
4. Replay the events Razorpay did not get an acknowledgement for. The Dashboard can replay events up to 7 days old.
5. Run **Activity & health -> Reconciliation -> Run reconciliation now**. Reconciliation refetches subscriptions, invoices and payments directly from Razorpay, so anything older than the replay window, or missed for any other reason, is still picked up by its full sweep (plan section 3.8, step d).

Access is not lost while the webhook is down: reconciliation grants paid windows from Razorpay's own records every 5 minutes.

## 2. Replay and retry

- **Dashboard replay** re-sends Razorpay's original event to the webhook URL. Use it after an outage (section 1).
- **Retry in the app** re-processes an event we already stored but failed to apply: **Activity & health -> Webhooks**, find a `failed` or `dead` event, press Retry. This calls `POST /api/super-admin/billing/razorpay/webhook-events/[id]/retry` and is written to the audit trail with your name.
- Both are safe to repeat. `billing_webhook_events` has a unique key on `(mode, provider_event_id)`, so a duplicate delivery is stored once; and `billing_apply_payment` grants a payment's window only once (it records `billing_payments.access_applied_at`), so an event applied twice cannot grant twice.
- An event marked `dead` has exhausted its automatic retries. Read its error before retrying; if the cause is a code bug, fix and deploy first.

## 3. Secret rotation

### Webhook secret

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. In `/opt/wacrm/.env` (or `.env.local` on dev): set `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` to the current secret and `RAZORPAY_WEBHOOK_SECRET` to the new one. Restart the container. The app now accepts signatures made with either.
3. Change the secret in **Dashboard -> Webhooks** to the new value.
4. After 48 hours (longer than Razorpay's 24 h retry window), remove `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` and restart again.

### API key

1. Generate a new key pair in **Dashboard -> Account & Settings -> API Keys**.
2. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `/opt/wacrm/.env` and restart. The key prefix must match `RAZORPAY_MODE` (`rzp_test_` or `rzp_live_`), or the app refuses the config and billing answers "unavailable".
3. Check **Payments -> Overview** shows the mode as healthy, then revoke the old key in the Dashboard.

Never paste a secret into a ticket, a commit or this repository.

## 4. Refunds

- Refunds are made in the **Razorpay Dashboard** only (decision D4). Open the payment and refund it there.
- The app records the refund when `refund.processed` arrives (or reconciliation finds it). A **full** refund removes the access window that payment bought and cancels AutoPay. A **partial** refund changes nothing about access.
- To look a payment up quickly, search **Payments -> All payments** by its `pay_` id: the row shows the refunded amount and the ledger status.
- Confirm in **Payments -> Refunds & disputes**: the refund row should appear with the payment it belongs to. Then open the account in **Subscriptions -> Workspaces** to check the access end date is what you expect.
- The ₹5 card verification charge at AutoPay setup is refunded automatically by Razorpay. It needs no action and is not a plan payment.

## 5. Disputes

- Respond in the **Razorpay Dashboard** before the deadline. **Payments -> Refunds & disputes** lists open disputes and highlights the ones close to their due date.
- A dispute that is lost has the same effect as a full refund: the window is removed and AutoPay is cancelled. A won dispute changes nothing.

## 6. Reconciliation

`GET /api/billing/cron` runs every 5 minutes via `cron-ping.sh` (endpoint `billing`). Each run:

- (a) reprocesses stored webhook events that failed, with bounded backoff, then marks them `dead` and notifies the super admin;
- (b) refetches subscriptions whose charge time passed more than 30 minutes ago without a recorded capture;
- (c) refetches `initiating` and `created` rows to close or expire abandoned checkouts;
- (d) runs a rolling full sweep of all non-terminal subscriptions and their invoices, at least daily;
- (e) delivers the billing email outbox with retries.

Run it on demand with **Activity & health -> Reconciliation -> Run reconciliation now** (audited). Each run writes a `billing_reconciliation_runs` row (`mode`, `scope`, `status`, `checked`, `changed`, `errors`, `started_at`, `finished_at`); `status = 'failed'` or a non-empty `errors` array is worth reading. On the server, `tail -n 20 /opt/wacrm/cron.log` should show `billing http=200` on every tick.

## 7. Deploying `cron-ping.sh`

The crontab runs `/opt/wacrm/cron-ping.sh`, not the repo copy. A change to `deploy/cron-ping.sh` (a new endpoint, a new interval) does nothing until it is copied up:

```bash
# from the workstation
scp -i "<path>/wp_crm.pem" deploy/cron-ping.sh ubuntu@54.237.169.69:/tmp/cron-ping.sh
# on the server: strip CRLF in case the file came from a Windows working tree
tr -d '\r' < /tmp/cron-ping.sh | sudo tee /opt/wacrm/cron-ping.sh > /dev/null
sudo chmod +x /opt/wacrm/cron-ping.sh
# wait for the next 5-minute tick, then
tail -n 20 /opt/wacrm/cron.log
```

Every endpoint line should read `http=200`.

## 8. Provider switch and rollback

Which purchase flow an account gets is decided per request by `resolvePaymentProvider` (`src/lib/billing/razorpay/provider.ts`).

- **Production today (since 23-10-2026):** live Razorpay keys are configured, `RAZORPAY_LIVE_PILOT_ACCOUNT_IDS` is empty and `payment_provider = 'razorpay'`, so every account gets Razorpay AutoPay. To go back to manual UPI, run `update subscription_settings set payment_provider = 'manual_upi';` (see Rollback below). An empty pilot list alone does not switch anyone; in live mode it hands the decision to this flag.
- **Dev (test mode):** accounts on `RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS` get Razorpay. To switch the whole dev deployment back to the QR flow, add `BILLING_PROVIDER_OVERRIDE=manual_upi` to `.env.local` and restart the dev server if its log does not show the env reload. Remove the line (or set `razorpay`) to switch back. The override is read only when `BILLING_ENV=dev` and is ignored in production.
- **Never flip `subscription_settings.payment_provider` to try something on dev.** It is one row in the shared database; changing it changes production at the same moment.
- **Live cutover (Phase 7):** with live keys on production, `payment_provider = 'razorpay'` moves every account to AutoPay. There is no UI toggle for it; it is set by a reviewed SQL statement as part of the Phase 7 checklist. Before cutover, check nothing is waiting for review: `select count(*) from payment_requests where status = 'pending';` should be 0, or those rows should be approved or rejected first.
- **Rollback:** set `payment_provider` back to `'manual_upi'`. The QR flow returns at once (`/api/billing/upi-qr` and `POST /api/billing/payment-requests` stop answering 410). Existing AutoPays keep charging and their webhooks keep granting access, because access always follows money already collected.

## 9. Localized pricing switch-off

Country plans (`pricing_regions`) are shown only while enabled; everyone else sees the Global plan. Details: `docs/razopay/localized-pricing-report.md`.

- **Switch every country off at once (no deploy):** `update pricing_regions set is_enabled = false;` Verify with `select code, currency, is_enabled from pricing_regions;`. Every workspace sees the Global plan on its next page load.
- **One country:** turn off "Enable localized plan" for it on `/super-admin/plans`.
- **Existing AutoPay mandates keep their price and currency** at Razorpay either way. Cancel them in Super-admin, Payments, Subscriptions only if they must stop.
- **Code rollback:** redeploy the previous image. No SQL is needed; older code ignores the new columns and never shows a country cycle.
- **Never enable a non-INR country** before Razorpay has activated International payments for that mode and the currency is listed in `RAZORPAY_CHARGE_CURRENCIES`. The enable switch refuses it, and so does the customer-side resolver.
