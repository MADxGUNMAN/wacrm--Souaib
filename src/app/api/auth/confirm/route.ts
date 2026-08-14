// ============================================================
// GET /api/auth/confirm
//
// Auth callback handler for branded email links. When the user
// clicks the confirmation link in our branded email, Supabase's
// action_link points here (via its redirect mechanism). This
// route exchanges the token with Supabase and redirects the user
// to their final destination.
//
// The action_link from generateLink() contains a token_hash and
// type as URL parameters. Supabase resolves the link through its
// own /verify endpoint, which then redirects to the redirectTo
// we specified. So in most cases, this route acts as the final
// landing after Supabase has already exchanged the token.
//
// However, if we need to handle the token exchange ourselves
// (e.g. for custom flows), this route supports that too.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'signup'
    | 'recovery'
    | 'email'
    | 'email_change'
    | null;
  const next = searchParams.get('next') ?? '/dashboard';

  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

  if (!token_hash || !type) {
    // Missing params — redirect to login
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    console.error('[GET /api/auth/confirm] verifyOtp error:', error.message);
    // Redirect to login with an error indicator
    return NextResponse.redirect(
      `${baseUrl}/login?error=verification_failed`,
    );
  }

  // Determine final redirect
  let redirectPath = next;
  if (type === 'recovery') {
    redirectPath = '/reset-password';
  }

  return NextResponse.redirect(`${baseUrl}${redirectPath}`);
}
