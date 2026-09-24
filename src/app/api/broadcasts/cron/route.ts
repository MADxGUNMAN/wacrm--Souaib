// ============================================================
// GET /api/broadcasts/cron — send every scheduled broadcast that is due.
//
// Hit by deploy/cron-ping.sh every 5 minutes, authenticated with the
// same AUTOMATION_CRON_SECRET as the automations, flows, alerts and
// auto-mail crons — one secret for operators to provision.
//
// ─── Why running this 288 times a day is safe ─────────────────
//
// Every due broadcast is CLAIMED with a conditional update
// (status 'scheduled' → 'sending', guarded by `WHERE status =
// 'scheduled'`) before anything is sent. Postgres serialises those
// updates, so of two overlapping ticks exactly one gets the row and the
// other silently skips. See the header of
// `@/lib/whatsapp/scheduled-broadcasts` for the full reasoning.
//
// This matters more here than in the other crons: the failure mode is
// not a duplicate email, it is the same paid marketing message arriving
// twice on a customer's phone.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  MAX_SCHEDULED_PER_RUN,
  claimScheduledBroadcast,
  executeScheduledBroadcast,
  type DueBroadcastRow,
} from '@/lib/whatsapp/scheduled-broadcasts';

// The fan-out sends recipients sequentially with phone-variant retry, so
// a large scheduled campaign takes real time. Give it the same headroom
// the webhook and the public broadcast route take. This is a bound, not
// a guarantee: anything left unsent stays 'sending' and is reported, and
// MAX_SCHEDULED_PER_RUN keeps one tick from trying to do everything.
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Oldest due first, so a backlog drains in the order it was booked
  // rather than newest-first starving an overdue campaign. Served by
  // idx_broadcasts_due_scheduled.
  const { data: due, error } = await admin
    .from('broadcasts')
    .select(
      // user_id is required: the executor attributes each delivered
      // message to it in the Inbox thread, and a conversation created for
      // a first-time recipient needs an owner.
      'id, account_id, user_id, template_name, template_language, status, scheduled_at'
    )
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(MAX_SCHEDULED_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ due: 0, sent: 0, skipped: 0, failed: 0 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const results: { id: string; outcome: string; reason?: string }[] = [];

  for (const row of due as DueBroadcastRow[]) {
    try {
      const claim = await claimScheduledBroadcast(admin, row.id);
      if (claim === 'already_taken') {
        // Another tick (or an operator pressing Send now) got there
        // first. Normal, not an error.
        skipped++;
        results.push({ id: row.id, outcome: 'already_taken' });
        continue;
      }

      const result = await executeScheduledBroadcast(admin, row);
      if (result.outcome === 'sent') sent++;
      else if (result.outcome === 'failed') failed++;
      else skipped++;
      results.push({
        id: row.id,
        outcome: result.outcome,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    } catch (err) {
      // One broken campaign must not stop the rest of the queue. Mark it
      // failed so it leaves the sweep instead of being retried forever,
      // and record why on the row the operator can actually see.
      failed++;
      const reason = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[broadcast cron] ${row.id} failed:`, reason);
      await admin
        .from('broadcasts')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      results.push({ id: row.id, outcome: 'failed', reason });
    }
  }

  return NextResponse.json({
    due: due.length,
    sent,
    skipped,
    failed,
    results,
  });
}
