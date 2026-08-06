'use client';

// ============================================================
// /upgrade-plan/payment — scan the QR, then declare the transfer.
//
// The QR and its amount are generated SERVER-SIDE by /api/billing/upi-qr
// from the live price. This page never computes or sends an amount; it
// only passes the plan and cycle ids it was handed. That's what makes
// "admin edits the price, QR follows" true rather than aspirational.
//
// `useSearchParams` needs a Suspense boundary or the production build
// fails with the CSR-bailout error and ships a page whose handlers never
// wire up. Same split the settings page uses.
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { UpgradeHeader } from '@/components/billing/upgrade-header';
import { PaymentSubmissionForm } from '@/components/billing/payment-submission-form';
import { useSubscription } from '@/hooks/use-subscription';
import { formatCurrency } from '@/lib/currency';
import type { PaymentQuote } from '@/lib/subscription/types';

interface QuoteResponse {
  quote: PaymentQuote;
  wouldEndAt: string;
  instructions: string | null;
  paymentHeading: string;
  submitButtonLabel: string;
  supportNote: string | null;
}

/**
 * How often the "under review" screen re-checks for a verdict.
 *
 * Approval is a human action on the other side of the screen, so there
 * is nothing to subscribe to — polling is the mechanism. 10s is chosen
 * to feel immediate to someone watching the page without being wasteful:
 * ticks are skipped entirely while the tab is hidden, and a focus/
 * visibility change forces an immediate re-check, so the common "user
 * switches back to the tab" path resolves instantly rather than waiting
 * out the interval.
 */
