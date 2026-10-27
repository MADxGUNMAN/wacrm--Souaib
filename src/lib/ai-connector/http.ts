// ============================================================
// AI connector — shared HTTP plumbing for the OAuth and MCP routes.
//
// The OAuth endpoints are called by machines (Claude's and ChatGPT's
// backends, MCP Inspector in a browser), never with cookies, so they
// answer with permissive CORS and `Cache-Control: no-store`.
// ============================================================

import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  rateLimitResponse,
  type RateLimitOptions,
} from '@/lib/rate-limit';
import { NO_STORE_HEADERS } from './oauth';

/** Public endpoints carry no credentials, so any origin may read them. */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, MCP-Protocol-Version',
  'Access-Control-Max-Age': '600',
} as const;

/**
 * Best-effort client IP for rate limiting. nginx (prod) sets X-Real-IP,
 * the Cloudflare tunnel (devcrm) sets CF-Connecting-IP.
 */
export function getClientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

export function oauthJson(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...CORS_HEADERS, ...extra },
  });
}

/** Metadata documents: cacheable for a few minutes. */
export function metadataJson(body: unknown): NextResponse {
  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
  });
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS } });
}

/** Feature off (or misconfigured): fail closed with a standard error. */
export function disabledResponse(): NextResponse {
  return oauthJson(
    {
      error: 'temporarily_unavailable',
      error_description: 'The Replai AI connector is not available.',
    },
    503,
    { 'Retry-After': '300' }
  );
}

/** Null when allowed; otherwise the 429 to return. */
export function limitRequest(
  key: string,
  options: RateLimitOptions
): NextResponse | null {
  const result = checkRateLimit(key, options);
  if (result.success) return null;
  const res = rateLimitResponse(result);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

const MAX_BODY_BYTES = 16 * 1024;

async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES ? null : text;
}

/** application/x-www-form-urlencoded body, or null if missing/oversized. */
export async function readForm(
  request: Request
): Promise<URLSearchParams | null> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/x-www-form-urlencoded')) return null;
  const text = await readCapped(request);
  return text === null ? null : new URLSearchParams(text);
}

/** JSON body, or undefined if missing/oversized/invalid. */
export async function readJson(request: Request): Promise<unknown> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) return undefined;
  const text = await readCapped(request);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
