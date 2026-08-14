// ============================================================
// POST /api/auth/change-email
//
// Server-side email change handler. Replaces the client-side
// `supabase.auth.updateUser({ email })` call which triggers
// Supabase's default email. Instead, uses
// `auth.admin.generateLink({ type: 'email_change_new' })` and
// sends our branded confirmation email.
//
// Requires authentication — the caller must be logged in.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendEmailChangeEmail } from '@/lib/email/auth';
import { createEmailChangeToken } from '@/lib/auth/email-token';
import {
  checkRateLimit,
  rateLimitResponse,
} from '@/lib/rate-limit';

import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const body = (await request.json().catch(() => null)) as {
      newEmail?: string;
      password?: string;
    } | null;

    const { newEmail, password } = body ?? {};

    if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 },
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 },
      );
    }

    // Rate limit per user
    const limit = checkRateLimit(
      `auth:emailChange:${ctx.userId}`,
      { limit: 3, windowMs: 60_000 },
    );
    if (!limit.success) return rateLimitResponse(limit);

    const admin = supabaseAdmin();
    const trimmedEmail = newEmail.trim();

    // Look up the user's current email
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(ctx.userId);

    if (userError || !userData.user) {
      console.error('[POST /api/auth/change-email] getUserById error:', userError);
      return NextResponse.json(
        { error: 'Failed to verify current user' },
        { status: 500 },
      );
    }

    const currentEmail = userData.user.email;
    if (!currentEmail) {
      return NextResponse.json(
        { error: 'No current email found on account' },
        { status: 400 },
      );
    }

    // Verify current password
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { error: authError } = await authClient.auth.signInWithPassword({
      email: currentEmail,
      password: password,
    });

    if (authError) {
      return NextResponse.json(
        { error: 'Incorrect password. Please verify and try again.' },
        { status: 401 },
      );
    }

    // Don't allow changing to the same email
    if (trimmedEmail.toLowerCase() === currentEmail.toLowerCase()) {
      return NextResponse.json(
        { error: 'New email is the same as current email' },
        { status: 400 },
      );
    }

    // Check if the new email is already taken by a different user
    const { data: emailLookup } = await admin
      .from('profiles')
      .select('user_id')
      .eq('email', trimmedEmail.toLowerCase())
      .neq('user_id', ctx.userId)
      .limit(1)
      .maybeSingle();

    if (emailLookup) {
      return NextResponse.json(
        { error: 'That email is already registered to another account' },
        { status: 400 },
      );
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    ).replace(/\/+$/, '');

    // Generate secure email change token
    const token = createEmailChangeToken(ctx.userId, trimmedEmail);
    const confirmUrl = `${baseUrl}/api/auth/confirm-email-change?token=${token}`;

    // Send branded email to the NEW address
    const emailResult = await sendEmailChangeEmail(trimmedEmail, confirmUrl);

    if (!emailResult.ok) {
      console.warn(
        '[POST /api/auth/change-email] email send issue:',
        emailResult.reason,
        'detail' in emailResult ? emailResult.detail : '',
      );
      return NextResponse.json(
        { error: 'Failed to send confirmation email. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, emailSent: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
