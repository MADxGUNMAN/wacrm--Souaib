import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeAdmin, type FakeAdmin } from './fake-admin.test-util';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/admin-client', () => ({ supabaseAdmin: vi.fn() }));

import {
  listDeviceSessions,
  listSecurityEvents,
  recordSecurityEvent,
  sanitizeIpSearch,
  touchCurrentSession,
  type SecurityContext,
} from './server';
import { requestDeviceMeta } from './device';

const USER = 'user-1';
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

let db: FakeAdmin;
let ctx: SecurityContext;
let live: Record<string, unknown>[];

beforeEach(() => {
  db = createFakeAdmin();
  live = [
    {
      id: 'sess-current',
      created_at: '2026-10-15T12:08:00Z',
      updated_at: '2026-10-15T12:08:00Z',
      refreshed_at: null,
      user_agent: CHROME_WIN,
      ip: '27.54.191.65',
      aal: 'aal1',
    },
    {
      id: 'sess-phone',
      created_at: '2026-10-14T09:00:00Z',
      updated_at: '2026-10-15T10:00:00Z',
      refreshed_at: '2026-10-15T11:00:00Z',
      user_agent: IPHONE,
      ip: '49.36.10.2',
      aal: 'aal1',
    },
  ];
  db.rpcHandlers.security_list_auth_sessions = () => ({
    data: live,
    error: null,
  });
  ctx = {
    userId: USER,
    accountId: 'acct-1',
    sessionId: 'sess-current',
    admin: db as unknown as SupabaseClient,
  };
});

const meta = () =>
  requestDeviceMeta(
    new Headers({ 'user-agent': CHROME_WIN, 'x-real-ip': '27.54.191.65' }),
    'Asia/Kolkata'
  );

describe('listDeviceSessions', () => {
  it('lists live sessions, current first, with device details', async () => {
    const sessions = await listDeviceSessions(ctx, meta());
    expect(sessions.map((s) => s.id)).toEqual(['sess-current', 'sess-phone']);
    expect(sessions[0]).toMatchObject({
      is_current: true,
      ip: '27.54.191.65',
      platform: 'Windows',
      device_type: 'Desktop',
      browser: 'Chrome',
      timezone: 'Asia/Kolkata',
      country_code: 'IN',
      country_name: 'India',
    });
    expect(sessions[1]).toMatchObject({
      is_current: false,
      platform: 'iOS',
      device_type: 'Mobile',
      last_active_at: '2026-10-15T11:00:00.000Z',
    });
  });

  it('logs one login per session, dated at sign-in, and never twice', async () => {
    await listDeviceSessions(ctx, meta());
    await listDeviceSessions(ctx, meta());
    const logins = db.tables.security_events.filter(
      (e) => e.event_type === 'login'
    );
    expect(logins).toHaveLength(2);
    expect(logins.find((e) => e.session_id === 'sess-phone')?.created_at).toBe(
      '2026-10-14T09:00:00Z'
    );
    expect(db.tables.user_sessions).toHaveLength(2);
  });

  it('marks rows whose auth session disappeared as ended', async () => {
    await listDeviceSessions(ctx, meta());
    live = live.filter((s) => s.id !== 'sess-phone');
    const sessions = await listDeviceSessions(ctx, meta());
    expect(sessions.map((s) => s.id)).toEqual(['sess-current']);
    const phone = db.tables.user_sessions.find(
      (r) => r.session_id === 'sess-phone'
    );
    expect(phone?.ended_at).toBeTruthy();
    expect(phone?.end_reason).toBe('expired');
  });

  it('only ever reads the caller’s own sessions', async () => {
    await listDeviceSessions(ctx, meta());
    expect(db.rpcCalls[0]).toEqual({
      name: 'security_list_auth_sessions',
      args: { p_user_id: USER },
    });
  });
});

