// ============================================================
// Webhook event processing (plan sections 3.6, 3.8 and 5).
//
// A stored event is only a hint about WHICH objects changed. Every
// handler refetches those objects from api.razorpay.com with our key and
// hands the fresh state to the same SQL apply functions the verify route
// and reconciliation use. That is what makes processing:
//   - order-independent (the latest Razorpay state always wins, and the
//     SQL ignores snapshots older than what it already has)
//   - replay-safe (unique provider ids, greatest() on access, dedupe keys
//     on emails)
//   - immune to a forged or stale payload (we never act on its contents)
//
// Unknown event types, objects that are not ours, and objects created by
// the other environment are recorded as `ignored`, not errors.
// ============================================================

import { RazorpayApiError, type RazorpayClient } from './client';
import type { BillingDeps, RazorpayClientLike } from './service';
import {
  noteValue,
  toInvoiceSnapshot,
  toPaymentSnapshot,
  toSubscriptionSnapshot,
} from './mapping';
import { ensurePaymentNotesSafely } from './payment-notes';
import type { BillingStore } from './store';
import type { BillingWebhookEventRow, RazorpayInvoice } from './types';
import { toDisputeSnapshot, toRefundSnapshot } from './webhook-mapping';

export type EventClient = RazorpayClientLike &
  Pick<RazorpayClient, 'listSubscriptions' | 'fetchRefund' | 'fetchDispute'>;

export interface EventDeps extends BillingDeps {
  client: EventClient;
  store: BillingStore;
}

export interface EventResult {
  status: 'processed' | 'ignored';
  accountId?: string | null;
  note?: string | null;
  anomaly?: string | null;
}

/** Retry schedule for a failed event: 1 m, 5 m, 15 m, 1 h, 4 h, 12 h. */
export const WEBHOOK_BACKOFF_MS = [
  60_000, 300_000, 900_000, 3_600_000, 14_400_000, 43_200_000,
];
/** After this many attempts an event is `dead` and an operator is told. */
export const WEBHOOK_MAX_ATTEMPTS = 6;

const SOURCE = 'razorpay_webhook';

const ignored = (note: string): EventResult => ({ status: 'ignored', note });

function fromApply(
  res: { outcome: string; [k: string]: unknown },
  fallbackAccount?: string | null
): EventResult {
  const accountId =
    typeof res.account_id === 'string'
      ? res.account_id
      : (fallbackAccount ?? null);
  switch (res.outcome) {
    case 'unknown_subscription':
    case 'unknown_payment':
      return ignored('not_ours');
    case 'anomaly':
      return {
        status: 'processed',
        accountId,
        anomaly: String(res.anomaly ?? 'anomaly'),
      };
    default:
      return { status: 'processed', accountId, note: res.outcome };
  }
}

function isGone(err: unknown): boolean {
  return err instanceof RazorpayApiError && err.isNotFound;
}

/** Refetch a subscription and apply it, unless it belongs to the other environment. */
async function applySubscription(
  deps: EventDeps,
  providerSubscriptionId: string,
  source: string
): Promise<EventResult> {
  let sub;
  try {
    sub = await deps.client.fetchSubscription(providerSubscriptionId);
  } catch (err) {
    if (isGone(err)) return ignored('not_found_at_razorpay');
    throw err;
  }
  const env = noteValue(sub.notes, 'env');
  if (env && env !== deps.config.env) return ignored('other_env');
  const now = deps.now?.() ?? new Date();
  return fromApply(
    await deps.db.applySubscriptionSnapshot(
      deps.config.mode,
      toSubscriptionSnapshot(sub, now),
      source
    )
  );
}

/**
 * Refetch a payment (and its invoice) and apply it. An authorisation
 * payment carries no invoice, order or notes (checked against real
 * Phase 0 payments), so without a known subscription it cannot be tied
 * to one and is ignored here; the verify route records those.
 */
async function applyPayment(
  deps: EventDeps,
  providerPaymentId: string,
  source: string,
  knownSubscriptionId?: string
): Promise<EventResult> {
  let payment;
  try {
    payment = await deps.client.fetchPayment(providerPaymentId);
  } catch (err) {
    if (isGone(err)) return ignored('not_found_at_razorpay');
    throw err;
  }
  let invoice: RazorpayInvoice | null = null;
  if (payment.invoice_id)
    invoice = await deps.client.fetchInvoice(payment.invoice_id);
  const subscriptionId =
    knownSubscriptionId ?? invoice?.subscription_id ?? null;
  if (!subscriptionId) return ignored('no_subscription_link');
  const res = await deps.db.applyPayment(
    deps.config.mode,
    toPaymentSnapshot(payment, subscriptionId),
    invoice ? toInvoiceSnapshot(invoice) : null,
    source
  );
  // Best effort, after the payment is applied; never throws, so a notes
  // failure cannot fail (and re-run) the webhook event.
  await ensurePaymentNotesSafely(deps, payment);
  return fromApply(res);
}

/** Combine two results: an anomaly or a processed step wins over ignored. */
function merge(a: EventResult, b: EventResult): EventResult {
  if (a.status === 'ignored') return b.status === 'ignored' ? a : b;
  return {
    status: 'processed',
    accountId: a.accountId ?? b.accountId ?? null,
    anomaly: a.anomaly ?? b.anomaly ?? null,
    note:
      [a.note, b.status === 'processed' ? b.note : null]
        .filter(Boolean)
        .join(', ') || null,
  };
}

