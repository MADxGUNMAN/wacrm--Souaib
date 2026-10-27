// ============================================================
// GET /api/super-admin/billing/collected
//
// Money collected by channel (Razorpay AutoPay, manual UPI, refunds),
// live and test kept apart, per currency, for the last 30 days and all
// time. Definitions live in src/lib/billing/collected.ts. Super admin
// only. Read-only. Super-admin-owned workspaces are excluded.
//
// Response: CollectedResponse { generatedAt, last30d, allTime }.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { loadBillingDirectory } from '@/lib/billing/admin-lookups';
import { summariseCollected } from '@/lib/billing/collected';
import { fetchAllRows } from '@/lib/billing/fetch-all';
import { safeMinor } from '@/lib/billing/ledger-db';
import { PLATFORM_BILLING_CURRENCY } from '@/lib/billing/money-format';
import {
  adminBillingErrorResponse,
  adminJson,
} from '@/lib/billing/razorpay/admin-http';
import { BillingDbError } from '@/lib/billing/razorpay/db';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

type Raw = Record<string, unknown>;

const CAP = 50000;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function readAll(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  columns: string
): Promise<Raw[]> {
  try {
    const { rows } = await fetchAllRows<Raw>(
      (from, to) =>
        admin
          .from(table)
          .select(columns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to) as unknown as PromiseLike<{
          data: Raw[] | null;
          error: { message: string } | null;
        }>,
      { cap: CAP }
    );
    return rows;
  } catch (err) {
    throw new BillingDbError(
      `Could not read ${table}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const dir = await loadBillingDirectory(admin);
    const [payments, refunds, manual] = await Promise.all([
      readAll(
        admin,
        'billing_payments',
        'id, account_id, mode, kind, status, captured, amount_minor, currency, captured_at, created_at'
      ),
      readAll(
        admin,
        'billing_refunds',
        'id, account_id, mode, status, amount_minor, currency, access_effect, processed_at, created_at'
      ),
      readAll(
        admin,
        'payment_requests',
        'id, account_id, status, paid_amount, currency, reviewed_at, created_at'
      ),
    ]);
    const keep = (r: Raw) => !dir.superAdminOwned.has(String(r.account_id));

    return adminJson(
      summariseCollected(
        {
          payments: payments.filter(keep).map((p) => ({
            mode: String(p.mode),
            kind: str(p.kind),
            status: String(p.status),
            captured: p.captured === true,
            amountMinor: num(p.amount_minor),
            currency: str(p.currency) ?? PLATFORM_BILLING_CURRENCY,
            capturedAt: str(p.captured_at),
            createdAt: String(p.created_at),
          })),
          refunds: refunds.filter(keep).map((r) => ({
            mode: String(r.mode),
            status: String(r.status),
            amountMinor: num(r.amount_minor),
            currency: str(r.currency) ?? PLATFORM_BILLING_CURRENCY,
            accessEffect: str(r.access_effect),
            processedAt: str(r.processed_at),
            createdAt: String(r.created_at),
          })),
          manual: manual.filter(keep).map((m) => {
            const currency = (
              str(m.currency) ?? PLATFORM_BILLING_CURRENCY
            ).toUpperCase();
            return {
              status: String(m.status),
              paidMinor: safeMinor(m.paid_amount, currency),
              currency,
              reviewedAt: str(m.reviewed_at),
              createdAt: String(m.created_at),
            };
          }),
        },
        new Date()
      )
    );
  } catch (err) {
    return adminBillingErrorResponse(err, 'collected summary');
  }
}
