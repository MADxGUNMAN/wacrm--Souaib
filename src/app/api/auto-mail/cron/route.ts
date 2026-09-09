// ============================================================
// GET /api/auto-mail/cron — send due trial and renewal reminders.
//
// Hit by deploy/cron-ping.sh every 5 minutes, authenticated with the same
// AUTOMATION_CRON_SECRET as the automations, flows and alerts crons — one
// secret for an operator to provision.
//
// ─── Why running this 288 times a day is safe ────────────────
//
// Two independent guards, and neither is a JavaScript check:
//
//   1. `auto_email_log` carries a partial unique index on
//      (account_id, segment, window_end, offset_days) WHERE trigger =
//      'auto'. The INSERT is the claim. Two overlapping ticks cannot both
//      send, because one of them loses the index and gets 23505 — a
//      "read the log, then decide" approach in this file could not
//      guarantee that, since both ticks would read "not sent yet".
//
//   2. `resolveDueOffset` gives each reminder stage a day BAND rather
//      than an exact day, so a tick is never the only chance to fire.
//
// Together those mean this endpoint is safe to call as often as you like
// and still sends each reminder exactly once.
//
// ─── Deployment ─────────────────────────────────────────────
//
// Adding this route does nothing in production on its own:
// deploy/cron-ping.sh iterates a HARDCODED endpoint list, and the copy
// that actually runs lives at /opt/wacrm/cron-ping.sh. Both must be
// updated or this never fires.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  MAX_REMINDERS_PER_RUN,
  findDueReminders,
  loadRules,
  sendReminder,
} from '@/lib/auto-mail/reminders';
import { getGateConfig } from '@/lib/subscription/queries';

export const dynamic = 'force-dynamic';

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

  try {
    const rules = await loadRules(admin);

    // The same gate config the access check uses, so a reminder can never
    // contradict what the customer experiences. Fails open to enabled.
    const gateConfig = await getGateConfig();

    const due = await findDueReminders(admin, {
      rules,
      gateConfig,
      limit: MAX_REMINDERS_PER_RUN,
    });

    if (due.length === 0) {
      return NextResponse.json({ due: 0, sent: 0, failed: 0, skipped: 0 });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let alreadyClaimed = 0;

    for (const reminder of due) {
      const rule = rules[reminder.segment];
      if (!rule) continue;

      try {
        const outcome = await sendReminder(admin, {
          accountId: reminder.accountId,
          accountName: reminder.accountName,
          segment: reminder.segment,
          offsetDays: reminder.offsetDays,
          daysLeft: reminder.daysLeft,
          windowEnd: reminder.windowEnd,
          planName: reminder.planName,
          rule,
          trigger: 'auto',
        });

        if (outcome.status === 'sent') sent += 1;
        else if (outcome.status === 'failed') failed += 1;
        else if (outcome.status === 'skipped') skipped += 1;
        else alreadyClaimed += 1;
      } catch (err) {
        // One bad account must not abort the batch — the remaining
        // reminders are time-sensitive and there is no second attempt
        // today for a stage whose band has passed.
        failed += 1;
        console.error(
          `[auto-mail/cron] unexpected error for account ${reminder.accountId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Returned as JSON because cron-ping.sh writes the body into
    // /opt/wacrm/cron.log — these numbers are the only operational
    // visibility this job has.
    return NextResponse.json({
      due: due.length,
      sent,
      failed,
      skipped,
      alreadyClaimed,
    });
  } catch (err) {
    console.error(
      '[auto-mail/cron] run failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: 'auto-mail run failed' },
      { status: 500 }
    );
  }
}