const REVIEW_POLL_MS = 10_000;

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      }
    >
      <PaymentPageInner />
    </Suspense>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function PaymentPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: subscription, refresh } = useSubscription();

  const planId = searchParams.get('plan');
  const cycleId = searchParams.get('cycle');

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  const pending = subscription?.pendingPayment ?? null;

  const hasIds = Boolean(planId && cycleId);

  // ---- Watching for a review verdict ----
  //
  // Set once this page has actually shown a payment as under review, so
  // a verdict can take over the screen. Without this guard a customer
  // who was rejected weeks ago and has come back to buy again would be
  // shown that stale rejection instead of the QR they asked for.
  //
  // Landing on `?status=pending` counts too: that is the plan page
  // sending someone here specifically to look at a submission, so a
  // verdict that arrived while they were away is exactly what they came
  // to see.
  const sawPendingRef = useRef(false);
  useEffect(() => {
    if (pending || submitted) sawPendingRef.current = true;
  }, [pending, submitted]);

  const expectingVerdict =
    sawPendingRef.current || searchParams.get('status') === 'pending';

  const lastPayment = subscription?.lastPayment ?? null;

  /**
   * The verdict to act on, or null while the payment is still open.
   *
   * Derived rather than stored: the admin's decision clears
   * `pendingPayment` and stamps `lastPayment`, so the transition is
   * visible in the very next snapshot the poller fetches.
   */
  const verdict =
    expectingVerdict && !pending && lastPayment ? lastPayment.status : null;

  // Poll while the payment is open. Nothing else can tell this screen the
  // admin has acted, and the previous version's only affordance was a
  // manual "Check status" button — so an approved customer sat on a dead
  // screen until they thought to click it or reload.
  useEffect(() => {
    if (!pending) return;

    const check = () => {
      // Skip while backgrounded so a tab left open overnight costs
      // nothing; the listeners below catch it up the moment it returns.
      if (document.visibilityState === 'visible') void refresh();
    };

    const interval = setInterval(check, REVIEW_POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [pending, refresh]);

  // Approved — send them straight into the app. `replace` rather than
  // `push` so Back cannot return them to a payment screen for a payment
  // that has already been settled.
  useEffect(() => {
    if (verdict !== 'approved') return;
    router.replace('/dashboard');
  }, [verdict, router]);

  // No ids in the URL (deep link, or a refresh after the query was
  // stripped) — nothing to price.
  //
  // `?status=pending` is a legitimate id-less landing: the plan page sends
  // people here when a submission is already under review. In that case we
  // must WAIT for the subscription snapshot before deciding, otherwise the
  // render below briefly shows "Payment unavailable" before the pending
  // card appears. Once the snapshot lands, either there is a pending
  // payment (render it) or there isn't (go choose a plan).
  useEffect(() => {
    if (hasIds) return;

    if (searchParams.get('status') !== 'pending') {
      router.replace('/upgrade-plan');
      return;
    }
    // A verdict has arrived — it owns the screen. Redirecting here is
    // what used to swallow rejections: the reason is only rendered in
    // Settings → Billing, so bouncing to the plan picker left the
    // customer staring at prices with no idea their payment had bounced.
    if (verdict) return;
    if (subscription && !subscription.pendingPayment) {
      router.replace('/upgrade-plan');
    }
  }, [hasIds, router, searchParams, subscription, verdict]);

  useEffect(() => {
    if (!hasIds) setLoading(false);
  }, [hasIds]);

  useEffect(() => {
    if (!planId || !cycleId) return;
    // A payment already awaiting review: skip the QR fetch entirely so we
    // don't invite a second transfer for the same subscription.
    if (pending) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/billing/upi-qr?planId=${encodeURIComponent(planId)}&cycleId=${encodeURIComponent(cycleId)}`,
          { cache: 'no-store' },
        );
        const body = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setError(body?.error ?? 'Could not prepare your payment');
          setErrorCode(body?.code ?? null);
          return;
        }

        setQuote(body as QuoteResponse);
        setError(null);
        setErrorCode(null);
      } catch {
        if (active) setError('Could not prepare your payment');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [planId, cycleId, pending]);

  // A member can't pay; the API already 403s, but redirect so they land
  // on a screen that tells them what to do instead of an error.
  useEffect(() => {
    if (errorCode === 'owner_only') {
      router.replace('/subscription-required');
    }
  }, [errorCode, router]);

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable over plain http or without permission.
      // The UPI id is displayed as selectable text, so the user can still
      // copy it manually — no need to surface an error.
    }
  }, []);

  const handleOpenForm = useCallback(() => {
    setShowForm(true);
    // Let the section mount before scrolling to it.
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }, []);

  const handleSubmitted = useCallback(async () => {
    setSubmitted(true);
    setShowForm(false);
    // Re-read so the pending state (and the trial banner everywhere else)
    // reflects the new submission immediately.
    await refresh();
  }, [refresh]);

  // Hold the loader while a decision is still pending: either the quote is
  // in flight, or we have no ids and are waiting on the subscription
  // snapshot to tell us whether to show a pending payment or redirect.
  // Without the second clause the error state flashes first.
  if (loading || (!hasIds && !pending && !verdict)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  // ---------- Approved ----------
  // The redirect above is already in flight; this is what fills the
  // frame while it lands, so the moment of success is acknowledged
  // rather than being a blank flash.
  if (verdict === 'approved') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/12">
          <CheckCircle2 className="size-6 text-emerald-500" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          Payment verified
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lastPayment?.planName
            ? `Your ${lastPayment.planName} subscription is active. Taking you to your dashboard…`
            : 'Your subscription is active. Taking you to your dashboard…'}
        </p>
        <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------- Rejected ----------
  if (verdict === 'rejected') {
    return (
      <div className="flex min-h-screen flex-col">
        <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border border-destructive/25 bg-card p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/12">
                <XCircle className="size-6 text-destructive" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                We could not verify this payment
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {lastPayment?.planName
                  ? `Your ${lastPayment.planName} payment was reviewed and could not be confirmed, so the subscription has not been activated.`
                  : 'Your payment was reviewed and could not be confirmed, so the subscription has not been activated.'}
              </p>

              {/* The reason is mandatory on the admin side precisely so
                  there is always something useful to show here. */}
              {lastPayment?.reviewNote ? (
                <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-destructive uppercase">
                    Reason
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-foreground">
                    {lastPayment.reviewNote}
                  </p>
                </div>
              ) : null}

              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                If your bank shows the amount as debited, please do not pay
                again — reply to the email we sent you with the transaction
                reference and we will trace it.
              </p>

              <button
                type="button"
                onClick={() => router.push('/upgrade-plan')}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Submit payment details again
              </button>

              {subscription?.copy.supportNote ? (
                <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                  {subscription.copy.supportNote}
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Under review ----------
  if (pending || submitted) {
    return (
      <div className="flex min-h-screen flex-col">
        <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border border-amber-500/25 bg-card p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/12">
                <Clock className="size-6 text-amber-500" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                Payment under review
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {subscription?.copy.pendingReviewMessage ??
                  'We are verifying your payment and will activate your subscription shortly.'}
              </p>

              {pending ? (
                <dl className="mt-6 space-y-3 rounded-xl bg-muted/40 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="text-right font-medium text-foreground">
                      {pending.planName} · {pending.cycleLabel}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Amount paid</dt>
                    <dd className="text-right font-medium text-foreground">
                      {formatCurrency(pending.paidAmount, pending.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Transaction ID</dt>
                    <dd className="text-right font-mono text-xs break-all text-foreground">
                      {pending.transactionRef}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd className="text-right font-medium text-foreground">
                      {formatDate(pending.submittedAt)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {/* This screen now re-checks on its own, so the button is
                  an impatience valve rather than the only way out. Say so
                  — otherwise a customer has no reason to believe the page
                  will ever change and will sit refreshing it. */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RefreshCw className="size-3.5" />
                  Check now
                </button>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Checking automatically
                </p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                You can safely close this page — we will email you as soon as
                it is verified.
              </p>

              {subscription?.copy.supportNote ? (
                <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                  {subscription.copy.supportNote}
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Error / not configured ----------
  if (error || !quote) {
    return (
      <div className="flex min-h-screen flex-col">
        <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg text-center">
            <TriangleAlert className="mx-auto size-8 text-destructive" />
            <h1 className="mt-4 text-lg font-semibold text-foreground">
              Payment unavailable
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error ?? 'Could not prepare your payment.'}
            </p>
            <button
              type="button"
              onClick={() => router.push('/upgrade-plan')}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
              Back to plans
            </button>
          </div>
        </main>
      </div>
    );
  }

  const q = quote.quote;

  return (
    <div className="flex min-h-screen flex-col">
      <UpgradeHeader showBackToDashboard={!subscription?.state.isBlocked} />

      <main className="flex-1 px-4 pb-16 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => router.push('/upgrade-plan')}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to plans
          </button>

          <div className="pt-6 pb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {quote.paymentHeading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {q.planName} · {q.cycleLabel}
              {quote.wouldEndAt ? (
                <> · valid until {formatDate(quote.wouldEndAt)}</>
              ) : null}
            </p>
          </div>

          {/* ---- Amount + QR ---- */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="text-center">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Amount to pay
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">
                {formatCurrency(q.amount, q.currency)}
              </p>
            </div>

            {quote.instructions ? (
              <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                {quote.instructions}
              </p>
            ) : null}

            {/* QR. The SVG is generated server-side by the `qrcode`
                library from our own UPI URI — never from user input — so
                injecting it as markup is safe. A white plate is forced
                behind it because QR scanners need light-on-dark contrast
                and the card is dark in dark mode. */}
            <div className="mt-6 flex justify-center">
              <div className="rounded-2xl border border-border bg-white p-4">
                <div
                  className="size-48 sm:size-56 [&>svg]:size-full"
                  role="img"
                  aria-label={`UPI QR code for ${formatCurrency(q.amount, q.currency)}`}
                  dangerouslySetInnerHTML={{ __html: q.qrSvg }}
                />
              </div>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <QrCode className="size-3.5" />
              Scan with any UPI app — GPay, PhonePe, Paytm, BHIM
            </p>

            {/* ---- UPI id ---- */}
            <div className="mt-6 rounded-xl bg-muted/40 p-4">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Or pay this UPI ID
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <code className="min-w-0 truncate font-mono text-sm text-foreground select-all">
                  {q.upiId}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(q.upiId)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Paying to <span className="font-medium text-foreground">{q.payeeName}</span>.
                Reference{' '}
                <span className="font-mono text-[11px]">{q.referenceNote}</span>
              </p>
            </div>

            {/* Deep link — only useful on the device that has a UPI app
                installed, so it's framed as a phone action rather than a
                primary button. */}
            <a
              href={q.upiUri}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:hidden"
            >
              <Smartphone className="size-4" />
              Open in a UPI app
            </a>

            {/* ---- Submit CTA ---- */}
            {!showForm ? (
              <button
                type="button"
                onClick={handleOpenForm}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {quote.submitButtonLabel}
              </button>
            ) : null}
          </div>

          {/* ---- Submission form ---- */}
          {showForm ? (
            <div ref={formRef} className="mt-5 scroll-mt-6">
              <PaymentSubmissionForm
                planId={q.planId}
                cycleId={q.cycleId}
                planName={q.planName}
                cycleLabel={q.cycleLabel}
                expectedAmount={q.amount}
                currency={q.currency}
                onCancel={() => setShowForm(false)}
                onSubmitted={handleSubmitted}
              />
            </div>
          ) : null}

          {quote.supportNote ? (
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              {quote.supportNote}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
