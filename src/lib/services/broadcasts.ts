// ============================================================
// Broadcast read services (Phase 5). Sending follows in Phase 7.
// ============================================================

import { buildPage, decodeCursor, keysetFilter } from '@/lib/api/v1/pagination';
import {
  ServiceError,
  UUID_RE,
  clampLimit,
  type ServiceContext,
} from './context';
import type { Page } from './contacts';

export const BROADCAST_PAGE = { default: 20, max: 50 };
export const BROADCAST_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export interface BroadcastSummary {
  id: string;
  name: string;
  status: string;
  template: { name: string; language: string | null };
  scheduled_at: string | null;
  counts: {
    recipients: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
  };
  created_at: string;
}

const BROADCAST_SELECT =
  'id, name, status, template_name, template_language, scheduled_at, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, created_at';

type BroadcastRow = {
  id: string;
  name: string;
  status: string;
  template_name: string;
  template_language: string | null;
  scheduled_at: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  replied_count: number | null;
  failed_count: number | null;
  created_at: string;
};

function toBroadcast(r: BroadcastRow): BroadcastSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    template: { name: r.template_name, language: r.template_language },
    scheduled_at: r.scheduled_at,
    counts: {
      recipients: r.total_recipients ?? 0,
      sent: r.sent_count ?? 0,
      delivered: r.delivered_count ?? 0,
      read: r.read_count ?? 0,
      replied: r.replied_count ?? 0,
      failed: r.failed_count ?? 0,
    },
    created_at: r.created_at,
  };
}

export async function listBroadcasts(
  ctx: ServiceContext,
  input: {
    status?: BroadcastStatus;
    limit?: number;
    cursor?: string | null;
  } = {}
): Promise<Page<BroadcastSummary>> {
  const limit = clampLimit(
    input.limit,
    BROADCAST_PAGE.default,
    BROADCAST_PAGE.max
  );
  let q = ctx.db
    .from('broadcasts')
    .select(BROADCAST_SELECT)
    .eq('account_id', ctx.accountId);
  if (input.status) q = q.eq('status', input.status);
  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not list broadcasts');
  const { items, nextCursor } = buildPage(
    (data ?? []) as BroadcastRow[],
    limit
  );
  return { items: items.map(toBroadcast), nextCursor };
}

export interface FailureReason {
  reason: string;
  code: string | null;
  count: number;
}

/** Group failed recipients by error, most common first. Pure. */
export function topFailureReasons(
  rows: { error_code: string | null; error_message: string | null }[],
  max = 5
): FailureReason[] {
  const groups = new Map<string, FailureReason>();
  for (const r of rows) {
    const reason =
      (r.error_message ?? '').trim().slice(0, 200) || 'Unknown error';
    const key = `${r.error_code ?? ''}|${reason}`;
    const g = groups.get(key) ?? { reason, code: r.error_code, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

const FAILURE_SAMPLE = 2000;

export async function getBroadcast(
  ctx: ServiceContext,
  broadcastId: string
): Promise<
  BroadcastSummary & {
    top_failure_reasons: FailureReason[];
    failure_sample_size: number;
  }
> {
  if (!UUID_RE.test(broadcastId))
    throw new ServiceError('not_found', 'Broadcast not found');
  const { data, error } = await ctx.db
    .from('broadcasts')
    .select(BROADCAST_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('id', broadcastId)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the broadcast');
  if (!data) throw new ServiceError('not_found', 'Broadcast not found');

  // Ownership is established above; recipients have no account_id.
  const { data: failed, error: fErr } = await ctx.db
    .from('broadcast_recipients')
    .select('error_code, error_message')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'failed')
    .limit(FAILURE_SAMPLE);
  if (fErr) throw new ServiceError('internal', 'Could not load the broadcast');
  const rows = (failed ?? []) as {
    error_code: string | null;
    error_message: string | null;
  }[];
  return {
    ...toBroadcast(data as BroadcastRow),
    top_failure_reasons: topFailureReasons(rows),
    failure_sample_size: rows.length,
  };
}
