// ============================================================
// GET /api/super-admin/growth
//
// Returns signup growth data over time for charts.
// Super admin only.
//
// Query params:
//   days - Number of days to look back (default: 30, max: 365)
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getSignupsOverTime } from '@/lib/super-admin/queries';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, parseInt(searchParams.get('days') ?? '30', 10))
    );

    const data = await getSignupsOverTime(days);

    return NextResponse.json({ growth: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/growth] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch growth data' },
      { status: 500 }
    );
  }
}
