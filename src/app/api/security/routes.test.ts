import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeAdmin,
  type FakeAdmin,
} from '@/lib/security/fake-admin.test-util';

// ── Mocks ────────────────────────────────────────────────────────
const auth = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  sessionId: 'sess-current' as string | null,
}));
const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: auth.user },
        error: auth.user ? null : { message: 'no' },
      }),
      getClaims: async () => ({
        data: { claims: { session_id: auth.sessionId } },
      }),
    },
  }),
}));
vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => holder.db,
  MissingServerConfigError: class extends Error {},
}));

import { __resetRateLimitForTests } from '@/lib/rate-limit';
import { DELETE as revokeOne } from './sessions/[id]/route';
import { POST as revokeOthers } from './sessions/revoke-others/route';
import { POST as logout } from './sessions/logout/route';
import { POST as reportEvent } from './events/route';
import { POST as loginFailed } from './login-failed/route';
import { GET as listSessions } from './sessions/route';
import { GET as listActivity } from './activity/route';

let db: FakeAdmin;
const OTHER = '11111111-1111-4111-8111-111111111111';
const CURRENT = '22222222-2222-4222-8222-222222222222';

const req = (url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '27.54.191.65',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ...(init.headers ?? {}),
    },
  });

beforeEach(() => {
  __resetRateLimitForTests();
  auth.user = { id: 'user-1' };
  auth.sessionId = CURRENT;
  db = createFakeAdmin();
  holder.db = db;
  db.tables.profiles = [
    { user_id: 'user-1', account_id: 'acct-1', email: 'owner@example.com' },
    { user_id: 'user-2', account_id: 'acct-1', email: 'a_b@example.com' },
  ];
  db.tables.user_sessions = [
    { session_id: OTHER, user_id: 'user-1', ip: '49.36.10.2', ended_at: null },
  ];
  db.rpcHandlers.security_revoke_auth_session = (a) => ({
    data: a.p_session_id === OTHER || a.p_session_id === CURRENT,
    error: null,
  });
  db.rpcHandlers.security_revoke_other_auth_sessions = (a) => ({
    data: a.p_keep ? [OTHER] : [OTHER, CURRENT],
    error: null,
  });
  db.rpcHandlers.security_list_auth_sessions = () => ({
    data: [],
    error: null,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const events = () => db.tables.security_events ?? [];

describe('auth', () => {
  it('rejects signed-out callers on every authenticated route', async () => {
    auth.user = null;
    const responses = await Promise.all([
      listSessions(req('/api/security/sessions')),
      listActivity(req('/api/security/activity')),
      revokeOthers(
        req('/api/security/sessions/revoke-others', { method: 'POST' })
      ),
      logout(
        req('/api/security/sessions/logout', { method: 'POST', body: '{}' })
      ),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });
});

describe('DELETE /api/security/sessions/[id]', () => {
  it('revokes another device of the caller and logs the target IP', async () => {
    const res = await revokeOne(
      req(`/api/security/sessions/${OTHER}`, { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: OTHER }),
      }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, was_current: false });
    expect(db.rpcCalls[0].args).toEqual({
      p_user_id: 'user-1',
      p_session_id: OTHER,
    });
    expect(events()[0]).toMatchObject({
      event_type: 'session_revoked',
      target_ip: '49.36.10.2',
      ip: '27.54.191.65',
    });
    expect(db.tables.user_sessions[0].end_reason).toBe('revoked');
  });

  it('treats revoking the current device as a logout', async () => {
    const res = await revokeOne(
      req(`/api/security/sessions/${CURRENT}`, { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: CURRENT }),
      }
    );
    expect((await res.json()).was_current).toBe(true);
    expect(events()[0].event_type).toBe('logout');
  });

  it('404s for a session that is not the caller’s, 400s for junk ids', async () => {
    const missing = '33333333-3333-4333-8333-333333333333';
    const res = await revokeOne(
      req(`/api/security/sessions/${missing}`, { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: missing }),
      }
    );
    expect(res.status).toBe(404);
    expect(events()).toHaveLength(0);
    const bad = await revokeOne(
      req('/api/security/sessions/x', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: "x' or 1=1" }),
      }
    );
    expect(bad.status).toBe(400);
  });
});

describe('revoke others and logout', () => {
  it('keeps the current session when revoking others', async () => {
    const res = await revokeOthers(
      req('/api/security/sessions/revoke-others', { method: 'POST' })
    );
    expect(await res.json()).toEqual({ ok: true, revoked: 1 });
    expect(db.rpcCalls[0].args).toEqual({
      p_user_id: 'user-1',
      p_keep: CURRENT,
    });
    expect(events()[0]).toMatchObject({
      event_type: 'sessions_revoked_others',
      metadata: { count: 1 },
    });
  });

  it('refuses to revoke others without knowing the current session', async () => {
    auth.sessionId = null;
    const res = await revokeOthers(
      req('/api/security/sessions/revoke-others', { method: 'POST' })
    );
    expect(res.status).toBe(409);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('records a local logout and a global logout', async () => {
    await logout(
      req('/api/security/sessions/logout', {
        method: 'POST',
        body: JSON.stringify({ scope: 'local' }),
      })
    );
    expect(events()[0].event_type).toBe('logout');
    expect(db.rpcCalls).toHaveLength(0);

    const res = await logout(
      req('/api/security/sessions/logout', {
        method: 'POST',
        body: JSON.stringify({ scope: 'global' }),
      })
    );
    expect(await res.json()).toEqual({ ok: true, revoked: 2 });
    expect(db.rpcCalls[0].args).toEqual({ p_user_id: 'user-1', p_keep: null });
    expect(events()[1].event_type).toBe('logout_all');
  });
});

describe('POST /api/security/events', () => {
  it('accepts only client-reportable event types', async () => {
    const ok = await reportEvent(
      req('/api/security/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'password_changed' }),
      })
    );
    expect(ok.status).toBe(200);
    for (const type of [
      'login',
      'api_key_created',
      'session_revoked',
      'nope',
    ]) {
      const res = await reportEvent(
        req('/api/security/events', {
          method: 'POST',
          body: JSON.stringify({ type }),
        })
      );
      expect(res.status).toBe(400);
    }
    expect(events()).toHaveLength(1);
  });
});

describe('POST /api/security/login-failed', () => {
  const send = (email: string, ip = '27.54.191.65') =>
    loginFailed(
      req('/api/security/login-failed', {
        method: 'POST',
        body: JSON.stringify({ email, timezone: 'Asia/Kolkata' }),
        headers: { 'x-real-ip': ip },
      })
    );

  it('always answers 204 and logs only for a real account', async () => {
    expect((await send('owner@example.com')).status).toBe(204);
    expect((await send('nobody@example.com')).status).toBe(204);
    expect((await send('not-an-email')).status).toBe(204);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      user_id: 'user-1',
      account_id: 'acct-1',
      actor_user_id: null,
      event_type: 'login_failed',
      country_code: 'IN',
    });
  });

  it('treats LIKE wildcards in the email literally', async () => {
    await send('aXb@example.com');
    expect(events()).toHaveLength(0);
    await send('A_B@example.com');
    expect(events()[0].user_id).toBe('user-2');
  });

  it('stops logging after the per-email limit', async () => {
    for (let i = 0; i < 15; i++) await send('owner@example.com', `10.0.0.${i}`);
    expect(events()).toHaveLength(10);
  });
});
