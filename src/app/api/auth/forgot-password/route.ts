// ============================================================
// POST /api/auth/forgot-password
//
// Server-side password reset handler that replaces the client-side
// `supabase.auth.resetPasswordForEmail()`. Uses
// `auth.admin.generateLink({ type: 'recovery' })` to get the
// reset link WITHOUT Supabase's default email, then sends a
// branded email via SMTP.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendPasswordResetEmail } from '@/lib/email/auth';
import {
  checkRateLimit,
  rateLimitResponse,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;

    const { email } = body ?? {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 },
      );
    }

    // Tight rate limit on password resets to prevent abuse
    const limit = checkRateLimit(
      `auth:reset:${email.toLowerCase().trim()}`,
      { limit: 3, windowMs: 60_000 },
    );
    if (!limit.success) return rateLimitResponse(limit);

    const admin = supabaseAdmin();
    const trimmedEmail = email.trim();

    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    ).replace(/\/+$/, '');

    // Generate the recovery link without sending Supabase's email.
    // The redirectTo is where the user lands after clicking the link
    // and the token is exchanged — the reset-password form page.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: trimmedEmail,
      options: {
        redirectTo: `${baseUrl}/reset-password`,
      },
    });

    if (error) {
      // Don't reveal whether the email exists — always return success
      // to prevent email enumeration.
      console.warn('[POST /api/auth/forgot-password] generateLink error:', error.message);
      return NextResponse.json({ success: true });
    }

    const resetUrl = data.properties.action_link;

    if (!resetUrl) {
      // Same: don't reveal failure to the client
      console.error('[POST /api/auth/forgot-password] no action_link returned');
      return NextResponse.json({ success: true });
    }

    // Send branded password reset email
    const emailResult = await sendPasswordResetEmail(trimmedEmail, resetUrl);

    if (!emailResult.ok) {
      console.warn(
        '[POST /api/auth/forgot-password] email send issue:',
        emailResult.reason,
        'detail' in emailResult ? emailResult.detail : '',
      );
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/auth/forgot-password] unexpected error:', err);
    // Still return success to not leak info
    return NextResponse.json({ success: true });
  }
}
