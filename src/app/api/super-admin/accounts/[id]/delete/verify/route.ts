// ============================================================
// POST /api/super-admin/accounts/[id]/delete/verify
//
// Step 1 of deleting a workspace: the super admin re-enters their
// password (plus their authenticator code if they use 2FA). Returns a
// short-lived deletion token bound to this admin and this account, which
// the DELETE call requires, plus live_autopay: the Razorpay AutoPay the
// DELETE will cancel first. Refuses banned and protected accounts.
//
// Body: { "password": "...", "code"?: "123456" }
// Super admin only. 5 attempts per 15 minutes per admin.
// ============================================================

import { NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/super-admin/request-origin';
import {
  AccountDeletionError,
  assertDeletable,
  isUuid,
  issueDeletionToken,
  loadDeletionTarget,
} from '@/lib/super-admin/account-deletion';
import { verifySuperAdminReauth } from '@/lib/super-admin/reauth';
import {
  cancellableAutopay,
  listLiveAutopay,
} from '@/lib/billing/razorpay/account-autopay';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403);

    const limit = checkRateLimit(`sa:deleteVerify:${sa.userId}`, {
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id)) return json({ error: 'Invalid account id' }, 400);

    const admin = supabaseAdmin();
    assertDeletable(await loadDeletionTarget(admin, id, sa.userId));

    const body = (await request.json().catch(() => ({}))) as {
      password?: unknown;
      code?: unknown;
    };
    const reauth = await verifySuperAdminReauth(
      admin,
      sa,
      { password: body.password, code: body.code },
      'super-admin delete',
      { account: id }
    );
    if (!reauth.ok) {
      return json({ error: reauth.error, code: reauth.code }, reauth.status);
    }

    const { token, expiresAt } = issueDeletionToken(sa.userId, id);
    // Informational: the DELETE cancels these first and refuses if it can't.
    const liveAutopay = cancellableAutopay(
      await listLiveAutopay(admin, id)
    ).map((r) => ({
      mode: r.mode,
      status: r.status,
      provider_subscription_id: r.provider_subscription_id,
    }));
    return json({ token, expires_at: expiresAt, live_autopay: liveAutopay });
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    const res = superAdminErrorResponse(err);
    if (res) return res;
    console.error('[super-admin delete verify] error:', err);
    return json({ error: 'Could not verify. Try again.' }, 500);
  }
}
