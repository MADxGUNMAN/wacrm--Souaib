// ============================================================
// Deal write services (Phase 6), mirroring the deal form: a new deal is
// `status: 'open'` with the creating user as `user_id`.
// Contact, pipeline, stage and assignee are all checked against the
// caller's account before anything is written.
// ============================================================

import { ServiceError, UUID_RE, type ServiceContext } from './context';
import { assertActiveMember } from './conversation-writes';
import { getDeal } from './deals';
import { profileIdForMember } from './shared';

/** Member (user id) → the profiles.id deals.assigned_to stores. */
async function assigneeProfileId(
  ctx: ServiceContext,
  userId: string
): Promise<string> {
  await assertActiveMember(ctx, userId);
  const profileId = await profileIdForMember(ctx, userId);
  if (!profileId)
    throw new ServiceError(
      'not_found',
      'Team member not found (see list_team_members)'
    );
  return profileId;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function validDate(v: string): boolean {
  return DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

async function assertOwned(
  ctx: ServiceContext,
  table: 'contacts' | 'pipelines',
  id: string,
  label: string
) {
  if (!UUID_RE.test(id))
    throw new ServiceError('not_found', `${label} not found`);
  const { data, error } = await ctx.db
    .from(table)
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new ServiceError(
      'internal',
      `Could not check the ${label.toLowerCase()}`
    );
  if (!data) throw new ServiceError('not_found', `${label} not found`);
}

/** The stage if it belongs to the pipeline; the pipeline's first stage when omitted. */
async function resolveStage(
  ctx: ServiceContext,
  pipelineId: string,
  stageId?: string
): Promise<string> {
  const { data, error } = await ctx.db
    .from('pipeline_stages')
    .select('id, position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });
  if (error)
    throw new ServiceError('internal', 'Could not load the pipeline stages');
  const stages = (data ?? []) as { id: string }[];
  if (!stages.length)
    throw new ServiceError('invalid_input', 'That pipeline has no stages');
  if (!stageId) return stages[0].id;
  if (!stages.some((s) => s.id === stageId)) {
    throw new ServiceError(
      'invalid_input',
      'That stage is not in the pipeline (see list_pipelines)'
    );
  }
  return stageId;
}

export interface CreateDealInput {
  contactId: string;
  pipelineId: string;
  stageId?: string;
  title: string;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  assignedTo?: 'me' | string;
  notes?: string;
}

export async function createDeal(
  ctx: ServiceContext,
  input: CreateDealInput,
  defaultCurrency = 'INR'
) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new ServiceError('invalid_input', 'The deal needs a title');
  if (
    input.value !== undefined &&
    (!Number.isFinite(input.value) || input.value < 0)
  ) {
    throw new ServiceError('invalid_input', 'value must be 0 or more');
  }
  const currency = (input.currency ?? defaultCurrency).toUpperCase();
  if (!CURRENCY_RE.test(currency))
    throw new ServiceError(
      'invalid_input',
      'currency must be a 3-letter code like INR'
    );
  if (input.expectedCloseDate && !validDate(input.expectedCloseDate)) {
    throw new ServiceError(
      'invalid_input',
      'expected_close_date must be YYYY-MM-DD'
    );
  }
  await assertOwned(ctx, 'contacts', input.contactId, 'Contact');
  await assertOwned(ctx, 'pipelines', input.pipelineId, 'Pipeline');
  const stageId = await resolveStage(ctx, input.pipelineId, input.stageId);
  const assigneeUser =
    input.assignedTo === 'me' ? ctx.userId : (input.assignedTo ?? null);
  const assignee = assigneeUser
    ? await assigneeProfileId(ctx, assigneeUser)
    : null;

  const { data, error } = await ctx.db
    .from('deals')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      contact_id: input.contactId,
      pipeline_id: input.pipelineId,
      stage_id: stageId,
      title,
      value: input.value ?? 0,
      currency,
      expected_close_date: input.expectedCloseDate ?? null,
      assigned_to: assignee,
      notes: input.notes?.trim().slice(0, 5000) || null,
      status: 'open',
    })
    .select('id')
    .single();
  if (error || !data)
    throw new ServiceError('internal', 'Could not create the deal');
  return getDeal(ctx, data.id as string, currency);
}

