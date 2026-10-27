// ============================================================
// Filter, count and page classified billing events (pure).
//
// The events route loads every matching row (chunked, capped) and
// classifies each one; channel, Razorpay mode and the text search are
// derived values, so they are applied here, in memory, in one place.
//
// Counts semantics, so the tiles always agree with the table:
//   byChannel = rows matching every filter EXCEPT channel
//   total     = rows matching every filter INCLUDING channel
// ============================================================

import type { BillingEventView } from '@/types/super-admin';

import { BILLING_CHANNELS, type BillingChannel } from './event-channel';

export type ModeFilter = 'all' | 'live' | 'test';

export interface EventPageParams {
  channel: BillingChannel | 'all';
  /**
   * Razorpay mode. Rows without a Razorpay link have no mode, so an
   * explicit Live or Test excludes them (the select says "Razorpay mode").
   */
  mode: ModeFilter;
  search: string;
  page: number;
  pageSize: number;
}

export interface EventPage {
  events: BillingEventView[];
  counts: { total: number; byChannel: Record<BillingChannel, number> };
  page: number;
  pageSize: number;
  totalPages: number;
}

export function emptyChannelCounts(): Record<BillingChannel, number> {
  return Object.fromEntries(BILLING_CHANNELS.map((c) => [c, 0])) as Record<
    BillingChannel,
    number
  >;
}

export function matchesMode(
  rowMode: 'test' | 'live' | null,
  mode: ModeFilter
): boolean {
  return mode === 'all' ? true : rowMode === mode;
}

function haystack(e: BillingEventView): string {
  return [
    e.accountName,
    e.ownerEmail,
    e.initiatedBy.label,
    e.planName,
    e.cycleLabel,
    e.note,
    e.providerSubscriptionId,
    e.providerPaymentId,
    e.utr,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function selectEventsPage(
  rows: readonly BillingEventView[],
  p: EventPageParams
): EventPage {
  const term = p.search.trim().toLowerCase();
  const base = rows.filter(
    (e) =>
      matchesMode(e.mode, p.mode) && (term ? haystack(e).includes(term) : true)
  );

  const byChannel = emptyChannelCounts();
  for (const e of base) byChannel[e.channel] += 1;

  const filtered =
    p.channel === 'all' ? base : base.filter((e) => e.channel === p.channel);

  const totalPages = Math.max(1, Math.ceil(filtered.length / p.pageSize));
  const page = Math.min(Math.max(1, p.page), totalPages);
  const start = (page - 1) * p.pageSize;

  return {
    events: filtered.slice(start, start + p.pageSize),
    counts: { total: filtered.length, byChannel },
    page,
    pageSize: p.pageSize,
    totalPages,
  };
}
