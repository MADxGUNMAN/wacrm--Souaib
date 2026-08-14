// ============================================================
// Super Admin route guard — server-side auth check.
//
// Used by every `/api/super-admin/*` route as the FIRST call.
// Reads auth cookies from the request, looks up the profile,
// and verifies `is_super_admin = true`. Throws a NextResponse
// with 401/403 if unauthorized.
//
// Usage in an API route:
//   const admin = await requireSuperAdmin(request);
//   // admin.userId, admin.email now available
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import {
  MissingServerConfigError,
  supabaseAdmin,
} from '@/lib/auth/admin-client';

interface SuperAdminContext {
  userId: string;
  email: string;
}

/**
 * Turn whatever a `/api/super-admin/*` route caught into a response.
 *
 * Every route needs this and each had its own `if (err instanceof
 * NextResponse) return err` line, which missed two cases: a plain
 * `Response` (not every thrower uses NextResponse) and a server
 * misconfiguration, which was being reported as a generic 500 with a
 * message about the data it failed to fetch.
 *
 * The distinction that matters: 401/403 mean "your session or your
 * permissions", 503 means "this server is set up wrong". Collapsing them
 * is what sent us looking at super admin flags for a missing env var.
 */
export function superAdminErrorResponse(err: unknown): NextResponse | null {
  // The guard throws a ready-made response for auth failures.
  if (err instanceof NextResponse) return err;
  if (err instanceof Response) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: err.status || 401 },
    );
  }
  if (err instanceof MissingServerConfigError) {
    // 503, not 500: the request was fine, the deployment is incomplete.
    return NextResponse.json(
      {
        error: `Server misconfigured: ${err.message}`,
        code: 'server_misconfigured',
        variable: err.variable,
      },
      { status: 503 },
    );
  }
  return null;
}

/**
 * Authenticate the request and verify the caller has `is_super_admin = true`.
 *
 * @param request - The incoming NextRequest
 * @returns The authenticated super admin context
 * @throws NextResponse with 401 if not authenticated, 403 if not a super admin
 */
export async function requireSuperAdmin(
  request: Request
): Promise<SuperAdminContext> {
  // 1. Create a Supabase client from the request cookies to get the user
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Parse cookies from the request header
          const cookieHeader = request.headers.get('cookie') ?? '';
          return cookieHeader.split(';').map((c) => {
            const [name, ...rest] = c.trim().split('=');
            return { name: name ?? '', value: rest.join('=') };
          }).filter((c) => c.name.length > 0);
        },
        setAll() {
          // No-op in API routes — cookies are read-only here
        },
      },
    }
  );

  // 2. Get the authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // Names the cookie situation, because the usual reason a request
    // reaches here while the browser looks signed in is that the session
    // cookie was not sent or could not be read on THIS host.
    console.error(
      '[super-admin/guard] no authenticated user from request cookies -',
      authError?.message ?? 'no user returned',
    );
    throw NextResponse.json(
      {
        error:
          'Not signed in as far as the server can tell — the session cookie ' +
          `was missing or unreadable on this host${
            authError?.message ? ` (${authError.message})` : ''
          }.`,
        code: 'not_authenticated',
      },
      { status: 401 }
    );
  }

  // 3. Check is_super_admin via service role client (bypasses RLS)
  const admin = supabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_super_admin, email')
    .eq('user_id', user.id)
    .maybeSingle();

  // A FAILED QUERY AND A MISSING ROW ARE NOT THE SAME THING and used to be
  // reported identically as "profile not found". The query failing means the
  // service-role client cannot read `profiles` — a wrong key, a project
  // mismatch, or a network problem — none of which the operator can fix by
  // checking their own permissions.
  if (profileError) {
    console.error(
      '[super-admin/guard] could not read the profile for user',
      user.id,
      '-',
      profileError.message,
    );
    throw NextResponse.json(
      {
        error:
          'Could not verify super admin access: the server could not read ' +
          `your profile (${profileError.message}). This is a server or ` +
          'database configuration problem, not a permissions one.',
        code: 'profile_lookup_failed',
      },
      { status: 503 },
    );
  }

  if (!profile) {
    throw NextResponse.json(
      {
        error: `No profile row exists for the signed-in user (${user.email ?? user.id}).`,
        code: 'profile_missing',
      },
      { status: 403 },
    );
  }

  if (!profile.is_super_admin) {
    throw NextResponse.json(
      {
        error: 'Forbidden — super admin access required',
        code: 'not_super_admin',
      },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    email: profile.email,
  };
}
