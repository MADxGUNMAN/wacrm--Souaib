// ============================================================
// POST /api/v1/campaigns/{id}/send — trigger one send through a
// reusable API campaign (scope: broadcasts:send).
//
// This is the endpoint the Google Sheets add-on calls on every matching
// row. See docs/google-sheets-addon-plan.md §6.3 for the designed
// contract; this implements it.
//
// Body:
//   {
//     "idempotency_key": "<caller-computed, see plan §5.3>",
//     "recipients": [
//       { "to": "+919876543210", "name": "Souaib",
//         "params": ["393392","200","2 Days"],
//         "media_url": "https://…/invoice.pdf",
//         "button_params": { "0": "ORD-123" } }
//     ],
//     "param_labels": ["Name", "Delevery id", "Price"],   // optional
//     "source": { "kind": "google_sheets", "spreadsheet_id": "…",
//                 "sheet": "Sheet1", "rule_id": "…" }   // optional
//   }
//
// `param_labels` names each positional value in `recipients[].params`, so
// the campaign report can show "Delevery id: 393392" rather than a column
// of unlabelled numbers. Both it and `source` are persisted on the run
// (`broadcasts.variable_labels` / `.source_ref`, migration
// 20260915130000) — `source` used to be read for its `kind` and then
// thrown away, which left every run of a campaign carrying an identical
// name and nothing to tell them apart but a timestamp.
//
// ─── When this sends inline, and when it queues ───────────────────
//
// Small sends go out immediately; large ones are handed to the cron.
//
// The inline path fans out inside the request via `after()`, bounded by
// `maxDuration = 60`. That budget is the whole constraint: each recipient
// is one Meta call, and a phone-variant retry can double it, so a large
// audience can exceed 60s mid-fan-out and strand recipients as 'pending'
// with the broadcast stuck 'sending' and nobody to finish it. Above
// `INLINE_MAX_RECIPIENTS` this route therefore persists as
// `mode: 'schedule'` (status 'scheduled', due now) and lets the existing
// five-minute sweep (`src/app/api/broadcasts/cron/route.ts`) drain it,
// reusing a worker whose claim-based locking already makes double-sending
// structurally impossible.
//
// This split replaces an earlier version that ALWAYS queued. That was
// wrong for the caller this endpoint exists to serve: the Google Sheets
// add-on sends one recipient per call (its idempotency key is per row —
// see sheets-addon/src/send.js), and one recipient cannot come close to
// the 60-second ceiling. Queueing it bought nothing and cost up to five
// minutes of latency on an "On Change" rule, which is meant to feel
// immediate — an order confirmation arriving four minutes after the row
// was marked shipped reads as broken.
//
// ─── Why idempotency is enforced here, not just documented ────────
//
// A spreadsheet's `onChange` trigger can fire more than once for one
// logical edit (paste, fill-down, undo). The caller computes a
// deterministic key; this route claim-inserts it into
// `api_campaign_sends`, whose `UNIQUE (api_campaign_id, idempotency_key)`
// constraint is the actual guard — see migration
// `20260912100000_api_campaigns.sql`. A duplicate key returns 200 with
// the ORIGINAL broadcast id and sends nothing, rather than erroring —
// a replay must be cheap for the caller to retry on a flaky connection.
// ============================================================

import { after } from 'next/server';

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { isInvalidTextRepresentation } from '@/lib/api/v1/db-errors';
import { resolveAuditUserId, ContactError } from '@/lib/api/v1/contacts';
import {
  createBroadcast,
  deliverBroadcast,
  BroadcastError,
  type BroadcastRecipientInput,
} from '@/lib/whatsapp/broadcast-core';

/** Headroom for the inline fan-out. See the module header. */
export const maxDuration = 60;

/**
 * Largest request still delivered inline.
 *
 * Sized off the budget rather than taste: one recipient is one Meta call
 * at roughly a second, doubled by a phone-variant retry, so 25 leaves
 * well over half the 60-second allowance spare for the request itself.
 * Deliberately far below this route's 1000-recipient input cap — being
 * cut off mid-fan-out is a worse outcome than five minutes of latency,
 * so anything genuinely bulky goes to the sweep.
 */
const INLINE_MAX_RECIPIENTS = 25;
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import {
  getAccountSubscription,
  getGateConfig,
} from '@/lib/subscription/queries';
import { resolveSubscriptionState } from '@/lib/subscription/status';

const MAX_KEY_LEN = 200;

interface RecipientBody {
  to?: unknown;
  name?: unknown;
  params?: unknown;
  media_url?: unknown;
  button_params?: unknown;
}

