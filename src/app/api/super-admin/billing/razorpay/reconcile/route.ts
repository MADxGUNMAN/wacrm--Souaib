// ============================================================
// /api/super-admin/billing/razorpay/reconcile
//
// GET  — recent reconciliation runs, newest first, with who started
//        each manual one. Query: mode, status, page, pageSize.
//        Response: { items, total, page, pageSize, totalPages }
// POST — run reconciliation now, exactly as the cron does, recorded
//        with scope `admin` and the operator.
//        Response: { mode, ms, events, subscriptions, notifications,
//                    purged, errors } (errors is a count, as in the cron)
//
// Super admin only. POST is same-origin, 3 per 10 minutes per admin.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  listReconciliationRuns,
  RECONCILIATION_RUN_LIST_SPEC,
} from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminJson,
  badOriginResponse,
} from '@/lib/billing/razorpay/admin-http';
import { parseListParams } from '@/lib/billing/razorpay/admin-query';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import { runReconciliation } from '@/lib/billing/razorpay/reconcile';
import { isSameOrigin } from '@/lib/http/request-origin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const params = parseListParams(
      new URL(request.url).searchParams,
      RECONCILIATION_RUN_LIST_SPEC
    );
    return adminJson(await listReconciliationRuns(supabaseAdmin(), params));
  } catch (err) {
    return adminBillingErrorResponse(err, 'reconciliation runs');
  }
}

export async function POST(request: Request) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) return badOriginResponse();

    const limit = checkRateLimit(`sa:billingReconcile:${sa.userId}`, {
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const deps = getEventDeps();
    const started = Date.now();
    const summary = await runReconciliation(deps, {
      deliver: () => deliverBillingEmails(deps, { limit: 20 }),
      scope: 'admin',
      triggeredBy: sa.userId,
    });
    return adminJson({
      mode: deps.config.mode,
      ms: Date.now() - started,
      events: summary.events,
      subscriptions: summary.subscriptions,
      notifications: summary.notifications,
      purged: summary.purged,
      errors: summary.errors.length,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'manual reconciliation');
  }
}
