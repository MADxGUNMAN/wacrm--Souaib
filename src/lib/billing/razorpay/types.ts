// ============================================================
// Razorpay entity shapes (only the fields this app reads) and the
// normalised snapshots handed to the billing_* SQL functions.
//
// Razorpay sends Unix SECONDS and integer MINOR units (paise). The
// snapshots carry ISO strings and minor units, converted once in
// mapping.ts, so SQL never has to guess a unit.
// ============================================================

export type RazorpayMode = 'test' | 'live';
export type BillingEnv = 'dev' | 'prod';

export type RazorpaySubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'expired';

/** Our row status: Razorpay's plus three local states. */
export type BillingSubscriptionStatus =
  RazorpaySubscriptionStatus | 'initiating' | 'failed_to_create' | 'superseded';

export type BillingIntent =
  'defer_to_trial_end' | 'defer_to_paid_end' | 'immediate';

export type RazorpayPeriod =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RazorpayPlan {
  id: string;
  entity: 'plan';
  period: RazorpayPeriod;
  interval: number;
  item: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    description?: string | null;
  };
  notes?: Record<string, string> | unknown[];
  created_at: number;
}

export interface RazorpaySubscription {
  id: string;
  entity: 'subscription';
  plan_id: string;
  customer_id: string | null;
  status: RazorpaySubscriptionStatus;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, string> | unknown[] | null;
  charge_at: number | null;
  start_at: number | null;
  end_at: number | null;
  auth_attempts: number | null;
  total_count: number | null;
  paid_count: number | null;
  customer_notify: boolean;
  created_at: number;
  expire_by: number | null;
  short_url: string | null;
  has_scheduled_changes: boolean | null;
  change_scheduled_at: number | null;
  remaining_count: number | null;
  payment_method?: string | null;
  source?: string | null;
}

export interface RazorpayInvoice {
  id: string;
  entity: 'invoice';
  subscription_id: string | null;
  payment_id: string | null;
  order_id: string | null;
  status:
    | 'draft'
    | 'issued'
    | 'partially_paid'
    | 'paid'
    | 'expired'
    | 'cancelled'
    | 'deleted';
  amount: number;
  amount_paid: number;
  amount_due: number;
  gross_amount?: number | null;
  tax_amount?: number | null;
  currency: string;
  billing_start: number | null;
  billing_end: number | null;
  issued_at: number | null;
  paid_at: number | null;
  expired_at: number | null;
  short_url: string | null;
  line_items?: Array<{
    name?: string | null;
    amount?: number | null;
    type?: string | null;
    quantity?: number | null;
  }>;
  created_at: number;
}

export interface RazorpayCard {
  id?: string;
  last4?: string | null;
  network?: string | null;
  type?: string | null;
  issuer?: string | null;
  international?: boolean | null;
}

export interface RazorpayPayment {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
  order_id: string | null;
  invoice_id: string | null;
  international: boolean | null;
  amount_refunded: number | null;
  refund_status: 'partial' | 'full' | null;
  captured: boolean;
  card?: RazorpayCard | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
  /** Razorpay sends `[]` when a payment has no notes. */
  notes?: Record<string, string> | unknown[] | null;
  description?: string | null;
  created_at: number;
}

export interface RazorpayRefund {
  id: string;
  entity: 'refund';
  amount: number;
  currency: string;
  payment_id: string;
  status: 'pending' | 'processed' | 'failed';
  speed_requested?: string | null;
  speed_processed?: string | null;
  created_at: number;
}

export interface RazorpayDispute {
  id: string;
  entity: 'dispute';
  payment_id: string;
  amount: number;
  currency: string;
  amount_deducted?: number | null;
  reason_code?: string | null;
  respond_by?: number | null;
  status: string;
  phase?: string | null;
  created_at: number;
}

/** The body Razorpay POSTs to the webhook (only the fields we read). */
export interface RazorpayWebhookEvent {
  entity: 'event';
  event: string;
  account_id?: string;
  contains?: string[];
  created_at?: number;
  payload: Partial<
    Record<
      'subscription' | 'payment' | 'invoice' | 'refund' | 'dispute' | 'order',
      { entity?: { id?: string; [key: string]: unknown } }
    >
  >;
}

export interface RazorpayCollection<T> {
  entity: 'collection';
  count: number;
  items: T[];
}

// ------------------------------------------------------------
// Snapshots for the SQL functions (see migration 20261021010000)
// ------------------------------------------------------------

export interface SubscriptionSnapshot {
  provider_subscription_id: string;
  status: RazorpaySubscriptionStatus;
  provider_plan_id: string;
  customer_id: string | null;
  payment_method: string | null;
  notes_account_id: string | null;
  notes_env: string | null;
  notes_checkout_id: string | null;
  start_at: string | null;
  current_start: string | null;
  current_end: string | null;
  charge_at: string | null;
  end_at: string | null;
  ended_at: string | null;
  expire_by: string | null;
  total_count: number | null;
  paid_count: number | null;
  remaining_count: number | null;
  auth_attempts: number | null;
  has_scheduled_changes: boolean | null;
  change_scheduled_at: string | null;
  short_url: string | null;
  fetched_at: string;
}

