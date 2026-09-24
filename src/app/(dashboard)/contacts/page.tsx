'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, CustomField } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  SlidersHorizontal,
  Filter,
  Smartphone,
  X,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactReviewDialog } from '@/components/settings/coexistence-panel';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import { useResizableColumns } from '@/hooks/use-resizable-columns';
import {
  CONTACT_SOURCES,
  getContactSource,
  type ContactSource,
} from '@/lib/contacts/contact-source';
import { PhoneDisplay } from '@/components/ui/phone-display';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const tSource = useTranslations('Contacts.sources');
  const router = useRouter();
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [openingChatContactId, setOpeningChatContactId] = useState<
    string | null
  >(null);

  const openContactChat = async (contact: Contact) => {
    setOpeningChatContactId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        conversationId?: string;
        error?: string;
      };
      if (!res.ok || !data.conversationId) {
        throw new Error(data.error || 'Failed to open conversation');
      }
      router.push(`/inbox?c=${data.conversationId}`);
    } catch (err) {
      console.error('[contacts] failed to open chat:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to open chat');
      setOpeningChatContactId(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  /**
   * Source filter — contacts shown must have ANY of these sources (OR),
   * composed with the tag filter as AND.
   *
   * Resolved server-side in BOTH query branches (and in
   * `fetchAllMatchingIds`), never by filtering the loaded page: the page is
   * 25 rows of a possibly 9,000-row account, so a client-side filter would
   * describe a set the pagination total and bulk delete disagree with.
   */
  const [selectedSources, setSelectedSources] = useState<ContactSource[]>([]);

  // Excel / Google Sheets style column resizing with persistent localStorage widths
  const { getWidth, startResize, resetWidth, isResizing } = useResizableColumns(
    {
      storageKey: 'wacrm_contacts_table_widths_v1',
      defaultWidths: {
        name: 180,
        phone: 150,
        email: 210,
        company: 180,
        tags: 160,
        source: 130,
        created_at: 130,
      },
      minWidth: 80,
      maxWidth: 600,
    }
  );

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection. `selected` holds ids from the loaded page only.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /**
   * "Every contact matching the current filters", not just this page.
   *
   * A flag rather than 1,788 ids in state: the user has not loaded those
   * pages, so there are no ids to hold. The set is resolved at delete time
   * from the same filters the table uses, which also means it stays correct
   * if the data changed since the box was ticked.
   */
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  /** Progress across delete chunks, so a 1,788-row delete is not a blind wait. */
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Phone-contact sync (WhatsApp Coexistence).
  const [phoneSyncOpen, setPhoneSyncOpen] = useState(false);
  /**
   * How many numbers from the phone's address book can still be imported.
   *
   * Counted live rather than cached, because it changes from BOTH directions:
   * a new sync adds rows, and deleting a CRM contact returns its staged row to
   * pending (migration 074). So after deleting 100 contacts this reads 100
   * again, which is exactly the behaviour that was asked for.
   *
   * Counts 'skipped' as well as 'pending'. Pending-only was wrong: skipping
   * everything set the count to zero, the button hid itself, and the numbers
   * became unreachable from this page even though every one of them was still
   * importable in one click.
   */
  const [stagedPending, setStagedPending] = useState(0);
  /**
   * Every staged row, whatever its status — the phone's address book was
   * handed over at some point.
   *
   * This, not the actionable count, decides whether the button EXISTS. Once
   * the last number was imported the button disappeared, taking the only route
   * to the list of what came from the phone with it. Now the button stays and
   * simply loses its badge, so the dialog remains reachable as a record.
   *
   * Still zero for an account with no Coexistence connection, so the button is
   * never advertised to someone who has nothing to sync.
   */
  const [stagedTotal, setStagedTotal] = useState(0);

  const fetchStagedPending = useCallback(async () => {
    const base = () =>
      supabase
        .from('coexistence_staged_contacts')
        .select('id', { count: 'exact', head: true });

    const [actionable, everything] = await Promise.all([
      base().in('status', ['pending', 'skipped']),
      // 'removed' is excluded: Meta reports those as deleted from the phone,
      // so they are not part of what this dialog shows.
      base().in('status', ['pending', 'skipped', 'imported']),
    ]);

    // Silent on failure: an account with no WhatsApp connection has no staged
    // table rows to read, and that is not an error worth interrupting the
    // contacts list for.
    if (!actionable.error) setStagedPending(actionable.count ?? 0);
    if (!everything.error) setStagedTotal(everything.count ?? 0);
  }, [supabase]);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValuesByContact, setCustomValuesByContact] = useState<
    Record<string, Record<string, string>>
  >({});

  // Horizontal scroll tracking and control for wide contacts table
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [tableHasOverflow, setTableHasOverflow] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbMetrics, setThumbMetrics] = useState({ width: 25, left: 0 });

  const updateScrollMetrics = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const hasOverflow = maxScroll > 4;

    setTableHasOverflow(hasOverflow);
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(hasOverflow && scrollLeft < maxScroll - 2);

    if (hasOverflow && maxScroll > 0) {
      const progress = (scrollLeft / maxScroll) * 100;
      setScrollProgress(progress);

      const visibleRatio = clientWidth / scrollWidth;
      const thumbWidth = Math.min(80, Math.max(20, visibleRatio * 100));
      const thumbLeft = (scrollLeft / maxScroll) * (100 - thumbWidth);
      setThumbMetrics({ width: thumbWidth, left: thumbLeft });
    } else {
      setScrollProgress(0);
      setThumbMetrics({ width: 100, left: 0 });
    }
  }, []);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    updateScrollMetrics();

    el.addEventListener('scroll', updateScrollMetrics, { passive: true });
    const ro = new ResizeObserver(() => {
      updateScrollMetrics();
    });
    ro.observe(el);
    window.addEventListener('resize', updateScrollMetrics);

    return () => {
      el.removeEventListener('scroll', updateScrollMetrics);
      ro.disconnect();
      window.removeEventListener('resize', updateScrollMetrics);
    };
  }, [updateScrollMetrics, contacts, customFields]);

  const scrollTable = (direction: 'left' | 'right', step = 280) => {
    const el = tableContainerRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -step : step;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const scrollTableTo = (target: 'start' | 'end' | number) => {
    const el = tableContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    let left = 0;
    if (target === 'start') left = 0;
    else if (target === 'end') left = maxScroll;
    else left = Math.max(0, Math.min(target, maxScroll));
    el.scrollTo({ left, behavior: 'smooth' });
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    const container = tableContainerRef.current;
    if (!track || !container) return;

    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll <= 0) return;

    const calcScrollFromX = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = offsetX / rect.width;
      return ratio * maxScroll;
    };

    container.scrollTo({
      left: calcScrollFromX(e.clientX),
      behavior: 'smooth',
    });

    const onPointerMove = (moveEvt: PointerEvent) => {
      container.scrollLeft = calcScrollFromX(moveEvt.clientX);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchCustomFields = useCallback(async () => {
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .order('field_name');
    if (data) setCustomFields(data);
  }, [supabase]);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());
    // Also drop "select all matching". The filters just changed, so what
    // "matching" means changed with them — carrying the flag over would let
    // a confirm dialog agreed to under one filter delete a different set.
    setSelectAllMatching(false);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[];
    let count: number;

    if (selectedTagIds.length > 0) {
      // Tag filter active — resolve it server-side (join + distinct +
      // windowed total count + pagination) so a tag covering many
      // contacts can't silently truncate the result or overflow an IN
      // clause. See migration 025_filter_contacts_by_tags.
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: PAGE_SIZE,
        p_offset: from,
        // Composed inside the same query as the tag join, so `total_count`
        // and this page describe the same set. Passing it separately and
        // filtering afterwards would break the count.
        p_sources: selectedSources.length > 0 ? selectedSources : null,
      });
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch

      if (!error && Array.isArray(data)) {
        const rows = data as Array<Record<string, unknown>>;
        contactRows = rows
          .map((r) => {
            if (r && typeof r === 'object') {
              if (
                r.contact &&
                typeof r.contact === 'object' &&
                'id' in (r.contact as object)
              ) {
                return r.contact as Contact;
              }
              if (r.id) {
                const contactData = { ...r };
                delete contactData.total_count;
                return contactData as unknown as Contact;
              }
            }
            return null;
          })
          .filter((c): c is Contact => Boolean(c && c.id));
        count =
          rows.length > 0
            ? Number(rows[0]?.total_count ?? contactRows.length)
            : 0;
      } else {
        // Fallback: direct table query if RPC is unavailable or encounters error
        const { data: tagRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', selectedTagIds);

        const matchedIds = Array.from(
          new Set((tagRows ?? []).map((r) => r.contact_id))
        );

        if (matchedIds.length === 0) {
          contactRows = [];
          count = 0;
        } else {
          let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })
            .in('id', matchedIds)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (term) {
            const like = `%${term}%`;
            query = query.or(
              `name.ilike.${like},phone.ilike.${like},email.ilike.${like}`
            );
          }

          if (selectedSources.length > 0) {
            query = query.in('source', selectedSources);
          }

          const { data: fallbackData, count: exactCount } = await query;
          contactRows = fallbackData ?? [];
          count = exactCount ?? 0;
        }
      }
    } else {
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (term) {
        const like = `%${term}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},email.ilike.${like}`
        );
      }

      if (selectedSources.length > 0) {
        query = query.in('source', selectedSources);
      }

      const { data, count: exactCount, error } = await query;
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      contactRows = data ?? [];
      count = exactCount ?? 0;
    }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags and custom values for these contacts in parallel
    const contactIds = contactRows
      .filter((c): c is Contact => Boolean(c && c.id))
      .map((c) => c.id);
    const [tagsRes, customValuesRes] = await Promise.all([
      supabase
        .from('contact_tags')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds),
      supabase
        .from('contact_custom_values')
        .select('contact_id, custom_field_id, value')
        .in('contact_id', contactIds),
    ]);
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch

    const tagsByContact: Record<string, string[]> = {};
    tagsRes.data?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const customMap: Record<string, Record<string, string>> = {};
    customValuesRes.data?.forEach((cv) => {
      if (!customMap[cv.contact_id]) customMap[cv.contact_id] = {};
      if (cv.value) {
        customMap[cv.contact_id][cv.custom_field_id] = cv.value;
      }
    });
    setCustomValuesByContact(customMap);

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, selectedSources, tagsMap, t]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    fetchTags();
    fetchCustomFields();
    void fetchStagedPending();
  }, [fetchTags, fetchCustomFields, fetchStagedPending]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
      // Same reason as the bulk path: this number is now re-importable.
      void fetchStagedPending();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Collect every contact id matching the CURRENT filters, across all pages.
   *
   * Needed because selection is page-scoped: with 1,788 contacts at 25 per
   * page, "select all" only ever reached 25 of them, so clearing an imported
   * address book meant visiting 72 pages. This resolves the full set once so
   * a single confirm can act on all of it.
   *
   * Paged in slices rather than one huge select: Supabase caps rows per
   * request, and asking for 1,788+ ids in one go silently truncates — which
   * would delete part of the set while reporting success.
   */
  async function fetchAllMatchingIds(): Promise<string[]> {
    const CHUNK = 1000;
    const ids: string[] = [];
    const term = search.trim();

    for (let from = 0; ; from += CHUNK) {
      let rows: { id: string }[] | null = null;

      if (selectedTagIds.length > 0) {
        // Same RPC the table uses, so "all matching" means exactly what the
        // filtered view shows — not a different definition of matching.
        const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
          p_tag_ids: selectedTagIds,
          p_search: term || null,
          p_limit: CHUNK,
          p_offset: from,
          p_sources: selectedSources.length > 0 ? selectedSources : null,
        });
        if (error) throw error;
        // The RPC returns a composite `contact` column, not a flat row, so
        // the id lives one level down. Reading `r.id` here would collect
        // undefined and silently delete nothing.
        rows = (
          (data ?? []) as Array<{ contact?: { id?: string }; id?: string }>
        )
          .map((r) => ({ id: r.contact?.id ?? r.id ?? '' }))
          .filter((r) => r.id !== '');
      } else {
        let query = supabase.from('contacts').select('id');
        if (term) {
          query = query.or(
            `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
          );
        }
        if (selectedSources.length > 0) {
          query = query.in('source', selectedSources);
        }
        const { data, error } = await query.range(from, from + CHUNK - 1);
        if (error) throw error;
        rows = (data ?? []) as { id: string }[];
      }

      ids.push(...rows.map((r) => r.id));
      if (rows.length < CHUNK) break;
    }

    return ids;
  }

  async function handleBulkDelete() {
    setDeleting(true);

    try {
      // When "select all matching" is on, the id list is resolved now rather
      // than held in state — the user may never have loaded most of those
      // pages, so there is nothing in `selected` to delete.
      const ids = selectAllMatching
        ? await fetchAllMatchingIds()
        : [...selected];

      if (ids.length === 0) {
        setDeleting(false);
        setBulkDeleteOpen(false);
        return;
      }

      // Deleted in chunks: a single `.in()` with thousands of ids exceeds
      // URL/statement limits and fails outright. Chunking also means a
      // failure part-way still leaves a coherent result rather than an
      // all-or-nothing mystery.
      const CHUNK = 200;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('contacts')
          .delete()
          .in('id', slice);
        if (error) {
          toast.error(
            `${t('toastBulkFailedDelete')} (${deleted} of ${ids.length} removed)`
          );
          break;
        }
        deleted += slice.length;
        setBulkProgress({ done: deleted, total: ids.length });
      }

      if (deleted > 0) {
        toast.success(t('toastBulkDeleted', { count: deleted }));
      }
      setSelected(new Set());
      setSelectAllMatching(false);
      fetchContacts();
      // Deleting a contact returns its staged row to pending (migration 074),
      // so the "Sync from phone" count has just gone UP by however many were
      // removed. Re-read it or the badge would understate what can be
      // re-imported.
      void fetchStagedPending();
    } catch (err) {
      console.error('[contacts] bulk delete failed:', err);
      toast.error(t('toastBulkFailedDelete'));
    } finally {
      setDeleting(false);
      setBulkProgress(null);
      setBulkDeleteOpen(false);
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 ||
    selectedTagIds.length > 0 ||
    selectedSources.length > 0;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function toggleSourceFilter(source: ContactSource) {
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source]
    );
    // Same reason as the tag filter: the result set changes size, so page N
    // may no longer exist.
    setPage(0);
  }

  function clearSourceFilters() {
    setSelectedSources([]);
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  const emailRow = customFields.find((f) => f.field_key === 'email');
  const companyRow = customFields.find((f) => f.field_key === 'company');
  const pureCustomFields = customFields.filter(
    (f) => !f.is_system && !f.field_key && f.visible !== false
  );

  const emailVisible = emailRow?.visible !== false;
  const emailLabel = emailRow?.field_name || t('tableColumns.email');

  const companyVisible = companyRow?.visible !== false;
  const companyLabel = companyRow?.field_name || t('tableColumns.company');

  // Hand-counted, so it has to be bumped whenever a column is added or the
  // loading/empty rows stop spanning the table. 7 = checkbox, name, phone,
  // tags, source, created_at, actions.
  const totalColSpan =
    7 +
    (emailVisible ? 1 : 0) +
    (companyVisible ? 1 : 0) +
    pureCustomFields.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">
            {totalCount > 0
              ? t('subtitle', { count: totalCount })
              : t('subtitleZero')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditSettings && (
            <Button
              variant="outline"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" />
              {t('customFieldsBtn')}
            </Button>
          )}
          {/* Phone-contact sync, surfaced where it is actually needed.
              Previously only reachable from Settings → WhatsApp Setup, which
              is nowhere near the page where you notice contacts are missing.

              Shown whenever the phone handed over an address book at all, not
              only while something is outstanding. Gating on the outstanding
              count made the button vanish the moment the last number was
              imported, which removed the only way back to the list — and the
              list is still worth reaching: it is the record of what came from
              the phone, and rows return to it whenever a contact is deleted.
              Still hidden for an account with no Coexistence connection, where
              it would open an empty dialog. */}
          {stagedTotal > 0 && (
            <GatedButton
              variant="outline"
              canAct={canEdit}
              gateReason="import contacts"
              onClick={() => setPhoneSyncOpen(true)}
            >
              <Smartphone className="size-4" />
              Sync from phone
              {/* Badge only while there is something to act on, so a count of
                  zero is never presented as work waiting. */}
              {stagedPending > 0 ? (
                <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                  {stagedPending}
                </span>
              ) : null}
            </GatedButton>
          )}
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-4" />
            {t('importBtn')}
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            {t('addContactBtn')}
          </GatedButton>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-sm">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Reset pagination when the query changes — the result
                  // set shrinks/grows, page N may no longer be valid.
                  setPage(0);
                }}
                placeholder={t('searchPlaceholder')}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground pl-8"
              />
            </div>

            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground hover:bg-muted shrink-0"
                  />
                }
              >
                <Filter className="size-4" />
                {t('filterByTags')}
                {selectedTagIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                    {selectedTagIds.length}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <div className="border-border flex items-center justify-between border-b px-3 py-2">
                  <span className="text-popover-foreground text-sm font-medium">
                    {t('filterByTags')}
                  </span>
                  {selectedTagIds.length > 0 && (
                    <button
                      onClick={clearTagFilters}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      {t('clearAll')}
                    </button>
                  )}
                </div>
                {allTags.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                    {t('noTagsYet')}
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto py-1">
                    {allTags.map((tag) => (
                      <label
                        key={tag.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 px-3 py-1.5"
                      >
                        <Checkbox
                          checked={selectedTagIds.includes(tag.id)}
                          onCheckedChange={() => toggleTagFilter(tag.id)}
                          aria-label={`Filter by ${tag.name}`}
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-popover-foreground truncate text-sm">
                          {tag.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Source filter. Sits beside the tag filter because the two
                compose (tag AND source), and both are resolved server-side. */}
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground hover:bg-muted shrink-0"
                  />
                }
              >
                <Filter className="size-4" />
                {t('filterBySource')}
                {selectedSources.length > 0 && (
                  <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                    {selectedSources.length}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <div className="border-border flex items-center justify-between border-b px-3 py-2">
                  <span className="text-popover-foreground text-sm font-medium">
                    {t('filterBySource')}
                  </span>
                  {selectedSources.length > 0 && (
                    <button
                      onClick={clearSourceFilters}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      {t('clearAll')}
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {CONTACT_SOURCES.map((source) => {
                    const display = getContactSource(source);
                    return (
                      <label
                        key={source}
                        className="hover:bg-muted/50 flex cursor-pointer items-start gap-2.5 px-3 py-1.5"
                      >
                        <Checkbox
                          checked={selectedSources.includes(source)}
                          onCheckedChange={() => toggleSourceFilter(source)}
                          aria-label={`Filter by ${tSource(display.label)}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="text-popover-foreground block text-sm">
                            {tSource(display.label)}
                          </span>
                          {/* "API" and "Campaign" are indistinguishable
                              without this, and the difference decides where
                              you go looking. */}
                          <span className="text-muted-foreground block text-xs">
                            {tSource(display.hint)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Top Quick Column Navigator when table has horizontal scroll */}
          {tableHasOverflow && (
            <div className="border-border/80 bg-card/80 animate-in fade-in flex items-center gap-1.5 self-start rounded-lg border px-2.5 py-1 shadow-2xs backdrop-blur-xs duration-200 sm:self-auto">
              <ArrowLeftRight className="text-primary size-3.5" />
              <span className="text-muted-foreground hidden text-xs font-medium select-none md:inline">
                Columns:
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollLeft}
                onClick={() => scrollTable('left')}
                title="Scroll columns left"
                aria-label="Scroll columns left"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <button
                type="button"
                className="text-foreground hover:text-primary min-w-[32px] cursor-pointer text-center text-xs font-semibold tabular-nums transition-colors select-none"
                title="Click to toggle between start and end"
                onClick={() => scrollTableTo(canScrollRight ? 'end' : 'start')}
              >
                {Math.round(scrollProgress)}%
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollRight}
                onClick={() => scrollTable('right')}
                title="Scroll columns right"
                aria-label="Scroll columns right"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Active source-filter chips */}
        {selectedSources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedSources.map((source) => {
              const display = getContactSource(source);
              return (
                <span
                  key={source}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${display.classes}`}
                >
                  {tSource(display.label)}
                  <button
                    onClick={() => toggleSourceFilter(source)}
                    aria-label={`Remove ${tSource(display.label)} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearSourceFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-xs"
            >
              {t('clearAll')}
            </button>
          </div>
        )}

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remove ${tag.name} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-xs"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 || selectAllMatching ? (
        <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-foreground text-sm">
              {selectAllMatching
                ? `All ${totalCount} contacts selected`
                : t('selectedCount', { count: selected.size })}
            </p>

            {/* The escape hatch from page-scoped selection.
                Selecting every row on the page used to reach 25 of 1,788,
                so clearing an imported address book meant working through
                72 pages. Offered only when the page is fully ticked AND
                there is more beyond it, so it appears exactly when the
                page-only limit starts to bite. */}
            {!selectAllMatching &&
            allOnPageSelected &&
            totalCount > contacts.length ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectAllMatching(true)}
                className="text-primary hover:text-primary h-auto px-1.5 py-0.5 text-xs"
              >
                Select all {totalCount}
              </Button>
            ) : null}

            {selectAllMatching ? (
              <span className="text-muted-foreground text-xs">
                {hasActiveFilters
                  ? 'Everything matching the current filters'
                  : 'Every contact in this workspace'}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
                setSelectAllMatching(false);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('clearSelection')}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {t('deleteSelected')}
            </GatedButton>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="relative">
        <div
          ref={tableContainerRef}
          className="border-border bg-card/30 overflow-x-auto rounded-lg border shadow-xs"
        >
          <Table className="min-w-full table-fixed">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead
                  className="w-10 px-3 select-none"
                  style={{ width: '44px', minWidth: '44px', maxWidth: '44px' }}
                >
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={contacts.length === 0}
                    aria-label="Select all contacts on this page"
                  />
                </TableHead>

                {/* Name Column */}
                <TableHead
                  className="group text-muted-foreground relative px-3 font-semibold select-none"
                  style={{
                    width: `${getWidth('name', 180)}px`,
                    minWidth: `${getWidth('name', 180)}px`,
                    maxWidth: `${getWidth('name', 180)}px`,
                  }}
                >
                  <div className="flex items-center justify-between overflow-hidden pr-2">
                    <span className="truncate">{t('tableColumns.name')}</span>
                  </div>
                  <div
                    onMouseDown={(e) => startResize('name', e)}
                    onDoubleClick={() => resetWidth('name')}
                    className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                      isResizing === 'name'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize (double-click to reset)"
                  >
                    <div
                      className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'name' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                    />
                  </div>
                </TableHead>

                {/* Phone Column */}
                <TableHead
                  className="group text-muted-foreground relative px-3 font-semibold select-none"
                  style={{
                    width: `${getWidth('phone', 160)}px`,
                    minWidth: `${getWidth('phone', 160)}px`,
                    maxWidth: `${getWidth('phone', 160)}px`,
                  }}
                >
                  <div className="flex items-center justify-between overflow-hidden pr-2">
                    <span className="truncate">{t('tableColumns.phone')}</span>
                  </div>
                  <div
                    onMouseDown={(e) => startResize('phone', e)}
                    onDoubleClick={() => resetWidth('phone')}
                    className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                      isResizing === 'phone'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize (double-click to reset)"
                  >
                    <div
                      className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'phone' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                    />
                  </div>
                </TableHead>

                {/* Email Column */}
                {emailVisible && (
                  <TableHead
                    className="group text-muted-foreground relative px-3 font-semibold select-none"
                    style={{
                      width: `${getWidth('email', 210)}px`,
                      minWidth: `${getWidth('email', 210)}px`,
                      maxWidth: `${getWidth('email', 210)}px`,
                    }}
                  >
                    <div className="flex items-center justify-between overflow-hidden pr-2">
                      <span className="truncate">{emailLabel}</span>
                    </div>
                    <div
                      onMouseDown={(e) => startResize('email', e)}
                      onDoubleClick={() => resetWidth('email')}
                      className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                        isResizing === 'email'
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Drag to resize (double-click to reset)"
                    >
                      <div
                        className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'email' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                      />
                    </div>
                  </TableHead>
                )}

                {/* Company Column */}
                {companyVisible && (
                  <TableHead
                    className="group text-muted-foreground relative px-3 font-semibold select-none"
                    style={{
                      width: `${getWidth('company', 180)}px`,
                      minWidth: `${getWidth('company', 180)}px`,
                      maxWidth: `${getWidth('company', 180)}px`,
                    }}
                  >
                    <div className="flex items-center justify-between overflow-hidden pr-2">
                      <span className="truncate">{companyLabel}</span>
                    </div>
                    <div
                      onMouseDown={(e) => startResize('company', e)}
                      onDoubleClick={() => resetWidth('company')}
                      className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                        isResizing === 'company'
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Drag to resize (double-click to reset)"
                    >
                      <div
                        className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'company' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                      />
                    </div>
                  </TableHead>
                )}

                {/* Dynamic Custom Fields */}
                {pureCustomFields.map((cf) => {
                  const key = `custom_${cf.id}`;
                  return (
                    <TableHead
                      key={cf.id}
                      className="group text-muted-foreground relative px-3 font-semibold select-none"
                      style={{
                        width: `${getWidth(key, 150)}px`,
                        minWidth: `${getWidth(key, 150)}px`,
                        maxWidth: `${getWidth(key, 150)}px`,
                      }}
                    >
                      <div className="flex items-center justify-between overflow-hidden pr-2">
                        <span className="truncate">{cf.field_name}</span>
                      </div>
                      <div
                        onMouseDown={(e) => startResize(key, e)}
                        onDoubleClick={() => resetWidth(key)}
                        className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                          isResizing === key
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="Drag to resize (double-click to reset)"
                      >
                        <div
                          className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === key ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                        />
                      </div>
                    </TableHead>
                  );
                })}

                {/* Tags Column */}
                <TableHead
                  className="group text-muted-foreground relative px-3 font-semibold select-none"
                  style={{
                    width: `${getWidth('tags', 160)}px`,
                    minWidth: `${getWidth('tags', 160)}px`,
                    maxWidth: `${getWidth('tags', 160)}px`,
                  }}
                >
                  <div className="flex items-center justify-between overflow-hidden pr-2">
                    <span className="truncate">{t('tableColumns.tags')}</span>
                  </div>
                  <div
                    onMouseDown={(e) => startResize('tags', e)}
                    onDoubleClick={() => resetWidth('tags')}
                    className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                      isResizing === 'tags'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize (double-click to reset)"
                  >
                    <div
                      className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'tags' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                    />
                  </div>
                </TableHead>

                {/* Source Column — how the contact entered the CRM */}
                <TableHead
                  className="group text-muted-foreground relative px-3 font-semibold select-none"
                  style={{
                    width: `${getWidth('source', 130)}px`,
                    minWidth: `${getWidth('source', 130)}px`,
                    maxWidth: `${getWidth('source', 130)}px`,
                  }}
                >
                  <div className="flex items-center justify-between overflow-hidden pr-2">
                    <span className="truncate">{t('tableColumns.source')}</span>
                  </div>
                  <div
                    onMouseDown={(e) => startResize('source', e)}
                    onDoubleClick={() => resetWidth('source')}
                    className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                      isResizing === 'source'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize (double-click to reset)"
                  >
                    <div
                      className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'source' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                    />
                  </div>
                </TableHead>

                {/* Created At Column */}
                <TableHead
                  className="group text-muted-foreground relative px-3 font-semibold select-none"
                  style={{
                    width: `${getWidth('created_at', 130)}px`,
                    minWidth: `${getWidth('created_at', 130)}px`,
                    maxWidth: `${getWidth('created_at', 130)}px`,
                  }}
                >
                  <div className="flex items-center justify-between overflow-hidden pr-2">
                    <span className="truncate">
                      {t('tableColumns.createdAt')}
                    </span>
                  </div>
                  <div
                    onMouseDown={(e) => startResize('created_at', e)}
                    onDoubleClick={() => resetWidth('created_at')}
                    className={`group/resizer absolute top-0 right-0 bottom-0 z-20 flex w-2.5 cursor-col-resize items-center justify-center transition-opacity select-none ${
                      isResizing === 'created_at'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Drag to resize (double-click to reset)"
                  >
                    <div
                      className={`h-4 w-[2px] rounded-full transition-colors ${isResizing === 'created_at' ? 'bg-primary h-full' : 'bg-border/90 group-hover/resizer:bg-primary'}`}
                    />
                  </div>
                </TableHead>

                <TableHead
                  className={cn(
                    'bg-card z-20 w-20 px-2 text-right transition-shadow select-none sm:sticky sm:right-0',
                    canScrollRight &&
                      'border-border/60 border-l shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]'
                  )}
                  style={{ width: '84px', minWidth: '84px', maxWidth: '84px' }}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-border">
                  <TableCell
                    colSpan={totalColSpan}
                    className="py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="text-primary size-6 animate-spin" />
                      <p className="text-muted-foreground text-sm">
                        {t('loading')}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : contacts.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell
                    colSpan={totalColSpan}
                    className="py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Users className="text-muted-foreground size-8" />
                      <p className="text-muted-foreground text-sm">
                        {hasActiveFilters
                          ? t('noContactsMatch')
                          : t('noContactsYet')}
                      </p>
                      {!hasActiveFilters && (
                        <GatedButton
                          canAct={canEdit}
                          gateReason="add or import contacts"
                          variant="outline"
                          size="sm"
                          onClick={openAddForm}
                          className="border-border text-muted-foreground hover:bg-muted mt-2"
                        >
                          <Plus className="size-3.5" />
                          {t('addFirstContact')}
                        </GatedButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="group border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => openDetail(contact.id)}
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="px-3"
                      style={{
                        width: '44px',
                        minWidth: '44px',
                        maxWidth: '44px',
                      }}
                    >
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        aria-label={`Select ${contact.name || contact.phone}`}
                      />
                    </TableCell>
                    <TableCell
                      className="text-foreground truncate px-3 font-medium"
                      style={{
                        width: `${getWidth('name', 180)}px`,
                        minWidth: `${getWidth('name', 180)}px`,
                        maxWidth: `${getWidth('name', 180)}px`,
                      }}
                    >
                      <span className="block truncate">
                        {contact.name || (
                          <span className="text-muted-foreground italic">
                            {t('unnamed')}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground truncate px-3 font-mono text-xs"
                      style={{
                        width: `${getWidth('phone', 160)}px`,
                        minWidth: `${getWidth('phone', 160)}px`,
                        maxWidth: `${getWidth('phone', 160)}px`,
                      }}
                    >
                      <PhoneDisplay phone={contact.phone} copyable />
                    </TableCell>
                    {emailVisible && (
                      <TableCell
                        className="text-muted-foreground truncate px-3 text-sm"
                        style={{
                          width: `${getWidth('email', 210)}px`,
                          minWidth: `${getWidth('email', 210)}px`,
                          maxWidth: `${getWidth('email', 210)}px`,
                        }}
                      >
                        <span className="block truncate">
                          {contact.email || (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </span>
                      </TableCell>
                    )}
                    {companyVisible && (
                      <TableCell
                        className="text-muted-foreground truncate px-3 text-sm"
                        style={{
                          width: `${getWidth('company', 180)}px`,
                          minWidth: `${getWidth('company', 180)}px`,
                          maxWidth: `${getWidth('company', 180)}px`,
                        }}
                      >
                        <span className="block truncate">
                          {contact.company || (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </span>
                      </TableCell>
                    )}
                    {pureCustomFields.map((cf) => {
                      const key = `custom_${cf.id}`;
                      const val = customValuesByContact[contact.id]?.[cf.id];
                      return (
                        <TableCell
                          key={cf.id}
                          className="text-muted-foreground truncate px-3 text-xs"
                          style={{
                            width: `${getWidth(key, 150)}px`,
                            minWidth: `${getWidth(key, 150)}px`,
                            maxWidth: `${getWidth(key, 150)}px`,
                          }}
                        >
                          <span className="block truncate">
                            {val ? (
                              <span className="text-foreground font-mono">
                                {val}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">
                                -
                              </span>
                            )}
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell
                      className="truncate px-3"
                      style={{
                        width: `${getWidth('tags', 160)}px`,
                        minWidth: `${getWidth('tags', 160)}px`,
                        maxWidth: `${getWidth('tags', 160)}px`,
                      }}
                    >
                      <div className="flex flex-wrap gap-1 overflow-hidden">
                        {contact.tags && contact.tags.length > 0 ? (
                          contact.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex max-w-[100px] items-center truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">
                            -
                          </span>
                        )}
                        {contact.tags && contact.tags.length > 2 && (
                          <span className="text-muted-foreground text-[10px]">
                            +{contact.tags.length - 2}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="truncate px-3"
                      style={{
                        width: `${getWidth('source', 130)}px`,
                        minWidth: `${getWidth('source', 130)}px`,
                        maxWidth: `${getWidth('source', 130)}px`,
                      }}
                    >
                      {(() => {
                        const display = getContactSource(contact.source);
                        return (
                          <span
                            className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-medium ${display.classes}`}
                            title={tSource(display.hint)}
                          >
                            {tSource(display.label)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground truncate px-3 text-xs"
                      style={{
                        width: `${getWidth('created_at', 130)}px`,
                        minWidth: `${getWidth('created_at', 130)}px`,
                        maxWidth: `${getWidth('created_at', 130)}px`,
                      }}
                    >
                      {new Date(contact.created_at).toLocaleDateString(
                        'en-US',
                        {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'bg-card group-hover:bg-muted/50 z-10 px-2 text-right transition-colors sm:sticky sm:right-0',
                        canScrollRight &&
                          'border-border/60 border-l shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]'
                      )}
                      style={{
                        width: '84px',
                        minWidth: '84px',
                        maxWidth: '84px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title={t('openChatAction')}
                          aria-label={t('openChatAction')}
                          disabled={openingChatContactId === contact.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openContactChat(contact);
                          }}
                        >
                          {openingChatContactId === contact.id ? (
                            <Loader2 className="text-primary size-4 animate-spin" />
                          ) : (
                            <MessageSquare className="size-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-popover border-border"
                          >
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(contact.id);
                              }}
                              className="text-popover-foreground focus:bg-muted focus:text-foreground"
                            >
                              <Pencil className="size-4" />
                              {t('editAction')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(contact);
                              }}
                            >
                              <Trash2 className="size-4" />
                              {t('deleteAction')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Floating / Sticky Synced Column Navigator Dock */}
        {tableHasOverflow && (
          <div className="animate-in fade-in slide-in-from-bottom-2 pointer-events-none sticky bottom-4 z-30 mx-auto mt-3 w-fit max-w-full px-2 transition-all duration-300">
            <div className="border-border/80 bg-card/95 hover:border-primary/40 pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-md transition-all duration-200 hover:shadow-2xl sm:gap-2 dark:ring-white/10">
              <div className="text-muted-foreground mr-0.5 flex items-center gap-1 sm:mr-1">
                <ArrowLeftRight className="text-primary size-3.5" />
                <span className="text-foreground hidden text-[11px] font-semibold select-none sm:inline">
                  Columns
                </span>
              </div>

              {/* Jump to first column */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollLeft}
                onClick={() => scrollTableTo('start')}
                title="Jump to first column"
                aria-label="Jump to first column"
              >
                <ChevronsLeft className="size-3.5" />
              </Button>

              {/* Step left */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollLeft}
                onClick={() => scrollTable('left')}
                title="Scroll left"
                aria-label="Scroll left"
              >
                <ChevronLeft className="size-3.5" />
              </Button>

              {/* Interactive Mini-Map / Track */}
              <div
                ref={trackRef}
                onPointerDown={handleTrackPointerDown}
                className="group/track bg-muted/90 hover:bg-muted relative h-2.5 w-28 cursor-pointer overflow-hidden rounded-full transition-colors select-none sm:w-36"
                title="Drag or click to navigate table columns"
              >
                <div
                  className="bg-primary/75 group-hover/track:bg-primary absolute top-0 bottom-0 rounded-full shadow-xs transition-[background-color,width,left] duration-75"
                  style={{
                    width: `${thumbMetrics.width}%`,
                    left: `${thumbMetrics.left}%`,
                  }}
                />
              </div>

              {/* Step right */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollRight}
                onClick={() => scrollTable('right')}
                title="Scroll right"
                aria-label="Scroll right"
              >
                <ChevronRight className="size-3.5" />
              </Button>

              {/* Jump to last column */}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground h-6 w-6"
                disabled={!canScrollRight}
                onClick={() => scrollTableTo('end')}
                title="Jump to last column"
                aria-label="Jump to last column"
              >
                <ChevronsRight className="size-3.5" />
              </Button>

              {/* Percentage */}
              <div className="border-border/70 text-muted-foreground min-w-[32px] border-l pl-2 text-right text-[11px] font-medium tabular-nums select-none">
                {Math.round(scrollProgress)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        // Wraps: the control is now 11 elements wide at most, which does not
        // fit beside the "showing X-Y of Z" line on a narrow screen.
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount,
            })}
          </p>
          {/* Numbered, with first/last and a jump box. Prev/next alone meant
              59 clicks and 59 queries to reach page 60 of 72 — the rows
              existed but were not realistically reachable.
              `page` is stored 0-based here and the component is 1-based, so
              the conversion happens at this boundary only. */}
          <Pagination
            page={page + 1}
            totalPages={totalPages}
            onPageChange={(next) => setPage(next - 1)}
            disabled={loading}
            jumpLabel={t('goToPage')}
          />
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Phone-contact review — the same dialog Settings uses, so batching,
          progress and the double-click guard live in one place. */}
      <ContactReviewDialog
        open={phoneSyncOpen}
        onClose={() => {
          setPhoneSyncOpen(false);
          void fetchStagedPending();
        }}
        onImported={() => {
          fetchContacts();
          fetchCustomFields();
          void fetchStagedPending();
        }}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={(next) => {
            setCustomFieldsOpen(next);
            if (!next) {
              fetchCustomFields();
              fetchContacts();
            }
          }}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteContactTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', {
                name: deleteTarget?.name || deleteTarget?.phone || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteBulkTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {/* The count MUST reflect what will actually be deleted. With
                  "select all matching" the real figure is the filtered total,
                  not the handful of ids held for the current page — showing
                  the smaller number would understate a 1,788-row delete. */}
              {t('deleteBulkDesc', {
                count: selectAllMatching ? totalCount : selected.size,
              })}
            </DialogDescription>
          </DialogHeader>

          {deleting && bulkProgress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Deleting…</span>
                <span className="text-muted-foreground tabular-nums">
                  {bulkProgress.done} of {bulkProgress.total}
                </span>
              </div>
              <div className="bg-border h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-destructive h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${
                      bulkProgress.total > 0
                        ? Math.round(
                            (bulkProgress.done / bulkProgress.total) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
