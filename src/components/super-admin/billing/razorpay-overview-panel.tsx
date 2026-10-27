'use client';

// ============================================================
// Overview: one screen for the whole Payments page, grouped as
// Manual UPI, AutoPay and System health.
//
// Presentational: the page fetches the Razorpay overview (one SQL call,
// billing_admin_overview()) and the manual counts, and passes them in.
// Test and live are never summed: a test-mode "12 active" next to live
// numbers would read as revenue, so each mode gets its own labelled
// block, live first.
//
// When Razorpay is not set up on this server (production today) the
// Manual UPI card still shows live counts and the other two cards show
// stored rows or an empty state, never an error.
// ============================================================

import { useState } from 'react';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { CollectedResponse, MoneyLine } from '@/lib/billing/collected';
import { formatMoneyMinor } from '@/lib/billing/money-format';
import type { ManualIntake } from '@/lib/billing/razorpay/provider';
import { cn } from '@/lib/utils';
import { runTriggerLabel, statusMeta } from './billing-labels';
import {
  MANUAL_INTAKE_NOTICE,
  type ManualCounts,
} from './manual-payments-panel';
import { PaymentsGuideButton } from './payments-guide';
import type { PaymentsTarget } from './payments-nav';
import {
  EmptyState,
  formatIst,
  ModeBadge,
  StatusPill,
  useAdminJson,
  type RazorpayMode,
  type RazorpayOverviewResponse,
} from './razorpay-shared';

type Tone = 'slate' | 'green' | 'blue' | 'amber' | 'red';

const STATUS_TILES: { status: string; label: string; tone: Tone }[] = [
  { status: 'active', label: 'Active', tone: 'green' },
  { status: 'authenticated', label: 'Authorised', tone: 'blue' },
  { status: 'pending', label: 'Payment pending', tone: 'amber' },
  { status: 'halted', label: 'Halted', tone: 'red' },
  { status: 'cancelled', label: 'Cancelled', tone: 'slate' },
  { status: 'completed', label: 'Completed', tone: 'slate' },
];

const OPEN_INTAKE_TEXT =
  'Customers pay by UPI QR and submit a UTR. Each request is approved or rejected here.';

