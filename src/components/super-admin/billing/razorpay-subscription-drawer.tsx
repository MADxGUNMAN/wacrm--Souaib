'use client';

// ============================================================
// One Razorpay subscription in full: summary, invoices, payments, the
// event timeline and the webhook events that named it.
//
// Actions are split by consequence. "Read-only" ones (Sync now, copy id,
// open in Razorpay) never change what the customer is charged. "Changes
// billing" holds Cancel AutoPay, which stops the mandate at Razorpay
// immediately and cannot be undone, so it asks for a reason, the
// operator's password (and 2FA code when they have it) and an explicit
// acknowledgement. The server enforces all of that again.
//
// When this server cannot reach the row's mode (`canAct` false) every
// Razorpay action is disabled and the reason is shown, rather than
// letting the click fail.
// ============================================================

import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type {
  AdminBillingEventRow,
  AdminInvoiceRow,
  AdminPaymentRow,
  AdminSubscriptionDetailRow,
  AdminSubscriptionRow,
  AdminWebhookEventRow,
} from '@/lib/billing/razorpay/admin-db';
import { ADMIN_CANCELLABLE } from '@/lib/billing/razorpay/admin-status';
import { cn } from '@/lib/utils';
import { classifyBillingEvent } from '@/lib/billing/event-channel';
import {
  accountStatusLabel,
  billingEventLabel,
  cancelledByLabel,
  sourceInitiatorLabel,
  statusMeta,
  webhookEventLabel,
} from './billing-labels';
import { ChannelBadge } from './channel-badge';
import { describeBillingEvent } from './event-description';
import {
  adminPaymentMethodText,
  adminPaymentPeriodText,
  CopyId,
  formatIst,
  formatMinor,
  methodText,
  ModeBadge,
  PaymentChargeCell,
  postJson,
  RazorpayLink,
  StatusPill,
  useAdminJson,
  type RazorpayMode,
} from './razorpay-shared';

interface DetailResponse {
  subscription: AdminSubscriptionDetailRow;
  invoices: AdminInvoiceRow[];
  payments: AdminPaymentRow[];
  events: AdminBillingEventRow[];
  webhookEvents: AdminWebhookEventRow[];
  canAct: boolean;
  configuredMode: RazorpayMode | null;
}

