'use client';

// ============================================================
// Auto Mail → Recipients. Who is in line, and what have they had.
//
// Every column here is DERIVED state, recomputed by the server on each
// request from the same resolver the access gate uses. There is no
// schedule table to read, deliberately: a stored schedule would be a
// second source of truth that could disagree with what the cron actually
// decides to send, and the disagreement would only surface as a customer
// complaint.
//
// `blockedReason` is the column that earns its place. Without it, a
// workspace missing from the send queue is a mystery an operator has to
// reverse-engineer from four separate settings screens.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  Search,
  Send,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface RecipientRow {
  accountId: string;
  accountName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  segment: 'trial' | 'paid' | null;
  status: string;
  endsAt: string | null;
  daysLeft: number | null;
  planName: string | null;
  dueOffset: number | null;
  alreadySentForWindow: boolean;
  optedOut: boolean;
  isBanned: boolean;
  totalSent: number;
  lastSentAt: string | null;
  blockedReason: string | null;
}

interface Summary {
  total: number;
  trialing: number;
  paid: number;
  dueNow: number;
  optedOut: number;
  emailsSentTotal: number;
}

const PAGE_SIZE = 20;

export function RecipientsPanel() {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(true);
  const [hiddenOperatorCount, setHiddenOperatorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [segment, setSegment] = useState('all');
  const [onlyDue, setOnlyDue] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Debounced, matching the newsletter screen's 400ms.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [segment, onlyDue, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        segment,
        search,
        onlyDue: String(onlyDue),
      });
      const res = await fetch(
        `/api/super-admin/auto-mail/recipients?${params}`
      );
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setRows(json.recipients ?? []);
      setSummary(json.summary ?? null);
      setBillingEnabled(json.billingEnabled !== false);
      setHiddenOperatorCount(json.hiddenOperatorCount ?? 0);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch {
      toast.error('Could not load the recipient list.');
    } finally {
      setLoading(false);
    }
  }, [page, segment, search, onlyDue]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleOptOut = async (row: RecipientRow) => {
    try {
      const res = await fetch('/api/super-admin/auto-mail/recipients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: row.accountId,
          optedOut: !row.optedOut,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not update the opt-out.');
        return;
      }
      toast.success(
        json.optedOut
          ? `${row.accountName} will no longer receive Auto Mail.`
          : `${row.accountName} will receive Auto Mail again.`
      );
      void load();
    } catch {
      toast.error('Could not reach the server.');
    }
  };

  const sendNow = async (row: RecipientRow) => {
    setSendingId(row.accountId);
    try {
      const res = await fetch('/api/super-admin/auto-mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: row.accountId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not send.');
        return;
      }
      toast.success(`Reminder sent to ${row.ownerEmail}.`);
      void load();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform-wide kill switch beats every other setting, so it is
          called out rather than leaving an unexplained empty queue. */}
      {!billingEnabled ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Billing is disabled platform-wide
            </p>
            <p className="mt-0.5 text-sm text-amber-700">
              Nothing expires while it is off, so no reminders will be sent
              regardless of the settings below. Re-enable it under Plans &amp;
              Pricing.
            </p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Workspaces" value={summary.total} />
          <StatCard label="In trial" value={summary.trialing} />
          <StatCard label="Subscribed" value={summary.paid} />
          <StatCard label="Due now" value={summary.dueNow} accent />
          <StatCard label="Emails sent" value={summary.emailsSentTotal} />
        </div>
      ) : null}

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search workspace, owner name or email..."
            className="border-slate-200 bg-white pl-9 text-slate-900"
          />
        </div>
        <Select value={segment} onValueChange={(v) => setSegment(v ?? 'all')}>
          <SelectTrigger className="w-[190px] border-slate-200 bg-white text-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="trial">Trial users</SelectItem>
            <SelectItem value="paid">Paid subscribers</SelectItem>
            <SelectItem value="none">No live window</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Switch checked={onlyDue} onCheckedChange={setOnlyDue} />
          <span className="text-sm font-medium text-slate-600">
            Due now only
          </span>
        </label>
      </div>

      {/* ---- Table ---- */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#25D366]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Inbox className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              Nothing to show
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {onlyDue
                ? 'No workspace has a reminder due right now.'
                : 'No workspace matches these filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-500">Workspace</TableHead>
                  <TableHead className="text-slate-500">Segment</TableHead>
                  <TableHead className="text-slate-500">Ends</TableHead>
                  <TableHead className="text-slate-500">
                    Next reminder
                  </TableHead>
                  <TableHead className="text-slate-500">Sent</TableHead>
                  <TableHead className="text-slate-500">Auto Mail</TableHead>
                  <TableHead className="text-right text-slate-500">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.accountId}
                    className="border-slate-200 hover:bg-slate-50"
                  >
                    <TableCell className="py-3.5">
                      <p className="max-w-[200px] truncate text-sm font-semibold text-slate-800">
                        {row.accountName}
                      </p>
                      <p
                        className="max-w-[220px] truncate text-xs text-slate-400"
                        title={row.ownerEmail ?? undefined}
                      >
                        {row.ownerEmail ?? 'No owner email'}
                      </p>
                    </TableCell>

                    <TableCell>
                      {row.segment ? (
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            row.segment === 'trial'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-green-50 text-green-700'
                          )}
                        >
                          {row.segment === 'trial' ? 'Trial' : 'Subscribed'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {row.endsAt ? (
                        <>
                          <p className="text-sm text-slate-700">
                            {new Date(row.endsAt).toLocaleDateString(
                              undefined,
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              }
                            )}
                          </p>
                          {(() => {
                            const isPast =
                              new Date(row.endsAt).getTime() < Date.now();
                            if (isPast) {
                              return (
                                <p className="text-xs text-slate-400">
                                  ended{' '}
                                  {formatDistanceToNow(new Date(row.endsAt), {
                                    addSuffix: true,
                                  })}
                                </p>
                              );
                            }
                            return (
                              <p
                                className={cn(
                                  'text-xs',
                                  (row.daysLeft ?? 99) <= 1
                                    ? 'font-medium text-red-500'
                                    : 'text-slate-400'
                                )}
                              >
                                {row.daysLeft === 0
                                  ? 'ends today'
                                  : `${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'} left`}
                              </p>
                            );
                          })()}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">
                          No window
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {row.blockedReason ? (
                        <span
                          className="text-xs text-slate-400"
                          title={row.blockedReason}
                        >
                          {row.blockedReason}
                        </span>
                      ) : row.alreadySentForWindow ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Already sent
                        </span>
                      ) : row.dueOffset !== null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                          <Clock className="h-3 w-3" />
                          Due now ({row.dueOffset}d stage)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Not yet in range
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <p className="text-sm font-medium text-slate-700 tabular-nums">
                        {row.totalSent}
                      </p>
                      {row.lastSentAt ? (
                        <p className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(row.lastSentAt), {
                            addSuffix: true,
                          })}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <label
                        className="flex items-center gap-2"
                        title={
                          row.optedOut
                            ? 'Opted out — Auto Mail skips this workspace'
                            : 'Receiving Auto Mail'
                        }
                      >
                        <Switch
                          checked={!row.optedOut}
                          onCheckedChange={() => void toggleOptOut(row)}
                        />
                        {row.optedOut ? (
                          <BellOff className="h-3.5 w-3.5 text-slate-400" />
                        ) : null}
                      </label>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-200"
                        disabled={
                          sendingId === row.accountId ||
                          row.optedOut ||
                          !row.segment ||
                          !row.ownerEmail
                        }
                        onClick={() => void sendNow(row)}
                        title={
                          row.optedOut
                            ? 'This workspace is opted out'
                            : !row.segment
                              ? 'No live window to tell them about'
                              : !row.ownerEmail
                                ? 'No owner email on file'
                                : 'Send this reminder now'
                        }
                      >
                        {sendingId === row.accountId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5 hidden sm:inline">
                          Send now
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* States the omission rather than letting a workspace quietly vanish
          from an admin screen. Auto Mail never emails an operator's own
          workspace — see loadOperatorAccountIds. */}
      {hiddenOperatorCount > 0 ? (
        <p className="text-xs text-slate-400">
          {hiddenOperatorCount} operator{' '}
          {hiddenOperatorCount === 1 ? 'workspace is' : 'workspaces are'}{' '}
          hidden. Auto Mail does not send to super-admin accounts. Use “Send
          test” on the Settings tab to email yourself a sample.
        </p>
      ) : null}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          accent && value > 0 ? 'text-amber-600' : 'text-slate-900'
        )}
      >
        {value}
      </p>
    </div>
  );
}
