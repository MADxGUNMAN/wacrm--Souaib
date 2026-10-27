// RFC 9728 protected resource metadata for the AI connector's /mcp.
// Served at the root and at the path-suffixed form (…/mcp) that MCP
// clients derive from the resource URL.

import { getConfig } from '@/lib/ai-connector/config';
import {
  disabledResponse,
  getClientIp,
  limitRequest,
  metadataJson,
  preflight,
} from '@/lib/ai-connector/http';
import { protectedResourceMetadata } from '@/lib/ai-connector/oauth';
import { RATE_LIMITS } from '@/lib/rate-limit';

export function GET(request: Request) {
  const limited = limitRequest(
    `ai-meta:${getClientIp(request)}`,
    RATE_LIMITS.oauthMetadata
  );
  if (limited) return limited;
  const config = getConfig();
  if (!config.enabled) return disabledResponse();
  return metadataJson(protectedResourceMetadata(config));
}

export function OPTIONS() {
  return preflight();
}
