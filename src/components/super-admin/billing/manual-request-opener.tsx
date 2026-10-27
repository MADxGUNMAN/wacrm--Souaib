'use client';

// ============================================================
// Open one manual UPI payment request in the existing review drawer,
// from anywhere on the Payments page (All payments ledger, Activity
// log). Loads the request by id with the read-only
// GET /api/super-admin/billing/payment-requests?id=…, then renders
// PaymentRequestDrawer. A failed load shows the server's own error.
// ============================================================

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { AdminPaymentRequest } from '@/types/super-admin';
import { PaymentRequestDrawer } from './payment-request-drawer';
import { errorMessage } from './razorpay-shared';

export function useManualRequestOpener(onReviewed?: () => void) {
  const [request, setRequest] = useState<AdminPaymentRequest | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const open = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(
        `/api/super-admin/billing/payment-requests?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(errorMessage(res.status, body));
        return;
      }
      const found = (body.requests ?? [])[0] as AdminPaymentRequest | undefined;
      if (!found) {
        toast.error('That payment request no longer exists.');
        return;
      }
      setRequest(found);
    } catch {
      toast.error('Could not reach the server. Check your connection.');
    } finally {
      setLoadingId(null);
    }
  }, []);

  const drawer = request ? (
    <PaymentRequestDrawer
      request={request}
      onClose={() => setRequest(null)}
      onReviewed={() => onReviewed?.()}
    />
  ) : null;

  return { open, loadingId, drawer };
}
