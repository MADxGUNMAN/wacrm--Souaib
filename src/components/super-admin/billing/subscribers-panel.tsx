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
  | 'set_end_date'
  | 'revoke'
  | 'set_status';

// ------------------------------------------------------------
// Select option maps. Declared as data so the option list has a single
// source and the order is obvious at a glance; the trigger label is
// resolved from the rendered items by the shared Select component.
// ------------------------------------------------------------

const ACTION_LABELS: Record<ActionKind, string> = {
  grant: 'Grant / extend paid access',
  extend_trial: 'Extend trial',
  expire_now: 'End now (simulate expiry)',
  set_end_date: 'Set exact end date',
  revoke: 'Revoke access now',
  set_status: 'Set status directly',
};

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
        `/api/super-admin/billing/subscriptions?${params.toString()}`,
      );
      if (!res.ok) throw new Error('Failed to load subscribers');
      const data = await res.json();

      setRows(data.subscribers ?? []);
      setCounts(data.counts ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscribers');
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
                  <TableCell colSpan={6} className="h-28 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading subscribers…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={6} className="h-28 text-center text-red-500">
                    {error}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow className="border-slate-200">
                  <TableCell colSpan={6} className="h-28 text-center text-slate-400">
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
                      <p className="max-w-[170px] truncate text-sm text-slate-700">
                        {row.ownerName ?? '—'}
                      </p>
                      <p className="max-w-[170px] truncate text-xs text-slate-400">
                        {row.ownerEmail ?? ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_STYLE[row.liveStatus],
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
                      <p className="text-sm text-slate-700">{formatDate(row.endsAt)}</p>
                      {row.daysLeft !== null ? (
                        <p className="text-xs text-slate-400">
                          {row.daysLeft} day{row.daysLeft === 1 ? '' : 's'} left
                        </p>
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

function ManageSubscriptionDialog({
  row,
  onClose,
  onDone,
}: {
  row: SubscriberRow;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [action, setAction] = useState<ActionKind>('grant');
  const [months, setMonths] = useState('1');
  const [days, setDays] = useState('');
  const [planName, setPlanName] = useState(row.planName ?? '');
  const [endsAt, setEndsAt] = useState('');
  const [status, setStatus] = useState<SubscriberRow['liveStatus']>('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors expireNow()'s precedence on the server: any paid window
  // outranks a trial, so that is the date it will move. Shown so the
  // operator knows which one they are ending before they apply it.
  const expiresPaidWindow =
    row.liveStatus === 'active' || row.subscriptionEndsAt !== null;

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
        const d = Number(days);
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
      {/* DialogContent is display:grid with gap-4, so spacing between
          the header, body and footer is left to that gap rather than to
          margins, which would stack on top of it. */}
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg font-bold text-slate-900">
              {row.accountName}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {row.liveStatus} · ends {formatDate(row.endsAt)}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Action</p>
            <Select
              value={action}
              onValueChange={(v) => {
                if (v) setAction(v as ActionKind);
                setError(null);
              }}
            >
              <SelectTrigger className="w-full border-slate-200 bg-white text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {(Object.keys(ACTION_LABELS) as ActionKind[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACTION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {action === 'grant' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Months</p>
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
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Or days</p>
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
                  Plan name <span className="text-slate-400">(optional)</span>
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
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                If this workspace still has time left, the new window is added to
                the end rather than starting today.
              </p>
            </>
          ) : null}

          {action === 'extend_trial' ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Days to add
              </p>
              <Input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="e.g. 7"
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
          ) : null}

          {action === 'set_end_date' ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                New end date
              </p>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Must be in the future. To cut access off now, use “Revoke”.
              </p>
            </div>
          ) : null}

          {action === 'set_status' ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Status</p>
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

          {action === 'expire_now' ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  {expiresPaidWindow
                    ? 'Moves the paid subscription end date to right now.'
                    : 'Moves the trial end date to right now.'}
                </p>
                <p className="mt-1">
                  The workspace lapses exactly as it would on the day its{' '}
                  {expiresPaidWindow ? 'subscription' : 'trial'} ran out — the
                  owner is sent to the upgrade page and members to the
                  &ldquo;contact your owner&rdquo; screen on their next page
                  load. Use this to test real expiry behaviour rather than
                  &ldquo;Revoke&rdquo;, which forces a blocked flag instead of
                  letting the date lapse.
                </p>
                <p className="mt-1">
                  {expiresPaidWindow
                    ? 'Undo with “Grant / extend paid access”.'
                    : 'Any leftover paid window is cleared, otherwise it would keep the account alive. Undo with “Extend trial”.'}
                </p>
              </div>
            </div>
          ) : null}

          {action === 'revoke' ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">
                Blocks this workspace immediately, even if its end date has not
                passed. Every member loses CRM access until it is reactivated.
              </p>
            </div>
          ) : null}

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

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60',
              action === 'revoke'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#25D366] hover:bg-[#20b958]',
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : action === 'revoke' ? (
              <ShieldOff className="h-4 w-4" />
            ) : action === 'expire_now' ? (
              <Clock className="h-4 w-4" />
            ) : action === 'extend_trial' ? (
              <RotateCcw className="h-4 w-4" />
            ) : action === 'set_end_date' ? (
              <CalendarClock className="h-4 w-4" />
            ) : action === 'set_status' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Apply
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
