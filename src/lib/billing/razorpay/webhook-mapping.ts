// ============================================================
// Phase 3 mapping: refund and dispute snapshots, and the webhook
// envelope. Pure: no I/O. Same rules as mapping.ts: Unix seconds become
// ISO strings, amounts stay integer minor units, and nothing personal
// (email, phone, VPA) is copied out of a payload.
// ============================================================

import { unixToIso } from './mapping';
import type {
  DisputeSnapshot,
  RazorpayDispute,
  RazorpayRefund,
  RazorpayWebhookEvent,
  RefundSnapshot,
} from './types';

export function toRefundSnapshot(refund: RazorpayRefund): RefundSnapshot {
  return {
    provider_refund_id: refund.id,
    provider_payment_id: refund.payment_id,
    amount_minor: refund.amount,
    currency: (refund.currency ?? '').toUpperCase(),
    status: refund.status,
    speed_requested: refund.speed_requested ?? null,
    speed_processed: refund.speed_processed ?? null,
    provider_created_at: unixToIso(refund.created_at),
  };
}

export function toDisputeSnapshot(dispute: RazorpayDispute): DisputeSnapshot {
  return {
    provider_dispute_id: dispute.id,
    provider_payment_id: dispute.payment_id,
    amount_minor: dispute.amount,
    currency: (dispute.currency ?? '').toUpperCase(),
    reason_code: dispute.reason_code ?? null,
    phase: dispute.phase ?? null,
    status: (dispute.status ?? 'open').toLowerCase(),
    respond_by: unixToIso(dispute.respond_by ?? null),
    provider_created_at: unixToIso(dispute.created_at),
  };
}

export interface WebhookEntityIds {
  subscription?: string;
  payment?: string;
  invoice?: string;
  refund?: string;
  dispute?: string;
}

const ENTITY_ID: Record<keyof WebhookEntityIds, RegExp> = {
  subscription: /^sub_[A-Za-z0-9]{6,40}$/,
  payment: /^pay_[A-Za-z0-9]{6,40}$/,
  invoice: /^inv_[A-Za-z0-9]{6,40}$/,
  refund: /^rfnd_[A-Za-z0-9]{6,40}$/,
  dispute: /^disp_[A-Za-z0-9]{6,40}$/,
};

/**
 * The ids a webhook names, and nothing else. Values that do not look like
 * Razorpay ids are dropped, so a malformed body can never become a
 * lookup key. Processing refetches every entity by these ids.
 */
export function webhookEntityIds(
  event: RazorpayWebhookEvent
): WebhookEntityIds {
  const ids: WebhookEntityIds = {};
  for (const key of Object.keys(ENTITY_ID) as (keyof WebhookEntityIds)[]) {
    const id = event.payload?.[key]?.entity?.id;
    if (typeof id === 'string' && ENTITY_ID[key].test(id)) ids[key] = id;
  }
  // Refund and dispute payloads name their payment as a field.
  if (!ids.payment) {
    for (const key of ['refund', 'dispute'] as const) {
      const pid = event.payload?.[key]?.entity?.payment_id;
      if (typeof pid === 'string' && ENTITY_ID.payment.test(pid)) {
        ids.payment = pid;
        break;
      }
    }
  }
  // Invoices name their subscription and payment as fields.
  const invoice = event.payload?.invoice?.entity;
  if (invoice) {
    const sid = invoice.subscription_id;
    if (
      !ids.subscription &&
      typeof sid === 'string' &&
      ENTITY_ID.subscription.test(sid)
    ) {
      ids.subscription = sid;
    }
    const pid = invoice.payment_id;
    if (!ids.payment && typeof pid === 'string' && ENTITY_ID.payment.test(pid))
      ids.payment = pid;
  }
  return ids;
}

/** Parse and shape-check a VERIFIED webhook body. Null if it is not an event. */
export function parseWebhookEvent(raw: string): RazorpayWebhookEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const e = body as Record<string, unknown>;
  if (typeof e.event !== 'string' || !/^[a-z_.]{3,64}$/.test(e.event))
    return null;
  if (!e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload))
    return null;
  return body as RazorpayWebhookEvent;
}
