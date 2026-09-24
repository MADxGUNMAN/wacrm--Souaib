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
import {
  EMAIL_INVALID_MESSAGE,
  isValidEmail,
  normalizeEmail,
} from '@/lib/validation/email';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
      fullName?: string;
      phone?: string;
      inviteToken?: string;
    } | null;

    const { email, password, fullName, phone, inviteToken } = body ?? {};

    // `includes('@')` was the entire check here, so `akash@junkiescoder`
    // created a real account that could never confirm — the address has
    // no deliverable domain, so the confirmation link went nowhere and the
    // user was left unable to log in OR to re-register the same address.
    // The browser does not catch it either: <input type="email"> allows a
    // dotless domain by design.
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: EMAIL_INVALID_MESSAGE },
        { status: 400 }
      );
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Phone is required. Re-validated here rather than trusting the
    // form's `isValid` flag, which any client can skip — this endpoint is
    // reachable directly.
    //
    // `isValidE164` is the loose, country-agnostic gate (7–15 digits, no
    // leading zero) already used by the send pipeline. The signup form
    // additionally applies per-country length rules via
    // `validateCountryPhoneNumber`; deliberately NOT repeated here,
    // because the server would then reject numbering plans the shared
    // country table has not caught up with, locking a real customer out
    // of signing up over a formatting opinion.
    const digits = sanitizePhoneForMeta(typeof phone === 'string' ? phone : '');
    if (!digits) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    if (!isValidE164(digits)) {
      return NextResponse.json(
        { error: 'Please enter a valid phone number' },
        { status: 400 }
      );
    }
    // Stored with the leading '+' so the super-admin panel shows a
    // dialable, unambiguous number rather than a bare digit run.
    const normalizedPhone = `+${digits}`;

    // Rate limit by email to prevent abuse
    const limit = checkRateLimit(`auth:signup:${normalizeEmail(email)}`, {
      limit: 5,
      windowMs: 60_000,
    });
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
          // Lands in auth.users.raw_user_meta_data. The profiles row does
          // not exist yet — it is created by handle_user_update() when
          // the confirmation link is clicked, which reads this key and
          // passes it to bootstrap_user_account(). See migration
          // 20260919120000_profiles_phone.sql.
          phone: normalizedPhone,
        },
        redirectTo,
      },
    });

    if (error) {
      console.error('[POST /api/auth/signup] generateLink error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create account' },
        { status: 400 }
      );
    }

    // The action_link is the full confirmation URL
    const confirmUrl = data.properties.action_link;

    if (!confirmUrl) {
      console.error('[POST /api/auth/signup] no action_link returned');
      return NextResponse.json(
        { error: 'Failed to generate confirmation link' },
        { status: 500 }
      );
    }

    // Send our branded email
    const emailResult = await sendSignupConfirmationEmail(
      trimmedEmail,
      confirmUrl,
      fullName?.trim()
    );

    if (!emailResult.ok) {
      console.warn(
        '[POST /api/auth/signup] email send issue:',
        emailResult.reason,
        'detail' in emailResult ? emailResult.detail : ''
      );
      // Don't fail the signup — the user was created. They can
      // request a new confirmation email later.
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/auth/signup] unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
