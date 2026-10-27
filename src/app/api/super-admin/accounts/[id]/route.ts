// ============================================================
// GET /api/super-admin/accounts/[id]
//
// Returns full deep dive data for a single account.
// Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { getAccountDeepDive } from '@/lib/super-admin/queries';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/super-admin/request-origin';
import {
  AccountDeletionError,
  DELETE_CONFIRM_WORD,
  assertDeletable,
  checkDeletionToken,
  deleteAccountRecords,
  isConfirmWord,
  isUuid,
  loadDeletionTarget,
  purgeAccountStorage,
} from '@/lib/super-admin/account-deletion';
import {
  AutopayCancelError,
  cancelLiveAutopayForAccount,
  getAutopayDeps,
} from '@/lib/billing/razorpay/account-autopay';

export async function GET(
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

    const data = await getAccountDeepDive(id);

    if (!data?.account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/accounts/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch account details' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/super-admin/accounts/[id] — permanently delete a workspace.
//
// Body: { "token": "<from /delete/verify>", "confirmation": "CONFIRM" }
//
// Super admin only, same-origin only, and only with a deletion token from
// a fresh password check for THIS account. Banned accounts are refused
// ("unban it first"), as are workspaces containing a super admin. Every
// live Razorpay AutoPay is cancelled first; if Razorpay refuses, nothing
// is deleted. The database work is one transaction (sa_delete_account);
// files are purged afterwards.
// ============================================================
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const noStore = { 'Cache-Control': 'no-store' };
  try {
    const sa = await requireSuperAdmin(request);
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: noStore }
      );
    }
    const limit = checkRateLimit(`sa:deleteAccount:${sa.userId}`, {
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Invalid account id' },
        { status: 400, headers: noStore }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      token?: unknown;
      confirmation?: unknown;
    };
    if (!checkDeletionToken(body.token, sa.userId, id)) {
      return NextResponse.json(
        {
          error: 'Your password confirmation expired. Start again.',
          code: 'reauth_required',
        },
        { status: 401, headers: noStore }
      );
    }
    if (!isConfirmWord(body.confirmation)) {
      return NextResponse.json(
        {
          error: `Type ${DELETE_CONFIRM_WORD} to confirm.`,
          code: 'confirmation_required',
        },
        { status: 400, headers: noStore }
      );
    }

    const admin = supabaseAdmin();
    const target = await loadDeletionTarget(admin, id, sa.userId);
    assertDeletable(target);

    const autopay = await cancelLiveAutopayForAccount({
      admin,
      getDeps: getAutopayDeps,
      accountId: id,
      actorUserId: sa.userId,
      context: 'account_delete',
      reason: 'Account deleted',
    });
    const autopayCancelled =
      autopay.outcome === 'cancelled'
        ? autopay.cancelled.map((c) => c.providerSubscriptionId)
        : [];
    if (autopayCancelled.length > 0) {
      console.warn('[super-admin] AutoPay cancelled before delete', {
        account: id,
        subscriptions: autopayCancelled,
        by: sa.userId,
      });
    }

    const result = await deleteAccountRecords(admin, id, sa.userId);
    console.warn('[super-admin] account permanently deleted', {
      account: id,
      members: result.memberIds.length,
      by: sa.userId,
      audit: result.auditId,
    });
    const storage = await purgeAccountStorage(admin, result, id);

    return NextResponse.json(
      {
        success: true,
        deleted_members: result.memberIds.length,
        files_deleted: storage.deleted,
        storage_cleanup_incomplete: storage.failed.length > 0,
        autopay_cancelled: autopayCancelled,
      },
      { headers: noStore }
    );
  } catch (err) {
    if (
      err instanceof AccountDeletionError ||
      err instanceof AutopayCancelError
    ) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status, headers: noStore }
      );
    }
    const res = superAdminErrorResponse(err);
    if (res) return res;
    console.error('[super-admin/accounts/[id]] DELETE error:', err);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500, headers: noStore }
    );
  }
}
