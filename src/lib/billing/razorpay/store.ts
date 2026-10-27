// ============================================================
// Phase 3 database access — SERVER ONLY (service role).
//
// The webhook event store, the email outbox, refund/dispute apply
// functions and reconciliation reads. Kept apart from db.ts (checkout
// and payment state) so each side can be faked on its own in tests.
//
// Claims go through SQL functions that use FOR UPDATE SKIP LOCKED
// (migration 20261022000000), so an after() callback, overlapping cron
// ticks and a second container never work on the same row at once.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { BillingDbError, type ApplyResult } from './db';
import type {
  BillingEnv,
  BillingNotificationRow,
  BillingWebhookEventRow,
  DisputeSnapshot,
  RazorpayMode,
  RazorpayWebhookEvent,
  RefundSnapshot,
} from './types';

export interface NewWebhookEvent {
  mode: RazorpayMode;
  provider_event_id: string;
  event_type: string;
  entity_ids: Record<string, string>;
  provider_created_at: string | null;
  payload: RazorpayWebhookEvent;
}

export type WebhookFinish =
  | {
      status: 'processed' | 'ignored';
      accountId?: string | null;
      note?: string | null;
      anomaly?: string | null;
    }
  | { status: 'failed'; error: string; nextAttemptAt: Date }
  | { status: 'dead'; error: string };

export type NotificationFinish =
  | { status: 'sent'; recipientEmail: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string; nextAttemptAt: Date };

export interface ReconcileCandidate {
  id: string;
  reason: 'orphan_check' | 'unauthorised' | 'charge_overdue' | 'sweep';
}

export interface BillingStore {
  /** Insert-or-ignore on (mode, provider_event_id). Null when it was a duplicate. */
  insertWebhookEvent(event: NewWebhookEvent): Promise<{ id: string } | null>;
  /** Due events, leased to the caller. With `id`, only that event (if due). */
  claimWebhookEvents(
    mode: RazorpayMode,
    limit: number,
    id?: string
  ): Promise<BillingWebhookEventRow[]>;
  finishWebhookEvent(id: string, result: WebhookFinish): Promise<void>;

  claimNotifications(
    mode: RazorpayMode,
    env: BillingEnv,
    limit: number,
    id?: string
  ): Promise<BillingNotificationRow[]>;
  finishNotification(id: string, result: NotificationFinish): Promise<void>;

  applyRefund(
    mode: RazorpayMode,
    refund: RefundSnapshot,
    source: string
  ): Promise<ApplyResult>;
  applyDispute(
    mode: RazorpayMode,
    dispute: DisputeSnapshot,
    source: string
  ): Promise<ApplyResult>;

  reconcileCandidates(
    mode: RazorpayMode,
    limit: number
  ): Promise<ReconcileCandidate[]>;
  /** Bookkeeping: an orphan search was done for this claim. */
  markOrphanChecked(id: string): Promise<void>;

  notifyAdmin(input: {
    type: 'billing_webhook_dead' | 'billing_anomaly';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    body: string;
    accountId?: string | null;
  }): Promise<void>;

  /** Owner's address and first name, resolved at send time. */
  getRecipient(
    userId: string
  ): Promise<{ email: string | null; name: string | null }>;

  /** `triggeredBy`: the super admin who started it by hand (null for cron). */
  startRun(
    mode: RazorpayMode,
    scope: string,
    triggeredBy?: string | null
  ): Promise<string | null>;
  finishRun(
    id: string,
    result: {
      status: 'succeeded' | 'failed';
      checked: number;
      changed: number;
      errors: string[];
    }
  ): Promise<void>;

  /** Retention (plan section 6.6). Returns rows touched. */
  purge(
    mode: RazorpayMode,
    now: Date
  ): Promise<{ payloads: number; notifications: number }>;
}

const DAY = 86_400_000;

async function rpc<T>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new BillingDbError(`${fn} failed: ${error.message}`);
  return data as T;
}

