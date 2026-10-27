// ============================================================
// Super-admin billing reads and admin-only writes — SERVER ONLY
// (service role).
//
// Lists cover BOTH modes from the shared database; every row carries
// `mode` so the UI can mark test rows. Writes go through the
// SECURITY DEFINER functions from migration 20261024000000.
//
// `billing_webhook_events.payload` can contain customer email, phone and
// VPA. Nothing here selects it, or `*`, from that table: the column
// lists below are explicit on purpose.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchAllRows } from '../fetch-all';
import {
  escapeIlike,
  providerIdKind,
  toListResponse,
  type ListParams,
  type ListResponse,
  type ListSpec,
} from './admin-query';
import {
  BILLING_SUBSCRIPTION_STATUSES,
  LIVE_AUTOPAY_STATUSES,
  PAYMENT_METHODS,
} from './admin-status';
import { BillingDbError, loadFirstAppliedChargeAt } from './db';
import { chargeTypeFor, type ChargeType } from './payment-details';
import type { RazorpayMode } from './types';

// ------------------------------------------------------------
// List specs (the allowlists for each list's query string)
// ------------------------------------------------------------

export const SUBSCRIPTION_LIST_SPEC: ListSpec = {
  sorts: {
    created_at: 'created_at',
    charge_at: 'charge_at',
    status_changed_at: 'status_changed_at',
    amount_minor: 'amount_minor',
  },
  defaultSort: 'created_at',
  // `live` = every status that has or could charge (LIVE_AUTOPAY_STATUSES).
  statuses: [...BILLING_SUBSCRIPTION_STATUSES, 'live'],
  methods: PAYMENT_METHODS,
};

export const PAYMENT_LIST_SPEC: ListSpec = {
  sorts: {
    created_at: 'created_at',
    amount_minor: 'amount_minor',
    captured_at: 'captured_at',
  },
  defaultSort: 'created_at',
  statuses: ['created', 'authorized', 'captured', 'refunded', 'failed'],
  methods: ['card', 'upi', 'emandate', 'nach', 'netbanking', 'wallet'],
  kinds: ['authorization', 'charge', 'upfront', 'unknown'],
};

export const INVOICE_LIST_SPEC: ListSpec = {
  sorts: {
    created_at: 'created_at',
    billing_end: 'billing_end',
    amount_minor: 'amount_minor',
  },
  defaultSort: 'created_at',
  statuses: [
    'draft',
    'issued',
    'partially_paid',
    'paid',
    'expired',
    'cancelled',
    'deleted',
  ],
};

export const REFUND_LIST_SPEC: ListSpec = {
  sorts: { created_at: 'created_at', amount_minor: 'amount_minor' },
  defaultSort: 'created_at',
  statuses: ['pending', 'processed', 'failed'],
};

export const DISPUTE_LIST_SPEC: ListSpec = {
  sorts: { created_at: 'created_at', respond_by: 'respond_by' },
  defaultSort: 'created_at',
  statuses: ['open', 'under_review', 'won', 'lost', 'closed'],
};

export const WEBHOOK_EVENT_LIST_SPEC: ListSpec = {
  sorts: { received_at: 'received_at' },
  defaultSort: 'received_at',
  // `retryable` = failed or dead, the rows an operator can re-queue.
  statuses: [
    'received',
    'processing',
    'processed',
    'ignored',
    'failed',
    'dead',
    'retryable',
  ],
};

export const RECONCILIATION_RUN_LIST_SPEC: ListSpec = {
  sorts: { started_at: 'started_at' },
  defaultSort: 'started_at',
  statuses: ['running', 'succeeded', 'failed'],
};

// ------------------------------------------------------------
// Column lists
// ------------------------------------------------------------

const SUBSCRIPTION_COLUMNS =
  'id, account_id, mode, env, status, status_changed_at, intent, provider_subscription_id, provider_plan_id, provider_customer_id, plan_name, cycle_label, duration_days, amount_minor, currency, payment_method, method_summary, start_at, current_start, current_end, charge_at, ended_at, paid_count, total_count, auth_attempts, cancel_at_cycle_end, cancel_requested_at, cancelled_by, anomaly, last_error, last_synced_at, last_event_at, created_at';

const PAYMENT_COLUMNS =
  'id, mode, provider_payment_id, provider_order_id, account_id, subscription_id, invoice_id, kind, status, amount_minor, currency, amount_refunded_minor, refund_status, captured, method, card_network, card_type, card_last4, card_issuer, vpa_masked, bank, wallet, fee_minor, tax_minor, error_code, error_description, error_source, error_step, error_reason, provider_created_at, captured_at, failed_at, granted_from, granted_until, access_applied_at, anomaly, created_at';

const INVOICE_COLUMNS =
  'id, mode, provider_invoice_id, subscription_id, account_id, status, amount_minor, amount_paid_minor, amount_due_minor, gross_amount_minor, tax_amount_minor, currency, billing_start, billing_end, issued_at, paid_at, expired_at, provider_payment_id, short_url, created_at';

const REFUND_COLUMNS =
  'id, mode, provider_refund_id, payment_id, account_id, amount_minor, currency, status, speed_requested, speed_processed, provider_created_at, processed_at, access_effect, created_at';

