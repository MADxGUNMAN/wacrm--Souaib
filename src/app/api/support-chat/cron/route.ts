// ============================================================
// GET /api/support-chat/cron — email customers whose support reply is
// sitting unread while they are away.
//
// Hit by deploy/cron-ping.sh every 5 minutes, authenticated with the same
// AUTOMATION_CRON_SECRET as the automations, flows, alerts, auto-mail and
// broadcasts crons — one secret for an operator to provision.
//
// ─── Why running this 288 times a day is safe ────────────────
//
// `support_reply_emails` carries UNIQUE(message_id), and the INSERT is the
// claim. Two overlapping ticks cannot both email about one reply: the
// loser gets 23505 and counts it as a skip. A "read the ledger, then
// decide" check in JavaScript could not promise that, because both ticks
// would read "not sent yet".
//
// On top of that, eligibility is recomputed from live state every tick
// rather than queued, so a tick is never the only chance to fire — a
// conversation that is filtered out at 10:00 because somebody was online
// is simply reconsidered at 10:05.
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

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { sendDueReplyEmails } from '@/lib/support-chat/reply-email';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }

  // Constant-time compare so an attacker who can reach the endpoint cannot
  // recover the secret a byte at a time. The length pre-check is required
  // by timingSafeEqual (it throws on a mismatch) and leaks only the
  // length, which is not sensitive.
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const outcome = await sendDueReplyEmails(supabaseAdmin());

    // Returned as JSON because cron-ping.sh writes the body into
    // /opt/wacrm/cron.log — these numbers are the only operational
    // visibility this job has.
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    console.error(
      '[support-chat/cron] run failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sweep failed.' },
      { status: 500 }
    );
  }
}