function clip(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function createBillingStore(
  admin: SupabaseClient = supabaseAdmin()
): BillingStore {
  return {
    insertWebhookEvent: async (event) => {
      const { data, error } = await admin
        .from('billing_webhook_events')
        .upsert(event, {
          onConflict: 'mode,provider_event_id',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error)
        throw new BillingDbError(
          `Could not store the webhook event: ${error.message}`
        );
      const rows = (data ?? []) as { id: string }[];
      return rows[0] ?? null;
    },

    claimWebhookEvents: (mode, limit, id) =>
      rpc<BillingWebhookEventRow[]>(admin, 'billing_claim_webhook_events', {
        p_mode: mode,
        p_limit: limit,
        p_id: id ?? null,
      }).then((rows) => rows ?? []),

    finishWebhookEvent: async (id, result) => {
      const patch: Record<string, unknown> = {
        status: result.status,
        locked_until: null,
      };
      if (result.status === 'dead') {
        patch.last_error = clip(result.error);
        patch.next_attempt_at = null;
      } else if (result.status === 'failed') {
        patch.last_error = clip(result.error);
        patch.next_attempt_at = result.nextAttemptAt.toISOString();
      } else {
        patch.processed_at = new Date().toISOString();
        patch.next_attempt_at = null;
        // For processed/ignored rows `last_error` holds the outcome note
        // (e.g. "not_ours"), which is what an operator wants to see.
        patch.last_error = result.note ? clip(result.note) : null;
        if (result.anomaly) patch.anomaly = clip(result.anomaly, 200);
        if (result.accountId) patch.account_id = result.accountId;
      }
      const { error } = await admin
        .from('billing_webhook_events')
        .update(patch)
        .eq('id', id);
      if (error)
        throw new BillingDbError(
          `Could not update the webhook event: ${error.message}`
        );
    },

    claimNotifications: (mode, env, limit, id) =>
      rpc<BillingNotificationRow[]>(admin, 'billing_claim_notifications', {
        p_mode: mode,
        p_env: env,
        p_limit: limit,
        p_id: id ?? null,
      }).then((rows) => rows ?? []),

    finishNotification: async (id, result) => {
      const patch: Record<string, unknown> = { status: result.status };
      if (result.status === 'sent') {
        patch.sent_at = new Date().toISOString();
        patch.recipient_email = result.recipientEmail;
        patch.last_error = null;
      } else if (result.status === 'skipped') {
        patch.last_error = clip(result.reason);
      } else {
        patch.last_error = clip(result.error);
        patch.next_attempt_at = result.nextAttemptAt.toISOString();
      }
      const { error } = await admin
        .from('billing_notifications')
        .update(patch)
        .eq('id', id);
      if (error)
        throw new BillingDbError(
          `Could not update the notification: ${error.message}`
        );
    },

    applyRefund: (mode, refund, source) =>
      rpc<ApplyResult>(admin, 'billing_apply_refund', {
        p_mode: mode,
        p: refund,
        p_source: source,
      }),

    applyDispute: (mode, dispute, source) =>
      rpc<ApplyResult>(admin, 'billing_apply_dispute', {
        p_mode: mode,
        p: dispute,
        p_source: source,
      }),

    reconcileCandidates: (mode, limit) =>
      rpc<ReconcileCandidate[]>(admin, 'billing_reconcile_candidates', {
        p_mode: mode,
        p_limit: limit,
      }).then((rows) => rows ?? []),

    markOrphanChecked: async (id) => {
      const { error } = await admin
        .from('billing_subscriptions')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', id)
        .is('provider_subscription_id', null);
      if (error)
        throw new BillingDbError(
          `Could not update the subscription: ${error.message}`
        );
    },

    notifyAdmin: async (input) => {
      // billing_notify_admin never throws; a failure here is logged only.
      const { error } = await admin.rpc('billing_notify_admin', {
        p_type: input.type,
        p_severity: input.severity,
        p_title: clip(input.title, 200),
        p_body: clip(input.body, 1000),
        p_account_id: input.accountId ?? null,
        p_link: null,
      });
      if (error)
        console.error('[billing] admin notification failed:', error.message);
    },

    getRecipient: async (userId) => {
      const { data, error } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('user_id', userId)
        .maybeSingle();
      if (error)
        throw new BillingDbError(
          `Could not read the recipient: ${error.message}`
        );
      const row = data as {
        email: string | null;
        full_name: string | null;
      } | null;
      return { email: row?.email ?? null, name: row?.full_name ?? null };
    },

    startRun: async (mode, scope, triggeredBy) => {
      const { data, error } = await admin
        .from('billing_reconciliation_runs')
        .insert({
          mode,
          scope,
          ...(triggeredBy ? { triggered_by: triggeredBy } : {}),
        })
        .select('id')
        .single();
      if (error) {
        console.error(
          '[billing] could not record the reconciliation run:',
          error.message
        );
        return null;
      }
      return (data as { id: string }).id;
    },

    finishRun: async (id, result) => {
      const { error } = await admin
        .from('billing_reconciliation_runs')
        .update({
          status: result.status,
          checked: result.checked,
          changed: result.changed,
          errors: result.errors.slice(0, 20).map((e) => clip(e, 300)),
          finished_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error)
        console.error(
          '[billing] could not finish the reconciliation run:',
          error.message
        );
    },

    purge: async (mode, now) => {
      // Webhook payloads can carry customer email/phone/VPA: 90 days.
      const payloadCutoff = new Date(now.getTime() - 90 * DAY).toISOString();
      const p = await admin
        .from('billing_webhook_events')
        .update({ payload: null })
        .eq('mode', mode)
        .lt('received_at', payloadCutoff)
        .not('payload', 'is', null)
        .select('id');
      if (p.error)
        throw new BillingDbError(`Payload purge failed: ${p.error.message}`);

      // Finished outbox rows: 1 year.
      const outboxCutoff = new Date(now.getTime() - 365 * DAY).toISOString();
      const n = await admin
        .from('billing_notifications')
        .delete()
        .eq('mode', mode)
        .in('status', ['sent', 'skipped', 'failed'])
        .lt('created_at', outboxCutoff)
        .select('id');
      if (n.error)
        throw new BillingDbError(`Outbox purge failed: ${n.error.message}`);

      return {
        payloads: p.data?.length ?? 0,
        notifications: n.data?.length ?? 0,
      };
    },
  };
}
