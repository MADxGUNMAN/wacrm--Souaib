'use client';

// ============================================================
// Subscriptions › Workspaces: manual subscription control.
//
// Displays `liveStatus`, NOT the stored `subscription_status`. Nothing
// flips that column when a date passes (there is no cron), so a row can
// read "trialing" days after its trial ended. The API derives the live
// verdict; showing the stored value would mislead the operator into
// thinking a lapsed account still has access.
//
// Actions map 1:1 onto the API's PATCH verbs so the intent stays
// explicit: granting time is not the same operation as correcting an end
// date, and revoking is not the same as letting a window lapse.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Clock,
  Globe,
  History,
  Loader2,
  Plus,
  RotateCcw,
  ShieldOff,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Input } from '@/components/ui/input';
import { PhoneDisplay } from '@/components/ui/phone-display';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatMoneyMajor } from '@/lib/billing/money-format';
import type {
  BillingEventView,
  SubscriberAccessVia,
  SubscriberAutopay,
  SubscriberCounts,
  SubscriberPricingRegion,
  SubscriberRow,
} from '@/types/super-admin';
import { AutopayManualActionWarning } from './autopay-warning';
import {
  accountStatusLabel,
  amountCaption,
  billingEventLabel,
  statusMeta,
} from './billing-labels';
import { ChannelBadge } from './channel-badge';
import { describeBillingEvent } from './event-description';
import {
  FilterSelect,
  FilterToolbar,
  formatIst,
  ListFrame,
  ListPagination,
  methodText,
  ModeBadge,
  errorMessage,
  SearchBox,
  StatusPill,
  TableStateRow,
  Th,
} from './razorpay-shared';

/** IST, like every other billing screen. */
function formatDate(value: string | null): string {
  return formatIst(value);
}

type ActionKind =
  | 'grant'
  | 'extend_trial'
  | 'expire_now'
  | 'expire_trial'
  | 'expire_paid'
  | 'expire_both'
  | 'set_end_date'
  | 'set_trial_end_date'
  | 'revoke'
  | 'set_status';

// ------------------------------------------------------------
// Intents, not verbs.
//
// The API has six actions and they are all genuinely distinct, so they
// stay exactly as they are. The problem was only ever the UI: a flat
// dropdown of six verbs made the operator supply the taxonomy from
// memory. Two pairs read as duplicates until you already know the
// system:
//
//   "Grant / extend paid access" vs "Extend trial"
//        → same operation (add time), different resulting status
//   "End now (simulate expiry)"  vs "Revoke access now"
//        → both remove access, but one lets the DATE lapse and the other
//          sets a BLOCKED FLAG, and picking the wrong one gives the
//          customer the wrong experience
//
// A dropdown is the worst possible control for that second pair, because
// you cannot see both descriptions at once to compare them. So the three
// things an operator actually wants become three visible choices, and the
// confusable pair is shown side by side inside one of them.
// ------------------------------------------------------------

type Intent = 'give' | 'end' | 'date' | 'advanced';

const INTENTS: { value: Intent; label: string; hint: string }[] = [
  { value: 'give', label: 'Give access', hint: 'Add paid time or trial days' },
  { value: 'end', label: 'End access', hint: 'Expire or block this workspace' },
  { value: 'date', label: 'Change end date', hint: 'Correct the expiry date' },
];

const STATE_FILTER_LABELS: Record<string, string> = {
  all: 'All states',
  trialing: 'Trialing',
  active: 'Active',
  expired: 'Expired',
  blocked: 'Blocked',
  none: 'Ungated',
};

const STATE_FILTER_OPTIONS = Object.entries(STATE_FILTER_LABELS).map(
  ([value, label]) => ({ value, label })
);

const STATUS_LABELS: Record<SubscriberRow['liveStatus'], string> = {
  none: 'Ungated, never gated (internal or demo)',
  trialing: 'Trialing',
  active: 'Active',
  expired: 'Expired',
};

const COLS = 8;

