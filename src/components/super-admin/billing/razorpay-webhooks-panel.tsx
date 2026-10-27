'use client';

// ============================================================
// Activity & health › Webhooks and › Reconciliation (two views).
//
// The event list opens on "Failed or dead" because those are the rows
// that need a person; processed events are one filter away. Retry resets
// a failed or dead event so the worker picks it up again (the server
// refuses anything else and audits who did it). The previous error is
// kept on the row so the operator can still see why it failed.
//
// Reconciliation asks Razorpay for the current state of every live
// subscription. It is rate limited on the server (3 per 10 minutes), and
// the limit message is shown as-is.
// ============================================================

import { useState } from 'react';
import { Loader2, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AdminReconciliationRunRow,
  AdminWebhookEventRow,
} from '@/lib/billing/razorpay/admin-db';
import { cn } from '@/lib/utils';
import {
  runTriggerLabel,
  statusOptions,
  webhookEventLabel,
} from './billing-labels';
import {
  CopyId,
  FilterSelect,
  FilterToolbar,
  formatIst,
  LIST_HEIGHT,
  ListFrame,
  ListPagination,
  MODE_OPTIONS,
  ModeBadge,
  postJson,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
  useAdminList,
  useDebounced,
  usePagedFilters,
  type RazorpayMode,
  type RazorpayServerMode,
} from './razorpay-shared';

const EVENT_STATUS = [
  { value: 'retryable', label: 'Failed or dead' },
  ...statusOptions('webhook', [
    'received',
    'processing',
    'processed',
    'ignored',
    'failed',
    'dead',
  ]),
];

const RETRYABLE = new Set(['failed', 'dead']);

interface ReconcileResult {
  mode: RazorpayMode;
  ms: number;
  events: number;
  subscriptions: number;
  notifications: number;
  purged: number;
  errors: number;
}

/** Why this server cannot act on a row of `rowMode`, or null. */
function modeBlock(
  serverMode: RazorpayServerMode,
  rowMode: RazorpayMode
): string | null {
  if (serverMode === undefined) return 'Checking which mode this server uses.';
  if (serverMode === null) return 'Razorpay is not set up on this server.';
  if (serverMode !== rowMode)
    return `This is a ${rowMode} mode event and this server is set up for ${serverMode} mode.`;
  return null;
}

