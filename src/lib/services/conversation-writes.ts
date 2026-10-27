// ============================================================
// Conversation write services (Phase 6): status, assignment, unread.
//
// Assignment is a plain update, exactly like the inbox: the
// `on_conversation_assigned` trigger creates the assignee's notification
// (and skips self-assignment), using auth.uid() as the actor — which under
// the AI's JWT is the real user.
//
// "Mark read" resets the unread count only. The inbox route also sends a
// WhatsApp read receipt (blue ticks) through Meta; that needs the
// workspace's WhatsApp credentials, which the AI connector never reads.
// ============================================================

import { ServiceError, UUID_RE, type ServiceContext } from './context';
import {
  CONVERSATION_STATUSES,
  type ConversationStatus,
} from './conversations';

async function loadConversation(ctx: ServiceContext, id: string) {
  if (!UUID_RE.test(id))
    throw new ServiceError('not_found', 'Conversation not found');
  const { data, error } = await ctx.db
    .from('conversations')
    .select('id, status, assigned_agent_id, unread_count')
    .eq('account_id', ctx.accountId)
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not load the conversation');
  if (!data) throw new ServiceError('not_found', 'Conversation not found');
  return data as {
    id: string;
    status: string;
    assigned_agent_id: string | null;
    unread_count: number | null;
  };
}

async function update(
  ctx: ServiceContext,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await ctx.db
    .from('conversations')
    .update(patch)
    .eq('account_id', ctx.accountId)
    .eq('id', id);
  if (error)
    throw new ServiceError('internal', 'Could not update the conversation');
}

export async function updateConversationStatus(
  ctx: ServiceContext,
  id: string,
  status: ConversationStatus
): Promise<{ status: ConversationStatus; previous: string; changed: boolean }> {
  if (!CONVERSATION_STATUSES.includes(status))
    throw new ServiceError(
      'invalid_input',
      'status must be open, pending or closed'
    );
  const conv = await loadConversation(ctx, id);
  const changed = conv.status !== status;
  if (changed) await update(ctx, id, { status });
  return { status, previous: conv.status, changed };
}

/** Active member of this account, or throw. Returns their name. */
export async function assertActiveMember(
  ctx: ServiceContext,
  userId: string
): Promise<string | null> {
  if (!UUID_RE.test(userId))
    throw new ServiceError('not_found', 'Team member not found');
  const { data, error } = await ctx.db
    .from('profiles')
    .select('user_id, full_name, is_active')
    .eq('account_id', ctx.accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not check the team member');
  if (!data || data.is_active === false)
    throw new ServiceError(
      'not_found',
      'Team member not found (see list_team_members)'
    );
  return (data.full_name as string | null) ?? null;
}

export async function assignConversation(
  ctx: ServiceContext,
  id: string,
  assignee: 'me' | null | string
): Promise<{
  assigned_to: { id: string; name: string | null } | null;
  changed: boolean;
}> {
  const conv = await loadConversation(ctx, id);
  const target = assignee === 'me' ? ctx.userId : assignee;
  const name = target ? await assertActiveMember(ctx, target) : null;
  const changed = conv.assigned_agent_id !== target;
  if (changed) await update(ctx, id, { assigned_agent_id: target });
  return { assigned_to: target ? { id: target, name } : null, changed };
}

export async function markConversationRead(
  ctx: ServiceContext,
  id: string
): Promise<{ previous_unread: number }> {
  const conv = await loadConversation(ctx, id);
  const previous = conv.unread_count ?? 0;
  if (previous > 0) await update(ctx, id, { unread_count: 0 });
  return { previous_unread: previous };
}
