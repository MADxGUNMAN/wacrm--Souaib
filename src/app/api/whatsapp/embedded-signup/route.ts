import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api';

const META_API_VERSION = 'v23.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Exchange an Embedded Signup token code for the customer's business token.
 *
 * IMPORTANT: this must be exactly ONE call. The code is single-use — Meta
 * consumes it on the first attempt regardless of whether that attempt
 * succeeds. An earlier version of this function tried a POST first and
 * fell back to a GET on failure; that fallback GET was doomed to fail too,
 * and it failed with the *same* misleading "redirect_uri" message Meta
 * also uses for an already-consumed code. That made a transient failure on
 * the first attempt look identical to a config problem.
 *
 * The code comes from `FB.login()` in the browser, where the JS SDK owns
 * the popup and never exposes a redirect_uri we could echo back. Meta only
 * skips the redirect_uri comparison when the parameter is *absent* from
 * this call — this is the exact GET form documented at
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens#get-a-long-lived-user-access-token
 * and used throughout Meta's own Embedded Signup examples.
 */
async function exchangeCodeForBusinessToken(args: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<
  | { ok: true; accessToken: string; expiresIn: number | null }
  | { ok: false; message: string; subcode: number | null }
> {
  const { code, appId, appSecret } = args;

  const qs = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });

  let payload: Record<string, unknown>;
  try {
    const res = await fetch(`${META_API_BASE}/oauth/access_token?${qs.toString()}`, {
      method: 'GET',
    });
    payload = (await res.json()) as Record<string, unknown>;

    if (res.ok && typeof payload.access_token === 'string') {
      return {
        ok: true,
        accessToken: payload.access_token,
        expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error calling Meta';
    console.error('[embedded-signup] token exchange threw:', message);
    return { ok: false, message, subcode: null };
  }

  const error = (payload.error ?? {}) as {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };

  // Never log the response body wholesale — a successful call would put a
  // customer business token in the server log.
  console.error('[embedded-signup] token exchange failed', {
    code: error.code,
    subcode: error.error_subcode,
    fbtrace_id: error.fbtrace_id,
    message: error.message,
  });

  return {
    ok: false,
    message: error.message ?? 'Failed to exchange the authorization code',
    subcode: error.error_subcode ?? null,
  };
}

/**
 * Resolve the caller's account_id from their profile.
 */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

export async function POST(request: Request) {
  console.log('>>> Hit /api/whatsapp/embedded-signup POST');
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { code, waba_id: clientWabaId, phone_number_id: clientPhoneNumberId } = body;

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      console.error('Missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET in environment variables.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Step 1: Exchange the Embedded Signup code for the customer's business
    // token. The code has a 30-second TTL, so this runs before anything else.
    const exchange = await exchangeCodeForBusinessToken({ code, appId, appSecret });

    if (!exchange.ok) {
      // Subcode 36008 is the redirect_uri comparison failure. Once the
      // parameter is omitted (as it is above), the remaining causes are
      // dashboard-side, so point the operator at them instead of repeating
      // Meta's misleading "make your redirect_uri identical" text.
      const isRedirectUriMismatch = exchange.subcode === 36008;
      const error = isRedirectUriMismatch
        ? 'Meta rejected the authorization code. This usually means the Facebook Login for Business ' +
          'configuration used to launch the flow is not a "WhatsApp Embedded Signup" configuration, ' +
          'or this domain is missing from Allowed Domains for the JavaScript SDK. ' +
          `(Meta: ${exchange.message})`
        : `Meta API error: ${exchange.message}`;

      return NextResponse.json({ error }, { status: 400 });
    }

    const accessToken = exchange.accessToken;

    // Step 2: Determine WABA ID
    // Prefer client-side captured values from the WA_EMBEDDED_SIGNUP event
    // listener — they're more reliable than debug_token. Fall back to
    // server-side resolution when the client didn't capture them.
    let wabaId = clientWabaId || null;

    if (!wabaId) {
      const debugUrl = `${META_API_BASE}/debug_token?input_token=${accessToken}`;
      const debugRes = await fetch(debugUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const debugData = await debugRes.json();

      if (!debugRes.ok || !debugData.data) {
        console.error('Failed to debug token:', debugData);
        return NextResponse.json(
          { error: `Meta API error: ${debugData.error?.message || 'Failed to validate token'}` },
          { status: 400 }
        );
      }

      const wabaScope = debugData.data.granular_scopes?.find((s: any) => s.scope === 'whatsapp_business_management');
      if (wabaScope && wabaScope.target_ids && wabaScope.target_ids.length > 0) {
        wabaId = wabaScope.target_ids[0];
      }
    }

    if (!wabaId) {
      return NextResponse.json(
        { error: 'Could not determine WhatsApp Business Account ID from the granted permissions. Please ensure you selected an account during setup.' },
        { status: 400 }
      );
    }

    // Step 3: Determine Phone Number ID
    let phoneNumberId = clientPhoneNumberId || null;

    if (!phoneNumberId) {
      const phonesUrl = `${META_API_BASE}/${wabaId}/phone_numbers`;
      const phonesRes = await fetch(phonesUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const phonesData = await phonesRes.json();

      if (!phonesRes.ok || !phonesData.data || phonesData.data.length === 0) {
        console.error('Failed to fetch phone numbers:', phonesData);
        return NextResponse.json(
          { error: `Meta API error: ${phonesData.error?.message || 'No phone numbers found in WABA'}` },
          { status: 400 }
        );
      }

      phoneNumberId = phonesData.data[0].id;
    }

    // Step 4: Verify the phone number (to get display info)
    let phoneInfo;
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId,
        accessToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('Meta API verification failed during save:', message);
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      );
    }

    // Step 5: Subscribe the WABA to our App's Webhook
    try {
      await subscribeWabaToApp({
        wabaId,
        accessToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('WABA webhook subscription failed:', message);
      // We don't block the whole process if this fails, but it's important
    }

    // Step 6: Encrypt and save to DB
    let encryptedAccessToken: string;
    try {
      encryptedAccessToken = encrypt(accessToken);
    } catch (err) {
      console.error('Encryption failed:', err);
      return NextResponse.json(
        { error: 'Failed to encrypt token. Check ENCRYPTION_KEY environment variable.' },
        { status: 500 }
      );
    }

    const { error: upsertError } = await supabase
      .from('whatsapp_config')
      .upsert({
        account_id: accountId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: encryptedAccessToken,
        connection_source: 'embedded_signup',
      }, { onConflict: 'account_id' });

    if (upsertError) {
      console.error('Failed to save config to DB:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save configuration to database' },
        { status: 500 }
      );
    }

    // Note: We skip the `registerPhoneNumber` step (requiring a PIN) here because
    // Embedded Signup v4 doesn't explicitly give us the PIN. The phone number is 
    // usually automatically registered during the embedded signup flow if the user 
    // provided the PIN in the popup. If it isn't, the user will see the "Not registered" 
    // banner and can enter a PIN manually later.

    return NextResponse.json({
      success: true,
      phone_info: phoneInfo,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
    });

  } catch (error) {
    console.error('Error in WhatsApp embedded-signup POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
