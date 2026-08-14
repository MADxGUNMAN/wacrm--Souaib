'use client';

// ============================================================
// Templates list.
//
// A LIST, not an editor. Creating and editing both live in the
// /templates wizard, which is the only form that can express a
// carousel's cards or a one-time-passcode template's options. The flat
// create/edit dialog that used to live here was removed once every
// entry point routed to the wizard - leaving it in place would have
// meant a second form that silently discarded the parts of a template
// it did not understand.
//
// What remains: the list itself, Sync from Meta, and delete.
//
// This component owns the WHOLE screen, heading included. It used to
// render a SettingsPanelHead under the route's own <h1>, which put
// "Message templates" on the page twice — a leftover from when this was
// a Settings tab. The route is now just a container.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Loader2,
  LibraryBig,
  Search,
  RefreshCw,
  AlertCircle,
  Pencil,
  RotateCcw,
  ListFilter,
  Check,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { MessageTemplate } from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import { findTypeOption } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type StatusFilter = 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED';
type CategoryFilter = 'ALL' | MessageTemplate['category'];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'REJECTED', label: 'Rejected' },
];

/**
 * Category filter options.
 *
 * These are Meta's three billing categories, and they are the question an
 * operator asks second — after "what is still pending", it is "show me the
 * marketing ones", because category decides what a send COSTS.
 *
 * A dropdown rather than a second row of tabs: two tab strips stacked look
 * like one control with eight options, and status is the more frequent
 * filter so it keeps the always-visible spot.
 */
const CATEGORY_FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: 'ALL', label: 'All categories' },
  { id: 'Marketing', label: 'Marketing' },
  { id: 'Utility', label: 'Utility' },
  { id: 'Authentication', label: 'Authentication' },
];

/**
 * Map Meta's status enum onto the four tabs.
 *
 * Meta has more states than an operator wants tabs for. PAUSED and
 * DISABLED are grouped under Rejected because they share the consequence —
 * the template cannot be sent — and DRAFT/PENDING/IN_APPEAL all mean "not
 * settled yet".
 */
function matchesStatus(
  template: MessageTemplate,
  filter: StatusFilter,
): boolean {
  if (filter === 'ALL') return true;
  const status = (template.status ?? 'DRAFT').toUpperCase();
  if (filter === 'APPROVED') return status === 'APPROVED';
  if (filter === 'PENDING') {
    return ['PENDING', 'DRAFT', 'IN_APPEAL', 'PENDING_DELETION'].includes(status);
  }
  return ['REJECTED', 'PAUSED', 'DISABLED'].includes(status);
}

function matchesCategory(
  template: MessageTemplate,
  filter: CategoryFilter,
): boolean {
  return filter === 'ALL' || template.category === filter;
}

/** `query` is expected pre-trimmed and lowercased by the caller. */
function matchesQuery(template: MessageTemplate, query: string): boolean {
  if (!query) return true;
  return (
    template.name.toLowerCase().includes(query) ||
    (template.body_text ?? '').toLowerCase().includes(query)
  );
}

/**
 * Category badge colours.
 *
 * Written with an explicit light-mode foreground and a dark: override.
 * They used to be `text-purple-400` alone, which is tuned for a dark
 * surface and reads as washed-out grey on the light theme.
 */
