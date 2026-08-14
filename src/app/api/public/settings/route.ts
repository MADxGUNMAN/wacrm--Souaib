import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = supabaseAdmin();
    
    // Only select the public branding assets, do not expose sensitive settings
    const { data, error } = await admin
      .from('site_settings')
      .select('site_name, logo_url, logo_dark_url, favicon_url, full_logo_url, meta_partner_badge_url')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[public/settings] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('[public/settings] Exception:', err);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
