'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Download,
  Building2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { AccountSummary } from '@/types/super-admin';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ACCOUNT_ACTIVITY_LABEL,
  accountActivityTooltip,
  deriveAccountActivity,
} from '@/lib/super-admin/account-status';

export default function SuperAdminAccountsPage() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [whatsappFilter, setWhatsappFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle filter changes (reset page)
  const handleStatusChange = (val: string | null) => {
    if (val) setStatusFilter(val);
    setPage(1);
  };
  const handleWhatsappChange = (val: string | null) => {
    if (val) setWhatsappFilter(val);
    setPage(1);
  };
  const handleSortChange = (val: string | null) => {
    if (val) setSortBy(val);
    setPage(1);
  };

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      params.set('status', statusFilter);
      params.set('whatsapp', whatsappFilter);
      params.set('sortBy', sortBy);
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }

      const res = await fetch(`/api/super-admin/accounts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();

      setAccounts(data.accounts || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, whatsappFilter, sortBy, debouncedSearch]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      params.set('whatsapp', whatsappFilter);
      params.set('sortBy', sortBy);
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }

      // Trigger download
      window.location.href = `/api/super-admin/accounts/export?${params.toString()}`;
    } finally {
      // Small delay to let the download start before resetting state if we wanted to show a spinner
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Main Container */}
      <div className="flex h-[calc(100vh-8.5rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Filter Bar */}
        <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 p-3 xl:flex-row xl:items-center">
          <div className="flex w-full items-center gap-3 xl:w-auto">
            <div className="relative w-full max-w-md xl:w-[320px]">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by account name or owner email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full border-slate-200 bg-white pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-1"
              />
            </div>
            {/* Accounts Count Badge */}
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {isLoading
                ? 'Loading…'
                : `${total} account${total === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-9 w-[130px] border-slate-200 bg-white text-xs text-slate-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>

            <Select value={whatsappFilter} onValueChange={handleWhatsappChange}>
              <SelectTrigger className="h-9 w-[145px] border-slate-200 bg-white text-xs text-slate-900">
                <SelectValue placeholder="WhatsApp" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
                <SelectItem value="all">WhatsApp: All</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="disconnected">Disconnected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="h-9 w-[135px] border-slate-200 bg-white text-xs text-slate-900">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="most_active">Most Active</SelectItem>
                <SelectItem value="most_members">Most Members</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="h-9 border-slate-700 bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 hover:text-white"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="flex flex-col items-center p-8 text-center text-red-400">
              <AlertCircle className="mb-2 h-8 w-8" />
              <p>Failed to load accounts. Please try again.</p>
            </div>
          ) : (
            <Table containerClassName="overflow-visible">
              <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:border-b [&_th]:border-slate-200 [&_th]:bg-slate-50">
                <TableRow className="border-b border-slate-200 hover:bg-transparent">
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Account
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Owner
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Members
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Contacts
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-right text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Messages (30d)
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-center text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    WhatsApp
                  </TableHead>
                  <TableHead className="h-8 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Created
                  </TableHead>
                  <TableHead className="h-8 w-14 bg-slate-50 px-3 py-1.5 text-center text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && accounts.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-slate-500"
                    >
                      Loading accounts...
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-slate-500"
                    >
                      No accounts found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <TableRow
                      key={acc.account_id}
                      className="group border-b border-slate-100 transition-colors hover:bg-slate-50/80"
                    >
                      <TableCell className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 shrink-0 rounded-md border-slate-200 bg-slate-100">
                            <AvatarFallback className="text-primary rounded-md bg-slate-100 text-[10px]">
                              <Building2 className="h-3.5 w-3.5" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 leading-tight text-slate-900">
                              <span className="truncate text-xs font-semibold">
                                {acc.account_name}
                              </span>
                              {acc.is_banned ? (
                                <span
                                  className="py-0.2 shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1 text-[9px] font-bold tracking-wider text-red-600 uppercase"
                                  title="Banned by a super admin — no access, regardless of activity."
                                >
                                  Banned
                                </span>
                              ) : (
                                (() => {
                                  const input = {
                                    whatsappStatus: acc.whatsapp_status,
                                    messages30d: acc.messages_30d,
                                  };
                                  const activity = deriveAccountActivity(input);
                                  return (
                                    <span
                                      className={
                                        activity === 'active'
                                          ? 'py-0.2 shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1 text-[9px] font-bold tracking-wider text-emerald-700 uppercase'
                                          : 'py-0.2 shrink-0 rounded border border-slate-200 bg-slate-100 px-1 text-[9px] font-bold tracking-wider text-slate-500 uppercase'
                                      }
                                      title={accountActivityTooltip(input)}
                                    >
                                      {ACCOUNT_ACTIVITY_LABEL[activity]}
                                    </span>
                                  );
                                })()
                              )}
                            </div>
                            <div className="mt-0.5 max-w-[220px] truncate font-mono text-[10px] leading-none text-slate-400">
                              {acc.account_id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="max-w-[200px] truncate text-xs text-slate-900">
                          {acc.owner_email || 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs text-slate-600">
                        {formatter.format(acc.member_count)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs text-slate-600">
                        {formatter.format(acc.contact_count)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs text-slate-600">
                        {formatter.format(acc.messages_30d)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-center">
                        {acc.whatsapp_status === 'connected' ? (
                          <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                            <div className="bg-primary h-1.5 w-1.5 rounded-full" />{' '}
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />{' '}
                            None
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-[11px] whitespace-nowrap text-slate-500">
                        {formatDistanceToNow(new Date(acc.account_created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-center">
                        <Link
                          href={`/super-admin/accounts/${acc.account_id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span className="sr-only">View</span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-2 sm:flex-row">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-medium text-slate-700">
              Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} of {total} accounts
            </span>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Rows per page:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[68px] border-slate-200 bg-white px-2 py-0 text-xs font-medium text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600">
              Page {page} of {totalPages || 1}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
