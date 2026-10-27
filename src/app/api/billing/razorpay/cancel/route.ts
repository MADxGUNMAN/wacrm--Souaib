// ============================================================
// POST /api/billing/razorpay/cancel  { confirm: true }
//
// Stops this workspace's AutoPay at Razorpay. Access already paid for is
// kept to its end date (D3): see src/lib/billing/razorpay/lifecycle.ts
// for why the Razorpay cancel is immediate. The "AutoPay cancelled"
// email is sent from after().
//
// Owner only, same-origin, 5 per hour.
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
import { cancelAutopay } from '@/lib/billing/razorpay/lifecycle';
import {
  getBillingDeps,
  toRazorpayErrorResponse,
} from '@/lib/billing/razorpay/runtime';
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
      `razorpay:manage:${ctx.accountId}`,
      RATE_LIMITS.razorpayManage
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

    const result = await cancelAutopay(getBillingDeps(), {
      accountId: ctx.accountId,
      confirm: body.confirm,
    });

    after(async () => {
      try {
        await deliverBillingEmails(getEventDeps(), { limit: 5 });
      } catch (err) {
        console.error(
          '[razorpay] cancel email delivery failed:',
          err instanceof Error ? err.message : err
        );
      }
    });

    return NextResponse.json(result);
  } catch (err) {
    return toRazorpayErrorResponse(err, 'autopay cancel');
  }
}