const DISPUTE_COLUMNS =
  'id, mode, provider_dispute_id, payment_id, account_id, amount_minor, currency, reason_code, phase, status, respond_by, provider_created_at, created_at';

/** Webhook list. No `payload`. */
export const WEBHOOK_LIST_COLUMNS =
  'id, mode, provider_event_id, event_type, account_id, entity_ids, provider_created_at, received_at, status, attempts, next_attempt_at, processed_at, last_error, anomaly, requeue_count, requeued_at, requeued_by';

/** Webhook rows inside a subscription's detail. No `payload`. */
export const WEBHOOK_DETAIL_COLUMNS =
  'id, mode, provider_event_id, event_type, status, attempts, received_at, processed_at, next_attempt_at, last_error, anomaly, requeue_count, requeued_at';

const EVENT_COLUMNS =
  'id, event_type, source, note, actor_user_id, plan_name, cycle_label, amount, from_status, to_status, ends_at, billing_payment_id, payment_request_id, created_at';

const RUN_COLUMNS =
  'id, mode, scope, status, checked, changed, errors, started_at, finished_at, triggered_by';

// ------------------------------------------------------------
// Row shapes returned to the super-admin UI
// ------------------------------------------------------------

export interface AdminSubscriptionRow {
  id: string;
  accountId: string;
  accountName: string | null;
  mode: RazorpayMode;
  env: string;
  status: string;
  statusChangedAt: string;
  intent: string;
  providerSubscriptionId: string | null;
  providerPlanId: string;
  providerCustomerId: string | null;
  planName: string;
  cycleLabel: string;
  durationDays: number;
  amountMinor: number;
  currency: string;
  paymentMethod: string | null;
  methodSummary: Record<string, unknown> | null;
  startAt: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  chargeAt: string | null;
  endedAt: string | null;
  paidCount: number | null;
  totalCount: number | null;
  authAttempts: number | null;
  cancelAtCycleEnd: boolean;
  cancelRequestedAt: string | null;
  cancelledBy: string | null;
  anomaly: string | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  lastEventAt: string | null;
  createdAt: string;
}

export interface AdminSubscriptionDetailRow extends AdminSubscriptionRow {
  /** accounts.subscription_ends_at: the access the customer has paid for. */
  paidThrough: string | null;
}

export interface AdminPaymentRow {
  id: string;
  mode: RazorpayMode;
  accountId: string;
  accountName: string | null;
  providerPaymentId: string;
  providerOrderId: string | null;
  subscriptionId: string | null;
  providerSubscriptionId: string | null;
  /** billing_invoices.id and its Razorpay id (inv_...). */
  invoiceId: string | null;
  providerInvoiceId: string | null;
  planName: string | null;
  cycleLabel: string | null;
  /** first_payment, renewal or card_verification (same rule as the notes). */
  chargeType: ChargeType;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  amountRefundedMinor: number;
  refundStatus: string | null;
  captured: boolean;
  method: string | null;
  cardNetwork: string | null;
  cardType: string | null;
  cardLast4: string | null;
  cardIssuer: string | null;
  vpaMasked: string | null;
  bank: string | null;
  wallet: string | null;
  feeMinor: number | null;
  taxMinor: number | null;
  errorCode: string | null;
  errorDescription: string | null;
  errorSource: string | null;
  errorStep: string | null;
  errorReason: string | null;
  providerCreatedAt: string | null;
  capturedAt: string | null;
  failedAt: string | null;
  grantedFrom: string | null;
  grantedUntil: string | null;
  accessAppliedAt: string | null;
  anomaly: string | null;
  createdAt: string;
}

export interface AdminInvoiceRow {
  id: string;
  mode: RazorpayMode;
  accountId: string;
  accountName: string | null;
  providerInvoiceId: string;
  subscriptionId: string | null;
  status: string;
  amountMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  grossAmountMinor: number | null;
  taxAmountMinor: number | null;
  currency: string;
  billingStart: string | null;
  billingEnd: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  expiredAt: string | null;
  providerPaymentId: string | null;
  shortUrl: string | null;
  createdAt: string;
}

export interface AdminRefundRow {
  id: string;
  mode: RazorpayMode;
  accountId: string;
  accountName: string | null;
  providerRefundId: string;
  paymentId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  speedRequested: string | null;
  speedProcessed: string | null;
  providerCreatedAt: string | null;
  processedAt: string | null;
  accessEffect: string | null;
  createdAt: string;
}

export interface AdminDisputeRow {
  id: string;
  mode: RazorpayMode;
  accountId: string;
  accountName: string | null;
  providerDisputeId: string;
  paymentId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  reasonCode: string | null;
  phase: string | null;
  status: string;
  respondBy: string | null;
  providerCreatedAt: string | null;
  createdAt: string;
}

export interface AdminWebhookEventRow {
  id: string;
  mode: RazorpayMode;
  providerEventId: string;
  eventType: string;
  /** Null inside a subscription detail (not selected there). */
  accountId: string | null;
  accountName: string | null;
  entityIds: Record<string, string> | null;
  receivedAt: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  processedAt: string | null;
  lastError: string | null;
  anomaly: string | null;
  requeueCount: number;
  requeuedAt: string | null;
  requeuedBy: string | null;
  requeuedByName: string | null;
}

