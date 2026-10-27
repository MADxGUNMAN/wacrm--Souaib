'use client';

// ============================================================
// Payments › All payments: one read-only ledger of every payment, both
// Razorpay AutoPay (billing_payments) and manual UPI (payment_requests),
// each row labelled with its channel. This is the answer to "which
// payment was made how": before it, Razorpay payments lived in
// Transactions and manual UPI payments in the Manual UPI queue, and
// nothing put them side by side.
//
// Read-only. Details opens the existing views: a Razorpay row expands to
// the same payment details as Transactions (with Open AutoPay), a manual
// row opens the Manual UPI review drawer. Filters run on the server, so
// the channel strip and the row count agree with the table.
// ============================================================

import { Fragment, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LedgerChannel, LedgerRow } from '@/lib/billing/ledger';
import {
  LEDGER_STATUSES,
  type LedgerStatus,
} from '@/lib/billing/ledger-status';
import { formatMoneyMinor } from '@/lib/billing/money-format';
import { cn } from '@/lib/utils';
import { CHANNEL_META, statusOptions } from './billing-labels';
import { ChannelBadge } from './channel-badge';
import { useManualRequestOpener } from './manual-request-opener';
import {
  adminPaymentMethodText,
  COMPACT_CELL,
  DateTimeCell,
  FilterSelect,
  FilterToolbar,
  formatIst,
  IdCell,
  LIST_HEIGHT,
  ListFrame,
  ListPagination,
  ModeBadge,
  razorpayPaymentHref,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useAdminJson,
  useDebounced,
  usePagedFilters,
} from './razorpay-shared';
import { PaymentDetails } from './razorpay-transactions-panel';

interface LedgerResponse {
  items: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    channel: Record<LedgerChannel, number>;
    status: Record<LedgerStatus, number>;
  };
  truncated: boolean;
}

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'razorpay', label: CHANNEL_META.razorpay.label },
  { value: 'manual_upi', label: CHANNEL_META.manual_upi.label },
];

const STATUS_OPTIONS = statusOptions('ledger', LEDGER_STATUSES);

const MODE_OPTIONS = [
  { value: 'all', label: 'All modes' },
  { value: 'live', label: 'Live only' },
  { value: 'test', label: 'Test only' },
];

const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Highest amount' },
];

const COLS = 9;

/** Shared cell padding: two short lines per cell, aligned to the top. */
const CELL = COMPACT_CELL;

type TypeKey = LedgerRow['type'];

/**
 * Short, plain type labels for the table. The full meaning is in the
 * tooltip, so the column stays narrow.
 */
const TYPE_META: Record<TypeKey, { label: string; hint: string }> = {
  card_verification: {
    label: 'Setup check',
    hint: 'AutoPay setup check: a small verification charge when the customer sets up AutoPay. Razorpay refunds it automatically.',
  },
  first_payment: {
    label: 'First charge',
    hint: 'The first plan charge on this AutoPay.',
  },
  renewal: {
    label: 'Renewal',
    hint: 'An automatic renewal charge on an existing AutoPay.',
  },
  manual_payment: {
    label: 'One-time',
    hint: 'A one-time manual UPI payment that the customer paid by QR and an admin reviewed.',
  },
};

function typeKey(row: LedgerRow): TypeKey {
  return row.type in TYPE_META ? row.type : 'first_payment';
}

/**
 * Method on two lines: the kind ("UPI", "Visa") and the masked account
 * ("te****@razorpay", "•••• 4366").
 */
function methodLines(row: LedgerRow): {
  primary: string;
  secondary: string | null;
} {
  if (!row.razorpay) {
    return {
      primary: 'UPI QR',
      secondary: row.methodDetail.payerUpiId ?? null,
    };
  }
  const text = adminPaymentMethodText(row.razorpay).trim();
  const space = text.indexOf(' ');
  if (space < 0) return { primary: text, secondary: null };
  return { primary: text.slice(0, space), secondary: text.slice(space + 1) };
}