export function SubscribersPanel({
  onOpenAutopay,
}: {
  /** Opens a Razorpay subscription in Subscriptions › AutoPay mandates. */
  onOpenAutopay?: (billingSubscriptionId: string) => void;
} = {}) {
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [counts, setCounts] = useState<SubscriberCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [target, setTarget] = useState<SubscriberRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [stateFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ state: stateFilter });
      if (debounced) params.set('search', debounced);

      const res = await fetch(
        `/api/super-admin/billing/subscriptions?${params.toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(res.status, data));
        return;
      }

      setRows(data.subscribers ?? []);
      setCounts(data.counts ?? null);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not reach the server: ${err.message}`
          : 'Could not reach the server.'
      );
    } finally {
      setLoading(false);
    }
  }, [stateFilter, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return (
    <div className="space-y-3">
      <ListFrame
        className="h-[calc(100vh-13rem)] min-h-[420px]"
        toolbar={
          <FilterToolbar
            active={search !== '' || stateFilter !== 'all'}
            onReset={() => {
              setSearch('');
              setStateFilter('all');
            }}
            search={
              <SearchBox
                label="Search workspaces"
                placeholder="Workspace, owner name or email"
                value={search}
                onChange={setSearch}
              />
            }
            middle={counts ? <WorkspaceCountsSummary counts={counts} /> : null}
            filters={
              <FilterSelect
                label="State"
                value={stateFilter}
                onChange={setStateFilter}
                options={STATE_FILTER_OPTIONS}
                width="w-[150px]"
              />
            }
          />
        }
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            loading={loading}
            noun="workspaces"
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        }
      >
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-20 bg-slate-50 shadow-xs">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <Th>Workspace</Th>
              <Th>Owner</Th>
              <Th>Status</Th>
              <Th>Access via</Th>
              <Th>Term</Th>
              <Th>AutoPay</Th>
              <Th>Ends</Th>
              <Th className="text-right">Manage</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableStateRow
              colSpan={COLS}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText={
                search !== '' || stateFilter !== 'all'
                  ? 'No workspaces match these filters.'
                  : 'No workspaces yet.'
              }
              onReset={
                search !== '' || stateFilter !== 'all'
                  ? () => {
                      setSearch('');
                      setStateFilter('all');
                    }
                  : undefined
              }
            />
            {error
              ? null
              : paginatedRows.map((row) => (
                  <TableRow
                    key={row.accountId}
                    className="border-b border-slate-100 transition-colors hover:bg-slate-50/80"
                  >
                    <TableCell className="px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="max-w-[180px] truncate text-xs font-semibold text-slate-800">
                          {row.accountName}
                        </p>
                        {row.isBanned ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-red-700"
                            title="Banned by a super admin. This outranks billing."
                          >
                            <Ban className="h-2.5 w-2.5" aria-hidden />
                            Banned
                          </span>
                        ) : null}
                        {row.isBlocked ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-amber-700"
                            title="Access blocked by a super admin"
                          >
                            <ShieldOff className="h-2.5 w-2.5" aria-hidden />
                            Blocked
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <div className="max-w-[190px]">
                        <PhoneDisplay
                          phone={row.ownerPhone}
                          copyable
                          className="text-xs font-medium"
                          emptyPlaceholder="No phone on file"
                        />
                      </div>
                      <p
                        className="max-w-[240px] truncate text-[11px] text-slate-400"
                        title={row.ownerEmail ?? undefined}
                      >
                        {row.ownerEmail ?? ''}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <StatusPill domain="workspace" status={row.liveStatus} />
                      {row.inGracePeriod ? (
                        <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                          In grace period
                        </p>
                      ) : null}
                      {/* Surface drift so the operator can see the stored
                          column is stale rather than being confused by it. */}
                      {row.storedStatus !== row.liveStatus ? (
                        <p
                          className="mt-0.5 text-[10px] text-slate-400"
                          title="The stored status has not caught up with the dates. The live status is shown."
                        >
                          Stored as {accountStatusLabel(row.storedStatus)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <AccessViaCell accessVia={row.accessVia} />
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <p className="text-xs font-medium text-slate-700">
                        {row.cycleLabel ?? '—'}
                      </p>
                      <PricingBadge pricing={row.pricingRegion} />
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <AutopayCell autopay={row.autopay} />
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <p className="text-xs font-medium whitespace-nowrap text-slate-700">
                        {formatDate(row.endsAt)}
                      </p>
                      {row.daysLeft !== null ? (
                        <p className="text-[10px] text-slate-400">
                          {row.daysLeft} day{row.daysLeft === 1 ? '' : 's'} left
                        </p>
                      ) : null}
                      {row.pendingWindow ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {row.pendingWindow.type === 'active'
                            ? `Paid plan queued from ${formatDate(row.pendingWindow.startsAt)}`
                            : `${row.pendingWindow.durationDays}-day trial queued`}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setTarget(row)}
                        aria-label={`Manage ${row.accountName}`}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Manage
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </ListFrame>

      {target ? (
        <ManageSubscriptionDialog
          row={target}
          onClose={() => setTarget(null)}
          onOpenAutopay={
            onOpenAutopay
              ? (id) => {
                  setTarget(null);
                  onOpenAutopay(id);
                }
              : undefined
          }
          onDone={async () => {
            setTarget(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceCountsSummary({ counts }: { counts: SubscriberCounts }) {
  return (
    <div className="flex items-center divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-2xs select-none">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <span className="font-medium text-slate-500">Total</span>
        <span className="font-semibold text-slate-900 tabular-nums">
          {counts.total}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <span className="font-medium text-slate-500">Trialing</span>
        <span className="font-semibold text-blue-600 tabular-nums">
          {counts.trialing}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <span className="font-medium text-slate-500">Active</span>
        <span className="font-semibold text-emerald-600 tabular-nums">
          {counts.active}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <span className="font-medium text-slate-500">Expired</span>
        <span className="font-semibold text-red-600 tabular-nums">
          {counts.expired}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <span className="font-medium text-slate-500">Blocked</span>
        <span className="font-semibold text-amber-600 tabular-nums">
          {counts.blocked}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------

/**
 * The last few billing events for one workspace, collapsed by default.
 *
 * Deliberately a summary rather than the full Activity table: the point is
 * to catch "this was already done" before applying another change, and a
 * long scrolling log inside a modal would bury that. Fetches only when
 * opened, so the dialog stays instant for the common case where the
 * operator already knows what they are doing.
 */
function RecentHistory({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<BillingEventView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || events !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/super-admin/billing/events?accountId=${encodeURIComponent(accountId)}&pageSize=5`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(errorMessage(res.status, data));
        setEvents(res.ok ? (data.events ?? []) : []);
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the server.');
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, events, accountId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <History className="h-3.5 w-3.5" />
          Recent billing history
        </span>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-3 py-2">
          {loading ? (
            <p className="inline-flex items-center gap-1.5 py-1 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </p>
          ) : loadError ? (
            <p role="alert" className="py-1 text-xs text-red-600">
              {loadError}
            </p>
          ) : !events || events.length === 0 ? (
            <p className="py-1 text-xs text-slate-400">
              Nothing recorded for this workspace yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200/70">
              {events.map((e) => {
                const d = describeBillingEvent(e);
                const isMoney =
                  e.amountKind === 'paid' || e.amountKind === 'refund';
                return (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-3 py-1.5 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ChannelBadge channel={e.channel} size="sm" />
                        <span className="font-medium text-slate-800">
                          {billingEventLabel(e.eventType)}
                        </span>
                        {e.mode === 'test' ? <ModeBadge mode="test" /> : null}
                      </div>
                      <p className="text-slate-600">{d.text}</p>
                      {d.note ? (
                        <p className="text-[11px] text-slate-500">
                          <span className="font-medium">Note:</span> {d.note}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-slate-400">
                        {formatIst(e.createdAt, { time: true })}
                        {' · '}
                        {e.initiatedBy.label}
                      </p>
                    </div>
                    {isMoney && e.amount != null ? (
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-slate-900 tabular-nums">
                          {formatMoneyMajor(e.amount, e.currency)}
                        </p>
                        <p className="text-[10px] text-emerald-700">
                          {amountCaption(
                            e.amountKind,
                            e.channel,
                            e.moneyInvolved
                          )}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------

/**
 * The workspace's Razorpay AutoPay in one cell: status in words, the
 * method, and the next charge. "Unknown" when the lookup failed, so a
 * failed query never reads as "no AutoPay".
 */
function AutopayCell({
  autopay,
}: {
  autopay: SubscriberAutopay | null | undefined;
}) {
  if (autopay === undefined) {
    return (
      <span
        className="text-[11px] text-slate-400"
        title="The AutoPay lookup failed. Reload to try again."
      >
        Unknown
      </span>
    );
  }
  if (autopay === null) {
    return <span className="text-[11px] text-slate-400">None</span>;
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <StatusPill domain="subscription" status={autopay.status} />
        {autopay.mode === 'test' ? <ModeBadge mode="test" /> : null}
      </div>
      <p className="text-[10px] text-slate-500">
        {methodText(autopay.paymentMethod, autopay.methodSummary)}
        {autopay.charging
          ? autopay.chargeAt
            ? ` · next charge ${formatIst(autopay.chargeAt)}`
            : ''
          : ' · not charging'}
      </p>
    </div>
  );
}

/**
 * Which pricing the workspace sees (localized pricing): "Global" or the
 * country code and currency. The reason is in the tooltip. Nothing when
 * the lookup failed, rather than a guessed "Global".
 */
function PricingBadge({
  pricing,
}: {
  pricing: SubscriberPricingRegion | undefined;
}) {
  if (!pricing) return null;
  const isGlobal = pricing.region === 'global';
  const label = isGlobal
    ? `Global · ${pricing.currency}`
    : `${pricing.region} · ${pricing.currency}`;
  const detected =
    pricing.countryCode && pricing.countryCode !== pricing.region
      ? ` Phone country: ${pricing.countryCode}.`
      : '';
  // After a Global currency change a pinned mandate still charges the
  // currency it was bought in; say so rather than imply the new one.
  const mandateCurrency =
    pricing.mandateCurrency && pricing.mandateCurrency !== pricing.currency
      ? pricing.mandateCurrency
      : null;
  return (
    <span
      className={cn(
        'mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium',
        isGlobal
          ? 'border-slate-200 bg-slate-50 text-slate-500'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      )}
      title={`Pricing: ${pricing.reasonText}${detected}${
        mandateCurrency
          ? ` AutoPay keeps charging ${mandateCurrency} at the price it was bought with.`
          : ''
      }`}
    >
      <Globe className="h-2.5 w-2.5" aria-hidden />
      <span className="sr-only">Pricing: </span>
      {label}
      {mandateCurrency ? ` · AutoPay ${mandateCurrency}` : null}
    </span>
  );
}

/**
 * How the workspace has (or last had) access: Razorpay AutoPay, Manual
 * UPI payment, Admin grant or Trial, derived on the server from the
 * newest grant event. "Not recorded" when nothing explains it.
 */
function AccessViaCell({
  accessVia,
}: {
  accessVia: SubscriberAccessVia | undefined;
}) {
  if (!accessVia) {
    return (
      <span
        className="text-[11px] text-slate-400"
        title="The access lookup failed or nothing is recorded. Reload to try again."
      >
        Not recorded
      </span>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {!accessVia.current ? (
          <span className="text-[10px] text-slate-500">Last access:</span>
        ) : null}
        <StatusPill domain="access" status={accessVia.kind} />
      </div>
      {accessVia.since || accessVia.detail ? (
        <p className="text-[10px] text-slate-400">
          {[
            accessVia.since ? `Granted ${formatIst(accessVia.since)}` : null,
            accessVia.detail,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

function ManageSubscriptionDialog({
  row,
  onClose,
  onDone,
  onOpenAutopay,
}: {
  row: SubscriberRow;
  onClose: () => void;
  onDone: () => void | Promise<void>;
  onOpenAutopay?: (billingSubscriptionId: string) => void;
}) {
  const [intent, setIntent] = useState<Intent>('give');
  /** Within "Give access": paid time, or trial days. */
  const [giveMode, setGiveMode] = useState<'paid' | 'trial'>('paid');
  /** Within "End access": let the date lapse, or set the blocked flag. */
  const [endMode, setEndMode] = useState<'expire' | 'block'>('expire');
  /**
   * Within "Let it expire now", WHICH window to end. Only surfaced when
   * the account actually has both a trial and a paid window open at
   * once (window stacking) — the case in the screenshot that prompted
   * this: a trialing account with a yearly plan already queued behind
   * it. Auto-detection (`expire_now`) cannot ask which one you meant,
   * so it always picked the paid window, with no way to end the trial
   * on its own.
   */
  const [expireTarget, setExpireTarget] = useState<'trial' | 'paid' | 'both'>(
    // Default to whichever window is currently LIVE, so the pre-selected
    // choice matches what the operator is looking at in the row.
    row.liveStatus === 'active' ? 'paid' : 'trial'
  );

  const [months, setMonths] = useState('1');
  const [days, setDays] = useState('');
  const [trialDays, setTrialDays] = useState('7');
  const [planName, setPlanName] = useState(row.planName ?? '');
  const [endsAt, setEndsAt] = useState('');
  /** Within "Change end date": correct the paid date, or the trial date. */
  const [dateTarget, setDateTarget] = useState<'paid' | 'trial'>('paid');
  const [trialEndsAtInput, setTrialEndsAtInput] = useState('');
  const [status, setStatus] = useState<SubscriberRow['liveStatus']>('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The API verb this UI state resolves to.
   *
   * Kept as a derived value rather than stored state so the two can never
   * disagree — the previous version held the verb directly and reused one
   * `days` field across "grant" and "extend_trial", which meant switching
   * action carried a stale number into the next one.
   */
  // ---- Which windows are actually OPEN right now ----
  //
  // Openness is decided by the DATE alone, never by the stored status,
  // for the same reason the list shows `liveStatus`: nothing flips the
  // status column when a date passes, so `stored: active` routinely
  // outlives the paid window it refers to.
  //
  // This is load-bearing. The server's `expireNow()` decides which
  // window to end with `status === 'active' || subscription_ends_at
  // !== null` — a test that stays TRUE for an account whose paid window
  // lapsed days ago, because the lapsed date is still non-null. On an
  // account with a dead paid window and a LIVE trial, that guess ends
  // the dead window and leaves the trial running, so "Expire now" looks
  // like it did nothing. The UI therefore never relies on that guess:
  // it names the window explicitly in every case.
  const trialOpen =
    !!row.trialEndsAt && new Date(row.trialEndsAt).getTime() > Date.now();
  const paidOpen =
    !!row.subscriptionEndsAt &&
    new Date(row.subscriptionEndsAt).getTime() > Date.now();

  const bothOpen = trialOpen && paidOpen;
  const anyOpen = trialOpen || paidOpen;
  /** The only meaningful target when exactly one window is open. */
  const soleOpenWindow: 'trial' | 'paid' | null = bothOpen
    ? null
    : trialOpen
      ? 'trial'
      : paidOpen
        ? 'paid'
        : null;

  /** Where the expiry will actually land, after the above. */
  const effectiveExpireTarget: 'trial' | 'paid' | 'both' | null = bothOpen
    ? expireTarget
    : soleOpenWindow;

  const action: ActionKind =
    intent === 'give'
      ? giveMode === 'paid'
        ? 'grant'
        : 'extend_trial'
      : intent === 'end'
        ? endMode === 'expire'
          ? effectiveExpireTarget === 'trial'
            ? 'expire_trial'
            : effectiveExpireTarget === 'paid'
              ? 'expire_paid'
              : effectiveExpireTarget === 'both'
                ? 'expire_both'
                : // Nothing open to expire. The button is disabled in
                  // this state, so this branch is never submitted; it
                  // exists only to keep `action` a total function.
                  'expire_now'
          : 'revoke'
        : intent === 'date'
          ? dateTarget === 'paid'
            ? 'set_end_date'
            : 'set_trial_end_date'
          : 'set_status';

  const isDestructive = action === 'revoke';

  /**
   * What the button will actually do, in words.
   *
   * A generic "Apply" is the last place the old dialog could still
   * surprise someone: after picking through a six-item dropdown there was
   * no final restatement of the outcome. Naming it means the operator gets
   * one more chance to notice they are about to block a paying customer
   * rather than let their trial lapse.
   */
  const confirmLabel = (() => {
    if (action === 'grant') {
      const d = Number(days);
      const m = Number(months);
      if (Number.isFinite(d) && d > 0) {
        return `Give ${d} day${d === 1 ? '' : 's'} paid access`;
      }
      if (Number.isFinite(m) && m > 0) {
        return `Give ${m} month${m === 1 ? '' : 's'} paid access`;
      }
      return 'Give paid access';
    }
    if (action === 'extend_trial') {
      const d = Number(trialDays);
      return Number.isFinite(d) && d > 0
        ? `Add ${d} trial day${d === 1 ? '' : 's'}`
        : 'Add trial days';
    }
    if (action === 'expire_now') return 'Nothing to expire';
    if (action === 'expire_trial') return 'Expire trial now';
    if (action === 'expire_paid') return 'Expire paid plan now';
    if (action === 'expire_both') return 'Expire trial and paid plan now';
    if (action === 'revoke') return 'Block this workspace';
    if (action === 'set_end_date') return 'Update end date';
    if (action === 'set_trial_end_date') return 'Update trial end date';
    return 'Set status';
  })();

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        accountId: row.accountId,
        action,
        note: note.trim() || null,
      };

      if (action === 'grant') {
        const d = Number(days);
        const m = Number(months);
        if (Number.isFinite(d) && d > 0) body.durationDays = d;
        else if (Number.isFinite(m) && m > 0) body.durationMonths = m;
        else {
          setError('Enter a duration in months or days.');
          setBusy(false);
          return;
        }
        // Only sent when filled; the mutation keeps the stored plan name
        // when this is absent, so a blank field never wipes the label.
        if (planName.trim()) body.planName = planName.trim();
      }

      if (action === 'extend_trial') {
        const d = Number(trialDays);
        if (!Number.isFinite(d) || d <= 0) {
          setError('Enter how many days to add to the trial.');
          setBusy(false);
          return;
        }
        body.durationDays = d;
      }

      if (action === 'set_end_date') {
        if (!endsAt) {
          setError('Pick an end date.');
          setBusy(false);
          return;
        }
        body.endsAt = new Date(endsAt).toISOString();
      }

      if (action === 'set_trial_end_date') {
        if (!trialEndsAtInput) {
          setError('Pick a new trial end date.');
          setBusy(false);
          return;
        }
        body.trialEndsAt = new Date(trialEndsAtInput).toISOString();
      }

      if (action === 'set_status') body.status = status;

      const res = await fetch('/api/super-admin/billing/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error ?? 'Could not update the subscription');
        return;
      }

      await onDone();
    } catch {
      setError('Could not update the subscription. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // Uses the shared Dialog rather than a hand-rolled fixed overlay.
    // That is a correctness requirement, not a tidy-up: every portaled
    // popup in this design system (select, dropdown, popover, tooltip,
    // dialog) sits on ONE z-50 layer and stacks by portal mount order,
    // so a select opened inside a dialog paints above it. The previous
    // bespoke overlay used z-[110], which lifted the panel above that
    // shared layer and left the Action dropdown opening *behind* the
    // modal — it looked like a dead control. Escape-to-close, focus
    // trapping and scroll lock come along for free.
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* Three fixed regions, not one scrolling block.
          
          Previously the whole panel was `max-h-[90vh] overflow-y-auto`, so
          the header and footer scrolled with the content. Once this dialog
          grew (three intent cards, the per-action fields, the history
          disclosure and the note box) it outgrew a laptop viewport — and
          BOTH ways out went with it: the X scrolled off the top and Cancel
          off the bottom, leaving no visible exit. A dialog whose dismiss
          controls can leave the screen is a trap.
          
          `gap-0 p-0` overrides DialogContent's default `grid gap-4` and
          padding, because the padding now belongs to each region so the
          scroll area can sit flush between the two borders. */}
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-md"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg font-bold text-slate-900">
              {row.accountName}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {statusMeta('workspace', row.liveStatus).label} · ends{' '}
              {formatDate(row.endsAt)}
              {row.pendingWindow ? (
                <span className="ml-1 text-xs text-emerald-600">
                  (+ {row.pendingWindow.type === 'active' ? 'paid' : 'trial'}{' '}
                  queued until {formatDate(row.pendingWindow.endsAt)})
                </span>
              ) : null}
            </DialogDescription>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>Access via</span>
              <AccessViaCell accessVia={row.accessVia} />
            </div>
          </div>
          {/* -m-1.5 p-1.5 gives a 32px hit target without moving the icon:
              the previous bare 20px icon was a small target for the only
              control in the header. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* F6: manual changes do not move Razorpay's charge date. */}
          <AutopayManualActionWarning
            autopay={row.autopay}
            intent={intent}
            onOpenAutopay={onOpenAutopay}
          />

          {/* Three visible choices instead of six hidden ones. */}
          <div className="grid grid-cols-3 gap-1.5">
            {INTENTS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setIntent(opt.value);
                  setError(null);
                }}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition-colors',
                  intent === opt.value
                    ? 'border-[#25D366] bg-[#25D366]/5 ring-1 ring-[#25D366]/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <span className="block text-xs font-semibold text-slate-900">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>

          {/* ---- Give access: merges grant + extend_trial ---- */}
          {intent === 'give' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setGiveMode('paid')}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    giveMode === 'paid'
                      ? 'border-green-500 bg-green-50 text-green-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Paid access
                </button>
                <button
                  type="button"
                  onClick={() => setGiveMode('trial')}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    giveMode === 'trial'
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Trial days
                </button>
              </div>

              {giveMode === 'paid' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600">
                        Months
                      </p>
                      <Input
                        type="number"
                        min={1}
                        value={months}
                        onChange={(e) => {
                          setMonths(e.target.value);
                          if (e.target.value) setDays('');
                        }}
                        className="border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600">
                        Or days
                      </p>
                      <Input
                        type="number"
                        min={1}
                        value={days}
                        onChange={(e) => {
                          setDays(e.target.value);
                          if (e.target.value) setMonths('');
                        }}
                        className="border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-600">
                      Plan name{' '}
                      <span className="text-slate-400">(optional)</span>
                    </p>
                    <Input
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="e.g. Pro"
                      className="border-slate-200 bg-white text-slate-900"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Recorded on the customer&apos;s billing page and payment
                      history. Leave blank to keep whatever is already recorded.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Trial days to add
                  </p>
                  <Input
                    type="number"
                    min={1}
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    placeholder="e.g. 7"
                    className="border-slate-200 bg-white text-slate-900"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Trials are counted in days only. Use{' '}
                    <strong>Paid access</strong> for months.
                  </p>
                </div>
              )}

              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                {giveMode === 'paid' && row.liveStatus === 'trialing'
                  ? `Active trial detected. Paid access will start on ${formatDate(row.endsAt)} so remaining trial days are preserved.`
                  : giveMode === 'trial' && row.liveStatus === 'active'
                    ? `Active paid subscription detected. Trial days will start on ${formatDate(row.endsAt)} after the paid plan ends.`
                    : 'If this workspace still has time left, the new window is added to the end rather than starting today.'}
              </p>
            </div>
          ) : null}

          {/* ---- End access: the confusable pair, side by side ----
               These two were the real source of the confusion, because a
               dropdown never lets you read both descriptions at once. Shown
               together, the difference is the whole point of the control. */}
          {intent === 'end' ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setEndMode('expire')}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                  endMode === 'expire'
                    ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Let it expire now
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {!anyOpen
                      ? 'Nothing to expire. Neither the trial nor a paid plan is currently open on this workspace.'
                      : bothOpen
                        ? 'This workspace has BOTH a trial and a paid plan open at once. Choose which to end below.'
                        : `Moves the ${soleOpenWindow === 'trial' ? 'TRIAL' : 'PAID PLAN'} end date to right now, so the workspace lapses exactly as it would on the real day.`}{' '}
                    {anyOpen ? (
                      <>
                        <strong>Use this for testing</strong>. The customer sees
                        the normal upgrade prompt.
                      </>
                    ) : null}
                  </span>
                  {anyOpen ? (
                    <span className="mt-1 block text-xs text-slate-500">
                      Undo by giving access again.
                    </span>
                  ) : null}
                </span>
              </button>

              {/* Which window is open, stated plainly.
                  Needed because the row's status badge can disagree with
                  reality: an account can read `stored: active` while its
                  paid window lapsed days ago and only the trial is live.
                  Without this the operator cannot tell what "Expire now"
                  is about to touch. */}
              {endMode === 'expire' ? (
                <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Trial window</span>
                    <span
                      className={cn(
                        'font-medium',
                        trialOpen ? 'text-blue-700' : 'text-slate-400'
                      )}
                    >
                      {trialOpen
                        ? `open until ${formatDate(row.trialEndsAt)}`
                        : row.trialEndsAt
                          ? `ended ${formatDate(row.trialEndsAt)}`
                          : 'none'}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Paid window</span>
                    <span
                      className={cn(
                        'font-medium',
                        paidOpen ? 'text-green-700' : 'text-slate-400'
                      )}
                    >
                      {paidOpen
                        ? `open until ${formatDate(row.subscriptionEndsAt)}`
                        : row.subscriptionEndsAt
                          ? `ended ${formatDate(row.subscriptionEndsAt)}`
                          : 'none'}
                    </span>
                  </p>
                </div>
              ) : null}

              {/* Only shown when a trial and a paid plan are BOTH open at
                  once (window stacking — a trialing account that already
                  bought a plan queued behind the trial, or vice versa).
                  Auto-detection alone can't tell you which one you meant
                  to end, so this is where you say. */}
              {endMode === 'expire' && bothOpen ? (
                <div className="grid grid-cols-3 gap-1.5 pl-1">
                  <button
                    type="button"
                    onClick={() => setExpireTarget('trial')}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                      expireTarget === 'trial'
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Trial only
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpireTarget('paid')}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                      expireTarget === 'paid'
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Paid only
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpireTarget('both')}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                      expireTarget === 'both'
                        ? 'border-amber-500 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Both
                  </button>
                </div>
              ) : null}
              {endMode === 'expire' && bothOpen ? (
                <p className="pl-1 text-xs text-slate-500">
                  {expireTarget === 'trial'
                    ? 'Ends the trial now. The paid plan takes over immediately since it is already queued.'
                    : expireTarget === 'paid'
                      ? 'Ends the paid plan now. The trial keeps counting down untouched.'
                      : 'Ends both. The workspace loses access entirely, right now.'}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setEndMode('block')}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                  endMode === 'block'
                    ? 'border-red-400 bg-red-50 ring-1 ring-red-300'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Block immediately
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Sets a blocked flag that ignores the end date entirely.
                    Every member loses access even if they have time left.
                    <strong> Use this to shut someone off</strong>, e.g. for
                    abuse or non-payment.
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          {/* ---- Change end date ---- */}
          {intent === 'date' ? (
            <div className="space-y-3">
              {/* Paid vs trial date. Previously this only ever touched
                  `subscription_ends_at` — correcting the number of trial
                  days an account had left required going back through
                  "Give access → Trial days" and re-doing the math from
                  scratch, since that action ADDS days rather than setting
                  an exact date. */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDateTarget('paid')}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    dateTarget === 'paid'
                      ? 'border-green-500 bg-green-50 text-green-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Paid plan date
                </button>
                <button
                  type="button"
                  onClick={() => setDateTarget('trial')}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    dateTarget === 'trial'
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Trial date
                </button>
              </div>

              {dateTarget === 'paid' ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    New paid plan end date
                  </p>
                  {/* A calendar dropdown we render, not the browser's
                      native `<input type="date">`. The native control had
                      its own text selection (clicking it looked like
                      "trying to copy") and its own OS calendar popup,
                      which painted above this dialog because it is
                      outside this app's DOM and z-index layer entirely.
                      See date-picker-field.tsx. */}
                  <DatePickerField
                    value={endsAt}
                    onChange={setEndsAt}
                    min={new Date().toISOString().slice(0, 10)}
                    placeholder="Pick the new end date"
                    className="border-slate-200 bg-white text-slate-900"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Must be in the future. To remove access now, use{' '}
                    <strong>End access</strong> instead.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    New trial end date
                  </p>
                  <DatePickerField
                    value={trialEndsAtInput}
                    onChange={setTrialEndsAtInput}
                    min={new Date().toISOString().slice(0, 10)}
                    placeholder="Pick the new trial end date"
                    className="border-slate-200 bg-white text-slate-900"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Must be in the future. Does not change the account&apos;s
                    status. If a paid plan is currently active, the trial stays
                    queued behind it.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* ---- Advanced: the raw status escape hatch ----
               Kept, because marking a workspace permanently ungated
               (internal / demo) has no equivalent anywhere else. Collapsed,
               because it writes the status column directly and bypasses the
               dates — which is exactly why it does not belong beside the
               three normal choices. */}
          {intent === 'advanced' ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p className="text-xs text-slate-600">
                  Writes the status column directly without touching any date.
                  Normally you want one of the three options above. This exists
                  for marking a workspace as never-gated (internal or demo).
                </p>
              </div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Status
              </p>
              <Select
                value={status}
                onValueChange={(v) => {
                  if (v) setStatus(v as SubscriberRow['liveStatus']);
                }}
              >
                <SelectTrigger className="w-full border-slate-200 bg-white text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  {(
                    Object.keys(STATUS_LABELS) as SubscriberRow['liveStatus'][]
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {intent !== 'advanced' ? (
            <button
              type="button"
              onClick={() => {
                setIntent('advanced');
                setError(null);
              }}
              className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Advanced: set status directly
            </button>
          ) : null}

          {/* What has already been done to this workspace.
              Shown here, not just on the Activity tab, because the most
              likely mistake is granting time that was already granted —
              double-comping an account, or re-extending a trial someone
              else extended an hour ago. The record has to be visible at the
              moment of the decision, not on another screen. */}
          <RecentHistory accountId={row.accountId} />

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Note <span className="text-slate-400">(optional)</span>
            </p>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Recorded on the audit trail"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-[#25D366] focus:outline-none"
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}
        </div>

        {/* Pinned: the confirm and cancel buttons must never be something
            you have to scroll to find. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            // Disabled when there is no open window to expire, rather
            // than firing a request that would silently no-op.
            disabled={
              busy || (intent === 'end' && endMode === 'expire' && !anyOpen)
            }
            onClick={() => void submit()}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60',
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : action === 'expire_now' ||
                    action === 'expire_trial' ||
                    action === 'expire_paid' ||
                    action === 'expire_both'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-[#25D366] hover:bg-[#20b958]'
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : action === 'revoke' ? (
              <ShieldOff className="h-4 w-4" />
            ) : action === 'expire_now' ||
              action === 'expire_trial' ||
              action === 'expire_paid' ||
              action === 'expire_both' ? (
              <Clock className="h-4 w-4" />
            ) : action === 'extend_trial' ? (
              <RotateCcw className="h-4 w-4" />
            ) : action === 'set_end_date' || action === 'set_trial_end_date' ? (
              <CalendarClock className="h-4 w-4" />
            ) : action === 'set_status' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