export interface AdminBillingEventRow {
  id: string;
  eventType: string;
  source: string | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  planName: string | null;
  cycleLabel: string | null;
  amount: number | null;
  fromStatus: string | null;
  toStatus: string | null;
  endsAt: string | null;
  billingPaymentId: string | null;
  paymentRequestId: string | null;
  createdAt: string;
}

export interface AdminReconciliationRunRow {
  id: string;
  mode: RazorpayMode;
  scope: string;
  status: string;
  checked: number;
  changed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
  triggeredByName: string | null;
}

export interface AdminSubscriptionDetail {
  subscription: AdminSubscriptionDetailRow;
  invoices: AdminInvoiceRow[];
  payments: AdminPaymentRow[];
  events: AdminBillingEventRow[];
  webhookEvents: AdminWebhookEventRow[];
}

/** billing_admin_overview(). Keys are modes (`test`, `live`). */
export interface BillingOverview {
  /** `"<mode>:<status>"` -> count */
  subscriptions: Record<string, number>;
  trialing_with_autopay: Record<string, number>;
  upcoming_charges_7d: Record<string, number>;
  failures_7d: Record<string, number>;
  webhooks: Record<
    string,
    {
      last_received_at: string | null;
      failed: number;
      dead: number;
      /** Events marked with an anomaly in the last 7 days. */
      anomalies: number;
    }
  >;
  last_runs: Record<
    string,
    {
      id: string;
      scope: string;
      status: string;
      checked: number;
      changed: number;
      error_count: number;
      started_at: string;
      finished_at: string | null;
      triggered_by: string | null;
    }
  >;
}

export type RequeueResult =
  | {
      outcome: 'requeued';
      id: string;
      mode: RazorpayMode;
      account_id: string | null;
    }
  | { outcome: 'not_found' }
  | { outcome: 'not_retryable'; status: string };

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
};

type Filter =
  | { op: 'eq'; column: string; value: string }
  | { op: 'in'; column: string; values: string[] }
  | { op: 'notNull'; column: string }
  | { op: 'or'; expr: string };

/** Null means "this search cannot match anything": answer an empty page. */
type Resolver = (admin: SupabaseClient, id: string) => Promise<Filter | null>;

async function idsWhere(
  admin: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<string[]> {
  const { data, error } = await admin
    .from(table)
    .select('id')
    .eq(column, value)
    .limit(50);
  if (error)
    throw new BillingDbError(`Could not search ${table}: ${error.message}`);
  return ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
}

const exact =
  (column: string): Resolver =>
  async (_admin, id) => ({ op: 'eq', column, value: id });

/** Match rows whose FK points at the row with this provider id. */
const via =
  (fkColumn: string, table: string, providerColumn: string): Resolver =>
  async (admin, id) => {
    const ids = await idsWhere(admin, table, providerColumn, id);
    return ids.length ? { op: 'in', column: fkColumn, values: ids } : null;
  };

async function accountIdsByName(
  admin: SupabaseClient,
  search: string
): Promise<string[]> {
  const { data, error } = await admin
    .from('accounts')
    .select('id')
    .ilike('name', `%${escapeIlike(search)}%`)
    .limit(200);
  if (error)
    throw new BillingDbError(`Could not search accounts: ${error.message}`);
  return ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
}

/** Filters for the search box, or null for "no possible match". */
async function searchFilters(
  admin: SupabaseClient,
  p: ListParams,
  resolvers: Record<string, Resolver>
): Promise<Filter[] | null> {
  if (p.providerId) {
    const resolve = resolvers[providerIdKind(p.providerId)];
    if (!resolve) return null;
    const filter = await resolve(admin, p.providerId);
    return filter ? [filter] : null;
  }
  if (p.search) {
    const ids = await accountIdsByName(admin, p.search);
    return ids.length
      ? [{ op: 'in', column: 'account_id', values: ids }]
      : null;
  }
  return [];
}

async function runList(
  admin: SupabaseClient,
  table: string,
  columns: string,
  p: ListParams,
  filters: Filter[]
): Promise<{ rows: Raw[]; total: number }> {
  let q = admin.from(table).select(columns, { count: 'exact' });
  if (p.mode !== 'all') q = q.eq('mode', p.mode);
  for (const f of filters) {
    if (f.op === 'eq') q = q.eq(f.column, f.value);
    else if (f.op === 'in') q = q.in(f.column, f.values);
    else if (f.op === 'notNull') q = q.not(f.column, 'is', null);
    else q = q.or(f.expr);
  }
  const { data, error, count } = await q
    .order(p.sortColumn, { ascending: p.ascending, nullsFirst: false })
    .order('id', { ascending: false })
    .range(p.from, p.to);
  if (error)
    throw new BillingDbError(`Could not read ${table}: ${error.message}`);
  return { rows: (data ?? []) as unknown as Raw[], total: count ?? 0 };
}

async function namesById(
  admin: SupabaseClient,
  table: 'accounts' | 'profiles',
  ids: (string | null)[]
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const key = table === 'accounts' ? 'id' : 'user_id';
  const label = table === 'accounts' ? 'name' : 'full_name';
  const { data, error } = await admin
    .from(table)
    .select(`${key}, ${label}`)
    .in(key, unique);
  if (error)
    throw new BillingDbError(`Could not read ${table}: ${error.message}`);
  return new Map(
    ((data ?? []) as unknown as Raw[]).map((r) => [
      String(r[key]),
      str(r[label]),
    ])
  );
}

interface SubscriptionLabel {
  providerSubscriptionId: string | null;
  planName: string | null;
  cycleLabel: string | null;
}

/** id -> provider id, plan and cycle for billing_subscriptions rows. */
async function subscriptionLabels(
  admin: SupabaseClient,
  ids: (string | null)[]
): Promise<Map<string, SubscriptionLabel>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('id, provider_subscription_id, plan_name, cycle_label')
    .in('id', unique);
  if (error)
    throw new BillingDbError(
      `Could not read billing_subscriptions: ${error.message}`
    );
  return new Map(
    ((data ?? []) as unknown as Raw[]).map((r) => [
      String(r.id),
      {
        providerSubscriptionId: str(r.provider_subscription_id),
        planName: str(r.plan_name),
        cycleLabel: str(r.cycle_label),
      },
    ])
  );
}

