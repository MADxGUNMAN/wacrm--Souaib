'use client';

// ============================================================
// Razorpay AutoPay payment step (Enterprise High-Trust Redesign).
//
// Dual-column responsive FinTech checkout:
//   - Left: Value reassurance, transparent 3-step visual billing
//           journey, RBI compliance & enterprise security pillars.
//   - Right: Financial ledger breakdown, interactive mandate consent
//            card, authoritative Razorpay action CTA.
//
// Preserves all server-decided pricing, dates, verification and polling.
// ============================================================

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import { UpgradeHeader } from '@/components/billing/upgrade-header';
import {
  openRazorpayCheckout,
  type CheckoutSuccess,
} from '@/components/billing/razorpay-checkout';
import { useSubscription } from '@/hooks/use-subscription';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import { customerFailureMessage } from '@/lib/billing/razorpay/mapping';
import { fromMinor } from '@/lib/billing/razorpay/money';
import {
  classifyAutopay,
  type CheckoutResult,
} from '@/lib/billing/razorpay/outcome';
import type { CheckoutDisplay } from '@/lib/billing/razorpay/service';
import type { AutopayView } from '@/lib/billing/razorpay/view';
import { formatPlanAmount } from '@/lib/billing/money-format';
import { createClient } from '@/lib/supabase/client';

/** Status poll interval while a payment confirms. */
const POLL_MS = 4_000;
/** Stop polling after this long and say so, rather than spin forever. */
const POLL_LIMIT_MS = 120_000;

interface StartResponse {
  keyId: string;
  subscriptionId: string;
  reused: boolean;
  display: CheckoutDisplay;
  checkout: {
    name: string;
    description: string;
    notes?: Record<string, string>;
    prefill: { name?: string; email?: string; contact?: string };
  };
}

interface VerifyResponse {
  paymentOutcome: string;
  autopay: AutopayView | null;
}

interface ApiError {
  error?: string;
  code?: string;
}

type Step = 'idle' | 'starting' | 'checkout' | 'verifying';

const STEP_TEXT: Record<Step, string> = {
  idle: '',
  starting: 'Establishing 256-bit secure checkout…',
  checkout: 'Razorpay Checkout window is open.',
  verifying: 'Confirming authorization with bank…',
};

function amountOf(autopay: AutopayView): string {
  try {
    return formatPlanAmount(
      fromMinor(autopay.amountMinor, autopay.currency),
      autopay.currency
    );
  } catch {
    return '';
  }
}

function methodLabel(method: AutopayView['method']): string | null {
  if (!method) return null;
  if (method.vpaMasked) return `UPI (${method.vpaMasked})`;
  const name = method.network ?? method.type;
  if (method.last4) return `${name ?? 'Card'} ending in ${method.last4}`;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

async function readJson<T>(res: Response): Promise<T & ApiError> {
  return (await res.json().catch(() => ({}))) as T & ApiError;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-right text-xs font-semibold">
        {value}
      </dd>
    </div>
  );
}

function AutopayDetails({ autopay }: { autopay: AutopayView }) {
  const amount = amountOf(autopay);
  const method = methodLabel(autopay.method);
  return (
    <dl className="border-border/60 bg-muted/30 mt-6 space-y-1.5 rounded-2xl border p-4 text-xs">
      <Row
        label="Subscription Plan"
        value={`${autopay.planName} · ${autopay.cycleLabel}`}
      />
      {amount ? (
        <Row
          label="Recurring Rate"
          value={`${amount} every ${autopay.durationDays} days`}
        />
      ) : null}
      {autopay.currentPeriodEnd && autopay.status === 'active' ? (
        <Row
          label="Access Active Through"
          value={formatBillingDate(autopay.currentPeriodEnd)}
        />
      ) : null}
      {autopay.nextChargeAt || autopay.firstChargeAt ? (
        <Row
          label="Next Charge Date"
          value={formatBillingDate(
            autopay.nextChargeAt ?? autopay.firstChargeAt
          )}
        />
      ) : null}
      {method ? <Row label="Payment Instrument" value={method} /> : null}
    </dl>
  );
}

