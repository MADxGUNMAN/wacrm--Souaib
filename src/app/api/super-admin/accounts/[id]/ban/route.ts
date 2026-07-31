// ============================================================
// POST /api/super-admin/accounts/[id]/ban   — Ban an account
// DELETE /api/super-admin/accounts/[id]/ban — Unban an account
//
// Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { banAccount, unbanAccount } from '@/lib/super-admin/queries';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = (body as { reason?: string }).reason || 'No reason provided';

    await banAccount(id, reason, admin.userId);

    return NextResponse.json({ success: true, message: 'Account banned' });
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
