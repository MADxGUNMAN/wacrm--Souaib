// RFC 8414 authorization server metadata for the AI connector.

import { getConfig } from '@/lib/ai-connector/config';
import {
  disabledResponse,
  getClientIp,
  limitRequest,
  metadataJson,
  preflight,
} from '@/lib/ai-connector/http';
import { authorizationServerMetadata } from '@/lib/ai-connector/oauth';
import { RATE_LIMITS } from '@/lib/rate-limit';

export function GET(request: Request) {
  const limited = limitRequest(
    `ai-meta:${getClientIp(request)}`,
    RATE_LIMITS.oauthMetadata
  );
  if (limited) return limited;
  const config = getConfig();
  if (!config.enabled) return disabledResponse();
  return metadataJson(authorizationServerMetadata(config));
}

export function OPTIONS() {
  return preflight();
}
