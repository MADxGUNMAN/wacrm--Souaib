// ============================================================
// Conversation and message read services (Phase 1).
//
// `getConversation` also reports the WhatsApp 24-hour customer-service
// window, so the AI knows before trying whether a free-text reply is
// possible or only an approved template can be sent.
// ============================================================

import {
  serializeConversation,
  serializeMessage,
  type ApiConversation,
  type ApiMessage,
} from '@/lib/api/v1/conversations';
import { buildPage, decodeCursor, keysetFilter } from '@/lib/api/v1/pagination';
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import type { Conversation, Message } from '@/types';
import {
  ServiceError,
  UUID_RE,
  clampLimit,
  type ServiceContext,
} from './context';
import type { Page } from './contacts';

export const CONVERSATION_PAGE = { default: 20, max: 50 };
export const MESSAGE_PAGE = { default: 30, max: 50 };
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const CONVERSATION_STATUSES = ['open', 'pending', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface ListConversationsInput {
  status?: ConversationStatus;
  unreadOnly?: boolean;
  /** 'me' = assigned to the calling user; 'unassigned'; or a member id. */
  assignedTo?: 'me' | 'unassigned' | string;
  contactId?: string;
  limit?: number;
  cursor?: string | null;
}

export async function listConversations(
  ctx: ServiceContext,
  input: ListConversationsInput = {}
): Promise<Page<ApiConversation>> {
  const limit = clampLimit(
    input.limit,
    CONVERSATION_PAGE.default,
    CONVERSATION_PAGE.max
  );
  if (input.status && !CONVERSATION_STATUSES.includes(input.status)) {
    throw new ServiceError(
      'invalid_input',
      'status must be open, pending or closed'
    );
  }
  if (input.contactId !== undefined && !UUID_RE.test(input.contactId)) {
    throw new ServiceError('invalid_input', 'contact_id must be a UUID');
  }
  const assigned = input.assignedTo;
  if (
    assigned &&
    assigned !== 'me' &&
    assigned !== 'unassigned' &&
    !UUID_RE.test(assigned)
  ) {
    throw new ServiceError(
      'invalid_input',
      "assigned_to must be 'me', 'unassigned' or a member id"
    );
  }

  let q = ctx.db
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('account_id', ctx.accountId);
  if (input.status) q = q.eq('status', input.status);
  if (input.unreadOnly) q = q.gt('unread_count', 0);
  if (input.contactId) q = q.eq('contact_id', input.contactId);
  if (assigned === 'me') q = q.eq('assigned_agent_id', ctx.userId);
  else if (assigned === 'unassigned') q = q.is('assigned_agent_id', null);
  else if (assigned) q = q.eq('assigned_agent_id', assigned);

  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not list conversations');

  const { items, nextCursor } = buildPage(
    (data ?? []) as unknown as Array<Conversation>,
    limit
  );
  return {
    items: items.map((c) => serializeConversation(normalizeConversation(c))),
    nextCursor,
  };
}

export interface ReplyWindow {
  open: boolean;
  /** When the window closes (or closed); null if the contact never wrote. */
  closesAt: string | null;
  lastCustomerMessageAt: string | null;
}

/** Pure: the 24-hour window from the contact's latest inbound message. */
export function computeReplyWindow(
  lastCustomerMessageAt: string | null,
  now: Date = new Date()
): ReplyWindow {
  if (!lastCustomerMessageAt)
    return { open: false, closesAt: null, lastCustomerMessageAt: null };
  const closes = Date.parse(lastCustomerMessageAt) + REPLY_WINDOW_MS;
  return {
    open: Number.isFinite(closes) && closes > now.getTime(),
    closesAt: Number.isFinite(closes) ? new Date(closes).toISOString() : null,
    lastCustomerMessageAt,
  };
}

export async function getConversation(
  ctx: ServiceContext,
  conversationId: string,
  now: Date = new Date()
): Promise<ApiConversation & { reply_window: ReplyWindow }> {
  if (!UUID_RE.test(conversationId))
    throw new ServiceError('not_found', 'Conversation not found');
  const { data, error } = await ctx.db
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('id', conversationId)
    .maybeSingle();
  if (error)
    throw new ServiceError('internal', 'Could not load the conversation');
  if (!data) throw new ServiceError('not_found', 'Conversation not found');

  const { data: last, error: lastErr } = await ctx.db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr)
    throw new ServiceError('internal', 'Could not load the conversation');

  return {
    ...serializeConversation(
      normalizeConversation(data as unknown as Conversation)
    ),
    reply_window: computeReplyWindow(
      (last as { created_at: string } | null)?.created_at ?? null,
      now
    ),
  };
}

