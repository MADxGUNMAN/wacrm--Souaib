// ============================================================
// POST /api/security/sessions/heartbeat — "this device is active".
//
// Sent by the signed-in app on load and every few minutes while the tab
// is visible. Registers the session on first sight (which records the
// "login" event) and refreshes last-active, IP and timezone. Writes are
// throttled server side (HEARTBEAT_MIN_INTERVAL_MS).
//
// A revoked device gets 401 here (getUser fails once its auth session is
// deleted), which tells the browser to sign itself out.
//
// Body: { "timezone": "Asia/Kolkata" }
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import { getSecurityContext, touchCurrentSession } from '@/lib/security/server';
import { json, readBody, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:heartbeat:${ctx.userId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const body = await readBody(request);
    const meta = requestDeviceMeta(request.headers, body.timezone);
    const { registered } = await touchCurrentSession(ctx, meta);
    return json({ ok: true, session_id: ctx.sessionId, registered });
  } catch (err) {
    return securityErrorResponse(err, 'POST /api/security/sessions/heartbeat');
  }
}