export function RazorpaySubscriptionDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  /** Called after Sync or Cancel changed the row. */
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useAdminJson<DetailResponse>(
    `/api/super-admin/billing/razorpay/subscriptions/${encodeURIComponent(id)}`
  );
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const sub = data?.subscription ?? null;

  /** Why Razorpay actions are off, or null when they are allowed. */
  const unreachableReason = !data
    ? null
    : data.canAct
      ? null
      : data.configuredMode === null
        ? 'Razorpay is not set up on this server, so it cannot reach this AutoPay.'
        : `This is a ${sub?.mode} mode AutoPay and this server is set up for ${data.configuredMode} mode.`;
  const syncBlocked =
    unreachableReason ??
    (sub && !sub.providerSubscriptionId
      ? 'This subscription was never created at Razorpay, so there is nothing to sync.'
      : null);
  const cancelBlocked =
    unreachableReason ??
    (sub && !sub.providerSubscriptionId
      ? 'This subscription was never created at Razorpay.'
      : sub && !ADMIN_CANCELLABLE.has(sub.status)
        ? `An AutoPay that is ${statusMeta('subscription', sub.status).label.toLowerCase()} cannot be cancelled.`
        : null);

  const sync = async () => {
    setSyncing(true);
    setActionError(null);
    const res = await postJson<{
      subscription: AdminSubscriptionRow | null;
      applied: number;
    }>(
      `/api/super-admin/billing/razorpay/subscriptions/${encodeURIComponent(id)}/sync`
    );
    setSyncing(false);
    if (!res.ok) {
      setActionError(res.message);
      return;
    }
    toast.success(
      `Synced from Razorpay. ${res.data.applied} payment${res.data.applied === 1 ? '' : 's'} applied.`
    );
    reload();
    onChanged();
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-slate-200 bg-white p-0 text-slate-900 sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
              <span className="truncate">
                {sub
                  ? (sub.accountName ?? 'Deleted workspace')
                  : 'AutoPay subscription'}
              </span>
              {sub ? <ModeBadge mode={sub.mode} /> : null}
              {sub ? (
                <StatusPill domain="subscription" status={sub.status} />
              ) : null}
            </SheetTitle>
            {sub ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {sub.planName} · {sub.cycleLabel} ·{' '}
                {formatMinor(sub.amountMinor, sub.currency)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription details"
            className="-m-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading && !data ? (
            <p className="inline-flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading subscription…
            </p>
          ) : null}
          {error ? <ErrorNote message={error} /> : null}

          {sub && data ? (
            <>
              {sub.mode === 'test' ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700">
                  Test mode subscription. No real money moves.
                </p>
              ) : null}

              {/* ---- Actions ---- */}
              <section aria-labelledby="rzp-actions" className="space-y-2">
                <h3 id="rzp-actions" className="sr-only">
                  Actions
                </h3>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Read-only
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void sync()}
                      disabled={syncing || Boolean(syncBlocked)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {syncing ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Sync now
                    </button>
                    {sub.providerSubscriptionId ? (
                      <>
                        <CopyId
                          value={sub.providerSubscriptionId}
                          label="Razorpay subscription id"
                        />
                        <RazorpayLink
                          kind="subscription"
                          id={sub.providerSubscriptionId}
                        />
                      </>
                    ) : null}
                  </div>
                  {syncBlocked ? (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Sync is unavailable: {syncBlocked}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-red-200 p-3">
                  <p className="text-[11px] font-semibold tracking-wider text-red-500 uppercase">
                    Changes billing
                  </p>
                  {!cancelOpen ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setCancelOpen(true);
                        }}
                        disabled={Boolean(cancelBlocked)}
                        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Ban className="h-3.5 w-3.5" aria-hidden />
                        Cancel AutoPay
                      </button>
                      {cancelBlocked ? (
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          Cancel is unavailable: {cancelBlocked}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <CancelForm
                      sub={sub}
                      onDismiss={() => setCancelOpen(false)}
                      onCancelled={(synced) => {
                        setCancelOpen(false);
                        toast.success(
                          synced
                            ? 'AutoPay cancelled at Razorpay.'
                            : 'AutoPay cancelled at Razorpay. The local copy did not refresh; use Sync now to update it.'
                        );
                        reload();
                        onChanged();
                      }}
                    />
                  )}
                </div>

                {actionError ? <ErrorNote message={actionError} /> : null}
              </section>

              {/* ---- Summary ---- */}
              <Section title="Summary">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[160px_1fr]">
                  <Row label="Razorpay subscription">
                    {sub.providerSubscriptionId ? (
                      <CopyId
                        value={sub.providerSubscriptionId}
                        label="Razorpay subscription id"
                      />
                    ) : (
                      'Not created at Razorpay'
                    )}
                  </Row>
                  <Row label="Razorpay plan">
                    <CopyId
                      value={sub.providerPlanId}
                      label="Razorpay plan id"
                    />
                  </Row>
                  <Row label="Razorpay customer">
                    <CopyId
                      value={sub.providerCustomerId}
                      label="Razorpay customer id"
                    />
                  </Row>
                  <Row label="Method">
                    {methodText(sub.paymentMethod, sub.methodSummary)}
                  </Row>
                  <Row label="Next charge">
                    {formatIst(sub.chargeAt, { time: true })}
                  </Row>
                  <Row label="Current cycle">
                    {sub.currentStart || sub.currentEnd
                      ? `${formatIst(sub.currentStart)} to ${formatIst(sub.currentEnd)}`
                      : '—'}
                  </Row>
                  <Row label="Access paid through">
                    {sub.paidThrough
                      ? formatIst(sub.paidThrough, { time: true })
                      : 'No paid access recorded'}
                  </Row>
                  <Row label="Charges">
                    {sub.paidCount ?? 0} paid
                    {sub.totalCount ? ` of ${sub.totalCount}` : ''}
                    {sub.authAttempts
                      ? `, ${sub.authAttempts} failed attempt${sub.authAttempts === 1 ? '' : 's'}`
                      : ''}
                  </Row>
                  <Row label="Created">
                    {formatIst(sub.createdAt, { time: true })}
                  </Row>
                  <Row label="Status changed">
                    {formatIst(sub.statusChangedAt, { time: true })}
                  </Row>
                  <Row label="Last synced">
                    {sub.lastSyncedAt
                      ? formatIst(sub.lastSyncedAt, { time: true })
                      : 'Never'}
                  </Row>
                  <Row label="Last webhook">
                    {sub.lastEventAt
                      ? formatIst(sub.lastEventAt, { time: true })
                      : 'None yet'}
                  </Row>
                  {sub.cancelAtCycleEnd ? (
                    <Row label="Cancel">Set to cancel at cycle end</Row>
                  ) : null}
                  {sub.cancelRequestedAt ? (
                    <Row label="Cancel requested">
                      {formatIst(sub.cancelRequestedAt, { time: true })}
                      {sub.cancelledBy
                        ? ` by ${cancelledByLabel(sub.cancelledBy)}`
                        : ''}
                    </Row>
                  ) : null}
                  {sub.endedAt ? (
                    <Row label="Ended">
                      {formatIst(sub.endedAt, { time: true })}
                    </Row>
                  ) : null}
                  {sub.anomaly ? (
                    <Row label="Anomaly">
                      <span className="text-amber-700">{sub.anomaly}</span>
                    </Row>
                  ) : null}
                  {sub.lastError ? (
                    <Row label="Last error">
                      <span className="break-words text-red-700">
                        {sub.lastError}
                      </span>
                    </Row>
                  ) : null}
                </dl>
              </Section>

              {/* ---- Invoices ---- */}
              <Section title={`Invoices (${data.invoices.length})`}>
                {data.invoices.length === 0 ? (
                  <Empty>No invoices yet.</Empty>
                ) : (
                  <MiniTable
                    head={['Invoice', 'Status', 'Amount', 'Period', 'Paid']}
                    rows={data.invoices.map((inv) => [
                      <CopyId
                        key="id"
                        value={inv.providerInvoiceId}
                        label="invoice id"
                      />,
                      <StatusPill
                        key="s"
                        domain="invoice"
                        status={inv.status}
                      />,
                      formatMinor(inv.amountMinor, inv.currency),
                      inv.billingStart || inv.billingEnd
                        ? `${formatIst(inv.billingStart)} to ${formatIst(inv.billingEnd)}`
                        : '—',
                      formatIst(inv.paidAt),
                    ])}
                  />
                )}
              </Section>

              {/* ---- Payments ---- */}
              <Section title={`Payments (${data.payments.length})`}>
                {data.payments.length === 0 ? (
                  <Empty>No payments yet.</Empty>
                ) : (
                  <MiniTable
                    head={[
                      'Payment',
                      'Charge',
                      'Status',
                      'Amount',
                      'Period',
                      'Method',
                      'When',
                    ]}
                    rows={data.payments.map((p) => [
                      <div key="id" className="space-y-0.5">
                        <CopyId
                          value={p.providerPaymentId}
                          label="payment id"
                        />
                        <RazorpayLink kind="payment" id={p.providerPaymentId} />
                        {p.providerInvoiceId ? (
                          <CopyId
                            value={p.providerInvoiceId}
                            label="invoice id"
                          />
                        ) : null}
                      </div>,
                      <PaymentChargeCell key="c" payment={p} />,
                      <div key="s">
                        <StatusPill domain="payment" status={p.status} />
                        {p.errorCode || p.errorDescription ? (
                          <p className="mt-0.5 max-w-[200px] text-[10px] text-red-600">
                            {[p.errorCode, p.errorReason, p.errorDescription]
                              .filter(Boolean)
                              .join(': ')}
                          </p>
                        ) : null}
                      </div>,
                      <span key="a">
                        {formatMinor(p.amountMinor, p.currency)}
                        {p.amountRefundedMinor > 0 ? (
                          <span className="block text-[10px] text-slate-500">
                            {formatMinor(p.amountRefundedMinor, p.currency)}{' '}
                            refunded
                          </span>
                        ) : null}
                      </span>,
                      adminPaymentPeriodText(p) ?? '—',
                      adminPaymentMethodText(p),
                      formatIst(p.providerCreatedAt ?? p.createdAt, {
                        time: true,
                      }),
                    ])}
                  />
                )}
              </Section>

              {/* ---- Events ---- */}
              <Section title={`Events (${data.events.length})`}>
                {data.events.length === 0 ? (
                  <Empty>No events recorded.</Empty>
                ) : (
                  <ol className="space-y-2.5 border-l border-slate-200 pl-3">
                    {data.events.map((e) => {
                      const { channel } = classifyBillingEvent({
                        eventType: e.eventType,
                        source: e.source,
                        paymentRequestId: e.paymentRequestId,
                        billingSubscriptionId: id,
                        billingPaymentId: e.billingPaymentId,
                        actorUserId: e.actorUserId,
                        actorIsSuperAdmin: false,
                        actorName: e.actorName,
                        actorEmail: null,
                        ownerEmail: null,
                        subMode: sub?.mode ?? null,
                        payMode: null,
                      });
                      const d = describeBillingEvent({
                        eventType: e.eventType,
                        note: e.note,
                      });
                      // This drawer IS the subscription: repeating its id
                      // on every event is noise.
                      const reference =
                        d.reference &&
                        !(
                          d.reference.kind === 'subscription' &&
                          d.reference.id === sub?.providerSubscriptionId
                        )
                          ? d.reference
                          : null;
                      const statusChanged =
                        e.fromStatus &&
                        e.toStatus &&
                        e.fromStatus !== e.toStatus;
                      return (
                        <li key={e.id} className="space-y-0.5 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-800">
                              {billingEventLabel(e.eventType)}
                            </span>
                            <ChannelBadge channel={channel} size="sm" />
                          </div>
                          <p className="text-slate-600">{d.text}</p>
                          {statusChanged ? (
                            <p className="text-[11px] text-slate-500">
                              Workspace {accountStatusLabel(e.fromStatus)} to{' '}
                              {accountStatusLabel(e.toStatus)}
                            </p>
                          ) : null}
                          {d.note ? (
                            <p className="text-[11px] break-words text-slate-500">
                              <span className="font-medium">Note:</span>{' '}
                              {d.note}
                            </p>
                          ) : null}
                          {reference ? (
                            <CopyId value={reference.id} label="reference" />
                          ) : null}
                          <p className="text-[11px] text-slate-400">
                            {formatIst(e.createdAt, { time: true })}
                            {' · '}
                            {e.actorName ??
                              (e.actorUserId
                                ? 'Unknown user'
                                : sourceInitiatorLabel(e.source))}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Section>

              {/* ---- Webhook events ---- */}
              <Section title={`Webhook events (${data.webhookEvents.length})`}>
                {data.webhookEvents.length === 0 ? (
                  <Empty>No webhook events name this subscription.</Empty>
                ) : (
                  <MiniTable
                    head={['Received', 'Event', 'Status', 'Attempts']}
                    rows={data.webhookEvents.map((w) => [
                      formatIst(w.receivedAt, { time: true }),
                      <div key="e">
                        <p className="font-medium">
                          {webhookEventLabel(w.eventType)}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {w.eventType}
                        </p>
                        <CopyId value={w.providerEventId} label="event id" />
                      </div>,
                      <div key="s">
                        <StatusPill domain="webhook" status={w.status} />
                        {w.lastError ? (
                          <p className="mt-0.5 max-w-[220px] text-[10px] break-words text-red-600">
                            {w.lastError}
                          </p>
                        ) : null}
                      </div>,
                      `${w.attempts}${w.requeueCount ? `, re-queued ${w.requeueCount}x` : ''}`,
                    ])}
                  />
                )}
              </Section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------

function CancelForm({
  sub,
  onDismiss,
  onCancelled,
}: {
  sub: AdminSubscriptionDetailRow;
  onDismiss: () => void;
  onCancelled: (synced: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;
  const ready =
    reasonOk &&
    password.length > 0 &&
    understood &&
    (!needsCode || code.trim().length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await postJson<{
      alreadyCancelled: boolean;
      synced: boolean;
    }>(
      `/api/super-admin/billing/razorpay/subscriptions/${encodeURIComponent(sub.id)}/cancel`,
      {
        password,
        code: needsCode ? code.trim() : undefined,
        reason: reason.trim(),
        confirm: true,
      }
    );
    setBusy(false);
    if (!res.ok) {
      if (
        res.code === 'two_factor_code_required' ||
        res.code === 'invalid_two_factor_code'
      ) {
        setNeedsCode(true);
      }
      setError(res.message);
      return;
    }
    onCancelled(res.data.synced);
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-3">
      <p className="flex items-start gap-2 text-xs text-slate-700">
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
          aria-hidden
        />
        <span>
          Cancelling stops AutoPay {sub.providerSubscriptionId} at Razorpay
          straight away. Paid access already granted is not changed. The
          customer is emailed and would have to set up AutoPay again.
        </span>
      </p>

      <div>
        <label
          htmlFor="rzp-cancel-reason"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Reason (kept in the audit log)
        </label>
        <textarea
          id="rzp-cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="For example: customer asked by email to stop AutoPay"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-none"
        />
        {reason.length > 0 && !reasonOk ? (
          <p className="mt-0.5 text-[11px] text-slate-500">
            At least 5 characters.
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="rzp-cancel-password"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Your password
        </label>
        <Input
          id="rzp-cancel-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 border-slate-200 bg-white text-xs text-slate-900"
        />
      </div>

      {needsCode ? (
        <div>
          <label
            htmlFor="rzp-cancel-code"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Authenticator code
          </label>
          <Input
            id="rzp-cancel-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-9 w-40 border-slate-200 bg-white text-xs text-slate-900"
          />
        </div>
      ) : null}

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
        />
        I understand this stops AutoPay at Razorpay immediately and cannot be
        undone.
      </label>

      {error ? <ErrorNote message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!ready || busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Ban className="h-3.5 w-3.5" aria-hidden />
          )}
          Cancel AutoPay at Razorpay
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Keep AutoPay
        </button>
      </div>
    </form>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs break-words text-red-700"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-800">{children}</dd>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-400">{children}</p>;
}

function MiniTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              {cells.map((c, j) => (
                <td key={j} className={cn('px-2.5 py-1.5 text-slate-700')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
