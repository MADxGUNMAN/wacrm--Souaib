"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { 
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Download,
  Building2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AccountSummary } from "@/types/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function SuperAdminAccountsPage() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [whatsappFilter, setWhatsappFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const formatter = useMemo(() => new Intl.NumberFormat("en-US"), []);

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
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());
      params.set("status", statusFilter);
      params.set("whatsapp", whatsappFilter);
      params.set("sortBy", sortBy);
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const res = await fetch(`/api/super-admin/accounts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch accounts");
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
      params.set("status", statusFilter);
      params.set("whatsapp", whatsappFilter);
      params.set("sortBy", sortBy);
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      
      // Trigger download
      window.location.href = `/api/super-admin/accounts/export?${params.toString()}`;
    } finally {
      // Small delay to let the download start before resetting state if we wanted to show a spinner
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">All Accounts</h2>
          <p className="text-sm text-slate-400 mt-1">Manage and monitor all CRM accounts on the platform</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleExportCSV}
          disabled={isExporting}
          className="bg-slate-900 border-slate-700 text-white hover:bg-slate-800 hover:text-white"
        >
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Main Container */}
      <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm h-[calc(100vh-10rem)]">
        
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input 
              placeholder="Search by account name or owner email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 w-full md:w-[400px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[140px] bg-white border-slate-200 text-slate-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>

            <Select value={whatsappFilter} onValueChange={handleWhatsappChange}>
              <SelectTrigger className="w-[160px] bg-white border-slate-200 text-slate-900">
                <SelectValue placeholder="WhatsApp" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                <SelectItem value="all">WhatsApp: All</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="disconnected">Disconnected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[140px] bg-white border-slate-200 text-slate-900">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="most_active">Most Active</SelectItem>
                <SelectItem value="most_members">Most Members</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results Info */}
        <div className="px-6 py-2 border-b border-slate-200 bg-slate-50">
          <span className="text-xs font-medium text-slate-400">
            {isLoading ? "Loading..." : `Showing ${total} account${total === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-8 text-center text-red-400 flex flex-col items-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>Failed to load accounts. Please try again.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold">Account</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold">Owner</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold text-right">Members</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold text-right">Contacts</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold text-right">Messages (30d)</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold text-center">WhatsApp</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold">Created</TableHead>
                  <TableHead className="text-slate-600 text-xs uppercase font-semibold text-center w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && accounts.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      Loading accounts...
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow className="border-slate-200">
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      No accounts found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <TableRow key={acc.account_id} className="border-slate-200 hover:bg-slate-50 group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-md bg-slate-100 border-slate-200">
                            <AvatarFallback className="rounded-md bg-slate-100 text-primary text-xs">
                              <Building2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-slate-900 flex items-center gap-2">
                              {acc.account_name}
                              {acc.is_banned && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-red-500/20 text-red-400">
                                  Banned
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{acc.account_id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-900 text-sm">{acc.owner_email || "Unknown"}</div>
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {formatter.format(acc.member_count)}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {formatter.format(acc.contact_count)}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {formatter.format(acc.messages_30d)}
                      </TableCell>
                      <TableCell className="text-center">
                        {acc.whatsapp_status === 'connected' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" /> Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium border border-slate-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" /> None
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {formatDistanceToNow(new Date(acc.account_created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`/super-admin/accounts/${acc.account_id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                          <Eye className="h-4 w-4" />
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
        <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Rows per page:</span>
            <Select 
              value={pageSize.toString()} 
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="w-[70px] h-8 bg-transparent border-none text-slate-900 focus:ring-0 px-2 py-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
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
                className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
