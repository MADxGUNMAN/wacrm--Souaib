'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ApiCampaign, Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CalendarOff,
  ChevronDown,
  Filter,
  Loader2,
  Plus,
  Megaphone,
  Plug,
  Trash2,
} from 'lucide-react';
import {
  getApiCampaignStatus,
  getBroadcastStatus,
} from '@/lib/broadcast-status';
import { GatedButton } from '@/components/ui/gated-button';
import { useCan } from '@/hooks/use-can';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/**
 * One row of the merged Campaigns table.
 *
 * Screenshot 14 of the add-on plan (docs/google-sheets-addon-plan.md
 * §2.7 / §4.1) shows ONE list with a `Type` column of `API` / `BROADCAST`
 * rather than two separate screens. That list is a union:
 *
 *   - every `api_campaigns` row (a reusable definition, no fixed
 *     recipients, never terminal), plus
 *   - every `broadcasts` row whose `api_campaign_id IS NULL` (an
 *     ordinary one-off dashboard send).
 *
 * `broadcasts` rows WITH `api_campaign_id` set are deliberately excluded
 * here — they are one RUN of a campaign, not a campaign, and belong on
 * that campaign's own detail page instead of cluttering this list with
 * one row per trigger fire.
 */
type CampaignRow =
  | { kind: 'broadcast'; broadcast: Broadcast }
  | { kind: 'api_campaign'; campaign: ApiCampaign; stats: CampaignRunStats };

/** What the Type filter can be narrowed to. */
type RowKindFilter = 'all' | 'broadcast' | 'api_campaign';

/**
 * A campaign's runs, rolled up for the list row.
 *
 * Computed client-side from the `broadcasts` array this page already
 * fetches, rather than by extending the campaigns route with a join. Two
 * reasons: the rows are already on the wire (they were being fetched and
 * then filtered away), and the five-second poll refreshes `broadcasts`
 * but never re-requests campaigns — so aggregates derived from the
 * broadcast rows stay live while ones returned by the campaigns route
 * would freeze at first paint.
 *
 * Inherits this page's existing ceiling: the broadcasts query has no
 * range, so PostgREST caps it near 1000 rows and an account past that
 * would under-report its oldest runs. Pre-existing for every column on
 * this screen, not introduced here.
 */
interface CampaignRunStats {
  runs: number;
  recipients: number;
  delivered: number;
  read: number;
}

/**
 * True when this broadcast is one run of an API campaign.
 *
 * Runs are never listed on this page — a campaign fires once per matching
 * spreadsheet row, so they would bury the handful of things this list is
 * actually about, and each campaign already reports every one of its runs
 * on its own page. This predicate exists purely to EXCLUDE them.
 *
 * All three markers are checked rather than just `api_campaign_id`.
 * `api_campaign_id` is now ON DELETE CASCADE, so a live campaign's runs
 * always carry it and a deleted campaign's runs no longer exist at all —
 * but rows orphaned by the previous SET NULL behaviour are still in the
 * table, and `api_campaign_name` (backfilled by migration 20260916100000)
 * is what keeps those recognisable so they do not leak back into the list
 * disguised as hand-sent broadcasts.
 */
