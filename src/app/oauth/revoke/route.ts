// ============================================================
// POST /oauth/revoke — token revocation (RFC 7009).
//
// A platform revokes its token when the user disconnects Replai there,
// so the whole connection is revoked (reason `client_revoked`). Answers
// 200 for unknown tokens too, so it can't be used to probe tokens.
// ============================================================

import { writeAudit } from '@/lib/ai-connector/audit';
import { getConfig } from '@/lib/ai-connector/config';
import {
  disabledResponse,
  getClientIp,
  limitRequest,
  oauthJson,
  preflight,
  readForm,
} from '@/lib/ai-connector/http';
import { handleRevokeRequest } from '@/lib/ai-connector/oauth';
import {
  adminDb,
  getConnection,
  revokeByToken,
} from '@/lib/ai-connector/store';
import { RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = limitRequest(
    `ai-revoke:${getClientIp(request)}`,
    RATE_LIMITS.oauthRevoke
  );
  if (limited) return limited;

  const config = getConfig();
  if (!config.enabled) return disabledResponse();

  const form = await readForm(request);
  if (!form) {
    return oauthJson(
      {
        error: 'invalid_request',
        error_description:
          'Expected an application/x-www-form-urlencoded body.',
      },
      400
    );
  }

  const db = adminDb();
  try {
    const result = await handleRevokeRequest(form, async (token) => {
      const connectionId = await revokeByToken(db, config, token);
      if (!connectionId) return;
      const conn = await getConnection(db, connectionId);
      if (conn) {
        await writeAudit(db, {
          accountId: conn.account_id,
          connectionId,
          userId: conn.user_id,
          platform: conn.platform,
          action: 'oauth.revoked_by_client',
          outcome: 'ok',
        });
      }
    });
    return oauthJson(result.body, result.status, result.headers);
  } catch (err) {
    console.error(
      '[ai-connector] revoke failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return oauthJson({ error: 'server_error' }, 500);
  }
}

export function OPTIONS() {
  return preflight();
}
