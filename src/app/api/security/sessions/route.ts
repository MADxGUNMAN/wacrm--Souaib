// ============================================================
// GET /api/security/sessions — the caller's logged-in devices.
//
// Lists the caller's live Supabase auth sessions with device details,
// newest activity first, the calling device first. Each user only ever
// sees their own sessions (owner and members alike).
//
// Query: ?tz=<IANA zone of this browser> (optional, refines this row).
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import { getSecurityContext, listDeviceSessions } from '@/lib/security/server';
import { json, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:sessions:${ctx.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const tz = new URL(request.url).searchParams.get('tz');
    const meta = requestDeviceMeta(request.headers, tz);
    const sessions = await listDeviceSessions(ctx, meta);
    return json({ sessions, current_session_id: ctx.sessionId });
  } catch (err) {
    return securityErrorResponse(err, 'GET /api/security/sessions');
  }
}