/** id -> provider id for rows of `table`. */
async function providerIds(
  admin: SupabaseClient,
  table: 'billing_subscriptions' | 'billing_payments' | 'billing_invoices',
  ids: (string | null)[]
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const column =
    table === 'billing_subscriptions'
      ? 'provider_subscription_id'
      : table === 'billing_invoices'
        ? 'provider_invoice_id'
        : 'provider_payment_id';
  const { data, error } = await admin
    .from(table)
    .select(`id, ${column}`)
    .in('id', unique);
  if (error)
    throw new BillingDbError(`Could not read ${table}: ${error.message}`);
  return new Map(
    ((data ?? []) as unknown as Raw[]).map((r) => [
      String(r.id),
      str(r[column]),
    ])
  );
}

const empty = <T>(p: ListParams): ListResponse<T> =>
  toListResponse<T>([], 0, p.page, p.pageSize);

// ------------------------------------------------------------
// Mappers (exported for the routes and tests)
// ------------------------------------------------------------

export function toAdminSubscription(
  r: Raw,
  accountName: string | null
): AdminSubscriptionRow {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    accountName,
    mode: r.mode as RazorpayMode,
    env: String(r.env),
    status: String(r.status),
    statusChangedAt: String(r.status_changed_at),
    intent: String(r.intent),
    providerSubscriptionId: str(r.provider_subscription_id),
    providerPlanId: String(r.provider_plan_id),
    providerCustomerId: str(r.provider_customer_id),
    planName: String(r.plan_name),
    cycleLabel: String(r.cycle_label),
    durationDays: num(r.duration_days) ?? 0,
    amountMinor: num(r.amount_minor) ?? 0,
    currency: String(r.currency),
    paymentMethod: str(r.payment_method),
    methodSummary:
      r.method_summary && typeof r.method_summary === 'object'
        ? (r.method_summary as Record<string, unknown>)
        : null,
    startAt: str(r.start_at),
    currentStart: str(r.current_start),
    currentEnd: str(r.current_end),
    chargeAt: str(r.charge_at),
    endedAt: str(r.ended_at),
    paidCount: num(r.paid_count),
    totalCount: num(r.total_count),
    authAttempts: num(r.auth_attempts),
    cancelAtCycleEnd: r.cancel_at_cycle_end === true,
    cancelRequestedAt: str(r.cancel_requested_at),
    cancelledBy: str(r.cancelled_by),
    anomaly: str(r.anomaly),
    lastError: str(r.last_error),
    lastSyncedAt: str(r.last_synced_at),
    lastEventAt: str(r.last_event_at),
    createdAt: String(r.created_at),
  };
}

function toAdminPayment(
  r: Raw,
  accountName: string | null,
  sub: SubscriptionLabel | null,
  providerInvoiceId: string | null,
  firstAppliedAt: ReadonlyMap<string, string>
): AdminPaymentRow {
  const subscriptionId = str(r.subscription_id);
  const invoiceId = str(r.invoice_id);
  return {
    id: String(r.id),
    mode: r.mode as RazorpayMode,
    accountId: String(r.account_id),
    accountName,
    providerPaymentId: String(r.provider_payment_id),
    providerOrderId: str(r.provider_order_id),
    subscriptionId,
    providerSubscriptionId: sub?.providerSubscriptionId ?? null,
    invoiceId,
    providerInvoiceId,
    planName: sub?.planName ?? null,
    cycleLabel: sub?.cycleLabel ?? null,
    chargeType: chargeTypeFor({
      kind: str(r.kind),
      hasInvoice: Boolean(invoiceId),
      createdAt: str(r.provider_created_at) ?? str(r.created_at),
      firstAppliedChargeAt: subscriptionId
        ? (firstAppliedAt.get(subscriptionId) ?? null)
        : null,
    }),
    kind: String(r.kind),
    status: String(r.status),
    amountMinor: num(r.amount_minor) ?? 0,
    currency: String(r.currency),
    amountRefundedMinor: num(r.amount_refunded_minor) ?? 0,
    refundStatus: str(r.refund_status),
    captured: r.captured === true,
    method: str(r.method),
    cardNetwork: str(r.card_network),
    cardType: str(r.card_type),
    cardLast4: str(r.card_last4),
    cardIssuer: str(r.card_issuer),
    vpaMasked: str(r.vpa_masked),
    bank: str(r.bank),
    wallet: str(r.wallet),
    feeMinor: num(r.fee_minor),
    taxMinor: num(r.tax_minor),
    errorCode: str(r.error_code),
    errorDescription: str(r.error_description),
    errorSource: str(r.error_source),
    errorStep: str(r.error_step),
    errorReason: str(r.error_reason),
    providerCreatedAt: str(r.provider_created_at),
    capturedAt: str(r.captured_at),
    failedAt: str(r.failed_at),
    grantedFrom: str(r.granted_from),
    grantedUntil: str(r.granted_until),
    accessAppliedAt: str(r.access_applied_at),
    anomaly: str(r.anomaly),
    createdAt: String(r.created_at),
  };
}

