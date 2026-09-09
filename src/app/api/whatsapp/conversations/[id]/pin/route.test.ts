import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

let mockUser: { id: string } | null = { id: 'user-1' };
let mockProfile: { account_id: string } | null = { account_id: 'acct-1' };
let mockConversation: { id: string; account_id: string } | null = { id: 'conv-1', account_id: 'acct-1' };
let mockMessage: { id: string } | null = { id: 'msg-1' };
let updatedFields: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockUser },
        error: mockUser ? null : { message: 'Unauthorized' },
      })),
    },
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'profiles') return { data: mockProfile, error: null };
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          if (table === 'conversations') return { data: mockConversation, error: mockConversation ? null : { message: 'Not found' } };
          if (table === 'messages') return { data: mockMessage, error: mockMessage ? null : { message: 'Not found' } };
          return { data: null, error: null };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatedFields = payload;
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      };
      return chain;
    }),
  })),
}));

describe('POST /api/whatsapp/conversations/[id]/pin (Phase 7)', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockProfile = { account_id: 'acct-1' };
    mockConversation = { id: 'conv-1', account_id: 'acct-1' };
    mockMessage = { id: 'msg-1' };
    updatedFields = null;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockUser = null;
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/pin', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(401);
  });

  it('pins a message to conversation', async () => {
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/pin', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pinnedMessageId).toBe('msg-1');
    expect(updatedFields).toMatchObject({
      pinned_message_id: 'msg-1',
      pinned_by: 'user-1',
    });
  });

  it('unpins a message when messageId is null', async () => {
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/pin', {
      method: 'POST',
      body: JSON.stringify({ messageId: null }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pinnedMessageId).toBe(null);
    expect(updatedFields).toMatchObject({
      pinned_message_id: null,
      pinned_at: null,
      pinned_by: null,
    });
  });
});
