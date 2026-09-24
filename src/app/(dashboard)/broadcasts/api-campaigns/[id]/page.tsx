'use client';

// ============================================================
// API Campaign detail — the definition, plus every run of it.
//
// A "run" is one `broadcasts` row with `api_campaign_id` set to this
// campaign's id (see plan §4.1 / migration 20260912100000).
//
// THIS SCREEN IS THE BROADCAST REPORT, AGGREGATED
// It reuses `StatCard`, `FunnelChart`, `getRecipientStatus` and
// `RecipientDetailDialog` — the same pieces `/broadcasts/[id]` uses —
// because a run IS a broadcast. An earlier version had three bespoke
// tiles and a four-column table, which meant a campaign's send history
// looked nothing like the send history of the identical messages sent
// from the wizard, and answered fewer questions about it.
//
// ONE TILE DIFFERS, DELIBERATELY: where a broadcast counts Total
// Recipients, a campaign counts RUNS. A campaign has no fixed audience —
// "how many times has this fired" is the number that means something,
// and it is the number the sheet's operator is looking for.
//
// THE RUNS TABLE SHOWS THE OPERATOR'S OWN DATA
// Each row carries the values that were actually sent, under the
// spreadsheet's own column headings, read from
// `broadcasts.variable_labels` + `broadcast_recipients.send_params`
// (migration 20260915130000). Only the columns the template actually
// uses appear, because those are the only ones a rule maps. Runs created
// before that migration have no labels; their values still show, under a
// generic "Value n", rather than being hidden.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plug,
  Trash2,
  Check,
  X,
  Send,
  CheckCheck,
  Eye,
  MessageCircle,
  AlertCircle,
  Repeat,
  Filter,
  Download,
  ChevronDown,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import type {
  ApiCampaign,
  Broadcast,
  BroadcastRecipient,
  RecipientStatus,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getApiCampaignStatus,
  getBroadcastStatus,
  getRecipientStatus,
} from '@/lib/broadcast-status';
import { StatCard } from '@/components/broadcasts/stat-card';
import {
  FunnelChart,
  type FunnelStep,
} from '@/components/broadcasts/funnel-chart';
import { RecipientDetailDialog } from '@/components/broadcasts/recipient-detail-dialog';
import { toCsv, downloadCsv, csvSlug } from '@/lib/csv';

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
  'skipped',
];

/** Matches the list page: only poll while something is actually moving. */
const POLL_INTERVAL_MS = 5_000;

/**
 * One line of the runs table.
 *
 * A row is a RECIPIENT, not a run, and the run repeats across its
 * recipients. For the Google Sheets add-on the two are the same thing —
 * it sends one recipient per call — but a caller's own backend can post
 * fifty in one request, and collapsing those into a single row would have
 * to pick one recipient's values to display and silently drop the other
 * forty-nine. `recipient` is null only for a run whose recipients were
 * all rejected or suppressed before insert, which still deserves a line
 * rather than vanishing from its own report.
 */
interface RunEntry {
  run: Broadcast;
  recipient: BroadcastRecipient | null;
  /** Positional body values actually sent, aligned with the labels. */
  values: string[];
}

/**
 * Column headings for the value columns.
 *
 * Taken from the NEWEST run that recorded any, because that is the
 * current shape of the rule feeding this campaign. Two rules on two
 * sheets can drive one campaign with different columns mapped to the same
 * variables, and one table can only have one set of headings — showing
 * the most recent is both the most useful answer and the honest one.
 *
 * Falls back to counting the widest `params` array, so a campaign whose
 * runs all predate label recording still gets a column per value instead
 * of no value columns at all.
 */
function resolveValueLabels(
  runs: Broadcast[],
  entries: RunEntry[],
  genericLabel: (index: number) => string
): string[] {
  const labelled = runs.find(
    (r) => Array.isArray(r.variable_labels) && r.variable_labels.length > 0
  );

  if (labelled?.variable_labels) {
    return labelled.variable_labels.map(
      (label, i) => label?.trim() || genericLabel(i)
    );
  }

  const widest = entries.reduce(
    (max, entry) => Math.max(max, entry.values.length),
    0
  );
  return Array.from({ length: widest }, (_, i) => genericLabel(i));
}