const CATEGORY_BADGE: Record<MessageTemplate['category'], string> = {
  Marketing:
    'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  Utility: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Authentication:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

/** Meta's own quality rating, same three-colour scale it uses. */
const QUALITY_TEXT: Record<string, string> = {
  GREEN: 'text-emerald-600 dark:text-emerald-400',
  YELLOW: 'text-amber-600 dark:text-amber-400',
  RED: 'text-red-600 dark:text-red-400',
};

/**
 * The human name of a template's shape — "Carousel", "Limited-time offer".
 *
 * Only shown when it is NOT the default, because that is the only case
 * where it tells you something: a carousel and a plain text template look
 * identical in a list otherwise, and they behave very differently when
 * sent.
 */
function typeLabel(template: MessageTemplate): string | null {
  const type = template.template_type;
  if (!type || type === 'default' || type === 'authentication') return null;
  return (
    findTypeOption(template.category, type as TemplateType)?.title ?? null
  );
}

export function TemplateManager() {
  const t = useTranslations('Settings.templates');
  const router = useRouter();
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Template selected for the confirm-delete dialog. The destructive
  // action goes through this two-step so a slip on the trash icon
  // doesn't take the template off Meta as well as locally.
  const [templateToDelete, setTemplateToDelete] =
    useState<MessageTemplate | null>(null);
  /**
   * Status + category + search.
   *
   * Worth having even on a short list: the thing an operator most often
   * wants is "what is still pending" or "what got rejected and why", and
   * scanning coloured badges by eye does not scale past a screenful.
   */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchTemplates(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profileLoading, accountId]);

  async function fetchTemplates(accId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      toast.error(t('toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFromMeta() {
    if (!user || !accountId) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      toast.success(
        t('toastSyncCount', { total: data.total }) +
          (data.inserted || data.updated
            ? t('toastSyncDetails', { inserted: data.inserted, updated: data.updated })
            : ''),
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors.slice(0, 3).map(
          (e: { name: string; language: string; message: string }) =>
            `${e.name} (${e.language})`,
        );
        const suffix =
          data.errors.length > 3 ? `, +${data.errors.length - 3} more` : '';
        toast.error(t('toastSyncFailed', { preview: preview.join(', ') + suffix }));
      }
      if (data.truncated) {
        // Use error (not warning) so the message survives long
        // enough to read — sonner's `warning` auto-dismisses on
        // the same short timer as `success`.
        toast.error(
          t('toastSyncTruncated'),
          { duration: 10000 },
        );
      }
      if (accountId) await fetchTemplates(accountId);
    } catch (err) {
      console.error('Template sync error:', err);
      toast.error(err instanceof Error ? err.message : t('toastSyncError'));
    } finally {
      setSyncing(false);
    }
  }

  async function confirmDelete() {
    const target = templateToDelete;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    try {
      // Route handler scopes the Meta delete via hsm_id (so sibling
      // language variants survive) and falls through to remove the
      // local row. Local-only rows skip the Meta call.
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      toast.success(t('toastDeleteSuccess'));
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err instanceof Error ? err.message : t('toastDeleteError'));
    } finally {
      setDeletingId(null);
    }
  }

  const query = search.trim().toLowerCase();

  /**
   * The rows actually shown — all three filters applied together.
   *
   * PENDING deliberately covers Meta's several in-flight states — a
   * template being reviewed, appealed or awaiting deletion is "not settled
   * yet" as far as the operator is concerned, and giving each its own tab
   * would be five tabs that are usually empty.
   */
  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          matchesStatus(template, statusFilter) &&
          matchesCategory(template, categoryFilter) &&
          matchesQuery(template, query),
      ),
    [templates, statusFilter, categoryFilter, query],
  );

  /**
   * Counts vary ONE axis and hold the others, so the number beside a
   * control is exactly what you get by clicking it. A status tab counted
   * against the whole table would promise rows the category filter then
   * removes — a count that disagrees with its own list is worse than none.
   */
  const statusCount = (filter: StatusFilter) =>
    templates.filter(
      (template) =>
        matchesStatus(template, filter) &&
        matchesCategory(template, categoryFilter) &&
        matchesQuery(template, query),
    ).length;

  const categoryCount = (filter: CategoryFilter) =>
    templates.filter(
      (template) =>
        matchesStatus(template, statusFilter) &&
        matchesCategory(template, filter) &&
        matchesQuery(template, query),
    ).length;

  const filtersActive =
    statusFilter !== 'ALL' || categoryFilter !== 'ALL' || query !== '';

  const clearFilters = () => {
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setSearch('');
  };

  const activeCategoryLabel =
    CATEGORY_FILTERS.find((c) => c.id === categoryFilter)?.label ??
    'All categories';

  return (
    <section className="animate-in fade-in-50 space-y-5 duration-200">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <Button
            variant="outline"
            onClick={handleSyncFromMeta}
            disabled={syncing}
            title={t('syncTitle')}
          >
            <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('syncing') : t('syncFromMeta')}
          </Button>
          {/* The starter library. Offered beside "New template" rather than
              buried inside the wizard because it is a different decision,
              not a step: you are choosing a ready-made template rather
              than writing one. */}
          <Link
            href="/templates/library"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LibraryBig className="size-4" />
            Browse library
          </Link>
          {/* A real Link (not a Button + router.push) so middle-click and
              open-in-new-tab behave normally. */}
          <Link
            href="/templates/new"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Plus className="size-4" />
            {t('newTemplate')}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <LibraryBig className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {t('noTemplates')}
            </p>
            <p className="mt-1 max-w-[46ch] text-sm text-muted-foreground">
              {t('createFirst')}
            </p>
            {/* A brand-new account has nothing to sync and nothing to edit,
                so the library is the only useful next step — offering it
                here saves a hunt through the header. */}
            <Link
              href="/templates/library"
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <LibraryBig className="size-4" />
              Browse the template library
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---- Toolbar: status tabs · category filter · search ---- */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              role="group"
              aria-label="Filter by status"
              className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
            >
              {STATUS_FILTERS.map((f) => {
                const isActive = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setStatusFilter(f.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        'rounded px-1.5 text-xs tabular-nums',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground/70',
                      )}
                    >
                      {statusCount(f.id)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      // Reads as active when it is filtering, so a
                      // collapsed dropdown can never hide the fact that
                      // rows are being held back.
                      className={cn(
                        categoryFilter !== 'ALL' &&
                          'border-primary/40 bg-primary/5 text-primary',
                      )}
                      aria-label={`Filter by category: ${activeCategoryLabel}`}
                    />
                  }
                >
                  <ListFilter className="size-4" />
                  {categoryFilter === 'ALL' ? 'Category' : activeCategoryLabel}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {/* A DropdownMenuGroup (base-ui Menu.Group) is REQUIRED
                      here, not decoration: DropdownMenuLabel is base-ui's
                      Menu.GroupLabel, which THROWS at render if it cannot
                      find a Menu.Group ancestor. That was issue #336,
                      where a plain <div> wrapper crashed the flow
                      builder's menu on open, and there is a regression
                      test for the primitive in
                      dropdown-menu-group-label.test.tsx.

                      The label and the items it labels sit INSIDE the
                      group, matching flow-builder.tsx — that is also what
                      gives the group its accessible name. Separators
                      belong between groups, so with one group there is
                      none. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Filter by category
                    </DropdownMenuLabel>
                    {CATEGORY_FILTERS.map((c) => {
                      const isActive = categoryFilter === c.id;
                      return (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => setCategoryFilter(c.id)}
                        >
                          <Check
                            className={cn(
                              'size-4',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="flex-1">{c.label}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {categoryCount(c.id)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="relative w-full sm:w-64">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or text"
                  className="pl-9"
                  aria-label="Search templates"
                />
              </div>
            </div>
          </div>

          {/* Only shown while filtering: says how much is hidden, and
              offers one click to get everything back. */}
          {filtersActive ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Showing{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {visibleTemplates.length}
                </span>{' '}
                of{' '}
                <span className="tabular-nums">{templates.length}</span>{' '}
                templates
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10"
              >
                <X className="size-3.5" />
                Clear filters
              </button>
            </div>
          ) : null}

          {visibleTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <p className="text-sm font-medium text-foreground">
                  No templates match these filters.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different status or category, or clear the search.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <X className="size-3.5" />
                  Clear filters
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visibleTemplates.map((template) => {
                const statusKey = template.status || 'DRAFT';
                const status = templateStatusConfig[statusKey];
                const shape = typeLabel(template);
                const problem =
                  template.rejection_reason || template.submission_error;
                const canEdit =
                  statusKey === 'APPROVED' ||
                  statusKey === 'REJECTED' ||
                  statusKey === 'PAUSED';
                const isResubmit = statusKey !== 'APPROVED';

                return (
                  <Card
                    key={template.id}
                    className="flex min-w-0 flex-col overflow-hidden transition-colors hover:border-primary/30"
                  >
                    <CardContent className="flex min-w-0 flex-1 flex-col gap-3 pt-4">
                      {/* ---- Name + actions ---- */}
                      <div className="flex min-w-0 items-start gap-2">
                        <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">
                          {template.name}
                        </h3>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* Edit and Resubmit both open the wizard. The old
                              flat dialog could not express a carousel's
                              cards or an OTP template's options, so for
                              those types it silently discarded what it did
                              not understand. Pending templates have neither
                              button because Meta will not accept an edit
                              while a review is in flight. */}
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(`/templates/${template.id}/edit`)
                              }
                              title={
                                isResubmit ? t('resubmitTitle') : t('editTitle')
                              }
                              aria-label={
                                isResubmit ? t('resubmitLabel') : t('editLabel')
                              }
                              className="h-8 px-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            >
                              {isResubmit ? (
                                <RotateCcw className="size-3.5" />
                              ) : (
                                <Pencil className="size-3.5" />
                              )}
                              <span className="hidden sm:inline">
                                {isResubmit ? t('resubmit') : t('edit')}
                              </span>
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTemplateToDelete(template)}
                            disabled={deletingId === template.id}
                            aria-label={
                              template.meta_template_id
                                ? t('deleteMetaLocallyAria')
                                : t('deleteLocallyAria')
                            }
                            title={
                              template.meta_template_id
                                ? t('deleteMetaLocallyTitle')
                                : t('deleteLocallyTitle')
                            }
                            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            {deletingId === template.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* ---- Badges ---- */}
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge
                          className={cn(
                            'border text-xs',
                            CATEGORY_BADGE[template.category],
                          )}
                        >
                          {template.category}
                        </Badge>
                        <Badge className={cn('border text-xs', status.classes)}>
                          {status.label}
                        </Badge>
                        {shape ? (
                          <Badge
                            variant="outline"
                            className="text-xs font-normal"
                          >
                            {shape}
                          </Badge>
                        ) : null}
                      </div>

                      {/* ---- Message preview ---- */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="line-clamp-3 text-sm break-words text-muted-foreground">
                          {template.body_text}
                        </p>
                        {template.footer_text ? (
                          <p className="truncate text-xs text-muted-foreground/70 italic">
                            {template.footer_text}
                          </p>
                        ) : null}
                      </div>

                      {problem ? (
                        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/[0.07] px-2 py-1.5 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span className="min-w-0 break-words">{problem}</span>
                        </div>
                      ) : null}

                      {/* ---- Meta row: language + Meta's quality rating ---- */}
                      <div className="flex items-center gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
                        {template.language ? (
                          <span className="uppercase">{template.language}</span>
                        ) : null}
                        {template.quality_score ? (
                          <>
                            <span aria-hidden>·</span>
                            <span
                              className={cn(
                                'font-medium uppercase',
                                QUALITY_TEXT[template.quality_score],
                              )}
                              title="Meta quality score"
                            >
                              {template.quality_score}
                            </span>
                          </>
                        ) : null}
                        {!template.meta_template_id ? (
                          <>
                            <span aria-hidden>·</span>
                            {/* Worth flagging: a local-only row has never
                                been to Meta, so it cannot be sent yet. */}
                            <span>Not submitted</span>
                          </>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Confirm-delete dialog. Surfacing the meta_template_id case
          separately so users understand a real Meta delete is happening,
          not just a local cleanup. */}
      <Dialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('deleteDialogTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {templateToDelete?.meta_template_id
                ? t('deleteMetaDesc', { name: templateToDelete.name })
                : t('deleteLocalDesc', { name: templateToDelete?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={deletingId !== null}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deletingId !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('delete')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
