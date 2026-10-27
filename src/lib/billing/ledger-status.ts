// One status for every row of the All payments ledger, across Razorpay
// payments (billing_payments) and manual UPI requests (payment_requests).
// Mapping rules live in src/lib/billing/ledger.ts.

export const LEDGER_STATUSES = [
  'paid',
  'pending',
  'failed',
  'rejected',
  'refunded',
  'partially_refunded',
] as const;

export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export function isLedgerStatus(value: unknown): value is LedgerStatus {
  return (
    typeof value === 'string' &&
    (LEDGER_STATUSES as readonly string[]).includes(value)
  );
}
