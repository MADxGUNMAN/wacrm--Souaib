// ============================================================
// Public-API broadcast core.
//
// Splits a broadcast into two phases so the HTTP route can persist +
// acknowledge fast and fan out afterwards (in `after()`):
//
//   createBroadcast()  — validate, resolve contacts, insert the
//                        `broadcasts` row + `broadcast_recipients`
//                        rows (status 'pending'), return a plan.
//   deliverBroadcast() — send each recipient's template via Meta
//                        (phone-variant retry), stamp each recipient
//                        row + the aggregate counts, finalize status.
//
// Recipient rows carry `whatsapp_message_id`, so the inbound webhook's
// status handler (which matches on that column) updates delivered/read
// for API broadcasts exactly as it does for dashboard ones.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { MetaApiError, sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import type { MessageTemplate } from '@/types';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import { persistBroadcastMessage } from '@/lib/whatsapp/broadcast-inbox';
import {
  filterOptedOutPhones,
  isMarketingCategory,
  recordOptOutFromSendError,
} from '@/lib/whatsapp/marketing-opt-out';

/** Thrown by createBroadcast on a caller-visible failure; route maps it. */
export class BroadcastError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BroadcastError';
    this.code = code;
    this.status = status;
  }
}

export interface BroadcastRecipientInput {
  /** E.164 phone. */
  to: string;
  /** Positional body params for the template ({{1}}, {{2}}…). */
  params?: string[];
  /**
   * Display name for a contact created by this send.
   *
   * Only used when the phone is new to the account — an existing contact
   * is never renamed by a broadcast, because a campaign is a poor
   * authority on a name someone may have corrected by hand in the CRM.
   *
   * Exists for spreadsheet-driven sends, where the operator maps a
   * "Contact Name" column alongside the phone column and would
   * otherwise end up with an address book full of bare numbers.
   */
  name?: string | null;
  /**
   * Structured send-time values for THIS recipient — media header,
   * carousel cards, offer expiry, named body params, button params.
   *
   * Previously reachable only by the scheduled path (read back from
   * `broadcast_recipients.send_params`). Accepting it here is what lets
   * an external caller send a template whose header is a per-row invoice
   * PDF, which positional `params` alone cannot express.
   */
  messageParams?: SendTimeParams;
}

/**
 * What to do with the broadcast once it is persisted.
 *
 * - `deliver_now` — leave it in 'sending' for the caller to fan out
 *   immediately, typically inside `after()`. Original behaviour, still
 *   the default so every existing call site is unaffected.
 *
 * - `schedule` — write it as 'scheduled', due now, and let the existing
 *   five-minute cron drain it.
 *
 * `schedule` exists because the immediate path runs inside a route with
 * `maxDuration = 60`, and a large audience can exceed that mid-fan-out —
 * leaving recipients 'pending' and the broadcast stuck 'sending' with no
 * one to finish it. Handing the work to the cron removes the ceiling
 * entirely and reuses a worker whose claim-based locking already makes
 * double-sending impossible. Cost is up to five minutes of latency,
 * which is irrelevant for a reminder or a drip.
 */
export type BroadcastDeliveryMode = 'deliver_now' | 'schedule';