describe('touchCurrentSession', () => {
  it('registers an unseen session, then throttles updates', async () => {
    const first = await touchCurrentSession(ctx, meta());
    expect(first.registered).toBe(true);
    const row = db.tables.user_sessions.find(
      (r) => r.session_id === 'sess-current'
    )!;
    row.last_seen_at = new Date().toISOString();
    const before = row.last_seen_at;
    const second = await touchCurrentSession(ctx, meta());
    expect(second.registered).toBe(false);
    expect(row.last_seen_at).toBe(before);
  });

  it('refreshes last-active once the throttle window has passed', async () => {
    await touchCurrentSession(ctx, meta());
    const row = db.tables.user_sessions.find(
      (r) => r.session_id === 'sess-current'
    )!;
    row.last_seen_at = '2026-01-01T00:00:00Z';
    await touchCurrentSession(ctx, meta());
    expect(Date.parse(row.last_seen_at as string)).toBeGreaterThan(
      Date.parse('2026-06-01T00:00:00Z')
    );
  });

  it('does nothing without a session id', async () => {
    const res = await touchCurrentSession({ ...ctx, sessionId: null }, meta());
    expect(res.registered).toBe(false);
    expect(db.tables.user_sessions ?? []).toHaveLength(0);
  });
});

describe('security events', () => {
  it('records device details and swallows duplicate-login errors', async () => {
    await recordSecurityEvent(ctx.admin, {
      userId: USER,
      accountId: 'acct-1',
      type: 'password_changed',
      meta: meta(),
    });
    expect(db.tables.security_events[0]).toMatchObject({
      user_id: USER,
      actor_user_id: USER,
      event_type: 'password_changed',
      ip: '27.54.191.65',
      browser: 'Chrome',
      timezone: 'Asia/Kolkata',
    });
    db.failInsert = { table: 'security_events', code: '23505' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordSecurityEvent(ctx.admin, {
      userId: USER,
      accountId: null,
      type: 'login',
      sessionId: 's',
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('pages, filters by IP and type, and scopes to the caller', async () => {
    db.tables.security_events = [
      {
        id: 'a',
        user_id: USER,
        event_type: 'login',
        ip: '27.54.191.65',
        created_at: '2026-10-15T10:00:00Z',
        country_code: 'IN',
        metadata: {},
      },
      {
        id: 'b',
        user_id: USER,
        event_type: 'session_revoked',
        ip: '10.0.0.1',
        target_ip: '27.54.191.65',
        created_at: '2026-10-15T11:00:00Z',
        metadata: {},
      },
      {
        id: 'c',
        user_id: USER,
        event_type: 'logout',
        ip: '10.0.0.1',
        created_at: '2026-10-15T12:00:00Z',
        metadata: {},
      },
      {
        id: 'd',
        user_id: 'someone-else',
        event_type: 'login',
        ip: '27.54.191.65',
        created_at: '2026-10-15T13:00:00Z',
        metadata: {},
      },
    ];
    const all = await listSecurityEvents(ctx, { page: 1, pageSize: 25 });
    expect(all.total).toBe(3);
    expect(all.items.map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(all.items[2].country_name).toBe('India');

    const byIp = await listSecurityEvents(ctx, {
      page: 1,
      pageSize: 25,
      ip: '27.54',
    });
    expect(byIp.items.map((e) => e.id)).toEqual(['b', 'a']);

    const byType = await listSecurityEvents(ctx, {
      page: 1,
      pageSize: 25,
      type: 'logout',
    });
    expect(byType.items.map((e) => e.id)).toEqual(['c']);

    const page2 = await listSecurityEvents(ctx, { page: 2, pageSize: 2 });
    expect(page2.items.map((e) => e.id)).toEqual(['a']);
  });

  it('strips anything but IP characters from the search', () => {
    expect(sanitizeIpSearch(' 27.54%_,or(x) ')).toBe('27.54');
    expect(sanitizeIpSearch('2001:db8::1')).toBe('2001:db8::1');
    expect(sanitizeIpSearch('')).toBeNull();
    expect(sanitizeIpSearch('%%')).toBeNull();
  });
});
