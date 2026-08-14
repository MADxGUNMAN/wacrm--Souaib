import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';

import { superAdminErrorResponse } from './guard';
import { MissingServerConfigError } from '@/lib/auth/admin-client';

/**
 * How a super-admin route failure is reported.
 *
 * This exists because of a real incident: the super admin dashboard showed
 * "Failed to load metrics. Ensure you have super admin access." on one
 * deployment and worked on another, for the same user and the same
 * database. The message was wrong — nothing was wrong with their access —
 * but every failure had been flattened into it, so there was no way to
 * tell a missing environment variable from a genuine permission problem.
 *
 * The rule these tests hold: a server that is set up wrong must never
 * blame the operator's permissions.
 */

describe('superAdminErrorResponse', () => {
  it('passes an auth response straight through', async () => {
    const thrown = NextResponse.json(
      { error: 'Forbidden — super admin access required', code: 'not_super_admin' },
      { status: 403 },
    );
    const res = superAdminErrorResponse(thrown);
    expect(res).toBe(thrown);
    expect(res?.status).toBe(403);
  });

  it('handles a plain Response, not just NextResponse', async () => {
    // The old check was `err instanceof NextResponse` only, so anything
    // throwing a bare Response fell through to a generic 500.
    const res = superAdminErrorResponse(new Response(null, { status: 401 }));
    expect(res?.status).toBe(401);
  });

  it('reports a missing env var as 503, not as a permission problem', async () => {
    const res = superAdminErrorResponse(
      new MissingServerConfigError('SUPABASE_SERVICE_ROLE_KEY'),
    );
    expect(res?.status).toBe(503);
    const body = await res!.json();
    expect(body.code).toBe('server_misconfigured');
    // The variable is named so it is actionable in a deployment where you
    // cannot attach a debugger.
    expect(body.variable).toBe('SUPABASE_SERVICE_ROLE_KEY');
    expect(body.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(body.error).not.toMatch(/super admin access/i);
  });

  it('returns null for an unknown error so the route can decide', () => {
    // The route adds its own context ("Failed to fetch metrics: …") rather
    // than this helper inventing a reason it does not know.
    expect(superAdminErrorResponse(new Error('boom'))).toBeNull();
  });
});

describe('MissingServerConfigError', () => {
  it('names the variable and says it is server-only', () => {
    const err = new MissingServerConfigError('SUPABASE_SERVICE_ROLE_KEY');
    expect(err.variable).toBe('SUPABASE_SERVICE_ROLE_KEY');
    expect(err.message).toMatch(/SUPABASE_SERVICE_ROLE_KEY is not set/);
    // The "server-only" note matters: the usual wrong guess is that the
    // key is missing from the browser bundle, where it must never appear.
    expect(err.message).toMatch(/server-only/);
  });
});
