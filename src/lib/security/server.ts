// ============================================================
// Security sessions + activity — server side.
//
// Source of truth for "is this device signed in": Supabase's
// auth.sessions (read and revoked through the SECURITY DEFINER functions
// in migration 20261016000000). public.user_sessions adds what Supabase
// doesn't keep — timezone, country, parsed device, our own last-activity
// heartbeat. public.security_events is the per-user activity log.
//
// Everything here is scoped to ONE user: the caller. Owners and members
// alike only ever see and revoke their own devices.
// ============================================================

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  countryForTimezone,
  countryName,
  parseUserAgent,
  type RequestDeviceMeta,
} from './device';
import type {
  DeviceSession,
  Paged,
  SecurityEventRow,
  SecurityEventType,
} from './types';

export class SecurityAuthError extends Error {
  constructor(message = 'Not signed in') {
    super(message);
    this.name = 'SecurityAuthError';
  }
}

export interface SecurityContext {
  userId: string;
  accountId: string | null;
  /** auth.sessions.id of the calling browser (JWT `session_id`). */
  sessionId: string | null;
  admin: SupabaseClient;
}

/** Last-active writes are skipped when the stored value is this fresh. */
export const HEARTBEAT_MIN_INTERVAL_MS = 60_000;
/** Activity older than this is pruned (per user, on read). */
export const EVENT_RETENTION_DAYS = 365;
/** Ended session rows older than this are pruned. */
export const ENDED_SESSION_RETENTION_DAYS = 90;

/**
 * Resolve the caller from the request cookies. getUser() asks the Auth
 * server, so a revoked session fails here even while its access token is
 * still unexpired; getClaims() then gives the verified session id.
 */
export async function getSecurityContext(): Promise<SecurityContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new SecurityAuthError();

  let sessionId: string | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    const sid = data?.claims?.session_id;
    sessionId = typeof sid === 'string' && sid ? sid : null;
  } catch {
    sessionId = null;
  }

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    accountId: (profile?.account_id as string | null) ?? null,
    sessionId,
    admin,
  };
}

// ── Events ──────────────────────────────────────────────────────

export interface RecordEventInput {
  userId: string;
  accountId: string | null;
  actorUserId?: string | null;
  type: SecurityEventType;
  sessionId?: string | null;
  targetIp?: string | null;
  meta?: Partial<RequestDeviceMeta> | null;
  metadata?: Record<string, unknown>;
  /** Defaults to now. Used to date a login at the session's real start. */
  at?: string;
}

/** Append one event. Never throws — logging must not break the action. */
export async function recordSecurityEvent(
  admin: SupabaseClient,
  input: RecordEventInput
): Promise<void> {
  const m = input.meta ?? {};
  const row = {
    user_id: input.userId,
    account_id: input.accountId,
    // `null` is meaningful (failed login: nobody authenticated), so only
    // an omitted actor defaults to the user.
    actor_user_id:
      input.actorUserId === undefined ? input.userId : input.actorUserId,
    event_type: input.type,
    session_id: input.sessionId ?? null,
    target_ip: input.targetIp ?? null,
    ip: m.ip ?? null,
    country_code: m.country_code ?? null,
    timezone: m.timezone ?? null,
    platform: m.platform ?? null,
    device_type: m.device_type ?? null,
    browser: m.browser ?? null,
    metadata: input.metadata ?? {},
    ...(input.at ? { created_at: input.at } : {}),
  };
  try {
    const { error } = await admin.from('security_events').insert(row);
    // 23505: the one-login-per-session index — already logged, fine.
    if (error && error.code !== '23505') {
      console.error('[security] recordSecurityEvent failed:', error.message);
    }
  } catch (err) {
    console.error('[security] recordSecurityEvent threw:', err);
  }
}

// ── Sessions ────────────────────────────────────────────────────

interface AuthSessionRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
}

interface UserSessionRow {
  session_id: string;
  first_seen_at: string;
  last_seen_at: string;
  ip: string | null;
  country_code: string | null;
  timezone: string | null;
  platform: string | null;
  device_type: string | null;
  browser: string | null;
  browser_version: string | null;
  ended_at: string | null;
}

export async function listAuthSessions(
  admin: SupabaseClient,
  userId: string
): Promise<AuthSessionRow[]> {
  const { data, error } = await admin.rpc('security_list_auth_sessions', {
    p_user_id: userId,
  });
  if (error) throw new Error(`list sessions failed: ${error.message}`);
  return (data ?? []) as AuthSessionRow[];
}

