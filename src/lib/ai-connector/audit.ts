// ============================================================
// AI connector audit log (ai_audit_log).
//
// One row per tool call and per OAuth event. The argument summary keeps
// ids, counts, booleans and short enum-like strings, and replaces any
// free text with its length — message bodies already live in `messages`
// and must not be copied here. Writes never block or fail the request.
// Plan: docs/ai-connector/02-security.md §3.6.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { redactString } from './redact';
import type { Platform } from './platforms';

export type AuditOutcome = 'ok' | 'denied' | 'error' | 'confirmation_required';

export interface AuditEntry {
  accountId: string;
  connectionId: string | null;
  userId: string | null;
  platform: Platform | null;
  /** Tool name or an OAuth event such as `oauth.connected`. */
  action: string;
  args?: unknown;
  outcome: AuditOutcome;
  denyReason?: string | null;
  affectedIds?: string[];
  durationMs?: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Short machine-ish values (status names, template names, E.164 phones). */
const SHORT_TOKEN_RE = /^[A-Za-z0-9_.:+\-@]{1,64}$/;
const MAX_KEYS = 30;
const MAX_ARRAY = 20;

/**
 * Arguments that carry words someone wrote (a message, a note, a name, a
 * search term, template variables). Their strings are always reduced to a
 * length, however short: "Hi" passes SHORT_TOKEN_RE but is still a
 * message body (found in the Phase 8 audit review).
 */
const FREE_TEXT_KEYS = new Set([
  'text',
  'query',
  'name',
  'email',
  'company',
  'title',
  'notes',
  'value',
  'label',
  'description',
  'header_text',
  'body_variables',
  'button_url_suffixes',
]);

function summarizeValue(
  value: unknown,
  depth: number,
  freeText = false
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (freeText) return { text_length: value.length };
    const clean = redactString(value);
    if (UUID_RE.test(clean) || SHORT_TOKEN_RE.test(clean)) return clean;
    return { text_length: value.length };
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY)
      .map((v) => summarizeValue(v, depth + 1, freeText));
    return value.length > MAX_ARRAY ? { items, total: value.length } : items;
  }
  if (typeof value === 'object' && depth < 3) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_KEYS
    )) {
      out[k] = summarizeValue(v, depth + 1, freeText || FREE_TEXT_KEYS.has(k));
    }
    return out;
  }
  return '[omitted]';
}

/** Redacted, size-bounded summary of tool arguments. */
export function summarizeArgs(args: unknown): unknown {
  return summarizeValue(args, 0);
}

export function buildAuditRow(entry: AuditEntry) {
  return {
    account_id: entry.accountId,
    connection_id: entry.connectionId,
    user_id: entry.userId,
    platform: entry.platform,
    action: entry.action.slice(0, 80),
    args_summary: entry.args === undefined ? null : summarizeArgs(entry.args),
    outcome: entry.outcome,
    deny_reason: entry.denyReason ? entry.denyReason.slice(0, 300) : null,
    affected_ids: (entry.affectedIds ?? [])
      .filter((id) => UUID_RE.test(id))
      .slice(0, 100),
    duration_ms:
      entry.durationMs === undefined
        ? null
        : Math.max(0, Math.round(entry.durationMs)),
  };
}

/**
 * Insert an audit row with the service-role client. Never throws: an
 * audit failure is logged and the user's action still completes.
 */
export async function writeAudit(
  db: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  try {
    const { error } = await db
      .from('ai_audit_log')
      .insert(buildAuditRow(entry));
    if (error)
      console.error('[ai-connector] audit insert failed:', error.message);
  } catch (err) {
    console.error(
      '[ai-connector] audit insert threw:',
      err instanceof Error ? err.message : 'unknown'
    );
  }
}
