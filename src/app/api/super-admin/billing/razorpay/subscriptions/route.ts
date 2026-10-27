// ============================================================
// GET /api/super-admin/billing/razorpay/subscriptions
//
// Razorpay AutoPay subscriptions, both modes from the shared database.
// Query: mode (all|test|live), status (any billing status, or `live` for
// everything that has or could charge), method, search (account name or
// a sub_/plan_/cust_ id), sort (created_at|charge_at|status_changed_at|
// amount_minor), dir, page, pageSize.
// Response: { items, total, page, pageSize, totalPages }. Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  listAdminSubscriptions,
  SUBSCRIPTION_LIST_SPEC,
} from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminJson,
} from '@/lib/billing/razorpay/admin-http';
import { parseListParams } from '@/lib/billing/razorpay/admin-query';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const params = parseListParams(
      new URL(request.url).searchParams,
      SUBSCRIPTION_LIST_SPEC
    );
    return adminJson(await listAdminSubscriptions(supabaseAdmin(), params));
  } catch (err) {
    return adminBillingErrorResponse(err, 'subscriptions list');
  }
}
