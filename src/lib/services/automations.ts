// ============================================================
// Automation and flow read services (Phase 5). On/off switches follow in
// Phase 7. Step and graph contents are never returned (03 §6): only what
// each one is, whether it runs, and how often.
// ============================================================

import { ServiceError, type ServiceContext } from './context';

export interface AutomationSummary {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  active: boolean;
  runs: number;
  last_run_at: string | null;
  failures_7d: number;
}

export async function listAutomations(
  ctx: ServiceContext,
  input: { activeOnly?: boolean } = {},
  now: Date = new Date()
): Promise<AutomationSummary[]> {
  let q = ctx.db
    .from('automations')
    .select(
      'id, name, description, trigger_type, is_active, execution_count, last_executed_at, created_at'
    )
    .eq('account_id', ctx.accountId);
  if (input.activeOnly) q = q.eq('is_active', true);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [list, fails] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(100),
    ctx.db
      .from('automation_logs')
      .select('automation_id')
      .eq('account_id', ctx.accountId)
      .eq('status', 'failed')
      .gte('created_at', weekAgo)
      .limit(5000),
  ]);
  if (list.error)
    throw new ServiceError('internal', 'Could not list automations');
  const failCount = new Map<string, number>();
  for (const f of (fails.data ?? []) as { automation_id: string }[]) {
    failCount.set(f.automation_id, (failCount.get(f.automation_id) ?? 0) + 1);
  }
  return (
    (list.data ?? []) as {
      id: string;
      name: string;
      description: string | null;
      trigger_type: string;
      is_active: boolean;
      execution_count: number | null;
      last_executed_at: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    trigger_type: a.trigger_type,
    active: a.is_active,
    runs: a.execution_count ?? 0,
    last_run_at: a.last_executed_at,
    failures_7d: failCount.get(a.id) ?? 0,
  }));
}

export const FLOW_STATUSES = ['draft', 'active', 'archived'] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: string;
  runs: number;
  last_run_at: string | null;
  active_runs: number;
}

export async function listFlows(
  ctx: ServiceContext,
  input: { status?: FlowStatus } = {}
): Promise<FlowSummary[]> {
  let q = ctx.db
    .from('flows')
    .select(
      'id, name, description, status, trigger_type, execution_count, last_executed_at, created_at'
    )
    .eq('account_id', ctx.accountId);
  if (input.status) q = q.eq('status', input.status);
  const [list, active] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(100),
    ctx.db
      .from('flow_runs')
      .select('flow_id')
      .eq('account_id', ctx.accountId)
      .eq('status', 'active')
      .limit(5000),
  ]);
  if (list.error) throw new ServiceError('internal', 'Could not list flows');
  const activeCount = new Map<string, number>();
  for (const r of (active.data ?? []) as { flow_id: string }[]) {
    activeCount.set(r.flow_id, (activeCount.get(r.flow_id) ?? 0) + 1);
  }
  return (
    (list.data ?? []) as {
      id: string;
      name: string;
      description: string | null;
      status: string;
      trigger_type: string;
      execution_count: number | null;
      last_executed_at: string | null;
    }[]
  ).map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    status: f.status,
    trigger_type: f.trigger_type,
    runs: f.execution_count ?? 0,
    last_run_at: f.last_executed_at,
    active_runs: activeCount.get(f.id) ?? 0,
  }));
}
