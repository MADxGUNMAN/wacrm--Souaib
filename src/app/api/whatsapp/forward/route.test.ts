import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

let mockUser: { id: string } | null = { id: 'user-1' };
let mockProfile: { account_id: string } | null = { account_id: 'acct-1' };
let mockSourceMessage: Record<string, unknown> | null = null;
const sentCalls: Record<string, unknown>[] = [];

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
          if (table === 'whatsapp_configs') return { data: { access_token: 'meta-token' }, error: null };
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          if (table === 'messages') return { data: mockSourceMessage, error: mockSourceMessage ? null : { message: 'Not found' } };
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  })),
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/rehosted.png' } })),
      })),
    },
  })),
}));

vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: vi.fn(async (_supabase, _accountId, params) => {
    sentCalls.push(params);
    return {
      messageId: `msg-${Date.now()}`,
      whatsappMessageId: `wamid.FWD_${Date.now()}`,
    };
  }),
  SendMessageError: class extends Error {
    status: number;
    constructor(_code: string, message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));

describe('POST /api/whatsapp/forward (Phase 6)', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockProfile = { account_id: 'acct-1' };
    mockSourceMessage = null;
    sentCalls.length = 0;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockUser = null;
    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1', targetConversationIds: ['conv-2'] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid request body with 400', async () => {
    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({ messageId: '', targetConversationIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects when source message is not found (404)', async () => {
    mockSourceMessage = null;
    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'non-existent', targetConversationIds: ['conv-1'] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('forwards text message to multiple target conversations with forwardedFromMessageId', async () => {
    mockSourceMessage = {
      id: 'src-msg-1',
      content_type: 'text',
      content_text: 'Hello from previous thread!',
      conversations: { account_id: 'acct-1' },
    };

    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'src-msg-1',
        targetConversationIds: ['conv-a', 'conv-b'],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sentCount).toBe(2);

    expect(sentCalls).toHaveLength(2);
    expect(sentCalls[0]).toMatchObject({
      conversationId: 'conv-a',
      messageType: 'text',
      contentText: 'Hello from previous thread!',
      forwardedFromMessageId: 'src-msg-1',
      senderUserId: 'user-1',
    });
    expect(sentCalls[1]).toMatchObject({
      conversationId: 'conv-b',
      messageType: 'text',
      contentText: 'Hello from previous thread!',
      forwardedFromMessageId: 'src-msg-1',
      senderUserId: 'user-1',
    });
  });

  it('forwards contact card with reconstructed contacts payload', async () => {
    mockSourceMessage = {
      id: 'src-msg-contact',
      content_type: 'contacts',
      contacts_payload: [{ name: { formatted_name: 'John Doe' }, phones: [{ phone: '123456789' }] }],
      conversations: { account_id: 'acct-1' },
    };

    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'src-msg-contact',
        targetConversationIds: ['conv-target'],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]).toMatchObject({
      conversationId: 'conv-target',
      messageType: 'contacts',
      contactsPayload: [{ name: { formatted_name: 'John Doe' }, phones: [{ phone: '123456789' }] }],
      forwardedFromMessageId: 'src-msg-contact',
    });
  });

  it('forwards location message with reconstructed coordinates', async () => {
    mockSourceMessage = {
      id: 'src-msg-loc',
      content_type: 'location',
      latitude: 40.7128,
      longitude: -74.006,
      location_name: 'Empire State',
      location_address: '350 5th Ave, NY',
      conversations: { account_id: 'acct-1' },
    };

    const req = new Request('http://localhost/api/whatsapp/forward', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'src-msg-loc',
        targetConversationIds: ['conv-target'],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]).toMatchObject({
      conversationId: 'conv-target',
      messageType: 'location',
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        name: 'Empire State',
        address: '350 5th Ave, NY',
      },
      forwardedFromMessageId: 'src-msg-loc',
    });
  });
});
