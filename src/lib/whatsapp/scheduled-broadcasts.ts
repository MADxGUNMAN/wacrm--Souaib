// ============================================================
// Scheduled broadcast execution.
//
// The wizard books a campaign by writing `broadcasts.status =
// 'scheduled'` with a `scheduled_at`, having already resolved the
// audience into `broadcast_recipients` rows carrying per-recipient
// `send_params`. This module is what actually sends them, driven by
// GET /api/broadcasts/cron every five minutes.
//
// ─── The one hard problem: not sending twice ──────────────────────
//
// The sweep runs on a timer, and a run that takes longer than the timer
// interval overlaps the next one. Two overlapping runs reading "which
// broadcasts are due?" both get the same row, and a marketing broadcast
// delivered twice is not a cosmetic bug — it costs real money per
// message and burns the account's quality rating with recipients who
// received the same promotion twice.
//
// So the claim is a CONDITIONAL UPDATE, not a read-then-write:
//
//   UPDATE broadcasts SET status='sending'
//    WHERE id = ? AND status='scheduled'
//   RETURNING id
//
// Postgres serialises the two updates; exactly one sees
// `status='scheduled'` and gets a row back. The loser gets zero rows and
// skips. The state transition IS the lock, which is the same reasoning
// the usage-alert cron documents for its claim-insert, and the same
// reason `record_webhook_failure` lives in SQL.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import type { MessageTemplate } from '@/types';
import {
  deliverBroadcast,
  type BroadcastPlan,
  type PlannedRecipient,
} from '@/lib/whatsapp/broadcast-core';

/**
 * Ceiling per tick, so one run cannot become unbounded work. Matches the
 * MAX_ALERTS_PER_RUN convention in the usage-alert cron. Anything not
 * picked up this tick is picked up five minutes later — being slightly
 * late is fine, running for an hour is not.
 */
export const MAX_SCHEDULED_PER_RUN = 20;

export interface DueBroadcastRow {
  id: string;
  account_id: string;
  /**
   * Who scheduled the campaign. Needed so each delivered message is
   * attributed in the Inbox thread, and so a conversation created for a
   * first-time recipient has an owner.
   */
  user_id: string;
  template_name: string;
  template_language: string | null;
  status: string;
  scheduled_at: string | null;
}

export interface StoredSendParams {
  params: string[];
  messageParams?: SendTimeParams;
}

/**
 * Read `broadcast_recipients.send_params` back into the shape the send
 * builder expects.
 *
 * Defensive on purpose: this is JSONB written by an older version of the
 * app in the general case, so a missing or malformed value must degrade
 * to "send with no parameters" rather than throwing and stranding the
 * whole broadcast in 'sending' forever.
 */
export function parseStoredSendParams(value: unknown): StoredSendParams {
  if (!value || typeof value !== 'object') return { params: [] };
  const raw = value as { params?: unknown; messageParams?: unknown };

  const params = Array.isArray(raw.params)
    ? raw.params.filter((p): p is string => typeof p === 'string')
    : [];

  const messageParams =
    raw.messageParams && typeof raw.messageParams === 'object'
      ? (raw.messageParams as SendTimeParams)
      : undefined;

  return { params, messageParams };
}

/** Outcome of trying to take ownership of one due broadcast. */
export type ClaimOutcome = 'claimed' | 'already_taken';

/**
 * Take exclusive ownership of a scheduled broadcast.
 *
 * The `.eq('status', 'scheduled')` in the WHERE clause is the entire
 * concurrency guarantee — see the module header. Returning
 * 'already_taken' rather than throwing keeps a lost race a normal,
 * silent outcome instead of an error in the logs every five minutes.
 */
export async function claimScheduledBroadcast(
  db: SupabaseClient,
  broadcastId: string
): Promise<ClaimOutcome> {
  const { data, error } = await db
    .from('broadcasts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', broadcastId)
    .eq('status', 'scheduled')
    .select('id');

  if (error) {
    throw new Error(
      `Failed to claim broadcast ${broadcastId}: ${error.message}`
    );
  }
  return data && data.length > 0 ? 'claimed' : 'already_taken';
}

export interface ExecuteResult {
  broadcastId: string;
  outcome: 'sent' | 'skipped' | 'failed';
  recipients: number;
  reason?: string;
}

/**
 * Send one already-claimed scheduled broadcast.
 *
 * Assumes {@link claimScheduledBroadcast} returned 'claimed' — the row is
 * therefore in 'sending' and owned by this caller.
 *
 * Any failure before the fan-out marks the broadcast 'failed' rather
 * than leaving it in 'sending': a row stuck in 'sending' is invisible to
 * both the sweep (which only looks for 'scheduled') and the operator
 * (who sees a spinner that never resolves), so it would never send and
 * never report why.
 */
