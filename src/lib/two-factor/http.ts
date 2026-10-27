// Shared plumbing for /api/security/two-factor/* routes.

import type { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  requestDeviceMeta,
  type RequestDeviceMeta,
} from '@/lib/security/device';
import {
  getSecurityContext,
  type SecurityContext,
} from '@/lib/security/server';
import { json, readBody, securityErrorResponse } from '@/lib/security/http';
import { readTwoFactorGate, type TwoFactorGateResult } from './gate';
import { TwoFactorError } from './server';

/** Code-checking routes: 10 tries per 15 minutes per user. */
export const CODE_ATTEMPT_LIMIT = { limit: 10, windowMs: 15 * 60_000 } as const;

export interface TwoFactorRouteArgs {
  ctx: SecurityContext;
  gate: TwoFactorGateResult;
  meta: RequestDeviceMeta;
  body: Record<string, unknown>;
}

export async function twoFactorRoute(
  request: Request,
  where: string,
  limit: { key: string; limit: number; windowMs: number } | null,
  handler: (args: TwoFactorRouteArgs) => Promise<unknown>
): Promise<NextResponse> {
  try {
    const ctx = await getSecurityContext();
    if (limit) {
      const r = checkRateLimit(`2fa:${limit.key}:${ctx.userId}`, limit);
      if (!r.success) return rateLimitResponse(r);
    }
    const supabase = await createClient();
    const gate = await readTwoFactorGate(supabase);
    const body = request.method === 'GET' ? {} : await readBody(request);
    const meta = requestDeviceMeta(request.headers, body.timezone);
    const result = await handler({ ctx, gate, meta, body });
    return json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof TwoFactorError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    return securityErrorResponse(err, where);
  }
}

/** Routes that change 2FA settings need a session that already passed 2FA. */
export function requireVerifiedSession(gate: TwoFactorGateResult): void {
  if (!gate.satisfied) {
    throw new TwoFactorError(
      'Finish two-factor verification first.',
      403,
      'two_factor_required'
    );
  }
}
