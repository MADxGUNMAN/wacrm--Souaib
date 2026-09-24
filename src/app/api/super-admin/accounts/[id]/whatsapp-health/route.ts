// ============================================================
// Live Meta state for ONE tenant, for the platform operator.
//
// WHY THIS IS A SEPARATE ENDPOINT
// The deep-dive RPC answers from our own tables in one round trip. This needs
// four or five calls to Meta, and it needs the tenant's decrypted access token.
// Folding it into `fn_account_deep_dive` would make the whole page wait on
// Meta and fail with it; as its own endpoint the page renders instantly and
// this panel fills in.
//
// ─── The new blast radius, stated plainly ─────────────────────────
//
// No super-admin route has ever decrypted a tenant's WhatsApp token before
// (a repo-wide search for `decrypt(` under src/app/api/super-admin/**
// returned nothing). This is the first, so the rules it follows are explicit:
//
//   * the plaintext token never leaves this function — not in the response,
//     not in a log line, not in an error message,
//   * the ENCRYPTED value is never returned either. Migration 078 exists
//     because `row_to_json(wc.*)` shipped it to the browser, and an encrypted
//     secret in a JSON response is still a secret in a JSON response,
//   * the response carries only Meta's own verdicts and identifiers the
//     operator can already see elsewhere on the page.
//
// ─── What this deliberately does NOT claim ────────────────────────
//
// "Is a payment method added?" has no answer in the Graph API. There is no
// public field for it. What Meta does expose is whether it is currently
// refusing to send FOR a payment reason, so that is what is reported —
// `payment: 'no_issue'` means Meta is not complaining, not "a card exists".
// Inventing the stronger claim is the exact mistake `health.ts` was written to
// stop; see its header.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { decrypt } from '@/lib/whatsapp/encryption';
import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import {
  derivePaymentState,
  deriveVerificationState,
  groupHealthIssues,
  summarizeHealthStatus,
} from '@/lib/whatsapp/health';
import {
  parseMessagingLimit,
  parseNameStatus,
  parseThroughput,
} from '@/lib/whatsapp/limits';
import type { SuperAdminWhatsAppHealth } from '@/types/super-admin';

/** Meta is slow often enough that an unbounded wait would hang the panel. */
const META_TIMEOUT_MS = 12_000;

/**
 * One Meta GET, isolated so a single unsupported field cannot take the panel
 * down with it.
 *
 * Every caller below gets its own request for the same reason `account-info`
 * splits them: Graph fails the ENTIRE `fields=` request if any one field is
 * unsupported for the token or API version, so bundling `health_status` with
 * `display_phone_number` would trade the whole panel for a nice-to-have.
 *
 * Returns null on any failure — never throws, so `Promise.all` cannot lose
 * four good answers because the fifth timed out.
 */
