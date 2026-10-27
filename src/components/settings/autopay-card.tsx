'use client';

// ============================================================
// Settings → Billing & plan → AutoPay (plan section 8.3).
//
// `AutopayCardView` is presentational: every status label comes from
// mapping.ts (section 3.5 wording), so it renders the same words as the
// payment page and the emails, and it can be rendered for every state in
// a test. `AutopayCard` wires it to the API.
//
// Actions by state (owner only; members see the same facts read-only):
//   authorised / active / retrying   Cancel AutoPay; Change card (cards)
//   stopped (halted) / paused        Renew (replaces it); Cancel AutoPay
//   cancelled / completed            Set up AutoPay again
//   not finished                     Finish setting up
//   not set up (Phase 6 opt-in)      "You're paid until X" prompt from
//                                    opt-in.ts; Set up AutoPay
//
// Every date is IST, like the charges themselves.
// ============================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { openRazorpayCheckout } from '@/components/billing/razorpay-checkout';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useSubscription } from '@/hooks/use-subscription';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import { renewHref } from '@/lib/billing/razorpay/links';
import { autopayOptIn, type AutopayOptIn } from '@/lib/billing/razorpay/opt-in';
import type { AutopayDisplayKey } from '@/lib/billing/razorpay/mapping';
import { fromMinor } from '@/lib/billing/razorpay/money';
import type { AutopayView } from '@/lib/billing/razorpay/view';
import { formatPlanAmount } from '@/lib/billing/money-format';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'muted';

const TONE: Record<Tone, string> = {
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  info: 'bg-primary/15 text-primary',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

const KEY_TONE: Record<AutopayDisplayKey, Tone> = {
  hidden: 'muted',
  checkout_incomplete: 'muted',
  autopay_authorised: 'info',
  payment_pending: 'warning',
  subscription_active: 'success',
  cancel_scheduled: 'muted',
  payment_failed_retrying: 'warning',
  action_needed: 'danger',
  autopay_paused: 'warning',
  autopay_cancelled: 'muted',
  subscription_completed: 'muted',
};

const KEY_ICON: Record<AutopayDisplayKey, React.ElementType> = {
  hidden: ShieldCheck,
  checkout_incomplete: CreditCard,
  autopay_authorised: ShieldCheck,
  payment_pending: Loader2,
  subscription_active: CheckCircle2,
  cancel_scheduled: CalendarClock,
  payment_failed_retrying: AlertTriangle,
  action_needed: AlertTriangle,
  autopay_paused: PauseCircle,
  autopay_cancelled: XCircle,
  subscription_completed: CheckCircle2,
};

function amountOf(a: AutopayView): string {
  try {
    return formatPlanAmount(fromMinor(a.amountMinor, a.currency), a.currency);
  } catch {
    return '';
  }
}

export function methodLabel(method: AutopayView['method']): string | null {
  if (!method) return null;
  if (method.vpaMasked) return `UPI ${method.vpaMasked}`;
  if (method.last4) return `${method.network ?? 'Card'} •••• ${method.last4}`;
  if (method.type === 'upi') return 'UPI';
  if (method.type === 'card') return 'Card';
  return null;
}

/** The one sentence under the status that says what happens next. */
function explainer(a: AutopayView): string {
  const amount = amountOf(a);
  const next = formatBillingDate(a.nextChargeAt ?? a.firstChargeAt);
  switch (a.display.key) {
    case 'autopay_authorised':
      return next
        ? `Nothing has been charged yet. Your first charge${amount ? ` of ${amount}` : ''} is on ${next}.`
        : 'Nothing has been charged yet.';
    case 'payment_pending':
      return `A charge${amount ? ` of ${amount}` : ''} is due and being collected. This can take a few hours for UPI.`;
    case 'subscription_active':
      return next
        ? `Renews automatically on ${next}${amount ? ` for ${amount}` : ''}.`
        : 'Renews automatically.';
    case 'payment_failed_retrying':
      return 'Razorpay will try again automatically over the next few days. Your access continues while it retries.';
    case 'action_needed':
      return 'AutoPay stopped after several failed attempts, so nothing more will be charged. Renew to keep your access.';
    case 'autopay_paused':
      return 'Renewals will not be charged while AutoPay is paused. If you paused it in your UPI app, resume it there, or set up a new AutoPay here.';
    case 'autopay_cancelled':
      return 'No further charges will be made. You keep access until the end of the time already paid for.';
    case 'subscription_completed':
      return 'Every scheduled billing cycle has been charged. Set up AutoPay again to continue.';
    case 'cancel_scheduled':
      return 'AutoPay ends at the end of the current period. No further charges after that.';
    case 'checkout_incomplete':
      return 'You started setting up AutoPay but did not finish, so nothing is authorised and nothing will be charged.';
    default:
      return '';
  }
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium">{value}</dd>
    </div>
  );
}

