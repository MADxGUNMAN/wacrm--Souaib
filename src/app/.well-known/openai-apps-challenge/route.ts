// OpenAI plugin directory domain verification (07 §4.2).
//
// The submission portal asks for an exact token served as plain text at
// https://<mcp host>/.well-known/openai-apps-challenge. The token comes
// from OPENAI_APPS_CHALLENGE_TOKEN so it can be set on the server
// without a code change; unset → 404. The token is public by design.

import { getClientIp, limitRequest } from '@/lib/ai-connector/http';
import { RATE_LIMITS } from '@/lib/rate-limit';

const TOKEN_RE = /^[A-Za-z0-9._~-]{8,512}$/;

export function GET(request: Request) {
  const limited = limitRequest(
    `ai-meta:${getClientIp(request)}`,
    RATE_LIMITS.oauthMetadata
  );
  if (limited) return limited;
  const token = (process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? '').trim();
  if (!TOKEN_RE.test(token))
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  return new Response(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
