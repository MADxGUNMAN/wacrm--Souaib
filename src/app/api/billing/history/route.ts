// ============================================================
// /api/billing/history
//
// GET — this workspace's billing history, for the customer's own
//       Settings -> Billing & plan screen.
//
// Two lists, because they answer two different questions and merging
// them would answer neither well:
//
//   payments  — "what did I pay, and was it accepted?"  Receipts, from
//               `payment_requests`.
//   activity  — "why did my access change?"  Plan changes with no
//               receipt behind them (trial start, time granted by
//               support, an expiry), from `subscription_events`.
//
// Each list pages INDEPENDENTLY (`paymentsPage` / `activityPage`), so
// reading page 3 of the activity log does not throw away the customer's
// place in their receipts. One shared page param would have coupled two
// lists that have nothing to do with each other and different lengths.
//
// AUTHORISATION IS MEMBER-LEVEL, matching the two existing read
// endpoints (`GET /api/billing/subscription` and
// `GET /api/billing/payment-requests`). That is a deliberate match, not
// an oversight: transacting is owner-only via `requireBillingOwner`, but
// a blocked member needs to be able to see that a payment is pending
// before they chase their owner about it. Nothing here is per-user data
// — it is all workspace-level billing state that members already reach.
//
// The security-relevant work happens in the shared readers in
// `queries.ts`, not here. `subscription_events` has RLS enabled with
// ZERO policies because it was built as an operator tool, so this route
// is deliberately overriding that with the service role — which makes
// the event-type allowlist and the explicit column projection in
// `listCustomerPlanActivity` load-bearing rather than cosmetic. Read the
// comment there before widening either.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import { toBillingErrorResponse } from '@/lib/subscription/guard';
import {
  getCustomerPaymentSummary,
  listCustomerPaymentsPage,
  listCustomerPlanActivity,
} from '@/lib/subscription/queries';
import type { BillingHistoryPayload } from '@/lib/subscription/types';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(request.url);

    // Page numbers are clamped inside the readers rather than validated
    // here: `?paymentsPage=abc` or `-4` should quietly serve page 1, not
    // 400. A malformed pager param is never worth an error screen on a
    // page whose real content loaded fine.
    const [payments, activity, summary] = await Promise.all([
      listCustomerPaymentsPage(ctx.accountId, searchParams.get('paymentsPage')),
      listCustomerPlanActivity(ctx.accountId, searchParams.get('activityPage')),
      getCustomerPaymentSummary(ctx.accountId),
    ]);

    const payload: BillingHistoryPayload = { payments, activity, summary };
    return NextResponse.json(payload);
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