const primary =
  'bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60';
const secondary =
  'border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60';
const danger =
  'border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60';

export interface AutopayCardViewProps {
  autopay: AutopayView | null;
  isOwner: boolean;
  busy?: 'cancel' | 'method' | null;
  error?: string | null;
  onCancel?: () => void;
  onChangeMethod?: () => void;
  /** Phase 6 opt-in prompt for the not-set-up state (paid, trial, lapsed). */
  optIn?: AutopayOptIn | null;
}

export function AutopayCardView({
  autopay: a,
  isOwner,
  busy = null,
  error = null,
  onCancel,
  onChangeMethod,
  optIn = null,
}: AutopayCardViewProps) {
  const isBusy = busy !== null;

  if (!a) {
    return (
      <section
        aria-labelledby="autopay-heading"
        className="border-border bg-card rounded-xl border p-6"
      >
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary inline-flex size-9 shrink-0 items-center justify-center rounded-full">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3
              id="autopay-heading"
              className="text-foreground text-base font-semibold"
            >
              AutoPay
            </h3>
            {optIn && optIn.kind !== 'none' ? (
              <>
                <p
                  className="text-foreground mt-1 text-sm font-medium"
                  data-testid="autopay-optin-headline"
                >
                  {optIn.headline}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {optIn.detail}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                Not set up. With AutoPay, renewals are charged automatically to
                your card or UPI until you cancel.
              </p>
            )}
          </div>
        </div>
        {isOwner ? (
          <div className="mt-4">
            <Link href="/upgrade-plan" className={primary}>
              <ShieldCheck className="size-4" aria-hidden />
              Set up AutoPay
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Only the workspace owner can change billing.
          </p>
        )}
      </section>
    );
  }

  const key = a.display.key;
  const Icon = KEY_ICON[key];
  const tone = KEY_TONE[key];
  const amount = amountOf(a);
  const method = methodLabel(a.method);
  const charging = a.hasMandate;
  const ended = key === 'autopay_cancelled' || key === 'subscription_completed';

  return (
    <section
      aria-labelledby="autopay-heading"
      className="border-border bg-card overflow-hidden rounded-xl border"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-full',
              TONE[tone]
            )}
          >
            <Icon
              className={cn(
                'size-4',
                key === 'payment_pending' && 'animate-spin'
              )}
              aria-hidden
            />
          </span>
          <div className="min-w-0">
            <h3
              id="autopay-heading"
              className="text-foreground text-base font-semibold"
            >
              AutoPay
            </h3>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {explainer(a)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
            TONE[tone]
          )}
          data-testid="autopay-status"
        >
          {a.display.label}
        </span>
      </div>

      {a.lastFailure &&
      (key === 'payment_failed_retrying' ||
        key === 'action_needed' ||
        key === 'checkout_incomplete') ? (
        <p
          role="alert"
          className="border-destructive/20 bg-destructive/5 text-foreground mx-6 mt-4 rounded-lg border px-3 py-2 text-sm"
        >
          Last attempt: {a.lastFailure}
        </p>
      ) : null}

      <dl className="mx-6 mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row
          label="Plan"
          value={[a.planName, a.cycleLabel].filter(Boolean).join(' · ')}
        />
        <Row
          label="Amount"
          value={amount ? `${amount} every ${a.durationDays} days` : null}
        />
        <Row label="Pays with" value={method} />
        {charging ? (
          <Row
            label={
              key === 'autopay_authorised' ? 'First charge' : 'Next charge'
            }
            value={formatBillingDate(a.nextChargeAt ?? a.firstChargeAt) || null}
          />
        ) : null}
        {key === 'subscription_active' ? (
          <Row
            label="Paid through"
            value={formatBillingDate(a.currentPeriodEnd) || null}
          />
        ) : null}
      </dl>

      <div className="border-border mt-5 border-t px-6 py-4">
        {!isOwner ? (
          <p className="text-muted-foreground text-sm">
            Only the workspace owner can change billing.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {a.canReplace ? (
              <Link href={renewHref(a)} className={primary}>
                <RefreshCw className="size-4" aria-hidden />
                {key === 'action_needed' ? 'Renew now' : 'Set up a new AutoPay'}
              </Link>
            ) : null}
            {key === 'checkout_incomplete' ? (
              <Link href={renewHref(a)} className={primary}>
                <ShieldCheck className="size-4" aria-hidden />
                Finish setting up
              </Link>
            ) : null}
            {ended ? (
              <Link href="/upgrade-plan" className={primary}>
                <ShieldCheck className="size-4" aria-hidden />
                Set up AutoPay again
              </Link>
            ) : null}
            {charging && a.method?.type === 'card' ? (
              <button
                type="button"
                onClick={onChangeMethod}
                disabled={isBusy}
                className={secondary}
              >
                {busy === 'method' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CreditCard className="size-4" aria-hidden />
                )}
                Change card
              </button>
            ) : null}
            {charging || a.canReplace ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className={danger}
              >
                {busy === 'cancel' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Cancel AutoPay
              </button>
            ) : null}
            {charging &&
            a.method?.type === 'upi' &&
            key === 'payment_failed_retrying' ? (
              <p className="text-muted-foreground w-full text-xs">
                Make sure your UPI account has enough balance for the retry. To
                pay with a different UPI ID or a card, cancel AutoPay and set it
                up again.
              </p>
            ) : null}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface ApiError {
  error?: string;
  code?: string;
}

async function postJson<T>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; data: T & ApiError }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  return { ok: res.ok, data };
}

