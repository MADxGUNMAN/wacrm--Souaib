'use client';

// ============================================================
// Live chat settings → Reply emails.
//
// Every "Support replied to your message" email the cron sent: who it went
// to, when, which reply caused it, and whether it was delivered. Answers
// "the customer says they were never told" without opening the database.
//
// Read-only, and independent of the page's Save bar.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MessageCircle,
  MinusCircle,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  SupportReplyEmailEntry,
  SupportReplyEmailStatus,
} from '@/lib/support-chat/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

type StatusFilter = 'all' | SupportReplyEmailStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

const STATUS_STYLE: Record<
  SupportReplyEmailStatus,
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
  pending: {
    label: 'Sending',
    className: 'bg-amber-50 text-amber-700',
    Icon: Clock,
  },
};

export function SupportReplyEmailLog() {
  const [entries, setEntries] = useState<SupportReplyEmailEntry[]>([]);
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounced; resets to page 1 in the same update so there is no extra
  // fetch of a page that may not exist under the new filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
        search,
      });
      const res = await fetch(
        `/api/super-admin/support-chat/reply-emails?${params}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load the log.');
      setEntries(data.entries ?? []);
      setCounts(data.counts ?? {});
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the log.');
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Mail className="h-4 w-4 text-slate-500" />
            Reply emails
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            When you reply and nobody from the workspace comes back to see it,
            we email them a reminder. Here is every one: who it went to, when,
            and which reply it was about.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh reply emails"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* All-time tallies */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Tally label="Sent" value={counts.sent ?? 0} tone="text-green-700" />
        <Tally
          label="Failed"
          value={counts.failed ?? 0}
          tone={(counts.failed ?? 0) > 0 ? 'text-red-600' : undefined}
        />
        <Tally label="Skipped" value={counts.skipped ?? 0} />
        {(counts.pending ?? 0) > 0 ? (
          <Tally
            label="Sending"
            value={counts.pending ?? 0}
            tone="text-amber-700"
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search workspace, name or email"
            className="pl-8"
            aria-label="Search reply emails"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                status === f.value
                  ? 'border-[#25D366] bg-[#25D366]/10 text-[#159947]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        {loading && entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center p-8 text-center">
            <Mail className="mb-2 h-7 w-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              {search || status !== 'all'
                ? 'No email matches.'
                : 'No reply emails yet'}
            </p>
            {!search && status === 'all' ? (
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                They appear here once a reply has gone unseen long enough for
                the scheduler to send a reminder.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <EmailRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {total} email{total === 1 ? '' : 's'}
        </span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EmailRow({ entry }: { entry: SupportReplyEmailEntry }) {
  const style = STATUS_STYLE[entry.status] ?? STATUS_STYLE.skipped;
  const { Icon } = style;
  const emailedAt = new Date(entry.emailedAt);
  const partial =
    entry.status === 'sent' && entry.detail?.startsWith('Partial:');

  return (
    <li className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
      {/* Who + when */}
      <div className="min-w-0 lg:w-64 lg:shrink-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {entry.accountName ?? 'Deleted workspace'}
        </p>
        <p
          className="mt-0.5 text-xs text-slate-500"
          title={format(emailedAt, 'PPpp')}
        >
          {format(emailedAt, 'd MMM yyyy, h:mm a')}
          <span className="text-slate-400">
            {' · '}
            {formatDistanceToNow(emailedAt, { addSuffix: true })}
          </span>
        </p>
        <span
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            partial ? 'bg-amber-50 text-amber-700' : style.className
          )}
        >
          <Icon className="h-3 w-3" />
          {partial ? 'Partly sent' : style.label}
        </span>
      </div>

      {/* Sent to */}
      <div className="min-w-0 lg:w-64 lg:shrink-0">
        <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          Sent to
        </p>
        {entry.recipients.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {entry.recipients.map((r) => (
              <li key={r} className="truncate text-sm text-slate-700" title={r}>
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Nobody</p>
        )}
        {entry.detail ? (
          <p
            className={cn(
              'mt-1 text-xs break-words',
              entry.status === 'skipped' ? 'text-slate-500' : 'text-red-600'
            )}
          >
            {entry.detail}
          </p>
        ) : null}
      </div>

      {/* About which reply */}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          About your reply
        </p>
        {entry.reply ? (
          <>
            <p
              className={cn(
                'mt-1 line-clamp-2 text-sm',
                entry.reply.deleted ? 'text-slate-400 italic' : 'text-slate-700'
              )}
            >
              {entry.reply.preview}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {entry.reply.senderName ? `${entry.reply.senderName} · ` : ''}
              replied {format(new Date(entry.reply.sentAt), 'd MMM, h:mm a')}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-400 italic">
            The reply is no longer available.
          </p>
        )}
      </div>

      {entry.accountId ? (
        <Link
          href={`/super-admin/live-chat?account=${encodeURIComponent(entry.accountId)}`}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'shrink-0 self-start'
          )}
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
          Open chat
        </Link>
      ) : null}
    </li>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
      {label}
      <span
        className={cn('font-semibold tabular-nums', tone ?? 'text-slate-900')}
      >
        {value}
      </span>
    </span>
  );
}
