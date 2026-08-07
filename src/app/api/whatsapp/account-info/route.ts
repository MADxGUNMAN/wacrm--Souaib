import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { summarizeHealthStatus } from '@/lib/whatsapp/health';
import {
  parseMessagingLimit,
  parseNameStatus,
  parseThroughput,
  summarizeUsage,
} from '@/lib/whatsapp/limits';
import {
  computeInitiatedUsage,
  type InitiatedUsage,
} from '@/lib/whatsapp/usage';

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

    // Messaging health — fetched as its OWN request, deliberately not
    // appended to `phoneFields` above.
    //
    // Graph fails an entire `fields=` request if any single field is
    // unsupported or not permitted for the token. Bundling `health_status`
    // in would mean that on an API version or permission set that doesn't
    // expose it, we would lose display_phone_number, quality_rating and
    // status too — trading a nice-to-have for the whole panel. Isolated,
    // a failure here costs only the health summary and the UI falls back
    // to neutral copy.
    let healthRaw: unknown = null;
    try {
      const healthRes = await fetch(
        `${META_API_BASE}/${config.phone_number_id}?fields=health_status`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (healthRes.ok) {
        const body = (await healthRes.json()) as Record<string, unknown>;
        healthRaw = body.health_status ?? null;
      } else {
        const errBody = await healthRes.json().catch(() => ({}));
        console.error('[account-info] health_status fetch failed:', errBody);
      }
    } catch (err) {
      console.error('[account-info] health_status request threw:', err);
    }

    // Messaging limit + throughput.
    //
    // Separate request for the same reason as health_status: these are
    // newer fields and `whatsapp_business_manager_messaging_limit`
    // replaced the now-deprecated `messaging_limit_tier`, so on an older
    // API version the field name may not resolve. Bundling it into
    // `phoneFields` would take the whole panel down with it.
    let limitRaw: unknown = null;
    let throughputRaw: unknown = null;
    try {
      const res = await fetch(
        `${META_API_BASE}/${config.phone_number_id}?fields=whatsapp_business_manager_messaging_limit,throughput`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        limitRaw = body.whatsapp_business_manager_messaging_limit ?? null;
        throughputRaw = body.throughput ?? null;
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.error('[account-info] messaging limit fetch failed:', errBody);
      }
    } catch (err) {
      console.error('[account-info] messaging limit request threw:', err);
    }

    // Sent/delivered volume for the last 30 days.
    //
    // Meta requires start, end and granularity, and caps the lookback at
    // one year as of December 2025. DAY granularity is summed on our side
    // rather than charted here.
    let usageRaw: unknown = null;
    const USAGE_DAYS = 30;
    if (config.waba_id) {
      try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - USAGE_DAYS * 24 * 60 * 60;
        const res = await fetch(
          `${META_API_BASE}/${config.waba_id}?fields=analytics.start(${start}).end(${end}).granularity(DAY)`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
          const body = (await res.json()) as Record<string, unknown>;
          usageRaw = body.analytics ?? null;
        } else {
          const errBody = await res.json().catch(() => ({}));
          console.error('[account-info] analytics fetch failed:', errBody);
        }
      } catch (err) {
        console.error('[account-info] analytics request threw:', err);
      }
    }

    // ---- How much of the 24-hour allowance is used ----
    //
    // Computed from our own messages, because Meta publishes the limit but
    // no consumption figure. See src/lib/whatsapp/usage.ts for why the
    // naive "count messages" version would be wrong.
    //
    // Two separate queries joined in memory rather than a PostgREST
    // embed: embeds resolve through the schema cache, which this project
    // has already been bitten by (issue #294), and a silent embed failure
    // here would quietly zero the usage figure rather than erroring.
    //
    // A 48-hour inbound window is needed to spot a service window that was
    // already open when the oldest send in the 24-hour window happened.
    let usage: InitiatedUsage | null = null;
    try {
      const now = Date.now();
      const outboundSince = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const inboundSince = new Date(now - 48 * 60 * 60 * 1000).toISOString();

      // RLS scopes both reads to this user's account, so no explicit
      // account filter is needed here — and cannot be forgotten.
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, contact_id');

      const contactByConversation = new Map<string, string>(
        (conversations ?? [])
          .filter((c) => c.id && c.contact_id)
          .map((c) => [c.id as string, c.contact_id as string]),
      );

      if (contactByConversation.size > 0) {
        const [outboundRes, inboundRes] = await Promise.all([
          supabase
            .from('messages')
            .select('conversation_id, created_at')
            .in('sender_type', ['agent', 'bot'])
            .gte('created_at', outboundSince)
            .limit(20000),
          supabase
            .from('messages')
            .select('conversation_id, created_at')
            .eq('sender_type', 'customer')
            .gte('created_at', inboundSince)
            .limit(20000),
        ]);

        const toEvents = (rows: typeof outboundRes.data) =>
          (rows ?? []).flatMap((row) => {
            const contactId = contactByConversation.get(
              row.conversation_id as string,
            );
            if (!contactId) return [];
            return [{ contactId, at: new Date(row.created_at as string) }];
          });

        usage = computeInitiatedUsage(
          toEvents(outboundRes.data),
          toEvents(inboundRes.data),
          24,
          new Date(now),
        );
      } else {
        // No conversations at all — a genuine zero, not a failed read.
        usage = computeInitiatedUsage([], [], 24, new Date(now));
      }
    } catch (err) {
      console.error('[account-info] usage computation failed:', err);
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
      // Normalised here rather than in the component so the setup
      // checklist renders Meta's verdict without re-deriving it.
      health: summarizeHealthStatus(healthRaw),

      // Limits and usage. Each is independently nullable, because each
      // comes from a request that can fail on its own.
      limits: {
        messaging: parseMessagingLimit(limitRaw),
        throughput: parseThroughput(throughputRaw),
        nameReview: parseNameStatus(phoneData.name_status),
        usage: summarizeUsage(usageRaw, USAGE_DAYS),
        // Our own count against the rolling 24h allowance. Named
        // `initiated` rather than `used` to keep it distinct from Meta's
        // figures above, which it is not.
        initiated: usage,
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
