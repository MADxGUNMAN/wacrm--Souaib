// ============================================================
// POST /api/super-admin/billing/razorpay/webhook-events/[id]/retry
//
// Put a failed or dead webhook event back in the queue (attempts reset,
// who and when recorded, previous error kept) and process it from
// after(). Processing refetches from Razorpay, so a retry is as safe as
// the original delivery. Processed and ignored events cannot be retried.
// Response: { outcome: 'requeued', id }
// Super admin only, same-origin, 30 per 10 minutes per admin.
// ============================================================

import { after } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  getWebhookEventBrief,
  requeueWebhookEvent,
} from '@/lib/billing/razorpay/admin-db';
import {
  adminBillingErrorResponse,
  adminError,
  adminJson,
  badOriginResponse,
} from '@/lib/billing/razorpay/admin-http';
import { processDueWebhookEvents } from '@/lib/billing/razorpay/events';
import { getEventDeps } from '@/lib/billing/razorpay/jobs';
import { isSameOrigin } from '@/lib/http/request-origin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUuid } from '@/lib/super-admin/account-deletion';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_RETRYABLE = 'Only failed or dead events can be retried.';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) return badOriginResponse();

    const limit = checkRateLimit(`sa:billingRetry:${sa.userId}`, {
      limit: 30,
      windowMs: 10 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id)) return adminError('Invalid event id.', 'bad_request', 400);

    const deps = getEventDeps();
    const admin = supabaseAdmin();
    const event = await getWebhookEventBrief(admin, id);
    if (!event) return adminError('Webhook event not found.', 'not_found', 404);
    if (event.mode !== deps.config.mode) {
      return adminError(
        `This event is in ${event.mode} mode, and this server is set up for ${deps.config.mode} mode. Retry it on the server where ${event.mode} mode is set up.`,
        'mode_unavailable',
        409
      );
    }

    const result = await requeueWebhookEvent(admin, id, sa.userId);
    if (result.outcome === 'not_found')
      return adminError('Webhook event not found.', 'not_found', 404);
    if (result.outcome === 'not_retryable')
      return adminError(NOT_RETRYABLE, 'not_retryable', 409);

    after(async () => {
      try {
        await processDueWebhookEvents(deps, { limit: 1, id });
      } catch (err) {
        console.error(
          '[razorpay admin] webhook retry failed:',
          err instanceof Error ? err.message : err
        );
      }
    });

    return adminJson({ outcome: 'requeued', id });
  } catch (err) {
    return adminBillingErrorResponse(err, 'webhook retry');
  }
}
