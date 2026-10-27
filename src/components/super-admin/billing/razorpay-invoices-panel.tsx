'use client';

// ============================================================
// Payments › Invoices: Razorpay subscription invoices, both modes.
// ============================================================

import { useState } from 'react';
import { Repeat } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminInvoiceRow } from '@/lib/billing/razorpay/admin-db';
import { cn } from '@/lib/utils';
import { statusOptions } from './billing-labels';
import {
  COMPACT_CELL,
  FilterSelect,
  FilterToolbar,
  formatIst,
  formatMinor,
  IdCell,
  LIST_HEIGHT,
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

const STATUS_OPTIONS = statusOptions('invoice', [
  'issued',
  'paid',
  'partially_paid',
  'expired',
  'cancelled',
  'draft',
  'deleted',
]);

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'billing_end:desc', label: 'Period end, latest' },
  { value: 'amount_minor:desc', label: 'Highest amount' },
];

const COLS = 7;

export function RazorpayInvoicesPanel({
  onOpenSubscription,
}: {
  /** Opens the AutoPay drawer over this list. */
  onOpenSubscription?: (billingSubscriptionId: string) => void;
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
  } = usePagedFilters({ mode: 'all', status: 'all', sort: 'created_at:desc' });
  const [sort, dir] = filters.sort.split(':');
  const active = search !== '' || dirty;
  const resetAll = () => {
    setSearch('');
    reset();
  };

  const { data, loading, error } = useAdminList<AdminInvoiceRow>(
    '/api/super-admin/billing/razorpay/invoices',
    {
      mode: filters.mode,
      status: filters.status,
      sort,
      dir,
      search: debounced,
      page,
      pageSize,
    }
  );
  const rows = data?.items ?? [];

  return (
    <ListFrame
      className={LIST_HEIGHT}
      toolbar={
        <FilterToolbar
          active={active}
          onReset={resetAll}
          search={
            <SearchBox
              label="Search invoices"
              placeholder="Workspace name, or an inv_, sub_ or pay_ id"
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
                width="w-[140px]"
              />
              <FilterSelect
                label="Sort"
                value={filters.sort}
                onChange={(v) => setFilter('sort', v)}
                options={SORT_OPTIONS}
                width="w-[160px]"
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
          noun="invoices"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      {/* Fixed layout with two short lines per cell, so the table fits
          the page with no horizontal scroll. */}
      <Table className="table-fixed" containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
          <TableRow className="border-b border-slate-200 hover:bg-transparent">
            <Th className="w-[19%] px-2.5">Workspace</Th>
            <Th className="w-[18%] px-2.5">Invoice</Th>
            <Th className="w-[14%] px-2.5">Period</Th>
            <Th className="w-[12%] px-2.5 text-right">Amount</Th>
            <Th className="w-[16%] px-2.5">Dates</Th>
            <Th className="w-[18%] px-2.5">Payment</Th>
            <Th className="w-10 px-2.5">
              <span className="sr-only">AutoPay</span>
            </Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableStateRow
            colSpan={COLS}
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={
              active ? 'No invoices match these filters.' : 'No invoices yet.'
            }
            emptyHint={
              active
                ? undefined
                : 'Razorpay issues an invoice for each AutoPay charge; they appear here from webhooks or a reconciliation run.'
            }
            onReset={active ? resetAll : undefined}
          />
          {error
            ? null
            : rows.map((inv) => (
                <TableRow
                  key={inv.id}
                  className={cn(
                    'border-b border-slate-100 align-top',
                    inv.mode === 'test' && 'bg-amber-50/20'
                  )}
                >
                  <TableCell className={COMPACT_CELL}>
                    <WorkspaceCell name={inv.accountName} mode={inv.mode} />
                  </TableCell>
                  <TableCell className={COMPACT_CELL}>
                    <IdCell
                      label="Invoice ID"
                      value={inv.providerInvoiceId}
                      what="invoice id"
                      href={inv.shortUrl}
                      hrefTitle="Open invoice"
                    />
                  </TableCell>
                  <TableCell className={COMPACT_CELL}>
                    {inv.billingStart || inv.billingEnd ? (
                      <>
                        <p className="truncate text-xs text-slate-700 tabular-nums">
                          {formatIst(inv.billingStart)}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 tabular-nums">
                          to {formatIst(inv.billingEnd)}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(COMPACT_CELL, 'text-right')}
                    title={
                      inv.taxAmountMinor
                        ? `Tax ${formatMinor(inv.taxAmountMinor, inv.currency)}`
                        : undefined
                    }
                  >
                    <p className="text-xs font-semibold text-slate-900 tabular-nums">
                      {formatMinor(inv.amountMinor, inv.currency)}
                    </p>
                    <StatusPill
                      domain="invoice"
                      status={inv.status}
                      className="mt-1"
                    />
                    {inv.amountDueMinor > 0 ? (
                      <p className="mt-0.5 text-[10px] font-medium text-amber-700 tabular-nums">
                        Due {formatMinor(inv.amountDueMinor, inv.currency)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className={COMPACT_CELL}>
                    <p className="truncate text-xs text-slate-700 tabular-nums">
                      <span className="text-slate-400">Issued </span>
                      {formatIst(inv.issuedAt)}
                    </p>
                    <p
                      className={cn(
                        'truncate text-[11px] tabular-nums',
                        inv.paidAt ? 'text-slate-500' : 'text-amber-700'
                      )}
                    >
                      {inv.paidAt ? (
                        <>
                          <span className="text-slate-400">Paid </span>
                          {formatIst(inv.paidAt)}
                        </>
                      ) : inv.expiredAt ? (
                        `Expired ${formatIst(inv.expiredAt)}`
                      ) : (
                        'Not paid'
                      )}
                    </p>
                  </TableCell>
                  <TableCell className={COMPACT_CELL}>
                    <IdCell
                      label="Payment ID"
                      value={inv.providerPaymentId}
                      what="payment id"
                      href={razorpayPaymentHref(inv.providerPaymentId)}
                      hrefTitle="Open in Razorpay"
                    />
                  </TableCell>
                  <TableCell className={cn(COMPACT_CELL, 'px-1 text-right')}>
                    {inv.subscriptionId && onOpenSubscription ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open AutoPay for invoice ${inv.providerInvoiceId}`}
                        title="Open AutoPay"
                        onClick={() =>
                          onOpenSubscription(inv.subscriptionId as string)
                        }
                      >
                        <Repeat aria-hidden />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </ListFrame>
  );
}
