// ============================================================
// Automation and flow on/off switches for the AI connector (Phase 7,
// 03 §4.7). They mirror the dashboard routes exactly:
//
//   * automations: only the member who created one may switch it
//     (PATCH /api/automations/[id] checks `user_id`); switching ON runs
//     the same trigger + step validation, so a broken automation can't
//     go live.
//   * flows: active ↔ draft (draft is how a flow is paused); activating
//     runs validateFlowForActivation (POST /api/flows/[id]/activate).
//
// The row is read and written with the user's JWT, so RLS applies too.
// Steps are read with loadStepsTree (service role) only after the
// automation was found in this account under that JWT.
// ============================================================

import { ServiceError, UUID_RE, type ServiceContext } from './context';
import { loadStepsTree } from '@/lib/automations/steps-tree';
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate';
import { validateFlowForActivation } from '@/lib/flows/validate';

function issuesText(messages: string[]): string {
  const shown = messages
    .slice(0, 5)
    .map((m) => m.replace(/[.\s]+$/, ''))
    .join('; ');
  const more = messages.length > 5 ? ` (and ${messages.length - 5} more)` : '';
  return `${shown}${more}`;
}

export async function setAutomationActive(
  ctx: ServiceContext,
  automationId: string,
  active: boolean
): Promise<{
  id: string;
  name: string;
  active: boolean;
  previous: boolean;
  changed: boolean;
}> {
  if (!UUID_RE.test(automationId))
    throw new ServiceError('not_found', 'Automation not found');
  const { data, error } = await ctx.db
    .from('automations')
    .select('id, name, user_id, is_active, trigger_type, trigger_config')
    .eq('account_id', ctx.accountId)
    .eq('id', automationId)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not load the automation');
  if (!data) throw new ServiceError('not_found', 'Automation not found');
  const a = data as {
    id: string;
    name: string;
    user_id: string;
    is_active: boolean;
    trigger_type: string;
    trigger_config: unknown;
  };
  if (a.user_id !== ctx.userId)
    throw new ServiceError(
      'invalid_input',
      'Only the team member who created this automation can switch it on or off'
    );
  const previous = a.is_active === true;
  if (previous === active)
    return { id: a.id, name: a.name, active, previous, changed: false };

  if (active) {
    let steps;
    try {
      steps = await loadStepsTree(a.id);
    } catch {
      throw new ServiceError('internal', 'Could not load the automation steps');
    }
    const issues = [
      ...validateTriggerForActivation(a.trigger_type, a.trigger_config),
      ...validateStepsForActivation(steps),
    ];
    if (issues.length)
      throw new ServiceError(
        'invalid_input',
        `This automation can't be switched on until it is fixed in Replai: ${issuesText(issues.map((i) => i.message))}`
      );
  }

  const { data: updated, error: updErr } = await ctx.db
    .from('automations')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('account_id', ctx.accountId)
    .eq('id', a.id)
    .select('id');
  // RLS refusing an update returns no rows rather than an error.
  if (updErr || !updated?.length)
    throw new ServiceError('internal', 'Could not update the automation');
  return { id: a.id, name: a.name, active, previous, changed: true };
}

export type SettableFlowStatus = 'active' | 'draft';

export async function setFlowStatus(
  ctx: ServiceContext,
  flowId: string,
  status: SettableFlowStatus
): Promise<{
  id: string;
  name: string;
  status: SettableFlowStatus;
  previous: string;
  changed: boolean;
}> {
  if (!UUID_RE.test(flowId))
    throw new ServiceError('not_found', 'Flow not found');
  const { data, error } = await ctx.db
    .from('flows')
    .select('id, name, status, trigger_type, trigger_config, entry_node_id')
    .eq('account_id', ctx.accountId)
    .eq('id', flowId)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the flow');
  if (!data) throw new ServiceError('not_found', 'Flow not found');
  const f = data as {
    id: string;
    name: string;
    status: string;
    trigger_type: 'keyword' | 'first_inbound_message' | 'manual';
    trigger_config: Record<string, unknown> | null;
    entry_node_id: string | null;
  };
  if (f.status === status)
    return {
      id: f.id,
      name: f.name,
      status,
      previous: f.status,
      changed: false,
    };

  if (status === 'active') {
    const { data: nodes, error: nodesErr } = await ctx.db
      .from('flow_nodes')
      .select('node_key, node_type, config')
      .eq('flow_id', f.id);
    if (nodesErr) throw new ServiceError('internal', 'Could not load the flow');
    const blockers = validateFlowForActivation(
      {
        name: f.name,
        trigger_type: f.trigger_type,
        trigger_config: f.trigger_config ?? {},
        entry_node_id: f.entry_node_id,
      },
      (nodes ?? []) as {
        node_key: string;
        node_type: string;
        config: Record<string, unknown>;
      }[]
    ).filter((i) => i.severity === 'error');
    if (blockers.length)
      throw new ServiceError(
        'invalid_input',
        `This flow can't be activated until it is fixed in Replai: ${issuesText(blockers.map((i) => i.message))}`
      );
  }

  const previous = f.status;
  const { data: updated, error: updErr } = await ctx.db
    .from('flows')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('account_id', ctx.accountId)
    .eq('id', f.id)
    .select('id');
  if (updErr || !updated?.length)
    throw new ServiceError('internal', 'Could not update the flow');
  return { id: f.id, name: f.name, status, previous, changed: true };
}
