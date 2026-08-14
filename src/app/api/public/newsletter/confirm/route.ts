// ============================================================
// GET /api/public/newsletter/confirm?token=<uuid>
//
// The link the subscriber clicks in their confirmation email.
// Updates status to 'confirmed' and redirects to the landing
// page with a query param so the UI can show a toast.
// ============================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (!token) {
    return NextResponse.redirect(`${baseUrl}?newsletter=invalid`);
  }

  const admin = supabaseAdmin();

  const { data: subscriber } = await admin
    .from('newsletter_subscribers')
    .select('id, status')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!subscriber) {
    return NextResponse.redirect(`${baseUrl}?newsletter=invalid`);
  }

  if (subscriber.status === 'confirmed') {
    return NextResponse.redirect(`${baseUrl}?newsletter=already_confirmed`);
  }

  await admin
    .from('newsletter_subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirm_token: null, // Invalidate token after use
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriber.id);

  return NextResponse.redirect(`${baseUrl}?newsletter=confirmed`);
}
