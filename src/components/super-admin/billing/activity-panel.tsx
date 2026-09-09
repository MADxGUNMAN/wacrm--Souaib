'use client';

// ============================================================
// Activity tab — the full subscription audit trail.
//
// Answers the question the other two tabs could not: "what has actually
// happened to this workspace's billing, and who did it?"
//
// Before this existed, approving a payment left a visible row in the
// requests queue while granting a year of access by hand left no trace in
// the UI at all — even though both were being written to
// `subscription_events` the whole time. An admin action with no record is
// indistinguishable from one that never happened, which is the one thing
// a billing screen must never be ambiguous about.
//
// Every row states, in words: what happened, to whom, by whom, and what
// changed. No abbreviations that need a lookup table.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  History,
  Loader2,
  Search,
  ShieldOff,
  Sparkles,
  UserCog,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

interface BillingEvent {
  id: string;
  accountId: string;
  accountName: string;
  ownerEmail: string | null;
  eventType: string;
  source: 'payment' | 'manual';
  fromStatus: string | null;
  toStatus: string | null;
  endsAt: string | null;
  planName: string | null;
  cycleLabel: string | null;
  amount: number | null;
  paymentRequestId: string | null;
  actorName: string | null;
  actorIsSuperAdmin: boolean;
  note: string | null;
  createdAt: string;
  durationMonths: number | null;
  durationDays: number | null;
  previousEndsAt: string | null;
  windowKind: 'paid' | 'trial' | null;
}

/**
 * "+2 days" / "+1 month", or null when the event granted no span.
 *
 * Reads the REQUESTED duration rather than differencing the two end dates,
 * because those disagree: extending a live window adds to its end date
 * while extending a lapsed one restarts from today, so the same "1 month"
 * can move the date by 30 days or by 400.
 */
function formatGranted(e: BillingEvent): string | null {
  if (e.durationDays) {
    return `+${e.durationDays} day${e.durationDays === 1 ? '' : 's'}`;
  }
  if (e.durationMonths) {
    return `+${e.durationMonths} month${e.durationMonths === 1 ? '' : 's'}`;
  }
  return null;
}

/**
 * Plain-words label per event kind, plus the icon and tone.
 *
 * The stored `event_type` values are developer identifiers
 * (`subscription_extended`). Rendering them raw would make an operator
 * translate snake_case in their head on a screen about money.
 */
const EVENT_META: Record<
  string,
  { label: string; icon: React.ElementType; tone: string }
> = {
  trial_started: {
    label: 'Trial started',
    icon: Sparkles,
    tone: 'text-blue-600 bg-blue-50',
  },
  trial_extended: {
    label: 'Trial extended',
    icon: Clock,
    tone: 'text-blue-600 bg-blue-50',
  },
  payment_submitted: {
    label: 'Payment submitted',
    icon: CreditCard,
    tone: 'text-amber-600 bg-amber-50',
  },
  payment_approved: {
    label: 'Payment approved',
    icon: CheckCircle2,
    tone: 'text-green-600 bg-green-50',
  },
  payment_rejected: {
    label: 'Payment rejected',
    icon: XCircle,
    tone: 'text-red-600 bg-red-50',
  },
  subscription_activated: {
    label: 'Subscription activated',
    icon: CheckCircle2,
    tone: 'text-green-600 bg-green-50',
  },
  subscription_extended: {
    label: 'Subscription extended',
    icon: CalendarClock,
    tone: 'text-green-600 bg-green-50',
  },
  subscription_revoked: {
    label: 'Access blocked',
    icon: ShieldOff,
    tone: 'text-red-600 bg-red-50',
  },
  subscription_expired: {
    label: 'Expired',
    icon: Ban,
    tone: 'text-slate-600 bg-slate-100',
  },
};

const TYPE_FILTERS: Record<string, string> = {
  all: 'All events',
  payment_submitted: 'Payment submitted',
  payment_approved: 'Payment approved',
  payment_rejected: 'Payment rejected',
  subscription_activated: 'Subscription activated',
  subscription_extended: 'Subscription extended',
  trial_extended: 'Trial extended',
  subscription_revoked: 'Access blocked',
  subscription_expired: 'Expired',
};

