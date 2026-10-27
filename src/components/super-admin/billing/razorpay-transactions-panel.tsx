'use client';

// ============================================================
// Payments › Transactions: every stored Razorpay payment, both modes.
//
// Failed payments show Razorpay's own error code and reason in the row,
// because "failed" alone does not tell an operator whether to chase the
// customer (insufficient funds) or Razorpay (a server error).
//
// The row holds what is needed to scan the list. Secondary fields
// (invoice, AutoPay, period, kind, fee, card, error source, capture and
// access times) sit one click away in the expandable details row.
// ============================================================

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminPaymentRow } from '@/lib/billing/razorpay/admin-db';
import { cn } from '@/lib/utils';
import {
  methodLabel,
  paymentKindLabel,
  sentenceCase,
  statusOptions,
} from './billing-labels';
import {
  adminPaymentMethodText,
  adminPaymentPeriodText,
  CopyId,
  FilterSelect,
  FilterToolbar,
  formatIst,
  formatMinor,
  LIST_HEIGHT,
  ListFrame,
  ListPagination,
  MODE_OPTIONS,
  ModeBadge,
  PaymentChargeCell,
  RazorpayLink,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useAdminList,
  useDebounced,
  usePagedFilters,
} from './razorpay-shared';

const STATUS_OPTIONS = statusOptions('payment', [
  'captured',
  'authorized',
  'created',
  'failed',
  'refunded',
]);

const KIND_OPTIONS = [
  { value: 'all', label: 'All kinds' },
  ...['authorization', 'charge', 'upfront', 'unknown'].map((k) => ({
    value: k,
    label: paymentKindLabel(k),
  })),
];

const METHOD_OPTIONS = [
  { value: 'all', label: 'All methods' },
  ...['card', 'upi', 'emandate', 'nach', 'netbanking', 'wallet'].map((m) => ({
    value: m,
    label: methodLabel(m),
  })),
];

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'amount_minor:desc', label: 'Highest amount' },
  { value: 'captured_at:desc', label: 'Captured, latest' },
];

const COLS = 9;