function toAdminInvoice(r: Raw, accountName: string | null): AdminInvoiceRow {
  return {
    id: String(r.id),
    mode: r.mode as RazorpayMode,
    accountId: String(r.account_id),
    accountName,
    providerInvoiceId: String(r.provider_invoice_id),
    subscriptionId: str(r.subscription_id),
    status: String(r.status),
    amountMinor: num(r.amount_minor) ?? 0,
    amountPaidMinor: num(r.amount_paid_minor) ?? 0,
    amountDueMinor: num(r.amount_due_minor) ?? 0,
    grossAmountMinor: num(r.gross_amount_minor),
    taxAmountMinor: num(r.tax_amount_minor),
    currency: String(r.currency),
    billingStart: str(r.billing_start),
    billingEnd: str(r.billing_end),
    issuedAt: str(r.issued_at),
    paidAt: str(r.paid_at),
    expiredAt: str(r.expired_at),
    providerPaymentId: str(r.provider_payment_id),
    shortUrl: str(r.short_url),
    createdAt: String(r.created_at),
  };
}

function toAdminWebhookEvent(
  r: Raw,
  accountName: string | null,
  requeuedByName: string | null
): AdminWebhookEventRow {
  return {
    id: String(r.id),
    mode: r.mode as RazorpayMode,
    providerEventId: String(r.provider_event_id),
    eventType: String(r.event_type),
    accountId: str(r.account_id),
    accountName,
    entityIds:
      r.entity_ids && typeof r.entity_ids === 'object'
        ? (r.entity_ids as Record<string, string>)
        : null,
    receivedAt: String(r.received_at),
    status: String(r.status),
    attempts: num(r.attempts) ?? 0,
    nextAttemptAt: str(r.next_attempt_at),
    processedAt: str(r.processed_at),
    lastError: str(r.last_error),
    anomaly: str(r.anomaly),
    requeueCount: num(r.requeue_count) ?? 0,
    requeuedAt: str(r.requeued_at),
    requeuedBy: str(r.requeued_by),
    requeuedByName,
  };
}

// ------------------------------------------------------------
// Lists
// ------------------------------------------------------------

