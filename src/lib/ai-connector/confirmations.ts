// ============================================================
// Two-step confirmations (D9): preview → confirmation_id → execute.
//
// A confirmation is bound to the connection, the tool and the exact
// arguments (stable hash), expires in 10 minutes and can be used once.
// Consumption is a single conditional UPDATE, so a replay or a race
// between two executions can only ever succeed once.
// ============================================================

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TTL, addSeconds, generateId } from './tokens';

/** JSON with object keys sorted at every level; arrays keep their order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function hashArgs(tool: string, args: unknown): string {
  return crypto
    .createHash('sha256')
    .update(`${tool}\n${stableStringify(args)}`)
    .digest('hex');
}

export const CONFIRMATION_ID_RE = /^cnf_[A-Za-z0-9_-]{22}$/;

export async function createConfirmation(
  db: SupabaseClient,
  input: {
    connectionId: string;
    tool: string;
    args: unknown;
    preview: unknown;
    now?: Date;
  }
): Promise<{ id: string; expiresAt: Date }> {
  const id = generateId('cnf_');
  const expiresAt = addSeconds(input.now ?? new Date(), TTL.confirmation);
  const { error } = await db.from('ai_confirmations').insert({
    id,
    connection_id: input.connectionId,
    tool: input.tool,
    args_hash: hashArgs(input.tool, input.args),
    preview: input.preview ?? {},
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`could not store confirmation: ${error.message}`);
  return { id, expiresAt };
}

export type ConsumeResult =
  | { ok: true; preview: unknown }
  | { ok: false; reason: 'invalid' | 'expired_or_used' };

/**
 * Atomically mark a confirmation used. Fails for a wrong id, another
 * connection, another tool, different arguments, an expired or already
 * used confirmation — without saying which, so ids can't be probed.
 */
export async function consumeConfirmation(
  db: SupabaseClient,
  input: {
    id: string;
    connectionId: string;
    tool: string;
    args: unknown;
    now?: Date;
  }
): Promise<ConsumeResult> {
  if (!CONFIRMATION_ID_RE.test(input.id))
    return { ok: false, reason: 'invalid' };
  const now = (input.now ?? new Date()).toISOString();
  const { data, error } = await db
    .from('ai_confirmations')
    .update({ used_at: now })
    .eq('id', input.id)
    .eq('connection_id', input.connectionId)
    .eq('tool', input.tool)
    .eq('args_hash', hashArgs(input.tool, input.args))
    .is('used_at', null)
    .gt('expires_at', now)
    .select('preview');
  if (error)
    throw new Error(`could not consume confirmation: ${error.message}`);
  const row = data?.[0] as { preview: unknown } | undefined;
  return row
    ? { ok: true, preview: row.preview }
    : { ok: false, reason: 'expired_or_used' };
}
