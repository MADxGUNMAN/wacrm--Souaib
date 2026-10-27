// ============================================================
// Workspace read services (Phase 5): team members, the caller's
// notifications, custom field definitions, contact notes.
// ============================================================

import { buildPage, decodeCursor, keysetFilter } from '@/lib/api/v1/pagination';
import {
  ServiceError,
  UUID_RE,
  clampLimit,
  type ServiceContext,
} from './context';
import type { Page } from './contacts';
import { memberNames, memberRef, type MemberRef } from './shared';

export interface TeamMember {
  id: string;
  name: string | null;
  role: 'owner' | 'member';
  is_me: boolean;
}

/**
 * Active people in the workspace, for assignment. `{ id, name, role }`
 * only — no emails or permissions (02 §3.5).
 */
export async function listTeamMembers(
  ctx: ServiceContext
): Promise<TeamMember[]> {
  const { data, error } = await ctx.db
    .from('profiles')
    .select('user_id, full_name, account_role, is_active, created_at')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new ServiceError('internal', 'Could not list team members');
  return (
    (data ?? []) as {
      user_id: string;
      full_name: string | null;
      account_role: string;
      is_active: boolean | null;
    }[]
  )
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      id: p.user_id,
      name: p.full_name,
      role: p.account_role === 'owner' ? 'owner' : 'member',
      is_me: p.user_id === ctx.userId,
    }));
}

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  contact_id: string | null;
  read: boolean;
  created_at: string;
}

/** The caller's own notifications, newest first (unread only by default). */
export async function listNotifications(
  ctx: ServiceContext,
  input: { unreadOnly?: boolean; limit?: number } = {}
): Promise<{ items: NotificationSummary[]; unread_total: number }> {
  const limit = clampLimit(input.limit, 20, 50);
  let q = ctx.db
    .from('notifications')
    .select(
      'id, type, title, body, conversation_id, contact_id, read_at, created_at'
    )
    .eq('account_id', ctx.accountId)
    .eq('user_id', ctx.userId);
  if (input.unreadOnly !== false) q = q.is('read_at', null);
  const [list, unread] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(limit),
    ctx.db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .is('read_at', null),
  ]);
  if (list.error)
    throw new ServiceError('internal', 'Could not load notifications');
  return {
    items: (
      (list.data ?? []) as {
        id: string;
        type: string;
        title: string;
        body: string | null;
        conversation_id: string | null;
        contact_id: string | null;
        read_at: string | null;
        created_at: string;
      }[]
    ).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      conversation_id: n.conversation_id,
      contact_id: n.contact_id,
      read: Boolean(n.read_at),
      created_at: n.created_at,
    })),
    unread_total: unread.count ?? 0,
  };
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  key: string | null;
  type: string;
  options: string[];
  visible: boolean;
}

function fieldOptions(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((v): v is string => typeof v === 'string').slice(0, 50);
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { options?: unknown }).options)
  ) {
    return fieldOptions((raw as { options: unknown[] }).options);
  }
  return [];
}

export async function listCustomFields(
  ctx: ServiceContext
): Promise<CustomFieldDefinition[]> {
  const { data, error } = await ctx.db
    .from('custom_fields')
    .select(
      'id, field_name, field_key, field_type, field_options, visible, created_at'
    )
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new ServiceError('internal', 'Could not list custom fields');
  return (
    (data ?? []) as {
      id: string;
      field_name: string;
      field_key: string | null;
      field_type: string;
      field_options: unknown;
      visible: boolean | null;
    }[]
  ).map((f) => ({
    id: f.id,
    name: f.field_name,
    key: f.field_key,
    type: f.field_type,
    options: fieldOptions(f.field_options),
    visible: f.visible !== false,
  }));
}

export interface ContactNote {
  id: string;
  note_text: string;
  author: MemberRef | null;
  created_at: string;
}

export async function listContactNotes(
  ctx: ServiceContext,
  contactId: string,
  input: { limit?: number; cursor?: string | null } = {}
): Promise<Page<ContactNote>> {
  if (!UUID_RE.test(contactId))
    throw new ServiceError('not_found', 'Contact not found');
  const limit = clampLimit(input.limit, 20, 50);
  const { data: contact, error: cErr } = await ctx.db
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('id', contactId)
    .maybeSingle();
  if (cErr) throw new ServiceError('internal', 'Could not load notes');
  if (!contact) throw new ServiceError('not_found', 'Contact not found');

  let q = ctx.db
    .from('contact_notes')
    .select('id, note_text, user_id, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId);
  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not load notes');
  const { items, nextCursor } = buildPage(
    (data ?? []) as {
      id: string;
      note_text: string;
      user_id: string | null;
      created_at: string;
    }[],
    limit
  );
  const names = await memberNames(
    ctx,
    items.map((n) => n.user_id)
  );
  return {
    items: items.map((n) => ({
      id: n.id,
      note_text: n.note_text,
      author: memberRef(names, n.user_id),
      created_at: n.created_at,
    })),
    nextCursor,
  };
}
