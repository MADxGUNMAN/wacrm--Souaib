import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import {
  registerPhoneNumber,
  subscribeWabaToApp,
} from '@/lib/whatsapp/meta-api';
import {
  generateTwoStepPin,
  isValidTwoStepPin,
} from '@/lib/whatsapp/two-step-pin';

/**
 * POST /api/whatsapp/config/complete-registration
 *
 * Finish activating a number that was connected but never registered on
 * the Cloud API.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Embedded Signup used to skip `POST /{phone_number_id}/register`
 * entirely, on the assumption that Meta performs it during the popup.
 * That holds for real phone numbers and is false for virtual ones, which
 * left accounts in a state that could not send a single message:
 *
 *   status:                   PENDING
 *   platform_type:            NOT_APPLICABLE   (never on the Cloud API)
 *   code_verification_status: VERIFIED         (the OTP was done)
 *
 * The signup route now registers on its own, so this endpoint is the
 * recovery path for numbers connected BEFORE that fix. Without it the
 * only remedy was to disconnect and re-onboard, which for a coexistence
 * number also throws away the one-shot 24-hour history import.
 *
 * ─── Owner-only, and why ──────────────────────────────────────────
 *
 * `/register` sets the number's two-step verification PIN when one is
 * not already enabled, and that is permanent — Meta offers no way to
 * read a PIN back or clear it without support. A member should not be
 * able to create an irreversible credential for the whole business.
 *
 * Idempotent. Meta answers "already registered" for a number that is
 * already live, which `registerPhoneNumber` reports as success, so a
 * double click is harmless.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    if (profile?.account_role !== 'owner') {
      return NextResponse.json(
        {
          error:
            'Only the workspace owner can complete registration, because it sets a two-step verification PIN that Meta cannot undo.',
        },
        { status: 403 }
      );
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token, two_step_pin')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!config?.phone_number_id) {
      return NextResponse.json(
        { error: 'Connect your WhatsApp Business account first.' },
        { status: 400 }
      );
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch {
      return NextResponse.json(
        {
          error:
            'The stored WhatsApp access token could not be read. Reconnect WhatsApp in Settings.',
          code: 'token_unreadable',
        },
        { status: 400 }
      );
    }

    // Reuse the PIN already on file rather than minting a new one.
    //
    // If this number was registered before, its two-step PIN is already
    // set on Meta's side; sending a different one would either be
    // rejected or silently rotate a credential the operator may have
    // written down. A fresh PIN is only generated when we hold none.
    let pin: string | null = null;
    let pinIsNew = false;
    if (config.two_step_pin) {
      try {
        const stored = decrypt(config.two_step_pin);
        if (isValidTwoStepPin(stored)) pin = stored;
      } catch {
        // Undecryptable (ENCRYPTION_KEY rotated). Fall through to a new
        // one — a PIN we cannot read is of no use to anybody.
      }
    }
    if (!pin) {
      pin = generateTwoStepPin();
      pinIsNew = true;
    }

    let alreadyRegistered = false;
    try {
      const result = await registerPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
        pin,
      });
      alreadyRegistered = result.alreadyRegistered;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('[complete-registration] /register failed:', message);
      await supabase
        .from('whatsapp_config')
        .update({ last_registration_error: message })
        .eq('account_id', accountId);
      return NextResponse.json(
        {
          error: message,
          code: 'register_failed',
        },
        { status: 502 }
      );
    }

    // Webhooks are a separate subscription from registration. Attempted
    // here too because a number that was never registered was very
    // likely never subscribed either, and a registered number with no
    // subscription receives nothing.
    let subscribedAt: string | null = null;
    if (config.waba_id) {
      try {
        await subscribeWabaToApp({ wabaId: config.waba_id, accessToken });
        subscribedAt = new Date().toISOString();
      } catch (err) {
        console.error(
          '[complete-registration] WABA subscription failed:',
          err instanceof Error ? err.message : err
        );
      }
    }

    const { error: updateError } = await supabase
      .from('whatsapp_config')
      .update({
        registered_at: new Date().toISOString(),
        two_step_pin: encrypt(pin),
        last_registration_error: null,
        ...(subscribedAt ? { subscribed_apps_at: subscribedAt } : {}),
      })
      .eq('account_id', accountId);

    if (updateError) {
      // Meta has registered the number by this point, so this is not a
      // registration failure — but if the PIN was newly generated it is
      // now unrecoverable, which the operator must be told.
      console.error(
        '[complete-registration] registered but row update failed:',
        updateError.message
      );
      return NextResponse.json(
        {
          success: true,
          already_registered: alreadyRegistered,
          pin: pinIsNew ? pin : null,
          warning:
            'The number was registered with Meta, but saving the details locally failed. Copy the PIN now if one is shown — it cannot be recovered.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      already_registered: alreadyRegistered,
      // Returned only when freshly generated, and only to the owner over
      // HTTPS. Meta can never return a PIN, so this response is the one
      // opportunity to show it. An existing PIN is not echoed back — the
      // operator either already has it or can see it in Settings.
      pin: pinIsNew ? pin : null,
      subscribed: subscribedAt != null,
      note: alreadyRegistered
        ? 'This number was already registered with Meta. Nothing changed.'
        : 'Your number is now registered on the WhatsApp Cloud API and can send messages.',
    });
  } catch (error) {
    console.error('Error completing WhatsApp registration:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to complete registration.',
      },
      { status: 500 }
    );
  }
}
