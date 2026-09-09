// ============================================================
// GET  /api/alerts/usage — the alert config plus live usage
// PUT  /api/alerts/usage — save it (owner only)
//
// Read is allowed for the owner AND for a member granted
// `settings_alerts`, because someone watching the budget needs to see the
// number. Write is owner-only: a member who could raise their own budget
// would make the alert pointless.
//
// The owner check is enforced here AND by RLS (`usage_alerts_write` in
// migration 079 requires `is_account_member(account_id, 'owner')`), so a
// forgotten `if` in this file cannot become a privilege hole.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_PERIOD,
  DEFAULT_THRESHOLDS,
  evaluateUsage,
  normalizeThresholds,
  periodLabel,
  periodStart,
  type UsageAlertPeriod,
} from '@/lib/alerts/usage-alerts';

/** Hard ceiling on the budget. Guards a typo, not a real limit. */
const MAX_MESSAGE_LIMIT = 10_000_000;

interface AlertRow {
  id: string;
  enabled: boolean;
  period: UsageAlertPeriod;
  message_limit: number;
  thresholds: number[];
  last_evaluated_at: string | null;
  updated_at: string;
}

async function resolveCaller(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return { error: 'Unauthorized' as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role, permissions')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return {
      error: 'Your profile is not linked to an account.' as const,
      status: 403,
    };
  }

  const isOwner = profile?.account_role === 'owner';
  const permissions = (profile?.permissions ?? null) as Record<
    string,
    boolean | undefined
  > | null;
  // Absent key means NO for this section — the same deny-by-default rule
  // as OWNER_ONLY_SETTINGS_SECTIONS on the client. A member created before
  // migration 079 has no key at all and must not inherit access.
  const canRead = isOwner || permissions?.settings_alerts === true;

  return { userId: user.id, accountId, isOwner, canRead };
}

export async function GET() {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if ('error' in caller) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  if (!caller.canRead) {
    return NextResponse.json(
      { error: 'You do not have access to usage alerts.' },
      { status: 403 }
    );
  }

  const { data: row } = await supabase
    .from('whatsapp_usage_alerts')
    .select(
      'id, enabled, period, message_limit, thresholds, last_evaluated_at, updated_at'
    )
    .eq('account_id', caller.accountId)
    .maybeSingle();

  const alert = row as AlertRow | null;
  const period = alert?.period ?? DEFAULT_PERIOD;

  // Usage is computed even when no alert exists yet, so the setup screen
  // can show "you sent 1,240 this month" — a limit chosen against a real
  // number is far more likely to be useful than one guessed blind.
  const { data: usedRaw } = await supabase.rpc(
    'fn_account_outbound_message_count',
    {
      target_account_id: caller.accountId,
      since: periodStart(period).toISOString(),
    }
  );
  const used = typeof usedRaw === 'number' ? usedRaw : 0;

  const status = alert
    ? evaluateUsage(
        {
          enabled: alert.enabled,
          period: alert.period,
          messageLimit: alert.message_limit,
          thresholds: alert.thresholds,
        },
        used
      )
    : null;

  // Which thresholds have already notified this period — so the UI can say
  // "80% already sent" instead of implying it will fire again.
  let firedThisPeriod: number[] = [];
  if (alert && status) {
    const { data: events } = await supabase
      .from('whatsapp_usage_alert_events')
      .select('threshold')
      .eq('alert_id', alert.id)
      .eq('period_key', status.periodKey);
    firedThisPeriod = (events ?? [])
      .map((e) => e.threshold as number)
      .sort((a, b) => a - b);
  }

  return NextResponse.json({
    // Null means "never configured" — distinct from configured-and-off.
    alert: alert
      ? {
          enabled: alert.enabled,
          period: alert.period,
          message_limit: alert.message_limit,
          thresholds: alert.thresholds,
          last_evaluated_at: alert.last_evaluated_at,
          updated_at: alert.updated_at,
        }
      : null,
    usage: {
      used,
      period,
      period_label: periodLabel(period),
      period_resets_at: status?.periodEnd ?? null,
    },
    status,
    fired_this_period: firedThisPeriod,
    can_edit: caller.isOwner,
    defaults: {
      period: DEFAULT_PERIOD,
      thresholds: DEFAULT_THRESHOLDS,
      /** A starting point: this period's usage, rounded up, plus headroom. */
      suggested_limit: Math.max(100, Math.ceil((used * 1.5) / 100) * 100),
    },
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if ('error' in caller) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  if (!caller.isOwner) {
    return NextResponse.json(
      { error: 'Only the account owner can change usage alerts.' },
      { status: 403 }
    );
  }

  let body: {
    enabled?: unknown;
    period?: unknown;
    message_limit?: unknown;
    thresholds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const period: UsageAlertPeriod =
    body.period === 'weekly' ? 'weekly' : 'monthly';

  const limitRaw =
    typeof body.message_limit === 'number'
      ? body.message_limit
      : Number.parseInt(String(body.message_limit ?? ''), 10);
  if (!Number.isFinite(limitRaw) || limitRaw < 1) {
    return NextResponse.json(
      { error: 'Enter a message limit of at least 1.' },
      { status: 400 }
    );
  }
  if (limitRaw > MAX_MESSAGE_LIMIT) {
    return NextResponse.json(
      {
        error: `The limit cannot exceed ${MAX_MESSAGE_LIMIT.toLocaleString('en-US')}.`,
      },
      { status: 400 }
    );
  }

  const thresholds = normalizeThresholds(body.thresholds);
  if (thresholds.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one threshold between 1% and 200%.' },
      { status: 400 }
    );
  }

  // Upsert on account_id: the table has one row per account (UNIQUE), so
  // "create or update" is one statement and cannot race into duplicates.
  const { error } = await supabase.from('whatsapp_usage_alerts').upsert(
    {
      account_id: caller.accountId,
      enabled: body.enabled === true,
      period,
      message_limit: Math.round(limitRaw),
      thresholds,
      created_by: caller.userId,
    },
    { onConflict: 'account_id' }
  );

  if (error) {
    console.error('[alerts/usage] save failed:', error.message);
    return NextResponse.json(
      { error: `Could not save the alert: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