export async function executeScheduledBroadcast(
  db: SupabaseClient,
  row: DueBroadcastRow
): Promise<ExecuteResult> {
  const fail = async (reason: string): Promise<ExecuteResult> => {
    await db
      .from('broadcasts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { broadcastId: row.id, outcome: 'failed', recipients: 0, reason };
  };

  // ── WhatsApp config for THIS account ──────────────────────────
  // The sweep spans every account, so config is loaded per broadcast
  // rather than once — two accounts have different phone numbers and
  // different tokens, and sending account A's campaign from account B's
  // number would be a cross-tenant leak, not merely a bug.
  const { data: config } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', row.account_id)
    .maybeSingle();

  if (!config?.phone_number_id || !config.access_token) {
    return fail('WhatsApp is no longer configured for this workspace');
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return fail('Stored WhatsApp credentials could not be read');
  }

  const templateLanguage = row.template_language || 'en_US';

  // The template row drives header/button assembly. A template deleted
  // or unsynced between scheduling and sending is a real possibility
  // over a 90-day window, so a missing row is tolerated (Meta still has
  // it) while a malformed one is not.
  const { data: rawTemplateRow } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', row.account_id)
    .eq('name', row.template_name)
    .eq('language', templateLanguage)
    .maybeSingle();

  if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
    return fail(
      'The template is malformed locally — re-sync templates from Meta'
    );
  }
  const templateRow = (rawTemplateRow as MessageTemplate | null) ?? null;

  // ── Recipients, with their frozen personalization ─────────────
  // Only 'pending' rows: if a previous run half-completed before dying,
  // the ones it already sent must not be sent again.
  const { data: recipientRows, error: recipientError } = await db
    .from('broadcast_recipients')
    .select('id, contact_id, send_params, contact:contacts(phone)')
    .eq('broadcast_id', row.id)
    .eq('status', 'pending');

  if (recipientError) {
    return fail(`Could not read recipients: ${recipientError.message}`);
  }

  const planned: PlannedRecipient[] = [];
  for (const r of recipientRows ?? []) {
    // Supabase types an embedded to-one join as an array or an object
    // depending on inference; normalise before reading.
    const joined = (r as { contact?: unknown }).contact;
    const contact = Array.isArray(joined) ? joined[0] : joined;
    const phone = (contact as { phone?: string } | undefined)?.phone;

    // A contact deleted between scheduling and sending leaves a row with
    // no phone. Mark it failed with a real reason instead of silently
    // dropping it, so the campaign's numbers still add up.
    if (!phone) {
      await db
        .from('broadcast_recipients')
        .update({
          status: 'failed',
          error_message: 'Contact was removed before this broadcast sent',
        })
        .eq('id', r.id as string);
      continue;
    }

    const stored = parseStoredSendParams(
      (r as { send_params?: unknown }).send_params
    );
    planned.push({
      recipientRowId: r.id as string,
      contactId: (r.contact_id as string | null) ?? '',
      phone,
      params: stored.params,
      messageParams: stored.messageParams,
    });
  }

  if (planned.length === 0) {
    // Nothing left to send. 'sent' rather than 'failed': the recipients
    // were all either already delivered by an earlier partial run or
    // legitimately removed, neither of which is a send failure.
    await db
      .from('broadcasts')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { broadcastId: row.id, outcome: 'skipped', recipients: 0 };
  }

  const plan: BroadcastPlan = {
    broadcastId: row.id,
    accountId: row.account_id,
    senderUserId: row.user_id,
    templateName: row.template_name,
    templateLanguage,
    phoneNumberId: config.phone_number_id,
    accessToken,
    templateRow,
    planned,
    // 'deliver_now' even though this broadcast WAS scheduled — and that
    // is not a contradiction. `mode` says who is responsible for sending,
    // not how the row was created. By this point the claim has already
    // flipped the row 'scheduled' → 'sending', so this executor owns it
    // and is the one that must deliver. The 'schedule' value means "hand
    // it to the sweep and do not send", which would be a deadlock here.
    mode: 'deliver_now',
    rejected: 0,
    suppressed: 0,
  };

  // Reuses the public API's fan-out verbatim: phone-variant retry,
  // per-recipient row stamping, 131050 opt-out recording, and the
  // terminal status write. Counts stay trigger-owned.
  await deliverBroadcast(db, plan);

  return {
    broadcastId: row.id,
    outcome: 'sent',
    recipients: planned.length,
  };
}