export interface CreateBroadcastParams {
  name?: string | null;
  templateName: string;
  templateLanguage?: string | null;
  recipients: BroadcastRecipientInput[];
  /**
   * Marks this broadcast as one run of a reusable API campaign. The
   * campaign is the definition; each trigger fire is a broadcast.
   */
  apiCampaignId?: string | null;
  /**
   * The campaign's name, snapshotted onto the run.
   *
   * Denormalised on purpose. `api_campaign_id` is ON DELETE SET NULL, so
   * without this a deleted campaign leaves its runs with no way to say
   * what they were: the Type column flips to Broadcast, they drop out of
   * the "API campaign runs" filter, and they sit among dashboard sends
   * carrying a machine-made name. The snapshot is what makes the delete
   * confirmation's promise — "its send history is kept" — actually true.
   *
   * Never re-synced when the campaign is renamed: a run records what it
   * was sent as, exactly as `send_params` freezes what a recipient
   * received.
   */
  apiCampaignName?: string | null;
  /**
   * Human labels for the positional `recipients[].params`, index-aligned
   * with them: element i names `{{i+1}}`.
   *
   * For a Google Sheets run these are the spreadsheet column headers, so
   * the campaign report can say "Delevery id: 393392" instead of showing
   * a bare number nobody can interpret. Recorded on the run rather than
   * the campaign because two rules on two sheets can drive one campaign
   * with different columns mapped to the same variables.
   *
   * Undefined leaves the column NULL, which the UI renders as
   * "Value 1..n" — deliberately distinct from an empty array, which
   * means "this template genuinely takes no variables".
   */
  variableLabels?: string[] | null;
  /**
   * Where this run came from, verbatim as the caller reported it. Stored
   * so the runs table can identify a run by its sheet and row instead of
   * by a timestamp — every run of a campaign otherwise carries the same
   * name and is indistinguishable from the others.
   */
  sourceRef?: Record<string, unknown> | null;
  /** Defaults to `deliver_now` — see {@link BroadcastDeliveryMode}. */
  mode?: BroadcastDeliveryMode;
}

/**
 * Exported so the scheduled executor can assemble a plan from stored
 * rows and reuse {@link deliverBroadcast}, rather than growing a second
 * copy of the fan-out loop.
 */
export interface PlannedRecipient {
  recipientRowId: string;
  /** Carried so a 131050 opt-out can be attributed to the contact. */
  contactId: string;
  phone: string;
  params: string[];
  /**
   * Structured send-time values — media header, carousel cards, offer
   * deadline, named body params, commerce fields.
   *
   * Optional because the public API's `recipients[].params` shape only
   * carries positional body values. The SCHEDULED path does supply this,
   * read back from `broadcast_recipients.send_params`; without it a
   * scheduled carousel or limited-time-offer template would send with no
   * cards and no expiry, which Meta either rejects or delivers wrong.
   */
  messageParams?: SendTimeParams;
}

export interface BroadcastPlan {
  broadcastId: string;
  /** Needed by the delivery phase to record opt-outs account-scoped. */
  accountId: string;
  /**
   * Who owns this campaign. Carried into the delivery phase so each sent
   * message can be attributed in the Inbox thread, and so a conversation
   * created for a first-time recipient has an owner (`conversations.
   * user_id` is NOT NULL).
   */
  senderUserId: string;
  templateName: string;
  templateLanguage: string;
  phoneNumberId: string;
  accessToken: string;
  templateRow: MessageTemplate | null;
  planned: PlannedRecipient[];
  /**
   * How this broadcast was persisted.
   *
   * `schedule` means the row is already 'scheduled' and the cron owns
   * it — the caller must NOT call {@link deliverBroadcast}, or the same
   * recipients would be sent twice, once by the caller and once by the
   * sweep. Returned rather than assumed so that mistake is visible at
   * the call site.
   */
  mode: BroadcastDeliveryMode;
  /** Phones rejected up front (invalid E.164) — counted as failed. */
  rejected: number;
  /**
   * Recipients dropped because they opted out of marketing.
   *
   * These get NO `broadcast_recipients` row at all — suppression happens
   * before the insert, so an opt-out never appears as a recipient and
   * cannot skew the trigger-owned counts. Reported to the caller in the
   * POST response instead.
   */
  suppressed: number;
}

const MAX_RECIPIENTS = 1000;

/**
 * Validate + persist a broadcast, resolving each recipient to a
 * contact. Returns a plan for {@link deliverBroadcast}. Throws
 * {@link BroadcastError} on bad input / missing config / a malformed
 * template / a DB failure — nothing is sent in this phase.
 */