export async function listAdminSubscriptions(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminSubscriptionRow>> {
  const filters = await searchFilters(admin, p, {
    sub: exact('provider_subscription_id'),
    plan: exact('provider_plan_id'),
    cust: exact('provider_customer_id'),
  });
  if (!filters) return empty(p);
  if (p.status === 'live')
    filters.push({
      op: 'in',
      column: 'status',
      values: [...LIVE_AUTOPAY_STATUSES],
    });
  else if (p.status)
    filters.push({ op: 'eq', column: 'status', value: p.status });
  if (p.method === 'unknown')
    filters.push({
      op: 'or',
      expr: 'payment_method.is.null,payment_method.eq.unknown',
    });
  else if (p.method)
    filters.push({ op: 'eq', column: 'payment_method', value: p.method });

  const { rows, total } = await runList(
    admin,
    'billing_subscriptions',
    SUBSCRIPTION_COLUMNS,
    p,
    filters
  );
  const names = await namesById(
    admin,
    'accounts',
    rows.map((r) => str(r.account_id))
  );
  return toListResponse(
    rows.map((r) =>
      toAdminSubscription(r, names.get(String(r.account_id)) ?? null)
    ),
    total,
    p.page,
    p.pageSize
  );
}

export async function listAdminPayments(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminPaymentRow>> {
  const filters = await searchFilters(admin, p, {
    pay: exact('provider_payment_id'),
    sub: via(
      'subscription_id',
      'billing_subscriptions',
      'provider_subscription_id'
    ),
    inv: via('invoice_id', 'billing_invoices', 'provider_invoice_id'),
  });
  if (!filters) return empty(p);
  if (p.status) filters.push({ op: 'eq', column: 'status', value: p.status });
  if (p.method) filters.push({ op: 'eq', column: 'method', value: p.method });
  if (p.kind) filters.push({ op: 'eq', column: 'kind', value: p.kind });

  const { rows, total } = await runList(
    admin,
    'billing_payments',
    PAYMENT_COLUMNS,
    p,
    filters
  );
  const subscriptionIds = rows.map((r) => str(r.subscription_id));
  const [names, subs, invoiceIds, firstAppliedAt] = await Promise.all([
    namesById(
      admin,
      'accounts',
      rows.map((r) => str(r.account_id))
    ),
    subscriptionLabels(admin, subscriptionIds),
    providerIds(
      admin,
      'billing_invoices',
      rows.map((r) => str(r.invoice_id))
    ),
    loadFirstAppliedChargeAt(
      admin,
      subscriptionIds.filter((v): v is string => Boolean(v))
    ),
  ]);
  return toListResponse(
    rows.map((r) =>
      toAdminPayment(
        r,
        names.get(String(r.account_id)) ?? null,
        subs.get(String(r.subscription_id)) ?? null,
        invoiceIds.get(String(r.invoice_id)) ?? null,
        firstAppliedAt
      )
    ),
    total,
    p.page,
    p.pageSize
  );
}

/**
 * Every Razorpay payment, both modes, newest first, mapped exactly like
 * the Transactions list, for the All payments ledger (filters are applied
 * in memory there, across both channels). Read-only; chunked and capped.
 */
export async function listAllAdminPayments(
  admin: SupabaseClient,
  { cap = 10000 }: { cap?: number } = {}
): Promise<{ rows: AdminPaymentRow[]; truncated: boolean }> {
  let read: { rows: Raw[]; truncated: boolean };
  try {
    read = await fetchAllRows<Raw>(
      (from, to) =>
        admin
          .from('billing_payments')
          .select(PAYMENT_COLUMNS)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: Raw[] | null;
          error: { message: string } | null;
        }>,
      { cap }
    );
  } catch (err) {
    throw new BillingDbError(
      `Could not read billing_payments: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const rows = read.rows;
  const subscriptionIds = rows.map((r) => str(r.subscription_id));
  const [names, subs, invoiceIds, firstAppliedAt] = await Promise.all([
    namesById(
      admin,
      'accounts',
      rows.map((r) => str(r.account_id))
    ),
    subscriptionLabels(admin, subscriptionIds),
    providerIds(
      admin,
      'billing_invoices',
      rows.map((r) => str(r.invoice_id))
    ),
    loadFirstAppliedChargeAt(
      admin,
      subscriptionIds.filter((v): v is string => Boolean(v))
    ),
  ]);
  return {
    rows: rows.map((r) =>
      toAdminPayment(
        r,
        names.get(String(r.account_id)) ?? null,
        subs.get(String(r.subscription_id)) ?? null,
        invoiceIds.get(String(r.invoice_id)) ?? null,
        firstAppliedAt
      )
    ),
    truncated: read.truncated,
  };
}

export async function listAdminInvoices(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminInvoiceRow>> {
  const filters = await searchFilters(admin, p, {
    inv: exact('provider_invoice_id'),
    pay: exact('provider_payment_id'),
    sub: via(
      'subscription_id',
      'billing_subscriptions',
      'provider_subscription_id'
    ),
  });
  if (!filters) return empty(p);
  if (p.status) filters.push({ op: 'eq', column: 'status', value: p.status });

  const { rows, total } = await runList(
    admin,
    'billing_invoices',
    INVOICE_COLUMNS,
    p,
    filters
  );
  const names = await namesById(
    admin,
    'accounts',
    rows.map((r) => str(r.account_id))
  );
  return toListResponse(
    rows.map((r) => toAdminInvoice(r, names.get(String(r.account_id)) ?? null)),
    total,
    p.page,
    p.pageSize
  );
}

export async function listAdminRefunds(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminRefundRow>> {
  const filters = await searchFilters(admin, p, {
    rfnd: exact('provider_refund_id'),
    pay: via('payment_id', 'billing_payments', 'provider_payment_id'),
  });
  if (!filters) return empty(p);
  if (p.status) filters.push({ op: 'eq', column: 'status', value: p.status });

  const { rows, total } = await runList(
    admin,
    'billing_refunds',
    REFUND_COLUMNS,
    p,
    filters
  );
  const [names, pays] = await Promise.all([
    namesById(
      admin,
      'accounts',
      rows.map((r) => str(r.account_id))
    ),
    providerIds(
      admin,
      'billing_payments',
      rows.map((r) => str(r.payment_id))
    ),
  ]);
  return toListResponse(
    rows.map((r): AdminRefundRow => ({
      id: String(r.id),
      mode: r.mode as RazorpayMode,
      accountId: String(r.account_id),
      accountName: names.get(String(r.account_id)) ?? null,
      providerRefundId: String(r.provider_refund_id),
      paymentId: str(r.payment_id),
      providerPaymentId: pays.get(String(r.payment_id)) ?? null,
      amountMinor: num(r.amount_minor) ?? 0,
      currency: String(r.currency),
      status: String(r.status),
      speedRequested: str(r.speed_requested),
      speedProcessed: str(r.speed_processed),
      providerCreatedAt: str(r.provider_created_at),
      processedAt: str(r.processed_at),
      accessEffect: str(r.access_effect),
      createdAt: String(r.created_at),
    })),
    total,
    p.page,
    p.pageSize
  );
}

export async function listAdminDisputes(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminDisputeRow>> {
  const filters = await searchFilters(admin, p, {
    disp: exact('provider_dispute_id'),
    pay: via('payment_id', 'billing_payments', 'provider_payment_id'),
  });
  if (!filters) return empty(p);
  if (p.status) filters.push({ op: 'eq', column: 'status', value: p.status });

  const { rows, total } = await runList(
    admin,
    'billing_disputes',
    DISPUTE_COLUMNS,
    p,
    filters
  );
  const [names, pays] = await Promise.all([
    namesById(
      admin,
      'accounts',
      rows.map((r) => str(r.account_id))
    ),
    providerIds(
      admin,
      'billing_payments',
      rows.map((r) => str(r.payment_id))
    ),
  ]);
  return toListResponse(
    rows.map((r): AdminDisputeRow => ({
      id: String(r.id),
      mode: r.mode as RazorpayMode,
      accountId: String(r.account_id),
      accountName: names.get(String(r.account_id)) ?? null,
      providerDisputeId: String(r.provider_dispute_id),
      paymentId: str(r.payment_id),
      providerPaymentId: pays.get(String(r.payment_id)) ?? null,
      amountMinor: num(r.amount_minor) ?? 0,
      currency: String(r.currency),
      reasonCode: str(r.reason_code),
      phase: str(r.phase),
      status: String(r.status),
      respondBy: str(r.respond_by),
      providerCreatedAt: str(r.provider_created_at),
      createdAt: String(r.created_at),
    })),
    total,
    p.page,
    p.pageSize
  );
}

export async function listAdminWebhookEvents(
  admin: SupabaseClient,
  p: ListParams,
  opts: { anomalyOnly?: boolean } = {}
): Promise<ListResponse<AdminWebhookEventRow>> {
  const filters = await searchFilters(admin, p, {
    evt: exact('provider_event_id'),
    sub: exact('entity_ids->>subscription'),
    pay: exact('entity_ids->>payment'),
    inv: exact('entity_ids->>invoice'),
    rfnd: exact('entity_ids->>refund'),
    disp: exact('entity_ids->>dispute'),
  });
  if (!filters) return empty(p);
  if (p.status === 'retryable')
    filters.push({ op: 'in', column: 'status', values: ['failed', 'dead'] });
  else if (p.status)
    filters.push({ op: 'eq', column: 'status', value: p.status });
  if (opts.anomalyOnly) filters.push({ op: 'notNull', column: 'anomaly' });

  const { rows, total } = await runList(
    admin,
    'billing_webhook_events',
    WEBHOOK_LIST_COLUMNS,
    p,
    filters
  );
  const [names, actors] = await Promise.all([
    namesById(
      admin,
      'accounts',
      rows.map((r) => str(r.account_id))
    ),
    namesById(
      admin,
      'profiles',
      rows.map((r) => str(r.requeued_by))
    ),
  ]);
  return toListResponse(
    rows.map((r) =>
      toAdminWebhookEvent(
        r,
        names.get(String(r.account_id)) ?? null,
        actors.get(String(r.requeued_by)) ?? null
      )
    ),
    total,
    p.page,
    p.pageSize
  );
}

export async function listReconciliationRuns(
  admin: SupabaseClient,
  p: ListParams
): Promise<ListResponse<AdminReconciliationRunRow>> {
  const filters: Filter[] = [];
  if (p.status) filters.push({ op: 'eq', column: 'status', value: p.status });
  // Newest first regardless of `dir`: this list is a log.
  const { rows, total } = await runList(
    admin,
    'billing_reconciliation_runs',
    RUN_COLUMNS,
    { ...p, ascending: false },
    filters
  );
  const actors = await namesById(
    admin,
    'profiles',
    rows.map((r) => str(r.triggered_by))
  );
  return toListResponse(
    rows.map((r): AdminReconciliationRunRow => ({
      id: String(r.id),
      mode: r.mode as RazorpayMode,
      scope: String(r.scope),
      status: String(r.status),
      checked: num(r.checked) ?? 0,
      changed: num(r.changed) ?? 0,
      errors: Array.isArray(r.errors) ? r.errors.map(String) : [],
      startedAt: String(r.started_at),
      finishedAt: str(r.finished_at),
      triggeredBy: str(r.triggered_by),
      triggeredByName: actors.get(String(r.triggered_by)) ?? null,
    })),
    total,
    p.page,
    p.pageSize
  );
}

// ------------------------------------------------------------
// One subscription
// ------------------------------------------------------------

async function readSubscription(
  admin: SupabaseClient,
  id: string
): Promise<Raw | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new BillingDbError(
      `Could not read the subscription: ${error.message}`
    );
  return (data as unknown as Raw | null) ?? null;
}

export async function getAdminSubscription(
  admin: SupabaseClient,
  id: string
): Promise<AdminSubscriptionRow | null> {
  const row = await readSubscription(admin, id);
  if (!row) return null;
  const names = await namesById(admin, 'accounts', [str(row.account_id)]);
  return toAdminSubscription(row, names.get(String(row.account_id)) ?? null);
}

export async function getAdminSubscriptionDetail(
  admin: SupabaseClient,
  id: string
): Promise<AdminSubscriptionDetail | null> {
  const row = await readSubscription(admin, id);
  if (!row) return null;
  const pid = str(row.provider_subscription_id);

  const fail = (what: string, message: string) =>
    new BillingDbError(`Could not read ${what}: ${message}`);

  const [account, invoices, payments, events, webhooks] = await Promise.all([
    admin
      .from('accounts')
      .select('id, name, subscription_ends_at')
      .eq('id', String(row.account_id))
      .maybeSingle(),
    admin
      .from('billing_invoices')
      .select(INVOICE_COLUMNS)
      .eq('subscription_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('billing_payments')
      .select(PAYMENT_COLUMNS)
      .eq('subscription_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('subscription_events')
      .select(EVENT_COLUMNS)
      .eq('billing_subscription_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    pid
      ? admin
          .from('billing_webhook_events')
          .select(WEBHOOK_DETAIL_COLUMNS)
          .eq('entity_ids->>subscription', pid)
          .order('received_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (account.error) throw fail('the account', account.error.message);
  if (invoices.error) throw fail('invoices', invoices.error.message);
  if (payments.error) throw fail('payments', payments.error.message);
  if (events.error) throw fail('events', events.error.message);
  if (webhooks.error) throw fail('webhook events', webhooks.error.message);

  const acc = account.data as unknown as Raw | null;
  const accountName = str(acc?.name);
  const eventRows = (events.data ?? []) as unknown as Raw[];
  const invoiceRows = (invoices.data ?? []) as unknown as Raw[];
  const paymentRows = (payments.data ?? []) as unknown as Raw[];
  // Invoice ids from the invoices already read; look up any older one
  // that fell outside that page.
  const invoiceIds = new Map<string, string | null>(
    invoiceRows.map((r) => [String(r.id), str(r.provider_invoice_id)])
  );
  const [actors, extraInvoices, firstAppliedAt] = await Promise.all([
    namesById(
      admin,
      'profiles',
      eventRows.map((e) => str(e.actor_user_id))
    ),
    providerIds(
      admin,
      'billing_invoices',
      paymentRows
        .map((r) => str(r.invoice_id))
        .filter((v) => v !== null && !invoiceIds.has(v))
    ),
    loadFirstAppliedChargeAt(admin, [id]),
  ]);
  for (const [k, v] of extraInvoices) invoiceIds.set(k, v);
  const subLabel: SubscriptionLabel = {
    providerSubscriptionId: pid,
    planName: str(row.plan_name),
    cycleLabel: str(row.cycle_label),
  };

  return {
    subscription: {
      ...toAdminSubscription(row, accountName),
      paidThrough: str(acc?.subscription_ends_at),
    },
    invoices: invoiceRows.map((r) => toAdminInvoice(r, accountName)),
    payments: paymentRows.map((r) =>
      toAdminPayment(
        r,
        accountName,
        subLabel,
        invoiceIds.get(String(r.invoice_id)) ?? null,
        firstAppliedAt
      )
    ),
    events: eventRows.map((e): AdminBillingEventRow => ({
      id: String(e.id),
      eventType: String(e.event_type),
      source: str(e.source),
      note: str(e.note),
      actorUserId: str(e.actor_user_id),
      actorName: actors.get(String(e.actor_user_id)) ?? null,
      planName: str(e.plan_name),
      cycleLabel: str(e.cycle_label),
      amount: num(e.amount),
      fromStatus: str(e.from_status),
      toStatus: str(e.to_status),
      endsAt: str(e.ends_at),
      billingPaymentId: str(e.billing_payment_id),
      paymentRequestId: str(e.payment_request_id),
      createdAt: String(e.created_at),
    })),
    webhookEvents: ((webhooks.data ?? []) as unknown as Raw[]).map((r) =>
      toAdminWebhookEvent(r, accountName, null)
    ),
  };
}

// ------------------------------------------------------------
// Webhook retry, overview and audit
// ------------------------------------------------------------

export async function getWebhookEventBrief(
  admin: SupabaseClient,
  id: string
): Promise<{
  id: string;
  mode: RazorpayMode;
  status: string;
  accountId: string | null;
} | null> {
  const { data, error } = await admin
    .from('billing_webhook_events')
    .select('id, mode, status, account_id')
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new BillingDbError(
      `Could not read the webhook event: ${error.message}`
    );
  const r = data as unknown as Raw | null;
  if (!r) return null;
  return {
    id: String(r.id),
    mode: r.mode as RazorpayMode,
    status: String(r.status),
    accountId: str(r.account_id),
  };
}

async function rpc<T>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new BillingDbError(`${fn} failed: ${error.message}`);
  return data as T;
}

export function requeueWebhookEvent(
  admin: SupabaseClient,
  id: string,
  actorUserId: string
): Promise<RequeueResult> {
  return rpc<RequeueResult>(admin, 'billing_admin_requeue_webhook_event', {
    p_id: id,
    p_actor: actorUserId,
  });
}

export async function getBillingOverview(
  admin: SupabaseClient
): Promise<BillingOverview> {
  const data = await rpc<Partial<BillingOverview> | null>(
    admin,
    'billing_admin_overview',
    {}
  );
  return {
    subscriptions: data?.subscriptions ?? {},
    trialing_with_autopay: data?.trialing_with_autopay ?? {},
    upcoming_charges_7d: data?.upcoming_charges_7d ?? {},
    failures_7d: data?.failures_7d ?? {},
    webhooks: data?.webhooks ?? {},
    last_runs: data?.last_runs ?? {},
  };
}

/** One `billing_admin_action` row in subscription_events. Returns its id. */
export function adminAudit(
  admin: SupabaseClient,
  input: {
    accountId: string;
    billingSubscriptionId: string | null;
    actorUserId: string;
    note: string;
  }
): Promise<string> {
  return rpc<string>(admin, 'billing_admin_audit', {
    p_account_id: input.accountId,
    p_billing_subscription_id: input.billingSubscriptionId,
    p_actor: input.actorUserId,
    p_note: input.note,
  });
}
