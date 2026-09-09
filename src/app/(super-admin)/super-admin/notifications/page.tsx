'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowUpRight,
  Ban,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  FileWarning,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useSuperAdminNotifications,
  type SuperAdminNotification,
  type SuperAdminNotificationType,
} from '@/hooks/use-super-admin-notifications';

const TYPE_LABELS: Record<SuperAdminNotificationType, string> = {
  account_created: 'New workspace',
  account_banned: 'Workspace banned',
  payment_requested: 'Payment awaiting review',
  payment_verified: 'Payment verified',
  payment_rejected: 'Payment rejected',
  contact_submitted: 'Website enquiry',
  newsletter_subscribed: 'Newsletter signup',
  template_rejected: 'Template rejected',
  subscription_expiring: 'Subscription expiring',
};

const ALL_TYPES = Object.keys(TYPE_LABELS) as SuperAdminNotificationType[];

const SEVERITY_STYLES: Record<SuperAdminNotification['severity'], string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
};

type ReadFilter = 'all' | 'unread' | 'read';

interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
  recent24Hours: number;
  byType: Partial<Record<SuperAdminNotificationType, number>>;
}

interface NotificationResponse {
  notifications: SuperAdminNotification[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  unreadCount: number;
  summary: NotificationSummary;
}

const EMPTY_DATA: NotificationResponse = {
  notifications: [],
  total: 0,
  totalPages: 1,
  page: 1,
  pageSize: 20,
  unreadCount: 0,
  summary: { total: 0, unread: 0, critical: 0, recent24Hours: 0, byType: {} },
};

function NotificationIcon({ type }: { type: SuperAdminNotificationType }) {
  const className = 'h-4 w-4';
  switch (type) {
    case 'account_created':
      return <UserPlus className={`${className} text-emerald-600`} />;
    case 'account_banned':
      return <Ban className={`${className} text-red-600`} />;
    case 'payment_requested':
      return <CreditCard className={`${className} text-amber-600`} />;
    case 'payment_verified':
      return <CheckCircle2 className={`${className} text-emerald-600`} />;
    case 'payment_rejected':
      return <XCircle className={`${className} text-red-600`} />;
    case 'contact_submitted':
      return <Mail className={`${className} text-blue-600`} />;
    case 'newsletter_subscribed':
      return <Megaphone className={`${className} text-violet-600`} />;
    case 'template_rejected':
      return <FileWarning className={`${className} text-amber-600`} />;
    case 'subscription_expiring':
      return <Clock className={`${className} text-orange-600`} />;
  }
}

export default function SuperAdminNotificationsPage() {
  const router = useRouter();
  const {
    notifications: liveNotifications,
    unreadCount,
    unavailable,
    markAllRead,
    markRead,
  } = useSuperAdminNotifications();

  const [data, setData] = useState<NotificationResponse>(EMPTY_DATA);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState<
    'all' | SuperAdminNotificationType
  >('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchNotifications = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        read: readFilter,
        type: typeFilter,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      try {
        const response = await fetch(
          `/api/super-admin/notifications?${params}`,
          {
            cache: 'no-store',
            signal,
          }
        );
        const payload = (await response.json()) as NotificationResponse & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? 'Failed to load notifications');
        setData(payload);
        if (payload.page > payload.totalPages) setPage(payload.totalPages);
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        )
          return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load notifications';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, page, pageSize, readFilter, typeFilter]
  );