function latestIso(...values: (string | null | undefined)[]): string {
  let best = 0;
  for (const v of values) {
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return new Date(best || Date.now()).toISOString();
}

/** Build a user_sessions row for an auth session we haven't seen yet. */
function newSessionRow(
  ctx: Pick<SecurityContext, 'userId' | 'accountId'>,
  auth: AuthSessionRow,
  meta?: RequestDeviceMeta | null
) {
  // The calling browser's own details are richer (timezone, geo header);
  // for other devices use what Supabase recorded at sign-in.
  const device = meta ?? {
    ...parseUserAgent(auth.user_agent),
    ip: auth.ip,
    user_agent: auth.user_agent,
    timezone: null,
    country_code: null,
  };
  return {
    session_id: auth.id,
    user_id: ctx.userId,
    account_id: ctx.accountId,
    first_seen_at: auth.created_at,
    last_seen_at: latestIso(
      auth.refreshed_at,
      auth.updated_at,
      auth.created_at
    ),
    ip: device.ip ?? auth.ip,
    country_code: device.country_code,
    timezone: device.timezone,
    platform: device.platform,
    device_type: device.device_type,
    browser: device.browser,
    browser_version: device.browser_version,
    user_agent: device.user_agent ?? auth.user_agent,
  };
}

/**
 * Make sure every live auth session has a user_sessions row and a
 * "login" event (dated at the session's real sign-in time), and mark
 * rows whose auth session is gone as ended. Idempotent.
 */
export async function syncSessions(
  ctx: SecurityContext,
  liveSessions: AuthSessionRow[],
  currentMeta?: RequestDeviceMeta | null
): Promise<UserSessionRow[]> {
  const { admin, userId } = ctx;
  const { data: existingRows, error } = await admin
    .from('user_sessions')
    .select(
      'session_id, first_seen_at, last_seen_at, ip, country_code, timezone, platform, device_type, browser, browser_version, ended_at'
    )
    .eq('user_id', userId);
  if (error) throw new Error(`load user_sessions failed: ${error.message}`);

  const existing = new Map(
    ((existingRows ?? []) as UserSessionRow[]).map((r) => [r.session_id, r])
  );
  const liveIds = new Set(liveSessions.map((s) => s.id));

  const missing = liveSessions.filter((s) => !existing.has(s.id));
  if (missing.length > 0) {
    const rows = missing.map((s) =>
      newSessionRow(ctx, s, s.id === ctx.sessionId ? currentMeta : null)
    );
    const { data: inserted, error: insErr } = await admin
      .from('user_sessions')
      .upsert(rows, { onConflict: 'session_id', ignoreDuplicates: true })
      .select(
        'session_id, first_seen_at, last_seen_at, ip, country_code, timezone, platform, device_type, browser, browser_version, ended_at'
      );
    if (insErr) {
      console.error('[security] insert user_sessions failed:', insErr.message);
    } else {
      for (const r of (inserted ?? []) as UserSessionRow[]) {
        existing.set(r.session_id, r);
      }
    }
    for (const row of rows) {
      await recordSecurityEvent(admin, {
        userId,
        accountId: ctx.accountId,
        type: 'login',
        sessionId: row.session_id,
        at: row.first_seen_at,
        meta: row,
      });
    }
  }

  // Sessions Supabase no longer has (expired, or signed out elsewhere).
  const gone = [...existing.values()]
    .filter((r) => !r.ended_at && !liveIds.has(r.session_id))
    .map((r) => r.session_id);
  if (gone.length > 0) {
    await admin
      .from('user_sessions')
      .update({ ended_at: new Date().toISOString(), end_reason: 'expired' })
      .in('session_id', gone)
      .is('ended_at', null);
  }

  return liveSessions
    .map((s) => existing.get(s.id))
    .filter((r): r is UserSessionRow => !!r);
}

/** Record activity for the calling browser (throttled). */
export async function touchCurrentSession(
  ctx: SecurityContext,
  meta: RequestDeviceMeta
): Promise<{ registered: boolean }> {
  const { admin, sessionId, userId } = ctx;
  if (!sessionId) return { registered: false };

  const { data: row } = await admin
    .from('user_sessions')
    .select('session_id, last_seen_at, timezone, ended_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) {
    const live = await listAuthSessions(admin, userId);
    await syncSessions(ctx, live, meta);
    return { registered: true };
  }

  const fresh =
    Date.now() - Date.parse(row.last_seen_at as string) <
    HEARTBEAT_MIN_INTERVAL_MS;
  if (fresh && row.timezone) return { registered: false };

  const patch: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (meta.ip) patch.ip = meta.ip;
  if (meta.timezone) {
    patch.timezone = meta.timezone;
    patch.country_code = meta.country_code;
  }
  await admin
    .from('user_sessions')
    .update(patch)
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  return { registered: false };
}

export async function listDeviceSessions(
  ctx: SecurityContext,
  currentMeta?: RequestDeviceMeta | null
): Promise<DeviceSession[]> {
  const live = await listAuthSessions(ctx.admin, ctx.userId);
  const rows = await syncSessions(ctx, live, currentMeta);
  const byId = new Map(rows.map((r) => [r.session_id, r]));

  return live
    .map((auth): DeviceSession => {
      const r = byId.get(auth.id);
      const parsed = parseUserAgent(auth.user_agent);
      const timezone = r?.timezone ?? null;
      const code = r?.country_code ?? countryForTimezone(timezone);
      return {
        id: auth.id,
        is_current: auth.id === ctx.sessionId,
        first_activity_at: r?.first_seen_at ?? auth.created_at,
        last_active_at: latestIso(
          r?.last_seen_at,
          auth.refreshed_at,
          auth.updated_at,
          auth.created_at
        ),
        ip: r?.ip ?? auth.ip,
        country_code: code,
        country_name: countryName(code),
        timezone,
        platform: r?.platform ?? parsed.platform,
        device_type: r?.device_type ?? parsed.device_type,
        browser: r?.browser ?? parsed.browser,
        browser_version: r?.browser_version ?? parsed.browser_version,
      };
    })
    .sort((a, b) => {
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
      return Date.parse(b.last_active_at) - Date.parse(a.last_active_at);
    });
}

/** Mark user_sessions rows ended (after their auth session is deleted). */
export async function markSessionsEnded(
  admin: SupabaseClient,
  userId: string,
  sessionIds: string[],
  reason: 'logout' | 'revoked' | 'logout_all'
): Promise<void> {
  if (sessionIds.length === 0) return;
  await admin
    .from('user_sessions')
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq('user_id', userId)
    .in('session_id', sessionIds)
    .is('ended_at', null);
}

export async function sessionIp(
  admin: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<string | null> {
  const { data } = await admin
    .from('user_sessions')
    .select('ip')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle();
  return (data?.ip as string | null) ?? null;
}

// ── Activity ────────────────────────────────────────────────────

export interface ActivityQuery {
  page: number;
  pageSize: number;
  ip?: string | null;
  type?: SecurityEventType | null;
}

/** Strip LIKE wildcards so a search can't scan with patterns. */
export function sanitizeIpSearch(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const v = raw
    .trim()
    .replace(/[^0-9a-fA-F:.]/g, '')
    .slice(0, 64);
  return v || null;
}

export async function listSecurityEvents(
  ctx: SecurityContext,
  q: ActivityQuery
): Promise<Paged<SecurityEventRow>> {
  const from = (q.page - 1) * q.pageSize;
  let query = ctx.admin
    .from('security_events')
    .select(
      'id, event_type, created_at, ip, target_ip, country_code, timezone, platform, device_type, browser, metadata',
      { count: 'exact' }
    )
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .range(from, from + q.pageSize - 1);
  if (q.type) query = query.eq('event_type', q.type);
  const ip = sanitizeIpSearch(q.ip);
  if (ip) query = query.or(`ip.ilike.%${ip}%,target_ip.ilike.%${ip}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(`list events failed: ${error.message}`);

  return {
    items: ((data ?? []) as Omit<SecurityEventRow, 'country_name'>[]).map(
      (e) => ({
        ...e,
        metadata: (e.metadata ?? {}) as Record<string, unknown>,
        country_name: countryName(e.country_code),
      })
    ),
    total: count ?? 0,
    page: q.page,
    page_size: q.pageSize,
  };
}

/** Retention for one user's rows. Cheap (indexed); safe to call on read. */
export async function pruneUserSecurityData(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const eventCutoff = new Date(
    Date.now() - EVENT_RETENTION_DAYS * 86_400_000
  ).toISOString();
  const sessionCutoff = new Date(
    Date.now() - ENDED_SESSION_RETENTION_DAYS * 86_400_000
  ).toISOString();
  try {
    await admin
      .from('security_events')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', eventCutoff);
    await admin
      .from('user_sessions')
      .delete()
      .eq('user_id', userId)
      .lt('ended_at', sessionCutoff);
  } catch (err) {
    console.error('[security] prune failed:', err);
  }
}
