'use client';

// ============================================================
// /upgrade-plan/payment — the payment step.
//
// Two purchase flows live behind this one URL, and the SERVER decides
// which one an account gets (`paymentProvider` from
// /api/billing/subscription, the same rule the Razorpay routes enforce):
//
//   razorpay    Razorpay AutoPay: consent, Checkout, automatic renewals
//   manual_upi  the legacy QR + "I have paid" form, unchanged
//
// The page waits for the first subscription load before choosing, so a
// Razorpay account never sees the QR flash up first. A manual UPI payment
// already under review always gets the manual screen, whatever the
// provider, so nobody is invited to pay twice for it. A stale
// `?status=pending` URL with nothing actually pending does NOT send a
// Razorpay account to the manual screen (Phase 6: its QR route answers
// 410 manual_payments_retired).
//
// `useSearchParams` needs a Suspense boundary or the production build
// fails with the CSR-bailout error and ships a page whose handlers never
// wire up. Same split the settings page uses.
// ============================================================

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { ManualUpiPayment } from '@/components/billing/manual-upi-payment';
import { RazorpayPayment } from '@/components/billing/razorpay-payment';
import { useSubscription } from '@/hooks/use-subscription';

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2
        className="text-primary size-7 animate-spin"
        aria-label="Loading"
      />
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PaymentPageInner />
    </Suspense>
  );
}

function PaymentPageInner() {
  const searchParams = useSearchParams();
  const { data: subscription, loaded } = useSubscription();

  if (!loaded) return <Spinner />;

  const reviewingManualPayment =
    Boolean(subscription?.pendingPayment) ||
    (searchParams.get('status') === 'pending' &&
      subscription?.paymentProvider !== 'razorpay');

  if (subscription?.paymentProvider === 'razorpay' && !reviewingManualPayment) {
    return (
      <RazorpayPayment
        planId={searchParams.get('plan')}
        cycleId={searchParams.get('cycle')}
      />
    );
  }

  return <ManualUpiPayment />;
}
