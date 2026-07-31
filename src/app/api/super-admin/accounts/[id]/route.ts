// ============================================================
// GET /api/super-admin/accounts/[id]
//
// Returns full deep dive data for a single account.
// Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getAccountDeepDive } from '@/lib/super-admin/queries';

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
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
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
