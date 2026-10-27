// ============================================================
// POST /api/security/sessions/revoke-others — sign out every other
// device, keeping this one signed in.
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import {
  getSecurityContext,
  markSessionsEnded,
  recordSecurityEvent,
} from '@/lib/security/server';
import { json, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:revoke:${ctx.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    // Without a session id we can't tell which one to keep, and revoking
    // all of them here would be a surprise. The browser always has one.
    if (!ctx.sessionId) {
      return json({ error: 'Current session could not be identified' }, 409);
    }

    const { data, error } = await ctx.admin.rpc(
      'security_revoke_other_auth_sessions',
      { p_user_id: ctx.userId, p_keep: ctx.sessionId }
    );
    if (error) throw new Error(`revoke others failed: ${error.message}`);
    const ids = ((data ?? []) as unknown[]).map(String);

    await markSessionsEnded(ctx.admin, ctx.userId, ids, 'revoked');
    if (ids.length > 0) {
      await recordSecurityEvent(ctx.admin, {
        userId: ctx.userId,
        accountId: ctx.accountId,
        type: 'sessions_revoked_others',
        sessionId: ctx.sessionId,
        meta: requestDeviceMeta(request.headers),
        metadata: { count: ids.length },
      });
    }
    return json({ ok: true, revoked: ids.length });
  } catch (err) {
    return securityErrorResponse(
      err,
      'POST /api/security/sessions/revoke-others'
    );
  }
}
