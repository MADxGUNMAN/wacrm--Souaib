'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
  Inbox,
  Download,
  MoreHorizontal,
  Users,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type {
  NewsletterSubscriber,
  NewsletterStatus,
} from '@/types/super-admin';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────
// Status badge config
// ────────────────────────────────────────────────
const STATUS_META: Record<
  NewsletterStatus,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  pending: {
    label: 'Pending',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: Clock,
  },
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-green-50',
    text: 'text-green-700',
    icon: CheckCircle,
  },
  bounced: {
    label: 'Bounced',
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: AlertCircle,
  },
  unsubscribed: {
    label: 'Unsubscribed',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: XCircle,
  },
};

// ────────────────────────────────────────────────
// Stats Card
// ────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-xl border p-5">
      <div className={cn('rounded-lg p-2.5', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-foreground text-2xl font-bold">
          {value.toLocaleString()}
        </p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────
export default function NewsletterSubscribersPage() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    pending: 0,
    bounced: 0,
    unsubscribed: 0,
  });

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Action menu
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
        status: statusFilter,
        search,
        sortBy,
      });

      const res = await fetch(`/api/super-admin/newsletter?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      setSubscribers(data.subscribers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
      toast.error('Failed to load newsletter subscribers');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, sortBy]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, sortBy]);

  // ── Actions ──────────────────────────────────
  const handleStatusChange = async (
    id: string,
    newStatus: NewsletterStatus
  ) => {
    try {
      const res = await fetch('/api/super-admin/newsletter', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(`Subscriber marked as ${newStatus}`);
      setActionMenuId(null);
      fetchSubscribers();
    } catch {
      toast.error('Failed to update subscriber status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/super-admin/newsletter?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Subscriber deleted');
      setActionMenuId(null);
      fetchSubscribers();
    } catch {
      toast.error('Failed to delete subscriber');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    let success = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/super-admin/newsletter?id=${id}`, {
          method: 'DELETE',
        });
        if (res.ok) success++;
      } catch {
        // continue
      }
    }
    toast.success(`Deleted ${success} subscriber(s)`);
    setSelected(new Set());
    fetchSubscribers();
  };

  const handleExport = async () => {
    try {
      const statusParam =
        statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(
        `/api/super-admin/newsletter/export${statusParam}`
      );
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsletter_subscribers_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === subscribers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subscribers.map((s) => s.id)));
    }
  };

  // ── Search debounce ──────────────────────────
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Subscribers"
          value={stats.total}
          icon={Users}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Confirmed"
          value={stats.confirmed}
          icon={CheckCircle}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={TrendingUp}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Bounced"
          value={stats.bounced}
          icon={AlertTriangle}
          color="bg-red-50 text-red-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? 'newest')}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete {selected.size}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : subscribers.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-20">
            <Inbox className="mb-4 h-12 w-12 opacity-40" />
            <p className="text-lg font-medium">No subscribers yet</p>
            <p className="text-sm">
              Subscribers will appear here when people sign up via your
              newsletter form.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      selected.size === subscribers.length &&
                      subscribers.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="border-border rounded"
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Email Sent</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((sub) => {
                const meta = STATUS_META[sub.status];
                const StatusIcon = meta.icon;

                return (
                  <TableRow
                    key={sub.id}
                    className={cn(selected.has(sub.id) && 'bg-muted/50')}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(sub.id)}
                        onChange={() => toggleSelect(sub.id)}
                        className="border-border rounded"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
                        <span className="text-foreground max-w-[250px] truncate font-medium">
                          {sub.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                          meta.bg,
                          meta.text
                        )}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sub.email_sent ? (
                        <span className="text-xs font-medium text-green-600">
                          ✓ Delivered
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Not sent
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(sub.created_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-xs capitalize">
                        {(sub.source || 'footer_form').replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="hover:bg-accent hover:text-accent-foreground flex h-8 w-8 items-center justify-center rounded-md p-0 outline-none">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {sub.status !== 'confirmed' && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(sub.id, 'confirmed')
                              }
                            >
                              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                              Mark Confirmed
                            </DropdownMenuItem>
                          )}
                          {sub.status !== 'bounced' && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(sub.id, 'bounced')
                              }
                            >
                              <AlertCircle className="mr-2 h-4 w-4 text-red-600" />
                              Mark Bounced
                            </DropdownMenuItem>
                          )}
                          {sub.status !== 'unsubscribed' && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(sub.id, 'unsubscribed')
                              }
                            >
                              <XCircle className="mr-2 h-4 w-4 text-slate-500" />
                              Mark Unsubscribed
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(sub.id)}
                            className="text-red-600 focus:bg-red-50 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of{' '}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Removed click-away logic as DropdownMenu handles this internally */}
    </div>
  );
}
