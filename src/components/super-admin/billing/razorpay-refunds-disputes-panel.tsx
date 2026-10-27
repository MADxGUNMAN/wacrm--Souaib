'use client';

// ============================================================
// Payments › Refunds & disputes: two stacked lists, both modes. They
// share one search and mode filter because they are read together
// during a dispute.
//
// A dispute whose response deadline is within three days is highlighted
// with the days left in words: a missed `respond_by` loses the dispute by
// default, so it must not look like every other row.
// ============================================================

import { useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AdminDisputeRow,
  AdminRefundRow,
} from '@/lib/billing/razorpay/admin-db';
import { cn } from '@/lib/utils';
import {
  accessEffectMeta,
  disputePhaseLabel,
  disputeReasonLabel,
  refundSpeedLabel,
  statusOptions,
} from './billing-labels';
import {
  COMPACT_CELL,
  FilterSelect,
  FilterToolbar,
  formatIst,
  formatMinor,
  IdCell,
  InfoHint,
  ListFrame,
  ListPagination,
  MODE_OPTIONS,
  razorpayPaymentHref,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useAdminList,
  useDebounced,
  usePagedFilters,
  WorkspaceCell,
} from './razorpay-shared';

const REFUND_STATUS = statusOptions('refund', [
  'pending',
  'processed',
  'failed',
]);

const DISPUTE_STATUS = statusOptions('dispute', [
  'open',
  'under_review',
  'won',
  'lost',
  'closed',
]);

const DISPUTE_SORT = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'respond_by:asc', label: 'Respond by, soonest' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const UNRESOLVED = new Set(['open', 'under_review']);

/** Days until `respondBy` for an unresolved dispute, else null. */
function daysToRespond(d: AdminDisputeRow, now: number): number | null {
  if (!d.respondBy || !UNRESOLVED.has(d.status)) return null;
  const t = new Date(d.respondBy).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / DAY_MS);
}

export function RazorpayRefundsDisputesPanel() {
  const [mode, setMode] = useState('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <FilterToolbar
          active={search !== '' || mode !== 'all'}
          onReset={() => {
            setSearch('');
            setMode('all');
          }}
          search={
            <SearchBox
              label="Search refunds and disputes"
              placeholder="Workspace name, or a rfnd_, disp_ or pay_ id"
              value={search}
              onChange={setSearch}
            />
          }
          filters={
            <FilterSelect
              label="Mode"
              value={mode}
              onChange={setMode}
              options={MODE_OPTIONS}
              width="w-[120px]"
            />
          }
        />
      </div>
      <RefundsTable mode={mode} search={debounced} />
      <DisputesTable mode={mode} search={debounced} />
    </div>
  );
}

