// ============================================================
// All payments ledger: database reads — SERVER ONLY (service role).
// Read-only: SELECTs only. Both halves exclude super-admin-owned
// workspaces, like every other billing report.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { toAmount } from '@/lib/subscription/plans';

import type { BillingDirectory } from './admin-lookups';
import { fetchAllRows } from './fetch-all';
import {
  toLedgerFromManual,
  toLedgerFromRazorpay,
  type LedgerRow,
} from './ledger';
import { PLATFORM_BILLING_CURRENCY } from './money-format';
import { listAllAdminPayments } from './razorpay/admin-db';
import { BillingDbError } from './razorpay/db';
import { toMinor } from './razorpay/money';

type Raw = Record<string, unknown>;

const MANUAL_COLUMNS =
  'id, account_id, user_id, plan_name_snapshot, cycle_label_snapshot, expected_amount, paid_amount, currency, transaction_ref, payer_upi_id, payment_method, status, activated_from, activated_until, reviewed_by_user_id, reviewed_at, created_at';

const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

/** Major units -> minor, never throwing on a legacy value. */
export function safeMinor(value: unknown, currency: string): number {
  const amount = toAmount(value);
  try {
    return toMinor(Math.max(0, amount), currency);
  } catch {
    return Math.round(Math.max(0, amount) * 100);
  }
}

export async function loadManualLedgerRows(
  admin: SupabaseClient,
  dir: BillingDirectory,
  cap: number
): Promise<{ rows: LedgerRow[]; truncated: boolean }> {
  let read: { rows: Raw[]; truncated: boolean };
  try {
    read = await fetchAllRows<Raw>(
      (from, to) =>
        admin
          .from('payment_requests')
          .select(MANUAL_COLUMNS)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: Raw[] | null;
          error: { message: string } | null;
        }>,
      { cap }
    );
  } catch (err) {
    throw new BillingDbError(
      `Could not read payment_requests: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const rows = read.rows
    .filter((r) => !dir.superAdminOwned.has(String(r.account_id)))
    .map((r) => {
      const accountId = String(r.account_id);
      const currency = (
        str(r.currency) ?? PLATFORM_BILLING_CURRENCY
      ).toUpperCase();
      return toLedgerFromManual({
        id: String(r.id),
        accountId,
        accountName: dir.accounts.get(accountId)?.name ?? null,
        ownerEmail: dir.ownerEmail(accountId),
        planName: str(r.plan_name_snapshot),
        cycleLabel: str(r.cycle_label_snapshot),
        expectedMinor:
          r.expected_amount === null || r.expected_amount === undefined
            ? null
            : safeMinor(r.expected_amount, currency),
        paidMinor: safeMinor(r.paid_amount, currency),
        currency,
        transactionRef: str(r.transaction_ref),
        payerUpiId: str(r.payer_upi_id),
        status: String(r.status),
        activatedFrom: str(r.activated_from),
        activatedUntil: str(r.activated_until),
        createdAt: String(r.created_at),
      });
    });
  return { rows, truncated: read.truncated };
}

export async function loadRazorpayLedgerRows(
  admin: SupabaseClient,
  dir: BillingDirectory,
  cap: number
): Promise<{ rows: LedgerRow[]; truncated: boolean }> {
  const read = await listAllAdminPayments(admin, { cap });
  return {
    rows: read.rows
      .filter((p) => !dir.superAdminOwned.has(p.accountId))
      .map((p) => toLedgerFromRazorpay(p, dir.ownerEmail(p.accountId))),
    truncated: read.truncated,
  };
}
