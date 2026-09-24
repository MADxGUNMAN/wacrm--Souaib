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
// What remains: the list itself, Sync from Meta, delete, and two
// read-only dialogs — the rendered message and Meta's analytics.
//
// ─── Why a table rather than cards ────────────────────────────────
//
// The card grid showed three lines of body text per template, which is
// the least decision-relevant thing about it. The questions an operator
// actually arrives with are comparative — which of these is approved,
// which language variant is this, which one is getting read — and
// comparison across cards means reading the same field in a different
// screen position every time. A table puts each field in a fixed column,
// which is what makes scanning twenty templates possible. The message
// body moves behind "View message", where it is rendered as the customer
// sees it rather than truncated to plain text.
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
  Copy,
  Pencil,
  RotateCcw,
  ListFilter,
  Check,
  X,
  ChartNoAxesColumn,
  MessageSquareText,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { readApiResponse } from '@/lib/http/read-api-response';
import { useInsightsSupport } from '@/hooks/use-insights-support';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MessageTemplate } from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import { findTypeOption } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import { TemplatePreviewDialog } from '@/components/templates/template-preview-dialog';
import { TemplateInsightsDialog } from '@/components/templates/template-insights-dialog';
import { MessagePricingCard } from '@/components/templates/message-pricing-card';
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
  filter: StatusFilter
): boolean {
  if (filter === 'ALL') return true;
  const status = (template.status ?? 'DRAFT').toUpperCase();
  if (filter === 'APPROVED') return status === 'APPROVED';
  if (filter === 'PENDING') {
    return ['PENDING', 'DRAFT', 'IN_APPEAL', 'PENDING_DELETION'].includes(
      status
    );
  }
  return ['REJECTED', 'PAUSED', 'DISABLED'].includes(status);
}

function matchesCategory(
  template: MessageTemplate,
  filter: CategoryFilter
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

/**
 * Per-template spend, in the WABA's own currency.
 *
 * Replaces the old "Quality" column. Meta only publishes a quality
 * rating once a template has enough delivery volume to earn one, so on a
 * normal account that column read "—" on every row and told the operator
 * nothing. Spend is reported as soon as a template is used.
 *
 * Two decimals, matching how Meta itself prints charges. The window is
 * stated in the column header so the figure is never an unlabelled
 * number.
 */
function formatSpend(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const code = (currency ?? '').trim();
  try {
    if (!code) throw new Error('no currency');
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return code ? `${code} ${formatted}` : formatted;
  }
}

/** Shape of GET /api/whatsapp/templates/analytics-summary. */
interface SpendSummary {
  available: boolean;
  cost_reported: boolean;
  /** True while a background Meta refresh is in flight. */
  refreshing?: boolean;
  refreshed_at?: string | null;
  currency: string | null;
  window?: {
    start: string | null;
    end: string;
    days?: number;
    all_time?: boolean;
  };
  templates: {
    id: string;
    sent: number;
    delivered: number;
    spent: number | null;
  }[];
}

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
  return findTypeOption(template.category, type as TemplateType)?.title ?? null;
}

