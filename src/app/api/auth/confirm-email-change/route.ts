import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { verifyEmailChangeToken } from '@/lib/auth/email-token';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');

  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/settings?tab=profile&error=missing_token`);
  }

  const payload = verifyEmailChangeToken(token);
  if (!payload) {
    return NextResponse.redirect(`${baseUrl}/settings?tab=profile&error=invalid_token`);
  }

  const admin = supabaseAdmin();

  // Check if the new email is already taken by a different user
  const { data: emailLookup } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', payload.newEmail.toLowerCase())
    .neq('user_id', payload.userId)
    .limit(1)
    .maybeSingle();

  if (emailLookup) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=profile&error=email_taken`,
    );
  }

  // Update user's email directly in Supabase Auth with confirmation bypass
  const { error } = await admin.auth.admin.updateUserById(payload.userId, {
    email: payload.newEmail,
    email_confirm: true,
  });

  if (error) {
    console.error('[GET /api/auth/confirm-email-change] error:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=profile&error=update_failed`,
    );
  }

  // Redirect to settings page with success flag
  return NextResponse.redirect(
    `${baseUrl}/settings?tab=profile&email_updated=true`,
  );
}
