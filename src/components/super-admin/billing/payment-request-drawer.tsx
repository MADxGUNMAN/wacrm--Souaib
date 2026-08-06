'use client';

// ============================================================
// Payment review drawer — the screen where money becomes access.
//
// Design priorities, in order:
//  1. Make a mismatch impossible to miss. The expected and paid amounts
//     sit side by side with an explicit banner when they disagree, because
//     approving an underpayment is the costly mistake here.
//  2. Make the granted duration explicit BEFORE approving. The admin sees
//     the exact end date they're about to hand out, not just "1 month".
//  3. Require a reason on rejection — the customer reads it.
// ============================================================

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Loader2,
  Phone,
  Smartphone,
  User,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';
import { addDuration } from '@/lib/subscription/status';
import { cn } from '@/lib/utils';
import type { AdminPaymentRequest } from '@/types/super-admin';

type Action = 'approve' | 'reject';

interface Props {
  request: AdminPaymentRequest;
  onClose: () => void;
  onReviewed: () => void | Promise<void>;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

const STATUS_STYLE: Record<AdminPaymentRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

export function PaymentRequestDrawer({ request, onClose, onReviewed }: Props) {
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [overrideMonths, setOverrideMonths] = useState('');
  const [overrideDays, setOverrideDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isPending = request.status === 'pending';

  // Show the admin exactly what window they're about to grant. Mirrors
  // the server's arithmetic (addDuration, renewal-aware start) so the
  // preview and the result agree.
  const preview = useMemo(() => {
    const days = Number(overrideDays);
    const months = Number(overrideMonths);

    const duration =
      Number.isFinite(days) && days > 0
        ? { days }
        : Number.isFinite(months) && months > 0
          ? { months }
          : {
              months: request.cycle_months ?? 0,
              days: request.cycle_duration_days ?? null,
            };

    // Renewal-aware: if the account still has time, the grant extends
    // from its current end rather than from today.
    const current = request.account_subscription_ends_at
      ? new Date(request.account_subscription_ends_at)
      : null;
    const now = new Date();
    const start = current && current.getTime() > now.getTime() ? current : now;

    return {
      start,
      end: addDuration(start, duration),
      isExtension: start.getTime() > now.getTime(),
      label:
        'days' in duration && duration.days
          ? `${duration.days} day${duration.days === 1 ? '' : 's'}`
          : `${duration.months ?? 0} month${duration.months === 1 ? '' : 's'}`,
    };
  }, [
    overrideDays,
    overrideMonths,
    request.cycle_months,
    request.cycle_duration_days,
    request.account_subscription_ends_at,
  ]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (http / permissions). The UTR is selectable
      // text, so manual copy still works.
    }
  };

  const submit = async () => {
    if (!action) return;

    if (action === 'reject' && !note.trim()) {
      setError('Add a reason — the customer sees this message.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        id: request.id,
        action,
        note: note.trim() || null,
      };

      if (action === 'approve') {
        const days = Number(overrideDays);
        const months = Number(overrideMonths);
        if (Number.isFinite(days) && days > 0) body.durationDays = days;
        else if (Number.isFinite(months) && months > 0) body.durationMonths = months;
      }

      const res = await fetch('/api/super-admin/billing/payment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error ?? 'Could not complete the review');
        return;
      }

      await onReviewed();
      onClose();
    } catch {
      setError('Could not complete the review. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-[110] flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-bold text-slate-900">
                {request.plan_name_snapshot}
              </h3>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                  STATUS_STYLE[request.status],
                )}
              >
                {request.status}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {request.cycle_label_snapshot} · {request.account_name ?? 'Unknown account'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* ---- Amounts. The most consequential comparison on screen. ---- */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Amount
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Plan price</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency(request.expected_amount, request.currency)}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-xl border p-4',
                  request.amount_matches
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50',
                )}
              >
                <p className="text-xs text-slate-500">Customer paid</p>
                <p
                  className={cn(
                    'mt-1 text-lg font-bold',
                    request.amount_matches ? 'text-green-700' : 'text-red-700',
                  )}
                >
                  {formatCurrency(request.paid_amount, request.currency)}
                </p>
              </div>
            </div>

