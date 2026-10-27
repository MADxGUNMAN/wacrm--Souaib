// ============================================================
// AutoPay payments for the customer's billing history — SERVER ONLY.
//
// A narrow projection of `billing_payments` (plan section 8.3):
//   - only rows Razorpay reported (never a guessed value)
//   - "Paid" only when access was actually applied from the payment
//   - the receipt link is the paid invoice's Razorpay URL, or nothing
//   - failure reasons in plain language, never Razorpay's raw text
//   - card network + last 4 or a masked VPA; nothing else about the payer
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { loadFirstAppliedChargeAt } from './db';
import { customerFailureMessage } from './mapping';
import { fromMinor } from './money';
import {
  chargeTypeFor,
  chargeTypeLabel,
  type ChargeType,
} from './payment-details';
import type { RazorpayMode } from './types';

export const AUTOPAY_HISTORY_PAGE_SIZE = 10;

export type AutopayPaymentState =
  | 'paid'
  | 'processing'
  | 'failed'
  | 'refunded'
  | 'partly_refunded'
  | 'verification';

export interface CustomerAutopayPayment {
  id: string;
  /** Razorpay payment id, quoted to support. */
  reference: string;
  state: AutopayPaymentState;
  /** True for the small card/UPI check made when AutoPay was set up. */
  isVerification: boolean;
  amount: number;
  amountRefunded: number;
  currency: string;
  method: {
    type: string | null;
    network: string | null;
    last4: string | null;
    vpaMasked: string | null;
  };
  failureReason: string | null;
  /** Access this payment bought, once applied. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Razorpay invoice page, only for a paid invoice. */
  receiptUrl: string | null;
  /** Razorpay invoice id (inv_...), null for the setup check. */
  invoiceReference: string | null;
  planName: string | null;
  cycleLabel: string | null;
  chargeType: ChargeType;
  /** "First payment", "Renewal" or "AutoPay setup check". */
  chargeLabel: string;
  createdAt: string;
}

export interface AutopayHistoryPage {
  items: CustomerAutopayPayment[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Row {
  id: string;
  provider_payment_id: string;
  kind: string;
  status: string;
  amount_minor: number | string;
  amount_refunded_minor: number | string | null;
  refund_status: string | null;
  currency: string;
  method: string | null;
  card_network: string | null;
  card_last4: string | null;
  vpa_masked: string | null;
  error_code: string | null;
  error_reason: string | null;
  granted_from: string | null;
  granted_until: string | null;
  access_applied_at: string | null;
  access_revoked_at: string | null;
  provider_created_at: string | null;
  created_at: string;
  subscription_id?: string | null;
  invoice: {
    short_url: string | null;
    status: string | null;
    provider_invoice_id?: string | null;
  } | null;
  subscription?: {
    provider_subscription_id: string | null;
    plan_name: string | null;
    cycle_label: string | null;
  } | null;
}

const COLUMNS =
  'id, provider_payment_id, kind, status, amount_minor, amount_refunded_minor, refund_status, currency, method, card_network, card_last4, vpa_masked, error_code, error_reason, granted_from, granted_until, access_applied_at, access_revoked_at, provider_created_at, created_at, subscription_id, invoice:billing_invoices(short_url, status, provider_invoice_id), subscription:billing_subscriptions(provider_subscription_id, plan_name, cycle_label)';

function money(minor: number | string | null, currency: string): number {
  const n = Number(minor ?? 0);
  if (!Number.isSafeInteger(n)) return 0;
  try {
    return fromMinor(n, currency);
  } catch {
    return 0;
  }
}

export function classifyPaymentRow(
  row: Pick<Row, 'kind' | 'status' | 'refund_status' | 'access_applied_at'>
): AutopayPaymentState {
  if (row.status === 'failed') return 'failed';
  if (row.kind === 'authorization') return 'verification';
  if (row.status === 'refunded' || row.refund_status === 'full')
    return 'refunded';
  if (row.access_applied_at)
    return row.refund_status === 'partial' ? 'partly_refunded' : 'paid';
  return 'processing';
}

export function toCustomerAutopayPayment(
  row: Row,
  firstAppliedAt: ReadonlyMap<string, string> = new Map()
): CustomerAutopayPayment {
  const state = classifyPaymentRow(row);
  const currency = (row.currency ?? 'INR').trim().toUpperCase();
  const applied = Boolean(row.access_applied_at) && !row.access_revoked_at;
  const invoiceReference = row.invoice?.provider_invoice_id ?? null;
  const createdAt = row.provider_created_at ?? row.created_at;
  const chargeType = chargeTypeFor({
    kind: row.kind,
    hasInvoice: Boolean(row.invoice),
    createdAt,
    firstAppliedChargeAt: row.subscription_id
      ? (firstAppliedAt.get(row.subscription_id) ?? null)
      : null,
  });
  return {
    id: row.id,
    reference: row.provider_payment_id,
    state,
    isVerification: row.kind === 'authorization',
    amount: money(row.amount_minor, currency),
    amountRefunded: money(row.amount_refunded_minor, currency),
    currency,
    method: {
      type: row.method,
      network: row.card_network,
      last4: row.card_last4,
      vpaMasked: row.vpa_masked,
    },
    failureReason:
      state === 'failed'
        ? customerFailureMessage(row.error_code, row.error_reason)
        : null,
    periodStart: applied ? row.granted_from : null,
    periodEnd: applied ? row.granted_until : null,
    receiptUrl:
      row.invoice?.status === 'paid' ? (row.invoice.short_url ?? null) : null,
    invoiceReference,
    planName: row.subscription?.plan_name ?? null,
    cycleLabel: row.subscription?.cycle_label ?? null,
    chargeType,
    chargeLabel: chargeTypeLabel(chargeType),
    createdAt,
  };
}

function safePage(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function listAutopayPayments(
  admin: SupabaseClient,
  input: {
    accountId: string;
    mode: RazorpayMode;
    page: unknown;
    pageSize?: number;
  }
): Promise<AutopayHistoryPage> {
  const pageSize = input.pageSize ?? AUTOPAY_HISTORY_PAGE_SIZE;
  const page = safePage(input.page);
  const from = (page - 1) * pageSize;

  const { data, error, count } = await admin
    .from('billing_payments')
    .select(COLUMNS, { count: 'exact' })
    .eq('account_id', input.accountId)
    .eq('mode', input.mode)
    .neq('status', 'created')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error('[billing] autopay history read failed:', error.message);
    return { items: [], page, pageSize, total: 0, totalPages: 1 };
  }
  const total = count ?? 0;
  const rows = (data ?? []) as unknown as Row[];
  // Tells a first payment from a renewal. A failed read only costs the
  // label precision, so it is logged rather than failing the page.
  let firstAppliedAt = new Map<string, string>();
  try {
    firstAppliedAt = await loadFirstAppliedChargeAt(
      admin,
      rows.map((r) => r.subscription_id ?? '').filter(Boolean)
    );
  } catch (err) {
    console.error(
      '[billing] autopay history first-charge read failed:',
      err instanceof Error ? err.message : err
    );
  }
  return {
    items: rows.map((r) => toCustomerAutopayPayment(r, firstAppliedAt)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
