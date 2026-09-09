'use client';

// ============================================================
// Subscribers tab — manual subscription control.
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

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Clock,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Search,
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SubscriberCounts, SubscriberRow } from '@/types/super-admin';

const STATUS_STYLE: Record<SubscriberRow['liveStatus'], string> = {
  trialing: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  expired: 'bg-red-50 text-red-700',
  none: 'bg-slate-100 text-slate-600',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
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

const STATUS_LABELS: Record<SubscriberRow['liveStatus'], string> = {
  none: 'none — never gated (internal / demo)',
  trialing: 'trialing',
  active: 'active',
  expired: 'expired',
};

export function SubscribersPanel() {
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [counts, setCounts] = useState<SubscriberCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const [target, setTarget] = useState<SubscriberRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ state: stateFilter });
      if (debounced) params.set('search', debounced);

      const res = await fetch(
        `/api/super-admin/billing/subscriptions?${params.toString()}`
      );
      if (!res.ok) throw new Error('Failed to load subscribers');
      const data = await res.json();

      setRows(data.subscribers ?? []);
      setCounts(data.counts ?? null);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load subscribers'
      );
    } finally {
      setLoading(false);
    }
  }, [stateFilter, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Counters — derived from liveStatus so they agree with the rows. */}
      {counts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CountTile label="Total" value={counts.total} />
          <CountTile label="Trialing" value={counts.trialing} tone="blue" />
          <CountTile label="Active" value={counts.active} tone="green" />
          <CountTile label="Expired" value={counts.expired} tone="red" />
          <CountTile label="Blocked" value={counts.blocked} tone="amber" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search workspace, owner name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <Select
            value={stateFilter}
            onValueChange={(v) => {
              if (v) setStateFilter(v);
            }}
          >
            <SelectTrigger className="w-[170px] border-slate-200 bg-white text-slate-900">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              {Object.entries(STATE_FILTER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Workspace
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Owner
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Term
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase">
                  Ends
                </TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600 uppercase">
                  Manage
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-slate-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading subscribers…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-red-500"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-slate-400"
                  >
                    No workspaces match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.accountId} className="border-slate-200">
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">
                          {row.accountName}
                        </p>
                        {row.isBanned ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                            title="Banned by a super admin — outranks billing"
                          >
                            <Ban className="h-2.5 w-2.5" />
                            Banned
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p
                        className="max-w-[170px] truncate text-sm text-slate-700"
                        title={row.ownerName ?? undefined}
                      >
                        {row.ownerName ?? '—'}
                      </p>
                      {/* Emails truncate at the DOMAIN, which is precisely
                          the part that distinguishes two similar addresses.
                          A mistyped "@gamil.com" next to the real
                          "@gmail.com" both rendered as
                          "gunmanaimcompetitive@g…" and looked like one
                          account duplicated. Wider, plus the full address
                          on hover, so an operator can always tell them
                          apart without opening the row. */}
                      <p
                        className="max-w-[240px] truncate text-xs text-slate-400"
                        title={row.ownerEmail ?? undefined}
                      >
                        {row.ownerEmail ?? ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_STYLE[row.liveStatus]
                        )}
                      >
                        {row.liveStatus}
                      </span>
                      {row.inGracePeriod ? (
                        <p className="mt-1 text-[10px] font-medium text-amber-600">
                          in grace period
                        </p>
                      ) : null}
                      {/* Surface drift so the operator can see the stored
                          column is stale rather than being confused by it. */}
                      {row.storedStatus !== row.liveStatus ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          stored: {row.storedStatus}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {/* Shows the billing term (Monthly / Yearly), not the
                          plan name. There is a single product now, so the
                          name added nothing; the term is what distinguishes
                          one subscriber from another. */}
                      <p className="text-sm text-slate-700">
                        {row.cycleLabel ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">
                        {formatDate(row.endsAt)}
                      </p>
                      {row.daysLeft !== null ? (
                        <p className="text-xs text-slate-400">
                          {row.daysLeft} day{row.daysLeft === 1 ? '' : 's'} left
                        </p>
                      ) : null}
                      {row.pendingWindow ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {row.pendingWindow.type === 'active'
                            ? `+ Paid starts ${formatDate(row.pendingWindow.startsAt)}`
                            : `+ ${row.pendingWindow.durationDays}d trial queued`}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => setTarget(row)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Manage
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {target ? (
        <ManageSubscriptionDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={async () => {
            setTarget(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function CountTile({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'blue' | 'green' | 'red' | 'amber';
}) {
  const toneClass = {
    slate: 'text-slate-900',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-bold', toneClass)}>{value}</p>
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
  const [events, setEvents] = useState<
    | {
        id: string;
        eventType: string;
        source: string;
        actorName: string | null;
        note: string | null;
        createdAt: string;
      }[]
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || events !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/super-admin/billing/events?accountId=${accountId}&pageSize=5`
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setEvents(res.ok ? (data.events ?? []) : []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, events, accountId]);

  const LABELS: Record<string, string> = {
    trial_started: 'Trial started',
    trial_extended: 'Trial extended',
    payment_submitted: 'Payment submitted',
    payment_approved: 'Payment approved',
    payment_rejected: 'Payment rejected',
    subscription_activated: 'Subscription activated',
    subscription_extended: 'Subscription extended',
    subscription_revoked: 'Access blocked',
    subscription_expired: 'Expired',
  };

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
          ) : !events || events.length === 0 ? (
            <p className="py-1 text-xs text-slate-400">
              Nothing recorded for this workspace yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn(
                      'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                      e.source === 'payment' ? 'bg-green-500' : 'bg-blue-500'
                    )}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-700">
                      {LABELS[e.eventType] ?? e.eventType}
                    </span>
                    <span className="text-slate-400">
                      {' · '}
                      {new Date(e.createdAt).toLocaleDateString()}
                      {e.actorName ? ` · ${e.actorName}` : ''}
                    </span>
                    {e.note ? (
                      <span className="block text-slate-500 italic">
                        “{e.note}”
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------

function ManageSubscriptionDialog({
  row,
  onClose,
  onDone,
}: {
  row: SubscriberRow;
  onClose: () => void;
  onDone: () => void | Promise<void>;
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
              {row.liveStatus} · ends {formatDate(row.endsAt)}
              {row.pendingWindow ? (
                <span className="ml-1 text-xs text-emerald-600">
                  (+ {row.pendingWindow.type === 'active' ? 'paid' : 'trial'}{' '}
                  queued until {formatDate(row.pendingWindow.endsAt)})
                </span>
              ) : null}
            </DialogDescription>
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
                      ? 'Nothing to expire — neither the trial nor a paid plan is currently open on this workspace.'
                      : bothOpen
                        ? 'This workspace has BOTH a trial and a paid plan open at once. Choose which to end below.'
                        : `Moves the ${soleOpenWindow === 'trial' ? 'TRIAL' : 'PAID PLAN'} end date to right now, so the workspace lapses exactly as it would on the real day.`}{' '}
                    {anyOpen ? (
                      <>
                        <strong>Use this for testing</strong> — the customer
                        sees the normal upgrade prompt.
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
                      : 'Ends both — the workspace loses access entirely, right now.'}
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
                    status — if a paid plan is currently active, the trial stays
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
                  Normally you want one of the three options above — this exists
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