const SOURCE_FILTERS: Record<string, string> = {
  all: 'Payments & manual',
  payment: 'From payments',
  manual: 'Manual only',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function ActivityPanel({ accountId }: { accountId?: string }) {
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [counts, setCounts] = useState<{
    total: number;
    payment: number;
    manual: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change invalidates the current page number — staying on
  // page 4 of a now-single-page result shows an empty table.
  useEffect(() => {
    setPage(1);
  }, [typeFilter, sourceFilter, debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: typeFilter,
        source: sourceFilter,
        page: String(page),
        pageSize: '25',
      });
      if (debounced) params.set('search', debounced);
      if (accountId) params.set('accountId', accountId);

      const res = await fetch(
        `/api/super-admin/billing/events?${params.toString()}`
      );
      if (!res.ok) throw new Error('Failed to load the subscription history');
      const data = await res.json();

      setEvents(data.events ?? []);
      setCounts(data.counts ?? null);
      setTotalPages(data.totalPages ?? 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sourceFilter, debounced, page, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Hidden in the per-account view: three tiles restating a handful
          of rows is noise next to the rows themselves. */}
      {counts && !accountId ? (
        <div className="grid grid-cols-3 gap-3">
          <CountTile label="All events" value={counts.total} />
          <CountTile
            label="From payments"
            value={counts.payment}
            tone="green"
            hint="A customer paid"
          />
          <CountTile
            label="Manual"
            value={counts.manual}
            tone="blue"
            hint="Granted by an admin"
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search workspace, admin, plan or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={sourceFilter}
              onValueChange={(v) => {
                if (v) setSourceFilter(v);
              }}
            >
              <SelectTrigger className="w-[180px] border-slate-200 bg-white text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {Object.entries(SOURCE_FILTERS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                if (v) setTypeFilter(v);
              }}
            >
              <SelectTrigger className="w-[210px] border-slate-200 bg-white text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {Object.entries(TYPE_FILTERS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  What happened
                </TableHead>
                {!accountId ? (
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Workspace
                  </TableHead>
                ) : null}
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Time given
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  End date
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Amount
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Done by
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && events.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={accountId ? 7 : 8}
                    className="h-28 text-center text-slate-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading history…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={accountId ? 7 : 8}
                    className="h-28 text-center text-red-500"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={accountId ? 7 : 8}
                    className="h-28 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <History className="h-9 w-9" />
                      <p className="font-medium">Nothing recorded yet</p>
                      <p className="text-xs">
                        Payments and manual subscription changes both appear
                        here.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => {
                  const meta = EVENT_META[e.eventType] ?? {
                    label: e.eventType,
                    icon: History,
                    tone: 'text-slate-600 bg-slate-100',
                  };
                  const Icon = meta.icon;
                  const granted = formatGranted(e);

                  return (
                    <TableRow key={e.id} className="border-slate-200">
                      <TableCell className="py-3.5">
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                              meta.tone
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">
                              {meta.label}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {/* The distinction the old UI hid entirely:
                                  whether money was involved. */}
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  e.source === 'payment'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-blue-50 text-blue-700'
                                )}
                              >
                                {e.source === 'payment' ? 'Paid' : 'Manual'}
                              </span>
                              {e.planName ? (
                                <span className="text-[11px] text-slate-500">
                                  {e.planName}
                                  {e.cycleLabel ? ` · ${e.cycleLabel}` : ''}
                                </span>
                              ) : null}
                            </div>
                            {e.note ? (
                              <p className="mt-1 max-w-[280px] text-xs text-slate-500 italic">
                                “{e.note}”
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      {!accountId ? (
                        <TableCell>
                          <p className="max-w-[160px] truncate text-sm font-medium text-slate-800">
                            {e.accountName}
                          </p>
                          <p className="max-w-[160px] truncate text-xs text-slate-400">
                            {e.ownerEmail ?? ''}
                          </p>
                        </TableCell>
                      ) : null}

                      {/* HOW MUCH, and onto which window. The single most
                          asked question about an extension, and the one the
                          first version of this table could not answer. */}
                      <TableCell>
                        {granted ? (
                          <span
                            className={cn(
                              'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
                              e.windowKind === 'trial'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-green-50 text-green-700'
                            )}
                          >
                            {granted}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {e.windowKind ? (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {e.windowKind === 'trial'
                              ? 'trial days'
                              : 'paid access'}
                          </p>
                        ) : null}
                      </TableCell>

                      {/* The date move, spelled out. "Sep 8 → Oct 8" is the
                          sentence a human reads; a lone new date leaves them
                          to remember what it used to be. */}
                      <TableCell>
                        {e.previousEndsAt && e.endsAt ? (
                          <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-slate-600">
                            <span className="text-slate-400">
                              {formatDate(e.previousEndsAt)}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="font-medium">
                              {formatDate(e.endsAt)}
                            </span>
                          </span>
                        ) : e.endsAt ? (
                          <span className="text-xs font-medium text-slate-600">
                            {formatDate(e.endsAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {/* Only render an arrow when the status actually
                            moved. Several event kinds change the DATE and
                            not the status (expiring a paid window records
                            "active" on both sides), and printing
                            "active → active" reads as a bug in the log
                            rather than as "the status was untouched". */}
                        {e.fromStatus &&
                        e.toStatus &&
                        e.fromStatus !== e.toStatus ? (
                          <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-slate-600">
                            <span className="capitalize">{e.fromStatus}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="font-medium capitalize">
                              {e.toStatus}
                            </span>
                          </span>
                        ) : e.toStatus || e.fromStatus ? (
                          <span className="text-xs text-slate-500 capitalize">
                            {e.toStatus ?? e.fromStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {e.amount != null ? (
                          <span className="text-sm font-medium text-slate-800">
                            {formatCurrency(e.amount)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {e.actorName ? (
                          <span className="inline-flex items-center gap-1.5">
                            {e.actorIsSuperAdmin ? (
                              <span title="Platform admin" className="shrink-0">
                                <UserCog className="h-3.5 w-3.5 text-slate-400" />
                              </span>
                            ) : null}
                            <span className="max-w-[130px] truncate text-xs text-slate-600">
                              {e.actorName}
                            </span>
                          </span>
                        ) : (
                          // Not "unknown" — nobody triggered it. Trials
                          // starting at signup are the usual case.
                          <span className="text-xs text-slate-400">System</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <p
                          className="text-xs text-slate-500"
                          title={new Date(e.createdAt).toLocaleString()}
                        >
                          {formatDistanceToNow(new Date(e.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 p-3">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CountTile({
  label,
  value,
  tone = 'slate',
  hint,
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'green' | 'blue';
  hint?: string;
}) {
  const toneClass = {
    slate: 'text-slate-900',
    green: 'text-green-600',
    blue: 'text-blue-600',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-bold', toneClass)}>{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
