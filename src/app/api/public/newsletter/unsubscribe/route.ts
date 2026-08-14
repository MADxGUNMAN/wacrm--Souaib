// ============================================================
// GET /api/public/newsletter/unsubscribe?email=<email>
//
// Linked in the footer of every newsletter email. Marks the
// subscriber as unsubscribed and redirects to the landing page.
// ============================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase().trim();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (!email) {
    return NextResponse.redirect(`${baseUrl}?newsletter=invalid`);
  }

  const admin = supabaseAdmin();

  const { data: subscriber } = await admin
    .from('newsletter_subscribers')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  if (!subscriber) {
    // Don't reveal whether the email exists
    return NextResponse.redirect(`${baseUrl}?newsletter=unsubscribed`);
  }

  if (subscriber.status !== 'unsubscribed') {
    await admin
      .from('newsletter_subscribers')
      .update({
        status: 'unsubscribed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriber.id);
  }

  return NextResponse.redirect(`${baseUrl}?newsletter=unsubscribed`);
}
