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
import { supabaseAdmin } from '@/lib/auth/admin-client';

interface SuperAdminContext {
  userId: string;
  email: string;
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
    throw NextResponse.json(
      { error: 'Unauthorized — not authenticated' },
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

  if (profileError || !profile) {
    throw NextResponse.json(
      { error: 'Unauthorized — profile not found' },
      { status: 401 }
    );
  }

  if (!profile.is_super_admin) {
    throw NextResponse.json(
      { error: 'Forbidden — super admin access required' },
      { status: 403 }
    );
  }

  return {
    userId: user.id,
    email: profile.email,
  };
}
