// ============================================================
// POST /api/billing/razorpay/verify
//
// Called by the payment page with Checkout's success response
// ({ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }).
//
// What it does NOT do: grant access because the browser said so. It
// checks the signature against OUR stored subscription id, then re-reads
// the subscription, payment and invoice from api.razorpay.com and hands
// them to the same SQL functions the webhook uses. Access changes only
// if Razorpay itself reports a captured payment on a paid invoice for the
// expected amount (billing_apply_payment).
//
// Any email that produced (e.g. "AutoPay set up") is sent from after(),
// once the response is out; the cron retries it if that fails.
//
// Owner only, same-origin, rate limited.
// ============================================================

import { after, NextResponse } from 'next/server';

import { isSameOrigin } from '@/lib/http/request-origin';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import {
  getBillingDeps,
  toRazorpayErrorResponse,
} from '@/lib/billing/razorpay/runtime';
import {
  loadAutopayView,
  verifyCheckout,
} from '@/lib/billing/razorpay/service';
import { requireBillingOwner } from '@/lib/subscription/guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-site request refused', code: 'bad_origin' },
      { status: 403 }
    );
  }
  try {
    const ctx = await requireBillingOwner();

    const limit = checkRateLimit(
      `razorpay:verify:${ctx.accountId}`,
      RATE_LIMITS.razorpayVerify
    );
    if (!limit.success) return rateLimitResponse(limit);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'bad_request' },
        { status: 400 }
      );
    }

    const deps = getBillingDeps();
    const result = await verifyCheckout(deps, {
      accountId: ctx.accountId,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
      clientSubscriptionId: body.razorpay_subscription_id,
    });

    after(async () => {
      try {
        await deliverBillingEmails(getEventDeps(), { limit: 5 });
      } catch (err) {
        console.error(
          '[razorpay] verify email delivery failed:',
          err instanceof Error ? err.message : err
        );
      }
    });

    const autopay = await loadAutopayView(deps.db, result.row);
    return NextResponse.json({
      // granted | recorded | awaiting_invoice | anomaly | ...
      paymentOutcome: result.payment.outcome,
      autopay,
    });
  } catch (err) {
    return toRazorpayErrorResponse(err, 'checkout verify');
  }
}
