// ============================================================
// POST /api/auth/account-status — does an account exist for this email?
//
// Used by the login page AFTER a failed sign-in, so a person whose
// account never existed (or was deleted by a super admin) is told so and
// pointed to sign-up, instead of a generic "invalid credentials".
//
// This reveals no more than sign-up already does (it refuses an email
// that is registered). Rate limited per IP and per email to keep it from
// becoming a bulk lookup tool.
//
// Body: { "email": "..." } → { "exists": boolean }
// ============================================================

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { isValidEmail } from '@/lib/validation/email';
import { clientIp } from '@/lib/security/device';

export const dynamic = 'force-dynamic';

const WINDOW = 15 * 60_000;

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? 'unknown';
  const byIp = checkRateLimit(`auth:accountStatus:ip:${ip}`, {
    limit: 20,
    windowMs: WINDOW,
  });
  if (!byIp.success) return rateLimitResponse(byIp);

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'A valid email is required' },
      { status: 400 }
    );
  }
  const hash = createHash('sha256').update(email).digest('hex');
  const byEmail = checkRateLimit(`auth:accountStatus:email:${hash}`, {
    limit: 10,
    windowMs: WINDOW,
  });
  if (!byEmail.success) return rateLimitResponse(byEmail);

  try {
    const { data, error } = await supabaseAdmin()
      .from('profiles')
      .select('user_id')
      // Exact, case-insensitive match: LIKE wildcards are escaped.
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      { exists: !!data },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/auth/account-status]', err);
    // Unknown: let the page fall back to the normal error message.
    return NextResponse.json(
      { exists: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
