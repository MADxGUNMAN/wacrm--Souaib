# Review: Razorpay Phase 6 (iteration 1)

Verdict: APPROVED. No blocking findings.

## Evidence checked

- `git status` / `git diff` / untracked files: 22 modified, 9 untracked (task folder, runbook, Phase 6 report, `manual-retirement.ts` + test, `opt-in.ts` + test, `legal-slugs.ts`, migration). HEAD is still the Phase 5 commit `5eba8f4`; no Phase 6 commit. `tsconfig.json` has no diff, `.next-verify3` does not exist, `scratch/` has no files.
- 410 retirement: `src/lib/billing/manual-retirement.ts` returns 410 `{ error, code: 'manual_payments_retired' }` with `no-store` only when `resolvePaymentProvider` answers `razorpay`; returns null when there is no Razorpay config (production). Called after `requireBillingOwner()` in `POST /api/billing/payment-requests` (before rate limit and body parse) and `GET /api/billing/upi-qr` (before quote lookup). History GET is untouched, and no manual code was deleted.
- Provider override: `config.ts` reads `BILLING_PROVIDER_OVERRIDE` only when `billingEnv === 'dev'`, rejects bad values naming only the variable, and leaves `prod` as null. `provider.ts` follows rules 1 to 5 of D-A: `manual_upi` override wins, test mode stays allowlist-only, and the live override replaces the DB flag only on dev. Nothing writes `subscription_settings.payment_provider`; `provider` is `manual_upi` before and after.
- Checkout refusal: `assertNoPendingManualPayment` throws `BillingServiceError('manual_payment_pending', ..., 409)` in both GET and POST, after `assertRazorpayProvider` and before body, quote, claim or Razorpay call. Tests assert `claimCheckout` and `createSubscription` are not called.
- Opt-in prompts (`opt-in.ts`): paid gives "You're paid until X. / Set up AutoPay to renew automatically on X." (flow D §3.4, §11 item 3). Trial gives a first charge at the end of the trial (§8.1). Lapsed gives a pay-now prompt. Manual provider, an existing mandate or billing disabled give none. The Billing card (§8.3 "none" state, owner CTA, member text only) and the `/upgrade-plan` coverage notice both use the same function. The manual UPI notice text is unchanged.
- Manual tab: `manualIntake` comes from the server. The label and notice change only when intake is `partial` or `retired`. The drawer shows a read-only note for non-pending rows, and Approve/Reject remain only for `pending` rows. The server-side conditional claim is unchanged.
- Legal draft: the migration is a single `INSERT ... ON CONFLICT (slug) DO NOTHING` with `is_published = false`. `getLegalPage`, the footer list and the sitemap all filter `is_published = true`. The payment-page link appears only when the server confirms the page is published.
- Migration: additive and idempotent, re-run checked in the rolled-back DO block. It creates no functions or other objects, so REVOKE/GRANT and md5(prosrc) do not apply (plan D-G, stated in the report and verification). There is no UPDATE or DELETE.
- Data: `baseline.json` and `after.json` exist. payment_requests 6 / `6553080635e375d5543525cb10367c6f`, subscription_events 94 / `299a80642dcbfc8a8bc369914dd6116f` (pre-baseline checksum equal), and demo md5 `c5fd666db77009366a38bd13be923fdd` are all unchanged.
- Permanent tests cover:
  - the 410 responses: `manual-retirement.test.ts` checks POST and QR 410, the override restoring manual, production, a non-allowlisted account, history 200 and the member 403;
  - the override: `config.test.ts` and `provider.test.ts`;
  - the pending refusal: `routes.test.ts`;
  - the prompt states: `opt-in.test.ts` and `autopay-card.test.tsx`.
- Verification evidence (`verification.md`, report §6):
  - tsc 0 errors;
  - vitest 206 files / 2,612 tests green before and after prettier;
  - eslint exit 0 on 25 files;
  - prettier run, with its whole-file reformatting of 3 files disclosed;
  - `.next-verify3` build exit 0;
  - cleanup recorded.
  I did not re-run anything.
- Docs: the runbook covers webhook disable/re-enable, replay and retry, webhook and API key rotation, refunds, disputes, reconciliation, the cron-ping deploy (with the CRLF strip) and the provider switch/rollback. I checked the routes and unique key it names against the source. The Phase 6 report has every section the plan requires. The README has the Phase 6 row and the runbook row. New copy has no exclamation marks or em dashes (scanned the new files and new strings).

## Non-blocking observations (no change required)

- `opt-in.ts` treats a paid window with an admin-granted trial queued behind it as `paid`, using the later end. The headline then says "paid until" a date that includes the bonus trial days. The first-charge date is correct. This is a rare operator-only case.
- `getPendingPaymentRequest` returns null on a read error, so the 409 check fails open on a DB error. This is pre-existing behaviour and disclosed in report §9.
- The README Phase 5 row still says the browser click-through is pending, though the user has since confirmed it.
