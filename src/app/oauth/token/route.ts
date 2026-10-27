// ============================================================
// POST /oauth/token — authorization_code and refresh_token grants.
// Form-encoded per RFC 6749; public clients (PKCE, no secret).
// ============================================================

import { getConfig } from '@/lib/ai-connector/config';
import { onTokenEvent } from '@/lib/ai-connector/events';
import {
  disabledResponse,
  getClientIp,
  limitRequest,
  oauthJson,
  preflight,
  readForm,
} from '@/lib/ai-connector/http';
import { handleTokenRequest, type TokenDeps } from '@/lib/ai-connector/oauth';
import {
  adminDb,
  claimAuthorizationCode,
  createClientStore,
  findAuthorizationCode,
  getConnection,
  issueTokenPair,
  revokeConnection,
  rotateRefreshToken,
} from '@/lib/ai-connector/store';
import { RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limited = limitRequest(
    `ai-token:${getClientIp(request)}`,
    RATE_LIMITS.oauthToken
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
  const clients = createClientStore(db);
  const deps: TokenDeps = {
    findClient: (clientId) => clients.findByClientId(clientId),
    findCode: (code) => findAuthorizationCode(db, config, code),
    claimCode: (hash) => claimAuthorizationCode(db, hash),
    getConnection: (id) => getConnection(db, id),
    revokeConnection: (id, reason) => revokeConnection(db, id, reason),
    issueTokens: async (input) => {
      const { accessToken, refreshToken, expiresIn } = await issueTokenPair(
        db,
        config,
        input
      );
      return { accessToken, refreshToken, expiresIn };
    },
    rotateRefresh: (token, expected) =>
      rotateRefreshToken(db, config, token, expected),
    onEvent: (event) => onTokenEvent(db, event),
  };

  try {
    const result = await handleTokenRequest(form, config, deps);
    return oauthJson(result.body, result.status, result.headers);
  } catch (err) {
    console.error(
      '[ai-connector] token request failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return oauthJson({ error: 'server_error' }, 500);
  }
}

export function OPTIONS() {
  return preflight();
}
