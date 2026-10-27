// ============================================================
// GET /api/billing/razorpay/status
//
// The workspace's AutoPay state, for polling while a payment confirms.
//
// Reads our database. When the subscription is still in flight and was
// last synced more than 30 s ago, it first re-reads Razorpay (the
// subscription and its recent invoices) and applies anything new through
// the same SQL functions as the webhook. That is what lets a customer get
// access promptly even if a webhook is late or missing (plan section 3.8).
//
// Any member may read it (matches the other billing reads). Rate limited.
// ============================================================

import { after, NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import {
  getBillingDeps,
  toRazorpayErrorResponse,
} from '@/lib/billing/razorpay/runtime';
import {
  loadAutopayView,
  refreshSubscription,
  shouldRefresh,
} from '@/lib/billing/razorpay/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const limit = checkRateLimit(
      `razorpay:status:${ctx.accountId}`,
      RATE_LIMITS.razorpayStatus
    );
    if (!limit.success) return rateLimitResponse(limit);

    if (!getRazorpayConfig()) {
      return NextResponse.json({ autopay: null, stale: false });
    }
    const deps = getBillingDeps();
    const now = new Date();
    let row = await deps.db.getLatestSubscription(
      ctx.accountId,
      deps.config.mode
    );
    let stale = false;

    if (row && shouldRefresh(row, now)) {
      try {
        await refreshSubscription(deps, row, 'reconciliation');
        row = await deps.db.getSubscription(row.id);
        // A refresh can apply a charge or a status change that enqueued
        // an email; send it now rather than at the next cron tick.
        after(async () => {
          try {
            await deliverBillingEmails(getEventDeps(), { limit: 5 });
          } catch (err) {
            console.error(
              '[razorpay] status email delivery failed:',
              err instanceof Error ? err.message : err
            );
          }
        });
      } catch (err) {
        // Razorpay unreachable: answer from what we have, and say so.
        stale = true;
        console.error(
          '[razorpay] status refresh failed:',
          err instanceof Error ? err.message : err
        );
      }
    }

    const autopay = await loadAutopayView(deps.db, row, now);
    return NextResponse.json({ autopay, stale });
  } catch (err) {
    return toRazorpayErrorResponse(err, 'status');
  }
}
