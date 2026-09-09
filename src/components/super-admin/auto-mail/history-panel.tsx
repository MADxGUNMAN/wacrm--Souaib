'use client';

// ============================================================
// Auto Mail → History. Every send, with its delivery outcome.
//
// Shows `status` rather than assuming success, which is the difference
// between "we sent 40 reminders" and "we sent 38 and two bounced". The
// failure detail is Meta's- or the SMTP server's own wording, kept
// verbatim: a paraphrased delivery error is not actionable.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  MinusCircle,
  Search,
  User,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AutoEmailLogEntry } from '@/lib/auto-mail/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

/** Icon + tint per delivery outcome. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; className: string; Icon: React.ElementType }
  > = {
    sent: {
      label: 'Sent',
      className: 'bg-green-50 text-green-700',
      Icon: CheckCircle2,
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-50 text-red-700',
      Icon: AlertCircle,
    },
    skipped: {
      label: 'Skipped',
      className: 'bg-slate-100 text-slate-600',
      Icon: MinusCircle,
    },
    sending: {
      label: 'Sending',
      className: 'bg-amber-50 text-amber-700',
      Icon: Clock,
    },
  };
  const entry = map[status] ?? map.skipped;
  const { Icon } = entry;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        entry.className
      )}
    >
      <Icon className="h-3 w-3" />
      {entry.label}
    </span>
  );
}

export function HistoryPanel() {
  const [entries, setEntries] = useState<AutoEmailLogEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [segment, setSegment] = useState('all');
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [segment, status, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        segment,
        status,
        search,
      });
      const res = await fetch(`/api/super-admin/auto-mail/log?${params}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setEntries(json.entries ?? []);
      setCounts(json.counts ?? {});
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch {
      toast.error('Could not load the email history.');
    } finally {
      setLoading(false);
    }
  }, [page, segment, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sent" value={counts.sent ?? 0} tone="good" />
        <StatCard label="Failed" value={counts.failed ?? 0} tone="bad" />
        <StatCard label="Skipped" value={counts.skipped ?? 0} />
        <StatCard label="In flight" value={counts.sending ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by recipient email..."
            className="border-slate-200 bg-white pl-9 text-slate-900"
          />
        </div>
        <Select value={segment} onValueChange={(v) => setSegment(v ?? 'all')}>
          <SelectTrigger className="w-[170px] border-slate-200 bg-white text-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v ?? 'all')}>
          <SelectTrigger className="w-[160px] border-slate-200 bg-white text-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#25D366]" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Inbox className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No emails yet</p>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Reminders appear here once the scheduler sends them, or as soon as
              you use Send now on the Recipients tab.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-500">Recipient</TableHead>
                  <TableHead className="text-slate-500">Subject</TableHead>
                  <TableHead className="text-slate-500">Segment</TableHead>
                  <TableHead className="text-slate-500">Stage</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="text-slate-500">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="border-slate-200 hover:bg-slate-50"
                  >
                    <TableCell className="py-3.5">
                      <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">
                        {entry.account_name ?? 'Workspace'}
                      </p>
                      <p
                        className="max-w-[220px] truncate text-xs text-slate-400"
                        title={entry.recipient_email}
                      >
                        {entry.recipient_email}
                      </p>
                    </TableCell>

                    <TableCell>
                      <p className="max-w-[260px] truncate text-sm text-slate-700">
                        {entry.subject}
                      </p>
                      {entry.error_detail ? (
                        <p
                          className="max-w-[260px] truncate text-xs text-red-500"
                          title={entry.error_detail}
                        >
                          {entry.error_detail}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-500 capitalize">
                        {entry.segment}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-500">
                        {entry.offset_days}d before
                      </span>
                      {entry.trigger === 'manual' ? (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          title="Sent by an admin, not the scheduler"
                        >
                          <User className="h-2.5 w-2.5" />
                          manual
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <StatusPill status={entry.status} />
                    </TableCell>

                    <TableCell className="text-sm text-slate-500">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'good'
            ? 'text-green-600'
            : tone === 'bad' && value > 0
              ? 'text-red-600'
              : 'text-slate-900'
        )}
      >
        {value}
      </p>
    </div>
  );
}
