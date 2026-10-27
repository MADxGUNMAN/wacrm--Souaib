// ============================================================
// Two-factor gate used by the proxy (src/proxy.ts).
//
// For a signed-in request to an app path, ask the database which 2FA
// the CALLER's current auth session needs (security_two_factor_gate):
//   none     → continue
//   personal → the user's own authenticator code
//   owner    → the workspace owner's authenticator code (members only,
//              when the owner turned on "Require Owner 2FA Verification")
// and whether this session already passed it. Pages redirect to
// /two-factor; API calls get 403 { code: 'two_factor_required' }.
//
// Sessions stay per user: the verdict is stored on the user's own
// session row (user_sessions), keyed by the JWT session_id.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type TwoFactorRequirement = 'none' | 'personal' | 'owner';

export interface TwoFactorGateResult {
  required: TwoFactorRequirement;
  satisfied: boolean;
}

/**
 * Paths a signed-in but not-yet-verified session may still use: the 2FA
 * page and its API, sign-out, public marketing pages, machine / webhook
 * endpoints and auth emails (token-authenticated, not session-based).
 */
const OPEN_PREFIXES = [
  '/two-factor',
  '/api/security/two-factor/challenge',
  '/api/security/two-factor/verify',
  '/api/security/sessions/logout',
  '/api/security/login-failed',
  '/api/public',
  '/api/contact',
  '/api/health',
  '/api/v1',
  '/api/whatsapp/webhook',
  '/api/auth/confirm',
  '/api/auth/confirm-email-change',
  '/api/auth/forgot-password',
  '/api/auth/signup',
  '/login',
  '/signup',
  '/forgot-password',
  '/docs',
  '/legal',
  '/integrations',
  '/contact',
  '/api-reference',
  '/privacy',
  '/terms',
  '/sitemap',
  '/robots.txt',
  '/manifest',
  '/opengraph-image',
  '/twitter-image',
  '/icon',
  '/apple-icon',
] as const;

export function isTwoFactorOpenPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return OPEN_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`) ||
      pathname.startsWith(`${p}.`) ||
      pathname.startsWith(`${p}?`)
  );
}

// ── Cache of passed checks ──────────────────────────────────────
// Only "satisfied" verdicts are cached, briefly, per user + session, so
// a signed-in user doesn't pay a database round trip on every request.
// A change that makes 2FA newly required (the owner turning on owner
// verification, a user enabling 2FA on another device) takes effect
// within GATE_CACHE_TTL_MS. Revoked sessions are unaffected: the proxy's
// getUser() rejects them before this cache is consulted.
export const GATE_CACHE_TTL_MS = 20_000;
const GATE_CACHE_MAX = 5_000;
const passed = new Map<string, number>();

export function gateCacheKey(userId: string, sessionId: string | null): string {
  return `${userId}:${sessionId ?? '-'}`;
}

export function isGateCached(key: string, now = Date.now()): boolean {
  const until = passed.get(key);
  if (until === undefined) return false;
  if (until < now) {
    passed.delete(key);
    return false;
  }
  return true;
}

export function rememberGatePassed(key: string, now = Date.now()): void {
  if (passed.size >= GATE_CACHE_MAX) {
    // Drop the oldest entries (Map keeps insertion order).
    const drop = Math.ceil(GATE_CACHE_MAX / 10);
    for (const k of [...passed.keys()].slice(0, drop)) passed.delete(k);
  }
  passed.set(key, now + GATE_CACHE_TTL_MS);
}

export function __resetTwoFactorGateCacheForTests(): void {
  passed.clear();
}

/** session_id claim from a Supabase access token (already validated). */
export function sessionIdFromAccessToken(
  token: string | undefined | null
): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8')
    ) as { session_id?: unknown };
    return typeof json.session_id === 'string' ? json.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Ask the database. Uses the caller's own (RLS) client: the SQL function
 * reads auth.uid() and the JWT session_id, so it can only ever report on
 * the caller. Fails CLOSED — an error reads as "verification needed".
 */
export async function readTwoFactorGate(
  supabase: SupabaseClient
): Promise<TwoFactorGateResult> {
  const { data, error } = await supabase.rpc('security_two_factor_gate');
  if (error) throw new Error(`two-factor gate failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    { required?: string; satisfied?: boolean } | undefined;
  const required: TwoFactorRequirement =
    row?.required === 'personal' || row?.required === 'owner'
      ? row.required
      : 'none';
  return {
    required,
    satisfied: required === 'none' || row?.satisfied === true,
  };
}
