// ============================================================
// POST /api/super-admin/billing/razorpay/subscriptions/[id]/cancel
//
// Body: { password, code?, reason, confirm: true }
//
// Cancels this AutoPay at Razorpay immediately (see
// src/lib/billing/razorpay/admin.ts for why it is never "at cycle end").
// Access already paid for is untouched. The super admin re-enters their
// password (and 2FA code) in the same call; the typed reason goes into
// the audit row. The customer's "AutoPay cancelled" email is sent from
// after().
// Response: { subscription, alreadyCancelled, synced }
// Super admin only, same-origin, 5 per 15 minutes per admin (counted
// before the password check, like account deletion).
// ============================================================

import { after } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { adminCancelSubscription } from '@/lib/billing/razorpay/admin';
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
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import { getBillingDeps } from '@/lib/billing/razorpay/runtime';
import { isSameOrigin } from '@/lib/http/request-origin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUuid } from '@/lib/super-admin/account-deletion';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { verifySuperAdminReauth } from '@/lib/super-admin/reauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON_MIN = 5;
const REASON_MAX = 500;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) return badOriginResponse();

    const limit = checkRateLimit(`sa:billingCancel:${sa.userId}`, {
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id))
      return adminError('Invalid subscription id.', 'bad_request', 400);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return adminError('Invalid JSON body.', 'bad_request', 400);
    }
    if (!body || typeof body !== 'object') {
      return adminError('Invalid JSON body.', 'bad_request', 400);
    }

    if (body.confirm !== true) {
      return adminError(
        'Please confirm that you want to cancel this AutoPay.',
        'confirmation_required',
        400
      );
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < REASON_MIN) {
      return adminError(
        'Type a reason of at least 5 characters.',
        'reason_required',
        400
      );
    }
    if (reason.length > REASON_MAX) {
      return adminError(
        'Keep the reason to 500 characters or fewer.',
        'reason_required',
        400
      );
    }

    const admin = supabaseAdmin();
    const reauth = await verifySuperAdminReauth(
      admin,
      sa,
      { password: body.password, code: body.code },
      'super-admin autopay cancel',
      { subscription: id }
    );
    if (!reauth.ok) return adminError(reauth.error, reauth.code, reauth.status);

    const deps = getBillingDeps();
    const row = await deps.db.getSubscription(id);
    if (!row) return adminError('Subscription not found.', 'not_found', 404);

    const result = await adminCancelSubscription(deps, row, {
      actorUserId: sa.userId,
      reason,
      audit: (accountId, billingSubscriptionId, actorUserId, note) =>
        adminAudit(admin, {
          accountId,
          billingSubscriptionId,
          actorUserId,
          note,
        }),
    });
    console.warn('[super-admin] AutoPay cancelled by admin', {
      admin: sa.userId,
      subscription: id,
      provider_subscription_id: row.provider_subscription_id,
      mode: row.mode,
      already_cancelled: result.alreadyCancelled,
    });

    after(async () => {
      try {
        await deliverBillingEmails(getEventDeps(), { limit: 5 });
      } catch (err) {
        console.error(
          '[razorpay admin] cancel email delivery failed:',
          err instanceof Error ? err.message : err
        );
      }
    });

    return adminJson({
      subscription: await getAdminSubscription(admin, id),
      alreadyCancelled: result.alreadyCancelled,
      synced: result.synced,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'autopay cancel');
  }
}