export function RazorpayTransactionsPanel({
  onOpenSubscription,
}: {
  /** Opens the AutoPay drawer over this list. */
  onOpenSubscription?: (billingSubscriptionId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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
    kind: 'all',
    method: 'all',
    sort: 'created_at:desc',
  });
  const [sort, dir] = filters.sort.split(':');
  const active = search !== '' || dirty;
  const resetAll = () => {
    setSearch('');
    reset();
  };

  const { data, loading, error } = useAdminList<AdminPaymentRow>(
    '/api/super-admin/billing/razorpay/transactions',
    {
      mode: filters.mode,
      status: filters.status,
      kind: filters.kind,
      method: filters.method,
      sort,
      dir,
      search: debounced,
      page,
      pageSize,
    }
  );
  const rows = data?.items ?? [];

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ListFrame
      className={LIST_HEIGHT}
      toolbar={
        <FilterToolbar
          active={active}
          onReset={resetAll}
          search={
            <SearchBox
              label="Search transactions"
              placeholder="Workspace name, or a pay_ or sub_ id"
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
                width="w-[130px]"
              />
              <FilterSelect
                label="Kind"
                value={filters.kind}
                onChange={(v) => setFilter('kind', v)}
                options={KIND_OPTIONS}
                width="w-[150px]"
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
                width="w-[150px]"
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
          noun="payments"
          onPage={setPage}
          onPageSize={setPageSize}
        />
      }
    >
      <Table containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
          <TableRow className="border-b border-slate-200 hover:bg-transparent">
            <Th>Workspace</Th>
            <Th>Payment</Th>
            <Th>Charge</Th>
            <Th>Status</Th>
            <Th className="text-right">Amount</Th>
            <Th>Method</Th>
            <Th>Error</Th>
            <Th>Created</Th>
            <Th className="text-right">Details</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableStateRow
            colSpan={COLS}
            loading={loading}
            error={error}
            empty={rows.length === 0}
            emptyText={
              active ? 'No payments match these filters.' : 'No payments yet.'
            }
            emptyHint={
              active
                ? undefined
                : 'Razorpay payments appear here after a checkout, a charge or a reconciliation run.'
            }
            onReset={active ? resetAll : undefined}
          />
          {error
            ? null
            : rows.map((p) => {
                const open = expanded.has(p.id);
                const detailsId = `payment-details-${p.id}`;
                return (
                  <Fragment key={p.id}>
                    <TableRow
                      className={cn(
                        'border-b border-slate-100 align-top',
                        p.mode === 'test' && 'bg-amber-50/20',
                        open && 'border-b-0'
                      )}
                    >
                      <TableCell className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <p className="max-w-[150px] truncate text-xs font-semibold text-slate-800">
                            {p.accountName ?? 'Deleted workspace'}
                          </p>
                          {p.mode === 'test' ? <ModeBadge mode="test" /> : null}
                        </div>
                        {p.anomaly ? (
                          <p
                            title={p.anomaly}
                            className="mt-0.5 max-w-[180px] truncate text-[10px] font-medium text-amber-700"
                          >
                            Anomaly: {p.anomaly}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="space-y-0.5">
                          <CopyId
                            value={p.providerPaymentId}
                            label="payment id"
                          />
                          <RazorpayLink
                            kind="payment"
                            id={p.providerPaymentId}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <PaymentChargeCell payment={p} />
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <StatusPill domain="payment" status={p.status} />
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right text-xs whitespace-nowrap text-slate-800 tabular-nums">
                        {formatMinor(p.amountMinor, p.currency)}
                        {p.amountRefundedMinor > 0 ? (
                          <span className="block text-[10px] text-slate-500">
                            {formatMinor(p.amountRefundedMinor, p.currency)}{' '}
                            refunded
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-600">
                        {adminPaymentMethodText(p)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {p.errorCode || p.errorDescription || p.errorReason ? (
                          <div className="max-w-[240px] text-[11px] text-red-700">
                            <p className="font-medium">
                              {[p.errorCode, p.errorReason]
                                .filter(Boolean)
                                .join(': ')}
                            </p>
                            {p.errorDescription ? (
                              <p
                                title={p.errorDescription}
                                className="line-clamp-2 break-words text-red-600"
                              >
                                {p.errorDescription}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[11px] whitespace-nowrap text-slate-500">
                        {formatIst(p.providerCreatedAt ?? p.createdAt, {
                          time: true,
                        })}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={open}
                          aria-controls={detailsId}
                          aria-label={`Show details for ${p.providerPaymentId}`}
                          onClick={() => toggle(p.id)}
                        >
                          {open ? (
                            <ChevronDown aria-hidden />
                          ) : (
                            <ChevronRight aria-hidden />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow
                        id={detailsId}
                        className={cn(
                          'border-b border-slate-100 hover:bg-transparent',
                          p.mode === 'test'
                            ? 'bg-amber-50/20'
                            : 'bg-slate-50/60'
                        )}
                      >
                        <TableCell
                          colSpan={COLS}
                          className="px-3 pt-0 pb-3 whitespace-normal"
                        >
                          <PaymentDetails
                            payment={p}
                            onOpenSubscription={onOpenSubscription}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
        </TableBody>
      </Table>
    </ListFrame>
  );
}

/** The secondary fields of one Razorpay payment (also used by All payments). */
export function PaymentDetails({
  payment: p,
  onOpenSubscription,
}: {
  payment: AdminPaymentRow;
  onOpenSubscription?: (billingSubscriptionId: string) => void;
}) {
  const fee =
    p.feeMinor === null && p.taxMinor === null
      ? '—'
      : `${formatMinor(p.feeMinor, p.currency)} / ${formatMinor(p.taxMinor, p.currency)}`;
  const errorSource =
    p.errorSource || p.errorStep
      ? [p.errorSource, p.errorStep]
          .filter(Boolean)
          .map((v) => sentenceCase(v).toLowerCase())
          .join(' at ')
      : null;
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <Item label="Invoice">
        {p.providerInvoiceId ? (
          <CopyId value={p.providerInvoiceId} label="invoice id" />
        ) : p.chargeType === 'card_verification' ? (
          'Not issued (AutoPay setup check)'
        ) : (
          'Not issued'
        )}
      </Item>
      <Item label="AutoPay">
        {p.providerSubscriptionId ? (
          <span className="flex flex-wrap items-center gap-2">
            <CopyId value={p.providerSubscriptionId} label="subscription id" />
            {p.subscriptionId && onOpenSubscription ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => onOpenSubscription(p.subscriptionId as string)}
              >
                Open AutoPay
              </Button>
            ) : null}
          </span>
        ) : (
          '—'
        )}
      </Item>
      <Item label="Period covered">
        {adminPaymentPeriodText(p) ?? 'Not applied yet'}
      </Item>
      <Item label="Kind">{paymentKindLabel(p.kind)}</Item>
      <Item label="Fee / tax">{fee}</Item>
      {p.method === 'card' ? (
        <Item label="Card">
          {[p.cardIssuer, p.cardType].filter(Boolean).join(' · ') || '—'}
        </Item>
      ) : null}
      {errorSource ? (
        <Item label="Error source">
          {errorSource.charAt(0).toUpperCase() + errorSource.slice(1)}
        </Item>
      ) : null}
      <Item label="Captured">
        {p.capturedAt ? formatIst(p.capturedAt, { time: true }) : '—'}
      </Item>
      <Item label="Access applied">
        {p.accessAppliedAt
          ? formatIst(p.accessAppliedAt, { time: true })
          : 'Not applied'}
      </Item>
    </dl>
  );
}

function Item({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-slate-700">{children}</dd>
    </div>
  );
}
