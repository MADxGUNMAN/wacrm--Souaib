// ============================================================
// POST /api/super-admin/billing/razorpay/subscriptions/[id]/sync
//
// Re-read this subscription and its recent invoices from Razorpay and
// apply anything not applied yet (the same refresh reconciliation runs).
// Audited as a billing_admin_action with the operator.
// Response: { subscription, applied }
// Super admin only, same-origin, 30 per 10 minutes per admin.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { adminSyncSubscription } from '@/lib/billing/razorpay/admin';
import {
  adminAudit,
  getAdminSubscription,
} from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminError,
  adminJson,
  badOriginResponse,
} from '@/lib/billing/razorpay/admin-http';
import { getBillingDeps } from '@/lib/billing/razorpay/runtime';
import { isSameOrigin } from '@/lib/http/request-origin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUuid } from '@/lib/super-admin/account-deletion';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) return badOriginResponse();

    const limit = checkRateLimit(`sa:billingSync:${sa.userId}`, {
      limit: 30,
      windowMs: 10 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id))
      return adminError('Invalid subscription id.', 'bad_request', 400);

    const deps = getBillingDeps();
    const row = await deps.db.getSubscription(id);
    if (!row) return adminError('Subscription not found.', 'not_found', 404);

    const admin = supabaseAdmin();
    const result = await adminSyncSubscription(deps, row, {
      actorUserId: sa.userId,
      audit: (accountId, billingSubscriptionId, actorUserId, note) =>
        adminAudit(admin, {
          accountId,
          billingSubscriptionId,
          actorUserId,
          note,
        }),
    });

    return adminJson({
      subscription: await getAdminSubscription(admin, id),
      applied: result.applied,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'subscription sync');
  }
}
