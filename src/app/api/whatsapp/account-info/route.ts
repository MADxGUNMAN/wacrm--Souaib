import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * GET /api/whatsapp/account-info
 *
 * Fetches live phone number and WABA details from the Meta Graph API
 * for the current user's connected WhatsApp account.
 *
 * Returns:
 * - display_phone_number, verified_name, quality_rating, status
 *   from the phone number endpoint
 * - name, message_template_count from the WABA endpoint
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user's account_id from their profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    // Get the whatsapp_config for this account
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token')
      .eq('account_id', profile.account_id)
      .maybeSingle();

    if (!config?.phone_number_id || !config?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 404 });
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch {
      return NextResponse.json(
        { error: 'Failed to decrypt access token' },
        { status: 500 }
      );
    }

    // Fetch phone number details from Meta
    const phoneFields = 'id,display_phone_number,verified_name,quality_rating,status,name_status,code_verification_status';
    const phoneRes = await fetch(
      `${META_API_BASE}/${config.phone_number_id}?fields=${phoneFields}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let phoneData: Record<string, unknown> = {};
    if (phoneRes.ok) {
      phoneData = await phoneRes.json();
    } else {
      const errBody = await phoneRes.json().catch(() => ({}));
      console.error('[account-info] Phone number fetch failed:', errBody);
    }

    // Fetch WABA details (messaging limits are at the WABA level)
    let wabaData: Record<string, unknown> = {};
    if (config.waba_id) {
      const wabaFields = 'id,name,account_review_status,business_verification_status,message_template_namespace';
      const wabaRes = await fetch(
        `${META_API_BASE}/${config.waba_id}?fields=${wabaFields}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (wabaRes.ok) {
        wabaData = await wabaRes.json();
      } else {
        const errBody = await wabaRes.json().catch(() => ({}));
        console.error('[account-info] WABA fetch failed:', errBody);
      }
    }

    return NextResponse.json({
      phone: {
        id: phoneData.id ?? config.phone_number_id,
        display_phone_number: phoneData.display_phone_number ?? null,
        verified_name: phoneData.verified_name ?? null,
        quality_rating: phoneData.quality_rating ?? null,
        status: phoneData.status ?? null,
        name_status: phoneData.name_status ?? null,
      },
      waba: {
        id: wabaData.id ?? config.waba_id,
        name: wabaData.name ?? null,
        account_review_status: wabaData.account_review_status ?? null,
        business_verification_status: wabaData.business_verification_status ?? null,
      },
    });
  } catch (error) {
    console.error('[account-info] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
