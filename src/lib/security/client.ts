// ============================================================
// Browser side of security sessions + activity.
//
// - heartbeat: tells the server this device is active (and registers a
//   new sign-in). A 401 that the Auth server confirms means this device
//   was signed out from another device, so we clear the local session.
// - audited sign-out: records the logout before ending the session.
// - reports for actions Supabase runs client side (password change,
//   failed sign-in).
//
// Every call is best effort and time-boxed: security logging must never
// block or break signing in or out.
// ============================================================

import { createClient } from '@/lib/supabase/client';

const REQUEST_TIMEOUT_MS = 4000;

export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function post(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timezone: browserTimezone() }),
      credentials: 'same-origin',
      keepalive: true,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type HeartbeatResult = 'ok' | 'revoked' | 'skipped';

/**
 * Ping the server. Returns 'revoked' only when the Auth server itself
 * confirms the session is gone; network errors and other failures are
 * 'skipped' so a flaky connection never signs anyone out.
 */
export async function sendHeartbeat(): Promise<HeartbeatResult> {
  const res = await post('/api/security/sessions/heartbeat', {});
  if (!res) return 'skipped';
  if (res.ok) return 'ok';
  if (res.status !== 401) return 'skipped';
  try {
    const { error } = await createClient().auth.getUser();
    const status = (error as { status?: number } | null)?.status;
    if (error && (status === 401 || status === 403 || status === 404)) {
      return 'revoked';
    }
  } catch {
    // Unknown — don't act on it.
  }
  return 'skipped';
}

/** Record the logout, then end the Supabase session. */
export async function signOutWithAudit(
  scope: 'local' | 'global' = 'local'
): Promise<void> {
  // Global: the server revokes every session first (so it holds even if
  // the client call below fails), then we clear the local copy.
  await post('/api/security/sessions/logout', { scope }, 2500);
  try {
    // Always 'local' here: for 'global' the server already revoked every
    // session above, so only this browser's copy is left to clear.
    await createClient().auth.signOut({ scope: 'local' });
  } catch {
    // The session may already be gone server side; local state is
    // cleared by supabase-js either way.
  }
}

export function reportPasswordChanged(): void {
  void post('/api/security/events', { type: 'password_changed' });
}

export function reportFailedLogin(email: string): void {
  void post('/api/security/login-failed', { email });
}
