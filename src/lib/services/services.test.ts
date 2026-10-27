import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeCursor } from '@/lib/api/v1/pagination';
import { ServiceError, type ServiceContext } from './context';
import { getContact, searchContacts } from './contacts';
import {
  computeReplyWindow,
  getConversation,
  listConversations,
  listMessages,
} from './conversations';

const ACCOUNT = '3430edae-763b-4aac-9b82-1c2364936d79';
const USER = '2b7a9798-3044-440f-80be-68952f57d708';
const ID1 = '11111111-1111-4111-8111-111111111111';

type Call = { table: string; method: string; args: unknown[] };

/**
 * Minimal PostgREST builder fake: records every call and answers each
 * `from(table)` with the next queued result for that table.
 */
function fakeDb(
  results: Record<string, Array<{ data: unknown; error?: unknown }>>
) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const result = results[table]?.shift() ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'or', 'gt', 'is', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => {
        const d = result.data;
        return {
          data: Array.isArray(d) ? (d[0] ?? null) : d,
          error: result.error ?? null,
        };
      };
      builder.then = (resolve: (v: unknown) => void) =>
        resolve({ data: result.data, error: result.error ?? null });
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

function ctx(db: SupabaseClient): ServiceContext {
  return {
    db,
    userId: USER,
    accountId: ACCOUNT,
    actor: { kind: 'ai', connectionId: ID1, platform: 'claude' },
  };
}

const contactRow = (i: number) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  phone: `+9198765432${i}0`,
  name: `Contact ${i}`,
  email: null,
  company: null,
  avatar_url: null,
  contact_tags: [{ tags: { id: ID1, name: 'VIP', color: '#000' } }],
  created_at: `2026-10-0${i}T00:00:00Z`,
  updated_at: `2026-10-0${i}T00:00:00Z`,
  account_id: ACCOUNT,
  user_id: USER,
});

describe('searchContacts', () => {
  it('always scopes by account, searches phones by digits, pages with a cursor', async () => {
    const { db, calls } = fakeDb({
      contacts: [{ data: [contactRow(3), contactRow(2), contactRow(1)] }],
    });
    const page = await searchContacts(ctx(db), {
      query: '+222 4855 0082',
      limit: 2,
    });

    expect(calls).toContainEqual({
      table: 'contacts',
      method: 'eq',
      args: ['account_id', ACCOUNT],
    });
    const orArg = calls.find((c) => c.method === 'or')?.args[0] as string;
    expect(orArg).toContain('phone_normalized.like."%22248550082%"');
    expect(calls).toContainEqual({
      table: 'contacts',
      method: 'limit',
      args: [3],
    });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toEqual({
      id: contactRow(3).id,
      phone: contactRow(3).phone,
      name: 'Contact 3',
      email: null,
      company: null,
      avatar_url: null,
      tags: [{ id: ID1, name: 'VIP', color: '#000' }],
      created_at: contactRow(3).created_at,
      updated_at: contactRow(3).updated_at,
    });
    // internal columns never leak
    expect(page.items[0]).not.toHaveProperty('account_id');
    expect(page.nextCursor).toBe(encodeCursor(contactRow(2)));
  });

  it('caps the page size and validates filters', async () => {
    const { db, calls } = fakeDb({ contacts: [{ data: [] }] });
    await searchContacts(ctx(db), { limit: 5000 });
    expect(calls).toContainEqual({
      table: 'contacts',
      method: 'limit',
      args: [51],
    });
    await expect(
      searchContacts(ctx(db), { tagId: 'nope' })
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('ignores a forged cursor instead of interpolating it', async () => {
    const { db, calls } = fakeDb({ contacts: [{ data: [] }] });
    const forged = Buffer.from('2026-01-01|x),id.neq.0').toString('base64url');
    await searchContacts(ctx(db), { cursor: forged });
    expect(calls.some((c) => c.method === 'or')).toBe(false);
  });
});

describe('getContact', () => {
  it('returns not_found for another account (no row) and for non-UUIDs', async () => {
    const { db } = fakeDb({ contacts: [{ data: null }] });
    await expect(getContact(ctx(db), ID1)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(getContact(ctx(db), 'drop table')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('conversations', () => {
  it('filters by assignment to the calling user', async () => {
    const { db, calls } = fakeDb({ conversations: [{ data: [] }] });
    await listConversations(ctx(db), {
      assignedTo: 'me',
      status: 'open',
      unreadOnly: true,
    });
    expect(calls).toContainEqual({
      table: 'conversations',
      method: 'eq',
      args: ['assigned_agent_id', USER],
    });
    expect(calls).toContainEqual({
      table: 'conversations',
      method: 'eq',
      args: ['status', 'open'],
    });
    expect(calls).toContainEqual({
      table: 'conversations',
      method: 'gt',
      args: ['unread_count', 0],
    });
    await expect(
      listConversations(ctx(db), { status: 'archived' as never })
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('computes the 24-hour reply window', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    expect(computeReplyWindow('2026-10-01T11:00:00Z', now)).toEqual({
      open: true,
      closesAt: '2026-10-02T11:00:00.000Z',
      lastCustomerMessageAt: '2026-10-01T11:00:00Z',
    });
    expect(computeReplyWindow('2026-10-01T09:00:00Z', now).open).toBe(false);
    expect(computeReplyWindow(null, now)).toEqual({
      open: false,
      closesAt: null,
      lastCustomerMessageAt: null,
    });
  });

  it('attaches the reply window to a conversation', async () => {
    const conv = {
      id: ID1,
      contact_id: ID1,
      status: 'open',
      assigned_agent_id: null,
      last_message_text: 'hi',
      last_message_at: '2026-10-02T09:00:00Z',
      unread_count: 1,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T09:00:00Z',
      contact: null,
    };
    const { db } = fakeDb({
      conversations: [{ data: conv }],
      messages: [{ data: { created_at: '2026-10-02T09:00:00Z' } }],
    });
    const out = await getConversation(
      ctx(db),
      ID1,
      new Date('2026-10-02T10:00:00Z')
    );
    expect(out.reply_window.open).toBe(true);
    expect(out.id).toBe(ID1);
  });
});

describe('listMessages', () => {
  it('refuses a conversation from another account before reading messages', async () => {
    const { db, calls } = fakeDb({ conversations: [{ data: null }] });
    await expect(listMessages(ctx(db), ID1)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(calls.some((c) => c.table === 'messages')).toBe(false);
  });

  it('hides the content of messages deleted for everyone', async () => {
    const msg = (over: Record<string, unknown>) => ({
      id: ID1,
      conversation_id: ID1,
      sender_type: 'customer',
      content_type: 'text',
      content_text: 'secret',
      media_url: null,
      template_name: null,
      message_id: 'wamid.x',
      status: 'delivered',
      reply_to_message_id: null,
      interactive_reply_id: null,
      created_at: '2026-10-02T09:00:00Z',
      deleted_at: null,
      ...over,
    });
    const { db } = fakeDb({
      conversations: [{ data: { id: ID1 } }],
      messages: [
        {
          data: [
            msg({}),
            msg({
              id: '22222222-2222-4222-8222-222222222222',
              deleted_at: '2026-10-02T09:05:00Z',
            }),
          ],
        },
      ],
    });
    const page = await listMessages(ctx(db), ID1);
    expect(page.items[0]).toMatchObject({
      content_text: 'secret',
      deleted: false,
      direction: 'inbound',
    });
    expect(page.items[1]).toMatchObject({ content_text: null, deleted: true });
  });
});