/** `text` → `Text`, and a missing header is "None" rather than blank. */
function headerLabel(template: MessageTemplate): string {
  const header = template.header_type;
  if (!header) return 'None';
  return header.charAt(0).toUpperCase() + header.slice(1);
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
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  // Template selected for the confirm-delete dialog. The destructive
  // action goes through this two-step so a slip on the trash icon
  // doesn't take the template off Meta as well as locally.
  const [templateToDelete, setTemplateToDelete] =
    useState<MessageTemplate | null>(null);
  // The two read-only dialogs. Held as the row itself rather than an id
  // so the dialog has everything it needs without a second lookup.
  const [previewTemplate, setPreviewTemplate] =
    useState<MessageTemplate | null>(null);
  /**
   * Meta serves no template analytics for Coexistence numbers, so the whole
   * Insights column is dropped for those accounts rather than rendering a
   * button that can only ever report its own impossibility.
   *
   * `null` (still loading, or the mode could not be read) keeps the column,
   * because the honest failure is still explained inside the dialog — showing
   * it briefly is better than blinking it out of an otherwise stable table.
   */
  const { supported: insightsSupported } = useInsightsSupport();
  const showInsightsColumn = insightsSupported !== false;

  const [insightsTemplate, setInsightsTemplate] =
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
  /**
   * Real per-template spend from Meta, loaded separately from the rows.
   *
   * Kept out of the main list load on purpose: this needs a live Meta
   * round trip per 10 templates, and the list must render immediately
   * from the database rather than waiting on Meta. Null until it answers.
   */
  const [spend, setSpend] = useState<SpendSummary | null>(null);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchTemplates(accountId);
    void fetchSpend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profileLoading, accountId]);

  /**
   * Ask Meta what each template has cost over the last 30 days.
   *
   * Failure is silent by design: the column simply does not appear. An
   * error banner over a working template list would be noise, since
   * nothing an operator does here depends on the figure.
   */
  async function fetchSpend(attempt = 0) {
    try {
      // Served from our own table, so this returns in one query instead of
      // waiting on ~30 paginated Meta requests (which is what made this
      // column take two minutes to appear).
      const res = await fetch('/api/whatsapp/templates/analytics-summary', {
        cache: 'no-store',
      });
      if (!res.ok) {
        setSpend(null);
        return;
      }
      const summary = (await res.json()) as SpendSummary;
      setSpend(summary);

      // A brand-new account has nothing stored yet, and the route kicks
      // off its Meta refresh AFTER responding. Check back once so the
      // column appears on its own instead of needing a manual reload.
      // Bounded to two attempts — beyond that it is a real problem, not a
      // cold cache, and silently polling forever would hide it.
      if (summary.refreshing && summary.templates.length === 0 && attempt < 2) {
        setTimeout(() => void fetchSpend(attempt + 1), 6000);
      }
    } catch {
      setSpend(null);
    }
  }

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
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      toast.success(
        t('toastSyncCount', { total: data.total }) +
          (data.inserted || data.updated
            ? t('toastSyncDetails', {
                inserted: data.inserted,
                updated: data.updated,
              })
            : '')
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors
          .slice(0, 3)
          .map(
            (e: { name: string; language: string; message: string }) =>
              `${e.name} (${e.language})`
          );
        const suffix =
          data.errors.length > 3 ? `, +${data.errors.length - 3} more` : '';
        toast.error(
          t('toastSyncFailed', { preview: preview.join(', ') + suffix })
        );
      }
      if (data.truncated) {
        // Use error (not warning) so the message survives long
        // enough to read — sonner's `warning` auto-dismisses on
        // the same short timer as `success`.
        toast.error(t('toastSyncTruncated'), { duration: 10000 });
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

  /**
   * Clear the stored failure note on one template.
   *
   * Local-only: nothing about the template on Meta's side is touched, so
   * there is no confirm step. The row is patched in place rather than
   * refetching the whole list — the response is authoritative and a full
   * reload would scroll the operator away from the row they just acted
   * on.
   */
  async function dismissProblem(templateId: string) {
    if (dismissingId) return;
    setDismissingId(templateId);
    try {
      const res = await fetch(
        `/api/whatsapp/templates/${templateId}/dismiss-error`,
        { method: 'POST' }
      );
      const result = await readApiResponse<{ template?: MessageTemplate }>(
        res,
        'cleared'
      );
      if (!result.ok) {
        toast.error(result.error ?? 'Could not clear the message.');
        return;
      }
      setTemplates((prev) =>
        prev.map((row) =>
          row.id === templateId
            ? {
                ...row,
                submission_error: undefined,
                // Mirrors the server: a genuinely rejected template keeps
                // its reason, so only drop it when the server did.
                rejection_reason:
                  row.status === 'REJECTED' ? row.rejection_reason : undefined,
              }
            : row
        )
      );
    } catch {
      toast.error('Could not clear the message.');
    } finally {
      setDismissingId(null);
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
          matchesQuery(template, query)
      ),
    [templates, statusFilter, categoryFilter, query]
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
        matchesQuery(template, query)
    ).length;

  const categoryCount = (filter: CategoryFilter) =>
    templates.filter(
      (template) =>
        matchesStatus(template, statusFilter) &&
        matchesCategory(template, filter) &&
        matchesQuery(template, query)
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

  /**
   * Show the Spend column only when Meta actually reported a cost.
   *
   * Meta withholds cost entirely for WABAs billed through a Solution
   * Partner's credit line, and it reports nothing at all before template
   * insights are switched on. In either case the column would be a row of
   * dashes, so it is removed rather than rendered empty.
   */
  const showSpend = Boolean(spend?.available && spend.cost_reported);
  const spendById = useMemo(
    () => new Map((spend?.templates ?? []).map((row) => [row.id, row])),
    [spend]
  );
  const spendColumnCount = showSpend ? 9 : 8;

  /**
   * The column total, so the billing card can name the difference against
   * Meta's ledger instead of leaving an operator to find it on an invoice.
   * Null when nothing is attributed, which is different from zero.
   */
  const attributedSpend = useMemo(() => {
    const rows = (spend?.templates ?? []).filter((r) => r.spent !== null);
    if (rows.length === 0) return null;
    return rows.reduce((sum, r) => sum + (r.spent ?? 0), 0);
  }, [spend]);

  return (
    <section className="animate-in fade-in-50 space-y-5 duration-200">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground max-w-[68ch] text-sm">
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
            className="border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <LibraryBig className="size-4" />
            Browse library
          </Link>
          {/* A real Link (not a Button + router.push) so middle-click and
              open-in-new-tab behave normally. */}
          <Link
            href="/templates/new"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plus className="size-4" />
            {t('newTemplate')}
          </Link>
        </div>
      </div>

      {/* Meta's billing total, live. Sits above the table because it is
          the account-level figure the per-template column adds up toward
          but cannot equal — see MessagePricingCard. */}
      <MessagePricingCard
        attributedSpend={attributedSpend}
        attributedFrom={spend?.window?.start ?? null}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted flex size-11 items-center justify-center rounded-full">
              <LibraryBig className="text-muted-foreground size-5" />
            </div>
            <p className="text-foreground mt-4 text-sm font-medium">
              {t('noTemplates')}
            </p>
            <p className="text-muted-foreground mt-1 max-w-[46ch] text-sm">
              {t('createFirst')}
            </p>
            {/* A brand-new account has nothing to sync and nothing to edit,
                so the library is the only useful next step — offering it
                here saves a hunt through the header. */}
            <Link
              href="/templates/library"
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
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
              className="border-border bg-muted/40 inline-flex flex-wrap gap-1 rounded-lg border p-1"
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
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        'rounded px-1.5 text-xs tabular-nums',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground/70'
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
                          'border-primary/40 bg-primary/5 text-primary'
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
                    <DropdownMenuLabel className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
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
                              isActive ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="flex-1">{c.label}</span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {categoryCount(c.id)}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span>
                Showing{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {visibleTemplates.length}
                </span>{' '}
                of <span className="tabular-nums">{templates.length}</span>{' '}
                templates
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-primary hover:bg-primary/10 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors"
              >
                <X className="size-3.5" />
                Clear filters
              </button>
            </div>
          ) : null}

          {visibleTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <p className="text-foreground text-sm font-medium">
                  No templates match these filters.
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Try a different status or category, or clear the search.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  <X className="size-3.5" />
                  Clear filters
                </button>
              </CardContent>
            </Card>
          ) : (
            /* ---- The table ----
               Scrolls horizontally on narrow screens rather than wrapping
               cells: a wrapped table loses the column alignment that is
               the entire reason for using one. The Table primitive already
               provides the overflow container. */
            <div className="border-border bg-card overflow-hidden rounded-xl border">
              <Table
                containerClassName="max-w-full"
                className="w-full min-w-[880px]"
              >
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-10 min-w-[200px] pl-4 text-xs">
                      Name
                    </TableHead>
                    <TableHead className="h-10 w-[110px] text-xs">
                      Status
                    </TableHead>
                    <TableHead className="h-10 w-[90px] text-xs">
                      Header
                    </TableHead>
                    <TableHead className="h-10 w-[90px] text-xs">
                      Language
                    </TableHead>
                    <TableHead className="h-10 w-[120px] text-xs">
                      Category
                    </TableHead>
                    {showSpend ? (
                      <TableHead
                        className="h-10 w-[130px] text-left text-xs"
                        title={
                          spend?.window
                            ? `Meta-reported spend, ${spend.window.start} to ${spend.window.end}`
                            : undefined
                        }
                      >
                        {spend?.window?.all_time
                          ? 'Spent (all time)'
                          : 'Spent (30d)'}
                      </TableHead>
                    ) : null}
                    <TableHead className="h-10 w-[85px] text-center text-xs">
                      Message
                    </TableHead>
                    {/*
                      Dropped entirely for Coexistence accounts. Meta refuses
                      template analytics on a number that also runs on the
                      WhatsApp Business phone app, so the button opened a
                      dialog whose only possible outcome was "this can never
                      work". A column of dead controls is worse than no column,
                      and we know which case we are in from the moment the
                      number is connected.
                    */}
                    {showInsightsColumn ? (
                      <TableHead className="h-10 w-[95px] text-center text-xs">
                        Insights
                      </TableHead>
                    ) : null}
                    <TableHead className="h-10 w-[110px] pr-4 text-right text-xs">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                    const onMeta = Boolean(template.meta_template_id);

                    return [
                      <TableRow
                        key={template.id}
                        className={problem ? 'border-b-0' : undefined}
                      >
                        {/* ---- Name ---- */}
                        <TableCell className="pl-4">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-foreground truncate font-mono text-sm font-medium">
                              {template.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {shape ? (
                                <span className="text-muted-foreground text-[11px]">
                                  {shape}
                                </span>
                              ) : null}
                              {!onMeta ? (
                                <>
                                  {shape ? (
                                    <span
                                      className="text-muted-foreground/50 text-[11px]"
                                      aria-hidden
                                    >
                                      ·
                                    </span>
                                  ) : null}
                                  {/* A local-only row has never been to
                                      Meta, so it cannot be sent yet. */}
                                  <span className="text-muted-foreground text-[11px]">
                                    Not submitted
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>

                        {/* ---- Status ---- */}
                        <TableCell>
                          <Badge
                            className={cn('border text-xs', status.classes)}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>

                        {/* ---- Header type ---- */}
                        <TableCell className="text-muted-foreground text-xs">
                          {headerLabel(template)}
                        </TableCell>

                        {/* ---- Language ---- */}
                        <TableCell className="text-muted-foreground text-xs uppercase">
                          {template.language ?? '—'}
                        </TableCell>

                        {/* ---- Category ---- */}
                        <TableCell>
                          <Badge
                            className={cn(
                              'border text-xs',
                              CATEGORY_BADGE[template.category]
                            )}
                          >
                            {template.category}
                          </Badge>
                        </TableCell>

                        {/* ---- Meta-reported spend ---- */}
                        {showSpend ? (
                          <TableCell className="text-left text-xs tabular-nums">
                            {(() => {
                              const row = spendById.get(template.id);
                              // Meta reported nothing for this template in
                              // the window, which is different from "it
                              // cost nothing" only in that we cannot claim
                              // a figure — so no figure is shown.
                              if (!row || row.spent === null) {
                                return (
                                  <span className="text-muted-foreground/60">
                                    —
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className="text-foreground font-medium"
                                  title={`${row.sent.toLocaleString()} sent · ${row.delivered.toLocaleString()} delivered`}
                                >
                                  {formatSpend(
                                    row.spent,
                                    spend?.currency ?? null
                                  )}
                                </span>
                              );
                            })()}
                          </TableCell>
                        ) : null}

                        {/* ---- View message ---- */}
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={() => setPreviewTemplate(template)}
                            title="See the message as the customer receives it"
                          >
                            <MessageSquareText className="size-3.5" />
                            View
                          </Button>
                        </TableCell>

                        {/* ---- View insights ----
                            Disabled without a Meta id: analytics are keyed
                            on Meta's template id, so there is nothing to
                            ask about for a local draft.

                            Absent altogether on Coexistence accounts — see
                            the header comment. */}
                        {showInsightsColumn ? (
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!onMeta}
                              className={cn(
                                'h-7 gap-1.5 px-2 text-xs',
                                onMeta &&
                                  'text-primary border-primary/30 hover:bg-primary/10'
                              )}
                              onClick={() => setInsightsTemplate(template)}
                              title={
                                onMeta
                                  ? 'Sent, delivered, read and clicked, from Meta'
                                  : 'Submit this template to Meta first — analytics only exist for templates Meta knows about'
                              }
                            >
                              <ChartNoAxesColumn className="size-3.5" />
                              Insights
                            </Button>
                          </TableCell>
                        ) : null}

                        {/* ---- Row actions ---- */}
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-0.5">
                            {/* Edit and Resubmit both open the wizard. The
                                old flat dialog could not express a
                                carousel's cards or an OTP template's
                                options, so for those types it silently
                                discarded what it did not understand.
                                Pending templates have neither button
                                because Meta will not accept an edit while a
                                review is in flight. */}
                            {canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  router.push(`/templates/${template.id}/edit`)
                                }
                                title={
                                  isResubmit
                                    ? t('resubmitTitle')
                                    : t('editTitle')
                                }
                                aria-label={
                                  isResubmit
                                    ? t('resubmitLabel')
                                    : t('editLabel')
                                }
                                className="text-muted-foreground hover:bg-primary/10 hover:text-primary size-8"
                              >
                                {isResubmit ? (
                                  <RotateCcw className="size-4" />
                                ) : (
                                  <Pencil className="size-4" />
                                )}
                              </Button>
                            ) : null}

                            {/* Duplicate — a FIRST-CLASS action, not a
                                consolation prize after a failed edit.

                                Meta rate-limits edits to one per 24h and
                                10 per month, and refuses some edits
                                outright, so "copy it and submit a new one"
                                is a routine way to change a live template
                                — not an error path. It was previously only
                                reachable from the error banner, which
                                meant discovering it required first filling
                                in the whole edit form and having it
                                rejected. */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                router.push(
                                  `/templates/new?copyFrom=${template.id}`
                                )
                              }
                              title="Copy into a new template"
                              aria-label="Copy into a new template"
                              className="text-muted-foreground hover:bg-primary/10 hover:text-primary size-8"
                            >
                              <Copy className="size-4" />
                            </Button>

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
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-8"
                            >
                              {deletingId === template.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>,

                      /* ---- Problem row ----
                         A second row spanning the table rather than a
                         cell, because a rejection reason is a sentence and
                         squeezing it into a column would truncate the only
                         part that says what to fix. */
                      problem ? (
                        <TableRow
                          key={`${template.id}-problem`}
                          className="hover:bg-transparent"
                        >
                          <TableCell
                            colSpan={spendColumnCount}
                            className="px-4 pt-0 pb-3"
                          >
                            <div className="border-destructive/30 bg-destructive/[0.07] text-destructive flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs whitespace-normal">
                              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                              <span className="min-w-0 flex-1 break-words">
                                {problem}
                              </span>
                              {/* Dismissable ONLY when the template is not
                                  currently rejected. On an APPROVED
                                  template this text is a note about a past
                                  failed attempt and the template works
                                  fine, so it should be clearable. On a
                                  REJECTED one it is the live reason the
                                  template cannot be sent — hiding that
                                  would remove something the user still has
                                  to act on. */}
                              {statusKey !== 'REJECTED' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void dismissProblem(template.id)
                                  }
                                  disabled={dismissingId === template.id}
                                  title="Dismiss this message"
                                  aria-label="Dismiss this message"
                                  className="text-destructive/60 hover:text-destructive -m-1 shrink-0 rounded p-1 disabled:opacity-50"
                                >
                                  {dismissingId === template.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <X className="size-3.5" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* The rendered message, and Meta's numbers. Both read-only, both
          keyed off the row so they carry no stale state between opens. */}
      <TemplatePreviewDialog
        template={previewTemplate}
        open={previewTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplate(null);
        }}
      />
      <TemplateInsightsDialog
        template={insightsTemplate}
        open={insightsTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setInsightsTemplate(null);
        }}
      />

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
            <DialogTitle className="text-popover-foreground">
              {t('deleteDialogTitle')}
            </DialogTitle>
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
              className="bg-red-600 text-white hover:bg-red-700"
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
