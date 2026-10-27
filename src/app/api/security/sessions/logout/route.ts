// ============================================================
// POST /api/security/sessions/logout — called by the browser just before
// it signs out, so the logout lands in the activity log.
//
// Body: { "scope": "local" | "global" }
//   local  — this device only. The browser's own signOut() then ends the
//            auth session; we only record it.
//   global — every device, this one included. Sessions are revoked here
//            (so it works even if the browser's call fails), then the
//            browser clears its local copy.
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import {
  getSecurityContext,
  markSessionsEnded,
  recordSecurityEvent,
} from '@/lib/security/server';
import { json, readBody, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:logout:${ctx.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const body = await readBody(request);
    const global = body.scope === 'global';
    const meta = requestDeviceMeta(request.headers, body.timezone);

    if (global) {
      const { data, error } = await ctx.admin.rpc(
        'security_revoke_other_auth_sessions',
        { p_user_id: ctx.userId, p_keep: null }
      );
      if (error) throw new Error(`logout all failed: ${error.message}`);
      const ids = ((data ?? []) as unknown[]).map(String);
      await markSessionsEnded(ctx.admin, ctx.userId, ids, 'logout_all');
      await recordSecurityEvent(ctx.admin, {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'logout_all',
        sessionId: ctx.sessionId,
        meta,
        metadata: { count: ids.length },
      });
      return json({ ok: true, revoked: ids.length });
    }

    if (ctx.sessionId) {
      await markSessionsEnded(ctx.admin, ctx.userId, [ctx.sessionId], 'logout');
    }
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: 'logout',
      sessionId: ctx.sessionId,
      meta,
    });
    return json({ ok: true });
  } catch (err) {
    return securityErrorResponse(err, 'POST /api/security/sessions/logout');
  }
}
