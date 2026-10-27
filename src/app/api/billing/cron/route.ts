// ============================================================
// GET /api/billing/cron — Razorpay reconciliation and email outbox.
//
// Hit by deploy/cron-ping.sh every 5 minutes with the shared
// AUTOMATION_CRON_SECRET (x-cron-secret), like the other crons. Runs
// plan section 3.8: retry stored webhook events, refetch overdue and
// stale subscriptions, close abandoned checkouts, deliver due emails,
// apply retention. Writes a billing_reconciliation_runs row and returns
// counts, which cron-ping.sh records in /opt/wacrm/cron.log.
//
// Safe to run as often as you like and from more than one container:
// every unit of work is claimed with FOR UPDATE SKIP LOCKED, access only
// moves forward with greatest(), and emails are deduped by key.
//
// Where Razorpay is not configured (production today) it answers
// {"skipped":"not_configured"} and does nothing.
//
// Adding this route is not enough on its own: deploy/cron-ping.sh names
// it, and the copy at /opt/wacrm/cron-ping.sh must be updated by hand.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { getRazorpayConfig } from '@/lib/billing/razorpay/config';
import {
  deliverBillingEmails,
  getEventDeps,
} from '@/lib/billing/razorpay/jobs';
import { runReconciliation } from '@/lib/billing/razorpay/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) return false;
  const supplied = Buffer.from(request.headers.get('x-cron-secret') ?? '');
  const want = Buffer.from(expected);
  return supplied.length === want.length && timingSafeEqual(supplied, want);
}

export async function GET(request: Request) {
  if (!process.env.AUTOMATION_CRON_SECRET) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = getRazorpayConfig();
  if (!config) {
    return NextResponse.json({ skipped: 'not_configured' });
  }

  try {
    const deps = getEventDeps();
    const started = Date.now();
    const summary = await runReconciliation(deps, {
      deliver: () => deliverBillingEmails(deps, { limit: 20 }),
    });
    return NextResponse.json({
      mode: config.mode,
      ms: Date.now() - started,
      events: summary.events,
      subscriptions: summary.subscriptions,
      notifications: summary.notifications,
      purged: summary.purged,
      errors: summary.errors.length,
    });
  } catch (err) {
    console.error(
      '[billing/cron] run failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'billing run failed' }, { status: 500 });
  }
}