export interface ListMessagesInput {
  limit?: number;
  cursor?: string | null;
}

/**
 * Messages newest first. Soft-deleted messages ("deleted for everyone")
 * keep their place in the thread but lose their content, as in the inbox.
 */
export async function listMessages(
  ctx: ServiceContext,
  conversationId: string,
  input: ListMessagesInput = {}
): Promise<Page<ApiMessage & { deleted: boolean }>> {
  if (!UUID_RE.test(conversationId))
    throw new ServiceError('not_found', 'Conversation not found');
  const limit = clampLimit(input.limit, MESSAGE_PAGE.default, MESSAGE_PAGE.max);

  // Ownership first: messages has no account_id column of its own.
  const { data: conv, error: convErr } = await ctx.db
    .from('conversations')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw new ServiceError('internal', 'Could not load messages');
  if (!conv) throw new ServiceError('not_found', 'Conversation not found');

  let q = ctx.db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);
  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not load messages');

  const { items, nextCursor } = buildPage(
    (data ?? []) as unknown as Array<Message & { deleted_at?: string | null }>,
    limit
  );
  return {
    items: items.map((m) => {
      const base = serializeMessage(m);
      const deleted = Boolean(m.deleted_at);
      return deleted
        ? { ...base, content_text: null, media_url: null, deleted }
        : { ...base, deleted };
    }),
    nextCursor,
  };
}

// ------------------------------------------------------------
// Message search (Phase 5)
// ------------------------------------------------------------

export const MESSAGE_SEARCH_DAYS = 90;

export interface MessageSearchHit {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  content_text: string;
  created_at: string;
  contact: { id: string; name: string | null; phone: string } | null;
}

/**
 * Text search over the last 90 days of messages in the workspace,
 * newest first. Case-insensitive substring match; deleted messages are
 * excluded. Ownership via the conversation (messages has no account_id).
 */
export async function searchMessages(
  ctx: ServiceContext,
  input: { query: string; conversationId?: string; limit?: number },
  now: Date = new Date()
): Promise<MessageSearchHit[]> {
  const term = input.query.trim().slice(0, 100);
  if (term.length < 2)
    throw new ServiceError('invalid_input', 'Search for at least 2 characters');
  if (
    input.conversationId !== undefined &&
    !UUID_RE.test(input.conversationId)
  ) {
    throw new ServiceError('invalid_input', 'conversation_id must be a UUID');
  }
  const limit = clampLimit(input.limit, 20, 50);
  const since = new Date(
    now.getTime() - MESSAGE_SEARCH_DAYS * 86_400_000
  ).toISOString();
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  // The FK is named explicitly: conversations.pinned_message_id is a second
  // messages↔conversations relationship, and without the hint PostgREST
  // refuses the embed as ambiguous (PGRST201).
  let q = ctx.db
    .from('messages')
    .select(
      'id, conversation_id, sender_type, content_text, created_at, conv:conversations!messages_conversation_id_fkey!inner(account_id, contact:contacts(id, name, phone))'
    )
    .eq('conv.account_id', ctx.accountId)
    .ilike('content_text', pattern)
    .is('deleted_at', null)
    .gte('created_at', since);
  if (input.conversationId) q = q.eq('conversation_id', input.conversationId);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new ServiceError('internal', 'Could not search messages');

  type Row = {
    id: string;
    conversation_id: string;
    sender_type: string;
    content_text: string | null;
    created_at: string;
    conv:
      | {
          contact:
            | { id: string; name: string | null; phone: string }
            | { id: string; name: string | null; phone: string }[]
            | null;
        }
      | {
          contact:
            | { id: string; name: string | null; phone: string }
            | { id: string; name: string | null; phone: string }[]
            | null;
        }[]
      | null;
  };
  return ((data ?? []) as unknown as Row[]).map((m) => {
    const conv = Array.isArray(m.conv) ? m.conv[0] : m.conv;
    const contact = Array.isArray(conv?.contact)
      ? (conv?.contact[0] ?? null)
      : (conv?.contact ?? null);
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      direction: m.sender_type === 'customer' ? 'inbound' : 'outbound',
      content_text: m.content_text ?? '',
      created_at: m.created_at,
      contact,
    };
  });
}
