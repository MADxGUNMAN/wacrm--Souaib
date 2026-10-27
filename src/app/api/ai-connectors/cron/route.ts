// ============================================================
// GET /api/ai-connectors/cron — AI connector housekeeping.
//
// Hit by deploy/cron-ping.sh every 5 minutes with AUTOMATION_CRON_SECRET
// (same secret as the other crons).
//
//   1. Deletes expired authorization requests, codes, tokens and
//      confirmations, and audit rows past retention (store.cleanupExpired).
//   2. Revokes connections unused for longer than their own idle window
//      (settings.idle_days, default 30) — reason `idle`.
//
// Idempotent: deletes are by expiry, and revocation is a conditional
// UPDATE (`revoked_at IS NULL`), so overlapping ticks do no harm.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/ai-connector/audit';
import { getConfig } from '@/lib/ai-connector/config';
import { idleConnectionIds } from '@/lib/ai-connector/housekeeping';
import {
  adminDb,
  cleanupExpired,
  revokeConnection,
  type ConnectionRow,
} from '@/lib/ai-connector/store';
import { CONNECTION_CAP_LIMITS } from '@/lib/ai-connector/settings';

const MAX_IDLE_CHECKS_PER_RUN = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(request: Request): boolean | null {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) return null;
  const supplied = Buffer.from(request.headers.get('x-cron-secret') ?? '');
  const want = Buffer.from(expected);
  return supplied.length === want.length && timingSafeEqual(supplied, want);
}

export async function GET(request: Request) {
  const auth = authorized(request);
  if (auth === null) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (!auth)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Off (or misconfigured) in this deployment: nothing to maintain here.
  // devcrm and wacrm share one database, so either one being on is enough.
  if (!getConfig().enabled) return NextResponse.json({ skipped: 'disabled' });

  const db = adminDb();
  const now = new Date();
  const deleted = await cleanupExpired(db, now);

  // Candidates: unused for at least the shortest possible idle window.
  const cutoff = new Date(
    now.getTime() - CONNECTION_CAP_LIMITS.idleDaysMin * DAY_MS
  ).toISOString();
  const { data, error } = await db
    .from('ai_connections')
    .select(
      'id, account_id, user_id, platform, settings, last_used_at, created_at'
    )
    .is('revoked_at', null)
    .or(
      `last_used_at.lt.${cutoff},and(last_used_at.is.null,created_at.lt.${cutoff})`
    )
    .limit(MAX_IDLE_CHECKS_PER_RUN);
  if (error) {
    return NextResponse.json(
      { deleted, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Pick<
    ConnectionRow,
    | 'id'
    | 'account_id'
    | 'user_id'
    | 'platform'
    | 'settings'
    | 'last_used_at'
    | 'created_at'
  >[];
  const idle = new Set(idleConnectionIds(rows, now));
  let revoked = 0;
  for (const row of rows) {
    if (!idle.has(row.id)) continue;
    try {
      await revokeConnection(db, row.id, 'idle');
      revoked += 1;
      await writeAudit(db, {
        accountId: row.account_id,
        connectionId: row.id,
        userId: row.user_id,
        platform: row.platform,
        action: 'oauth.revoked_idle',
        outcome: 'ok',
      });
    } catch (err) {
      console.error(
        '[ai-connector] idle revoke failed:',
        err instanceof Error ? err.message : 'unknown'
      );
    }
  }

  return NextResponse.json({
    deleted,
    idle_checked: rows.length,
    idle_revoked: revoked,
  });
}
