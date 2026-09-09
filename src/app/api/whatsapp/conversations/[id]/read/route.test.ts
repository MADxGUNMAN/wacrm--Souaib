import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as handleRead } from './route';
import { POST as handleTyping } from '../typing/route';

let mockUser: { id: string } | null = { id: 'user-1' };
let mockProfile: { account_id: string } | null = { account_id: 'acct-1' };
let mockConversation: { id: string; account_id: string; unread_count: number } | null = {
  id: 'conv-1',
  account_id: 'acct-1',
  unread_count: 3,
};
let mockInboundMessage: { id: string; message_id: string } | null = {
  id: 'msg-1',
  message_id: 'wamid.HBgLM...',
};
let mockConfig: { phone_number_id: string; access_token: string; status: string } | null = {
  phone_number_id: 'PNID-123',
  access_token: 'enc-token',
  status: 'connected',
};
let updatedUnreadCount: number | null = null;

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
        not: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        update: vi.fn((patch: { unread_count?: number }) => {
          if (patch.unread_count !== undefined) {
            updatedUnreadCount = patch.unread_count;
          }
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'profiles') return { data: mockProfile, error: null };
          if (table === 'conversations') return { data: mockConversation, error: null };
          if (table === 'messages') return { data: mockInboundMessage, error: null };
          if (table === 'whatsapp_config') return { data: mockConfig, error: null };
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  })),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn((token: string) => `decrypted-${token}`),
}));

vi.mock('@/lib/whatsapp/meta-api', () => ({
  markMessageRead: vi.fn(async () => ({ success: true })),
  sendTypingIndicator: vi.fn(async () => ({ success: true })),
}));

describe('POST /api/whatsapp/conversations/[id]/read', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockProfile = { account_id: 'acct-1' };
    mockConversation = { id: 'conv-1', account_id: 'acct-1', unread_count: 3 };
    mockInboundMessage = { id: 'msg-1', message_id: 'wamid.HBgLM...' };
    mockConfig = { phone_number_id: 'PNID-123', access_token: 'enc-token', status: 'connected' };
    updatedUnreadCount = null;
    vi.clearAllMocks();
  });

  it('marks conversation as read and zeros unread_count', async () => {
    const { markMessageRead } = await import('@/lib/whatsapp/meta-api');
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/read', {
      method: 'POST',
    });

    const res = await handleRead(req, {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, markedRead: true });
    expect(updatedUnreadCount).toBe(0);
    expect(markMessageRead).toHaveBeenCalledWith({
      phoneNumberId: 'PNID-123',
      accessToken: 'decrypted-enc-token',
      messageId: 'wamid.HBgLM...',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockUser = null;
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/read', {
      method: 'POST',
    });

    const res = await handleRead(req, {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 404 when conversation does not exist or wrong account', async () => {
    mockConversation = null;
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/read', {
      method: 'POST',
    });

    const res = await handleRead(req, {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/whatsapp/conversations/[id]/typing', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockProfile = { account_id: 'acct-1' };
    mockConversation = { id: 'conv-1', account_id: 'acct-1', unread_count: 0 };
    mockInboundMessage = { id: 'msg-1', message_id: 'wamid.HBgLM...' };
    mockConfig = { phone_number_id: 'PNID-123', access_token: 'enc-token', status: 'connected' };
    vi.clearAllMocks();
  });

  it('sends typing indicator for active conversation', async () => {
    const { sendTypingIndicator } = await import('@/lib/whatsapp/meta-api');
    const req = new Request('http://localhost/api/whatsapp/conversations/conv-1/typing', {
      method: 'POST',
    });

    const res = await handleTyping(req, {
      params: Promise.resolve({ id: 'conv-1' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(sendTypingIndicator).toHaveBeenCalledWith({
      phoneNumberId: 'PNID-123',
      accessToken: 'decrypted-enc-token',
      messageId: 'wamid.HBgLM...',
    });
  });
});
