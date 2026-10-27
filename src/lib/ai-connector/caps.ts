// ============================================================
// Daily caps for AI-initiated sends (02 T17).
//
// `reserveUsage` calls the `ai_usage_try_increment` RPC BEFORE the side
// effect: the RPC serialises per account and only increments when the
// new totals stay within every cap, so two concurrent sends can't both
// slip under the limit. Days are counted in the workspace's timezone so
// "resets at midnight" means the user's midnight.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UsageRequest {
  accountId: string;
  connectionId: string;
  messages?: number;
  broadcastRecipients?: number;
  writes?: number;
  caps: {
    connectionMessagesPerDay: number;
    accountMessagesPerDay: number;
    accountBroadcastRecipientsPerDay: number;
  };
  timezone?: string;
  now?: Date;
}

export interface UsageResult {
  allowed: boolean;
  connectionMessages: number;
  accountMessages: number;
  accountRecipients: number;
  day: string;
}

/** YYYY-MM-DD in `timezone` (falls back to UTC for an invalid zone). */
export function dayInTimezone(now: Date, timezone = 'UTC'): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  try {
    return fmt(timezone);
  } catch {
    return fmt('UTC');
  }
}

export async function reserveUsage(
  db: SupabaseClient,
  req: UsageRequest
): Promise<UsageResult> {
  const day = dayInTimezone(req.now ?? new Date(), req.timezone);
  const { data, error } = await db.rpc('ai_usage_try_increment', {
    p_account_id: req.accountId,
    p_connection_id: req.connectionId,
    p_day: day,
    p_messages: req.messages ?? 0,
    p_recipients: req.broadcastRecipients ?? 0,
    p_writes: req.writes ?? 0,
    p_connection_msg_cap: req.caps.connectionMessagesPerDay,
    p_account_msg_cap: req.caps.accountMessagesPerDay,
    p_account_rcpt_cap: req.caps.accountBroadcastRecipientsPerDay,
  });
  if (error) throw new Error(`usage reservation failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        allowed: boolean;
        connection_messages: number;
        account_messages: number;
        account_recipients: number;
      }
    | undefined;
  if (!row) throw new Error('usage reservation returned no row');
  return {
    allowed: row.allowed === true,
    connectionMessages: row.connection_messages,
    accountMessages: row.account_messages,
    accountRecipients: row.account_recipients,
    day,
  };
}
