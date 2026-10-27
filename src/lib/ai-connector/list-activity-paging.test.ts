import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeAdmin } from '@/lib/security/fake-admin.test-util';

vi.mock('@/lib/auth/admin-client', () => ({ supabaseAdmin: vi.fn() }));

import { listActivity } from './manage';

function seed() {
  const db = createFakeAdmin();
  db.tables.ai_audit_log = Array.from({ length: 30 }, (_, i) => ({
    id: `a${i}`,
    account_id: 'acct',
    user_id: i % 2 ? 'owner' : 'member',
    platform: i < 20 ? 'claude' : 'chatgpt',
    action: 'list_contacts',
    outcome: 'ok',
    created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    connection_id: null,
    args_summary: null,
  }));
  return db as unknown as SupabaseClient;
}

const owner = { accountId: 'acct', userId: 'owner', role: 'owner' as const };

describe('listActivity page mode', () => {
  it('returns an exact page with a total, newest first', async () => {
    const r = await listActivity(seed(), owner as never, { page: 2, limit: 10 });
    expect(r.total).toBe(30);
    expect(r.page).toBe(2);
    expect(r.page_size).toBe(10);
    expect(r.items.map((i) => i.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `a${19 - i}`)
    );
    expect(r.next_before).toBeNull();
  });

  it('filters by app on the server', async () => {
    const r = await listActivity(seed(), owner as never, {
      page: 1,
      limit: 25,
      platform: 'chatgpt',
    });
    expect(r.total).toBe(10);
    expect(r.items.every((i) => i.platform === 'chatgpt')).toBe(true);
  });

  it('keeps members to their own rows', async () => {
    const r = await listActivity(
      seed(),
      { accountId: 'acct', userId: 'member', role: 'member' } as never,
      { page: 1, limit: 100 }
    );
    expect(r.total).toBe(15);
  });

  it('cursor mode is unchanged', async () => {
    const r = await listActivity(seed(), owner as never, { limit: 25 });
    expect(r.items).toHaveLength(25);
    expect(r.next_before).toBe(r.items[24].created_at);
    expect(r.total).toBeUndefined();
  });
});
