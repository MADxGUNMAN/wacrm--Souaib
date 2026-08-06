'use client';

// ============================================================
// Manual UPI payment declaration form.
//
// Collects what a human verifier actually needs to match a transfer
// against a bank statement: the UTR, who sent it, from which number, and
// how much they say they sent.
//
// Two deliberate choices:
//
//  1. `paidAmount` is PREFILLED with the expected amount but stays
//     editable. Prefilling matches the overwhelmingly common case (they
//     paid exactly what the QR asked). Keeping it editable is the point
//     of the field — a short or rounded payment must be declarable, so
//     the admin sees the discrepancy instead of a number we faked.
//
//  2. The plan and expected amount are shown READ-ONLY and are not sent
//     as amounts. Only `planId`/`cycleId` go to the server, which
//     re-derives the price. Nothing typed here can change what is owed.
// ============================================================

import { useState } from 'react';
import { Loader2, Send, TriangleAlert } from 'lucide-react';

import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface Props {
  planId: string;
  cycleId: string;
  planName: string;
  cycleLabel: string;
  expectedAmount: number;
  currency: string;
  onCancel: () => void;
  onSubmitted: () => void | Promise<void>;
}

/** Today in `yyyy-mm-dd`, for the date input's max attribute. */
function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function PaymentSubmissionForm({
  planId,
  cycleId,
  planName,
  cycleLabel,
  expectedAmount,
  currency,
  onCancel,
  onSubmitted,
}: Props) {
  const [transactionRef, setTransactionRef] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerMobile, setPayerMobile] = useState('');
  const [paidAmount, setPaidAmount] = useState(String(expectedAmount));
  const [payerUpiId, setPayerUpiId] = useState('');
  const [payerBank, setPayerBank] = useState('');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [payerNote, setPayerNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Server-reported offending field, so the right input gets highlighted
  // rather than showing a generic banner and making the user hunt.
  const [errorField, setErrorField] = useState<string | null>(null);

  const parsedPaid = Number.parseFloat(paidAmount.replace(/[^0-9.]/g, ''));
  const mismatch =
    Number.isFinite(parsedPaid) && Math.abs(parsedPaid - expectedAmount) >= 0.01;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrorField(null);

    try {
      const res = await fetch('/api/billing/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          cycleId,
          transactionRef,
          payerName,
          payerMobile,
          paidAmount,
          payerUpiId: payerUpiId || null,
          payerBank: payerBank || null,
          // Send an ISO instant; the server rejects future dates.
          paidAt: paidAt ? new Date(paidAt).toISOString() : null,
          payerNote: payerNote || null,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error ?? 'Could not submit your payment details');
        setErrorField(body?.field ?? null);
        return;
      }

      await onSubmitted();
    } catch {
      setError('Could not submit your payment details. Check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (name: string) =>
    cn(
      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1',
      errorField === name
        ? 'border-destructive focus:ring-destructive'
        : 'border-border focus:border-primary focus:ring-primary',
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-6 sm:p-8"
    >
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Submit your payment details
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We verify every payment by hand. Accurate details get you activated
        faster.
      </p>

      {/* Read-only purchase summary — states what is being bought without
          letting the form influence the price. */}
      <dl className="mt-5 grid gap-x-6 gap-y-2 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-muted-foreground">Selected plan</dt>
          <dd className="font-medium text-foreground">
            {planName} · {cycleLabel}
          </dd>
        </div>
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-muted-foreground">Plan amount</dt>
          <dd className="font-medium text-foreground">
            {formatCurrency(expectedAmount, currency)}
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* UTR — the single most important field for verification. */}
        <div className="sm:col-span-2">
          <label
            htmlFor="transactionRef"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Transaction ID / UTR <span className="text-destructive">*</span>
          </label>
          <input
            id="transactionRef"
            required
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            placeholder="e.g. 412098765432"
            autoComplete="off"
            className={cn(fieldClass('transactionRef'), 'font-mono')}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Find this in your UPI app&apos;s payment history, shown as UTR,
            transaction ID, or reference number.
          </p>
        </div>

        <div>
          <label
            htmlFor="payerName"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Account holder name <span className="text-destructive">*</span>
          </label>
          <input
            id="payerName"
            required
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Name on the bank account"
            autoComplete="name"
            className={fieldClass('payerName')}
          />
        </div>

        <div>
          <label
            htmlFor="payerMobile"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Mobile number <span className="text-destructive">*</span>
          </label>
          <input
            id="payerMobile"
            required
            type="tel"
            inputMode="tel"
            value={payerMobile}
            onChange={(e) => setPayerMobile(e.target.value)}
            placeholder="Number used to pay"
            autoComplete="tel"
            className={fieldClass('payerMobile')}
          />
        </div>

        <div>
          <label
            htmlFor="paidAmount"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Amount you paid <span className="text-destructive">*</span>
          </label>
          <input
            id="paidAmount"
            required
            inputMode="decimal"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            className={fieldClass('paidAmount')}
          />
          {mismatch ? (
            // A warning, not a block: part-payments and bank rounding are
            // real, and a human decides on review.
            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              This differs from the plan amount of{' '}
              {formatCurrency(expectedAmount, currency)}. You can still submit —
              our team will review it.
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="paidAt"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Payment date
          </label>
          <input
            id="paidAt"
            type="date"
            value={paidAt}
            max={todayISO()}
            onChange={(e) => setPaidAt(e.target.value)}
            className={fieldClass('paidAt')}
          />
        </div>

        <div>
          <label
            htmlFor="payerUpiId"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Your UPI ID <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="payerUpiId"
            value={payerUpiId}
            onChange={(e) => setPayerUpiId(e.target.value)}
            placeholder="you@bank"
            autoComplete="off"
            className={fieldClass('payerUpiId')}
          />
        </div>

        <div>
          <label
            htmlFor="payerBank"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Bank name <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="payerBank"
            value={payerBank}
            onChange={(e) => setPayerBank(e.target.value)}
            placeholder="e.g. HDFC Bank"
            className={fieldClass('payerBank')}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="payerNote"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Note for our team{' '}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="payerNote"
            rows={3}
            value={payerNote}
            onChange={(e) => setPayerNote(e.target.value)}
            placeholder="Anything we should know about this payment"
            className={cn(fieldClass('payerNote'), 'resize-none')}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <Send className="size-4" />
              Submit for verification
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
