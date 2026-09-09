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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, Users, CheckSquare, Square } from 'lucide-react';
import type { AudienceConfig } from '@/hooks/use-broadcast-sending';

interface AudiencePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: AudienceConfig;
  onUpdateAudience: (audience: AudienceConfig) => void;
  totalEstimatedCount: number | null;
  /**
   * Contacts in this audience who unsubscribed and will be skipped.
   *
   * Passed in rather than computed here: this dialog pages contacts 25 at a
   * time, so a count derived from loaded rows would disagree with the
   * summary that opened it.
   */
  suppressedCount?: number;
}

const PAGE_SIZE = 25;

export function AudiencePreviewDialog({
  open,
  onOpenChange,
  audience,
  onUpdateAudience,
  totalEstimatedCount,
  suppressedCount = 0,
}: AudiencePreviewDialogProps) {
  const supabase = createClient();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');

  // Standard field visibility
  const [emailVisible, setEmailVisible] = useState(true);
  const [companyVisible, setCompanyVisible] = useState(true);
  const [emailLabel, setEmailLabel] = useState('Email');
  const [companyLabel, setCompanyLabel] = useState('Company');

  // Cache resolved contact IDs for the current audience filter
  const resolvedIdsRef = useRef<string[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  // Manual exclusions set
  const excludedSet = new Set(audience.excludedContactIds ?? []);

  // Fetch field visibility configuration
  useEffect(() => {
    async function fetchFieldConfig() {
      const { data } = await supabase
        .from('custom_fields')
        .select('*')
        .in('field_key', ['email', 'company']);

      const fields = (data as CustomField[] | null) ?? [];
      const emailRow = fields.find((f) => f.field_key === 'email');
      const companyRow = fields.find((f) => f.field_key === 'company');

      setEmailVisible(emailRow?.visible !== false);
      setEmailLabel(emailRow?.field_name || 'Email');
      setCompanyVisible(companyRow?.visible !== false);
      setCompanyLabel(companyRow?.field_name || 'Company');
    }
    if (open) {
      void fetchFieldConfig();
    }
  }, [open, supabase]);

  // Resolve matching IDs based on audience selection
  const resolveAudienceIds = useCallback(async (): Promise<string[] | null> => {
    let baseIds: string[] | null = null;

    if (audience.type === 'all') {
      baseIds = null;
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);
      baseIds = Array.from(new Set((data ?? []).map((r) => r.contact_id)));
    } else if (
      audience.type === 'custom_field' &&
      audience.customField?.fieldId &&
      audience.customField.value
    ) {
      const { fieldId, operator, value } = audience.customField;
      let q = supabase
        .from('contact_custom_values')
        .select('contact_id')
        .eq('custom_field_id', fieldId);
      if (operator === 'is') q = q.eq('value', value);
      else if (operator === 'is_not') q = q.neq('value', value);
      else q = q.ilike('value', `%${value}%`);
      const { data } = await q;
      baseIds = Array.from(new Set((data ?? []).map((r) => r.contact_id)));
    } else if (audience.type === 'csv' && audience.csvContacts) {
      return []; // CSV contacts handled in memory
    }

    // Apply exclude tags
    let excludeSet = new Set<string>();
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
    }

    if (baseIds !== null) {
      return baseIds.filter((id) => !excludeSet.has(id));
    }

    if (excludeSet.size > 0) {
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id')
        .order('created_at', { ascending: false });
      return (allContacts ?? [])
        .map((c) => c.id)
        .filter((id) => !excludeSet.has(id));
    }

    return null; // All contacts, no tag excludes
  }, [audience, supabase]);

  const fetchBatch = useCallback(
    async (pageIndex: number, isInitial: boolean = false) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        // Handle CSV audience type
        if (audience.type === 'csv' && audience.csvContacts) {
          const allCsv = audience.csvContacts.map((c, idx) => ({
            id: `csv-${idx}`,
            phone: c.phone,
            name: c.name || '',
            email: '',
            company: '',
            account_id: '',
            user_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })) as Contact[];

          const slice = allCsv.slice(from, to + 1);
          setContacts((prev) => {
            const map = new Map<string, Contact>();
            if (pageIndex > 0) prev.forEach((c) => map.set(c.id, c));
            slice.forEach((c) => map.set(c.id, c));
            return Array.from(map.values());
          });
          setTotalCount(allCsv.length);
          setHasMore(to + 1 < allCsv.length);
          return;
        }

        // Resolve IDs once on initial load
        if (pageIndex === 0) {
          resolvedIdsRef.current = await resolveAudienceIds();
        }

        const effectiveIds = resolvedIdsRef.current;

        if (effectiveIds !== null && effectiveIds.length === 0) {
          setContacts([]);
          setTotalCount(0);
          setHasMore(false);
          return;
        }

        let query = supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .order('name', { ascending: true })
          .range(from, to);

        if (effectiveIds !== null) {
          query = query.in('id', effectiveIds);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        const newContacts = (data ?? []) as Contact[];
        setContacts((prev) => {
          const map = new Map<string, Contact>();
          if (pageIndex > 0) prev.forEach((c) => map.set(c.id, c));
          newContacts.forEach((c) => map.set(c.id, c));
          return Array.from(map.values());
        });
        const countNum = count ?? 0;
        setTotalCount(countNum);
        setHasMore(from + newContacts.length < countNum);
      } catch (err) {
        console.error('Failed to load audience contacts preview:', err);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [audience, resolveAudienceIds, supabase]
  );

  // Initial load when opened
  useEffect(() => {
    if (open) {
      setPage(0);
      setContacts([]);
      setHasMore(true);
      setTotalCount(0);
      setSearch('');
      void fetchBatch(0, true);
    }
  }, [open, fetchBatch]);

  // Infinite scroll observer: triggers next 25 contacts
  useEffect(() => {
    if (!open || loading || loadingMore || !hasMore) return;

    const currentSentinel = sentinelRef.current;
    if (!currentSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !fetchingRef.current) {
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

  function toggleContact(contactId: string) {
    const next = new Set(excludedSet);
    if (next.has(contactId)) {
      next.delete(contactId);
    } else {
      next.add(contactId);
    }
    onUpdateAudience({
      ...audience,
      excludedContactIds: Array.from(next),
    });
  }

  function handleSelectAll() {
    onUpdateAudience({
      ...audience,
      excludedContactIds: [],
    });
  }

  function handleDeselectAll() {
    const allIds =
      resolvedIdsRef.current !== null && resolvedIdsRef.current.length > 0
        ? resolvedIdsRef.current
        : contacts.map((c) => c.id);

    onUpdateAudience({
      ...audience,
      excludedContactIds: Array.from(new Set(allIds)),
    });
  }

  // Live in-memory search across currently loaded results
  const filteredContacts = contacts.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const name = c.name?.toLowerCase() || '';
    const phone = c.phone?.toLowerCase() || '';
    const email = c.email?.toLowerCase() || '';
    const company = c.company?.toLowerCase() || '';
    return (
      name.includes(term) ||
      phone.includes(term) ||
      email.includes(term) ||
      company.includes(term)
    );
  });

  const totalBaseCount = totalEstimatedCount ?? totalCount;
  const excludedCount = excludedSet.size;
  // Unsubscribed contacts come off the selected count too, so this badge
  // matches the recipient number on the step behind the dialog.
  const activeSelectedCount = Math.max(
    0,
    totalBaseCount - excludedCount - suppressedCount
  );

  const loadedSelectedCount = contacts.filter(
    (c) => !excludedSet.has(c.id)
  ).length;
  const allLoadedSelected =
    contacts.length > 0 && loadedSelectedCount === contacts.length;
  const someLoadedSelected =
    loadedSelectedCount > 0 && loadedSelectedCount < contacts.length;

  const audienceLabel =
    audience.type === 'all'
      ? 'All Contacts'
      : audience.type === 'tags'
        ? 'Filtered by Tags'
        : audience.type === 'custom_field'
          ? 'Custom Field Filter'
          : 'CSV Upload';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-border bg-muted/20 border-b px-6 pt-6 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Users className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-foreground truncate text-base font-semibold">
                    Review & Select Recipients
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary bg-primary/5 shrink-0 font-mono text-[11px]"
                  >
                    {activeSelectedCount} of {totalBaseCount} selected
                  </Badge>
                  {excludedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-400"
                    >
                      {excludedCount} excluded
                    </Badge>
                  )}
                  {suppressedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-400"
                      title="These contacts unsubscribed from marketing messages and cannot be selected."
                    >
                      {suppressedCount} unsubscribed
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-muted-foreground mt-0.5 text-xs">
                  Targeting:{' '}
                  <strong className="text-foreground font-medium">
                    {audienceLabel}
                  </strong>
                  {audience.excludeTagIds &&
                    audience.excludeTagIds.length > 0 && (
                      <span className="text-red-400">
                        {' '}
                        (Excluding {audience.excludeTagIds.length} tag
                        {audience.excludeTagIds.length > 1 ? 's' : ''})
                      </span>
                    )}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Quick Toolbar: Search & Select All/Deselect All */}
          {totalBaseCount > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, phone, email, or company..."
                  className="bg-muted border-border h-8 pl-8 text-xs"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={excludedCount === 0}
                  className="border-border h-8 gap-1 px-2.5 text-[11px]"
                >
                  <CheckSquare className="size-3" />
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={activeSelectedCount === 0}
                  className="border-border text-muted-foreground hover:text-destructive h-8 gap-1 px-2.5 text-[11px]"
                >
                  <Square className="size-3" />
                  Deselect All
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Scrollable Content Table */}
        <div className="max-h-[55vh] min-h-[300px] flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-2">
              <Loader2 className="text-primary size-6 animate-spin" />
              <p className="text-sm">Loading audience recipients...</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
              <Users className="mb-1 size-8 opacity-40" />
              <p className="text-foreground text-sm font-medium">
                No recipients found
              </p>
              <p className="max-w-xs text-xs">
                No contacts match your current audience selection and exclude
                rules.
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-muted-foreground flex h-48 flex-col items-center justify-center gap-1.5 px-4 text-center">
              <Search className="mb-1 size-6 opacity-40" />
              <p className="text-sm">
                No recipients match &quot;{search}&quot;
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/90 border-border sticky top-0 z-10 border-b shadow-xs backdrop-blur">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allLoadedSelected}
                      indeterminate={!allLoadedSelected && someLoadedSelected}
                      onCheckedChange={() => {
                        if (allLoadedSelected) {
                          handleDeselectAll();
                        } else {
                          handleSelectAll();
                        }
                      }}
                      aria-label="Select/Deselect all loaded contacts"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Name</TableHead>
                  <TableHead className="text-xs font-semibold">Phone</TableHead>
                  {emailVisible && (
                    <TableHead className="hidden text-xs font-semibold sm:table-cell">
                      {emailLabel}
                    </TableHead>
                  )}
                  {companyVisible && (
                    <TableHead className="hidden text-xs font-semibold md:table-cell">
                      {companyLabel}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => {
                  const isExcluded = excludedSet.has(contact.id);
                  const isSelected = !isExcluded;

                  return (
                    <TableRow
                      key={contact.id}
                      onClick={() => toggleContact(contact.id)}
                      className={`border-border cursor-pointer transition-colors ${
                        isSelected
                          ? 'hover:bg-muted/40'
                          : 'bg-muted/10 hover:bg-muted/30 opacity-60'
                      }`}
                    >
                      <TableCell
                        className="py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleContact(contact.id)}
                          aria-label={`Select ${contact.name || contact.phone}`}
                        />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <p
                          className={`truncate text-xs font-medium ${
                            isSelected
                              ? 'text-foreground'
                              : 'text-muted-foreground line-through'
                          }`}
                        >
                          {contact.name || (
                            <span className="text-muted-foreground italic">
                              Unnamed
                            </span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-foreground font-mono text-xs font-medium">
                          {contact.phone}
                        </span>
                      </TableCell>
                      {emailVisible && (
                        <TableCell className="text-muted-foreground hidden py-2.5 text-xs sm:table-cell">
                          {contact.email ? (
                            <span className="block max-w-[170px] truncate">
                              {contact.email}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                      )}
                      {companyVisible && (
                        <TableCell className="text-muted-foreground hidden py-2.5 text-xs md:table-cell">
                          {contact.company ? (
                            <span className="block max-w-[150px] truncate">
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
          <div ref={sentinelRef} className="flex justify-center py-2">
            {loadingMore && (
              <div className="text-muted-foreground flex items-center gap-2 py-3 text-xs">
                <Loader2 className="text-primary size-3.5 animate-spin" />
                <span>Loading more recipients...</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
