// Shared plumbing for the /api/ai-connectors routes (cookie session).

import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  toErrorResponse,
  type AccountContext,
} from '@/lib/auth/account';
import { canAccessSettingsSection } from '@/lib/auth/roles';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import type { Viewer } from './manage';

export const AI_SETTINGS_SECTION = 'ai-connectors';

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function fail(status: number, error: string) {
  return json({ error }, status);
}

/**
 * The signed-in viewer, or a ready error response. Members need the
 * Settings → AI Connectors permission (absent = allowed).
 */
export async function requireViewer(): Promise<
  { ctx: AccountContext; viewer: Viewer } | NextResponse
> {
  let ctx: AccountContext;
  try {
    ctx = await getCurrentAccount();
  } catch (err) {
    return toErrorResponse(err);
  }
  if (ctx.role !== 'owner') {
    const { data } = await ctx.supabase
      .from('profiles')
      .select('permissions')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const permissions = (data?.permissions ?? null) as Record<
      string,
      boolean | undefined
    > | null;
    if (!canAccessSettingsSection(ctx.role, permissions, AI_SETTINGS_SECTION)) {
      return fail(403, "You don't have access to AI connector settings.");
    }
  }
  return {
    ctx,
    viewer: { accountId: ctx.accountId, userId: ctx.userId, role: ctx.role },
  };
}

/** Per-user write limit, shared with other admin-style actions. */
export function limitWrites(userId: string): NextResponse | null {
  const r = checkRateLimit(`ai-settings:${userId}`, RATE_LIMITS.adminAction);
  return r.success ? null : rateLimitResponse(r);
}