/** Wired card for the Billing tab. Renders nothing where AutoPay is not offered. */
export function AutopayCard() {
  const router = useRouter();
  const confirm = useConfirm();
  const { data, refresh } = useSubscription();
  const [busy, setBusy] = useState<'cancel' | 'method' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data || data.state.billingDisabled) return null;
  const autopay = data.autopay ?? null;
  // Production today: manual UPI and no AutoPay history. Show nothing,
  // so the page is exactly as before for those customers.
  if (!autopay && data.paymentProvider !== 'razorpay') return null;

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel AutoPay?',
      description:
        data.autopayCancelNote ??
        'Cancelling stops future charges. Your access continues until the end of the time already paid for. Payments already made are not refunded.',
      confirmText: 'Cancel AutoPay',
      cancelText: 'Keep AutoPay',
      variant: 'destructive',
      icon: XCircle,
    });
    if (!ok) return;
    setBusy('cancel');
    setError(null);
    try {
      const { ok: done, data: body } = await postJson(
        '/api/billing/razorpay/cancel',
        { confirm: true }
      );
      if (!done) {
        setError(body.error ?? 'Could not cancel AutoPay. Please try again.');
        return;
      }
      toast.success('AutoPay cancelled. No further charges will be made.');
      await refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleChangeMethod = async () => {
    setBusy('method');
    setError(null);
    try {
      const { ok, data: body } = await postJson<{
        action: 'card_change' | 'renew' | 'unsupported';
        keyId?: string;
        subscriptionId?: string;
        planId?: string | null;
        cycleId?: string | null;
        message?: string;
        checkout?: {
          name: string;
          description: string;
          notes?: Record<string, string>;
          prefill: { name?: string; email?: string; contact?: string };
        };
      }>('/api/billing/razorpay/payment-method', {});
      if (!ok) {
        setError(
          body.error ?? 'Could not start the card change. Please try again.'
        );
        return;
      }
      if (body.action === 'renew') {
        router.push(
          renewHref({
            planId: body.planId ?? null,
            cycleId: body.cycleId ?? null,
          })
        );
        return;
      }
      if (
        body.action !== 'card_change' ||
        !body.keyId ||
        !body.subscriptionId ||
        !body.checkout
      ) {
        setError(body.message ?? 'This payment method cannot be changed here.');
        return;
      }
      const outcome = await openRazorpayCheckout({
        keyId: body.keyId,
        subscriptionId: body.subscriptionId,
        name: body.checkout.name,
        description: body.checkout.description,
        prefill: body.checkout.prefill,
        notes: body.checkout.notes,
        cardChange: true,
      });
      if (outcome.kind === 'dismissed') {
        toast.info('Card not changed.');
        return;
      }
      const verified = await postJson(
        '/api/billing/razorpay/verify',
        outcome.response
      );
      if (!verified.ok) {
        setError(
          verified.data.error ??
            'We could not confirm the new card. Please check again in a minute.'
        );
        return;
      }
      toast.success('Card updated. Future charges use the new card.');
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not open Razorpay Checkout.'
      );
    } finally {
      setBusy(null);
    }
  };

  const optIn = autopay
    ? null
    : autopayOptIn({
        paymentProvider: data.paymentProvider,
        hasMandate: false,
        state: data.state,
      });

  return (
    <AutopayCardView
      autopay={autopay}
      optIn={optIn}
      isOwner={data.isOwner}
      busy={busy}
      error={error}
      onCancel={() => void handleCancel()}
      onChangeMethod={() => void handleChangeMethod()}
    />
  );
}
