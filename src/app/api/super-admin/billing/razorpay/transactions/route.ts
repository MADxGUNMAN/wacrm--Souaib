// ============================================================
// GET /api/super-admin/billing/razorpay/transactions
//
// Razorpay payments (authorisations and charges), both modes.
// Query: mode, status, method, kind, search, sort (created_at|amount_minor|captured_at), dir, page, pageSize.
// Response: { items, total, page, pageSize, totalPages }. Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  listAdminPayments,
  PAYMENT_LIST_SPEC,
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
      PAYMENT_LIST_SPEC
    );
    return adminJson(await listAdminPayments(supabaseAdmin(), params));
  } catch (err) {
    return adminBillingErrorResponse(err, 'transactions list');
  }
}