export async function createBroadcast(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  params: CreateBroadcastParams
): Promise<BroadcastPlan> {
  const { name, templateName, recipients, apiCampaignId } = params;
  const templateLanguage = params.templateLanguage || 'en_US';
  const mode: BroadcastDeliveryMode = params.mode ?? 'deliver_now';
  // Normalised here rather than at the call site so a caller passing a
  // ragged array (a missing label for one variable) still produces an
  // index-aligned row — a hole would shift every later label onto the
  // wrong value, which is worse than an unlabelled one.
  const variableLabels = Array.isArray(params.variableLabels)
    ? params.variableLabels.map((label) =>
        typeof label === 'string' ? label : ''
      )
    : null;

  if (!templateName) {
    throw new BroadcastError('bad_request', "'template_name' is required", 400);
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastError(
      'bad_request',
      "'recipients' must be a non-empty array of { to, params? }",
      400
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400
    );
  }

  // Config (fail fast + provides the audit trail owner already resolved
  // by the caller). Meta send needs phone_number_id + decrypted token.
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();
  if (configError || !config) {
    throw new BroadcastError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }
  const accessToken = decrypt(config.access_token);

  // Template row (once) for header/button components; guard a
  // malformed local row rather than N identical opaque failures.
  const { data: rawTemplateRow } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', templateName)
    .eq('language', templateLanguage)
    .maybeSingle();
  if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
      500
    );
  }
  const templateRow = (rawTemplateRow as MessageTemplate | null) ?? null;

  // Resolve each recipient to a contact. Invalid phones are dropped
  // (counted as rejected) rather than aborting the whole broadcast.
  const resolved: {
    contactId: string;
    phone: string;
    params: string[];
    messageParams?: SendTimeParams;
  }[] = [];
  let rejected = 0;
  for (const r of recipients) {
    const sanitized = sanitizePhoneForMeta(
      typeof r.to === 'string' ? r.to : ''
    );
    if (!isValidE164(sanitized)) {
      rejected++;
      continue;
    }
    const { id } = await findOrCreateContact(
      db,
      accountId,
      auditUserId,
      {
        phone: sanitized,
        // Only ever applied to a contact this send CREATES; an existing
        // contact is never renamed by a broadcast, because a campaign is a
        // poor authority on a name someone may have corrected by hand.
        name:
          typeof r.name === 'string' && r.name.trim()
            ? r.name.trim()
            : undefined,
      },
      // Nobody added this person deliberately — a send needed a number that
      // was not in the CRM yet. Covers both a dashboard broadcast with a CSV
      // audience and an externally triggered API campaign (the Google Sheets
      // add-on), which is right: in both cases the send is what created them.
      'campaign'
    );
    resolved.push({
      contactId: id,
      phone: sanitized,
      params: Array.isArray(r.params)
        ? r.params.filter((p): p is string => typeof p === 'string')
        : [],
      messageParams:
        r.messageParams && typeof r.messageParams === 'object'
          ? r.messageParams
          : undefined,
    });
  }

  // Collapse recipients that resolved to the SAME contact (the caller
  // listed a phone twice, or two numbers fuzzy-matched to one contact).
  // Keep the first occurrence so the contact is messaged once and its
  // params aren't silently overwritten by a later duplicate — and so
  // the row↔params pairing below (keyed by contact_id) is unambiguous.
  const seenContact = new Set<string>();
  const dedupedAll = resolved.filter((r) => {
    if (seenContact.has(r.contactId)) return false;
    seenContact.add(r.contactId);
    return true;
  });

  // ── Marketing opt-out suppression ──────────────────────────────
  // Applied BEFORE the recipient rows are inserted, so a suppressed
  // contact never becomes a `broadcast_recipients` row. That keeps the
  // trigger-owned counts honest without needing a 'skipped' row here.
  //
  // Only marketing is suppressed. isMarketingCategory fails closed when
  // templateRow is null (exists at Meta, never synced locally).
  const suppressedPhones = isMarketingCategory(templateRow?.category)
    ? (
        await filterOptedOutPhones(
          db,
          accountId,
          dedupedAll.map((r) => r.phone)
        )
      ).suppressed
    : new Set<string>();

  const deduped = dedupedAll.filter((r) => !suppressedPhones.has(r.phone));
  const suppressed = dedupedAll.length - deduped.length;

  if (deduped.length === 0 && suppressed > 0) {
    throw new BroadcastError(
      'all_recipients_opted_out',
      'Every recipient has opted out of marketing messages from this account',
      400
    );
  }

  if (deduped.length === 0) {
    throw new BroadcastError(
      'bad_request',
      'No recipients had a valid E.164 phone number',
      400
    );
  }

  // Persist the broadcast + its recipients. The count columns
  // (sent/delivered/read/replied/failed) are owned by the DB aggregate
  // trigger (migrations 003/005) and derived purely from
  // broadcast_recipients rows — we deliberately do NOT seed them here
  // (a manual value would be clobbered by the trigger on the first
  // recipient change). `rejected` phones have no recipient row, so they
  // are reported to the caller in the POST response, not in these
  // persisted counts.
  // 'scheduled' with a due time in the PAST rather than 'sending', so
  // the five-minute sweep picks it up on its next tick. `scheduled_at`
  // is mandatory in that state (constraint
  // `broadcasts_scheduled_needs_time`), and backdating it by nothing at
  // all is exactly right: due now, drain immediately.
  const scheduledAt = mode === 'schedule' ? new Date().toISOString() : null;

  const { data: broadcast, error: bErr } = await db
    .from('broadcasts')
    .insert({
      account_id: accountId,
      user_id: auditUserId,
      name: name || `API broadcast (${templateName})`,
      template_name: templateName,
      template_language: templateLanguage,
      status: mode === 'schedule' ? 'scheduled' : 'sending',
      scheduled_at: scheduledAt,
      api_campaign_id: apiCampaignId ?? null,
      api_campaign_name: params.apiCampaignName ?? null,
      variable_labels: variableLabels,
      source_ref: params.sourceRef ?? null,
      total_recipients: deduped.length,
    })
    .select('id')
    .single();
  if (bErr || !broadcast) {
    console.error('[broadcast-core] create broadcast error:', bErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  // `send_params` is written for BOTH modes even though only the
  // scheduled executor reads it back. It is the only durable record of
  // what each recipient was personalized with, so writing it always
  // means a broadcast interrupted mid-fan-out can be resumed, and a
  // support question about what someone actually received is answerable.
  const { data: recipientRows, error: rErr } = await db
    .from('broadcast_recipients')
    .insert(
      deduped.map((r) => ({
        broadcast_id: broadcast.id,
        contact_id: r.contactId,
        status: 'pending' as const,
        send_params: {
          params: r.params,
          ...(r.messageParams ? { messageParams: r.messageParams } : {}),
        },
      }))
    )
    .select('id, contact_id');
  if (rErr || !recipientRows) {
    console.error('[broadcast-core] create recipients error:', rErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  // Pair each inserted recipient row back to its phone/params by
  // contact_id — unambiguous now that duplicates are collapsed.
  const byContact = new Map(deduped.map((r) => [r.contactId, r]));
  const planned: PlannedRecipient[] = recipientRows.map((row) => {
    const r = byContact.get(row.contact_id as string)!;
    return {
      recipientRowId: row.id as string,
      contactId: r.contactId,
      phone: r.phone,
      params: r.params,
      messageParams: r.messageParams,
    };
  });

  return {
    broadcastId: broadcast.id,
    accountId,
    senderUserId: auditUserId,
    templateName,
    templateLanguage,
    phoneNumberId: config.phone_number_id,
    accessToken,
    templateRow,
    planned,
    mode,
    rejected,
    suppressed,
  };
}

/**
 * Fan out a {@link BroadcastPlan}: send each recipient's template
 * (phone-variant retry) and stamp its `broadcast_recipients` row.
 * Best-effort per recipient — one failure never aborts the rest.
 * Designed to run inside `after()`.
 *
 * The per-status count columns on `broadcasts` are owned by the DB
 * aggregate trigger (migrations 003/005): each recipient-row update
 * below advances them automatically, and later Meta delivery/read
 * webhooks keep advancing them. We therefore never write those columns
 * here — only the terminal `status` — otherwise a manual value would
 * race and clobber the trigger-maintained counts.
 */
export async function deliverBroadcast(
  db: SupabaseClient,
  plan: BroadcastPlan
): Promise<void> {
  // A scheduled plan is owned by the cron sweep. Fanning it out here as
  // well would send every recipient twice — once now, once when the
  // sweep claims the row — and a duplicate marketing message costs real
  // money per recipient. Refusing loudly beats trusting call sites to
  // remember, because the symptom (double billing) shows up long after
  // the mistake.
  if (plan.mode === 'schedule') {
    throw new Error(
      `deliverBroadcast called on a scheduled broadcast (${plan.broadcastId}). ` +
        'The five-minute cron owns this row; delivering here would send twice.'
    );
  }

  let sentCount = 0;

  for (const recipient of plan.planned) {
    const variants = phoneVariants(recipient.phone);
    let sentMessageId: string | null = null;
    let lastError: string | null = null;
    // The error OBJECT too: MetaApiError carries the numeric code, which
    // is what identifies a 131050 (opted out at Meta) among failures.
    let lastErrorObject: unknown = null;

    for (const variant of variants) {
      try {
        const result = await sendTemplateMessage({
          phoneNumberId: plan.phoneNumberId,
          accessToken: plan.accessToken,
          to: variant,
          templateName: plan.templateName,
          language: plan.templateLanguage,
          template: plan.templateRow ?? undefined,
          params: recipient.params,
          messageParams: recipient.messageParams,
        });
        sentMessageId = result.messageId;
        lastError = null;
        break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        lastError = message;
        lastErrorObject = error;
        // Only a "recipient not allowed" error is worth another variant.
        if (!isRecipientNotAllowedError(message)) break;
      }
    }

    if (sentMessageId) {
      sentCount++;
      await db
        .from('broadcast_recipients')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: sentMessageId,
          error_message: null,
        })
        .eq('id', recipient.recipientRowId);

      // Put the message in the Inbox thread as well as the campaign
      // report. Without this the customer receives a message, replies, and
      // the agent opening that thread sees the reply with nothing above
      // it — the outbound half of the conversation missing entirely.
      //
      // Best-effort by contract (see broadcast-inbox.ts): Meta has already
      // delivered, so a storage failure must not be reported as a send
      // failure. A recipient with no contact id (deleted mid-send) is
      // skipped rather than guessed at.
      if (recipient.contactId) {
        await persistBroadcastMessage(db, {
          accountId: plan.accountId,
          contactId: recipient.contactId,
          broadcastId: plan.broadcastId,
          templateName: plan.templateName,
          waMessageId: sentMessageId,
          templateBody: plan.templateRow?.body_text ?? null,
          params: recipient.params,
          senderUserId: plan.senderUserId,
        });
      }
    } else {
      // 131050 = the customer opted out at Meta's level. Record it so the
      // next broadcast suppresses them up front instead of spending
      // another send discovering the same thing.
      await recordOptOutFromSendError(db, {
        accountId: plan.accountId,
        phone: recipient.phone,
        contactId: recipient.contactId,
        error: lastErrorObject ?? lastError,
      });
      // Store the STRUCTURED reason, not just a sentence. Meta reuses the
      // same generic wording across unrelated codes, so the code is what
      // actually identifies the failure — and `source` distinguishes this
      // send-time rejection from a later delivery failure reported by the
      // status webhook. The two have different causes and different fixes.
      const metaError =
        lastErrorObject instanceof MetaApiError ? lastErrorObject : null;
      await db
        .from('broadcast_recipients')
        .update({
          status: 'failed',
          error_message: lastError || 'Unknown error',
          error_code:
            metaError?.code != null ? String(metaError.code) : 'send_failed',
          error_details: {
            code: metaError?.code ?? null,
            title: metaError?.userTitle ?? null,
            raw_message: lastError ?? null,
            details: metaError?.details ?? null,
            user_message: metaError?.userMessage ?? null,
            fbtrace_id: metaError?.fbtraceId ?? null,
            source: 'send_time',
          },
        })
        .eq('id', recipient.recipientRowId);
    }
  }

  // Terminal status only — counts are trigger-owned (see the note
  // above). If nothing sent, the broadcast failed outright; a partial
  // send is still 'sent' (per-recipient failures show in failed_count).
  await db
    .from('broadcasts')
    .update({
      status: sentCount > 0 ? 'sent' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.broadcastId);
}
