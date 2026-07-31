// ============================================================
// GET /api/super-admin/metrics
//
// Returns platform-wide analytics metrics. Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getPlatformMetrics } from '@/lib/super-admin/queries';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const metrics = await getPlatformMetrics();
    return NextResponse.json({ metrics });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/metrics] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
