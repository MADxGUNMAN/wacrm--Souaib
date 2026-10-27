// ============================================================
// GET /api/super-admin/billing/razorpay/subscriptions/[id]
//
// One AutoPay subscription with its invoices, payments, audit trail and
// webhook events (never the webhook payload).
// Response: { subscription, invoices, payments, events, webhookEvents,
//             canAct, configuredMode }
// `canAct` is true only when this server's Razorpay keys are for the
// row's mode, which is what sync and cancel require.
// Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getAdminSubscriptionDetail } from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminError,
  adminJson,
} from '@/lib/billing/razorpay/admin-http';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { isUuid } from '@/lib/super-admin/account-deletion';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    if (!isUuid(id))
      return adminError('Invalid subscription id.', 'bad_request', 400);

    const detail = await getAdminSubscriptionDetail(supabaseAdmin(), id);
    if (!detail) return adminError('Subscription not found.', 'not_found', 404);

    const configuredMode = getRazorpayConfig()?.mode ?? null;
    return adminJson({
      ...detail,
      canAct: configuredMode === detail.subscription.mode,
      configuredMode,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'subscription detail');
  }
}
