// ============================================================
// GET /api/super-admin/health
//
// Returns health dashboard data. Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getHealthDashboardData } from '@/lib/super-admin/queries';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const data = await getHealthDashboardData();
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/health] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch health data' },
      { status: 500 }
    );
  }
}
