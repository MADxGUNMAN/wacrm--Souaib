// ============================================================
// GET /api/super-admin/metrics
//
// Returns platform-wide analytics metrics. Super admin only.
// ============================================================

import { NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { getPlatformMetrics } from '@/lib/super-admin/queries';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const metrics = await getPlatformMetrics();
    return NextResponse.json({ metrics });
  } catch (err) {
    // Auth failures and server misconfiguration each carry their own
    // status and message. Previously anything that was not a NextResponse
    // became a flat 500 "Failed to fetch metrics", so a missing
    // service-role key and a genuine permission problem were
    // indistinguishable from the dashboard.
    const known = superAdminErrorResponse(err);
    if (known) return known;

    console.error('[super-admin/metrics] error:', err);
    return NextResponse.json(
      {
        error: `Failed to fetch metrics: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
        code: 'metrics_query_failed',
      },
      { status: 500 }
    );
  }
}
