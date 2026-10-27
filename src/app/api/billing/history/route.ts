// ============================================================
// /api/billing/history
//
// GET — this workspace's billing history, for the customer's own
//       Settings -> Billing & plan screen.
//
// Three lists, because they answer different questions and merging
// them would answer none well:
//
//   transactions — "what did AutoPay charge, and did it go through?"
//                  Razorpay payments from `billing_payments`, with the
//                  invoice link as the receipt. Only where Razorpay is
//                  configured on this deployment, and only its mode.
//   payments     — "what did I pay by UPI transfer, and was it
//                  accepted?" Receipts from `payment_requests`.
//   activity     — "why did my access or AutoPay change?" Plan changes
//                  with no receipt behind them, from `subscription_events`.
//
// Each list pages INDEPENDENTLY (`transactionsPage` / `paymentsPage` /
// `activityPage`), so reading page 3 of one does not lose the
// customer's place in another.
//
// AUTHORISATION IS MEMBER-LEVEL, matching the two existing read
// endpoints (`GET /api/billing/subscription` and
// `GET /api/billing/payment-requests`). That is a deliberate match, not
// an oversight: transacting is owner-only via `requireBillingOwner`, but
// a blocked member needs to be able to see that a payment is pending
// before they chase their owner about it. Nothing here is per-user data
// — it is all workspace-level billing state that members already reach.
//
// The security-relevant work happens in the shared readers, not here.
// `subscription_events` and `billing_payments` have RLS enabled with
// ZERO policies, so this route is deliberately overriding that with the
// service role, which makes the column projections and the event-type
// allowlist in the readers load-bearing rather than cosmetic.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { listAutopayPayments } from '@/lib/billing/razorpay/history';
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
    const razorpay = getRazorpayConfig();

    // Page numbers are clamped inside the readers rather than validated
    // here: `?paymentsPage=abc` or `-4` should quietly serve page 1, not
    // 400. A malformed pager param is never worth an error screen on a
    // page whose real content loaded fine.
    const [payments, activity, summary, transactions] = await Promise.all([
      listCustomerPaymentsPage(ctx.accountId, searchParams.get('paymentsPage')),
      listCustomerPlanActivity(ctx.accountId, searchParams.get('activityPage')),
      getCustomerPaymentSummary(ctx.accountId),
      razorpay
        ? listAutopayPayments(supabaseAdmin(), {
            accountId: ctx.accountId,
            mode: razorpay.mode,
            page: searchParams.get('transactionsPage'),
          })
        : Promise.resolve(undefined),
    ]);

    const payload: BillingHistoryPayload = {
      payments,
      activity,
      summary,
      ...(transactions ? { transactions } : {}),
    };
    return NextResponse.json(payload);
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
