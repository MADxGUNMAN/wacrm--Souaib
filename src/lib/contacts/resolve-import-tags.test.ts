import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assignImportedContactTags } from './resolve-import-tags';

function mockSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const client = { from: vi.fn(() => ({ upsert })) };
  return { client: client as unknown as SupabaseClient, upsert };
}

describe('assignImportedContactTags', () => {
  it('reports progress after every chunk of 100 pairs', async () => {
    const { client, upsert } = mockSupabase();
    const assignments = Array.from({ length: 250 }, (_, i) => ({
      contactId: `c${i}`,
      tagNames: ['IRAN'],
    }));
    const onProgress = vi.fn();

    const assigned = await assignImportedContactTags(
      client,
      assignments,
      new Map([['iran', 't1']]),
      onProgress
    );

    expect(assigned).toBe(250);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls).toEqual([
      [100, 250],
      [200, 250],
      [250, 250],
    ]);
  });

  it('works without a progress callback', async () => {
    const { client } = mockSupabase();
    await expect(
      assignImportedContactTags(
        client,
        [{ contactId: 'c1', tagNames: ['VIP'] }],
        new Map([['vip', 't1']])
      )
    ).resolves.toBe(1);
  });
});
