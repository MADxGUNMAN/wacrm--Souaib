'use client';

// ============================================================
// Manual UPI: the manual payment verification queue.
//
// Reviewed rows are read-only; Approve and Reject exist only on rows
// still `pending`, which once an account is on Razorpay can only be rows
// pending at cutover (its manual POST answers 410). The server's
// `manualIntake` sets the section label ("Manual UPI (history)" unless
// intake is open) and the notice above the list. Production still takes
// manual UPI (`open`), so the queue works exactly as before.
//
// The queue opens on "all statuses" and switches to "pending" on the
// first load when something is waiting, so action items are not buried.
// An amount mismatch is flagged in the row itself, not only in the
// drawer, because approving an underpayment is the costly mistake.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ManualIntake } from '@/lib/billing/razorpay/provider';
import { formatMoneyMajor } from '@/lib/billing/money-format';
import { cn } from '@/lib/utils';
import type { AdminPaymentRequest } from '@/types/super-admin';
import { PaymentRequestDrawer } from './payment-request-drawer';
import {
  errorMessage,
  FilterSelect,
  FilterToolbar,
  formatIst,
  ListFrame,
  LIST_HEIGHT,
  ListPagination,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useDebounced,
} from './razorpay-shared';

export interface ManualCounts {
  pending: number;
  approved: number;
  rejected: number;
}

export function readManualIntake(value: unknown): ManualIntake | null {
  return value === 'open' || value === 'partial' || value === 'retired'
    ? value
    : null;
}

export const MANUAL_INTAKE_NOTICE: Record<ManualIntake, string | null> = {
  open: null,
  partial:
    'Accounts on Razorpay AutoPay on this server can no longer pay by manual UPI. Other accounts still can.',
  retired:
    'Manual UPI payments are retired. This list is history. Approve and Reject stay available only for requests that were still pending at cutover.',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount', label: 'Highest amount' },
];

const COLS = 8;

