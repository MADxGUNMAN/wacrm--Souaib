// ============================================================
// GET /api/super-admin/billing/razorpay/overview
//
// Counts for the Payments Overview tab (billing_admin_overview), keyed
// by mode, plus which Razorpay mode this server is set up for. Works
// where Razorpay is not configured (configured: false, mode: null).
// Response: { configured, mode, overview }
// Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getBillingOverview } from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminJson,
} from '@/lib/billing/razorpay/admin-http';
import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const config = getRazorpayConfig();
    const overview = await getBillingOverview(supabaseAdmin());
    return adminJson({
      configured: config !== null,
      mode: config?.mode ?? null,
      overview,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'overview');
  }
}
