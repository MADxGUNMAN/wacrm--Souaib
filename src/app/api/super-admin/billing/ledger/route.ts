// ============================================================
// GET /api/super-admin/billing/ledger
//
// All payments: one read-only ledger of Razorpay payments
// (billing_payments, both modes) and manual UPI payment requests
// (payment_requests), newest first, each with its channel. Super admin
// only. No writes.
//
// Query: channel (all|razorpay|manual_upi), status (all|paid|pending|
// failed|rejected|refunded|partially_refunded), mode (all|live|test,
// Razorpay mode, manual rows have none), search, sort (date:desc|
// date:asc|amount:desc), page, pageSize (10|20|50|100, default 20).
// Invalid enum values answer 400.
//
// Response: { items, total, page, pageSize, totalPages, counts: {
// channel, status }, truncated }. Each count dimension ignores its own
// filter, so the summary strip agrees with the table.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { loadBillingDirectory } from '@/lib/billing/admin-lookups';
import {
  LEDGER_CHANNELS,
  LEDGER_SORTS,
  selectLedgerPage,
  type LedgerParams,
} from '@/lib/billing/ledger';
import {
  loadManualLedgerRows,
  loadRazorpayLedgerRows,
} from '@/lib/billing/ledger-db';
import { isLedgerStatus } from '@/lib/billing/ledger-status';
import {
  adminBillingErrorResponse,
  adminError,
  adminJson,
} from '@/lib/billing/razorpay/admin-http';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

const PAGE_SIZES = new Set([10, 20, 50, 100]);
const CAP = 10000;

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const sp = new URL(request.url).searchParams;

    const channel = sp.get('channel') ?? 'all';
    const status = sp.get('status') ?? 'all';
    const mode = sp.get('mode') ?? 'all';
    const sort = sp.get('sort') ?? 'date:desc';
    if (
      channel !== 'all' &&
      !(LEDGER_CHANNELS as readonly string[]).includes(channel)
    ) {
      return adminError(`Unknown channel: ${channel}`, 'bad_request', 400);
    }
    if (status !== 'all' && !isLedgerStatus(status)) {
      return adminError(`Unknown status: ${status}`, 'bad_request', 400);
    }
    if (!['all', 'live', 'test'].includes(mode)) {
      return adminError(`Unknown mode: ${mode}`, 'bad_request', 400);
    }
    if (!(LEDGER_SORTS as readonly string[]).includes(sort)) {
      return adminError(`Unknown sort: ${sort}`, 'bad_request', 400);
    }
    const page = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
    const requested = Number(sp.get('pageSize')) || 20;
    const pageSize = PAGE_SIZES.has(requested) ? requested : 20;

    const admin = supabaseAdmin();
    const dir = await loadBillingDirectory(admin);
    const [razorpay, manual] = await Promise.all([
      loadRazorpayLedgerRows(admin, dir, CAP),
      loadManualLedgerRows(admin, dir, CAP),
    ]);

    const result = selectLedgerPage([...razorpay.rows, ...manual.rows], {
      channel: channel as LedgerParams['channel'],
      status: status as LedgerParams['status'],
      mode: mode as LedgerParams['mode'],
      search: (sp.get('search') ?? '').trim(),
      sort: sort as LedgerParams['sort'],
      page,
      pageSize,
    });

    return adminJson({
      ...result,
      truncated: razorpay.truncated || manual.truncated,
    });
  } catch (err) {
    return adminBillingErrorResponse(err, 'payments ledger');
  }
}
