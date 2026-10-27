// ============================================================
// DELETE /api/security/sessions/[id] — sign one device out.
//
// Deletes the caller's auth session `id` (its refresh tokens go with
// it), so that device can't refresh and is bounced to /login on its next
// request or heartbeat. Only the caller's own sessions can be revoked:
// the SQL function filters by user id as well as session id.
//
// Revoking the current device is allowed and reported as a logout;
// the browser then clears its local session.
// ============================================================

import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestDeviceMeta } from '@/lib/security/device';
import {
  getSecurityContext,
  markSessionsEnded,
  recordSecurityEvent,
  sessionIp,
} from '@/lib/security/server';
import { isUuid, json, securityErrorResponse } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSecurityContext();
    const limit = checkRateLimit(`security:revoke:${ctx.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id)) return json({ error: 'Invalid session id' }, 400);

    const targetIp = await sessionIp(ctx.admin, ctx.userId, id);
    const { data: revoked, error } = await ctx.admin.rpc(
      'security_revoke_auth_session',
      { p_user_id: ctx.userId, p_session_id: id }
    );
    if (error) throw new Error(`revoke failed: ${error.message}`);
    if (!revoked) {
      return json({ error: 'Session not found or already signed out' }, 404);
    }

    const isCurrent = id === ctx.sessionId;
    await markSessionsEnded(
      ctx.admin,
      ctx.userId,
      [id],
      isCurrent ? 'logout' : 'revoked'
    );
    await recordSecurityEvent(ctx.admin, {
      userId: ctx.userId,
      accountId: ctx.accountId,
      type: isCurrent ? 'logout' : 'session_revoked',
      sessionId: ctx.sessionId,
      targetIp: isCurrent ? null : targetIp,
      meta: requestDeviceMeta(request.headers),
      metadata: { revoked_session_id: id },
    });

    return json({ ok: true, was_current: isCurrent });
  } catch (err) {
    return securityErrorResponse(err, 'DELETE /api/security/sessions/[id]');
  }
}
