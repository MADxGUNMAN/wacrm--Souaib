'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  MessageCircle,
  Filter,
  Download,
  ChevronDown,
  Trash2,
  BellOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { getBroadcastStatus, getRecipientStatus } from '@/lib/broadcast-status';
import { RecipientDetailDialog } from '@/components/broadcasts/recipient-detail-dialog';
import { StatCard } from '@/components/broadcasts/stat-card';
import {
  FunnelChart,
  type FunnelStep,
} from '@/components/broadcasts/funnel-chart';
import { useTranslations } from 'next-intl';
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

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Broadcasts.detail');
  const tStatus = useTranslations('Broadcasts.status');
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  /** The recipient whose full delivery/failure detail is being shown. */
  const [detailRecipient, setDetailRecipient] =
    useState<BroadcastRecipient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all'
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Recipients withheld because they opted out of marketing. */
  const [skippedCount, setSkippedCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();

        const { data: bc, error: bcError } = await supabase
          .from('broadcasts')
          .select('*')
          .eq('id', broadcastId)
          .single();

        if (bcError) throw bcError;
        setBroadcast(bc);

        const { data: recs, error: recsError } = await supabase
          .from('broadcast_recipients')
          .select('*, contact:contacts(*)')
          .eq('broadcast_id', broadcastId)
          .order('created_at', { ascending: false });

        if (recsError) throw recsError;
        setRecipients(recs ?? []);

        // Suppressed-for-opt-out total, as an EXACT count rather than a
        // tally of `recs`. The select above has no range, so PostgREST
        // caps it at ~1000 rows and counting in JS would quietly
        // undercount a large campaign. `skipped` is also absent from the
        // broadcasts aggregate trigger by design (a respected opt-out is
        // not a delivery failure), so there is no column to read it from.
        const { count: skipped } = await supabase
          .from('broadcast_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'skipped');
        setSkippedCount(skipped ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('notFound'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [broadcastId]);

  const filteredRecipients = useMemo(
    () =>
      statusFilter === 'all'
        ? recipients
        : recipients.filter((r) => r.status === statusFilter),
    [recipients, statusFilter]
  );

  function handleExport() {
    if (!broadcast) return;
    const header = [
      t('table.contact'),
      t('table.phone'),
      t('table.status'),
      t('table.sent'),
      t('table.delivered'),
      t('table.read'),
      t('table.error'),
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    downloadCsv(
      `broadcast-${csvSlug(broadcast.name)}-${broadcastId.slice(0, 8)}.csv`,
      csv
    );
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    // broadcast_recipients cascades on broadcasts.id (migration 001), so a
    // single delete is sufficient — the aggregate trigger in migration 003
    // is defined on broadcast_recipients but fires only on its own row
    // changes, not on a cascaded drop of the parent row.
    const { error: delErr } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId);
    setDeleting(false);
    if (delErr) {
      toast.error(t('toastFailedDelete', { error: delErr.message }));
      return;
    }
    toast.success(t('toastDeleted'));
    router.push('/broadcasts');
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? t('notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {t('backToBroadcasts')}
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const funnelSteps: FunnelStep[] = [
    {
      label: t('stats.sent'),
      value: broadcast.sent_count,
      color: 'bg-primary',
    },
    {
      label: t('stats.delivered'),
      value: broadcast.delivered_count,
      color: 'bg-teal-500',
    },
    {
      label: t('stats.read'),
      value: broadcast.read_count,
      color: 'bg-blue-500',
    },
    {
      label: t('stats.replied'),
      value: broadcast.replied_count,
      color: 'bg-indigo-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-foreground text-2xl font-bold">
                {broadcast.name}
              </h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {tStatus(status.label)}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 text-sm">
              <span>{t('template', { name: broadcast.template_name })}</span>
              <span>-</span>
              <span>
                {t('createdAt', {
                  date: new Date(broadcast.created_at).toLocaleDateString(),
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {broadcast.status === 'draft' && (
            <Button
              onClick={() =>
                router.push(`/broadcasts/new?draftId=${broadcast.id}`)
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-medium shadow-xs"
            >
              <Send className="size-4" />
              <span>Resume & Send Draft</span>
            </Button>
          )}

          {/* Delete — inline-confirm pattern matches the pipeline-settings
              "Delete Pipeline" flow. Mid-send broadcasts can't be deleted
              because orphaning in-flight Meta messages would leave the
              funnel inconsistent. */}
          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm">
              <span className="text-red-300">{t('deletePrompt')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="border-border text-muted-foreground hover:bg-muted h-7 bg-transparent"
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t('deleting') : t('confirm')}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.status === 'sending'}
              onClick={() => setConfirmDelete(true)}
              title={
                broadcast.status === 'sending'
                  ? t('cannotDeleteSending')
                  : t('deleteHover')
              }
              className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Draft Alert Banner */}
      {broadcast.status === 'draft' && (
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 sm:flex-row">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Send className="size-5" />
            </div>
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Draft Broadcast Ready to Send
              </h3>
              <p className="text-muted-foreground mt-0.5 max-w-xl text-xs">
                This broadcast is currently saved as a draft. Click{' '}
                <strong>Resume & Send</strong> to review your audience,
                personalize template variables, and launch the broadcast.
              </p>
            </div>
          </div>
          <Button
            onClick={() =>
              router.push(`/broadcasts/new?draftId=${broadcast.id}`)
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 gap-1.5"
          >
            <Send className="size-4" />
            <span>Resume & Send</span>
          </Button>
        </div>
      )}

      {/*
        Scheduled banner. The stat cards below all read zero for a
        campaign that has not sent yet, so without this the page looks
        like a broadcast that failed silently rather than one that is
        waiting for its time.
      */}
      {broadcast.status === 'scheduled' && broadcast.scheduled_at && (
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 sm:flex-row">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Scheduled for{' '}
                {new Date(broadcast.scheduled_at).toLocaleString()}
              </h3>
              <p className="text-muted-foreground mt-0.5 max-w-xl text-xs">
                {broadcast.total_recipients.toLocaleString()} recipients are
                already locked in and personalized. This sends automatically —
                you do not need to keep this page open. Cancel it from the
                broadcasts list if you change your mind.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats — 6 cards: Total / Sent / Delivered / Read / Replied / Failed */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={t('stats.totalRecipients')}
          value={broadcast.total_recipients}
          total={broadcast.total_recipients}
          icon={<Users className="h-4 w-4" />}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label={t('stats.sent')}
          value={broadcast.sent_count}
          total={broadcast.total_recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          label={t('stats.delivered')}
          value={broadcast.delivered_count}
          total={broadcast.total_recipients}
          icon={<CheckCheck className="h-4 w-4" />}
          color="bg-teal-500/10 text-teal-400"
        />
        <StatCard
          label={t('stats.read')}
          value={broadcast.read_count}
          total={broadcast.total_recipients}
          icon={<Eye className="h-4 w-4" />}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label={t('stats.replied')}
          value={broadcast.replied_count}
          total={broadcast.total_recipients}
          icon={<MessageCircle className="h-4 w-4" />}
          color="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label={t('stats.failed')}
          value={broadcast.failed_count}
          total={broadcast.total_recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      {/* Shown only when something was actually withheld. A permanently
          zero card on every broadcast would be noise, and amber rather
          than red because respecting an opt-out is the system working.
          This also explains the gap between Total and Sent + Failed —
          otherwise the numbers look like they have lost recipients. */}
      {skippedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">
              {skippedCount.toLocaleString()}{' '}
              {skippedCount === 1 ? 'recipient' : 'recipients'} skipped
            </span>{' '}
            because they opted out of marketing messages. They are not counted
            as sent or failed. Utility and authentication templates still reach
            them.
          </p>
        </div>
      ) : null}

      <FunnelChart steps={funnelSteps} title={t('funnel')} />

      {/* Recipients Table */}
      <div className="border-border bg-card rounded-xl border">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-foreground text-sm font-medium">
            {statusFilter !== 'all'
              ? t('recipientsHeader', {
                  filtered: filteredRecipients.length,
                  total: recipients.length,
                })
              : t('recipientsHeaderAll', { total: recipients.length })}
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
                  ? t('allStatuses')
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
                  {t('allStatuses')}
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
              disabled={recipients.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {t('exportCsv')}
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-muted-foreground text-sm">
              {recipients.length === 0
                ? t('noRecipients')
                : t('noRecipientsFilter')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">
                    {t('table.contact')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.phone')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.status')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.sent')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.delivered')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.read')}
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    {t('table.error')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="text-foreground font-medium">
                        {recipient.contact?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {tStatus(rStatus.label)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.delivered_at
                          ? new Date(recipient.delivered_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.read_at
                          ? new Date(recipient.read_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      {/*
                        The Error column used to be a truncated string or a
                        bare dash — useless for a failure whose reason is
                        several fields long, and actively misleading when a
                        reason existed but was cut off. Every row now opens
                        the full picture; failed rows are highlighted
                        because those are the ones being hunted for.
                      */}
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[10rem] truncate text-red-400">
                            {recipient.status === 'failed'
                              ? (recipient.error_message ??
                                'No reason recorded')
                              : ''}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={
                              recipient.status === 'failed'
                                ? 'View why this failed'
                                : 'View delivery details'
                            }
                            aria-label={
                              recipient.status === 'failed'
                                ? `View why the message to ${recipient.contact?.name ?? 'this contact'} failed`
                                : `View delivery details for ${recipient.contact?.name ?? 'this contact'}`
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
    </div>
  );
}
