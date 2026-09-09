'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Contact, CustomField } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Loader2,
  Search,
  Users,
  Eye,
  Mail,
  Building2,
  Phone,
  FileSpreadsheet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface FieldContactsPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: CustomField | null;
  emailVisible: boolean;
  companyVisible: boolean;
  emailLabel: string;
  companyLabel: string;
}

interface CustomValueWithContact {
  id: string;
  contact_id: string;
  value: string;
  contact: Contact | null;
}

const PAGE_SIZE = 25;

export function FieldContactsPreviewDialog({
  open,
  onOpenChange,
  field,
  emailVisible,
  companyVisible,
  emailLabel,
  companyLabel,
}: FieldContactsPreviewDialogProps) {
  const t = useTranslations('Contacts.customFields');
  const supabase = createClient();

  const [items, setItems] = useState<CustomValueWithContact[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchBatch = useCallback(
    async (pageIndex: number, isInitial: boolean = false) => {
      if (!field?.id) return;
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        const { data, count, error } = await supabase
          .from('contact_custom_values')
          .select('id, contact_id, value, contact:contacts(*)', {
            count: 'exact',
          })
          .eq('custom_field_id', field.id)
          .not('value', 'is', null)
          .neq('value', '')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const newItems: CustomValueWithContact[] = (data ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row: any) => ({
            id: row.id,
            contact_id: row.contact_id,
            value: row.value || '',
            contact: row.contact as Contact | null,
          })
        );

        setItems((prev) => (pageIndex === 0 ? newItems : [...prev, ...newItems]));
        const countNum = count ?? 0;
        setTotalCount(countNum);
        setHasMore(from + newItems.length < countNum);
      } catch (err) {
        console.error('Failed to load field contacts:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [field?.id, supabase]
  );

  // Reset and fetch initial batch when dialog opens
  useEffect(() => {
    if (open && field?.id) {
      setPage(0);
      setItems([]);
      setHasMore(true);
      setTotalCount(0);
      setSearch('');
      void fetchBatch(0, true);
    }
  }, [open, field?.id, fetchBatch]);

  // Infinite scroll observer: trigger next page when sentinel is in view
  useEffect(() => {
    if (!open || loading || loadingMore || !hasMore) return;

    const currentSentinel = sentinelRef.current;
    if (!currentSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((prevPage) => {
            const nextPage = prevPage + 1;
            void fetchBatch(nextPage, false);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(currentSentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loading, loadingMore, fetchBatch]);

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Filter in memory for instant typing search
  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const name = item.contact?.name?.toLowerCase() || '';
    const phone = item.contact?.phone?.toLowerCase() || '';
    const email = item.contact?.email?.toLowerCase() || '';
    const company = item.contact?.company?.toLowerCase() || '';
    const val = item.value.toLowerCase();
    return (
      name.includes(term) ||
      phone.includes(term) ||
      email.includes(term) ||
      company.includes(term) ||
      val.includes(term)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileSpreadsheet className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold truncate text-foreground">
                    {field?.field_name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="text-[11px] font-mono border-primary/30 text-primary bg-primary/5 shrink-0"
                  >
                    {totalCount} {totalCount === 1 ? 'contact' : 'contacts'}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Contacts with recorded values for this custom field
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Quick Search bar */}
          {totalCount > 0 && (
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, phone, email, or value..."
                className="pl-8 h-8 text-xs bg-muted border-border"
              />
            </div>
          )}
        </DialogHeader>

        {/* Scrollable Content Table */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[55vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">Loading contacts...</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-center px-4">
              <Users className="size-8 opacity-40 mb-1" />
              <p className="text-sm font-medium text-foreground">No stored values</p>
              <p className="text-xs max-w-xs">
                No contacts currently have a recorded value for &quot;{field?.field_name}&quot;.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-1.5 text-muted-foreground text-center px-4">
              <Search className="size-6 opacity-40 mb-1" />
              <p className="text-sm">No contacts match &quot;{search}&quot;</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur z-10 border-b border-border shadow-xs">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Name</TableHead>
                  <TableHead className="text-xs font-semibold">
                    {field?.field_name}
                  </TableHead>
                  {emailVisible && (
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">
                      {emailLabel}
                    </TableHead>
                  )}
                  {companyVisible && (
                    <TableHead className="text-xs font-semibold hidden md:table-cell">
                      {companyLabel}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const contact = item.contact;
                  return (
                    <TableRow
                      key={item.id}
                      className="border-border hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                              {getInitials(contact?.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">
                              {contact?.name || (
                                <span className="italic text-muted-foreground">
                                  Unnamed
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono truncate">
                              {contact?.phone || '-'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground font-medium border border-border/80">
                          {item.value}
                        </span>
                      </TableCell>
                      {emailVisible && (
                        <TableCell className="py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {contact?.email ? (
                            <span className="truncate block max-w-[160px]">
                              {contact.email}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                      )}
                      {companyVisible && (
                        <TableCell className="py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                          {contact?.company ? (
                            <span className="truncate block max-w-[140px]">
                              {contact.company}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Sentinel for Infinite Scroll */}
          <div ref={sentinelRef} className="py-2 flex justify-center">
            {loadingMore && (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span>Loading more contacts...</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
