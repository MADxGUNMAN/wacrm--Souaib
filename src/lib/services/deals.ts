// ============================================================
// Pipeline and deal read services (Phase 5). Writes follow in Phase 6.
// ============================================================

import { buildPage, decodeCursor, keysetFilter } from '@/lib/api/v1/pagination';
import {
  ServiceError,
  UUID_RE,
  clampLimit,
  type ServiceContext,
} from './context';
import type { Page } from './contacts';
import {
  membersByProfileId,
  one,
  profileIdForMember,
  type MemberRef,
} from './shared';

export const DEAL_PAGE = { default: 20, max: 50 };
export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export interface PipelineSummary {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    position: number;
    open_deals: number;
    open_value: number;
  }[];
}

export async function listPipelines(
  ctx: ServiceContext
): Promise<PipelineSummary[]> {
  const [pipes, deals] = await Promise.all([
    ctx.db
      .from('pipelines')
      .select('id, name, created_at, pipeline_stages(id, name, position)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true })
      .limit(50),
    ctx.db
      .from('deals')
      .select('stage_id, value')
      .eq('account_id', ctx.accountId)
      .eq('status', 'open')
      .limit(5000),
  ]);
  if (pipes.error || deals.error)
    throw new ServiceError('internal', 'Could not load pipelines');

  const byStage = new Map<string, { n: number; v: number }>();
  for (const d of (deals.data ?? []) as {
    stage_id: string;
    value: number | null;
  }[]) {
    const s = byStage.get(d.stage_id) ?? { n: 0, v: 0 };
    s.n += 1;
    s.v += Number(d.value ?? 0);
    byStage.set(d.stage_id, s);
  }
  return (
    (pipes.data ?? []) as unknown as {
      id: string;
      name: string;
      pipeline_stages: { id: string; name: string; position: number }[] | null;
    }[]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    stages: [...(p.pipeline_stages ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        open_deals: byStage.get(s.id)?.n ?? 0,
        open_value: byStage.get(s.id)?.v ?? 0,
      })),
  }));
}

export interface DealSummary {
  id: string;
  title: string;
  value: { amount: number; currency: string };
  status: string;
  pipeline: { id: string; name: string } | null;
  stage: { id: string; name: string } | null;
  contact: { id: string; name: string | null; phone: string } | null;
  assigned_to: MemberRef | null;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
}

const DEAL_SELECT =
  'id, title, value, currency, status, expected_close_date, created_at, updated_at, assigned_to, notes, conversation_id, pipeline:pipelines(id, name), stage:pipeline_stages(id, name), contact:contacts(id, name, phone)';

type DealRow = {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: string;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  notes: string | null;
  conversation_id: string | null;
  pipeline:
    { id: string; name: string } | { id: string; name: string }[] | null;
  stage: { id: string; name: string } | { id: string; name: string }[] | null;
  contact:
    | { id: string; name: string | null; phone: string }
    | { id: string; name: string | null; phone: string }[]
    | null;
};

function toDeal(
  r: DealRow,
  members: Map<string, MemberRef>,
  fallbackCurrency: string
): DealSummary {
  return {
    id: r.id,
    title: r.title,
    value: {
      amount: Number(r.value ?? 0),
      currency: r.currency || fallbackCurrency,
    },
    status: r.status,
    pipeline: one(r.pipeline),
    stage: one(r.stage),
    contact: one(r.contact),
    // deals.assigned_to is a profiles.id; expose the member's user id.
    assigned_to: r.assigned_to ? (members.get(r.assigned_to) ?? null) : null,
    expected_close_date: r.expected_close_date,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export interface ListDealsInput {
  pipelineId?: string;
  stageId?: string;
  status?: DealStatus;
  contactId?: string;
  assignedTo?: 'me' | 'unassigned' | string;
  minValue?: number;
  maxValue?: number;
  limit?: number;
  cursor?: string | null;
  currency?: string;
}

export async function listDeals(
  ctx: ServiceContext,
  input: ListDealsInput = {}
): Promise<Page<DealSummary>> {
  const limit = clampLimit(input.limit, DEAL_PAGE.default, DEAL_PAGE.max);
  for (const [name, v] of [
    ['pipeline_id', input.pipelineId],
    ['stage_id', input.stageId],
    ['contact_id', input.contactId],
  ] as const) {
    if (v !== undefined && !UUID_RE.test(v))
      throw new ServiceError('invalid_input', `${name} must be a UUID`);
  }
  const a = input.assignedTo;
  if (a && a !== 'me' && a !== 'unassigned' && !UUID_RE.test(a)) {
    throw new ServiceError(
      'invalid_input',
      "assigned_to must be 'me', 'unassigned' or a member id"
    );
  }

  let q = ctx.db
    .from('deals')
    .select(DEAL_SELECT)
    .eq('account_id', ctx.accountId);
  if (input.pipelineId) q = q.eq('pipeline_id', input.pipelineId);
  if (input.stageId) q = q.eq('stage_id', input.stageId);
  if (input.status) q = q.eq('status', input.status);
  if (input.contactId) q = q.eq('contact_id', input.contactId);
  if (a === 'unassigned') q = q.is('assigned_to', null);
  else if (a) {
    // Member ids are user ids; deals store the profile id.
    const profileId = await profileIdForMember(
      ctx,
      a === 'me' ? ctx.userId : a
    );
    if (!profileId) return { items: [], nextCursor: null };
    q = q.eq('assigned_to', profileId);
  }
  if (typeof input.minValue === 'number') q = q.gte('value', input.minValue);
  if (typeof input.maxValue === 'number') q = q.lte('value', input.maxValue);
  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not list deals');
  const { items, nextCursor } = buildPage(
    (data ?? []) as unknown as DealRow[],
    limit
  );
  const members = await membersByProfileId(
    ctx,
    items.map((r) => r.assigned_to)
  );
  return {
    items: items.map((r) => toDeal(r, members, input.currency ?? 'INR')),
    nextCursor,
  };
}

export async function getDeal(
  ctx: ServiceContext,
  dealId: string,
  currency = 'INR'
): Promise<
  DealSummary & { notes: string | null; conversation_id: string | null }
> {
  if (!UUID_RE.test(dealId))
    throw new ServiceError('not_found', 'Deal not found');
  const { data, error } = await ctx.db
    .from('deals')
    .select(DEAL_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('id', dealId)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the deal');
  if (!data) throw new ServiceError('not_found', 'Deal not found');
  const row = data as unknown as DealRow;
  const members = await membersByProfileId(ctx, [row.assigned_to]);
  return {
    ...toDeal(row, members, currency),
    notes: row.notes,
    conversation_id: row.conversation_id,
  };
}
