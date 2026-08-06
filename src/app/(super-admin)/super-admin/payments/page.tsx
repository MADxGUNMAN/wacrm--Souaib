'use client';

// ============================================================
// /super-admin/payments — the money screens.
//
// Two tabs:
//   Requests    — the manual verification queue
//   Subscribers — every workspace's live subscription state
//
// The queue defaults to `pending` rather than "all": the only rows that
// need a human are the unreviewed ones, and a queue that opens on
// history buries the work.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { PaymentRequestDrawer } from '@/components/super-admin/billing/payment-request-drawer';
import { SubscribersPanel } from '@/components/super-admin/billing/subscribers-panel';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { AdminPaymentRequest } from '@/types/super-admin';

type Tab = 'requests' | 'subscribers';

const STATUS_STYLE: Record<AdminPaymentRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

export default function SuperAdminPaymentsPage() {
  const [tab, setTab] = useState<Tab>('requests');
  const [pendingCount, setPendingCount] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900">
          Payments &amp; subscriptions
          {pendingCount > 0 ? (
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
              {pendingCount}
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Verify UPI payments manually, then activate the matching subscription.
        </p>
      </div>

      {/* Simple button tabs rather than the shared Tabs primitive: this
          page keeps independent fetch state per tab, and plain buttons make
          that ownership obvious. */}
      <div className="flex gap-1 border-b border-slate-200">
        <TabButton
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
          icon={CreditCard}
          label="Payment requests"
        />
        <TabButton
          active={tab === 'subscribers'}
          onClick={() => setTab('subscribers')}
          icon={Users}
          label="Subscribers"
        />
      </div>

      {tab === 'requests' ? (
        <PaymentRequestsPanel onPendingCountChange={setPendingCount} />
      ) : (
        <SubscribersPanel />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-[#25D366] text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-800',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ------------------------------------------------------------

function PaymentRequestsPanel({
  onPendingCountChange,
}: {
  onPendingCountChange: (n: number) => void;
}) {
  const [requests, setRequests] = useState<AdminPaymentRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default to the queue that needs action.
  const [status, setStatus] = useState('pending');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selected, setSelected] = useState<AdminPaymentRequest | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

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
        `/api/super-admin/billing/payment-requests?${params.toString()}`,
      );
      if (!res.ok) throw new Error('Failed to load payment requests');
      const data = await res.json();

      setRequests(data.requests ?? []);
      setCounts(data.counts ?? { pending: 0, approved: 0, rejected: 0 });
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      onPendingCountChange(data.counts?.pending ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status, sortBy, page, pageSize, debounced, onPendingCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatusTile
          label="Pending"
          value={counts.pending}
          tone="amber"
          active={status === 'pending'}
          onClick={() => {
            setStatus('pending');
            setPage(1);
          }}
        />
        <StatusTile
          label="Approved"
          value={counts.approved}
          tone="green"
          active={status === 'approved'}
          onClick={() => {
            setStatus('approved');
            setPage(1);
          }}
        />
        <StatusTile
          label="Rejected"
          value={counts.rejected}
          tone="red"
          active={status === 'rejected'}
          onClick={() => {
            setStatus('rejected');
            setPage(1);
          }}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search UTR, payer name, mobile or plan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status}
              onValueChange={(v) => {
                if (v) setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px] border-slate-200 bg-white text-slate-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                if (v) setSortBy(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px] border-slate-200 bg-white text-slate-900">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="amount">Highest amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2">
          <span className="text-xs font-medium text-slate-400">
            {loading ? 'Loading…' : `${total} request${total === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Workspace
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Plan
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Expected
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Paid
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  UTR
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Payer
                </TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600 uppercase">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Submitted
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && requests.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={8} className="h-32 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading requests…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={8} className="h-32 text-center text-red-500">
                    <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
                    {error}
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Inbox className="h-9 w-9" />
                      <p className="font-medium">No payment requests here</p>
                      <p className="text-xs">
                        Submissions from the upgrade page land in this queue.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={cn(
                      'cursor-pointer border-slate-200 hover:bg-slate-50',
                      r.status === 'pending' && 'bg-amber-50/30',
                    )}
                  >
                    <TableCell className="py-3.5">
                      <p className="max-w-[150px] truncate text-sm font-semibold text-slate-800">
                        {r.account_name ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">{r.plan_name_snapshot}</p>
                      <p className="text-xs text-slate-400">
                        {r.cycle_label_snapshot}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">
                        {formatCurrency(r.expected_amount, r.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* Mismatch is the signal an admin must not miss, so
                          it's flagged in the row, not only in the drawer. */}
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          r.amount_matches ? 'text-slate-800' : 'text-red-600',
                        )}
                      >
                        {formatCurrency(r.paid_amount, r.currency)}
                      </span>
                      {!r.amount_matches ? (
                        <p className="text-[10px] font-medium text-red-500">
                          {r.amount_difference < 0 ? 'short' : 'over'} by{' '}
                          {formatCurrency(Math.abs(r.amount_difference), r.currency)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-slate-600">
                        {r.transaction_ref}
                      </code>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[130px] truncate text-sm text-slate-700">
                        {r.payer_name}
                      </p>
                      <p className="text-xs text-slate-400">{r.payer_mobile}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_STYLE[r.status],
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 p-4 sm:flex-row">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                if (v) setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px] border-none bg-transparent px-2 py-0 text-slate-900 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages || 1}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

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

function StatusTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'green' | 'red';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    amber: 'text-amber-600',
    green: 'text-green-600',
    red: 'text-red-600',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white p-4 text-left shadow-sm transition-colors',
        active
          ? 'border-[#25D366] ring-1 ring-[#25D366]/30'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-bold', toneClass)}>{value}</p>
    </button>
  );
}
