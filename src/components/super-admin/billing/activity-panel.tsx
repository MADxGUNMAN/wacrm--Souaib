'use client';

// ============================================================
// Activity & health › Activity log: the full billing audit trail.
//
// Every row answers four questions in words: what happened, HOW it
// happened (the channel: Razorpay AutoPay, Manual UPI, Admin action,
// Customer action or System), to which workspace, and who started it.
//
// The channel is classified on the server (src/lib/billing/event-
// channel.ts). This screen used to show a binary "Paid / Manual" tag that
// called every Razorpay AutoPay event "Manual", and a Source filter that
// could not separate a manual UPI payment from an admin granting a free
// month. Filters are applied server-side, so the per-channel tiles, the
// row count and the pagination always agree with the table.
//
// Amounts are formatted in the row's own currency (INR for platform
// billing). On AutoPay status rows the stored amount is the plan price,
// not money collected, so it is shown muted with "Plan price, no
// payment"; only real payments and refunds are shown as money.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  History,
  Loader2,
  Repeat,
  ShieldOff,
  Sparkles,
  UserCog,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BILLING_CHANNELS,
  EVENT_TYPES_BY_CHANNEL,
  type BillingChannel,
} from '@/lib/billing/event-channel';
import { formatMoneyMajor } from '@/lib/billing/money-format';
import { cn } from '@/lib/utils';
import type { BillingEventView } from '@/types/super-admin';
import {
  accountStatusLabel,
  amountCaption,
  billingEventLabel,
  CHANNEL_META,
  EVENT_TYPE_GROUP_LABEL,
} from './billing-labels';
import { ChannelBadge } from './channel-badge';
import { describeBillingEvent, type EventReference } from './event-description';
import { useManualRequestOpener } from './manual-request-opener';
import {
  COMPACT_CELL,
  errorMessage,
  FilterSelect,
  FilterToolbar,
  formatIst,
  IdCell,
  InfoHint,
  istTime,
  ListFrame,
  LIST_HEIGHT,
  ListPagination,
  ModeBadge,
  razorpayDashboardHref,
  razorpayPaymentHref,
  SearchBox,
  TableStateRow,
  Th,
  useDebounced,
  WorkspaceCell,
} from './razorpay-shared';

interface EventsResponse {
  events: BillingEventView[];
  counts: { total: number; byChannel: Record<BillingChannel, number> };
  page: number;
  pageSize: number;
  totalPages: number;
  truncated: boolean;
}

/**
 * "+2 days" / "+1 month", or null when the event granted no span.
 *
 * Reads the REQUESTED duration rather than differencing the two end dates,
 * because those disagree: extending a live window adds to its end date
 * while extending a lapsed one restarts from today, so the same "1 month"
 * can move the date by 30 days or by 400.
 */
function formatGranted(e: BillingEventView): string | null {
  if (e.durationDays) {
    return `+${e.durationDays} day${e.durationDays === 1 ? '' : 's'}`;
  }
  if (e.durationMonths) {
    return `+${e.durationMonths} month${e.durationMonths === 1 ? '' : 's'}`;
  }
  return null;
}

/**
 * Icon and tone per event kind. The words come from the shared label
 * table (billing-labels), so every billing screen names an event the
 * same way.
 */
