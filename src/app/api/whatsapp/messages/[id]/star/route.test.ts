import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

let mockUser: { id: string } | null = { id: 'user-1' };
let mockExistingStar: { message_id: string } | null = null;
let insertedStar: Record<string, unknown> | null = null;
let deletedStar: boolean = false;

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
          if (table === 'message_stars') return { data: mockExistingStar, error: null };
          return { data: null, error: null };
        }),
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          insertedStar = payload;
          return { error: null };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => {
              deletedStar = true;
              return { error: null };
            }),
          })),
        })),
      };
      return chain;
    }),
  })),
}));

describe('POST /api/whatsapp/messages/[id]/star (Phase 7)', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockExistingStar = null;
    insertedStar = null;
    deletedStar = false;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockUser = null;
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/star', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(401);
  });

  it('stars a message when not previously starred', async () => {
    mockExistingStar = null;
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/star', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starred).toBe(true);
    expect(insertedStar).toEqual({ message_id: 'msg-1', user_id: 'user-1' });
  });

  it('unstars a message when already starred', async () => {
    mockExistingStar = { message_id: 'msg-1' };
    const req = new Request('http://localhost/api/whatsapp/messages/msg-1/star', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starred).toBe(false);
    expect(deletedStar).toBe(true);
  });
});
