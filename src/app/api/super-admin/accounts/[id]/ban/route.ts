// ============================================================
// POST /api/super-admin/accounts/[id]/ban   — Ban an account
// DELETE /api/super-admin/accounts/[id]/ban — Unban an account
//
// Super admin only.
//
// POST body: { reason?, confirmAutopayCancel? }
// Banning also cancels the workspace's Razorpay AutoPay (plan D9). The
// confirmation is enforced here, not only in the UI: with a live AutoPay
// and no `confirmAutopayCancel: true`, the answer is 409
// autopay_confirmation_required and nothing is banned. With it, the ban
// happens FIRST (a Razorpay outage must never block a safety action),
// then the AutoPay is cancelled and the outcome reported as
// `autopay.outcome`: none | cancelled | failed. A failure raises a
// billing_anomaly notification for the super admins.
// Response: { success, message, autopay }
//
// Unbanning does not restore AutoPay.
// ============================================================

import { NextResponse, after } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { banAccount, unbanAccount } from '@/lib/super-admin/queries';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { isSameOrigin } from '@/lib/super-admin/request-origin';
import { isUuid } from '@/lib/super-admin/account-deletion';
import {
  AutopayCancelError,
  cancelLiveAutopayForAccount,
  cancellableAutopay,
  getAutopayDeps,
  listLiveAutopay,
  type CancelledAutopay,
} from '@/lib/billing/razorpay/account-autopay';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import { createBillingStore } from '@/lib/billing/razorpay/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

type BanAutopay =
  | { outcome: 'none' }
  | { outcome: 'cancelled'; cancelled: CancelledAutopay[] }
  | { outcome: 'failed'; code: string; message: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'bad_origin' },
        { status: 403, headers: noStore }
      );
    }
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Invalid account id' },
        { status: 400, headers: noStore }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: unknown;
      confirmAutopayCancel?: unknown;
    };
    const reason =
      (typeof body.reason === 'string' && body.reason.trim()) ||
      'No reason provided';

    const admin = supabaseAdmin();
    const live = cancellableAutopay(await listLiveAutopay(admin, id));
    if (live.length > 0 && body.confirmAutopayCancel !== true) {
      return NextResponse.json(
        {
          error:
            'This workspace has an active Razorpay AutoPay. Banning it also cancels the AutoPay at Razorpay immediately. Confirm to continue.',
          code: 'autopay_confirmation_required',
          autopay: live.map((r) => ({
            mode: r.mode,
            status: r.status,
            provider_subscription_id: r.provider_subscription_id,
          })),
        },
        { status: 409, headers: noStore }
      );
    }

    await banAccount(id, reason, sa.userId);

    let autopay: BanAutopay;
    try {
      autopay = await cancelLiveAutopayForAccount({
        admin,
        getDeps: getAutopayDeps,
        accountId: id,
        actorUserId: sa.userId,
        context: 'account_ban',
        reason,
      });
    } catch (err) {
      const code =
        err instanceof AutopayCancelError ? err.code : 'autopay_cancel_failed';
      const message =
        err instanceof AutopayCancelError
          ? err.message
          : `AutoPay could not be cancelled: ${
              err instanceof Error ? err.message : String(err)
            }`;
      console.error('[super-admin/accounts/[id]/ban] AutoPay cancel failed:', {
        account: id,
        code,
        message,
      });
      autopay = { outcome: 'failed', code, message };
      await createBillingStore(admin).notifyAdmin({
        type: 'billing_anomaly',
        severity: 'warning',
        title: 'Account banned but AutoPay was not cancelled',
        body: message,
        accountId: id,
      });
    }

    if (autopay.outcome === 'cancelled') {
      console.warn('[super-admin] AutoPay cancelled after ban', {
        account: id,
        subscriptions: autopay.cancelled.map((c) => c.providerSubscriptionId),
        by: sa.userId,
      });
      // The snapshot apply queued the customer's "AutoPay cancelled" email.
      after(async () => {
        try {
          await deliverBillingEmails(getEventDeps(), { limit: 5 });
        } catch (err) {
          console.error(
            '[super-admin/accounts/[id]/ban] email delivery failed:',
            err instanceof Error ? err.message : err
          );
        }
      });
    }

    return NextResponse.json(
      { success: true, message: 'Account banned', autopay },
      { headers: noStore }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/accounts/[id]/ban] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to ban account' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    await unbanAccount(id);

    return NextResponse.json({ success: true, message: 'Account unbanned' });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/accounts/[id]/ban] DELETE error:', err);
    return NextResponse.json(
      { error: 'Failed to unban account' },
      { status: 500 }
    );
  }
}
