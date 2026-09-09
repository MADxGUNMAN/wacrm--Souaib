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
import { createClient } from '@/lib/supabase/client';
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
          <Loader2 className="text-primary size-7 animate-spin" />
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

  useEffect(() => {
    const supabase = createClient();

    // 1. Check session immediately on mount
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.replace('/login');
      }
    });

    // 2. Listen to auth state transitions
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.replace('/login');
      }
    });

    // 3. Handle Back-Forward Cache (bfcache) restorations
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            window.location.replace('/login');
          }
        });
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => {
      authSub.unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

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
          { cache: 'no-store' }
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
        <Loader2 className="text-primary size-7 animate-spin" />
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
        <h1 className="text-foreground mt-5 text-xl font-semibold tracking-tight">
          Payment verified
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {lastPayment?.planName
            ? `Your ${lastPayment.planName} subscription is active. Taking you to your dashboard…`
            : 'Your subscription is active. Taking you to your dashboard…'}
        </p>
        <Loader2 className="text-muted-foreground mt-6 size-5 animate-spin" />
      </div>
    );
  }

  // ---------- Rejected ----------
  if (verdict === 'rejected') {
    return (
      <div className="flex min-h-screen flex-col">
        <UpgradeHeader
          backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
        />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg">
            <div className="border-destructive/25 bg-card rounded-2xl border p-6 sm:p-8">
              <div className="bg-destructive/12 flex size-12 items-center justify-center rounded-xl">
                <XCircle className="text-destructive size-6" />
              </div>
              <h1 className="text-foreground mt-5 text-xl font-semibold tracking-tight">
                We could not verify this payment
              </h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {lastPayment?.planName
                  ? `Your ${lastPayment.planName} payment was reviewed and could not be confirmed, so the subscription has not been activated.`
                  : 'Your payment was reviewed and could not be confirmed, so the subscription has not been activated.'}
              </p>

              {/* The reason is mandatory on the admin side precisely so
                  there is always something useful to show here. */}
              {lastPayment?.reviewNote ? (
                <div className="border-destructive/20 bg-destructive/5 mt-5 rounded-xl border p-4">
                  <p className="text-destructive text-[11px] font-semibold tracking-[0.08em] uppercase">
                    Reason
                  </p>
                  <p className="text-foreground mt-1.5 text-sm leading-relaxed whitespace-pre-line">
                    {lastPayment.reviewNote}
                  </p>
                </div>
              ) : null}

              <p className="text-muted-foreground mt-5 text-sm leading-relaxed">
                If your bank shows the amount as debited, please do not pay
                again — reply to the email we sent you with the transaction
                reference and we will trace it.
              </p>

              <button
                type="button"
                onClick={() => router.push('/upgrade-plan')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                Submit payment details again
              </button>

              {subscription?.copy.supportNote ? (
                <p className="border-border text-muted-foreground mt-6 border-t pt-5 text-xs leading-relaxed">
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
        <UpgradeHeader
          backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
        />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg">
            <div className="bg-card rounded-2xl border border-amber-500/25 p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/12">
                <Clock className="size-6 text-amber-500" />
              </div>
              <h1 className="text-foreground mt-5 text-xl font-semibold tracking-tight">
                Payment under review
              </h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {subscription?.copy.pendingReviewMessage ??
                  'We are verifying your payment and will activate your subscription shortly.'}
              </p>

              {pending ? (
                <dl className="bg-muted/40 mt-6 space-y-3 rounded-xl p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="text-foreground text-right font-medium">
                      {pending.planName} · {pending.cycleLabel}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Amount paid</dt>
                    <dd className="text-foreground text-right font-medium">
                      {formatCurrency(pending.paidAmount, pending.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Transaction ID</dt>
                    <dd className="text-foreground text-right font-mono text-xs break-all">
                      {pending.transactionRef}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd className="text-foreground text-right font-medium">
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
                  className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                  Check now
                </button>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  Checking automatically
                </p>
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                You can safely close this page — we will email you as soon as it
                is verified.
              </p>

              {subscription?.copy.supportNote ? (
                <p className="border-border text-muted-foreground mt-6 border-t pt-5 text-xs leading-relaxed">
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
        <UpgradeHeader
          backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
        />
        <main className="flex-1 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-lg text-center">
            <TriangleAlert className="text-destructive mx-auto size-8" />
            <h1 className="text-foreground mt-4 text-lg font-semibold">
              Payment unavailable
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {error ?? 'Could not prepare your payment.'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const q = quote.quote;

  return (
    <div className="flex min-h-screen flex-col">
      <UpgradeHeader
        backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
      />

      <main className="flex-1 px-4 pb-16 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="pt-4 pb-6 text-center">
            <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
              {quote.paymentHeading}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {q.planName} · {q.cycleLabel}
              {quote.wouldEndAt ? (
                <> · valid until {formatDate(quote.wouldEndAt)}</>
              ) : null}
            </p>
          </div>

          {/* ---- Amount + QR ---- */}
          <div className="border-border bg-card rounded-3xl border p-6 shadow-sm sm:p-8">
            {/* Header / Amount */}
            <div className="sm:border-border flex flex-col items-center justify-center gap-4 text-center sm:flex-row sm:justify-between sm:border-b sm:pb-6 sm:text-left">
              <div>
                <p className="text-muted-foreground text-[11px] font-bold tracking-[0.08em] uppercase">
                  Amount to pay
                </p>
                <p className="text-foreground mt-1 text-4xl font-black tracking-tight">
                  {formatCurrency(q.amount, q.currency)}
                </p>
              </div>
              {quote.instructions ? (
                <p className="text-muted-foreground max-w-[280px] text-[13px] leading-relaxed sm:text-right">
                  {quote.instructions}
                </p>
              ) : null}
            </div>

            {/* Content Grid */}
            <div className="mt-6 grid gap-8 sm:mt-8 sm:grid-cols-2 sm:items-center">
              {/* Left: QR Code */}
              <div className="flex flex-col items-center">
                <div className="border-border rounded-2xl border bg-white p-3 shadow-sm transition-transform hover:scale-[1.02] sm:p-4">
                  <div
                    className="size-48 sm:size-52 [&>svg]:size-full"
                    role="img"
                    aria-label={`UPI QR code for ${formatCurrency(q.amount, q.currency)}`}
                    dangerouslySetInnerHTML={{ __html: q.qrSvg }}
                  />
                </div>
                <p className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-center text-[13px] font-medium">
                  <QrCode className="text-primary size-4" />
                  Scan with any UPI app
                </p>
              </div>

              {/* Right: Manual Details & CTA */}
              <div className="flex flex-col gap-4">
                <div className="bg-muted/30 border-border/50 rounded-2xl border p-5">
                  <p className="text-muted-foreground text-[11px] font-bold tracking-[0.08em] uppercase">
                    Or pay this UPI ID
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <code className="text-foreground min-w-0 truncate font-mono text-sm font-semibold select-all">
                      {q.upiId}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopy(q.upiId)}
                      className="border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="text-primary size-3.5" />
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
                  <div className="text-muted-foreground mt-3 text-[12px] leading-relaxed">
                    Paying to{' '}
                    <span className="text-foreground font-semibold">
                      {q.payeeName}
                    </span>
                    .<br />
                    Ref:{' '}
                    <span className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-[11px] font-medium">
                      {q.referenceNote}
                    </span>
                  </div>
                </div>

                <a
                  href={q.upiUri}
                  className="border-border bg-card text-foreground hover:bg-muted inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition-colors sm:hidden"
                >
                  <Smartphone className="size-4" />
                  Open in a UPI app
                </a>

                {!showForm ? (
                  <button
                    type="button"
                    onClick={handleOpenForm}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {quote.submitButtonLabel}
                  </button>
                ) : null}
              </div>
            </div>
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
            <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
              {quote.supportNote}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
