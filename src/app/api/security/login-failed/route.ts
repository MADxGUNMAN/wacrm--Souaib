// ============================================================
// POST /api/security/login-failed — record a failed sign-in attempt.
//
// Called by the login page after Supabase rejects a password. No
// session exists yet, so this is unauthenticated; it only ever WRITES a
// "Failed login" row into the activity of the account that owns the
// email, so its owner can see attempts on their account.
//
// Abuse controls:
//   - always answers 204, whether or not the email exists (no account
//     enumeration),
//   - rate limited per IP and per email,
//   - never stores the attempted password or the raw email.
//
// Body: { "email": "...", "timezone": "Asia/Kolkata" }
// ============================================================

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { isValidEmail } from '@/lib/validation/email';
import { requestDeviceMeta } from '@/lib/security/device';
import { recordSecurityEvent } from '@/lib/security/server';
import { readBody } from '@/lib/security/http';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 15 * 60_000;

const noContent = () =>
  new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });

export async function POST(request: Request) {
  try {
    const meta = requestDeviceMeta(request.headers);
    const ipKey = meta.ip ?? 'unknown';
    if (
      !checkRateLimit(`security:loginFailed:ip:${ipKey}`, {
        limit: 30,
        windowMs: WINDOW_MS,
      }).success
    ) {
      return noContent();
    }

    const body = await readBody(request);
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return noContent();

    const emailHash = createHash('sha256').update(email).digest('hex');
    if (
      !checkRateLimit(`security:loginFailed:email:${emailHash}`, {
        limit: 10,
        windowMs: WINDOW_MS,
      }).success
    ) {
      return noContent();
    }

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id, account_id')
      // Case-insensitive exact match: escape LIKE wildcards so an address
      // like a_b@x.com can't match aXb@x.com.
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle();
    if (!profile?.user_id) return noContent();

    await recordSecurityEvent(admin, {
      userId: profile.user_id as string,
      accountId: (profile.account_id as string | null) ?? null,
      actorUserId: null,
      type: 'login_failed',
      meta: requestDeviceMeta(request.headers, body.timezone),
      metadata: { reason: 'invalid_credentials' },
    });
    return noContent();
  } catch (err) {
    console.error('[POST /api/security/login-failed]', err);
    return noContent();
  }
}