function RefundsTable({ mode, search }: { mode: string; search: string }) {
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters({ status: 'all' });
  const filtered = dirty || mode !== 'all' || search !== '';
  // Back to page 1 when the shared mode or search changes.
  const filterKey = `${mode}|${search}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setPage(1);
  }
  const { data, loading, error } = useAdminList<AdminRefundRow>(
    '/api/super-admin/billing/razorpay/refunds',
    { mode, status: filters.status, search, page, pageSize }
  );
  const rows = data?.items ?? [];

  return (
    <section aria-labelledby="rzp-refunds">
      <ListFrame
        toolbar={
          <FilterToolbar
            active={dirty}
            onReset={reset}
            heading={
              <h2
                id="rzp-refunds"
                className="text-sm font-semibold text-slate-900"
              >
                Refunds
              </h2>
            }
            filters={
              <FilterSelect
                label="Refund status"
                value={filters.status}
                onChange={(v) => setFilter('status', v)}
                options={REFUND_STATUS}
                width="w-[140px]"
              />
            }
          />
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            loading={loading}
            noun="refunds"
            onPage={setPage}
            onPageSize={setPageSize}
          />
        }
      >
        {/* Fixed layout, two short lines per cell: no horizontal scroll. */}
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th className="w-[16%] px-2.5">Workspace</Th>
              <Th className="w-[16%] px-2.5">Refund</Th>
              <Th className="w-[17%] px-2.5">Payment</Th>
              <Th className="w-[12%] px-2.5 text-right">Amount</Th>
              <Th className="w-[22%] px-2.5">Access</Th>
              <Th className="w-[17%] px-2.5">Dates</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={6}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText={
                filtered ? 'No refunds match these filters.' : 'No refunds yet.'
              }
              emptyHint={
                filtered
                  ? undefined
                  : 'Refunds are made in the Razorpay Dashboard and recorded here from webhooks or a reconciliation run.'
              }
              onReset={dirty ? reset : undefined}
            />
            {error
              ? null
              : rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={cn(
                      'border-b border-slate-100 align-top',
                      r.mode === 'test' && 'bg-amber-50/20'
                    )}
                  >
                    <TableCell className={COMPACT_CELL}>
                      <WorkspaceCell name={r.accountName} mode={r.mode} />
                    </TableCell>
                    <TableCell className={COMPACT_CELL}>
                      <IdCell
                        label="Refund ID"
                        value={r.providerRefundId}
                        what="refund id"
                      />
                    </TableCell>
                    <TableCell className={COMPACT_CELL}>
                      <IdCell
                        label="Payment ID"
                        value={r.providerPaymentId}
                        what="payment id"
                        href={razorpayPaymentHref(r.providerPaymentId)}
                        hrefTitle="Open in Razorpay"
                      />
                    </TableCell>
                    <TableCell className={cn(COMPACT_CELL, 'text-right')}>
                      <p className="text-xs font-semibold text-slate-900 tabular-nums">
                        {formatMinor(r.amountMinor, r.currency)}
                      </p>
                      <StatusPill
                        domain="refund"
                        status={r.status}
                        className="mt-1"
                      />
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                        {refundSpeedLabel(r.speedProcessed, r.speedRequested)}
                      </p>
                    </TableCell>
                    <TableCell className={COMPACT_CELL}>
                      <AccessCell value={r.accessEffect} />
                    </TableCell>
                    <TableCell className={COMPACT_CELL}>
                      <p className="truncate text-xs text-slate-700 tabular-nums">
                        <span className="text-slate-400">Created </span>
                        {formatIst(r.providerCreatedAt ?? r.createdAt)}
                      </p>
                      <p
                        className={cn(
                          'truncate text-[11px] tabular-nums',
                          r.processedAt ? 'text-slate-500' : 'text-amber-700'
                        )}
                      >
                        {r.processedAt ? (
                          <>
                            <span className="text-slate-400">Processed </span>
                            {formatIst(r.processedAt)}
                          </>
                        ) : (
                          'Not processed yet'
                        )}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </ListFrame>
    </section>
  );
}

function DisputesTable({ mode, search }: { mode: string; search: string }) {
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters({ status: 'all', sort: 'created_at:desc' });
  const filtered = dirty || mode !== 'all' || search !== '';
  // Back to page 1 when the shared mode or search changes.
  const filterKey = `${mode}|${search}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setPage(1);
  }
  const [sort, dir] = filters.sort.split(':');
  const { data, loading, error } = useAdminList<AdminDisputeRow>(
    '/api/super-admin/billing/razorpay/disputes',
    { mode, status: filters.status, sort, dir, search, page, pageSize }
  );
  const rows = data?.items ?? [];
  const [now] = useState(() => Date.now());

  return (
    <section aria-labelledby="rzp-disputes">
      <ListFrame
        toolbar={
          <FilterToolbar
            active={dirty}
            onReset={reset}
            heading={
              <h2
                id="rzp-disputes"
                className="text-sm font-semibold text-slate-900"
              >
                Disputes
              </h2>
            }
            filters={
              <>
                <FilterSelect
                  label="Dispute status"
                  value={filters.status}
                  onChange={(v) => setFilter('status', v)}
                  options={DISPUTE_STATUS}
                  width="w-[140px]"
                />
                <FilterSelect
                  label="Sort disputes"
                  value={filters.sort}
                  onChange={(v) => setFilter('sort', v)}
                  options={DISPUTE_SORT}
                  width="w-[170px]"
                />
              </>
            }
          />
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            loading={loading}
            noun="disputes"
            onPage={setPage}
            onPageSize={setPageSize}
          />
        }
      >
        {/* Fixed layout, two short lines per cell: no horizontal scroll. */}
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th className="w-[16%] px-2.5">Workspace</Th>
              <Th className="w-[16%] px-2.5">Dispute</Th>
              <Th className="w-[17%] px-2.5">Payment</Th>
              <Th className="w-[14%] px-2.5 text-right">Amount</Th>
              <Th className="w-[20%] px-2.5">Reason</Th>
              <Th className="w-[17%] px-2.5">Respond by</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={6}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText={
                filtered
                  ? 'No disputes match these filters.'
                  : 'No disputes yet.'
              }
              onReset={dirty ? reset : undefined}
            />
            {error
              ? null
              : rows.map((d) => {
                  const days = daysToRespond(d, now);
                  const urgent = days !== null && days <= 3;
                  return (
                    <TableRow
                      key={d.id}
                      className={cn(
                        'border-b border-slate-100 align-top',
                        d.mode === 'test' && 'bg-amber-50/20',
                        urgent && 'bg-red-50/60'
                      )}
                    >
                      <TableCell className={COMPACT_CELL}>
                        <WorkspaceCell name={d.accountName} mode={d.mode} />
                      </TableCell>
                      <TableCell className={COMPACT_CELL}>
                        <IdCell
                          label="Dispute ID"
                          value={d.providerDisputeId}
                          what="dispute id"
                        />
                      </TableCell>
                      <TableCell className={COMPACT_CELL}>
                        <IdCell
                          label="Payment ID"
                          value={d.providerPaymentId}
                          what="payment id"
                          href={razorpayPaymentHref(d.providerPaymentId)}
                          hrefTitle="Open in Razorpay"
                        />
                      </TableCell>
                      <TableCell className={cn(COMPACT_CELL, 'text-right')}>
                        <p className="text-xs font-semibold text-slate-900 tabular-nums">
                          {formatMinor(d.amountMinor, d.currency)}
                        </p>
                        <StatusPill
                          domain="dispute"
                          status={d.status}
                          className="mt-1"
                        />
                        {d.phase ? (
                          <p className="mt-0.5 truncate text-[10px] text-slate-500">
                            {disputePhaseLabel(d.phase)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className={COMPACT_CELL}>
                        <p
                          className="line-clamp-2 text-xs text-slate-700"
                          title={disputeReasonLabel(d.reasonCode)}
                        >
                          {disputeReasonLabel(d.reasonCode)}
                        </p>
                      </TableCell>
                      <TableCell className={COMPACT_CELL}>
                        <p
                          className={cn(
                            'truncate text-xs tabular-nums',
                            urgent
                              ? 'font-semibold text-red-700'
                              : 'text-slate-700'
                          )}
                        >
                          {formatIst(d.respondBy)}
                        </p>
                        {days !== null ? (
                          <p
                            className={cn(
                              'truncate text-[11px]',
                              urgent
                                ? 'font-semibold text-red-700'
                                : 'text-slate-500'
                            )}
                          >
                            {days < 0
                              ? 'Deadline passed'
                              : days === 0
                                ? 'Due today'
                                : `Due in ${days} day${days === 1 ? '' : 's'}`}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </ListFrame>
    </section>
  );
}

/**
 * What the refund did to access. The reason sits behind an (i) button:
 * hover or focus shows it, click (or tap) pins it open.
 */
function AccessCell({ value }: { value: string | null }) {
  const meta = accessEffectMeta(value);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <p
        className={cn(
          'truncate text-xs font-medium',
          meta.tone === 'red' ? 'text-red-700' : 'text-slate-700'
        )}
      >
        {meta.label}
      </p>
      {meta.hint ? (
        <InfoHint title={meta.label} label={`Why: ${meta.label}`}>
          <p>{meta.hint}</p>
        </InfoHint>
      ) : null}
    </div>
  );
}