export function RazorpayOverviewPanel({
  overview,
  manualCounts,
  manualIntake,
  onRefresh,
  onNavigate,
  onOpenLedger,
  refreshKey = 0,
}: {
  overview: {
    data: RazorpayOverviewResponse | null;
    loading: boolean;
    error: string | null;
  };
  manualCounts: ManualCounts | null;
  manualIntake: ManualIntake | null;
  /** The page reloads the overview and the manual counts. */
  onRefresh: () => void;
  onNavigate: (target: PaymentsTarget) => void;
  /** Opens Payments › All payments with a channel and/or status preset. */
  onOpenLedger?: (preset: LedgerPreset) => void;
  /** Bumped by the page's Refresh so the Collected card reloads too. */
  refreshKey?: number;
}) {
  const { data, loading, error } = overview;
  const o = data?.overview;
  const openLedger = (preset: LedgerPreset) =>
    onOpenLedger
      ? onOpenLedger(preset)
      : onNavigate({ section: 'payments', view: 'ledger' });

  const modes = new Set<RazorpayMode>();
  if (data?.mode) modes.add(data.mode);
  if (o) {
    for (const key of Object.keys(o.subscriptions ?? {})) {
      const m = key.split(':')[0];
      if (m === 'test' || m === 'live') modes.add(m);
    }
    for (const map of [
      o.trialing_with_autopay,
      o.upcoming_charges_7d,
      o.failures_7d,
      o.webhooks,
      o.last_runs,
    ]) {
      for (const m of Object.keys(map ?? {})) {
        if (m === 'test' || m === 'live') modes.add(m);
      }
    }
  }
  // Live first: it is the one that is real money.
  const ordered = (['live', 'test'] as const).filter((m) => modes.has(m));
  const healthModes = ordered.filter(
    (m) => o?.webhooks?.[m] || o?.last_runs?.[m]
  );

  const intakeText =
    (manualIntake && MANUAL_INTAKE_NOTICE[manualIntake]) || OPEN_INTAKE_TEXT;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {data ? (
          <p
            className={cn(
              'flex flex-1 items-start gap-2 rounded-lg border px-3 py-2 text-xs',
              data.configured
                ? 'border-slate-200 bg-white text-slate-700'
                : 'border-amber-200 bg-amber-50 text-slate-700'
            )}
          >
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
              aria-hidden
            />
            {data.configured && data.mode ? (
              <span>
                This server is set up for Razorpay{' '}
                <strong className="font-semibold">{data.mode} mode</strong>.
                Sync now, Cancel AutoPay and webhook Retry work only on{' '}
                {data.mode} mode rows. Rows from the other mode are shown for
                reference.
              </span>
            ) : (
              <span>
                Razorpay is not set up on this server. Manual UPI is the payment
                method in use here. AutoPay and health figures below come from
                records already stored and are for reference; Sync now, Cancel
                AutoPay, Retry and Run reconciliation are unavailable.
              </span>
            )}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <PaymentsGuideButton />
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* ---- Collected ---- */}
      <CollectedCard refreshKey={refreshKey} onOpenLedger={openLedger} />

      {/* ---- Manual UPI ---- */}
      <Card size="sm" className="bg-white shadow-xs ring-slate-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-900">
            Manual UPI
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {intakeText}
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate({ section: 'manual' })}
            >
              Open Manual UPI
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2.5">
            <Tile
              label="Pending review"
              value={manualCounts ? manualCounts.pending : '…'}
              tone={manualCounts?.pending ? 'amber' : 'slate'}
              action={
                manualCounts?.pending ? (
                  <TileLink onClick={() => onNavigate({ section: 'manual' })}>
                    Review now
                  </TileLink>
                ) : null
              }
            />
            <Tile
              label="Approved"
              value={manualCounts ? manualCounts.approved : '…'}
            />
            <Tile
              label="Rejected"
              value={manualCounts ? manualCounts.rejected : '…'}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---- AutoPay ---- */}
      <Card size="sm" className="bg-white shadow-xs ring-slate-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-900">
            AutoPay
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Razorpay AutoPay mandates by status, per mode.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onNavigate({ section: 'subscriptions', view: 'autopay' })
              }
            >
              Open AutoPay mandates
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {loading && !data ? <LoadingLine /> : null}
          {o && ordered.length === 0 ? (
            <EmptyState
              title="No AutoPay recorded yet."
              hint={
                data?.configured === false
                  ? 'Razorpay is not set up on this server.'
                  : undefined
              }
            />
          ) : null}
          {o
            ? ordered.map((mode) => {
                const count = (status: string) =>
                  o.subscriptions?.[`${mode}:${status}`] ?? 0;
                const failures = o.failures_7d?.[mode] ?? 0;
                return (
                  <section
                    key={mode}
                    aria-label={`AutoPay, ${mode === 'test' ? 'test' : 'live'} mode`}
                    className={cn(
                      'space-y-2 rounded-lg border p-3',
                      mode === 'test'
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-slate-200 bg-slate-50/40'
                    )}
                  >
                    <ModeHeading mode={mode} />
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                      <Tile
                        label="Trialing with AutoPay"
                        value={o.trialing_with_autopay?.[mode] ?? 0}
                        tone="blue"
                      />
                      {STATUS_TILES.map((t) => (
                        <Tile
                          key={t.status}
                          label={t.label}
                          value={count(t.status)}
                          tone={count(t.status) ? t.tone : 'slate'}
                        />
                      ))}
                      <Tile
                        label="Charges due in 7 days"
                        value={o.upcoming_charges_7d?.[mode] ?? 0}
                      />
                      {extraStatuses(o.subscriptions, mode).map(
                        ([status, n]) => (
                          <Tile
                            key={status}
                            label={statusMeta('subscription', status).label}
                            value={n}
                          />
                        )
                      )}
                      <Tile
                        label="Failed payments in 7 days"
                        value={failures}
                        tone={failures ? 'red' : 'slate'}
                        action={
                          failures ? (
                            <TileLink
                              onClick={() =>
                                openLedger({
                                  channel: 'razorpay',
                                  status: 'failed',
                                  mode,
                                })
                              }
                            >
                              View failed payments
                            </TileLink>
                          ) : null
                        }
                      />
                    </div>
                  </section>
                );
              })
            : null}
        </CardContent>
      </Card>

      {/* ---- System health ---- */}
      <Card size="sm" className="bg-white shadow-xs ring-slate-200">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-900">
            System health
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Webhook delivery and the last reconciliation run, per mode.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate({ section: 'activity', view: 'log' })}
            >
              Open Activity &amp; health
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {loading && !data ? <LoadingLine /> : null}
          {o && healthModes.length === 0 ? (
            <EmptyState title="No webhook events or reconciliation runs recorded yet." />
          ) : null}
          {o
            ? healthModes.map((mode) => {
                const hook = o.webhooks?.[mode];
                const run = o.last_runs?.[mode];
                const durationMs =
                  run?.finished_at && run.started_at
                    ? new Date(run.finished_at).getTime() -
                      new Date(run.started_at).getTime()
                    : null;
                return (
                  <section
                    key={mode}
                    aria-label={`System health, ${mode === 'test' ? 'test' : 'live'} mode`}
                    className={cn(
                      'space-y-2 rounded-lg border p-3',
                      mode === 'test'
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-slate-200 bg-slate-50/40'
                    )}
                  >
                    <ModeHeading mode={mode} />
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                          Webhooks
                        </h3>
                        {hook ? (
                          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <dt className="text-slate-500">Last received</dt>
                            <dd className="text-slate-800">
                              {hook.last_received_at
                                ? formatIst(hook.last_received_at, {
                                    time: true,
                                  })
                                : 'Never'}
                            </dd>
                            <dt className="text-slate-500">Failed</dt>
                            <dd
                              className={cn(
                                hook.failed
                                  ? 'font-semibold text-amber-700'
                                  : ''
                              )}
                            >
                              {hook.failed}
                            </dd>
                            <dt className="text-slate-500">Dead</dt>
                            <dd
                              className={cn(
                                hook.dead ? 'font-semibold text-red-700' : ''
                              )}
                            >
                              {hook.dead}
                            </dd>
                            <dt className="text-slate-500">
                              Anomalies in 7 days
                            </dt>
                            <dd>{hook.anomalies}</dd>
                          </dl>
                        ) : (
                          <p className="mt-1.5 text-xs text-slate-400">
                            No webhook events received in this mode.
                          </p>
                        )}
                        {hook && (hook.failed || hook.dead) ? (
                          <TileLink
                            onClick={() =>
                              onNavigate({
                                section: 'activity',
                                view: 'webhooks',
                              })
                            }
                          >
                            Review failed events
                          </TileLink>
                        ) : null}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                          Last reconciliation run
                        </h3>
                        {run ? (
                          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <dt className="text-slate-500">Status</dt>
                            <dd>
                              <StatusPill
                                domain="reconciliation"
                                status={run.status}
                              />
                            </dd>
                            <dt className="text-slate-500">Started</dt>
                            <dd className="text-slate-800">
                              {formatIst(run.started_at, { time: true })}
                            </dd>
                            <dt className="text-slate-500">Triggered by</dt>
                            <dd className="text-slate-800">
                              {runTriggerLabel({
                                scope: run.scope,
                                triggeredBy: run.triggered_by,
                                triggeredByName: null,
                              })}
                            </dd>
                            <dt className="text-slate-500">
                              Checked / changed
                            </dt>
                            <dd className="text-slate-800">
                              {run.checked} / {run.changed}
                            </dd>
                            <dt className="text-slate-500">Errors</dt>
                            <dd
                              className={cn(
                                run.error_count
                                  ? 'font-semibold text-red-700'
                                  : ''
                              )}
                            >
                              {run.error_count}
                            </dd>
                            {/* The app and DB clocks can disagree; never
                                show a negative duration. */}
                            {durationMs !== null && durationMs >= 0 ? (
                              <>
                                <dt className="text-slate-500">Took</dt>
                                <dd className="text-slate-800">
                                  {(durationMs / 1000).toFixed(1)} s
                                </dd>
                              </>
                            ) : null}
                          </dl>
                        ) : (
                          <p className="mt-1.5 text-xs text-slate-400">
                            No reconciliation has run in this mode yet.
                          </p>
                        )}
                        {run ? (
                          <TileLink
                            onClick={() =>
                              onNavigate({
                                section: 'activity',
                                view: 'reconciliation',
                              })
                            }
                          >
                            Open reconciliation
                          </TileLink>
                        ) : null}
                      </div>
                    </div>
                  </section>
                );
              })
            : null}
        </CardContent>
      </Card>
    </div>
  );
}

