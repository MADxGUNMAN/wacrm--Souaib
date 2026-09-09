import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

let mockUser: { id: string } | null = { id: 'user-1' };
let mockExistingHide: { message_id: string } | null = null;
let insertedHide: Record<string, unknown> | null = null;
let deletedHide: boolean = false;

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
          if (table === 'message_hidden_users') return { data: mockExistingHide, error: null };
          return { data: null, error: null };
        }),
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          insertedHide = payload;
          return { error: null };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => {
              deletedHide = true;
              return { error: null };
            }),
          })),
        })),
      };
      return chain;
    }),
  })),
}));

describe('POST /api/whatsapp/messages/[id]/hide (Phase 7)', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockExistingHide = null;
    insertedHide = null;
    deletedHide = false;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockUser = null;
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/hide', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(401);
  });

  it('hides a message for the user (Delete for me)', async () => {
    mockExistingHide = null;
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/hide', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hidden).toBe(true);
    expect(insertedHide).toEqual({ message_id: 'msg-1', user_id: 'user-1' });
  });

  it('unhides a message when already hidden', async () => {
    mockExistingHide = { message_id: 'msg-1' };
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/hide', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hidden).toBe(false);
    expect(deletedHide).toBe(true);
  });
});