/**
 * Map one wire recipient into the shape `createBroadcast` accepts.
 *
 * Only `media_url` and `button_params` are exposed on the wire today —
 * the two things Sheets rows realistically drive (an invoice URL, an
 * order-id suffix on a button). The rest of `SendTimeParams` (carousels,
 * flows, commerce) exists for completeness in the type but has no wire
 * mapping yet; a campaign needing them can still be triggered from the
 * dashboard broadcast wizard in the meantime.
 */
function toRecipientInput(raw: unknown): BroadcastRecipientInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RecipientBody;
  if (typeof r.to !== 'string' || !r.to.trim()) return null;

  const params = Array.isArray(r.params)
    ? r.params.filter((p): p is string => typeof p === 'string')
    : undefined;

  const messageParams: SendTimeParams = {};
  if (typeof r.media_url === 'string' && r.media_url.trim()) {
    messageParams.headerMediaUrl = r.media_url.trim();
  }
  if (r.button_params && typeof r.button_params === 'object') {
    const buttonParams: Record<number, string> = {};
    for (const [k, v] of Object.entries(
      r.button_params as Record<string, unknown>
    )) {
      const index = Number(k);
      if (Number.isInteger(index) && index >= 0 && typeof v === 'string') {
        buttonParams[index] = v;
      }
    }
    if (Object.keys(buttonParams).length > 0) {
      messageParams.buttonParams = buttonParams;
    }
  }

  return {
    to: r.to,
    name: typeof r.name === 'string' ? r.name : undefined,
    params,
    messageParams:
      Object.keys(messageParams).length > 0 ? messageParams : undefined,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');
    const { id: campaignId } = await params;

    // ── Subscription check ────────────────────────────────────────
    // `/api/v1` is deliberately excluded from the proxy's navigational
    // subscription gate (it exists to redirect a BROWSER, and a redirect
    // is meaningless to a fetch caller) — see
    // src/lib/subscription/guard.ts and plan §6.5. Without an explicit
    // check here, a lapsed account would keep sending through the API
    // forever, which is not a quota (the product has none — decision
    // §14.1) but the same access control the dashboard already applies.
    const [subscriptionRow, gateConfig] = await Promise.all([
      getAccountSubscription(ctx.accountId),
      getGateConfig(),
    ]);
    const subscriptionState = resolveSubscriptionState(
      subscriptionRow,
      gateConfig
    );
    if (subscriptionState.isBlocked) {
      return fail(
        'subscription_inactive',
        'This workspace needs an active subscription to send through an API campaign.',
        403
      );
    }

    const body = (await request.json().catch(() => null)) as {
      idempotency_key?: unknown;
      recipients?: unknown;
      source?: unknown;
      param_labels?: unknown;
    } | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const idempotencyKey =
      typeof body.idempotency_key === 'string'
        ? body.idempotency_key.trim()
        : '';
    if (!idempotencyKey) {
      return fail(
        'bad_request',
        "'idempotency_key' is required — see docs/public-api.md for how to compute one",
        400
      );
    }
    if (idempotencyKey.length > MAX_KEY_LEN) {
      return fail(
        'bad_request',
        `'idempotency_key' must be ${MAX_KEY_LEN} characters or fewer`,
        400
      );
    }

    // ── Resolve + validate the campaign ───────────────────────────
    const { data: campaign, error: campaignError } = await ctx.supabase
      .from('api_campaigns')
      .select('id, name, template_name, template_language, status')
      .eq('id', campaignId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    // A malformed id can't be cast to uuid, so the query errors rather
    // than matching nothing. That's the same outcome as an unknown id —
    // and it must not read as a 500, or the caller retries a request
    // that can never succeed.
    if (isInvalidTextRepresentation(campaignError)) {
      return fail('not_found', 'Campaign not found', 404);
    }
    if (campaignError) {
      console.error(
        '[api/v1/campaigns/send] campaign lookup error:',
        campaignError
      );
      return fail('internal', 'Failed to read campaign', 500);
    }
    if (!campaign) return fail('not_found', 'Campaign not found', 404);
    if (campaign.status === 'paused') {
      return fail(
        'campaign_paused',
        `Campaign "${campaign.name}" is paused. Resume it in the dashboard before sending.`,
        403
      );
    }

    // ── Validate the payload BEFORE claiming the idempotency key ──
    // Claiming first and validating after would burn the key on a bad
    // request: `api_campaign_sends` has no way to "unclaim", so a typo'd
    // payload would insert the row with `broadcast_id` left null, and
    // every subsequent retry — even with a corrected body — would come
    // back `duplicate: true, broadcast_id: null` forever. The key must
    // only be spent once we are committed to actually creating a run.
    const recipientsRaw = Array.isArray(body.recipients) ? body.recipients : [];
    const recipients = recipientsRaw
      .map(toRecipientInput)
      .filter((r): r is BroadcastRecipientInput => r !== null);

    if (recipients.length === 0) {
      return fail(
        'bad_request',
        "'recipients' must be a non-empty array of { to, params?, media_url?, button_params? }",
        400
      );
    }

    const source =
      body.source && typeof body.source === 'object' ? body.source : null;

    // Labels for the positional `params`, e.g. the spreadsheet column
    // headers behind each template variable. Top-level rather than
    // per-recipient on purpose: they describe the CALLER'S MAPPING, which
    // is the same for every recipient in one call, and repeating them per
    // recipient would let one request carry two contradictory sets.
    //
    // Optional and non-fatal — a caller that omits them still sends
    // normally, the report just falls back to "Value 1..n".
    const paramLabels = Array.isArray(body.param_labels)
      ? body.param_labels.map((label) =>
          typeof label === 'string' ? label : ''
        )
      : null;

    // ── Claim the idempotency key ──────────────────────────────────
    // The insert IS the check: two concurrent requests with the same key
    // race on the UNIQUE constraint, and exactly one wins. Reading first
    // and deciding in application code would leave a window where both
    // requests observe "not claimed yet" and both proceed to send.
    const { error: claimError } = await ctx.supabase
      .from('api_campaign_sends')
      .insert({
        account_id: ctx.accountId,
        api_campaign_id: campaign.id,
        idempotency_key: idempotencyKey,
      });

    if (claimError) {
      if (claimError.code === '23505') {
        // Already claimed. Look up what it resolved to so the caller
        // gets something to poll rather than a bare "duplicate" — a
        // replay after a timeout must be answerable the same way the
        // original request would have been.
        const { data: existing } = await ctx.supabase
          .from('api_campaign_sends')
          .select('broadcast_id')
          .eq('api_campaign_id', campaign.id)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        return ok(
          {
            duplicate: true,
            broadcast_id: existing?.broadcast_id ?? null,
          },
          200
        );
      }
      console.error('[api/v1/campaigns/send] claim insert error:', claimError);
      return fail('internal', 'Failed to record this send', 500);
    }

    const auditUserId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    // Small enough to finish inside this route's budget, or hand it to
    // the sweep — see the module header for the arithmetic.
    const deliverInline = recipients.length <= INLINE_MAX_RECIPIENTS;

    let plan;
    try {
      plan = await createBroadcast(ctx.supabase, ctx.accountId, auditUserId, {
        name: source
          ? `${campaign.name} (${(source as { kind?: unknown }).kind ?? 'api'})`
          : campaign.name,
        templateName: campaign.template_name,
        templateLanguage: campaign.template_language,
        recipients,
        apiCampaignId: campaign.id,
        // Snapshotted so this run stays attributable if the campaign is
        // later deleted — see CreateBroadcastParams.apiCampaignName.
        apiCampaignName: campaign.name,
        variableLabels: paramLabels,
        sourceRef: source as Record<string, unknown> | null,
        mode: deliverInline ? 'deliver_now' : 'schedule',
      });
    } catch (createErr) {
      // The claim above is already committed, but nothing was actually
      // created — release it so a corrected retry (config fixed,
      // template re-synced, opt-outs resolved) can genuinely try again
      // instead of forever reading back `duplicate: true,
      // broadcast_id: null`, which the caller could never distinguish
      // from "already sent, nothing to see".
      await ctx.supabase
        .from('api_campaign_sends')
        .delete()
        .eq('api_campaign_id', campaign.id)
        .eq('idempotency_key', idempotencyKey);
      throw createErr;
    }

    // Attach this send to the claim we already hold, so a future replay
    // of the same key resolves to this exact broadcast rather than
    // "duplicate, id unknown".
    await ctx.supabase
      .from('api_campaign_sends')
      .update({ broadcast_id: plan.broadcastId })
      .eq('api_campaign_id', campaign.id)
      .eq('idempotency_key', idempotencyKey);

    // Read the mode back off the plan rather than the local flag:
    // `createBroadcast` is the authority on which mode it actually
    // persisted, and calling deliverBroadcast on a scheduled row would
    // send every recipient twice — once here and once from the sweep.
    // The plan carries the mode precisely so that mistake is impossible.
    if (plan.mode === 'deliver_now') {
      after(() => deliverBroadcast(ctx.supabase, plan));
    }

    return ok(
      {
        broadcast_id: plan.broadcastId,
        status: plan.mode === 'schedule' ? 'scheduled' : 'sending',
        total_recipients: plan.planned.length,
        accepted: plan.planned.length,
        rejected: plan.rejected,
        suppressed: plan.suppressed,
      },
      202
    );
  } catch (err) {
    if (err instanceof BroadcastError) {
      return fail(err.code, err.message, err.status);
    }
    if (err instanceof ContactError) {
      return fail(
        err.status === 400 ? 'bad_request' : 'internal',
        err.message,
        err.status
      );
    }
    return toApiErrorResponse(err);
  }
}
