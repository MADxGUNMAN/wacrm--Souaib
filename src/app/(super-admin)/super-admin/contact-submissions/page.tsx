'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Mail,
  Clock,
  Eye,
  MessageSquare,
  Archive,
  Trash2,
  X,
  Loader2,
  Inbox,
  Building2,
  Phone,
  Send,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { ContactSubmission } from '@/types/super-admin';
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

// ────────────────────────────────────────────────
// Status badge config
// ────────────────────────────────────────────────
const STATUS_META: Record<
  ContactSubmission['status'],
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

// ────────────────────────────────────────────────
// Detail Drawer
// ────────────────────────────────────────────────
function DetailDrawer({
  submission,
  onClose,
  onStatusChange,
  onDelete,
}: {
  submission: ContactSubmission;
  onClose: () => void;
  onStatusChange: (id: string, status: ContactSubmission['status']) => void;
  onDelete: (id: string) => void;
}) {
  const confirm = useConfirm();
  const meta = STATUS_META[submission.status];
  const StatusIcon = meta.icon;

  // Reply form state
  const [showReply, setShowReply] = useState(false);
  const [replySubject, setReplySubject] = useState(
    `Re: ${submission.subject || 'Your inquiry on Replai'}`
  );
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const replyFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showReply && replyFormRef.current) {
      // Small timeout to allow the element to render/animate first
      setTimeout(() => {
        replyFormRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }, 50);
    }
  }, [showReply]);

  // Replies history
  interface Reply {
    id: string;
    subject: string;
    body: string;
    sent_by: string;
    created_at: string;
  }
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/super-admin/contact/replies?submissionId=${submission.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingReplies(false);
    }
  }, [submission.id]);

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
      const res = await fetch('/api/super-admin/contact/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: submission.email,
          subject: replySubject,
          body: replyBody,
          submissionId: submission.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');

      toast.success(`Reply sent to ${submission.email}`);
      onStatusChange(submission.id, 'replied');
      setShowReply(false);
      setReplyBody('');
      fetchReplies(); // Refresh replies list
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
              {submission.name}
            </h3>
            <a
              href={`mailto:${submission.email}`}
              className="text-sm text-[#25D366] hover:underline"
            >
              {submission.email}
            </a>
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
              {formatDistanceToNow(new Date(submission.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Phone & Company */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Phone
              </p>
              {submission.phone ? (
                <a
                  href={`tel:${submission.phone}`}
                  className="text-sm text-[#25D366] hover:underline"
                >
                  {submission.phone}
                </a>
              ) : (
                <p className="text-sm text-slate-400 italic">Not provided</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Company
              </p>
              <p className="text-sm font-medium text-slate-800">
                {submission.company || (
                  <span className="text-slate-400 italic">Not provided</span>
                )}
              </p>
            </div>
          </div>

          {/* Message */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Message
            </p>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                {submission.message}
              </p>
            </div>
          </div>

          {/* Replies History */}
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

          {/* Reply Form */}
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
                  Reply to {submission.name}
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
              const isActive = submission.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isActive}
                  onClick={() => onStatusChange(submission.id, s)}
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
              onClick={() => setShowReply(!showReply)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                showReply
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-[#25D366] text-white hover:bg-[#20b958]'
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {showReply ? 'Close Reply' : 'Reply'}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete this submission permanently?',
                  description:
                    'This contact inquiry will be permanently deleted and cannot be recovered.',
                  confirmText: 'Delete Submission',
                  cancelText: 'Cancel',
                  variant: 'destructive',
                });
                if (ok) {
                  onDelete(submission.id);
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
export default function ContactSubmissionsPage() {
  const confirm = useConfirm();
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Drawer
  const [selected, setSelected] = useState<ContactSubmission | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      params.set('status', statusFilter);
      params.set('sortBy', sortBy);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/super-admin/contact?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch submissions');
      const data = await res.json();

      setSubmissions(data.submissions || []);
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
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Actions
  const handleStatusChange = async (
    id: string,
    status: ContactSubmission['status']
  ) => {
    try {
      const res = await fetch('/api/super-admin/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Failed');

      // Update locally
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
      if (selected?.id === id) {
        setSelected((prev) => (prev ? { ...prev, status } : null));
      }
    } catch {
      // Ignore — will refresh on next load
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/super-admin/contact?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');

      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      setTotal((t) => t - 1);
      if (selected?.id === id) setSelected(null);
    } catch {
      // Ignore
    }
  };

  // Count badges
  const newCount = submissions.filter((s) => s.status === 'new').length;

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Main Container */}
      <div className="flex h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Filter Bar */}
        <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by name, email, subject, or message..."
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

        {/* Results Info */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2">
          <span className="text-xs font-medium text-slate-400">
            {isLoading
              ? 'Loading...'
              : `${total} submission${total === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="flex flex-col items-center p-8 text-center text-red-400">
              <AlertCircle className="mb-2 h-8 w-8" />
              <p>Failed to load submissions. Please try again.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-12 text-xs font-semibold text-slate-600 uppercase">
                    #
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Phone
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Company
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Message
                  </TableHead>
                  <TableHead className="text-center text-xs font-semibold text-slate-600 uppercase">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                    Date
                  </TableHead>
                  <TableHead className="w-20 text-center text-xs font-semibold text-slate-600 uppercase">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && submissions.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center text-slate-400"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading submissions...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : submissions.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Inbox className="h-10 w-10" />
                        <p className="font-medium">No submissions found</p>
                        <p className="text-xs">
                          Contact form submissions will appear here
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((sub, idx) => {
                    const meta = STATUS_META[sub.status];
                    const StatusIcon = meta.icon;
                    const rowNum = (page - 1) * pageSize + idx + 1;

                    return (
                      <TableRow
                        key={sub.id}
                        className={cn(
                          'group cursor-pointer border-slate-200 hover:bg-slate-50',
                          sub.status === 'new' && 'bg-blue-50/30'
                        )}
                        onClick={() => {
                          setSelected(sub);
                          if (sub.status === 'new') {
                            handleStatusChange(sub.id, 'read');
                          }
                        }}
                      >
                        <TableCell className="py-4 align-top font-mono text-xs text-slate-400">
                          {rowNum}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p
                            className={cn(
                              'max-w-[150px] truncate text-sm',
                              sub.status === 'new'
                                ? 'font-bold text-slate-900'
                                : 'font-semibold text-slate-700'
                            )}
                          >
                            {sub.name}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[180px] truncate text-sm text-slate-500">
                            {sub.email}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[150px] truncate text-sm text-slate-500">
                            {sub.phone || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[150px] truncate text-sm text-slate-500">
                            {sub.company || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <p className="max-w-[200px] truncate text-sm text-slate-500">
                            {sub.message}
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
                          <span className="text-xs text-slate-400">
                            {formatDistanceToNow(new Date(sub.created_at), {
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
                                title: 'Delete this submission?',
                                description:
                                  'This inquiry will be removed permanently.',
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                                variant: 'destructive',
                              });
                              if (ok) {
                                handleDelete(sub.id);
                              }
                            }}
                          >
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

        {/* Pagination Footer */}
        <div className="flex shrink-0 flex-col items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 p-4 sm:flex-row">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Rows per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => {
                setPageSize(Number(v));
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          submission={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
