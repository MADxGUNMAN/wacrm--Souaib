// ============================================================
// GET /api/super-admin/billing/razorpay/invoices
//
// Razorpay subscription invoices, both modes.
// Query: mode, status, search, sort (created_at|billing_end|amount_minor), dir, page, pageSize.
// Response: { items, total, page, pageSize, totalPages }. Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  listAdminInvoices,
  INVOICE_LIST_SPEC,
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
      INVOICE_LIST_SPEC
    );
    return adminJson(await listAdminInvoices(supabaseAdmin(), params));
  } catch (err) {
    return adminBillingErrorResponse(err, 'invoices list');
  }
}