function Shell({
  children,
  backToPlans = true,
  maxWidth = 'max-w-md',
}: {
  children: ReactNode;
  backToPlans?: boolean;
  maxWidth?: string;
}) {
  return (
    <div className="bg-background selection:bg-primary/20 relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Subtle ambient illumination at the top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-25 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, var(--primary) 0%, transparent 80%)',
        }}
        aria-hidden
      />
      <UpgradeHeader
        backButton={
          backToPlans ? { href: '/upgrade-plan', label: 'Back to plans' } : null
        }
      />
      <main className="relative z-10 flex flex-1 items-center justify-center p-3 sm:p-4">
        <div className={`w-full ${maxWidth}`}>{children}</div>
      </main>
    </div>
  );
}

const primaryButton =
  'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButton =
  'border-border/80 bg-card/80 text-foreground hover:bg-muted hover:border-border inline-flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all shadow-xs';

export function RazorpayPayment({
  planId,
  cycleId,
}: {
  planId: string | null;
  cycleId: string | null;
}) {
  const router = useRouter();
  const { data: subscription, refresh } = useSubscription();

  const [display, setDisplay] = useState<CheckoutDisplay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);
  const [manualPending, setManualPending] = useState(false);

  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const hasIds = Boolean(planId && cycleId);
  const isOwner = subscription?.isOwner !== false;
  const existing = subscription?.autopay ?? null;
  const showExisting =
    !result && (alreadySetUp || existing?.hasMandate === true);

  // ---- Signed out in this or another tab: leave the payment screen ----
  useEffect(() => {
    const supabase = createClient();
    const toLogin = () => window.location.replace('/login');
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) toLogin();
    });
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) toLogin();
    });
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) toLogin();
      });
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      authSub.unsubscribe();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // ---- Who may be here ----
  useEffect(() => {
    if (subscription && !subscription.isOwner) {
      router.replace('/subscription-required');
    } else if (!hasIds && !showExisting && !result) {
      router.replace('/upgrade-plan');
    }
  }, [subscription, hasIds, showExisting, result, router]);

  // ---- Preview: what pressing the button will do ----
  useEffect(() => {
    if (!planId || !cycleId || !isOwner || showExisting) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/billing/razorpay/checkout?planId=${encodeURIComponent(planId)}&cycleId=${encodeURIComponent(cycleId)}`,
          { cache: 'no-store' }
        );
        const body = await readJson<{ display: CheckoutDisplay }>(res);
        if (!active) return;
        if (!res.ok) {
          if (body.code === 'owner_only') {
            router.replace('/subscription-required');
            return;
          }
          setManualPending(body.code === 'manual_payment_pending');
          setLoadError(body.error ?? 'Could not prepare your payment.');
          return;
        }
        setDisplay(body.display);
        setLoadError(null);
      } catch {
        if (active)
          setLoadError('Could not reach the server. Please try again.');
      }
    })();
    return () => {
      active = false;
    };
  }, [planId, cycleId, isOwner, showExisting, router]);

  // ---- Poll while a payment confirms ----
  const processing = result?.kind === 'processing';
  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const res = await fetch('/api/billing/razorpay/status', {
          cache: 'no-store',
        });
        if (res.ok) {
          const body = await readJson<{ autopay: AutopayView | null }>(res);
          const next = classifyAutopay(body.autopay ?? null);
          if (!cancelled && next) {
            setResult(next);
            return;
          }
        }
      } catch {
        // Network blip: keep polling until the time limit.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        setResult({ kind: 'still_processing' });
        return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [processing]);

  // ---- A final answer: refresh the shared snapshot, move focus ----
  const resultKind = result?.kind ?? null;
  useEffect(() => {
    if (!resultKind) return;
    if (resultKind === 'paid' || resultKind === 'authorised') void refresh();
    headingRef.current?.focus();
  }, [resultKind, refresh]);

  const verify = useCallback(async (response: CheckoutSuccess) => {
    setStep('verifying');
    try {
      const res = await fetch('/api/billing/razorpay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      const body = await readJson<VerifyResponse>(res);
      if (res.ok) {
        setResult(
          classifyAutopay(body.autopay ?? null, body.paymentOutcome) ?? {
            kind: 'processing',
          }
        );
        return;
      }
      if (res.status === 400) {
        setResult({
          kind: 'failed',
          reason: body.error ?? 'We could not verify this payment response.',
          paymentId: response.razorpay_payment_id,
        });
        return;
      }
      setResult({ kind: 'processing' });
    } catch {
      setResult({ kind: 'processing' });
    } finally {
      setStep('idle');
    }
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current || !planId || !cycleId || !consented) return;
    busyRef.current = true;
    setActionError(null);
    setStep('starting');
    try {
      const res = await fetch('/api/billing/razorpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, cycleId }),
      });
      const body = await readJson<StartResponse>(res);
      if (!res.ok) {
        if (body.code === 'owner_only') {
          router.replace('/subscription-required');
          return;
        }
        if (body.code === 'autopay_exists') {
          setAlreadySetUp(true);
          void refresh();
          return;
        }
        setManualPending(body.code === 'manual_payment_pending');
        setActionError(
          body.error ?? 'Could not start checkout. Please try again.'
        );
        return;
      }
      setDisplay(body.display);

      setStep('checkout');
      const outcome = await openRazorpayCheckout({
        keyId: body.keyId,
        subscriptionId: body.subscriptionId,
        name: body.checkout.name,
        description: body.checkout.description,
        prefill: body.checkout.prefill,
        notes: body.checkout.notes,
        image: `${window.location.origin}/razorpay-checkout-logo.png`,
      });

      if (outcome.kind === 'dismissed') {
        const f = outcome.lastFailure;
        setResult({
          kind: 'not_completed',
          reason: f ? customerFailureMessage(f.code, f.reason) : null,
        });
        return;
      }
      await verify(outcome.response);
    } catch (err) {
      setActionError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not open Razorpay Checkout. Please try again.'
      );
    } finally {
      busyRef.current = false;
      setStep('idle');
    }
  }, [planId, cycleId, consented, router, refresh, verify]);

  const tryAgain = useCallback(() => {
    setResult(null);
    setActionError(null);
    setStep('idle');
  }, []);

  const canUseDashboard = subscription ? !subscription.state.isBlocked : false;
  const supportNote = subscription?.copy.supportNote ?? null;
  const support = (
    <div className="border-border/60 text-muted-foreground mt-5 flex items-start gap-2.5 border-t pt-4 text-xs leading-relaxed">
      <HelpCircle className="text-primary/70 mt-0.5 size-4 shrink-0" />
      <div>
        <span className="text-foreground font-medium">
          Need immediate assistance?
        </span>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {supportNote && !supportNote.toLowerCase().includes('utr')
            ? supportNote
            : 'Our dedicated billing concierge is available 24/7 at support@junkiescoder.com.'}
        </p>
      </div>
    </div>
  );

  const manualPendingLink =
    manualPending && canUseDashboard ? (
      <Link
        href="/settings?tab=billing"
        className="text-primary hover:text-primary/90 mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4"
      >
        <span>View payment status in Billing</span>
        <ArrowRight className="size-3.5" />
      </Link>
    ) : null;
  const refundPolicyHref = subscription?.copy.refundPolicyHref ?? null;

  // ================= Result screens =================

  if (result?.kind === 'paid' || result?.kind === 'authorised') {
    const paid = result.kind === 'paid';
    const autopay = result.autopay;
    const firstCharge =
      autopay?.firstChargeAt ?? display?.firstChargeAt ?? null;
    return (
      <Shell backToPlans={false} maxWidth="max-w-[460px]">
        <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
          <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative">
            {/* Header */}
            <div className="border-border/60 flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="size-4.5" />
                </div>
                <div>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-foreground text-sm font-bold tracking-tight outline-none"
                  >
                    {paid ? 'Payment Confirmed' : 'AutoPay Registered'}
                  </h1>
                  <p className="text-muted-foreground text-[11px]">
                    {paid ? 'Subscription active' : 'Mandate active & linked'}
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 uppercase dark:text-emerald-400">
                Active
              </span>
            </div>

            <p className="text-muted-foreground my-4 text-xs leading-relaxed">
              {paid
                ? 'Your workspace subscription is fully active. Subsequent renewal charges will be handled automatically on schedule until you cancel.'
                : `No charge was deducted today. Your scheduled recurring rate starts on ${formatBillingDate(firstCharge)}, aligning with your existing access.`}
            </p>

            {autopay ? <AutopayDetails autopay={autopay} /> : null}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className={`${primaryButton} py-3 text-sm font-semibold`}
              >
                <span>Launch Workspace Dashboard</span>
                <ArrowRight className="size-4" aria-hidden />
              </button>
              <Link
                href="/settings?tab=billing"
                className={`${secondaryButton} py-2.5 text-xs font-medium`}
              >
                <span>Review Billing Settings</span>
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (result?.kind === 'processing' || result?.kind === 'still_processing') {
    const still = result.kind === 'still_processing';
    return (
      <Shell backToPlans={false} maxWidth="max-w-[460px]">
        <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
          <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative">
            {/* Header */}
            <div className="border-border/60 flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500">
                  <Clock className="size-4.5" />
                </div>
                <div>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-foreground text-sm font-bold tracking-tight outline-none"
                  >
                    {still
                      ? 'Awaiting Bank Callback'
                      : 'Verifying with Razorpay'}
                  </h1>
                  <p className="text-muted-foreground text-[11px]">
                    Securing payment gateway verification
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 uppercase dark:text-amber-400">
                Processing
              </span>
            </div>

            <p
              className="text-muted-foreground my-4 text-xs leading-relaxed"
              role="status"
              aria-live="polite"
            >
              {still
                ? 'Your issuing bank has registered the mandate but hasn’t posted the final status callback. Your CRM account will update automatically as soon as the webhook lands. Please do not re-authorize.'
                : 'We are securely verifying the mandate with your bank and Razorpay. This typically takes 5–10 seconds.'}
            </p>

            {still ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setResult({ kind: 'processing' })}
                  className={`${primaryButton} py-3 text-sm font-semibold`}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  <span>Check Verification Status</span>
                </button>
                <Link
                  href="/settings?tab=billing"
                  className={`${secondaryButton} py-2.5 text-xs font-medium`}
                >
                  <span>Go to Billing Overview</span>
                </Link>
              </div>
            ) : (
              <div className="border-border/60 bg-muted/30 my-4 flex items-center gap-3 rounded-xl border p-3.5 text-xs font-medium">
                <Loader2
                  className="text-primary size-4 shrink-0 animate-spin"
                  aria-hidden
                />
                <span className="text-muted-foreground">
                  Polling live status from banking gateway...
                </span>
              </div>
            )}
            {support}
          </div>
        </div>
      </Shell>
    );
  }

  if (result?.kind === 'not_completed') {
    return (
      <Shell maxWidth="max-w-[460px]">
        <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
          {/* Header */}
          <div className="border-border/60 flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500">
                <RotateCcw className="size-4" />
              </div>
              <div>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-foreground text-sm font-bold tracking-tight outline-none"
                >
                  Payment Window Closed
                </h1>
                <p className="text-muted-foreground text-[11px]">
                  No charge was made to your account
                </p>
              </div>
            </div>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 uppercase dark:text-amber-400">
              Session Saved
            </span>
          </div>

          {/* Reassurance Banner */}
          <div className="my-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div>
                <span className="text-foreground font-semibold">
                  Zero Funds Captured
                </span>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  The checkout dialog was closed before completing
                  authorization. Your existing access and trial days remain 100%
                  active.
                </p>
              </div>
            </div>
          </div>

          {/* Pending Plan Context */}
          {display ? (
            <div className="border-border/60 bg-muted/20 mb-4 rounded-xl border p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Pending Plan:</span>
                <span className="text-foreground font-semibold">
                  {display.planName} · {display.cycleLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Recurring Rate:</span>
                <span className="text-foreground font-mono">
                  {formatPlanAmount(display.amount, display.currency)} every{' '}
                  {display.durationDays} days
                </span>
              </div>
              <div className="border-border/40 mt-2 flex items-center justify-between border-t pt-2 text-[11px]">
                <span className="text-muted-foreground">Total Due Today:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {display.mode === 'authorise'
                    ? display.currency === 'INR'
                      ? '₹0.00 (Free Setup)'
                      : `${formatPlanAmount(0, display.currency)} (Free Setup)`
                    : formatPlanAmount(display.amount, display.currency)}
                </span>
              </div>
            </div>
          ) : null}

          {result.reason ? (
            <div className="border-border/60 bg-muted/40 mb-4 rounded-xl border p-3 text-xs leading-relaxed">
              <span className="text-foreground font-semibold">
                Gateway note:{' '}
              </span>
              <span className="text-muted-foreground">{result.reason}</span>
            </div>
          ) : null}

          {/* Action CTAs */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={tryAgain}
              className={`${primaryButton} py-3 text-sm font-semibold`}
            >
              <RotateCcw className="size-4" aria-hidden />
              <span>Resume & Complete Setup</span>
            </button>
            <Link
              href="/upgrade-plan"
              className={`${secondaryButton} py-2.5 text-xs font-medium`}
            >
              <span>Choose a Different Plan</span>
            </Link>
          </div>

          {/* Support Concierge */}
          {support}
        </div>
      </Shell>
    );
  }

  if (result?.kind === 'failed') {
    return (
      <Shell maxWidth="max-w-[460px]">
        <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
          <div className="bg-destructive/10 pointer-events-none absolute -top-24 -right-24 size-48 rounded-full blur-3xl" />
          <div className="relative">
            {/* Header */}
            <div className="border-border/60 flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="border-destructive/30 bg-destructive/10 text-destructive flex size-8 items-center justify-center rounded-lg border">
                  <TriangleAlert className="size-4" />
                </div>
                <div>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-foreground text-sm font-bold tracking-tight outline-none"
                  >
                    Payment Could Not Be Processed
                  </h1>
                  <p className="text-muted-foreground text-[11px]">
                    Bank or gateway declined authorization
                  </p>
                </div>
              </div>
              <span className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase">
                Declined
              </span>
            </div>

            {/* Failure Alert Banner */}
            <div
              className="border-destructive/20 bg-destructive/[0.06] my-4 rounded-xl border p-3 text-xs leading-relaxed"
              role="alert"
            >
              <p className="text-foreground/90 font-medium">
                {result.reason ??
                  'Your issuing bank or payment gateway declined this authorization attempt. No charges were captured.'}
              </p>
            </div>

            {result.paymentId ? (
              <div className="border-border/60 bg-muted/20 mb-4 flex items-center justify-between rounded-xl border p-3 text-xs">
                <span className="text-muted-foreground">
                  Gateway Reference:
                </span>
                <span className="text-foreground font-mono font-semibold tracking-wider">
                  {result.paymentId}
                </span>
              </div>
            ) : null}

            {/* Action CTAs */}
            <div className="space-y-2">
              {result.paymentId ? (
                <button
                  type="button"
                  onClick={() => setResult({ kind: 'processing' })}
                  className={`${primaryButton} py-3 text-sm font-semibold`}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  <span>Verify Status with Gateway</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={tryAgain}
                  className={`${primaryButton} py-3 text-sm font-semibold`}
                >
                  <RotateCcw className="size-4" />
                  <span>Try With Another Method / Card</span>
                </button>
              )}
              <Link
                href="/upgrade-plan"
                className={`${secondaryButton} py-2.5 text-xs font-medium`}
              >
                <span>Choose a Different Plan</span>
              </Link>
            </div>

            {/* Support Concierge */}
            {support}
          </div>
        </div>
      </Shell>
    );
  }

  // ================= AutoPay already exists =================

  if (showExisting) {
    return (
      <Shell maxWidth="max-w-[460px]">
        <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
          {/* Header */}
          <div className="border-border/60 flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <div className="border-primary/20 bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg border">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <h1 className="text-foreground text-sm font-bold tracking-tight">
                  AutoPay is Already Active
                </h1>
                <p className="text-muted-foreground text-[11px]">
                  Recurring subscription is configured
                </p>
              </div>
            </div>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase dark:text-emerald-400">
              Active
            </span>
          </div>

          <p className="text-muted-foreground my-4 text-xs leading-relaxed">
            {existing ? (
              <>
                Current mandate state:{' '}
                <span className="text-foreground font-semibold">
                  {existing.display.label}
                </span>
                .{' '}
              </>
            ) : null}
            {canUseDashboard
              ? 'Your recurring subscription is already configured. Future billing periods will renew seamlessly without any manual intervention.'
              : 'Razorpay is currently settling your mandate subscription. Access will automatically be restored momentarily.'}
          </p>

          {existing?.lastFailure ? (
            <div className="border-destructive/20 bg-destructive/5 text-foreground mb-4 rounded-xl border p-3 text-xs leading-relaxed">
              <span className="text-destructive font-semibold">
                Note on last charge:{' '}
              </span>
              {existing.lastFailure}
            </div>
          ) : null}

          {existing ? <AutopayDetails autopay={existing} /> : null}

          <div className="mt-4 space-y-2">
            {canUseDashboard ? (
              <>
                <button
                  type="button"
                  onClick={() => router.replace('/dashboard')}
                  className={`${primaryButton} py-3 text-sm font-semibold`}
                >
                  <span>Launch CRM Dashboard</span>
                  <ArrowRight className="size-4" />
                </button>
                <Link
                  href="/settings?tab=billing"
                  className={`${secondaryButton} py-2.5 text-xs font-medium`}
                >
                  <span>Manage Mandates & Cards</span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void refresh()}
                className={`${primaryButton} py-3 text-sm font-semibold`}
              >
                <RefreshCw className="size-4" aria-hidden />
                <span>Refresh Live Status</span>
              </button>
            )}
          </div>
          {support}
        </div>
      </Shell>
    );
  }

  // ================= Preview + consent =================

  if (loadError) {
    return (
      <Shell maxWidth="max-w-lg">
        <div className="border-border/80 bg-card/95 rounded-3xl border p-8 text-center shadow-xl backdrop-blur-xl">
          <div className="bg-destructive/10 text-destructive ring-destructive/5 mx-auto flex size-14 items-center justify-center rounded-2xl ring-8">
            <TriangleAlert className="size-7" aria-hidden />
          </div>
          <h1 className="text-foreground mt-4 text-xl font-bold tracking-tight">
            Checkout Preparation Failed
          </h1>
          <p
            className="text-muted-foreground mt-2 text-sm leading-relaxed"
            role="alert"
          >
            {loadError}
          </p>
          {manualPendingLink}
          <div className="mt-6 flex flex-col gap-3">
            <Link href="/upgrade-plan" className={primaryButton}>
              <ArrowRight className="size-4 rotate-180" />
              <span>Return to Plan Selector</span>
            </Link>
          </div>
          {supportNote ? (
            <p className="text-muted-foreground border-border/60 mt-6 border-t pt-4 text-xs leading-relaxed">
              {supportNote}
            </p>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (!display || !hasIds) {
    return (
      <Shell maxWidth="max-w-md">
        <div className="border-border/80 bg-card/90 rounded-3xl border p-10 text-center shadow-xl backdrop-blur-xl">
          <div className="bg-primary/10 text-primary ring-primary/5 mx-auto flex size-14 items-center justify-center rounded-2xl ring-8">
            <Loader2
              className="size-7 animate-spin"
              aria-label="Loading checkout"
            />
          </div>
          <h2 className="text-foreground mt-6 text-base font-bold tracking-tight">
            Securing Connection to Razorpay
          </h2>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Fetching verified live subscription pricing & bank mandate terms...
          </p>
        </div>
      </Shell>
    );
  }

  const deferred = display.mode === 'authorise';
  const amount = formatPlanAmount(display.amount, display.currency);
  const busy = step !== 'idle';
  const buttonLabel = deferred
    ? 'Authorize AutoPay with Razorpay'
    : `Pay ${amount} & Start Subscription`;
  const workspaceName = subscription?.account?.name || 'Your Workspace';

  return (
    <Shell maxWidth="max-w-[460px]">
      {/* Replacement Notice if user is replacing paused/failed mandate */}
      {existing?.canReplace ? (
        <div
          role="note"
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3 text-xs leading-relaxed"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-500"
            aria-hidden
          />
          <span className="text-foreground/90">
            {existing.display.key === 'autopay_paused'
              ? 'Your prior AutoPay mandate is paused. Authorizing activates this new schedule seamlessly.'
              : 'Your prior AutoPay mandate was stopped. Authorizing re-links your workspace with zero downtime.'}
          </span>
        </div>
      ) : null}

      {/* Single Focused Checkout & Mandate Card */}
      <div className="border-border/80 bg-card/95 relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl sm:p-6">
        {/* Header */}
        <div className="border-border/60 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="border-primary/20 bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg border">
              <Lock className="size-4" />
            </div>
            <div>
              <h1 className="text-foreground text-sm font-bold tracking-tight">
                Order Summary & Mandate
              </h1>
              <p className="text-muted-foreground text-[11px]">
                256-bit SSL encrypted · {workspaceName}
              </p>
            </div>
          </div>
          <span className="border-border bg-muted/60 text-foreground rounded-lg border px-2.5 py-1 text-xs font-semibold">
            {display.planName} · {display.cycleLabel}
          </span>
        </div>

        {/* Financial Ledger Breakdown */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {display.planName} ({display.durationDays} Days access)
            </span>
            <span className="text-foreground font-mono font-medium">
              {amount}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Current Trial & Coverage Credit
            </span>
            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
              {deferred ? `-${amount}` : 'Included'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Mandate Registration & Verification
            </span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Waived (Free)
            </span>
          </div>

          {/* Total Due Today Section */}
          <div className="border-border/60 mt-3 border-t pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                  Total Due Today
                </span>
                <p className="text-muted-foreground text-[11px]">
                  {deferred
                    ? 'Zero immediate charge'
                    : 'Full payment processed now'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="text-foreground text-2xl font-black tracking-tight sm:text-3xl">
                  {deferred ? formatPlanAmount(0, display.currency) : amount}
                </span>
                {deferred && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase dark:text-emerald-400">
                    100% Free Setup
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Legal Mandate Agreement Box */}
        <div
          onClick={() => !busy && setConsented(!consented)}
          className={`mt-4 cursor-pointer rounded-xl border p-3.5 transition-all ${
            consented
              ? 'border-primary/50 bg-primary/[0.04] ring-primary/20 shadow-xs ring-1'
              : 'border-border/70 bg-muted/20 hover:border-border/90'
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              id="autopay-consent"
              type="checkbox"
              required
              checked={consented}
              disabled={busy}
              onChange={(e) => setConsented(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="border-border accent-primary mt-0.5 size-4 shrink-0 cursor-pointer rounded"
            />
            <div className="space-y-1.5">
              <label
                htmlFor="autopay-consent"
                className="text-foreground/90 block cursor-pointer text-xs leading-relaxed font-normal"
              >
                {display.consent}
              </label>
              {refundPolicyHref && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <FileText className="text-muted-foreground size-3" />
                  <Link
                    href={refundPolicyHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
                  >
                    Read our Refund and Cancellation Policy
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive mt-3 rounded-xl border p-3 text-xs">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-semibold">
                  Unable to initiate gateway:{' '}
                </span>
                <span>{actionError}</span>
              </div>
            </div>
            {manualPendingLink}
          </div>
        ) : null}

        {/* Hero CTA Button */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => void start()}
            disabled={!consented || busy}
            aria-describedby={consented ? undefined : 'autopay-consent-hint'}
            className={`${primaryButton} py-3 text-sm font-semibold`}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>{STEP_TEXT[step] || 'Securing Session...'}</span>
              </>
            ) : (
              <>
                <Lock className="size-4" aria-hidden />
                <span>{buttonLabel}</span>
              </>
            )}
          </button>

          {!consented ? (
            <p
              id="autopay-consent-hint"
              className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-[11px]"
            >
              <Info className="text-primary size-3 shrink-0" />
              <span>
                Please check the mandate authorization box above to proceed.
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground text-center text-[11px]">
              Proceeding opens Razorpay’s secure checkout. You will not be
              charged today.
            </p>
          )}
        </div>

        {/* Security Guarantee Strip */}
        <div className="border-border/50 bg-muted/20 mt-4 rounded-xl border p-2.5 text-center">
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[11px]">
            <ShieldCheck
              className="size-3.5 shrink-0 text-emerald-500"
              aria-hidden
            />
            <span>
              Payments processed securely via{' '}
              <strong className="text-foreground">Razorpay</strong>. Cancel
              anytime in Billing.
            </span>
          </p>
        </div>
      </div>
    </Shell>
  );
}
