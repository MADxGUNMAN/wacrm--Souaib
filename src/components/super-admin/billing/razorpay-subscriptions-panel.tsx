'use client';

// ============================================================
// Subscriptions › AutoPay mandates: every billing_subscriptions row,
// both modes.
//
// Opening a row writes `?sub=<id>` to the URL (via the page), so a
// subscription can be linked to from Workspaces and survives a reload.
// ============================================================

import { useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminSubscriptionRow } from '@/lib/billing/razorpay/admin-db';
import {
  BILLING_SUBSCRIPTION_STATUSES,
  PAYMENT_METHODS,
} from '@/lib/billing/razorpay/admin-status';
import { cn } from '@/lib/utils';
import { methodLabel, statusOptions } from './billing-labels';
import {
  CopyId,
  FilterSelect,
  FilterToolbar,
  formatIst,
  formatMinor,
  ListFrame,
  ListPagination,
  methodText,
  MODE_OPTIONS,
  ModeBadge,
  RazorpayLink,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useAdminList,
  useDebounced,
  usePagedFilters,
} from './razorpay-shared';

const [ALL_STATUSES, ...STATUS_VALUE_OPTIONS] = statusOptions(
  'subscription',
  BILLING_SUBSCRIPTION_STATUSES
);

const STATUS_OPTIONS = [
  ALL_STATUSES,
  // Every status that has not ended yet (LIVE_AUTOPAY_STATUSES).
  { value: 'live', label: 'Not ended yet' },
  ...STATUS_VALUE_OPTIONS,
];

const METHOD_OPTIONS = [
  { value: 'all', label: 'All methods' },
  ...PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) })),
];

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'charge_at:asc', label: 'Next charge, soonest' },
  { value: 'status_changed_at:desc', label: 'Status changed, latest' },
  { value: 'amount_minor:desc', label: 'Highest amount' },
];

export function RazorpaySubscriptionsPanel({
  selectedId,
  onOpen,
  reloadKey,
  className,
}: {
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** Bumped by the page after a drawer action, to refetch the list. */
  reloadKey: number;
  className?: string;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters({
    mode: 'all',
    status: 'all',
    method: 'all',
    sort: 'created_at:desc',
  });
  const [sort, dir] = filters.sort.split(':');
  const active = search !== '' || dirty;
  const resetAll = () => {
    setSearch('');
    reset();
  };

  const { data, loading, error } = useAdminList<AdminSubscriptionRow>(
    '/api/super-admin/billing/razorpay/subscriptions',
    {
      mode: filters.mode,
      status: filters.status,
      method: filters.method,
      sort,
      dir,
      search: debounced,
      page,
      pageSize,
      // Not read by the server; changes the URL so the hook refetches.
      _r: reloadKey || null,
    }
  );
  const rows = data?.items ?? [];

  return (
    <ListFrame
      className={className ?? 'h-[calc(100vh-13rem)] min-h-[420px]'}
      toolbar={
        <FilterToolbar
          active={active}
          onReset={resetAll}
          search={
            <SearchBox
              label="Search AutoPay mandates"
              placeholder="Workspace name, or a sub_, plan_ or cust_ id"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
          }
          filters={
            <>
              <FilterSelect
                label="Mode"
                value={filters.mode}
                onChange={(v) => setFilter('mode', v)}
                options={MODE_OPTIONS}
                width="w-[120px]"
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(v) => setFilter('status', v)}
                options={STATUS_OPTIONS}
                width="w-[170px]"
              />
              <FilterSelect
                label="Method"
                value={filters.method}
                onChange={(v) => setFilter('method', v)}
                options={METHOD_OPTIONS}
                width="w-[130px]"
              />
              <FilterSelect
                label="Sort"
                value={filters.sort}
                onChange={(v) => setFilter('sort', v)}
                options={SORT_OPTIONS}
                width="w-[180px]"
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
          noun="AutoPay mandates"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      <Table containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
          <TableRow className="border-b border-slate-200 hover:bg-transparent">
            <Th>Workspace</Th>
            <Th>Plan</Th>
            <Th className="text-right">Amount</Th>
            <Th>Status</Th>
            <Th>Method</Th>
            <Th>Next charge</Th>
            <Th>Cycle ends</Th>
            <Th>Razorpay id</Th>
            <Th className="text-right">Details</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableStateRow
            colSpan={9}
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={
              active
                ? 'No AutoPay mandates match these filters.'
                : 'No AutoPay mandates yet.'
            }
            emptyHint={
              active
                ? undefined
                : 'A mandate appears here when a customer starts AutoPay checkout.'
            }
            onReset={active ? resetAll : undefined}
          />
          {error
            ? null
            : rows.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className={cn(
                    'cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/80',
                    r.mode === 'test' && 'bg-amber-50/20',
                    selectedId === r.id && 'bg-slate-100/80'
                  )}
                >
                  <TableCell className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className="max-w-[160px] truncate text-xs font-semibold text-slate-800">
                        {r.accountName ?? 'Deleted workspace'}
                      </p>
                      {r.mode === 'test' ? <ModeBadge mode="test" /> : null}
                    </div>
                    {r.anomaly ? (
                      <p
                        title={r.anomaly}
                        className="mt-0.5 max-w-[200px] truncate text-[10px] font-medium text-amber-700"
                      >
                        Anomaly: {r.anomaly}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <p className="text-xs font-medium text-slate-800">
                      {r.planName}
                    </p>
                    {r.cycleLabel ? (
                      <p className="text-[10px] text-slate-400">
                        {r.cycleLabel}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-right text-xs font-medium whitespace-nowrap text-slate-800 tabular-nums">
                    {formatMinor(r.amountMinor, r.currency)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <StatusPill domain="subscription" status={r.status} />
                    {r.cancelAtCycleEnd ? (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Cancels at cycle end
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-xs text-slate-600">
                    {methodText(r.paymentMethod, r.methodSummary)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-xs whitespace-nowrap text-slate-600">
                    {formatIst(r.chargeAt)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-xs whitespace-nowrap text-slate-600">
                    {formatIst(r.currentEnd)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    {r.providerSubscriptionId ? (
                      <div className="space-y-0.5">
                        <CopyId
                          value={r.providerSubscriptionId}
                          label="Razorpay subscription id"
                        />
                        <RazorpayLink
                          kind="subscription"
                          id={r.providerSubscriptionId}
                        />
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Not created at Razorpay
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.id);
                      }}
                      aria-label={`Open details for ${r.accountName ?? 'this workspace'}, ${r.planName}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Details
                    </button>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </ListFrame>
  );
}
