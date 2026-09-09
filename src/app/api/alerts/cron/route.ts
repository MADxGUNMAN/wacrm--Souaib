// ============================================================
// GET /api/alerts/cron — evaluate every enabled usage alert.
//
// Hit by deploy/cron-ping.sh every 5 minutes, authenticated with the same
// AUTOMATION_CRON_SECRET as the automations and flows crons — one secret
// for operators to provision, matching the note in /api/flows/cron.
//
// ─── Why running this 288 times a day is safe ────────────────
//
// Firing is idempotent at the DATABASE level, not in this file. Each
// notification is preceded by an INSERT into
// `whatsapp_usage_alert_events`, which carries
// UNIQUE(alert_id, period_key, threshold). The insert is the claim: if it
// succeeds this tick owns that threshold, and if it fails with 23505
// somebody else already sent it. Two overlapping ticks therefore cannot
// both notify, which a "read the events, then decide" approach in JS
// could not guarantee — both would read "not fired yet".
//
// Same reasoning as `record_webhook_failure` (migration 028): the state
// transition belongs in SQL.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import {
  evaluateUsage,
  pendingThresholds,
  periodLabel,
  periodStart,
  thresholdNotification,
  type UsageAlertPeriod,
} from '@/lib/alerts/usage-alerts';

/** Batch ceiling per tick, so one run cannot become unbounded work. */
const MAX_ALERTS_PER_RUN = 200;

interface AlertRow {
  id: string;
  account_id: string;
  period: UsageAlertPeriod;
  message_limit: number;
  thresholds: number[];
}

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

  const { data: alerts, error } = await admin
    .from('whatsapp_usage_alerts')
    .select('id, account_id, period, message_limit, thresholds')
    .eq('enabled', true)
    .limit(MAX_ALERTS_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ evaluated: 0, notified: 0 });
  }

  let evaluated = 0;
  let notified = 0;

  for (const row of alerts as AlertRow[]) {
    try {
      // Count via the SQL function, not by pulling rows. A month of
      // messages for a busy account would blow past any row limit, and
      // the existing account-info usage path caps at 20k for exactly
      // that reason.
      const { data: usedRaw, error: countError } = await admin.rpc(
        'fn_account_outbound_message_count',
        {
          target_account_id: row.account_id,
          since: periodStart(row.period).toISOString(),
        }
      );
      if (countError) {
        console.error(
          `[alerts/cron] count failed for account ${row.account_id}:`,
          countError.message
        );
        continue;
      }
      const used = typeof usedRaw === 'number' ? usedRaw : 0;

      const status = evaluateUsage(
        {
          enabled: true,
          period: row.period,
          messageLimit: row.message_limit,
          thresholds: row.thresholds,
        },
        used
      );
      evaluated += 1;

      // Observability only — the UNIQUE index is what guarantees
      // correctness. Written before any notification so "the cron is
      // alive" is recorded even on a tick that fires nothing.
      await admin
        .from('whatsapp_usage_alerts')
        .update({
          last_evaluated_at: new Date().toISOString(),
          last_usage_count: used,
        })
        .eq('id', row.id);

      if (status.crossed.length === 0) continue;

      const { data: firedRows } = await admin
        .from('whatsapp_usage_alert_events')
        .select('threshold')
        .eq('alert_id', row.id)
        .eq('period_key', status.periodKey);
      const alreadyFired = (firedRows ?? []).map((r) => r.threshold as number);

      const pending = pendingThresholds(status, alreadyFired);
      if (pending.length === 0) continue;

      // Recipients: the owner, plus any member explicitly granted
      // `settings_alerts`. Derived rather than stored, so removing a
      // member's permission stops their alerts with no extra bookkeeping.
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, account_role, permissions')
        .eq('account_id', row.account_id);

      const recipients = (profiles ?? [])
        .filter((p) => {
          if (p.account_role === 'owner') return true;
          const perms = (p.permissions ?? null) as Record<
            string,
            boolean | undefined
          > | null;
          return perms?.settings_alerts === true;
        })
        .map((p) => p.user_id as string);

      const label = periodLabel(row.period);

      for (const threshold of pending) {
        // CLAIM FIRST. If this insert loses to a concurrent tick the
        // unique index rejects it and we skip — no duplicate notification.
        const { error: claimError } = await admin
          .from('whatsapp_usage_alert_events')
          .insert({
            alert_id: row.id,
            account_id: row.account_id,
            period_key: status.periodKey,
            threshold,
            usage_count: used,
            message_limit: row.message_limit,
            notified_user_ids: recipients,
          });

        if (claimError) {
          if (isUniqueViolation(claimError)) continue;
          console.error(
            `[alerts/cron] could not claim threshold ${threshold} for ${row.account_id}:`,
            claimError.message
          );
          continue;
        }

        if (recipients.length === 0) continue;

        const copy = thresholdNotification(
          threshold,
          status,
          row.period,
          label
        );

        const { error: notifyError } = await admin.from('notifications').insert(
          recipients.map((userId) => ({
            account_id: row.account_id,
            user_id: userId,
            type: 'usage_threshold',
            title: copy.title,
            body: copy.body,
            // Somewhere to go. Before migration 079 added this column a
            // non-conversation notification was inert when clicked.
            link: '/settings?tab=alerts',
          }))
        );

        if (notifyError) {
          // The claim already succeeded, so this threshold will not be
          // retried. Deliberate: a repeating notification storm is worse
          // than one missed heads-up, and the event row keeps the record.
          console.error(
            `[alerts/cron] notification insert failed for ${row.account_id}:`,
            notifyError.message
          );
          continue;
        }

        notified += recipients.length;
      }
    } catch (err) {
      // One bad account must not stop the rest of the batch.
      console.error(
        `[alerts/cron] unexpected error for account ${row.account_id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({ evaluated, notified });
}
