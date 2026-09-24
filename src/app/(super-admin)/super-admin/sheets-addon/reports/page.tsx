'use client';

// ============================================================
// Super Admin → Sheet Add-on → Issue Reports
//
// Reports submitted from the Help & Support dialog in the Google Sheets
// add-on.
//
// Deliberately a close mirror of the Contact Submissions inbox: same
// status vocabulary, same open-marks-it-read behaviour, same slide-over
// drawer, same reply-by-email flow with a stored thread. An operator
// switching between the two should not have to learn anything twice.
//
// One thing genuinely differs and the UI has to say so: a contact
// submission always has an email address, but an issue report's
// `reporter_email` is nullable — the add-on reads it from the Google
// session, which can be unavailable. Those reports cannot be replied to,
// so the Reply control explains that rather than failing at send time.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type {
  SheetsAddonIssueReport,
  SheetsAddonReportCounts,
  SheetsAddonReportStatus,
} from '@/types/super-admin';

// ────────────────────────────────────────────────
// Status badge config — same palette and icons as contact submissions,
// so a pill means the same thing in both inboxes.
// ────────────────────────────────────────────────
const STATUS_META: Record<
  SheetsAddonReportStatus,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  new: { label: 'New', bg: 'bg-blue-50', text: 'text-blue-700', icon: Mail },
  read: {
    label: 'Read',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: Eye,
  },
  replied: {
    label: 'Replied',
    bg: 'bg-green-50',
    text: 'text-green-700',
    icon: MessageSquare,
  },
  archived: {
    label: 'Archived',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: Archive,
  },
};

const EMPTY_COUNTS: SheetsAddonReportCounts = {
  new: 0,
  read: 0,
  replied: 0,
  archived: 0,
  total: 0,
};

interface Reply {
  id: string;
  subject: string;
  body: string;
  sent_by: string;
  created_at: string;
}

/** First line of a report, for the drawer heading and reply subject. */
function reportTitle(report: SheetsAddonIssueReport): string {
  const firstLine = report.message.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Add-on issue report';
  return firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;
}