export function ManualPaymentsPanel({
  onCountsChange,
  manualIntake,
  onManualIntakeChange,
}: {
  onCountsChange: (counts: ManualCounts) => void;
  manualIntake: ManualIntake | null;
  onManualIntakeChange: (intake: ManualIntake | null) => void;
}) {
  const [requests, setRequests] = useState<AdminPaymentRequest[]>([]);
  const [counts, setCounts] = useState<ManualCounts>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [selected, setSelected] = useState<AdminPaymentRequest | null>(null);

  // Back to page 1 when the settled search changes.
  const [seenSearch, setSeenSearch] = useState(debounced);
  if (seenSearch !== debounced) {
    setSeenSearch(debounced);
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        sortBy,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debounced) params.set('search', debounced);

      const res = await fetch(
        `/api/super-admin/billing/payment-requests?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(res.status, data));
        return;
      }

      const nextCounts: ManualCounts = {
        pending: data.counts?.pending ?? 0,
        approved: data.counts?.approved ?? 0,
        rejected: data.counts?.rejected ?? 0,
      };
      setRequests(data.requests ?? []);
      setCounts(nextCounts);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      onCountsChange(nextCounts);
      onManualIntakeChange(readManualIntake(data.manualIntake));
      setError(null);

      // On the very first load, if pending requests exist, switch to
      // the pending queue so action items are front and centre.
      if (!initialLoadDone) {
        setInitialLoadDone(true);
        if (nextCounts.pending > 0 && status === 'all') {
          setStatus('pending');
          // The status change re-fetches via the effect below.
          return;
        }
      }
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [
    status,
    sortBy,
    page,
    pageSize,
    debounced,
    onCountsChange,
    onManualIntakeChange,
    initialLoadDone,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const allCount = initialLoadDone
    ? counts.pending + counts.approved + counts.rejected
    : null;
  const statusOptions = [
    {
      value: 'all',
      label: 'All statuses',
      count: allCount,
    },
    {
      value: 'pending',
      label: 'Pending review',
      count: initialLoadDone ? counts.pending : null,
    },
    {
      value: 'approved',
      label: 'Approved',
      count: initialLoadDone ? counts.approved : null,
    },
    {
      value: 'rejected',
      label: 'Rejected',
      count: initialLoadDone ? counts.rejected : null,
    },
  ];

  const intakeNotice = manualIntake ? MANUAL_INTAKE_NOTICE[manualIntake] : null;
  const active = search !== '' || status !== 'all' || sortBy !== 'newest';
  const resetAll = () => {
    setSearch('');
    setStatus('all');
    setSortBy('newest');
    setPage(1);
  };
  const pickStatus = (next: string) => {
    setStatus(next);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {intakeNotice ? (
        <p
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {intakeNotice}
        </p>
      ) : null}

      <ListFrame
        className={
          intakeNotice ? 'h-[calc(100vh-15.5rem)] min-h-[380px]' : LIST_HEIGHT
        }
        toolbar={
          <FilterToolbar
            active={active}
            onReset={resetAll}
            search={
              <SearchBox
                label="Search manual payments"
                placeholder="UTR, payer name, mobile or plan"
                value={search}
                onChange={setSearch}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Status"
                  value={status}
                  onChange={pickStatus}
                  options={statusOptions}
                  width="w-[185px]"
                />
                <FilterSelect
                  label="Sort"
                  value={sortBy}
                  onChange={(v) => {
                    setSortBy(v);
                    setPage(1);
                  }}
                  options={SORT_OPTIONS}
                  width="w-[140px]"
                />
              </>
            }
          />
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            loading={loading}
            noun="requests"
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        }
      >
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th>Workspace</Th>
              <Th>Plan</Th>
              <Th className="text-right">Amount</Th>
              <Th>UTR</Th>
              <Th>Payer</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th className="text-right">Action</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={COLS}
              loading={loading}
              error={error}
              empty={requests.length === 0}
              emptyText={
                active
                  ? 'No payment requests match these filters.'
                  : 'No payment requests yet.'
              }
              emptyHint={
                active
                  ? undefined
                  : 'Submissions from the upgrade page land in this queue.'
              }
              onReset={active ? resetAll : undefined}
            />
            {error
              ? null
              : requests.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={cn(
                      'cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/80',
                      r.status === 'pending' && 'bg-amber-50/30'
                    )}
                  >
                    <TableCell className="px-3 py-1.5">
                      <p className="max-w-[150px] truncate text-xs font-semibold text-slate-800">
                        {r.account_name ?? 'Unknown workspace'}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <p className="text-xs leading-tight font-medium text-slate-800">
                        {r.plan_name_snapshot}
                      </p>
                      <p className="text-[10px] leading-tight text-slate-400">
                        {r.cycle_label_snapshot}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-right">
                      <span
                        className={cn(
                          'text-xs font-semibold whitespace-nowrap tabular-nums',
                          r.amount_matches ? 'text-slate-800' : 'text-red-600'
                        )}
                      >
                        {formatMoneyMajor(r.paid_amount, r.currency)}
                      </span>
                      {!r.amount_matches ? (
                        <p className="text-[10px] leading-tight font-medium whitespace-nowrap text-red-600">
                          Expected{' '}
                          {formatMoneyMajor(r.expected_amount, r.currency)},{' '}
                          {r.amount_difference < 0 ? 'short' : 'over'} by{' '}
                          {formatMoneyMajor(
                            Math.abs(r.amount_difference),
                            r.currency
                          )}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <code className="font-mono text-xs text-slate-600">
                        {r.transaction_ref}
                      </code>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <p className="max-w-[130px] truncate text-xs font-medium text-slate-700">
                        {r.payer_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {r.payer_mobile}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <StatusPill domain="manual" status={r.status} />
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <span
                        className="text-[11px] whitespace-nowrap text-slate-500"
                        title={formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                        })}
                      >
                        {formatIst(r.created_at, { time: true })}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-right">
                      <Button
                        variant={r.status === 'pending' ? 'outline' : 'ghost'}
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                        aria-label={`${r.status === 'pending' ? 'Review' : 'View'} payment ${r.transaction_ref}`}
                      >
                        {r.status === 'pending' ? 'Review' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </ListFrame>

      {selected ? (
        <PaymentRequestDrawer
          request={selected}
          onClose={() => setSelected(null)}
          onReviewed={load}
        />
      ) : null}
    </div>
  );
}