export async function processWebhookEvent(
  deps: EventDeps,
  row: Pick<BillingWebhookEventRow, 'event_type' | 'entity_ids'>,
  source: string = SOURCE
): Promise<EventResult> {
  const type = row.event_type;
  const ids = row.entity_ids ?? {};

  if (type.startsWith('subscription.')) {
    if (!ids.subscription) return ignored('missing_subscription_id');
    let result = await applySubscription(deps, ids.subscription, source);
    if (result.status === 'ignored') return result;
    // subscription.charged (and some others) name the payment too.
    if (ids.payment)
      result = merge(
        result,
        await applyPayment(deps, ids.payment, source, ids.subscription)
      );
    return result;
  }

  if (type.startsWith('invoice.')) {
    if (ids.payment)
      return applyPayment(deps, ids.payment, source, ids.subscription);
    if (ids.subscription)
      return applySubscription(deps, ids.subscription, source);
    return ignored('missing_ids');
  }

  if (
    type === 'payment.authorized' ||
    type === 'payment.captured' ||
    type === 'payment.failed'
  ) {
    if (!ids.payment) return ignored('missing_payment_id');
    return applyPayment(deps, ids.payment, source);
  }

  if (type.startsWith('refund.')) {
    if (!ids.refund) return ignored('missing_refund_id');
    let refund;
    try {
      refund = await deps.client.fetchRefund(ids.refund);
    } catch (err) {
      if (isGone(err)) return ignored('not_found_at_razorpay');
      throw err;
    }
    // Bring the parent payment up to date first (refunded amount, status).
    const pay = await applyPayment(deps, refund.payment_id, source);
    const res = await deps.store.applyRefund(
      deps.config.mode,
      toRefundSnapshot(refund),
      source
    );
    return merge(pay, fromApply(res, pay.accountId));
  }

  if (type.startsWith('payment.dispute.')) {
    if (!ids.dispute) return ignored('missing_dispute_id');
    let dispute;
    try {
      dispute = await deps.client.fetchDispute(ids.dispute);
    } catch (err) {
      if (isGone(err)) return ignored('not_found_at_razorpay');
      throw err;
    }
    const pay = await applyPayment(deps, dispute.payment_id, source);
    const res = await deps.store.applyDispute(
      deps.config.mode,
      toDisputeSnapshot(dispute),
      source
    );
    let result = merge(pay, fromApply(res, pay.accountId));

    // D4: a lost chargeback also stops AutoPay, so the card is not
    // charged again for a service the bank has already reversed.
    const psub =
      typeof res.provider_subscription_id === 'string'
        ? res.provider_subscription_id
        : null;
    if (res.lost === true && psub) {
      try {
        await deps.client.cancelSubscription(psub, false);
      } catch (err) {
        if (!(
          err instanceof RazorpayApiError &&
          (err.isAlreadyInState || err.isNotFound)
        ))
          throw err;
      }
      result = merge(result, await applySubscription(deps, psub, source));
    }
    return result;
  }

  return ignored('unhandled_event');
}

export interface ProcessSummary {
  claimed: number;
  processed: number;
  ignored: number;
  failed: number;
  dead: number;
}

function message(err: unknown): string {
  if (err instanceof RazorpayApiError)
    return `Razorpay ${err.status} ${err.code ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

/**
 * Claim due events (one by id from the webhook's after(), or a batch
 * from cron), process each, and record the outcome. Never throws for a
 * single bad event: it is retried with backoff, then parked as dead.
 */
export async function processDueWebhookEvents(
  deps: EventDeps,
  opts: { limit: number; id?: string }
): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    claimed: 0,
    processed: 0,
    ignored: 0,
    failed: 0,
    dead: 0,
  };
  const rows = await deps.store.claimWebhookEvents(
    deps.config.mode,
    opts.limit,
    opts.id
  );
  summary.claimed = rows.length;

  for (const row of rows) {
    try {
      const result = await processWebhookEvent(deps, row);
      await deps.store.finishWebhookEvent(row.id, result);
      summary[result.status] += 1;
    } catch (err) {
      const error = message(err);
      // `attempts` was incremented by the claim.
      if (row.attempts >= WEBHOOK_MAX_ATTEMPTS) {
        await deps.store.finishWebhookEvent(row.id, { status: 'dead', error });
        await deps.store.notifyAdmin({
          type: 'billing_webhook_dead',
          severity: 'critical',
          title: `${deps.config.mode === 'test' ? '[Test] ' : ''}Razorpay webhook could not be processed`,
          body: `${row.event_type} (${row.provider_event_id}) failed ${row.attempts} times: ${error}`,
          accountId: row.account_id,
        });
        summary.dead += 1;
      } else {
        const now = deps.now?.() ?? new Date();
        const wait =
          WEBHOOK_BACKOFF_MS[
            Math.min(row.attempts, WEBHOOK_BACKOFF_MS.length) - 1
          ] ?? WEBHOOK_BACKOFF_MS[0];
        await deps.store.finishWebhookEvent(row.id, {
          status: 'failed',
          error,
          nextAttemptAt: new Date(now.getTime() + wait),
        });
        summary.failed += 1;
      }
      console.error(
        `[razorpay] webhook ${row.event_type} ${row.provider_event_id} failed (attempt ${row.attempts}): ${error}`
      );
    }
  }
  return summary;
}
