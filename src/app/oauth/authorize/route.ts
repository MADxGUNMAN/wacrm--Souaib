// ============================================================
// GET /oauth/authorize — start of the browser sign-in for Claude/ChatGPT.
//
// Validates the request, stores it server-side, and sends the browser to
// the consent page with only an opaque request id. Nothing from the
// query string is rendered: problems that make the redirect URI
// untrustworthy go to an error page keyed by a fixed reason; everything
// else is returned to the client as an RFC 6749 error redirect.
// ============================================================

import { NextResponse } from 'next/server';
import { resolveClient } from '@/lib/ai-connector/clients';
import { getConfig } from '@/lib/ai-connector/config';
import { getClientIp, limitRequest } from '@/lib/ai-connector/http';
import {
  authorizationRedirect,
  validateAuthorizeParams,
  type AuthorizeErrorReason,
} from '@/lib/ai-connector/oauth';
import {
  adminDb,
  createAuthorizationRequest,
  createClientStore,
} from '@/lib/ai-connector/store';
import { RATE_LIMITS } from '@/lib/rate-limit';

function redirect(url: string | URL): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

/** Our own pages are addressed via the configured issuer, not the Host
 *  header (behind nginx / the tunnel that may be the internal address). */
function ownUrl(request: Request, path: string): URL {
  return new URL(path, getConfig().issuer || request.url);
}

function errorPage(request: Request, reason: AuthorizeErrorReason) {
  const url = ownUrl(request, '/oauth/consent');
  url.searchParams.set('error', reason);
  return redirect(url);
}

export async function GET(request: Request) {
  const limited = limitRequest(
    `ai-authorize:${getClientIp(request)}`,
    RATE_LIMITS.oauthAuthorize
  );
  if (limited) return limited;

  const config = getConfig();
  if (!config.enabled) return errorPage(request, 'unavailable');

  const params = new URL(request.url).searchParams;
  const db = adminDb();
  const store = createClientStore(db);

  let result;
  try {
    result = await validateAuthorizeParams(params, config, (clientId) =>
      resolveClient(clientId, config, store)
    );
  } catch (err) {
    console.error(
      '[ai-connector] authorize validation failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return errorPage(request, 'unavailable');
  }

  if (result.kind === 'error_page') return errorPage(request, result.reason);
  if (result.kind === 'redirect_error') {
    return redirect(
      authorizationRedirect(
        result.redirectUri,
        config.issuer,
        { error: result.error, description: result.description },
        result.state
      )
    );
  }

  let requestId: string;
  try {
    requestId = await createAuthorizationRequest(db, config, {
      clientDbId: result.client.id,
      redirectUri: result.redirectUri,
      state: result.state,
      codeChallenge: result.codeChallenge,
      scopes: result.scopes,
      resource: result.resource,
      issuer: config.issuer,
    });
  } catch (err) {
    console.error(
      '[ai-connector] authorize store failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return redirect(
      authorizationRedirect(
        result.redirectUri,
        config.issuer,
        { error: 'server_error' },
        result.state
      )
    );
  }

  const consent = ownUrl(request, '/oauth/consent');
  consent.searchParams.set('request_id', requestId);
  return redirect(consent);
}