function isApiRun(broadcast: Broadcast): boolean {
  return (
    Boolean(broadcast.api_campaign_name) ||
    Boolean(broadcast.api_campaign_id) ||
    Boolean(broadcast.source_ref)
  );
}

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
        {pct}%
      </span>
      <div className="bg-muted h-1.5 w-20 overflow-hidden rounded-full">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [apiCampaigns, setApiCampaigns] = useState<ApiCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<RowKindFilter>('all');
  const [broadcastToDelete, setBroadcastToDelete] = useState<Broadcast | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  /** Id of the scheduled broadcast currently being cancelled, if any. */
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  /**
   * API campaigns go through the dashboard API route rather than a
   * direct Supabase query, unlike `fetchBroadcasts` above — there is no
   * behaviour difference here (RLS scopes both identically), it is
   * simply consistency with the route already written for the create
   * form (§6.1 of the plan) rather than a second query style for the
   * same resource.
   */
  async function fetchApiCampaigns() {
    try {
      const res = await fetch('/api/account/api-campaigns');
      const payload = (await res.json()) as {
        campaigns?: ApiCampaign[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to load');
      setApiCampaigns(payload.campaigns ?? []);
    } catch {
      // Non-fatal: the ordinary broadcast list still renders. An API
      // campaign row simply won't appear until the next successful poll.
      setApiCampaigns([]);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
    fetchApiCampaigns();
  }, []);

  /** Runs rolled up per campaign id — see {@link CampaignRunStats}. */
  const statsByCampaign = useMemo(() => {
    const map = new Map<string, CampaignRunStats>();
    for (const b of broadcasts) {
      if (!b.api_campaign_id) continue;
      const current = map.get(b.api_campaign_id) ?? {
        runs: 0,
        recipients: 0,
        delivered: 0,
        read: 0,
      };
      current.runs += 1;
      current.recipients += b.total_recipients;
      current.delivered += b.delivered_count;
      current.read += b.read_count;
      map.set(b.api_campaign_id, current);
    }
    return map;
  }, [broadcasts]);

  // The merged list screenshot 14 shows: every reusable API campaign,
  // plus every ordinary one-off broadcast. Individual campaign RUNS are
  // filtered out entirely — see {@link isApiRun} for why, and each
  // campaign's own page for where they are reported instead.
  const allRows = useMemo<CampaignRow[]>(() => {
    const campaignRows: CampaignRow[] = apiCampaigns.map((campaign) => ({
      kind: 'api_campaign',
      campaign,
      stats: statsByCampaign.get(campaign.id) ?? {
        runs: 0,
        recipients: 0,
        delivered: 0,
        read: 0,
      },
    }));
    const broadcastRows: CampaignRow[] = broadcasts
      .filter((broadcast) => !isApiRun(broadcast))
      .map((broadcast) => ({ kind: 'broadcast', broadcast }));
    // Newest first across BOTH kinds, not campaigns-then-broadcasts —
    // otherwise a campaign created a year ago would permanently outrank
    // a broadcast sent five minutes ago.
    return [...campaignRows, ...broadcastRows].sort((a, b) => {
      const at =
        a.kind === 'api_campaign'
          ? a.campaign.created_at
          : a.broadcast.created_at;
      const bt =
        b.kind === 'api_campaign'
          ? b.campaign.created_at
          : b.broadcast.created_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    });
  }, [apiCampaigns, broadcasts, statsByCampaign]);

  const rows = useMemo<CampaignRow[]>(
    () =>
      kindFilter === 'all'
        ? allRows
        : allRows.filter((r) => r.kind === kindFilter),
    [allRows, kindFilter]
  );

  /** Counts for the filter menu, so an empty option is obvious up front. */
  const kindCounts = useMemo(
    () => ({
      broadcast: allRows.filter((r) => r.kind === 'broadcast').length,
      api_campaign: allRows.filter((r) => r.kind === 'api_campaign').length,
    }),
    [allRows]
  );

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts]
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  /**
   * Call off a scheduled campaign, returning it to a draft.
   *
   * Back to 'draft' rather than deleted: the operator built an audience,
   * mapped variables and picked media, and "cancel the send" is not the
   * same request as "throw all that away". Clearing `scheduled_at` is
   * what actually stops it — the sweep only looks for rows that are both
   * 'scheduled' and due.
   *
   * The `.eq('status', 'scheduled')` guard makes this lose gracefully
   * against a sweep that has already claimed the row: if it is mid-send,
   * nothing is updated and the operator is told, rather than the UI
   * claiming a cancellation that did not happen.
   */
  async function handleCancelSchedule(broadcast: Broadcast) {
    setCancellingId(broadcast.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('broadcasts')
        .update({ status: 'draft', scheduled_at: null })
        .eq('id', broadcast.id)
        .eq('status', 'scheduled')
        .select('id');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error(
          'Too late to cancel — this broadcast has already started sending.'
        );
        await fetchBroadcasts();
        return;
      }

      toast.success('Schedule cancelled. It is saved as a draft.');
      setBroadcasts((prev) =>
        prev.map((b) =>
          b.id === broadcast.id
            ? { ...b, status: 'draft', scheduled_at: undefined }
            : b
        )
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to cancel the schedule';
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!broadcastToDelete) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .delete()
        .eq('id', broadcastToDelete.id);

      if (error) throw error;
      toast.success('Draft deleted successfully');
      setBroadcasts((prev) =>
        prev.filter((b) => b.id !== broadcastToDelete.id)
      );
      setBroadcastToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete draft';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label="Broadcast in progress"
          aria-valuemin={0}
          aria-valuemax={100}
          className="bg-primary/20 relative h-1 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary absolute inset-y-0 animate-pulse"
            style={{ width: '40%', animationDuration: '1.2s' }}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
          {/*
            Type filter. Its real job is not tidying: a campaign RUN and a
            dashboard broadcast were previously indistinguishable in this
            table, so "did this go out from the sheet or did someone send
            it by hand?" had no answer here.
          */}
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
              {kindFilter === 'all'
                ? t('filter.all')
                : kindFilter === 'broadcast'
                  ? t('filter.broadcasts')
                  : t('filter.apiCampaigns')}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border w-56">
              <DropdownMenuItem
                onClick={() => setKindFilter('all')}
                className={
                  kindFilter === 'all'
                    ? 'text-primary'
                    : 'text-popover-foreground'
                }
              >
                {t('filter.all')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setKindFilter('broadcast')}
                className={
                  kindFilter === 'broadcast'
                    ? 'text-primary'
                    : 'text-popover-foreground'
                }
              >
                <Megaphone className="h-3.5 w-3.5" />
                {t('filter.broadcasts')}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {kindCounts.broadcast}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setKindFilter('api_campaign')}
                className={
                  kindFilter === 'api_campaign'
                    ? 'text-primary'
                    : 'text-popover-foreground'
                }
              >
                <Plug className="h-3.5 w-3.5" />
                {t('filter.apiCampaigns')}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {kindCounts.api_campaign}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/*
          Two ways to reach the same "send a template message" goal, so
          they share one entry point rather than two competing buttons —
          the plan's screenshot 14 shows exactly this: a single
          "+ Campaign" control that opens onto "Broadcast Campaign" /
          "API Campaign". `GatedButton` cannot wrap a dropdown trigger
          (it renders a real <button disabled>, which base-ui's Menu
          needs to own itself for focus/keyboard handling), so the
          read-only gate is applied per-item instead — a disabled item
          still explains itself via its own title.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors"
            aria-label={t('newCampaign')}
          >
            <Plus className="h-4 w-4" />
            {t('newCampaign')}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem
              disabled={!canCreate}
              title={
                !canCreate
                  ? "Read-only — your role can't create broadcasts"
                  : undefined
              }
              onClick={() => router.push('/broadcasts/new')}
            >
              <Megaphone className="h-4 w-4" />
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground text-sm font-medium">
                  {t('broadcastCampaign')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('broadcastCampaignHint')}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canCreate}
              title={
                !canCreate
                  ? "Read-only — your role can't create campaigns"
                  : undefined
              }
              onClick={() => router.push('/broadcasts/api-campaigns/new')}
            >
              <Plug className="h-4 w-4" />
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground text-sm font-medium">
                  {t('apiCampaign')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('apiCampaignHint')}
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rows.length === 0 && allRows.length > 0 ? (
        // Nothing matched the filter, but the account does have campaigns.
        // Offering "create your first broadcast" here would be wrong — the
        // fix is to widen the filter, not to make something new.
        <div className="border-border bg-card flex h-40 flex-col items-center justify-center rounded-xl border">
          <p className="text-muted-foreground text-sm">{t('noneOfThisType')}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-border mt-3"
            onClick={() => setKindFilter('all')}
          >
            {t('filter.all')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="border-border bg-card flex h-64 flex-col items-center justify-center rounded-xl border">
          <Megaphone className="text-muted-foreground mb-3 h-10 w-10" />
          <p className="text-foreground text-sm font-medium">
            {t('noBroadcastsYet')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('createFirst')}
          </p>
          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4"
          >
            <Plus className="h-4 w-4" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">
                  {t('table.name')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden md:table-cell">
                  {t('table.template')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">
                  {t('table.type')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden text-right sm:table-cell">
                  {t('table.recipients')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">
                  {t('table.delivery')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">
                  {t('table.read')}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t('table.status')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">
                  {t('table.date')}
                </TableHead>
                <TableHead className="text-muted-foreground w-10 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                if (row.kind === 'api_campaign') {
                  const { campaign, stats } = row;
                  const status = getApiCampaignStatus(campaign.status);
                  return (
                    <TableRow
                      key={`campaign-${campaign.id}`}
                      className="border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() =>
                        router.push(`/broadcasts/api-campaigns/${campaign.id}`)
                      }
                    >
                      <TableCell className="text-foreground font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {campaign.template_name}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                          <Plug className="h-3 w-3" />
                          {t('table.typeApi')}
                        </span>
                      </TableCell>
                      {/*
                        A campaign has no fixed audience, so "recipients"
                        is the wrong question to ask of it — HOW MANY
                        TIMES IT HAS FIRED is the one its operator
                        actually has. The cell says "N runs" in words
                        rather than a bare number, because the column
                        heading above it reads Recipients and a lone
                        integer there would be read as an audience size.
                        Delivery and read are then genuine rates across
                        every recipient of every run.

                        Still an em dash at zero runs: a campaign that has
                        never been triggered has no outcome to report, and
                        "0%" would claim a failed send that never happened.
                      */}
                      <TableCell className="text-muted-foreground hidden text-right text-xs tabular-nums sm:table-cell">
                        {stats.runs > 0
                          ? t('runsCount', { count: stats.runs })
                          : '—'}
                      </TableCell>
                      {stats.runs > 0 ? (
                        <>
                          <TableCell className="hidden lg:table-cell">
                            <RateCell
                              value={stats.delivered}
                              total={stats.recipients}
                              color="bg-primary"
                            />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <RateCell
                              value={stats.read}
                              total={stats.recipients}
                              color="bg-blue-500"
                            />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="hidden lg:table-cell" />
                          <TableCell className="hidden lg:table-cell" />
                        </>
                      )}
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                        >
                          {status.label === 'active'
                            ? t('apiCampaignActive')
                            : t('apiCampaignPaused')}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="w-10" />
                    </TableRow>
                  );
                }

                const { broadcast } = row;
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      if (broadcast.status === 'draft') {
                        router.push(`/broadcasts/new?draftId=${broadcast.id}`);
                      } else {
                        router.push(`/broadcasts/${broadcast.id}`);
                      }
                    }}
                  >
                    <TableCell className="text-foreground font-medium">
                      {broadcast.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-xs font-medium">
                        <Megaphone className="h-3 w-3" />
                        {t('table.typeBroadcast')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.delivered_count}
                        total={broadcast.total_recipients}
                        color="bg-primary"
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <RateCell
                        value={broadcast.read_count}
                        total={broadcast.total_recipients}
                        color="bg-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-400" />
                          </span>
                        )}
                        {tStatus(status.label)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {/*
                        For a scheduled campaign the creation date is the
                        least interesting date on the row — what the
                        operator needs is WHEN IT WILL SEND, including the
                        time. Showing "created" here would make a booked
                        campaign indistinguishable from a draft.
                      */}
                      {broadcast.status === 'scheduled' &&
                      broadcast.scheduled_at ? (
                        <span
                          className="text-blue-400"
                          title={`Scheduled for ${new Date(broadcast.scheduled_at).toLocaleString()}`}
                        >
                          {new Date(broadcast.scheduled_at).toLocaleString(
                            undefined,
                            {
                              day: 'numeric',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      ) : (
                        new Date(broadcast.created_at).toLocaleDateString()
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {broadcast.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground h-8 w-8 cursor-pointer hover:bg-red-500/10 hover:text-red-400"
                          title="Delete draft"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBroadcastToDelete(broadcast);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {/*
                        A scheduled campaign has to be stoppable. Without
                        this the only way to call one off would be deleting
                        the row outright, losing the whole draft.
                      */}
                      {broadcast.status === 'scheduled' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground h-8 w-8 cursor-pointer hover:bg-amber-500/10"
                          title="Cancel schedule (keeps it as a draft)"
                          disabled={cancellingId === broadcast.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCancelSchedule(broadcast);
                          }}
                        >
                          {cancellingId === broadcast.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CalendarOff className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Draft Confirmation Modal */}
      <Dialog
        open={Boolean(broadcastToDelete)}
        onOpenChange={(open) => {
          if (!open) setBroadcastToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the draft broadcast &ldquo;
              {broadcastToDelete?.name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setBroadcastToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