            {!request.amount_matches ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">
                  {request.amount_difference < 0 ? 'Underpaid' : 'Overpaid'} by{' '}
                  <span className="font-semibold">
                    {formatCurrency(
                      Math.abs(request.amount_difference),
                      request.currency,
                    )}
                  </span>
                  . Verify against your bank statement before approving.
                </p>
              </div>
            ) : null}
          </div>

          {/* ---- Verification details ---- */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Payment details
            </p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 p-3.5">
                <span className="text-sm text-slate-500">UTR / Transaction ID</span>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="truncate font-mono text-sm font-medium text-slate-900 select-all">
                    {request.transaction_ref}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopy(request.transaction_ref)}
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                    aria-label="Copy transaction ID"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <DetailRow
                icon={User}
                label="Account holder"
                value={request.payer_name}
              />
              <DetailRow
                icon={Phone}
                label="Mobile"
                value={request.payer_mobile}
                href={`tel:${request.payer_mobile}`}
              />
              {request.payer_upi_id ? (
                <DetailRow
                  icon={Smartphone}
                  label="Payer UPI ID"
                  value={request.payer_upi_id}
                />
              ) : null}
              {request.payer_bank ? (
                <DetailRow icon={Building2} label="Bank" value={request.payer_bank} />
              ) : null}
              <DetailRow
                icon={CalendarClock}
                label="Paid on"
                value={formatDateTime(request.paid_at)}
              />
              <DetailRow
                icon={Clock}
                label="Submitted"
                value={formatDateTime(request.created_at)}
              />
            </div>
          </div>

          {/* ---- Who submitted ---- */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Submitted by
            </p>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-900">
                {request.submitted_by_name ?? 'Unknown user'}
              </p>
              {request.submitted_by_email ? (
                <a
                  href={`mailto:${request.submitted_by_email}`}
                  className="text-sm text-[#25D366] hover:underline"
                >
                  {request.submitted_by_email}
                </a>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                Workspace status:{' '}
                <span className="font-medium text-slate-700">
                  {request.account_subscription_status ?? 'unknown'}
                </span>
                {request.account_subscription_ends_at ? (
                  <> · ends {formatDate(request.account_subscription_ends_at)}</>
                ) : null}
              </p>
            </div>
          </div>

          {request.payer_note ? (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Customer note
              </p>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                  {request.payer_note}
                </p>
              </div>
            </div>
          ) : null}

          {/* ---- Already reviewed ---- */}
          {!isPending ? (
            <div
              className={cn(
                'rounded-xl border p-4',
                request.status === 'approved'
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50',
              )}
            >
              <p className="text-sm font-semibold text-slate-900 capitalize">
                {request.status} on {formatDateTime(request.reviewed_at)}
              </p>
              {request.review_note ? (
                <p className="mt-1 text-sm text-slate-600">{request.review_note}</p>
              ) : null}
              {request.status === 'approved' && request.activated_until ? (
                <p className="mt-2 text-sm text-slate-600">
                  Granted {formatDate(request.activated_from)} →{' '}
                  <span className="font-medium">
                    {formatDate(request.activated_until)}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ---- Approve form ---- */}
          {isPending && action === 'approve' ? (
            <div className="space-y-4 rounded-xl border border-green-200 bg-green-50/50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Activate this subscription
              </p>

              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-xs text-slate-500">
                  {preview.isExtension
                    ? 'Extends the current subscription'
                    : 'Starts now'}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {preview.label} → ends {formatDate(preview.end)}
                </p>
                {preview.isExtension ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Existing time is preserved — the new window starts{' '}
                    {formatDate(preview.start)}.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  Override duration{' '}
                  <span className="text-slate-400">
                    (optional — defaults to the purchased cycle)
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Months"
                    value={overrideMonths}
                    onChange={(e) => {
                      setOverrideMonths(e.target.value);
                      // Days wins server-side, so clear it to keep the
                      // preview honest about which field is in effect.
                      if (e.target.value) setOverrideDays('');
                    }}
                    className="border-slate-200 bg-white text-slate-900"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Or days"
                    value={overrideDays}
                    onChange={(e) => {
                      setOverrideDays(e.target.value);
                      if (e.target.value) setOverrideMonths('');
                    }}
                    className="border-slate-200 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  Internal note <span className="text-slate-400">(optional)</span>
                </p>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. verified against HDFC statement"
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>
          ) : null}

          {/* ---- Reject form ---- */}
          {isPending && action === 'reject' ? (
            <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Reject this payment
              </p>
              <p className="text-xs text-slate-600">
                The customer sees this reason, and can resubmit with a corrected
                UTR.
              </p>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. No matching transfer found for this UTR. Please double-check and resubmit."
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-red-500 focus:outline-none"
              />
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        {isPending ? (
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 p-4">
            {action ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60',
                    action === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : action === 'approve' ? (
                    <CircleCheck className="h-4 w-4" />
                  ) : (
                    <CircleX className="h-4 w-4" />
                  )}
                  {action === 'approve'
                    ? `Approve & activate ${preview.label}`
                    : 'Confirm rejection'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAction(null);
                    setError(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAction('approve');
                    setNote('');
                    setError(null);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <CircleCheck className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAction('reject');
                    setNote('');
                    setError(null);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <CircleX className="h-4 w-4" />
                  Reject
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
      </span>
      {href ? (
        <a
          href={href}
          className="truncate text-sm font-medium text-[#25D366] hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="truncate text-sm font-medium text-slate-900">{value}</span>
      )}
    </div>
  );
}