export interface PaymentSnapshot {
  provider_payment_id: string;
  provider_subscription_id: string;
  provider_order_id: string | null;
  status: RazorpayPayment['status'];
  amount_minor: number;
  currency: string;
  amount_refunded_minor: number;
  refund_status: 'partial' | 'full' | null;
  captured: boolean;
  method: string | null;
  international: boolean | null;
  card_network: string | null;
  card_type: string | null;
  card_last4: string | null;
  card_issuer: string | null;
  vpa_masked: string | null;
  bank: string | null;
  wallet: string | null;
  fee_minor: number | null;
  tax_minor: number | null;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  provider_created_at: string | null;
  captured_at: string | null;
  failed_at: string | null;
}

export interface InvoiceSnapshot {
  provider_invoice_id: string;
  provider_subscription_id: string | null;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  status: RazorpayInvoice['status'];
  amount_minor: number;
  amount_paid_minor: number;
  amount_due_minor: number;
  gross_amount_minor: number | null;
  tax_amount_minor: number | null;
  currency: string;
  billing_start: string | null;
  billing_end: string | null;
  issued_at: string | null;
  paid_at: string | null;
  expired_at: string | null;
  short_url: string | null;
  line_items: Array<{
    name: string | null;
    amount_minor: number | null;
    type: string | null;
    quantity: number | null;
  }>;
}

export interface RefundSnapshot {
  provider_refund_id: string;
  provider_payment_id: string;
  amount_minor: number;
  currency: string;
  status: RazorpayRefund['status'];
  speed_requested: string | null;
  speed_processed: string | null;
  provider_created_at: string | null;
}

export interface DisputeSnapshot {
  provider_dispute_id: string;
  provider_payment_id: string;
  amount_minor: number;
  currency: string;
  reason_code: string | null;
  phase: string | null;
  status: string;
  respond_by: string | null;
  provider_created_at: string | null;
}

/** A `billing_webhook_events` row. `payload` never leaves the server. */
export interface BillingWebhookEventRow {
  id: string;
  mode: RazorpayMode;
  provider_event_id: string;
  event_type: string;
  account_id: string | null;
  entity_ids: Record<string, string>;
  provider_created_at: string | null;
  received_at: string;
  payload: RazorpayWebhookEvent | null;
  status:
    'received' | 'processing' | 'processed' | 'ignored' | 'failed' | 'dead';
  attempts: number;
  next_attempt_at: string | null;
  locked_until: string | null;
  last_error: string | null;
  anomaly: string | null;
  processed_at: string | null;
  /** How often a super admin has put this event back in the queue. */
  requeue_count: number;
  requeued_at: string | null;
  requeued_by: string | null;
}

export type BillingNotificationKind =
  | 'mandate_authenticated'
  | 'payment_receipt'
  | 'payment_failed'
  | 'payment_retry_final'
  | 'action_required'
  | 'autopay_cancelled'
  | 'autopay_paused'
  | 'subscription_completed'
  | 'refund_processed';

/** A `billing_notifications` (email outbox) row. */
export interface BillingNotificationRow {
  id: string;
  account_id: string;
  kind: BillingNotificationKind;
  dedupe_key: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  data: Record<string, unknown>;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  mode: RazorpayMode | null;
  env: BillingEnv | null;
}

/** A `billing_subscriptions` row, as the server reads it. */
export interface BillingSubscriptionRow {
  id: string;
  account_id: string;
  mode: RazorpayMode;
  env: BillingEnv;
  checkout_id: string;
  provider_subscription_id: string | null;
  provider_plan_row: string | null;
  provider_plan_id: string;
  provider_customer_id: string | null;
  plan_id: string | null;
  cycle_id: string | null;
  plan_name: string;
  cycle_label: string;
  duration_days: number;
  amount_minor: number;
  currency: string;
  quantity: number;
  status: BillingSubscriptionStatus;
  status_changed_at: string;
  intent: BillingIntent;
  start_at: string | null;
  current_start: string | null;
  current_end: string | null;
  charge_at: string | null;
  end_at: string | null;
  ended_at: string | null;
  expire_by: string | null;
  total_count: number | null;
  paid_count: number | null;
  remaining_count: number | null;
  auth_attempts: number | null;
  has_scheduled_changes: boolean | null;
  change_scheduled_at: string | null;
  payment_method: 'card' | 'upi' | 'emandate' | 'nach' | 'unknown' | null;
  method_summary: Record<string, unknown> | null;
  short_url: string | null;
  cancel_requested_at: string | null;
  cancel_at_cycle_end: boolean;
  cancelled_by: 'customer' | 'admin' | 'provider' | 'system' | null;
  last_error: string | null;
  anomaly: string | null;
  created_by_user_id: string | null;
  last_synced_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A `billing_provider_plans` row. */
export interface BillingProviderPlanRow {
  id: string;
  provider: 'razorpay';
  mode: RazorpayMode;
  plan_id: string | null;
  cycle_id: string | null;
  plan_name: string;
  cycle_label: string;
  duration_days: number;
  amount_minor: number;
  currency: string;
  period: RazorpayPeriod;
  period_interval: number;
  provider_plan_id: string;
  is_current: boolean;
  /** Pricing region of the cycle ('global' or a country code). */
  region?: string;
  created_at: string;
}