  const liveHeadId = liveNotifications[0]?.id ?? null;
  useEffect(() => {
    const controller = new AbortController();
    void fetchNotifications(controller.signal, data.notifications.length > 0);
    return () => controller.abort();
    // The live store is intentionally only an invalidation signal; archive
    // rows always come from the protected, database-paginated endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNotifications, liveHeadId, unreadCount, refreshToken]);

  const changeReadFilter = (value: ReadFilter) => {
    setReadFilter(value);
    setPage(1);
  };

  const handleMarkAllRead = async () => {
    const succeeded = await markAllRead();
    if (!succeeded) {
      toast.error('Could not mark notifications as read. Please try again.');
      return;
    }
    setData((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        is_read: true,
      })),
      unreadCount: 0,
      summary: { ...current.summary, unread: 0 },
    }));
    setRefreshToken((token) => token + 1);
    toast.success('All notifications marked as read');
  };

  const openNotification = async (notification: SuperAdminNotification) => {
    if (!notification.is_read) {
      setData((current) => ({
        ...current,
        notifications: current.notifications.map((row) =>
          row.id === notification.id ? { ...row, is_read: true } : row
        ),
      }));
      const succeeded = await markRead(notification.id);
      if (!succeeded) {
        toast.error('Could not save the read status');
        setRefreshToken((token) => token + 1);
        return;
      }
    }
    if (notification.link) router.push(notification.link);
  };

  const visibleCategories = useMemo(
    () =>
      ALL_TYPES.map((type) => ({
        type,
        count: data.summary.byType[type] ?? 0,
      }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count),
    [data.summary.byType]
  );

  const firstResult =
    data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastResult = Math.min(data.page * data.pageSize, data.total);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshToken((token) => token + 1)}
          disabled={refreshing}
          className="gap-2 bg-white"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
        <Button
          size="sm"
          onClick={() => void handleMarkAllRead()}
          disabled={unreadCount === 0}
          className="gap-2 bg-[#25D366] text-white hover:bg-[#20ba59]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Mark all read
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'All notifications',
            value: data.summary.total,
            icon: Bell,
            tone: 'text-slate-700 bg-slate-100',
          },
          {
            label: 'Unread',
            value: data.summary.unread,
            icon: Inbox,
            tone: 'text-blue-700 bg-blue-50',
          },
          {
            label: 'Critical',
            value: data.summary.critical,
            icon: ShieldAlert,
            tone: 'text-red-700 bg-red-50',
          },
          {
            label: 'Last 24 hours',
            value: data.summary.recent24Hours,
            icon: Clock,
            tone: 'text-emerald-700 bg-emerald-50',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-950 tabular-nums">
                  {card.value}
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, workspace or details…"
                  className="pl-9"
                />
              </div>
              <Select
                value={readFilter}
                onValueChange={(value) => changeReadFilter(value as ReadFilter)}
              >
                <SelectTrigger className="w-full lg:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="unread">Unread only</SelectItem>
                  <SelectItem value="read">Read only</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value as 'all' | SuperAdminNotificationType);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full lg:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {ALL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center">
              <Loader2 className="text-primary h-6 w-6 animate-spin" />
            </div>
          ) : unavailable ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <Bell className="mb-3 h-8 w-8 text-slate-300" />
              <p className="font-medium text-slate-700">
                Notifications are not configured
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Run the pending database migrations, then reload this page.
              </p>
            </div>
          ) : error && data.notifications.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <ShieldAlert className="mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-slate-800">
                Could not load notifications
              </p>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setRefreshToken((token) => token + 1)}
              >
                Try again
              </Button>
            </div>
          ) : data.notifications.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <CheckCircle2 className="mb-3 h-9 w-9 text-emerald-400" />
              <p className="font-medium text-slate-800">
                No notifications found
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Try changing the status, category, or search filters.
              </p>
            </div>
          ) : (
            <div className={refreshing ? 'opacity-70 transition-opacity' : ''}>
              {data.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`group flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-0 hover:bg-slate-50 ${notification.is_read ? '' : 'bg-blue-50/40'}`}
                >
                  <div className="mt-0.5 rounded-full border border-slate-200 bg-white p-2.5 shadow-sm">
                    <NotificationIcon type={notification.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm ${notification.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-950'}`}
                      >
                        {notification.title}
                      </p>
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLES[notification.severity]}`}
                      >
                        {TYPE_LABELS[notification.type]}
                      </span>
                    </div>
                    {notification.body ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {notification.body}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-slate-400">
                      {notification.account_name
                        ? `${notification.account_name} · `
                        : ''}
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    {!notification.is_read ? (
                      <span
                        className="h-2 w-2 rounded-full bg-blue-600"
                        aria-label="Unread"
                      />
                    ) : null}
                    {notification.link ? (
                      <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-600" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Showing {firstResult}–{lastResult} of {data.total}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                onPageChange={setPage}
                disabled={loading || refreshing}
              />
            </div>
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Categories
              </h2>
              <span className="text-[11px] text-slate-400">All time</span>
            </div>
            <div className="mt-3 space-y-1">
              {visibleCategories.length === 0 ? (
                <p className="py-3 text-xs text-slate-400">
                  No category activity yet.
                </p>
              ) : (
                visibleCategories.map(({ type, count }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTypeFilter(type);
                      setPage(1);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="rounded-md bg-slate-100 p-1.5">
                      <NotificationIcon type={type} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
                      {TYPE_LABELS[type]}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 tabular-nums">
                      {count}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Realtime is active
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-800/80">
              New events appear automatically. Returning to this tab also
              reconciles anything missed while the browser was asleep.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Quick actions
            </h2>
            <div className="mt-3 space-y-1">
              {[
                {
                  href: '/super-admin/payments',
                  label: 'Review payments',
                  icon: CreditCard,
                },
                {
                  href: '/super-admin/accounts',
                  label: 'Manage workspaces',
                  icon: UserPlus,
                },
                {
                  href: '/super-admin/contact-submissions',
                  label: 'Open enquiries',
                  icon: Mail,
                },
              ].map((action) => (
                <Button
                  key={action.href}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-600"
                  onClick={() => router.push(action.href)}
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.label}
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