export interface UpdateDealInput {
  title?: string;
  value?: number;
  pipelineId?: string;
  stageId?: string;
  expectedCloseDate?: string | null;
  assignedTo?: 'me' | string | null;
  notes?: string | null;
}

export async function updateDeal(
  ctx: ServiceContext,
  dealId: string,
  input: UpdateDealInput,
  defaultCurrency = 'INR'
) {
  if (!UUID_RE.test(dealId))
    throw new ServiceError('not_found', 'Deal not found');
  const { data: deal, error: dErr } = await ctx.db
    .from('deals')
    .select('id, pipeline_id, stage_id')
    .eq('account_id', ctx.accountId)
    .eq('id', dealId)
    .maybeSingle();
  if (dErr) throw new ServiceError('internal', 'Could not load the deal');
  if (!deal) throw new ServiceError('not_found', 'Deal not found');

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim().slice(0, 200);
    if (!t)
      throw new ServiceError('invalid_input', 'The title cannot be empty');
    patch.title = t;
  }
  if (input.value !== undefined) {
    if (!Number.isFinite(input.value) || input.value < 0)
      throw new ServiceError('invalid_input', 'value must be 0 or more');
    patch.value = input.value;
  }
  if (input.pipelineId !== undefined || input.stageId !== undefined) {
    const pipelineId = input.pipelineId ?? (deal.pipeline_id as string);
    if (input.pipelineId)
      await assertOwned(ctx, 'pipelines', input.pipelineId, 'Pipeline');
    patch.pipeline_id = pipelineId;
    patch.stage_id = await resolveStage(ctx, pipelineId, input.stageId);
  }
  if (input.expectedCloseDate !== undefined) {
    if (
      input.expectedCloseDate !== null &&
      !validDate(input.expectedCloseDate)
    ) {
      throw new ServiceError(
        'invalid_input',
        'expected_close_date must be YYYY-MM-DD'
      );
    }
    patch.expected_close_date = input.expectedCloseDate;
  }
  if (input.assignedTo !== undefined) {
    const a = input.assignedTo === 'me' ? ctx.userId : input.assignedTo;
    patch.assigned_to = a ? await assigneeProfileId(ctx, a) : null;
  }
  if (input.notes !== undefined)
    patch.notes =
      input.notes === null ? null : input.notes.trim().slice(0, 5000) || null;
  if (!Object.keys(patch).length)
    throw new ServiceError('invalid_input', 'Nothing to change');

  const { error } = await ctx.db
    .from('deals')
    .update(patch)
    .eq('account_id', ctx.accountId)
    .eq('id', dealId);
  if (error) throw new ServiceError('internal', 'Could not update the deal');
  return {
    deal: await getDeal(ctx, dealId, defaultCurrency),
    changed: Object.keys(patch),
  };
}

export async function closeDeal(
  ctx: ServiceContext,
  dealId: string,
  outcome: 'won' | 'lost',
  defaultCurrency = 'INR'
) {
  if (outcome !== 'won' && outcome !== 'lost')
    throw new ServiceError('invalid_input', 'outcome must be won or lost');
  const before = await getDeal(ctx, dealId, defaultCurrency);
  if (before.status !== outcome) {
    const { error } = await ctx.db
      .from('deals')
      .update({ status: outcome })
      .eq('account_id', ctx.accountId)
      .eq('id', dealId);
    if (error) throw new ServiceError('internal', 'Could not close the deal');
  }
  return {
    deal: await getDeal(ctx, dealId, defaultCurrency),
    previous_status: before.status,
  };
}
