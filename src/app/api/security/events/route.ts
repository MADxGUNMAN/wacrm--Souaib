// ============================================================
// POST /api/security/events — a signed-in browser reports a security
// action that happens client side (Supabase Auth runs it directly from
// the browser, so the server never sees it), e.g. a password change.
//
// Only CLIENT_REPORTABLE_EVENTS are accepted, and only into the
// caller's own log. Everything with a server-side path (logins,
// revokes, API keys) is recorded by the server itself instead.
//
// Body: { "type": "password_changed", "timezone": "Asia/Kolkata" }
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import { getSecurityContext, recordSecurityEvent } from '@/lib/security/server';
import { CLIENT_REPORTABLE_EVENTS } from '@/lib/security/types';
import { json, readBody, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:report:${ctx.userId}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const body = await readBody(request);
    const type = CLIENT_REPORTABLE_EVENTS.find((t) => t === body.type);
    if (!type) return json({ error: 'Unsupported event type' }, 400);

    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type,
      sessionId: ctx.sessionId,
      meta: requestDeviceMeta(request.headers, body.timezone),
      metadata: { source: 'client' },
    });
    return json({ ok: true });
  } catch (err) {
    return securityErrorResponse(err, 'POST /api/security/events');
  }
}