// ────────────────────────────────────────────────
// Detail Drawer
// ────────────────────────────────────────────────
function DetailDrawer({
  report,
  onClose,
  onStatusChange,
  onDelete,
  onReplied,
}: {
  report: SheetsAddonIssueReport;
  onClose: () => void;
  onStatusChange: (id: string, status: SheetsAddonReportStatus) => void;
  onDelete: (id: string) => void;
  onReplied: (id: string) => void;
}) {
  const confirm = useConfirm();
  const meta = STATUS_META[report.status];
  const StatusIcon = meta.icon;

  const canReply = Boolean(report.reporter_email?.trim());

  const [showReply, setShowReply] = useState(false);
  const [replySubject, setReplySubject] = useState(
    `Re: ${reportTitle(report)}`
  );
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const replyFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showReply && replyFormRef.current) {
      // Let the panel render and animate before scrolling to it.
      setTimeout(() => {
        replyFormRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }, 50);
    }
  }, [showReply]);

  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/super-admin/sheets-addon/reports/replies?reportId=${report.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch {
      // Silent: a missing thread must not stop the report being read.
    } finally {
      setLoadingReplies(false);
    }
  }, [report.id]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const handleSendReply = async () => {
    if (!replyBody.trim()) {
      toast.error('Please enter a message before sending.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/super-admin/sheets-addon/reports/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          subject: replySubject,
          body: replyBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');

      toast.success(`Reply sent to ${data.to ?? report.reporter_email}`);
      // The server already set `replied`; this syncs the UI without a
      // second write.
      onReplied(report.id);
      setShowReply(false);
      setReplyBody('');
      fetchReplies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="animate-in slide-in-from-right-10 fixed inset-y-0 right-0 z-[110] flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-slate-200 p-6">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {report.account_name || 'Unattributed report'}
            </h3>
            {report.reporter_email ? (
              <a
                href={`mailto:${report.reporter_email}`}
                className="text-sm text-[#25D366] hover:underline"
              >
                {report.reporter_email}
              </a>
            ) : (
              <p className="text-sm text-slate-400 italic">
                No email address captured
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                meta.bg,
                meta.text
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {meta.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(report.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Spreadsheet & version */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Spreadsheet
              </p>
              <p className="text-sm font-medium text-slate-800">
                {report.spreadsheet_name || (
                  <span className="text-slate-400 italic">Not captured</span>
                )}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Add-on version
              </p>
              <p className="font-mono text-sm text-slate-800">
                {report.addon_version || (
                  <span className="font-sans text-slate-400 italic">
                    Not captured
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Account */}
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Account
            </p>
            {report.account_name ? (
              <p className="text-sm font-medium text-slate-800">
                {report.account_name}
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                <span className="text-slate-400 italic">Unattributed</span> — no
                valid API key was present when this was sent, which is expected
                if setup itself was the problem.
              </p>
            )}
          </div>

          {/* Message */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Message
            </p>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              {/* whitespace-pre-wrap matters: people paste stack traces
                  and numbered steps to reproduce. */}
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                {report.message}
              </p>
            </div>
          </div>

          {/* Replies history */}
          {loadingReplies ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading replies...
            </div>
          ) : (
            replies.length > 0 && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Replies ({replies.length})
                </p>
                <div className="space-y-3">
                  {replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="space-y-2 rounded-xl border border-[#25D366]/15 bg-gradient-to-br from-[#25D366]/[0.04] to-transparent p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366]/10">
                            <Send className="h-3 w-3 text-[#25D366]" />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">
                            {reply.sent_by}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatDistanceToNow(new Date(reply.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="pl-8 text-xs font-medium text-slate-500">
                        {reply.subject}
                      </p>
                      <div className="pl-8">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                          {reply.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Reply form */}
          {showReply && (
            <div
              ref={replyFormRef}
              className="animate-in fade-in slide-in-from-bottom-2 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm duration-200"
            >
              <div className="mb-1 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                  <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Reply to {report.reporter_email}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Subject
                </label>
                <Input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className="border-slate-200 bg-white text-sm text-slate-900 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Message
                </label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={6}
                  placeholder="Type your reply here..."
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleSendReply}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Reply
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReply(false)}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="shrink-0 space-y-3 border-t border-slate-200 bg-slate-50/80 p-4">
          {/* Status change buttons */}
          <div className="flex flex-wrap gap-2">
            {(['new', 'read', 'replied', 'archived'] as const).map((s) => {
              const m = STATUS_META[s];
              const Icon = m.icon;
              const isActive = report.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isActive}
                  onClick={() => onStatusChange(report.id, s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? `${m.bg} ${m.text} cursor-default border-current/20`
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Reply + Delete */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              // Disabled rather than hidden, with the reason in the
              // tooltip: an absent control reads as a bug, a disabled one
              // with an explanation reads as an answer.
              disabled={!canReply}
              title={
                canReply
                  ? undefined
                  : 'This report captured no email address, so there is no one to reply to.'
              }
              onClick={() => setShowReply(!showReply)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                !canReply
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : showReply
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-[#25D366] text-white hover:bg-[#20b958]'
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {!canReply
                ? 'No email to reply to'
                : showReply
                  ? 'Close Reply'
                  : 'Reply'}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete this report permanently?',
                  description:
                    'This issue report and every reply sent for it will be permanently deleted and cannot be recovered.',
                  confirmText: 'Delete Report',
                  cancelText: 'Cancel',
                  variant: 'destructive',
                });
                if (ok) {
                  onDelete(report.id);
                }
              }}
              className="text-red-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────
export default function SheetsAddonReportsPage() {
  const confirm = useConfirm();
  const [reports, setReports] = useState<SheetsAddonIssueReport[]>([]);
  const [counts, setCounts] = useState<SheetsAddonReportCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const [selected, setSelected] = useState<SheetsAddonIssueReport | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      params.set('status', statusFilter);
      params.set('sortBy', sortBy);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(
        `/api/super-admin/sheets-addon/reports?${params.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();

      setReports(data.reports || []);
      setCounts(data.counts || EMPTY_COUNTS);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, sortBy, debouncedSearch]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  /**
   * Apply a status change locally and on the server.
   *
   * The local update covers both the row and the open drawer. Unlike the
   * contact-submissions version this does NOT swallow a failure: a
   * silently-failed PATCH leaves the UI claiming a state the database
   * does not have, which is how "I marked that read and it came back"
   * happens.
   */
  const handleStatusChange = async (
    id: string,
    status: SheetsAddonReportStatus
  ) => {
    const previous = reports.find((r) => r.id === id)?.status;

    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setSelected((prev) =>
      prev && prev.id === id ? { ...prev, status } : prev
    );

    try {
      const res = await fetch('/api/super-admin/sheets-addon/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Failed to update the status');
      // Refresh so the tiles track the change too.
      void fetchReports();
    } catch (err) {
      // Roll the optimistic update back rather than leaving a lie on screen.
      if (previous) {
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: previous } : r))
        );
        setSelected((prev) =>
          prev && prev.id === id ? { ...prev, status: previous } : prev
        );
      }
      toast.error(
        err instanceof Error ? err.message : 'Failed to update the status'
      );
    }
  };

  /** The server already set `replied`; just sync the UI. */
  const handleReplied = (id: string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'replied' } : r))
    );
    setSelected((prev) =>
      prev && prev.id === id ? { ...prev, status: 'replied' } : prev
    );
    void fetchReports();
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(
        `/api/super-admin/sheets-addon/reports?id=${id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete the report');

      setReports((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (selected?.id === id) setSelected(null);
      toast.success('Report deleted.');
      void fetchReports();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete the report'
      );
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Status tiles. Clicking one filters by it; clicking the active
          one clears the filter, since doing nothing would be the
          surprising behaviour once the number is on screen. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['new', 'read', 'replied', 'archived'] as const).map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatusFilter(active ? 'all' : s);
                setPage(1);
              }}
              className={cn(
                'rounded-xl border bg-white p-4 text-left shadow-sm transition-colors',
                active
                  ? 'border-[#25D366] ring-1 ring-[#25D366]/30'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase">
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </p>
              <p className={cn('mt-1 text-2xl font-bold', m.text)}>
                {counts[s]}
              </p>
            </button>
          );
        })}
      </div>

      {/* Main container */}
      <div className="flex h-[calc(100vh-18rem)] min-h-[380px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search message, reporter, account or spreadsheet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-500 md:w-[400px]"
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                if (v) setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] border-slate-200 bg-white text-slate-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => {
                if (v) setSortBy(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] border-slate-200 bg-white text-slate-900">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results info */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2">
          <span className="text-xs font-medium text-slate-400">
            {isLoading
              ? 'Loading...'
              : `${total} report${total === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="flex flex-col items-center p-8 text-center text-red-400">
              <AlertCircle className="mb-2 h-8 w-8" />
              <p>Failed to load reports. Please try again.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-12 text-xs font-semibold text-slate-600 uppercase">
                    #
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Message
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Reporter
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Account
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Spreadsheet
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Version
                  </TableHead>
                  <TableHead className="text-center text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Received
                  </TableHead>
                  <TableHead className="w-20 text-center text-xs font-semibold text-slate-600 uppercase">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && reports.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center text-slate-400"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading reports...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Inbox className="h-10 w-10" />
                        <p className="font-medium">No reports found</p>
                        <p className="text-xs">
                          {debouncedSearch || statusFilter !== 'all'
                            ? 'Nothing matches these filters'
                            : 'Reports from the add-on Help & Support dialog will appear here'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report, idx) => {
                    const meta = STATUS_META[report.status];
                    const StatusIcon = meta.icon;
                    const rowNum = (page - 1) * pageSize + idx + 1;

                    return (
                      <TableRow
                        key={report.id}
                        className={cn(
                          'group cursor-pointer border-slate-200 hover:bg-slate-50',
                          report.status === 'new' && 'bg-blue-50/30'
                        )}
                        // Opening a report marks it read. Guarded on
                        // `new` so re-opening a replied or archived
                        // report does not quietly demote it.
                        onClick={() => {
                          setSelected(report);
                          if (report.status === 'new') {
                            handleStatusChange(report.id, 'read');
                          }
                        }}
                      >
                        <TableCell className="py-4 align-top font-mono text-xs text-slate-400">
                          {rowNum}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p
                            className={cn(
                              'max-w-[240px] truncate text-sm',
                              report.status === 'new'
                                ? 'font-bold text-slate-900'
                                : 'font-semibold text-slate-700'
                            )}
                          >
                            {report.message}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[180px] truncate text-sm text-slate-500">
                            {report.reporter_email || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          {report.account_name ? (
                            <p className="max-w-[150px] truncate text-sm text-slate-500">
                              {report.account_name}
                            </p>
                          ) : (
                            <p className="text-sm text-slate-400 italic">
                              Unattributed
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[150px] truncate text-sm text-slate-500">
                            {report.spreadsheet_name || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[110px] truncate font-mono text-xs text-slate-500">
                            {report.addon_version || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              meta.bg,
                              meta.text
                            )}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs whitespace-nowrap text-slate-400">
                            {formatDistanceToNow(new Date(report.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const ok = await confirm({
                                title: 'Delete this report?',
                                description:
                                  'This report and its replies will be removed permanently.',
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                                variant: 'destructive',
                              });
                              if (ok) handleDelete(report.id);
                            }}
                          >
                            <span className="sr-only">Delete report</span>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination footer */}
        <div className="flex shrink-0 flex-col items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 p-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const next = Number(v);
                if (!Number.isFinite(next) || next <= 0) return;
                setPageSize(next);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px] border-none bg-transparent px-2 py-0 text-slate-900 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <span className="sr-only">Previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <span className="sr-only">Next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {selected && (
        <DetailDrawer
          report={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onReplied={handleReplied}
        />
      )}
    </div>
  );
}
