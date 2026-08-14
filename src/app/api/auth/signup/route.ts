// ============================================================
// POST /api/auth/signup
//
// Server-side signup handler that replaces the client-side
// `supabase.auth.signUp()` call. Uses `auth.admin.generateLink()`
// to create the user and get the confirmation link WITHOUT sending
// Supabase's default email, then sends a branded email via our
// SMTP.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendSignupConfirmationEmail } from '@/lib/email/auth';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
      fullName?: string;
      inviteToken?: string;
    } | null;

    const { email, password, fullName, inviteToken } = body ?? {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 },
      );
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      );
    }

    // Rate limit by email to prevent abuse
    const limit = checkRateLimit(
      `auth:signup:${email.toLowerCase().trim()}`,
      { limit: 5, windowMs: 60_000 },
    );
    if (!limit.success) return rateLimitResponse(limit);

    const admin = supabaseAdmin();
    const trimmedEmail = email.trim();

    // Determine the redirect URL for the confirmation link.
    // If there's an invite token, redirect back to the join page
    // after verification.
    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    ).replace(/\/+$/, '');

    const redirectTo = inviteToken
      ? `${baseUrl}/join/${encodeURIComponent(inviteToken)}`
      : `${baseUrl}/dashboard`;

    // generateLink creates the user WITHOUT sending Supabase's email.
    // It returns the action_link we can embed in our own branded email.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: fullName?.trim() || '',
        },
        redirectTo,
      },
    });

    if (error) {
      console.error('[POST /api/auth/signup] generateLink error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create account' },
        { status: 400 },
      );
    }

    // The action_link is the full confirmation URL
    const confirmUrl = data.properties.action_link;

    if (!confirmUrl) {
      console.error('[POST /api/auth/signup] no action_link returned');
      return NextResponse.json(
        { error: 'Failed to generate confirmation link' },
        { status: 500 },
      );
    }

    // Send our branded email
    const emailResult = await sendSignupConfirmationEmail(
      trimmedEmail,
      confirmUrl,
      fullName?.trim(),
    );

    if (!emailResult.ok) {
      console.warn(
        '[POST /api/auth/signup] email send issue:',
        emailResult.reason,
        'detail' in emailResult ? emailResult.detail : '',
      );
      // Don't fail the signup — the user was created. They can
      // request a new confirmation email later.
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/auth/signup] unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
