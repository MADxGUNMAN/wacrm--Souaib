// ============================================================
// All payments ledger: Razorpay payments and manual UPI requests in one
// list (pure).
//
// Before this, "which payment was made how" had no single answer:
// Razorpay payments lived under Transactions, manual UPI payments in the
// Manual UPI queue, and nothing merged them. This maps both into one
// row shape with an explicit channel, then filters, counts, sorts and
// pages them together. The route reads; this file decides.
//
// Status mapping:
//   Razorpay  captured, nothing refunded          -> paid
//             captured, 0 < refunded < amount      -> partially_refunded
//             refunded, or refunded >= amount      -> refunded
//             failed                               -> failed
//             created / authorized                 -> pending
//   Manual    approved -> paid, pending -> pending, rejected -> rejected
// The `refunded` filter matches refunded AND partially_refunded.
//
// Mode: Razorpay rows carry test/live; manual rows have none (real money
// outside Razorpay), so an explicit Live or Test filter excludes them.
// ============================================================

import type { AdminPaymentRow } from './razorpay/admin-db';
import { LEDGER_STATUSES, type LedgerStatus } from './ledger-status';

export type LedgerChannel = 'razorpay' | 'manual_upi';
export const LEDGER_CHANNELS: readonly LedgerChannel[] = [
  'razorpay',
  'manual_upi',
];

export type LedgerType =
  'first_payment' | 'renewal' | 'card_verification' | 'manual_payment';

export type LedgerSort = 'date:desc' | 'date:asc' | 'amount:desc';
export const LEDGER_SORTS: readonly LedgerSort[] = [
  'date:desc',
  'date:asc',
  'amount:desc',
];

export interface LedgerMethodDetail {
  cardNetwork: string | null;
  cardLast4: string | null;
  vpaMasked: string | null;
  bank: string | null;
  wallet: string | null;
  payerUpiId: string | null;
}

export interface LedgerRow {
  /** 'rzp:<billing_payments.id>' | 'upi:<payment_requests.id>' */
  key: string;
  channel: LedgerChannel;
  /** Razorpay: provider_created_at ?? created_at. Manual: submitted at. */
  date: string;
  accountId: string;
  accountName: string | null;
  ownerEmail: string | null;
  type: LedgerType;
  planName: string | null;
  cycleLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  /** Manual only: the price in force when the customer submitted. */
  expectedMinor: number | null;
  status: LedgerStatus;
  rawStatus: string;
  mode: 'test' | 'live' | null;
  /** Razorpay method (card, upi, …) or 'upi_qr' for manual. */
  method: string | null;
  methodDetail: LedgerMethodDetail;
  /** pay_ id or UTR. */
  reference: string | null;
  billingSubscriptionId: string | null;
  providerSubscriptionId: string | null;
  paymentRequestId: string | null;
  /** The full Razorpay row, for the expandable details. */
  razorpay: AdminPaymentRow | null;
}

/** One payment_requests row, amounts already in minor units. */
export interface ManualLedgerInput {
  id: string;
  accountId: string;
  accountName: string | null;
  ownerEmail: string | null;
  planName: string | null;
  cycleLabel: string | null;
  expectedMinor: number | null;
  paidMinor: number;
  currency: string;
  transactionRef: string | null;
  payerUpiId: string | null;
  status: string;
  activatedFrom: string | null;
  activatedUntil: string | null;
  createdAt: string;
}

export function razorpayLedgerStatus(p: {
  status: string;
  captured: boolean;
  amountMinor: number;
  amountRefundedMinor: number;
}): LedgerStatus {
  const refunded = p.amountRefundedMinor ?? 0;
  if (p.status === 'failed') return 'failed';
  if (p.status === 'refunded' || (refunded > 0 && refunded >= p.amountMinor)) {
    return 'refunded';
  }
  if (p.status === 'captured' || p.captured) {
    return refunded > 0 ? 'partially_refunded' : 'paid';
  }
  return 'pending';
}

