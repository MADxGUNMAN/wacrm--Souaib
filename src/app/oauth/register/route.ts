// ============================================================
// POST /oauth/register — restricted Dynamic Client Registration (RFC 7591).
//
// Fallback for clients that don't use Client ID Metadata Documents.
// Trust comes only from where codes can be delivered: every redirect URI
// on claude.ai / chatgpt.com → trusted for that platform; anything else
// is accepted only when AI_CONNECTOR_ALLOW_DEV_CLIENTS is on (dev).
// ============================================================

import { validateDcrRequest } from '@/lib/ai-connector/clients';
import { getConfig } from '@/lib/ai-connector/config';
import {
  disabledResponse,
  getClientIp,
  limitRequest,
  oauthJson,
  preflight,
  readJson,
} from '@/lib/ai-connector/http';
import { registrationResponse } from '@/lib/ai-connector/oauth';
import { adminDb, saveDcrClient } from '@/lib/ai-connector/store';
import { RATE_LIMITS } from '@/lib/rate-limit';

/** Only these registration fields are kept on the stored row. */
function storedMetadata(body: Record<string, unknown>) {
  const pick = (k: string) =>
    typeof body[k] === 'string' ? (body[k] as string).slice(0, 200) : undefined;
  return {
    client_name: pick('client_name'),
    client_uri: pick('client_uri'),
    software_id: pick('software_id'),
    software_version: pick('software_version'),
  };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited =
    limitRequest(`ai-register:${ip}`, RATE_LIMITS.oauthRegister) ??
    limitRequest('ai-register:global', RATE_LIMITS.oauthRegisterGlobal);
  if (limited) return limited;

  const config = getConfig();
  if (!config.enabled) return disabledResponse();
  if (!config.dcrEnabled) {
    return oauthJson(
      {
        error: 'invalid_request',
        error_description: 'Dynamic client registration is disabled.',
      },
      403
    );
  }

  const body = await readJson(request);
  const result = validateDcrRequest(body, config);
  if (!result.ok) {
    const error =
      result.error === 'invalid_redirect_uri'
        ? 'invalid_redirect_uri'
        : 'invalid_client_metadata';
    return oauthJson({ error }, 400);
  }

  try {
    const client = await saveDcrClient(
      adminDb(),
      result.value,
      storedMetadata(body as Record<string, unknown>)
    );
    return oauthJson(registrationResponse(client), 201);
  } catch (err) {
    console.error(
      '[ai-connector] registration failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return oauthJson({ error: 'server_error' }, 500);
  }
}

export function OPTIONS() {
  return preflight();
}
