import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api';

import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import { requestCoexistenceSync } from '@/lib/whatsapp/coexistence-sync';
import { generateTwoStepPin } from '@/lib/whatsapp/two-step-pin';
import { expiresInToTimestamp } from '@/lib/whatsapp/token-expiry';
import { upgradeToNonExpiringToken } from '@/lib/whatsapp/token-upgrade';
import {
  reconcileConnectionMode,
  resolveConnectionMode,
} from '@/lib/whatsapp/connection-mode';

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
    const res = await fetch(
      `${META_API_BASE}/oauth/access_token?${qs.toString()}`,
      {
        method: 'GET',
      }
    );
    payload = (await res.json()) as Record<string, unknown>;

    if (res.ok && typeof payload.access_token === 'string') {
      return {
        ok: true,
        accessToken: payload.access_token,
        expiresIn:
          typeof payload.expires_in === 'number' ? payload.expires_in : null,
      };
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error calling Meta';
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
  userId: string
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
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      code,
      waba_id: clientWabaId,
      phone_number_id: clientPhoneNumberId,
      finish_event: finishEvent,
      requested_feature_type: requestedFeatureType,
    } = body;

    // ── Coexistence detection ────────────────────────────────
    // Coexistence means this number stays live on the WhatsApp Business
    // App while also running on the Cloud API. It has to be recorded,
    // because it changes behaviour (Meta sends echoes of messages typed
    // on the phone) and it changes the rules the operator must follow
    // (open the app every 13 days, profile picture is frozen).
    //
    // PRECEDENCE, and why it is not an OR.
    //
    // Two signals exist, and they are NOT equal in authority:
    //
    //   * `finish_event` — Meta's report of what actually happened.
    //     `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` means coexistence;
    //     plain `FINISH` / `FINISH_ONLY_WABA` / `FINISH_OBO_MIGRATION`
    //     mean it was not. This is an OUTCOME.
    //
    //   * `requested_feature_type` — what the operator picked in our own
    //     modal before the flow opened. This is only an INTENTION, and
    //     the operator can freely diverge from it once inside Meta's UI.
    //
    // This used to be `finishEvent says coexistence || operator asked for
    // coexistence`, which let the intention override the outcome. That
    // misfired in practice: the operator chose "a number currently active
    // on WhatsApp Business app", then inside Meta's flow selected an
    // EXISTING Cloud API WhatsApp Business Account instead of "Connect a
    // WhatsApp Business app". Meta correctly returned a plain FINISH, but
    // the OR still stamped the row `coexistence`.
    //
    // The consequences were all user-visible: Settings showed a
    // Coexistence badge and the "open the app every 13 days or Meta drops
    // the connection" warning for a number with no phone app attached,
    // and the history/contact sync fired against an account that cannot
    // serve it, failing with Meta error #133010 "Account not registered"
    // and burning 2 of its 3 one-shot attempts.
    //
    // So: when Meta reported an outcome, that outcome wins outright. The
    // operator's intention is consulted ONLY when no outcome arrived at
    // all, which happens when the postMessage channel is lost (popup
    // closed early, blocked message). Guessing coexistence in that
    // narrow case is still worthwhile, because the sync has a hard 24h
    // window and a missed echo is more expensive than a wrong badge.
    //
    // The webhook remains the final authority either way: the first real
    // echo promotes the row to coexistence (see handleMessageEchoes), and
    // an echo is proof rather than inference.
    // Lives in connection-mode.ts so the precedence rule is unit-testable;
    // as an inline ternary it was wrong for months with nothing to catch it.
    //
    // This is still only an INFERENCE at this point. It gets checked against
    // Meta's own view of the number in step 4 below, once we have a token and
    // a phone_number_id to ask about — see `reconcileConnectionMode`.
    const inferredConnectionMode = resolveConnectionMode({
      finishEvent,
      requestedFeatureType,
    });

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      console.error(
        'Missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET in environment variables.'
      );
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Step 1: Exchange the Embedded Signup code for the customer's business
    // token. The code has a 30-second TTL, so this runs before anything else.
    const exchange = await exchangeCodeForBusinessToken({
      code,
      appId,
      appSecret,
    });

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
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const debugData = await debugRes.json();

      if (!debugRes.ok || !debugData.data) {
        console.error('Failed to debug token:', debugData);
        return NextResponse.json(
          {
            error: `Meta API error: ${debugData.error?.message || 'Failed to validate token'}`,
          },
          { status: 400 }
        );
      }

      const wabaScope = debugData.data.granular_scopes?.find(
        (s: any) => s.scope === 'whatsapp_business_management'
      );
      if (
        wabaScope &&
        wabaScope.target_ids &&
        wabaScope.target_ids.length > 0
      ) {
        wabaId = wabaScope.target_ids[0];
      }
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          error:
            'Could not determine WhatsApp Business Account ID from the granted permissions. Please ensure you selected an account during setup.',
        },
        { status: 400 }
      );
    }

    // Step 3: Determine Phone Number ID
    let phoneNumberId = clientPhoneNumberId || null;

    if (!phoneNumberId) {
      const phonesUrl = `${META_API_BASE}/${wabaId}/phone_numbers`;
      const phonesRes = await fetch(phonesUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const phonesData = await phonesRes.json();

      if (!phonesRes.ok || !phonesData.data || phonesData.data.length === 0) {
        console.error('Failed to fetch phone numbers:', phonesData);
        return NextResponse.json(
          {
            error: `Meta API error: ${phonesData.error?.message || 'No phone numbers found in WABA'}`,
          },
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
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('Meta API verification failed during save:', message);
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      );
    }

    // ── Confirm the connection mode against Meta ─────────────
    //
    // The inference above can be wrong whenever `finish_event` failed to
    // arrive, which happens for ordinary reasons (popup closed a beat early, a
    // browser extension blocking cross-origin messages). In that case the mode
    // came from what the operator picked in our modal, and they are free to
    // change their mind inside Meta's UI.
    //
    // `is_on_biz_app` on the phone number settles it. Note it is NOT
    // `platform_type` — that reports CLOUD_API for coexistence and plain Cloud
    // API alike, so reconciling on it would demote every correct coexistence
    // row. The reasoning and the live evidence are in connection-mode.ts.
    //
    // Done HERE, before the upsert, so a wrong mode is never written in the
    // first place. Writing then correcting would still fire the coexistence
    // history sync below at an account that cannot serve it, which is a
    // one-shot request with only 3 lifetime attempts.
    const reconciled = reconcileConnectionMode({
      inferred: inferredConnectionMode,
      isOnBizApp: phoneInfo.is_on_biz_app,
    });
    const connectionMode = reconciled.mode;

    if (reconciled.corrected) {
      console.warn(
        '[embedded-signup] connection mode corrected by Meta:',
        reconciled.reason
      );
    }

    // Step 5: Subscribe the WABA to our App's Webhook
    //
    // The outcome is captured rather than discarded. `subscribed_apps_at`
    // exists on the row and was never being written by this route, so the
    // registration diagnostics reported every Embedded Signup account as
    // unsubscribed even when the call had succeeded.
    let subscribedAt: string | null = null;
    try {
      await subscribeWabaToApp({
        wabaId,
        accessToken,
      });
      subscribedAt = new Date().toISOString();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
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
        {
          error:
            'Failed to encrypt token. Check ENCRYPTION_KEY environment variable.',
        },
        { status: 500 }
      );
    }

    const { error: upsertError } = await supabase
      .from('whatsapp_config')
      .upsert(
        {
          user_id: user.id,
          account_id: accountId,
          phone_number_id: phoneNumberId,
          // The number itself, from the verifyPhoneNumber call in step 4
          // above. It was already being fetched and then dropped, which is
          // why the panels had nothing but the asset id to display.
          display_phone_number: phoneInfo.display_phone_number ?? null,
          verified_name: phoneInfo.verified_name ?? null,
          waba_id: wabaId,
          access_token: encryptedAccessToken,
          connection_source: 'embedded_signup',
          connection_mode: connectionMode,
          status: 'connected',
          connected_at: new Date().toISOString(),
          // The login configuration in use issues 60-day tokens, and
          // `expires_in` came back from the exchange above. It used to be
          // parsed and then discarded, which made expiry the worst class of
          // outage: on day 61 every Meta call fails, webhooks keep arriving
          // and silently cannot be answered, and nothing records the cause.
          // Persisting it is what allows a warning before the deadline
          // instead of a diagnosis after it. Null when Meta reported no
          // expiry — see token-expiry.ts, where null is explicitly NOT
          // treated as expired.
          token_expires_at: expiresInToTimestamp(exchange.expiresIn),
          subscribed_apps_at: subscribedAt,
          // Clear any previous disconnect. Reconnecting IS the fix for most
          // coexistence disconnect reasons, so leaving a stale reason behind
          // would keep showing the operator a problem they just solved.
          disconnect_event: null,
          disconnect_reason: null,
          disconnected_at: null,
        },
        { onConflict: 'account_id' }
      );

    if (upsertError) {
      console.error('Failed to save config to DB:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save configuration to database' },
        { status: 500 }
      );
    }

    // ── Register the number on the Cloud API ─────────────────
    //
    // This step used to be skipped, on the assumption that Meta
    // "usually" registers the number itself during the popup. That
    // assumption holds for REAL phone numbers and is false for VIRTUAL
    // ones, which is how two accounts ended up permanently unusable:
    //
    //   status:        PENDING
    //   platform_type: NOT_APPLICABLE   ← never on the Cloud API
    //   code_verification_status: VERIFIED  ← the OTP was done
    //
    // Meta's own dashboard showed them Pending too, so nothing was
    // mis-reported — the number genuinely could not send a single
    // message, and no path existed inside the CRM to finish the job.
    //
    // WHY A GENERATED PIN
    //
    // /register requires a 6-digit `pin`, and Embedded Signup neither
    // collects one nor returns one. On a number with no two-step
    // verification yet, the PIN passed here BECOMES the permanent PIN, so
    // it is generated with a CSPRNG and stored encrypted; Meta cannot
    // read a PIN back, making this row the only copy.
    //
    // Non-fatal by contract. The account is connected and the token is
    // saved by this point; a failed registration must leave the operator
    // with a retry, not with a failed onboarding and no credentials. The
    // reason is persisted to `last_registration_error` and surfaced in
    // Settings behind a "Complete registration" button.
    let registered = false;
    let registrationError: string | null = null;
    try {
      const pin = generateTwoStepPin();
      await registerPhoneNumber({ phoneNumberId, accessToken, pin });
      registered = true;

      const { error: pinError } = await supabase
        .from('whatsapp_config')
        .update({
          registered_at: new Date().toISOString(),
          // Only written after Meta accepted it. Storing a PIN Meta
          // rejected would be worse than storing none: it would look
          // authoritative while opening nothing.
          two_step_pin: encrypt(pin),
          last_registration_error: null,
        })
        .eq('account_id', accountId);

      if (pinError) {
        // The number IS registered on Meta's side at this point, so this
        // is not a registration failure — it is a lost PIN, which the
        // operator needs to know about because it cannot be recovered.
        console.error(
          '[embedded-signup] number registered but PIN could not be saved:',
          pinError.message
        );
      }
    } catch (err) {
      registrationError =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error(
        '[embedded-signup] phone number /register failed:',
        registrationError
      );
      await supabase
        .from('whatsapp_config')
        .update({ last_registration_error: registrationError })
        .eq('account_id', accountId);
    }

    // ── Make the connection permanent ────────────────────────
    //
    // The login configuration in use issues 60-day tokens, so without this
    // step every connection quietly dies two months after it is made.
    //
    // Meta has no refresh grant for business tokens, but it does expose
    // POST /{client-business-id}/system_user_access_tokens, which mints a
    // NEW system user token from an existing one. Its
    // `set_token_expires_in_60_days` flag is opt-in, and system user tokens
    // "default to never expire", so omitting the flag yields a permanent
    // credential. See token-upgrade.ts for the full reasoning.
    //
    // Runs here, while the freshly issued token is definitely valid, rather
    // than in a background job that would have to race the deadline.
    //
    // Non-fatal: a 60-day token is still a working connection, so a failure
    // must not turn a successful onboarding into an error. On failure
    // `token_expires_at` stays populated and the expiry warning covers it.
    let tokenPermanent = false;
    try {
      const { data: cfg } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .maybeSingle();

      if (cfg) {
        const upgrade = await upgradeToNonExpiringToken({
          db: supabase,
          configId: cfg.id,
          accessToken,
          appSecret,
        });
        tokenPermanent = upgrade.upgraded;
        if (!upgrade.upgraded) {
          console.warn(
            '[embedded-signup] token upgrade skipped:',
            upgrade.message
          );
        }
      }
    } catch (err) {
      console.error(
        '[embedded-signup] token upgrade threw:',
        err instanceof Error ? err.message : err
      );
    }

    // ── Coexistence: start the history + contact import ──────
    //
    // Deliberately done HERE, inline, rather than left to a button the
    // operator might click tomorrow. Meta only accepts this request once,
    // and only within 24 hours of onboarding — after that the customer
    // has to disconnect and re-onboard to get their history, which is the
    // very thing they chose Coexistence to avoid.
    //
    // Non-fatal: the number is connected and usable either way, so a sync
    // failure must not turn a successful connection into an error. The
    // reason is persisted to `sync_last_error` and surfaced in Settings,
    // where it can still be retried inside the window.
    let syncRequested = false;
    if (connectionMode === 'coexistence') {
      try {
        const { data: savedConfig } = await supabase
          .from('whatsapp_config')
          .select('id, connected_at')
          .eq('account_id', accountId)
          .maybeSingle();

        if (savedConfig) {
          const outcome = await requestCoexistenceSync({
            db: supabase,
            configId: savedConfig.id,
            phoneNumberId,
            accessToken,
            connectedAt: savedConfig.connected_at,
          });
          syncRequested = outcome.requested;
        }
      } catch (err) {
        console.error(
          '[embedded-signup] coexistence sync request threw:',
          err instanceof Error ? err.message : err
        );
      }
    }

    return NextResponse.json({
      success: true,
      connection_mode: connectionMode,
      // Surfaced so support can see that Meta overrode our inference rather
      // than having to reconstruct it from server logs.
      connection_mode_corrected: reconciled.corrected,
      token_permanent: tokenPermanent,
      sync_requested: syncRequested,
      // Surfaced so the client can tell "connected and live" from
      // "connected but cannot send yet", which used to look identical.
      registered,
      registration_error: registrationError,
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