export function manualLedgerStatus(status: string): LedgerStatus {
  if (status === 'approved') return 'paid';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

export function toLedgerFromRazorpay(
  p: AdminPaymentRow,
  ownerEmail: string | null
): LedgerRow {
  return {
    key: `rzp:${p.id}`,
    channel: 'razorpay',
    date: p.providerCreatedAt ?? p.createdAt,
    accountId: p.accountId,
    accountName: p.accountName,
    ownerEmail,
    type: p.chargeType,
    planName: p.planName,
    cycleLabel: p.cycleLabel,
    periodFrom: p.grantedFrom,
    periodTo: p.grantedUntil,
    amountMinor: p.amountMinor,
    refundedMinor: p.amountRefundedMinor ?? 0,
    currency: p.currency,
    expectedMinor: null,
    status: razorpayLedgerStatus(p),
    rawStatus: p.status,
    mode: p.mode,
    method: p.method,
    methodDetail: {
      cardNetwork: p.cardNetwork,
      cardLast4: p.cardLast4,
      vpaMasked: p.vpaMasked,
      bank: p.bank,
      wallet: p.wallet,
      payerUpiId: null,
    },
    reference: p.providerPaymentId,
    billingSubscriptionId: p.subscriptionId,
    providerSubscriptionId: p.providerSubscriptionId,
    paymentRequestId: null,
    razorpay: p,
  };
}

export function toLedgerFromManual(r: ManualLedgerInput): LedgerRow {
  return {
    key: `upi:${r.id}`,
    channel: 'manual_upi',
    date: r.createdAt,
    accountId: r.accountId,
    accountName: r.accountName,
    ownerEmail: r.ownerEmail,
    type: 'manual_payment',
    planName: r.planName,
    cycleLabel: r.cycleLabel,
    periodFrom: r.activatedFrom,
    periodTo: r.activatedUntil,
    amountMinor: r.paidMinor,
    refundedMinor: 0,
    currency: r.currency,
    expectedMinor: r.expectedMinor,
    status: manualLedgerStatus(r.status),
    rawStatus: r.status,
    mode: null,
    method: 'upi_qr',
    methodDetail: {
      cardNetwork: null,
      cardLast4: null,
      vpaMasked: null,
      bank: null,
      wallet: null,
      payerUpiId: r.payerUpiId,
    },
    reference: r.transactionRef,
    billingSubscriptionId: null,
    providerSubscriptionId: null,
    paymentRequestId: r.id,
    razorpay: null,
  };
}

export interface LedgerParams {
  channel: LedgerChannel | 'all';
  status: LedgerStatus | 'all';
  mode: 'all' | 'live' | 'test';
  search: string;
  sort: LedgerSort;
  page: number;
  pageSize: number;
}

export interface LedgerPage {
  items: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    channel: Record<LedgerChannel, number>;
    status: Record<LedgerStatus, number>;
  };
}

function statusMatches(row: LedgerStatus, filter: LedgerParams['status']) {
  if (filter === 'all') return true;
  if (filter === 'refunded') {
    return row === 'refunded' || row === 'partially_refunded';
  }
  return row === filter;
}

function searchText(r: LedgerRow): string {
  return [
    r.accountName,
    r.ownerEmail,
    r.reference,
    r.providerSubscriptionId,
    r.planName,
    r.methodDetail.payerUpiId,
    r.methodDetail.vpaMasked,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function compare(sort: LedgerSort) {
  return (a: LedgerRow, b: LedgerRow): number => {
    let d = 0;
    if (sort === 'amount:desc') d = b.amountMinor - a.amountMinor;
    if (d === 0) {
      const t = Date.parse(a.date) - Date.parse(b.date);
      d = sort === 'date:asc' ? t : -t;
    }
    if (d === 0) d = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    return d;
  };
}

export function selectLedgerPage(
  rows: readonly LedgerRow[],
  p: LedgerParams
): LedgerPage {
  const term = p.search.trim().toLowerCase();
  const byMode = (r: LedgerRow) =>
    p.mode === 'all' ? true : r.mode === p.mode;
  const bySearch = (r: LedgerRow) =>
    term ? searchText(r).includes(term) : true;
  const byChannel = (r: LedgerRow) =>
    p.channel === 'all' ? true : r.channel === p.channel;
  const byStatus = (r: LedgerRow) => statusMatches(r.status, p.status);

  const base = rows.filter((r) => byMode(r) && bySearch(r));

  const channel = { razorpay: 0, manual_upi: 0 } as Record<
    LedgerChannel,
    number
  >;
  for (const r of base) if (byStatus(r)) channel[r.channel] += 1;

  const status = Object.fromEntries(
    LEDGER_STATUSES.map((s) => [s, 0])
  ) as Record<LedgerStatus, number>;
  for (const r of base) if (byChannel(r)) status[r.status] += 1;

  const filtered = base.filter((r) => byChannel(r) && byStatus(r));
  filtered.sort(compare(p.sort));

  const totalPages = Math.max(1, Math.ceil(filtered.length / p.pageSize));
  const page = Math.min(Math.max(1, p.page), totalPages);
  const start = (page - 1) * p.pageSize;
  return {
    items: filtered.slice(start, start + p.pageSize),
    total: filtered.length,
    page,
    pageSize: p.pageSize,
    totalPages,
    counts: { channel, status },
  };
}
