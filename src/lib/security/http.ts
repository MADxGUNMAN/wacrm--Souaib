// Small helpers shared by the /api/security/* routes.

import { NextResponse } from 'next/server';
import { SecurityAuthError } from './server';
import { MissingServerConfigError } from '@/lib/auth/admin-client';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function securityErrorResponse(
  err: unknown,
  where: string
): NextResponse {
  if (err instanceof SecurityAuthError) {
    return json({ error: 'Not signed in', code: 'not_authenticated' }, 401);
  }
  if (err instanceof MissingServerConfigError) {
    return json({ error: 'Server misconfigured' }, 503);
  }
  console.error(`[${where}]`, err);
  return json({ error: 'Something went wrong' }, 500);
}

/** JSON body or {} (never throws). Bodies here are tiny. */
export async function readBody(
  request: Request
): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text || text.length > 4096) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);
