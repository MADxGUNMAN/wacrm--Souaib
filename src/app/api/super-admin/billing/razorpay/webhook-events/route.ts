// ============================================================
// GET /api/super-admin/billing/razorpay/webhook-events
//
// Stored Razorpay webhook events, both modes. Never returns `payload`
// (it can hold customer email, phone and VPA).
// Query: mode, status (received|processing|processed|ignored|failed|
// dead), anomaly=1, search (account name, an evt_ id, or a sub_/pay_/
// inv_/rfnd_/disp_ id the event names), dir, page, pageSize.
// Response: { items, total, page, pageSize, totalPages }. Super admin only.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  listAdminWebhookEvents,
  WEBHOOK_EVENT_LIST_SPEC,
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
    const sp = new URL(request.url).searchParams;
    const params = parseListParams(sp, WEBHOOK_EVENT_LIST_SPEC);
    return adminJson(
      await listAdminWebhookEvents(supabaseAdmin(), params, {
        anomalyOnly: sp.get('anomaly') === '1',
      })
    );
  } catch (err) {
    return adminBillingErrorResponse(err, 'webhook events list');
  }
}
