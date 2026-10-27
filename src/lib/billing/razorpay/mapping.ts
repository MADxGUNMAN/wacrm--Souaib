// ============================================================
// Razorpay entity -> normalised snapshot, plus the customer-facing
// wording rules. Pure: no I/O.
//
// Snapshots are what the billing_* SQL functions accept. Converting here,
// once, keeps unit handling out of SQL: timestamps become ISO strings,
// amounts stay integer minor units, and personal data is reduced to what
// billing needs (card network + last 4, masked VPA). Email and phone in
// Razorpay payloads are never copied.
// ============================================================

import type {
  BillingSubscriptionStatus,
  InvoiceSnapshot,
  PaymentSnapshot,
  RazorpayInvoice,
  RazorpayPayment,
  RazorpaySubscription,
  SubscriptionSnapshot,
} from './types';

/** Unix seconds -> ISO string. 0, null and garbage become null. */
export function unixToIso(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return null;
  return new Date(value * 1000).toISOString();
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Razorpay sends `notes` as an object, or `[]` when there are none. */
export function noteValue(notes: unknown, key: string): string | null {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null;
  const v = (notes as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** "abcdef@ybl" -> "ab****@ybl". Null when it is not a VPA. */
export function maskVpa(vpa: string | null | undefined): string | null {
  if (typeof vpa !== 'string') return null;
  const at = vpa.lastIndexOf('@');
  if (at <= 0 || at === vpa.length - 1) return null;
  const local = vpa.slice(0, at);
  const handle = vpa.slice(at + 1).toLowerCase();
  const keep = local.length > 2 ? 2 : 1;
  return `${local.slice(0, keep)}****@${handle}`;
}

function last4(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

export function toSubscriptionSnapshot(
  sub: RazorpaySubscription,
  fetchedAt: Date = new Date()
): SubscriptionSnapshot {
  return {
    provider_subscription_id: sub.id,
    status: sub.status,
    provider_plan_id: sub.plan_id,
    customer_id: str(sub.customer_id),
    payment_method: str(sub.payment_method),
    notes_account_id: noteValue(sub.notes, 'account_id'),
    notes_env: noteValue(sub.notes, 'env'),
    notes_checkout_id: noteValue(sub.notes, 'checkout_id'),
    start_at: unixToIso(sub.start_at),
    current_start: unixToIso(sub.current_start),
    current_end: unixToIso(sub.current_end),
    charge_at: unixToIso(sub.charge_at),
    end_at: unixToIso(sub.end_at),
    ended_at: unixToIso(sub.ended_at),
    expire_by: unixToIso(sub.expire_by),
    total_count: int(sub.total_count),
    paid_count: int(sub.paid_count),
    remaining_count: int(sub.remaining_count),
    auth_attempts: int(sub.auth_attempts),
    has_scheduled_changes:
      typeof sub.has_scheduled_changes === 'boolean'
        ? sub.has_scheduled_changes
        : null,
    change_scheduled_at: unixToIso(sub.change_scheduled_at),
    short_url: str(sub.short_url),
    fetched_at: fetchedAt.toISOString(),
  };
}

/**
 * `providerSubscriptionId` comes from context (the webhook's subscription
 * entity, the invoice, or our own row), because a Razorpay payment entity
 * does not name its subscription.
 */
export function toPaymentSnapshot(
  payment: RazorpayPayment,
  providerSubscriptionId: string
): PaymentSnapshot {
  const card = payment.card ?? null;
  return {
    provider_payment_id: payment.id,
    provider_subscription_id: providerSubscriptionId,
    provider_order_id: str(payment.order_id),
    status: payment.status,
    amount_minor: payment.amount,
    currency: payment.currency,
    amount_refunded_minor: int(payment.amount_refunded) ?? 0,
    refund_status:
      payment.refund_status === 'partial' || payment.refund_status === 'full'
        ? payment.refund_status
        : null,
    captured: payment.captured === true,
    method: str(payment.method),
    international:
      typeof payment.international === 'boolean' ? payment.international : null,
    card_network: str(card?.network),
    card_type: str(card?.type),
    card_last4: last4(card?.last4),
    card_issuer: str(card?.issuer),
    vpa_masked: maskVpa(payment.vpa),
    bank: str(payment.bank),
    wallet: str(payment.wallet),
    fee_minor: int(payment.fee),
    tax_minor: int(payment.tax),
    error_code: str(payment.error_code),
    error_description: str(payment.error_description),
    error_source: str(payment.error_source),
    error_step: str(payment.error_step),
    error_reason: str(payment.error_reason),
    provider_created_at: unixToIso(payment.created_at),
    // Razorpay does not report a capture or failure time on the payment
    // entity; the SQL function falls back to the processing time.
    captured_at: null,
    failed_at: null,
  };
}

export function toInvoiceSnapshot(invoice: RazorpayInvoice): InvoiceSnapshot {
  return {
    provider_invoice_id: invoice.id,
    provider_subscription_id: str(invoice.subscription_id),
    provider_payment_id: str(invoice.payment_id),
    provider_order_id: str(invoice.order_id),
    status: invoice.status,
    amount_minor: invoice.amount,
    amount_paid_minor: int(invoice.amount_paid) ?? 0,
    amount_due_minor: int(invoice.amount_due) ?? 0,
    gross_amount_minor: int(invoice.gross_amount),
    tax_amount_minor: int(invoice.tax_amount),
    currency: invoice.currency,
    billing_start: unixToIso(invoice.billing_start),
    billing_end: unixToIso(invoice.billing_end),
    issued_at: unixToIso(invoice.issued_at),
    paid_at: unixToIso(invoice.paid_at),
    expired_at: unixToIso(invoice.expired_at),
    short_url: str(invoice.short_url),
    // Name, amount, type, quantity only. Never customer details.
    line_items: (invoice.line_items ?? []).map((li) => ({
      name: str(li.name),
      amount_minor: int(li.amount),
      type: str(li.type),
      quantity: int(li.quantity),
    })),
  };
}

// ------------------------------------------------------------
// Customer-facing wording (plan section 3.5)
//
// "AutoPay authorised" is NEVER a payment. "Payment successful" is only
// shown for a captured, applied charge. Keep these in one place so the
// billing page, emails and super-admin views cannot disagree.
// ------------------------------------------------------------

export type AutopayDisplayKey =
  | 'hidden'
  | 'checkout_incomplete'
  | 'autopay_authorised'
  | 'payment_pending'
  | 'subscription_active'
  | 'cancel_scheduled'
  | 'payment_failed_retrying'
  | 'action_needed'
  | 'autopay_paused'
  | 'autopay_cancelled'
  | 'subscription_completed';

export interface AutopayDisplay {
  key: AutopayDisplayKey;
  label: string;
  /** May the customer currently be charged by this subscription? */
  willCharge: boolean;
}

const LABELS: Record<AutopayDisplayKey, string> = {
  hidden: '',
  checkout_incomplete: 'Checkout not completed',
  autopay_authorised: 'AutoPay authorised',
  payment_pending: 'Payment pending',
  subscription_active: 'Subscription active',
  cancel_scheduled: 'AutoPay ends at period end',
  payment_failed_retrying: 'Payment failed, retrying',
  action_needed: 'Payment failed, action needed',
  autopay_paused: 'AutoPay paused',
  autopay_cancelled: 'AutoPay cancelled',
  subscription_completed: 'Subscription completed',
};

export function autopayDisplayState(input: {
  status: BillingSubscriptionStatus;
  cancelAtCycleEnd: boolean;
  /** A captured charge already covers the current cycle. */
  currentCyclePaid: boolean;
}): AutopayDisplay {
  const make = (
    key: AutopayDisplayKey,
    willCharge: boolean
  ): AutopayDisplay => ({ key, label: LABELS[key], willCharge });
  switch (input.status) {
    case 'initiating':
    case 'created':
      return make('checkout_incomplete', false);
    case 'authenticated':
      return input.cancelAtCycleEnd
        ? make('cancel_scheduled', false)
        : make('autopay_authorised', true);
    case 'active':
      if (input.cancelAtCycleEnd) return make('cancel_scheduled', false);
      return input.currentCyclePaid
        ? make('subscription_active', true)
        : make('payment_pending', true);
    case 'pending':
      return make('payment_failed_retrying', true);
    case 'halted':
      return make('action_needed', false);
    case 'paused':
      return make('autopay_paused', false);
    case 'cancelled':
      return make('autopay_cancelled', false);
    case 'completed':
      return make('subscription_completed', false);
    case 'expired':
    case 'failed_to_create':
    case 'superseded':
    default:
      return make('hidden', false);
  }
}

/**
 * Plain-language reason for a failed payment. Never returns Razorpay's
 * raw text, which can mention internal steps; that stays in the audit
 * trail for operators.
 */
export function customerFailureMessage(
  code: string | null,
  reason: string | null
): string {
  const r = (reason ?? '').toLowerCase();
  if (/insufficient/.test(r))
    return 'Your bank declined the payment because of insufficient balance.';
  if (/expired/.test(r))
    return 'The card has expired. Please use another card.';
  if (/international_transaction_not_allowed|international/.test(r)) {
    return 'This card is issued outside India and cannot be used here. Please use an Indian card or UPI.';
  }
  if (/recurring|mandate_not_supported|not_supported/.test(r)) {
    return 'This card or bank does not support automatic payments. Please use another card or UPI.';
  }
  if (/otp|authentication/.test(r))
    return 'The payment could not be verified (OTP or authentication failed).';
  if (/cancel/.test(r)) return 'The payment was cancelled.';
  if (/timed_out|timeout/.test(r))
    return 'The payment timed out. Please try again.';
  if (/declined|do_not_honor|blocked|disabled/.test(r))
    return 'Your bank declined the payment. Please try another card or contact your bank.';
  if (
    /server_error|gateway|technical/.test(r) ||
    code === 'SERVER_ERROR' ||
    code === 'GATEWAY_ERROR'
  ) {
    return 'A temporary problem at the bank or payment gateway stopped this payment. Please try again.';
  }
  return 'The payment did not go through.';
}
