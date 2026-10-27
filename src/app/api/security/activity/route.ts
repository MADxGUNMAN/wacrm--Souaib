// ============================================================
// GET /api/security/activity — the caller's login & security activity.
//
// Query: page (1-based), page_size (10|25|50|100), ip (substring),
//        type (one SecurityEventType).
// Only the caller's own events are returned.
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  getSecurityContext,
  listSecurityEvents,
  pruneUserSecurityData,
} from '@/lib/security/server';
import { PAGE_SIZES, isSecurityEventType } from '@/lib/security/types';
import { json, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

const MAX_PAGE = 10_000;

export async function GET(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:activity:${ctx.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const sp = new URL(request.url).searchParams;
    const pageSizeRaw = Number(sp.get('page_size'));
    const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? pageSizeRaw
      : 25;
    const pageRaw = Math.floor(Number(sp.get('page')));
    const page =
      Number.isFinite(pageRaw) && pageRaw >= 1
        ? Math.min(pageRaw, MAX_PAGE)
        : 1;
    const type = sp.get('type');

    // Retention runs on the first page only, so paging stays cheap.
    if (page === 1) await pruneUserSecurityData(ctx.admin, ctx.userId);

    const result = await listSecurityEvents(ctx, {
      page,
      pageSize,
      ip: sp.get('ip'),
      type: isSecurityEventType(type) ? type : null,
    });
    return json(result);
  } catch (err) {
    return securityErrorResponse(err, 'GET /api/security/activity');
  }
}