export function RazorpayWebhookEventsPanel({
  serverMode,
}: {
  serverMode: RazorpayServerMode;
}) {
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters({ mode: 'all', status: 'retryable' });
  const active = search !== '' || anomalyOnly || dirty;
  const resetAll = () => {
    setSearch('');
    setAnomalyOnly(false);
    reset();
  };

  const { data, loading, error } = useAdminList<AdminWebhookEventRow>(
    '/api/super-admin/billing/razorpay/webhook-events',
    {
      mode: filters.mode,
      status: filters.status,
      anomaly: anomalyOnly ? '1' : null,
      search: debounced,
      page,
      pageSize,
      _r: nonce || null,
    }
  );
  const rows = data?.items ?? [];

  const retry = async (row: AdminWebhookEventRow) => {
    const ok = await confirm({
      title: 'Retry this webhook event?',
      description: `${webhookEventLabel(row.eventType)} (${row.providerEventId}) goes back into the queue and is processed again within a minute. Its last error stays on the row.`,
      confirmText: 'Retry event',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;
    setRetrying(row.id);
    setActionError(null);
    const res = await postJson<{ outcome: string; id: string }>(
      `/api/super-admin/billing/razorpay/webhook-events/${encodeURIComponent(row.id)}/retry`
    );
    setRetrying(null);
    if (!res.ok) {
      setActionError(res.message);
      return;
    }
    toast.success('Event re-queued. It will be processed again shortly.');
    setNonce((n) => n + 1);
  };

  return (
    <section aria-label="Webhook events">
      <ListFrame
        className={LIST_HEIGHT}
        toolbar={
          <FilterToolbar
            active={active}
            onReset={resetAll}
            search={
              <SearchBox
                label="Search webhook events"
                placeholder="Workspace name, an evt_ id, or a sub_ or pay_ id"
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Mode"
                  value={filters.mode}
                  onChange={(v) => setFilter('mode', v)}
                  options={MODE_OPTIONS}
                  width="w-[120px]"
                />
                <FilterSelect
                  label="Event status"
                  value={filters.status}
                  onChange={(v) => setFilter('status', v)}
                  options={EVENT_STATUS}
                  width="w-[150px]"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={anomalyOnly}
                    onChange={(e) => {
                      setAnomalyOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Anomalies only
                </label>
              </>
            }
          />
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            loading={loading}
            noun="events"
            onPage={setPage}
            onPageSize={setPageSize}
          />
        }
      >
        {actionError ? (
          <p
            role="alert"
            className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {actionError}
          </p>
        ) : null}
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th>Received</Th>
              <Th>Event</Th>
              <Th>Workspace</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Last error</Th>
              <Th>Re-queued</Th>
              <Th className="text-right">Action</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={8}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText={
                filters.status === 'retryable'
                  ? 'No failed or dead webhook events. Choose All statuses to see the rest.'
                  : 'No webhook events match these filters.'
              }
              onReset={active ? resetAll : undefined}
            />
            {error
              ? null
              : rows.map((w) => {
                  const canRetry = RETRYABLE.has(w.status);
                  const blocked = canRetry
                    ? modeBlock(serverMode, w.mode)
                    : null;
                  return (
                    <TableRow
                      key={w.id}
                      className={cn(
                        'border-b border-slate-100 align-top',
                        w.mode === 'test' && 'bg-amber-50/20'
                      )}
                    >
                      <TableCell className="px-3 py-1.5 text-[11px] whitespace-nowrap text-slate-500">
                        {formatIst(w.receivedAt, { time: true })}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-slate-800">
                            {webhookEventLabel(w.eventType)}
                          </p>
                          {w.mode === 'test' ? <ModeBadge mode="test" /> : null}
                        </div>
                        <p className="font-mono text-[10px] text-slate-400">
                          {w.eventType}
                        </p>
                        <CopyId value={w.providerEventId} label="event id" />
                        {w.anomaly ? (
                          <p className="text-[10px] font-medium text-amber-700">
                            Anomaly: {w.anomaly}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-700">
                        {w.accountName ??
                          (w.accountId ? 'Deleted workspace' : 'Not matched')}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <StatusPill domain="webhook" status={w.status} />
                        {w.nextAttemptAt && !w.processedAt ? (
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Next try{' '}
                            {formatIst(w.nextAttemptAt, { time: true })}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-600">
                        {w.attempts}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {w.lastError ? (
                          <p className="max-w-[280px] text-[11px] break-words text-red-700">
                            {w.lastError}
                          </p>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[11px] text-slate-500">
                        {w.requeueCount > 0 ? (
                          <>
                            <span className="text-slate-700">
                              {w.requeueCount}{' '}
                              {w.requeueCount === 1 ? 'time' : 'times'}
                            </span>
                            <span className="block text-[10px]">
                              Last {formatIst(w.requeuedAt, { time: true })}
                              {w.requeuedByName
                                ? ` by ${w.requeuedByName}`
                                : ''}
                            </span>
                          </>
                        ) : (
                          'Never'
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right">
                        {canRetry ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => void retry(w)}
                              disabled={Boolean(blocked) || retrying === w.id}
                              aria-label={`Retry ${w.eventType} event ${w.providerEventId}`}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {retrying === w.id ? (
                                <Loader2
                                  className="h-3 w-3 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <RotateCcw className="h-3 w-3" aria-hidden />
                              )}
                              Retry
                            </button>
                            {blocked ? (
                              <p className="max-w-[180px] text-right text-[10px] text-slate-500">
                                {blocked}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </ListFrame>
    </section>
  );
}

export function RazorpayReconciliationPanel({
  serverMode,
}: {
  serverMode: RazorpayServerMode;
}) {
  const confirm = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const onRan = () => setReloadKey((k) => k + 1);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    dirty,
    reset,
  } = usePagedFilters({ mode: 'all' });
  const { data, loading, error } = useAdminList<AdminReconciliationRunRow>(
    '/api/super-admin/billing/razorpay/reconcile',
    { mode: filters.mode, page, pageSize, _r: reloadKey || null }
  );
  const rows = data?.items ?? [];

  const blocked =
    serverMode === undefined
      ? 'Checking which mode this server uses.'
      : serverMode === null
        ? 'Razorpay is not set up on this server.'
        : null;

  const run = async () => {
    const ok = await confirm({
      title: 'Run reconciliation now?',
      description: `This asks Razorpay for the current state of every ${serverMode ?? ''} mode AutoPay and applies any change it missed. It does not charge or cancel anything. It can run 3 times in 10 minutes.`,
      confirmText: 'Run reconciliation',
      cancelText: 'Cancel',
      variant: 'info',
    });
    if (!ok) return;
    setRunning(true);
    setRunError(null);
    const res = await postJson<ReconcileResult>(
      '/api/super-admin/billing/razorpay/reconcile'
    );
    setRunning(false);
    if (!res.ok) {
      setRunError(res.message);
      return;
    }
    const r = res.data;
    const summary = `Reconciliation (${r.mode} mode) finished in ${(r.ms / 1000).toFixed(1)} s: ${r.events} events processed, ${r.subscriptions} subscriptions checked, ${r.errors} error${r.errors === 1 ? '' : 's'}.`;
    if (r.errors > 0) toast.warning(summary);
    else toast.success(summary);
    onRan();
  };

  return (
    <section aria-label="Reconciliation runs">
      <ListFrame
        className={LIST_HEIGHT}
        toolbar={
          <div className="flex w-full flex-col gap-1.5">
            <FilterToolbar
              active={dirty}
              onReset={reset}
              filters={
                <FilterSelect
                  label="Run mode"
                  value={filters.mode}
                  onChange={(v) => setFilter('mode', v)}
                  options={MODE_OPTIONS}
                  width="w-[120px]"
                />
              }
              actions={
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={running || Boolean(blocked)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Run reconciliation now
                </button>
              }
            />
            {blocked ? (
              <p className="w-full text-[11px] text-slate-500 lg:text-right">
                Reconciliation is unavailable: {blocked}
              </p>
            ) : null}
          </div>
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            loading={loading}
            noun="runs"
            onPage={setPage}
            onPageSize={setPageSize}
          />
        }
      >
        {runError ? (
          <p
            role="alert"
            className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {runError}
          </p>
        ) : null}
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th>Started</Th>
              <Th>Mode</Th>
              <Th>Triggered by</Th>
              <Th>Status</Th>
              <Th>Checked</Th>
              <Th>Changed</Th>
              <Th>Errors</Th>
              <Th>Took</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={8}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText={
                dirty
                  ? 'No reconciliation runs match these filters.'
                  : 'No reconciliation runs yet.'
              }
              emptyHint={
                dirty
                  ? undefined
                  : 'A scheduled run happens every few minutes on a server set up for Razorpay.'
              }
              onReset={dirty ? reset : undefined}
            />
            {error
              ? null
              : rows.map((r) => {
                  const ms =
                    r.finishedAt && r.startedAt
                      ? new Date(r.finishedAt).getTime() -
                        new Date(r.startedAt).getTime()
                      : null;
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        'border-b border-slate-100 align-top',
                        r.mode === 'test' && 'bg-amber-50/20'
                      )}
                    >
                      <TableCell className="px-3 py-1.5 text-[11px] whitespace-nowrap text-slate-500">
                        {formatIst(r.startedAt, { time: true })}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <ModeBadge mode={r.mode} />
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-700">
                        {runTriggerLabel(r)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <StatusPill domain="reconciliation" status={r.status} />
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-600">
                        {r.checked}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-slate-600">
                        {r.changed}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {r.errors.length === 0 ? (
                          <span className="text-xs text-slate-600">0</span>
                        ) : (
                          <div className="max-w-[300px] text-[11px] text-red-700">
                            <p className="font-semibold">{r.errors.length}</p>
                            <p className="break-words">{r.errors[0]}</p>
                            {r.errors.length > 1 ? (
                              <p className="text-[10px] text-slate-500">
                                and {r.errors.length - 1} more
                              </p>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[11px] whitespace-nowrap text-slate-500">
                        {/* Clocks can disagree; never show a negative time. */}
                        {ms !== null && ms >= 0
                          ? `${(ms / 1000).toFixed(1)} s`
                          : r.finishedAt
                            ? '—'
                            : 'Running'}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </ListFrame>
    </section>
  );
}