export default function ApiCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('Broadcasts.apiCampaign');
  const tDetail = useTranslations('Broadcasts.detail');
  const tStatus = useTranslations('Broadcasts.status');
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<ApiCampaign | null>(null);
  const [runs, setRuns] = useState<Broadcast[]>([]);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all'
  );
  const [detailRecipient, setDetailRecipient] =
    useState<BroadcastRecipient | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      // No dashboard route for a single campaign exists (the list route
      // returns the whole roster) — a direct RLS-scoped read is exactly
      // as safe here, since `api_campaigns_select` already restricts it
      // to this account.
      const { data: campaignRow, error: campaignError } = await supabase
        .from('api_campaigns')
        .select('*')
        .eq('id', campaignId)
        .maybeSingle();

      if (campaignError) throw campaignError;
      if (!campaignRow) {
        setNotFound(true);
        return;
      }
      setCampaign(campaignRow);
      setNameDraft((current) => (editingName ? current : campaignRow.name));

      const { data: runRows, error: runError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('api_campaign_id', campaignId)
        .order('created_at', { ascending: false });
      if (runError) throw runError;

      const loadedRuns = runRows ?? [];
      setRuns(loadedRuns);

      // Second query rather than a nested embed: the values shown in the
      // table live on `broadcast_recipients`, which has no
      // `api_campaign_id` of its own, so they can only be reached through
      // the run ids. Skipped entirely when there are no runs — `.in()`
      // with an empty array is a query that can only return nothing.
      if (loadedRuns.length === 0) {
        setRecipients([]);
        return;
      }

      const { data: recipientRows, error: recipientError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .in(
          'broadcast_id',
          loadedRuns.map((r) => r.id)
        )
        .order('created_at', { ascending: false });
      if (recipientError) throw recipientError;
      setRecipients(recipientRows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
    // `editingName` is read only to avoid clobbering a half-typed name on
    // a poll tick; it must not re-trigger the load itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // A run posted with more than 25 recipients is persisted as 'scheduled'
  // and drained by the five-minute sweep, so poll on that too — not just
  // 'sending' like the list page, which never shows a scheduled run.
  const anyInFlight = useMemo(
    () => runs.some((r) => r.status === 'sending' || r.status === 'scheduled'),
    [runs]
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(load, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    function handleVisibilityChange() {
      if (!anyInFlight) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        load();
        startPolling();
      }
    }

    if (anyInFlight && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anyInFlight, load]);

  /**
   * Campaign totals, summed over the runs.
   *
   * Read off the run rows rather than tallied from `recipients`, because
   * those columns are maintained by the aggregate trigger (migrations
   * 003/005) and keep advancing as Meta's delivery and read webhooks
   * arrive. Counting the recipient array instead would also silently
   * undercount past PostgREST's ~1000-row cap.
   */
  const totals = useMemo(
    () =>
      runs.reduce(
        (acc, r) => ({
          recipients: acc.recipients + r.total_recipients,
          sent: acc.sent + r.sent_count,
          delivered: acc.delivered + r.delivered_count,
          read: acc.read + r.read_count,
          replied: acc.replied + r.replied_count,
          failed: acc.failed + r.failed_count,
        }),
        { recipients: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 }
      ),
    [runs]
  );

  const entries = useMemo<RunEntry[]>(() => {
    const byRun = new Map<string, BroadcastRecipient[]>();
    for (const recipient of recipients) {
      const list = byRun.get(recipient.broadcast_id);
      if (list) list.push(recipient);
      else byRun.set(recipient.broadcast_id, [recipient]);
    }

    // Driven by `runs`, which is already newest-first, so the table order
    // follows the runs rather than the recipient insert order.
    return runs.flatMap((run): RunEntry[] => {
      const runRecipients = byRun.get(run.id) ?? [];
      if (runRecipients.length === 0) {
        return [{ run, recipient: null, values: [] }];
      }
      return runRecipients.map((recipient) => ({
        run,
        recipient,
        values: Array.isArray(recipient.send_params?.params)
          ? recipient.send_params.params.filter(
              (v): v is string => typeof v === 'string'
            )
          : [],
      }));
    });
  }, [runs, recipients]);

  const valueLabels = useMemo(
    () =>
      resolveValueLabels(runs, entries, (i) =>
        t('table.genericValue', { index: i + 1 })
      ),
    [runs, entries, t]
  );

  const filteredEntries = useMemo(
    () =>
      statusFilter === 'all'
        ? entries
        : entries.filter((e) => e.recipient?.status === statusFilter),
    [entries, statusFilter]
  );

  /** "Sheet1 · row 4" when the caller told us, else the run's name. */
  function describeRun(run: Broadcast): string {
    const sheet = run.source_ref?.sheet;
    const row = run.source_ref?.row;
    if (sheet && row) return t('table.sheetRow', { sheet, row: String(row) });
    if (sheet) return String(sheet);
    return run.name;
  }

  function handleExport() {
    if (!campaign) return;
    const header = [
      t('table.run'),
      tDetail('table.contact'),
      tDetail('table.phone'),
      ...valueLabels,
      tDetail('table.status'),
      tDetail('table.sent'),
      tDetail('table.delivered'),
      tDetail('table.read'),
      tDetail('table.error'),
    ];
    // Exports every run, not the filtered view — same choice the
    // broadcast report makes: a filter is for reading on screen, an
    // export is the record.
    const rows = entries.map((entry) => [
      describeRun(entry.run),
      entry.recipient?.contact?.name ?? '',
      entry.recipient?.contact?.phone ?? '',
      ...valueLabels.map((_, i) => entry.values[i] ?? ''),
      entry.recipient?.status ?? '',
      entry.recipient?.sent_at ?? '',
      entry.recipient?.delivered_at ?? '',
      entry.recipient?.read_at ?? '',
      entry.recipient?.error_message ?? '',
    ]);
    downloadCsv(
      `api-campaign-${csvSlug(campaign.name)}-${campaignId.slice(0, 8)}.csv`,
      toCsv([header, ...rows])
    );
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!campaign || !trimmed || trimmed === campaign.name) {
      setEditingName(false);
      setNameDraft(campaign?.name ?? '');
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/account/api-campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await res.json()) as {
        campaign?: ApiCampaign;
        error?: string;
      };
      if (!res.ok || !payload.campaign) {
        throw new Error(payload.error ?? t('renameFailed'));
      }
      setCampaign(payload.campaign);
      setEditingName(false);
      toast.success(t('renamed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('renameFailed'));
    } finally {
      setSavingName(false);
    }
  }

  async function toggleStatus(next: boolean) {
    if (!campaign) return;
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/account/api-campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next ? 'active' : 'paused' }),
      });
      const payload = (await res.json()) as {
        campaign?: ApiCampaign;
        error?: string;
      };
      if (!res.ok || !payload.campaign) {
        throw new Error(payload.error ?? t('updateFailed'));
      }
      setCampaign(payload.campaign);
      toast.success(next ? t('toastResumed') : t('toastPaused'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateFailed'));
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleDelete() {
    if (!campaign) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/account/api-campaigns/${campaign.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? t('deleteFailed'));
      }
      toast.success(t('toastDeleted'));
      router.push('/broadcasts');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (notFound || !campaign) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">{t('notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {tDetail('backToBroadcasts')}
        </Button>
      </div>
    );
  }

  const status = getApiCampaignStatus(campaign.status);

  const funnelSteps: FunnelStep[] = [
    { label: tDetail('stats.sent'), value: totals.sent, color: 'bg-primary' },
    {
      label: tDetail('stats.delivered'),
      value: totals.delivered,
      color: 'bg-teal-500',
    },
    {
      label: tDetail('stats.read'),
      value: totals.read,
      color: 'bg-blue-500',
    },
    {
      label: tDetail('stats.replied'),
      value: totals.replied,
      color: 'bg-indigo-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            aria-label={tDetail('backToBroadcasts')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={80}
                    className="h-8 w-56"
                    disabled={savingName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveName();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameDraft(campaign.name);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={savingName}
                    onClick={() => void saveName()}
                  >
                    {savingName ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={savingName}
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(campaign.name);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-foreground flex items-center gap-2 text-lg font-semibold">
                    <Plug className="text-primary h-5 w-5" />
                    {campaign.name}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t('renameCampaign')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {tDetail('template', { name: campaign.template_name })} (
              {campaign.template_language})
              {runs.length > 0 ? (
                <>
                  {' · '}
                  {t('recipientsAcrossRuns', {
                    recipients: totals.recipients.toLocaleString(),
                    runs: runs.length,
                  })}
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/*
            Pausing does not touch existing runs — it only makes
            POST /api/v1/campaigns/{id}/send start refusing new ones
            with `campaign_paused`. Framed here as a switch rather than
            a destructive action because it is fully reversible and the
            common case ("stop the sheet for a week") is not a delete.
          */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
            >
              {campaign.status === 'active'
                ? t('statusActive')
                : t('statusPaused')}
            </span>
            <Switch
              checked={campaign.status === 'active'}
              disabled={togglingStatus}
              onCheckedChange={(checked) => void toggleStatus(checked)}
              aria-label={t('campaignActive')}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
            title={t('deleteCampaign')}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* The same six tiles as a broadcast report, with Runs standing in
          for Total Recipients — see the module header. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={t('stats.runs')}
          value={runs.length}
          total={runs.length}
          icon={<Repeat className="h-4 w-4" />}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label={tDetail('stats.sent')}
          value={totals.sent}
          total={totals.recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label={tDetail('stats.delivered')}
          value={totals.delivered}
          total={totals.recipients}
          icon={<CheckCheck className="h-4 w-4" />}
          color="bg-teal-500/10 text-teal-400"
        />
        <StatCard
          label={tDetail('stats.read')}
          value={totals.read}
          total={totals.recipients}
          icon={<Eye className="h-4 w-4" />}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label={tDetail('stats.replied')}
          value={totals.replied}
          total={totals.recipients}
          icon={<MessageCircle className="h-4 w-4" />}
          color="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label={tDetail('stats.failed')}
          value={totals.failed}
          total={totals.recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      {runs.length > 0 ? (
        <FunnelChart steps={funnelSteps} title={t('funnel')} />
      ) : null}

      {/* Runs */}
      <div className="border-border bg-card rounded-xl border">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-foreground text-sm font-medium">
            {statusFilter !== 'all'
              ? t('runsHeaderFiltered', {
                  filtered: filteredEntries.length,
                  total: entries.length,
                })
              : t('runsHeader', { total: entries.length })}
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-muted-foreground hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? tDetail('allStatuses')
                  : tStatus(getRecipientStatus(statusFilter).label)}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-popover">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all'
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  }
                >
                  {tDetail('allStatuses')}
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    }
                  >
                    {tStatus(getRecipientStatus(s).label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={entries.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {tDetail('exportCsv')}
            </Button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-6">
            <p className="text-foreground text-sm font-medium">
              {t('noRunsYet')}
            </p>
            <p className="text-muted-foreground mt-1 max-w-sm text-center text-xs">
              {t('noRunsHint')}
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-muted-foreground text-sm">{t('noRunsFilter')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">
                    {t('table.run')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {tDetail('table.contact')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {tDetail('table.phone')}
                  </TableHead>
                  {/* The operator's own columns, in template order. */}
                  {valueLabels.map((label, i) => (
                    <TableHead
                      key={`${label}-${i}`}
                      className="text-muted-foreground whitespace-nowrap"
                    >
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="text-muted-foreground">
                    {tDetail('table.status')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {tDetail('table.sent')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {tDetail('table.error')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry, index) => {
                  const { run, recipient } = entry;
                  // A run with no recipient row has no recipient status to
                  // show, so fall back to the run's own — it is the only
                  // truthful thing available for it.
                  const badge = recipient
                    ? getRecipientStatus(recipient.status)
                    : getBroadcastStatus(run.status);
                  return (
                    <TableRow
                      key={recipient?.id ?? `${run.id}-${index}`}
                      className="border-border"
                    >
                      <TableCell className="text-foreground font-medium">
                        <button
                          type="button"
                          onClick={() => router.push(`/broadcasts/${run.id}`)}
                          className="hover:text-primary text-left hover:underline"
                          title={t('table.openRun')}
                        >
                          {describeRun(run)}
                        </button>
                        <span className="text-muted-foreground block text-xs">
                          {new Date(run.created_at).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-foreground">
                        {recipient?.contact?.name ?? '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient?.contact?.phone ?? '-'}
                      </TableCell>
                      {valueLabels.map((label, i) => (
                        <TableCell
                          key={`${run.id}-${label}-${i}`}
                          className="text-muted-foreground max-w-[12rem] truncate"
                          title={entry.values[i] ?? ''}
                        >
                          {entry.values[i] ?? '-'}
                        </TableCell>
                      ))}
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                        >
                          {tStatus(badge.label)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient?.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[10rem] truncate text-red-400">
                            {recipient?.status === 'failed'
                              ? (recipient.error_message ??
                                t('noReasonRecorded'))
                              : ''}
                          </span>
                          {recipient ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                recipient.status === 'failed'
                                  ? t('viewFailure')
                                  : t('viewDelivery')
                              }
                              onClick={() => setDetailRecipient(recipient)}
                              className={`h-7 w-7 shrink-0 cursor-pointer ${
                                recipient.status === 'failed'
                                  ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RecipientDetailDialog
        recipient={detailRecipient}
        onOpenChange={(open) => {
          if (!open) setDetailRecipient(null);
        }}
      />

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {t('deleteBody', { name: campaign.name })}
              </span>
              {/* Spells out the destructive half explicitly, and separates
                  it from what is NOT destroyed. "Send history is kept" was
                  the old wording and it is no longer true: the runs now
                  cascade. Getting that distinction wrong in a confirmation
                  dialog is how someone deletes a report they wanted. */}
              {runs.length > 0 ? (
                <span className="mt-2 block rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-red-300">
                  {t('deleteRunsNote', { runs: runs.length })}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              {tDetail('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting
                ? tDetail('deleting')
                : runs.length > 0
                  ? t('deleteConfirm', { runs: runs.length })
                  : t('deleteConfirmNoRuns')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