const EVENT_META: Record<string, { icon: React.ElementType; tone: string }> = {
  trial_started: { icon: Sparkles, tone: 'text-blue-600 bg-blue-50' },
  trial_extended: { icon: Clock, tone: 'text-blue-600 bg-blue-50' },
  payment_submitted: { icon: CreditCard, tone: 'text-amber-600 bg-amber-50' },
  payment_approved: { icon: CheckCircle2, tone: 'text-green-600 bg-green-50' },
  payment_rejected: { icon: XCircle, tone: 'text-red-600 bg-red-50' },
  subscription_activated: {
    icon: CheckCircle2,
    tone: 'text-green-600 bg-green-50',
  },
  subscription_extended: {
    icon: CalendarClock,
    tone: 'text-green-600 bg-green-50',
  },
  subscription_revoked: { icon: ShieldOff, tone: 'text-red-600 bg-red-50' },
  subscription_expired: { icon: Ban, tone: 'text-slate-600 bg-slate-100' },
  autopay_checkout_created: {
    icon: Repeat,
    tone: 'text-slate-600 bg-slate-100',
  },
  autopay_authenticated: { icon: Repeat, tone: 'text-blue-600 bg-blue-50' },
  autopay_activated: { icon: Repeat, tone: 'text-green-600 bg-green-50' },
  payment_succeeded: { icon: CheckCircle2, tone: 'text-green-600 bg-green-50' },
  payment_failed: { icon: XCircle, tone: 'text-red-600 bg-red-50' },
  autopay_pending: { icon: Clock, tone: 'text-amber-600 bg-amber-50' },
  autopay_halted: { icon: ShieldOff, tone: 'text-red-600 bg-red-50' },
  autopay_paused: { icon: Clock, tone: 'text-slate-600 bg-slate-100' },
  autopay_resumed: { icon: Repeat, tone: 'text-green-600 bg-green-50' },
  autopay_cancelled: { icon: Ban, tone: 'text-slate-600 bg-slate-100' },
  autopay_completed: {
    icon: CheckCircle2,
    tone: 'text-slate-600 bg-slate-100',
  },
  refund_processed: { icon: CreditCard, tone: 'text-slate-600 bg-slate-100' },
  dispute_opened: { icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
  dispute_closed: { icon: CheckCircle2, tone: 'text-slate-600 bg-slate-100' },
  billing_anomaly: { icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
  billing_admin_action: { icon: UserCog, tone: 'text-violet-600 bg-violet-50' },
};

const TYPE_GROUPS = EVENT_TYPES_BY_CHANNEL.map((g) => ({
  label: EVENT_TYPE_GROUP_LABEL[g.id],
  options: g.types.map((t) => ({ value: t, label: billingEventLabel(t) })),
}));

const MODE_OPTIONS = [
  { value: 'all', label: 'All modes' },
  { value: 'live', label: 'Live only' },
  { value: 'test', label: 'Test only' },
];

const SINCE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export function ActivityPanel({
  accountId,
  onOpenSubscription,
}: {
  accountId?: string;
  /** Opens the AutoPay drawer for a billing_subscriptions id. */
  onOpenSubscription?: (id: string) => void;
}) {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [channel, setChannel] = useState('all');
  const [type, setType] = useState('all');
  const [mode, setMode] = useState('all');
  const [since, setSince] = useState('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Any filter change invalidates the current page number: staying on
  // page 4 of a now-single-page result shows an empty table.
  const filterKey = `${channel}|${type}|${mode}|${since}|${debounced}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setPage(1);
  }

  const manual = useManualRequestOpener(() => setNonce((n) => n + 1));

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          channel,
          type,
          mode,
          since,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (debounced) params.set('search', debounced);
        if (accountId) params.set('accountId', accountId);

        const res = await fetch(
          `/api/super-admin/billing/events?${params.toString()}`,
          { signal, cache: 'no-store' }
        );
        const body = await res.json().catch(() => ({}));
        if (signal.aborted) return;
        if (!res.ok) {
          setError(errorMessage(res.status, body));
          return;
        }
        setData(body as EventsResponse);
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        setError(
          err instanceof Error
            ? `Could not reach the server: ${err.message}`
            : 'Could not reach the server.'
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    // `nonce` re-runs the fetch after a manual review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, type, mode, since, debounced, page, pageSize, accountId, nonce]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const events = data?.events ?? [];
  const byChannel = data?.counts.byChannel;
  const allCount = byChannel
    ? BILLING_CHANNELS.reduce((sum, c) => sum + byChannel[c], 0)
    : null;

  const channelOptions = [
    {
      value: 'all',
      label: 'All channels',
      count: allCount,
    },
    ...BILLING_CHANNELS.map((c) => ({
      value: c,
      label: CHANNEL_META[c].label,
      count: byChannel ? byChannel[c] : null,
    })),
  ];

  const active =
    search !== '' ||
    channel !== 'all' ||
    type !== 'all' ||
    mode !== 'all' ||
    since !== 'all';
  const resetAll = () => {
    setSearch('');
    setChannel('all');
    setType('all');
    setMode('all');
    setSince('all');
  };

  const cols = accountId ? 6 : 7;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      {data?.truncated ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Showing the newest 10,000 events. Narrow the filters to see older
          ones.
        </p>
      ) : null}

      <ListFrame
        className={accountId ? undefined : LIST_HEIGHT}
        toolbar={
          <FilterToolbar
            active={active}
            onReset={resetAll}
            search={
              <SearchBox
                label="Search activity"
                placeholder="Workspace, email, admin, reference or note"
                value={search}
                onChange={setSearch}
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Channel"
                  value={channel}
                  onChange={setChannel}
                  options={channelOptions}
                  width="w-[195px]"
                />
                <FilterSelect
                  label="Event type"
                  value={type}
                  onChange={setType}
                  options={[{ value: 'all', label: 'All event types' }]}
                  groups={TYPE_GROUPS}
                  width="w-[190px]"
                />
                <FilterSelect
                  label="Razorpay mode"
                  value={mode}
                  onChange={setMode}
                  options={MODE_OPTIONS}
                  width="w-[125px]"
                />
                <FilterSelect
                  label="Date"
                  value={since}
                  onChange={setSince}
                  options={SINCE_OPTIONS}
                  width="w-[130px]"
                />
              </>
            }
          />
        }
        footer={
          <ListPagination
            page={data?.page ?? page}
            pageSize={pageSize}
            total={data?.counts.total ?? 0}
            totalPages={data?.totalPages ?? 1}
            loading={loading}
            noun="events"
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        }
      >
        {/* Fixed layout, two short lines per cell: no horizontal scroll.
            The description, note, references and every stored field live
            in the (i) popover and the Details row. */}
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th className="w-[11%] px-2.5">When</Th>
              <Th className={cn('px-2.5', accountId ? 'w-[30%]' : 'w-[24%]')}>
                Event
              </Th>
              {!accountId ? (
                <Th className="w-[17%] px-2.5">Workspace</Th>
              ) : null}
              <Th className="w-[17%] px-2.5">Channel</Th>
              <Th className="w-[17%] px-2.5">Change</Th>
              <Th className="w-[11%] px-2.5 text-right">Amount</Th>
              <Th className="w-10 px-1">
                <span className="sr-only">Details</span>
              </Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={cols}
              loading={loading}
              error={error}
              empty={events.length === 0}
              emptyText={
                active
                  ? 'No events match these filters.'
                  : 'Nothing recorded yet.'
              }
              emptyHint={
                active
                  ? undefined
                  : 'Razorpay AutoPay events, manual UPI payments and admin changes all appear here.'
              }
              onReset={active ? resetAll : undefined}
            />
            {error
              ? null
              : events.map((e) => (
                  <EventRow
                    key={e.id}
                    e={e}
                    cols={cols}
                    showWorkspace={!accountId}
                    open={expanded.has(e.id)}
                    onToggle={() => toggle(e.id)}
                    onOpenSubscription={onOpenSubscription}
                    onOpenRequest={manual.open}
                    requestLoading={manual.loadingId === e.paymentRequestId}
                  />
                ))}
          </TableBody>
        </Table>
      </ListFrame>
      {manual.drawer}
    </div>
  );
}

const CELL = COMPACT_CELL;

/** "+14 days" / "+1 month" plus the window, or the end-date move. */
function changeLines(e: BillingEventView): {
  primary: React.ReactNode;
  secondary: React.ReactNode;
} | null {
  const granted = formatGranted(e);
  const statusChanged =
    !!e.fromStatus && !!e.toStatus && e.fromStatus !== e.toStatus;
  const dates = e.endsAt ? (
    <span className="inline-flex min-w-0 items-center gap-1">
      {e.previousEndsAt ? (
        <>
          <span className="text-slate-400">{formatIst(e.previousEndsAt)}</span>
          <ArrowRight
            className="h-3 w-3 shrink-0 text-slate-400"
            aria-label="to"
          />
        </>
      ) : (
        <span className="text-slate-400">Ends</span>
      )}
      <span className="font-medium text-slate-700">{formatIst(e.endsAt)}</span>
    </span>
  ) : null;
  const status = statusChanged ? (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span>{accountStatusLabel(e.fromStatus)}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-label="to" />
      <span className="font-medium text-slate-700">
        {accountStatusLabel(e.toStatus)}
      </span>
    </span>
  ) : null;

  if (granted) {
    return {
      primary: (
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'rounded px-1.5 py-px text-[11px] font-semibold',
              e.windowKind === 'trial'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-emerald-50 text-emerald-700'
            )}
          >
            {granted}
          </span>
          {e.windowKind ? (
            <span className="text-[11px] text-slate-500">
              {e.windowKind === 'trial' ? 'Trial' : 'Paid'}
            </span>
          ) : null}
        </span>
      ),
      secondary: dates ?? status,
    };
  }
  if (dates) return { primary: dates, secondary: status };
  if (status) return { primary: status, secondary: null };
  return null;
}

function EventRow({
  e,
  cols,
  showWorkspace,
  open,
  onToggle,
  onOpenSubscription,
  onOpenRequest,
  requestLoading,
}: {
  e: BillingEventView;
  cols: number;
  showWorkspace: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenSubscription?: (id: string) => void;
  onOpenRequest: (id: string) => void;
  requestLoading: boolean;
}) {
  const meta = EVENT_META[e.eventType] ?? {
    icon: History,
    tone: 'text-slate-600 bg-slate-100',
  };
  const Icon = meta.icon;
  const description = describeBillingEvent(e);
  const plan = [e.planName, e.cycleLabel].filter(Boolean).join(' · ');
  const isMoney = e.amountKind === 'paid' || e.amountKind === 'refund';
  const caption = amountCaption(e.amountKind, e.channel, e.moneyInvolved);
  const change = changeLines(e);
  const title = billingEventLabel(e.eventType);
  const detailsId = `event-details-${e.id}`;

  return (
    <>
      <TableRow
        className={cn(
          'border-b border-slate-100 align-top',
          e.mode === 'test' && 'bg-amber-50/20',
          open && 'border-b-0 bg-slate-50/70'
        )}
      >
        {/* When */}
        <TableCell className={CELL}>
          <p
            className="truncate text-xs font-medium text-slate-800 tabular-nums"
            title={formatDistanceToNow(new Date(e.createdAt), {
              addSuffix: true,
            })}
          >
            {formatIst(e.createdAt)}
          </p>
          <p className="truncate text-[11px] text-slate-500 tabular-nums">
            {istTime(e.createdAt)}
          </p>
        </TableCell>

        {/* Event: icon, name, (i) for the sentence and note */}
        <TableCell className={CELL}>
          <div className="flex min-w-0 items-start gap-2">
            <span
              className={cn(
                'mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                meta.tone
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <p
                  className="truncate text-xs font-semibold text-slate-900"
                  title={title}
                >
                  {title}
                </p>
                <InfoHint title={title} label={`About this event: ${title}`}>
                  <p>{description.text}</p>
                  {description.note ? (
                    <p>
                      <span className="font-medium text-slate-700">Note:</span>{' '}
                      {description.note}
                    </p>
                  ) : null}
                </InfoHint>
              </div>
              <p
                className="truncate text-[11px] text-slate-500"
                title={plan || description.text}
              >
                {plan || description.text}
              </p>
            </div>
          </div>
        </TableCell>

        {/* Workspace */}
        {showWorkspace ? (
          <TableCell className={CELL}>
            <WorkspaceCell name={e.accountName} email={e.ownerEmail} />
          </TableCell>
        ) : null}

        {/* Channel and who started it */}
        <TableCell className={CELL}>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <ChannelBadge
              channel={e.channel}
              size="sm"
              label={CHANNEL_SHORT[e.channel]}
            />
            {e.mode ? <ModeBadge mode={e.mode} /> : null}
          </div>
          <p
            className="mt-0.5 truncate text-[11px] text-slate-500"
            title={
              e.initiatedBy.detail &&
              e.initiatedBy.detail !== e.initiatedBy.label
                ? `${e.initiatedBy.label} (${e.initiatedBy.detail})`
                : e.initiatedBy.label
            }
          >
            <span className="text-slate-400">by </span>
            {e.initiatedBy.label}
          </p>
        </TableCell>

        {/* Access / status change */}
        <TableCell className={CELL}>
          {change ? (
            <>
              <div className="truncate text-xs text-slate-600">
                {change.primary}
              </div>
              {change.secondary ? (
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                  {change.secondary}
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </TableCell>

        {/* Amount */}
        <TableCell className={cn(CELL, 'text-right')}>
          {e.amount != null ? (
            <>
              <p
                className={cn(
                  'text-xs tabular-nums',
                  isMoney ? 'font-semibold text-slate-900' : 'text-slate-400'
                )}
              >
                {formatMoneyMajor(e.amount, e.currency)}
              </p>
              {caption ? (
                <p
                  className={cn(
                    'truncate text-[10px]',
                    isMoney ? 'text-emerald-700' : 'text-slate-400'
                  )}
                  title={caption}
                >
                  {caption}
                </p>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </TableCell>

        <TableCell className={cn(CELL, 'px-1 text-right')}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? 'Hide' : 'Show'} details for ${title}`}
            title={open ? 'Hide details' : 'Show details'}
            onClick={onToggle}
          >
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          </Button>
        </TableCell>
      </TableRow>

      {open ? (
        <TableRow
          id={detailsId}
          className={cn(
            'border-b border-slate-100 hover:bg-transparent',
            e.mode === 'test' ? 'bg-amber-50/20' : 'bg-slate-50/70'
          )}
        >
          <TableCell
            colSpan={cols}
            className="px-3 pt-0 pb-3 whitespace-normal"
          >
            <EventDetails
              e={e}
              description={description}
              plan={plan}
              caption={caption}
              onOpenSubscription={onOpenSubscription}
              onOpenRequest={onOpenRequest}
              requestLoading={requestLoading}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** Short channel words for the table; full names stay in the tooltip. */
const CHANNEL_SHORT: Readonly<Record<BillingChannel, string>> = {
  razorpay: 'AutoPay',
  manual_upi: 'Manual UPI',
  admin: 'Admin',
  customer: 'Customer',
  system: 'System',
};

const REFERENCE_LABEL: Readonly<Record<EventReference['kind'], string>> = {
  subscription: 'AutoPay ID',
  payment: 'Payment ID',
  utr: 'UTR',
  refund: 'Refund ID',
  dispute: 'Dispute ID',
};

/** Everything stored on the event, in one compact grid. */
function EventDetails({
  e,
  description,
  plan,
  caption,
  onOpenSubscription,
  onOpenRequest,
  requestLoading,
}: {
  e: BillingEventView;
  description: ReturnType<typeof describeBillingEvent>;
  plan: string;
  caption: string | null;
  onOpenSubscription?: (id: string) => void;
  onOpenRequest: (id: string) => void;
  requestLoading: boolean;
}) {
  const granted = formatGranted(e);
  const ref = description.reference;
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'What happened', value: description.text },
    ...(description.note ? [{ label: 'Note', value: description.note }] : []),
    {
      label: 'Recorded',
      value: `${formatIst(e.createdAt, { time: true })} (${formatDistanceToNow(
        new Date(e.createdAt),
        { addSuffix: true }
      )})`,
    },
    {
      label: 'Initiated by',
      value:
        e.initiatedBy.detail && e.initiatedBy.detail !== e.initiatedBy.label
          ? `${e.initiatedBy.label} · ${e.initiatedBy.detail}`
          : e.initiatedBy.label,
    },
    { label: 'Channel', value: CHANNEL_META[e.channel].label },
    ...(e.mode
      ? [
          {
            label: 'Razorpay mode',
            value: e.mode === 'test' ? 'Test (no real money)' : 'Live',
          },
        ]
      : []),
    ...(plan ? [{ label: 'Plan', value: plan }] : []),
    ...(e.amount != null
      ? [
          {
            label: 'Amount',
            value: `${formatMoneyMajor(e.amount, e.currency)}${caption ? ` · ${caption}` : ''}`,
          },
        ]
      : []),
    ...(granted
      ? [
          {
            label: 'Time given',
            value: `${granted}${e.windowKind ? ` of ${e.windowKind === 'trial' ? 'trial' : 'paid access'}` : ''}`,
          },
        ]
      : []),
    ...(e.endsAt
      ? [
          {
            label: 'Access ends',
            value: e.previousEndsAt
              ? `${formatIst(e.previousEndsAt)} → ${formatIst(e.endsAt)}`
              : formatIst(e.endsAt),
          },
        ]
      : []),
    ...(e.fromStatus || e.toStatus
      ? [
          {
            label: 'Workspace status',
            value:
              e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
                ? `${accountStatusLabel(e.fromStatus)} → ${accountStatusLabel(e.toStatus)}`
                : accountStatusLabel(e.toStatus ?? e.fromStatus),
          },
        ]
      : []),
  ];

  const ids: {
    label: string;
    value: string;
    what: string;
    href?: string | null;
  }[] = [];
  const pushId = (
    label: string,
    value: string | null | undefined,
    what: string,
    href?: string | null
  ) => {
    if (value && !ids.some((i) => i.value === value))
      ids.push({ label, value, what, href });
  };
  if (ref) {
    pushId(
      REFERENCE_LABEL[ref.kind],
      ref.id,
      REFERENCE_LABEL[ref.kind].toLowerCase(),
      ref.kind === 'payment'
        ? razorpayPaymentHref(ref.id)
        : ref.kind === 'subscription'
          ? razorpayDashboardHref('subscription', ref.id)
          : null
    );
  }
  pushId(
    'AutoPay ID',
    e.providerSubscriptionId,
    'autopay id',
    e.providerSubscriptionId
      ? razorpayDashboardHref('subscription', e.providerSubscriptionId)
      : null
  );
  pushId(
    'Payment ID',
    e.providerPaymentId,
    'payment id',
    razorpayPaymentHref(e.providerPaymentId)
  );
  pushId('UTR', e.utr, 'UTR');
  pushId('Event ID', e.id, 'event id');

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              {f.label}
            </dt>
            <dd className="mt-0.5 break-words text-slate-700">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-slate-100 pt-3">
        {ids.map((i) => (
          <div key={i.label + i.value} className="w-[190px] min-w-0">
            <IdCell
              label={i.label}
              value={i.value}
              what={i.what}
              href={i.href}
              hrefTitle="Open in Razorpay"
            />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {e.billingSubscriptionId && onOpenSubscription ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onOpenSubscription(e.billingSubscriptionId!)}
            >
              <Repeat aria-hidden />
              Open AutoPay
            </Button>
          ) : null}
          {e.paymentRequestId ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={requestLoading}
              onClick={() => onOpenRequest(e.paymentRequestId!)}
            >
              {requestLoading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ExternalLink aria-hidden />
              )}
              Open request
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