export interface LedgerPreset {
  channel?: 'razorpay' | 'manual_upi';
  status?: string;
  /** Razorpay mode, so a live or test tile opens only that mode's rows. */
  mode?: RazorpayMode;
}

const FIXED_TILE_STATUSES = new Set(STATUS_TILES.map((t) => t.status));

/**
 * Non-zero AutoPay statuses of `mode` that have no fixed tile (Awaiting
 * authorisation, Paused, Expired, Replaced, …), so the tiles always add
 * up to the AutoPay list.
 */
function extraStatuses(
  subscriptions: Record<string, number> | undefined,
  mode: RazorpayMode
): [string, number][] {
  return Object.entries(subscriptions ?? {})
    .filter(([key, n]) => {
      const [m, status] = key.split(':');
      return m === mode && n > 0 && !FIXED_TILE_STATUSES.has(status);
    })
    .map(([key, n]) => [key.split(':')[1], n] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** "₹45,150" or "₹9,000 + $12" when a figure spans currencies. */
function moneyText(lines: MoneyLine[]): string {
  if (lines.length === 0) return formatMoneyMinor(0);
  return lines
    .map((l) => formatMoneyMinor(l.amountMinor, l.currency))
    .join(' + ');
}

function countOf(lines: MoneyLine[]): number {
  return lines.reduce((n, l) => n + l.count, 0);
}

/**
 * Money by channel. Live and manual UPI are real money; test mode sits
 * in its own amber strip and is never added to anything.
 */
function CollectedCard({
  refreshKey,
  onOpenLedger,
}: {
  refreshKey: number;
  onOpenLedger: (preset: LedgerPreset) => void;
}) {
  const [range, setRange] = useState<'last30d' | 'allTime'>('last30d');
  const { data, loading, error, reload } = useAdminJson<CollectedResponse>(
    '/api/super-admin/billing/collected'
  );
  // The page's Refresh reloads this card too.
  const [seen, setSeen] = useState(refreshKey);
  if (seen !== refreshKey) {
    setSeen(refreshKey);
    reload();
  }
  const w = data?.[range];
  const setupTotal = w ? [...w.setupChecks.live, ...w.setupChecks.test] : [];
  const testHasData =
    w && (w.autopay.test.length > 0 || w.refunds.test.length > 0);

  return (
    <Card size="sm" className="bg-white shadow-xs ring-slate-200">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-900">
          Collected
        </CardTitle>
        <CardDescription className="text-xs text-slate-500">
          Money received by channel. Live and test mode are never combined.
        </CardDescription>
        <CardAction>
          <div
            role="group"
            aria-label="Period"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          >
            {(
              [
                ['last30d', 'Last 30 days'],
                ['allTime', 'All time'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={range === value}
                onClick={() => setRange(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  range === value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 text-xs text-red-600"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {loading && !data ? <LoadingLine /> : null}
        {w ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <MoneyTile
                label="AutoPay collected (live)"
                lines={w.autopay.live}
                hint={`${countOf(w.autopay.live)} captured charges`}
                tone="blue"
                onClick={() =>
                  onOpenLedger({
                    channel: 'razorpay',
                    status: 'paid',
                    mode: 'live',
                  })
                }
              />
              <MoneyTile
                label="Manual UPI approved"
                lines={w.manualUpi}
                hint={`${countOf(w.manualUpi)} approved payments`}
                tone="green"
                onClick={() =>
                  onOpenLedger({ channel: 'manual_upi', status: 'paid' })
                }
              />
              <MoneyTile
                label="Refunded (live)"
                lines={w.refunds.live}
                hint={`${countOf(w.refunds.live)} processed refunds`}
                tone="slate"
                onClick={() =>
                  onOpenLedger({
                    channel: 'razorpay',
                    status: 'refunded',
                    mode: 'live',
                  })
                }
              />
              <MoneyTile
                label="Net collected (live)"
                lines={w.netLive}
                hint="AutoPay plus manual UPI, less refunds"
                tone="slate"
                strong
              />
            </div>
            {testHasData ? (
              <section
                aria-label="Test mode"
                className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/30 p-3"
              >
                <ModeHeading mode="test" />
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <MoneyTile
                    label="AutoPay collected (test)"
                    lines={w.autopay.test}
                    hint={`${countOf(w.autopay.test)} captured charges`}
                    tone="amber"
                    onClick={() =>
                      onOpenLedger({
                        channel: 'razorpay',
                        status: 'paid',
                        mode: 'test',
                      })
                    }
                  />
                  <MoneyTile
                    label="Refunded (test)"
                    lines={w.refunds.test}
                    hint={`${countOf(w.refunds.test)} processed refunds`}
                    tone="amber"
                    onClick={() =>
                      onOpenLedger({
                        channel: 'razorpay',
                        status: 'refunded',
                        mode: 'test',
                      })
                    }
                  />
                </div>
              </section>
            ) : null}
            {setupTotal.length > 0 ? (
              <p className="text-[11px] text-slate-500">
                AutoPay setup checks ({moneyText(setupTotal)}, refunded
                automatically) are excluded from these figures.
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MoneyTile({
  label,
  lines,
  hint,
  tone,
  strong,
  onClick,
}: {
  label: string;
  lines: MoneyLine[];
  hint?: string;
  tone: Tone;
  strong?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }[tone];
  const body = (
    <>
      <p className="text-[11px] leading-tight font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-right text-xl tabular-nums',
          strong ? 'font-bold' : 'font-semibold',
          toneClass
        )}
      >
        {moneyText(lines)}
      </p>
      {hint ? (
        <p className="text-right text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </>
  );
  const cls =
    'rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left shadow-xs';
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title="Open in All payments"
      className={cn(
        cls,
        'transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none'
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ModeHeading({ mode }: { mode: RazorpayMode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-800">
      <ModeBadge mode={mode} />
      {mode === 'test' ? 'Test mode (no real money)' : 'Live mode'}
    </h3>
  );
}

function LoadingLine() {
  return (
    <p className="inline-flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading…
    </p>
  );
}

function Tile({
  label,
  value,
  tone = 'slate',
  action,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  action?: React.ReactNode;
}) {
  const toneClass = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-xs">
      <p className="text-[11px] leading-tight font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p className={cn('mt-0.5 text-xl font-bold', toneClass)}>{value}</p>
      {action}
    </div>
  );
}

function TileLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 block text-[11px] font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