async function metaGet(
  path: string,
  /** Null for an EDGE (e.g. `/subscribed_apps`), which takes no `fields`. */
  fields: string | null,
  accessToken: string,
  label: string
): Promise<Record<string, unknown> | null> {
  try {
    const url = fields
      ? `${META_API_BASE}/${path}?fields=${encodeURIComponent(fields)}`
      : `${META_API_BASE}/${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      };
      // Meta's message only. Never the token, and never the whole request URL,
      // which carries it in no form but is still not useful noise.
      console.error(
        `[super-admin/whatsapp-health] ${label} failed:`,
        body.error?.message ?? res.status
      );
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error(
      `[super-admin/whatsapp-health] ${label} threw:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id: accountId } = await params;

    const admin = supabaseAdmin();
    const { data: config, error: configError } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError) {
      return NextResponse.json(
        { error: `Could not read the connection: ${configError.message}` },
        { status: 503 }
      );
    }

    // Not an error. Most accounts on a young platform have no connection, and
    // a 404 here would make the card render a failure for a normal state.
    if (!config?.phone_number_id || !config.access_token) {
      const empty: SuperAdminWhatsAppHealth = {
        phone: null,
        waba: null,
        sending: {
          readiness: 'unknown',
          payment: 'unknown',
          verification: 'unknown',
          issues: [],
        },
        webhook_subscribed: null,
        limits: { messaging: null, throughput: null, nameReview: null },
        error: null,
        checked_at: new Date().toISOString(),
      };
      return NextResponse.json(empty);
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch {
      // Worth distinguishing from "Meta said no": a token that cannot be
      // decrypted means ENCRYPTION_KEY changed or the row is corrupt, and the
      // tenant's own dashboard is equally broken. That is an operator action,
      // not a Meta one.
      return NextResponse.json(
        {
          error:
            'This account\u2019s stored access token could not be decrypted, so Meta cannot be queried. ' +
            'The tenant will need to reconnect WhatsApp.',
          checked_at: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    const phoneId = config.phone_number_id as string;
    const wabaId = (config.waba_id as string | null) ?? null;

    // All in parallel. Each is independently nullable, so a slow or
    // unsupported one degrades its own row of the card and nothing else.
    const [phoneRaw, healthWrap, limitWrap, wabaRaw, subscribedWrap] =
      await Promise.all([
        metaGet(
          phoneId,
          'id,display_phone_number,verified_name,quality_rating,status,name_status,code_verification_status,platform_type,is_on_biz_app',
          accessToken,
          'phone fields'
        ),
        metaGet(phoneId, 'health_status', accessToken, 'health_status'),
        metaGet(
          phoneId,
          'whatsapp_business_manager_messaging_limit,throughput',
          accessToken,
          'messaging limit'
        ),
        wabaId
          ? metaGet(
              wabaId,
              'id,name,account_review_status,business_verification_status,is_enabled_for_insights,currency,timezone_id',
              accessToken,
              'WABA fields'
            )
          : Promise.resolve(null),
        // Whether OUR app is actually receiving this WABA's webhooks.
        //
        // Asked of Meta rather than trusted from `whatsapp_config
        // .subscribed_apps_at`, because that column only records calls WE made
        // and is null on every account that connected before it was written.
        // Verified on a live tenant: the column was null while Meta listed the
        // app as subscribed — so believing our own bookkeeping would have shown
        // a red "inbound messages are being lost" on a perfectly healthy
        // account. An edge, not a field, so no `fields` parameter.
        wabaId
          ? metaGet(
              `${wabaId}/subscribed_apps`,
              null,
              accessToken,
              'subscribed_apps'
            )
          : Promise.resolve(null),
      ]);

    // Every call failing together means Meta or the token is the problem, not
    // one field. Say so once rather than rendering five empty rows.
    if (!phoneRaw && !healthWrap && !limitWrap && !wabaRaw) {
      const failed: SuperAdminWhatsAppHealth = {
        phone: null,
        waba: null,
        sending: {
          readiness: 'unknown',
          payment: 'unknown',
          verification: 'unknown',
          issues: [],
        },
        webhook_subscribed: null,
        limits: { messaging: null, throughput: null, nameReview: null },
        error:
          'Meta did not answer for this account. The access token may have expired or been revoked \u2014 check the token expiry above.',
        checked_at: new Date().toISOString(),
      };
      return NextResponse.json(failed);
    }

    // Meta returns `{ data: [ { whatsapp_business_api_data: {...} } ] }`, one
    // entry per subscribed app. A non-empty array is the answer; null means we
    // could not ask, which must stay distinct from "not subscribed".
    const subscribedApps = Array.isArray(subscribedWrap?.data)
      ? (subscribedWrap.data as unknown[])
      : null;
    const webhookSubscribed =
      subscribedApps === null ? null : subscribedApps.length > 0;

    const health = summarizeHealthStatus(healthWrap?.health_status ?? null);
    const grouped = groupHealthIssues(health);
    const nameReview = parseNameStatus(phoneRaw?.name_status);
    const messaging = parseMessagingLimit(
      limitWrap?.whatsapp_business_manager_messaging_limit ?? null
    );
    const throughput = parseThroughput(limitWrap?.throughput ?? null);

    const body: SuperAdminWhatsAppHealth = {
      phone: phoneRaw
        ? {
            display_phone_number: str(phoneRaw.display_phone_number),
            verified_name: str(phoneRaw.verified_name),
            quality_rating: str(phoneRaw.quality_rating),
            status: str(phoneRaw.status),
            name_status: str(phoneRaw.name_status),
            code_verification_status: str(phoneRaw.code_verification_status),
            platform_type: str(phoneRaw.platform_type),
            // The authoritative Coexistence signal. `platform_type` reports
            // CLOUD_API for both kinds of number, so it cannot be used here —
            // see reconcileConnectionMode in connection-mode.ts.
            is_on_biz_app: bool(phoneRaw.is_on_biz_app),
          }
        : null,
      waba: wabaRaw
        ? {
            name: str(wabaRaw.name),
            account_review_status: str(wabaRaw.account_review_status),
            business_verification_status: str(
              wabaRaw.business_verification_status
            ),
            is_enabled_for_insights: bool(wabaRaw.is_enabled_for_insights),
            currency: str(wabaRaw.currency),
            timezone_id: str(wabaRaw.timezone_id),
          }
        : null,
      sending: {
        readiness: health.readiness,
        payment: derivePaymentState({
          readiness: health.readiness,
          paymentIssues: grouped.payment,
        }),
        verification: deriveVerificationState(
          str(wabaRaw?.business_verification_status)
        ),
        // Flattened for transport, keeping Meta's wording verbatim. The
        // display_name bucket is included here (unlike the tenant-facing
        // screen, which suppresses it as redundant beside its own tile)
        // because an operator diagnosing a send failure wants everything Meta
        // said, not a curated subset.
        issues: (
          [
            'payment',
            'business_verification',
            'display_name',
            'registration',
            'other',
          ] as const
        ).flatMap((subject) =>
          grouped[subject].map((issue) => ({
            subject,
            description: issue.description,
            solution: issue.solution,
            severity: issue.severity,
            code: issue.code,
          }))
        ),
      },
      webhook_subscribed: webhookSubscribed,
      limits: {
        messaging: messaging?.label ?? null,
        // `level`, not `label` — Throughput carries a level plus an optional
        // human sentence, unlike MessagingLimit which has a ready label.
        throughput: throughput?.level ?? null,
        nameReview: { label: nameReview.label, detail: nameReview.detail },
      },
      error: null,
      checked_at: new Date().toISOString(),
    };

    return NextResponse.json(body);
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/whatsapp-health] unexpected failure:', err);
    return NextResponse.json(
      { error: 'Could not load the WhatsApp health for this account.' },
      { status: 500 }
    );
  }
}
