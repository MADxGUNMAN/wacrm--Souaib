// ============================================================
// /api/whatsapp/business-profile
//
//   GET   — the mirrored picture + About text for the connected number.
//   POST  — re-fetch from Meta and re-mirror the image.
//
// The refresh exists because a business can change its avatar in the
// WhatsApp Manager at any time and Meta sends no webhook when they do.
// Without a manual trigger the only way to update it would be to re-enter
// credentials, which is a lot to ask for a picture.
//
// Owner/admin gated on POST: it spends a Meta call and writes to the
// shared config row, so it is not something every agent should be able to
// trigger. GET is open to any member, since it only returns what the
// inbox header already displays.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { syncBusinessProfile } from '@/lib/whatsapp/business-profile';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Don't re-mirror more than once a minute per account.
 *
 * Each refresh is two network round trips plus an S3 write, and a held
 * button would otherwise pile up objects in the bucket — the key is
 * timestamped, so every call creates a new one.
 */
const REFRESH_WINDOW_MS = 60_000;

async function resolveContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized' as const };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) return { error: 'NoAccount' as const };

  return {
    supabase,
    userId: user.id,
    accountId,
    role: (profile?.account_role as string | null) ?? null,
  };
}

/**
 * How long a mirrored copy is considered current.
 *
 * Not driven by Meta's URL expiry — we hold our own permanent copy, so the
 * only reason to re-fetch is that the business CHANGED its avatar, and Meta
 * sends no webhook when they do. A week is a reasonable compromise between
 * noticing a new logo and not calling Meta on every page view.
 */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ceiling on AUTOMATIC syncs, separate from the manual one.
 *
 * Without this, an account whose token has gone bad would hit Meta on every
 * single page load forever, because a failed sync leaves `synced_at` null
 * and therefore still stale. Ten minutes bounds that to something
 * harmless while still letting a genuine problem resolve itself once the
 * token is fixed.
 */
const AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

export async function GET() {
  const ctx = await resolveContext();
  if ('error' in ctx) {
    return ctx.error === 'Unauthorized'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ connected: false });
  }

  const { data: config } = await ctx.supabase
    .from('whatsapp_config')
    .select(
      'phone_number_id, access_token, display_phone_number, verified_name, business_profile_picture_url, business_about, business_profile_synced_at'
    )
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (!config) return NextResponse.json({ connected: false });

  let pictureUrl = (config.business_profile_picture_url as string | null) ?? null;
  let about = (config.business_about as string | null) ?? null;
  let syncedAt = (config.business_profile_synced_at as string | null) ?? null;

  /**
   * Populate on read when we have never synced, or the copy has aged out.
   *
   * This is the difference between a feature that works and one that
   * technically exists: the columns were added after these numbers were
   * connected, so every existing workspace had a null picture and no way to
   * discover the refresh button. Requiring a manual click to see your own
   * logo is not a feature, it is homework.
   */
  const isStale =
    !syncedAt || Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS;

  if (isStale && config.phone_number_id && config.access_token) {
    const cooldown = checkRateLimit(
      `whatsapp:businessProfileAuto:${ctx.accountId}`,
      { limit: 1, windowMs: AUTO_SYNC_COOLDOWN_MS }
    );

    if (cooldown.success) {
      try {
        const profile = await syncBusinessProfile({
          phoneNumberId: config.phone_number_id as string,
          accessToken: decrypt(config.access_token as string),
          accountId: ctx.accountId,
        });

        pictureUrl = profile.pictureUrl;
        about = profile.about;
        syncedAt = new Date().toISOString();

        await ctx.supabase
          .from('whatsapp_config')
          .update({
            business_profile_picture_url: pictureUrl,
            business_about: about,
            business_profile_synced_at: syncedAt,
          })
          .eq('account_id', ctx.accountId);
      } catch (err) {
        // Serve what we have. A read must not fail because a decorative
        // refresh could not reach Meta.
        console.warn(
          '[GET /api/whatsapp/business-profile] auto-sync failed:',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  return NextResponse.json({
    connected: true,
    display_phone_number: config.display_phone_number ?? null,
    verified_name: config.verified_name ?? null,
    picture_url: pictureUrl,
    about,
    synced_at: syncedAt,
  });
}

export async function POST() {
  const ctx = await resolveContext();
  if ('error' in ctx) {
    return ctx.error === 'Unauthorized'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'No workspace found' }, { status: 400 });
  }

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only the workspace owner can refresh the business profile.' },
      { status: 403 }
    );
  }

  const limit = checkRateLimit(
    `whatsapp:businessProfileRefresh:${ctx.accountId}`,
    { limit: 1, windowMs: REFRESH_WINDOW_MS }
  );
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Just refreshed. Try again in a moment.' },
      { status: 429 }
    );
  }

  const { data: config } = await ctx.supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (!config?.phone_number_id || !config.access_token) {
    return NextResponse.json(
      { error: 'Connect a WhatsApp number first.' },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token as string);
  } catch {
    return NextResponse.json(
      { error: 'Stored credentials could not be read. Reconnect the number.' },
      { status: 400 }
    );
  }

  try {
    const profile = await syncBusinessProfile({
      phoneNumberId: config.phone_number_id as string,
      accessToken,
      accountId: ctx.accountId,
    });

    // `synced_at` records a successful CHECK, not necessarily a picture:
    // a business with no avatar set is a legitimate outcome, and stamping
    // it stops the UI implying the refresh never ran.
    await ctx.supabase
      .from('whatsapp_config')
      .update({
        business_profile_picture_url: profile.pictureUrl,
        business_about: profile.about,
        business_profile_synced_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId);

    return NextResponse.json({
      picture_url: profile.pictureUrl,
      about: profile.about,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/whatsapp/business-profile]', message);
    return NextResponse.json(
      { error: 'Meta refused the request. Check the number is still connected.' },
      { status: 502 }
    );
  }
}