export function PaymentsLedgerPanel({
  initialStatus,
  initialChannel,
  initialMode,
  onOpenSubscription,
}: {
  /** A preset from the Overview, for example "failed". */
  initialStatus?: string;
  initialChannel?: string;
  /** Razorpay mode preset ("live" or "test") from an Overview tile. */
  initialMode?: string;
  /** Opens the AutoPay drawer for a billing_subscriptions id. */
  onOpenSubscription?: (billingSubscriptionId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters(
    { channel: 'all', status: 'all', mode: 'all', sort: 'date:desc' },
    {
      ...(initialChannel ? { channel: initialChannel } : {}),
      ...(initialStatus ? { status: initialStatus } : {}),
      ...(initialMode ? { mode: initialMode } : {}),
    }
  );
  const active = search !== '' || dirty;
  const resetAll = () => {
    setSearch('');
    reset();
  };

  const qs = new URLSearchParams({
    channel: filters.channel,
    status: filters.status,
    mode: filters.mode,
    sort: filters.sort,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (debounced) qs.set('search', debounced);
  const { data, loading, error, reload } = useAdminJson<LedgerResponse>(
    `/api/super-admin/billing/ledger?${qs.toString()}`
  );
  const rows = data?.items ?? [];
  const manual = useManualRequestOpener(reload);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      {data?.truncated ? (
        <p
          role="note"
          className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Showing the newest 10,000 of each channel.
        </p>
      ) : null}

      <ListFrame
        className={LIST_HEIGHT}
        toolbar={
          <FilterToolbar
            active={active}
            onReset={resetAll}
            search={
              <SearchBox
                label="Search payments"
                placeholder="Workspace, email, pay_ id or UTR"
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
                  label="Channel"
                  value={filters.channel}
                  onChange={(v) => setFilter('channel', v)}
                  options={CHANNEL_OPTIONS}
                  width="w-[160px]"
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  onChange={(v) => setFilter('status', v)}
                  options={STATUS_OPTIONS}
                  width="w-[150px]"
                />
                <FilterSelect
                  label="Razorpay mode"
                  value={filters.mode}
                  onChange={(v) => setFilter('mode', v)}
                  options={MODE_OPTIONS}
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
            page={data?.page ?? page}
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
        {/* Fixed layout: column widths come from the header, and every cell
            stacks its values on two short lines instead of one long one,
            so the table fits the page with no horizontal scroll. */}
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th className="w-[10%] px-2.5">Date</Th>
              <Th className="w-[16%] px-2.5">Workspace</Th>
              <Th className="w-[13%] px-2.5">Payment</Th>
              <Th className="w-[9%] px-2.5">Plan</Th>
              <Th className="w-[11%] px-2.5">Period</Th>
              <Th className="w-[10%] px-2.5 text-right">Amount</Th>
              <Th className="w-[13%] px-2.5">Method</Th>
              <Th className="w-[14%] px-2.5">Reference</Th>
              <Th className="w-10 px-2.5">
                <span className="sr-only">Details</span>
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
                active
                  ? 'No payments match these filters.'
                  : 'No payments recorded yet.'
              }
              emptyHint={
                active
                  ? undefined
                  : 'Razorpay AutoPay payments and manual UPI payments both appear here.'
              }
              onReset={active ? resetAll : undefined}
            />
            {error
              ? null
              : rows.map((r) => {
                  const open = expanded.has(r.key);
                  const detailsId = `ledger-details-${r.key}`;
                  const plan = [r.planName, r.cycleLabel]
                    .filter(Boolean)
                    .join(' · ');
                  const mismatch =
                    r.expectedMinor !== null &&
                    r.expectedMinor !== r.amountMinor;
                  return (
                    <Fragment key={r.key}>
                      <TableRow
                        className={cn(
                          'border-b border-slate-100 align-top',
                          r.mode === 'test' && 'bg-amber-50/20',
                          open && 'border-b-0'
                        )}
                      >
                        {/* Date / time */}
                        <TableCell className={CELL}>
                          <DateTimeCell value={r.date} />
                        </TableCell>
                        {/* Workspace / owner */}
                        <TableCell className={CELL}>
                          <p
                            className="truncate text-xs font-semibold text-slate-800"
                            title={r.accountName ?? undefined}
                          >
                            {r.accountName ?? 'Deleted workspace'}
                          </p>
                          {r.ownerEmail ? (
                            <p
                              className="truncate text-[11px] text-slate-500"
                              title={r.ownerEmail}
                            >
                              {r.ownerEmail}
                            </p>
                          ) : null}
                        </TableCell>
                        {/* What kind of payment, and how it was paid */}
                        <TableCell className={CELL}>
                          <p
                            className="truncate text-xs font-medium text-slate-800"
                            title={TYPE_META[typeKey(r)].hint}
                          >
                            {TYPE_META[typeKey(r)].label}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <ChannelBadge
                              channel={r.channel}
                              size="sm"
                              label={
                                r.channel === 'razorpay' ? 'AutoPay' : 'UPI QR'
                              }
                            />
                            {r.mode ? <ModeBadge mode={r.mode} /> : null}
                          </div>
                        </TableCell>
                        {/* Plan / cycle */}
                        <TableCell className={CELL}>
                          {r.planName || r.cycleLabel ? (
                            <>
                              <p
                                className="truncate text-xs font-medium text-slate-800"
                                title={plan}
                              >
                                {r.planName ?? '—'}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {r.cycleLabel ?? ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        {/* Period covered: from / to */}
                        <TableCell className={CELL}>
                          {r.periodFrom && r.periodTo ? (
                            <>
                              <p className="truncate text-xs text-slate-700 tabular-nums">
                                {formatIst(r.periodFrom)}
                              </p>
                              <p className="truncate text-[11px] text-slate-500 tabular-nums">
                                to {formatIst(r.periodTo)}
                              </p>
                            </>
                          ) : (
                            <span
                              className="text-xs text-slate-400"
                              title="This payment has not added any access time"
                            >
                              None
                            </span>
                          )}
                        </TableCell>
                        {/* Amount / status */}
                        <TableCell className={cn(CELL, 'text-right')}>
                          <p className="text-xs font-semibold text-slate-900 tabular-nums">
                            {formatMoneyMinor(r.amountMinor, r.currency)}
                          </p>
                          <StatusPill
                            domain="ledger"
                            status={r.status}
                            className="mt-1"
                          />
                          {r.refundedMinor > 0 &&
                          r.refundedMinor < r.amountMinor ? (
                            <p className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                              {formatMoneyMinor(r.refundedMinor, r.currency)}{' '}
                              refunded
                            </p>
                          ) : null}
                          {mismatch ? (
                            <p className="mt-0.5 text-[10px] text-amber-700 tabular-nums">
                              Expected{' '}
                              {formatMoneyMinor(r.expectedMinor, r.currency)}
                            </p>
                          ) : null}
                        </TableCell>
                        {/* Method / account */}
                        <TableCell className={CELL}>
                          {(() => {
                            const m = methodLines(r);
                            return (
                              <>
                                <p className="truncate text-xs font-medium text-slate-700">
                                  {m.primary}
                                </p>
                                {m.secondary ? (
                                  <p
                                    className="truncate text-[11px] text-slate-500"
                                    title={m.secondary}
                                  >
                                    {m.secondary}
                                  </p>
                                ) : null}
                              </>
                            );
                          })()}
                        </TableCell>
                        {/* Reference: short id, copy, open */}
                        <TableCell className={CELL}>
                          {r.reference ? (
                            <IdCell
                              label={
                                r.channel === 'razorpay' ? 'Payment ID' : 'UTR'
                              }
                              value={r.reference}
                              what={
                                r.channel === 'razorpay' ? 'payment id' : 'UTR'
                              }
                              href={
                                r.channel === 'razorpay'
                                  ? razorpayPaymentHref(r.reference)
                                  : null
                              }
                              hrefTitle="Open in Razorpay"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(CELL, 'px-1 text-right')}>
                          {r.razorpay ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={open}
                              aria-controls={detailsId}
                              aria-label={`Show details for ${r.reference ?? 'this payment'}`}
                              onClick={() => toggle(r.key)}
                            >
                              {open ? (
                                <ChevronDown aria-hidden />
                              ) : (
                                <ChevronRight aria-hidden />
                              )}
                            </Button>
                          ) : r.paymentRequestId ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Review manual payment ${r.reference ?? ''}`.trim()}
                              title="Review manual payment"
                              disabled={manual.loadingId === r.paymentRequestId}
                              onClick={() =>
                                void manual.open(r.paymentRequestId as string)
                              }
                            >
                              {manual.loadingId === r.paymentRequestId ? (
                                <Loader2 className="animate-spin" aria-hidden />
                              ) : (
                                <ExternalLink aria-hidden />
                              )}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {open && r.razorpay ? (
                        <TableRow
                          id={detailsId}
                          className={cn(
                            'border-b border-slate-100 hover:bg-transparent',
                            r.mode === 'test'
                              ? 'bg-amber-50/20'
                              : 'bg-slate-50/60'
                          )}
                        >
                          <TableCell
                            colSpan={COLS}
                            className="px-3 pt-0 pb-3 whitespace-normal"
                          >
                            <PaymentDetails
                              payment={r.razorpay}
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
      {manual.drawer}
    </>
  );
}
