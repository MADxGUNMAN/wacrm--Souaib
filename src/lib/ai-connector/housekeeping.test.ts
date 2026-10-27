import { describe, expect, it } from 'vitest';
import { idleConnectionIds } from './housekeeping';

const now = new Date('2026-08-06T12:00:00Z');
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 86_400_000).toISOString();

describe('idleConnectionIds', () => {
  it('uses each connection’s own idle window, defaulting to 30 days', () => {
    const ids = idleConnectionIds(
      [
        {
          id: 'a',
          settings: {},
          last_used_at: daysAgo(31),
          created_at: daysAgo(100),
        },
        {
          id: 'b',
          settings: {},
          last_used_at: daysAgo(29),
          created_at: daysAgo(100),
        },
        {
          id: 'c',
          settings: { idle_days: 3 },
          last_used_at: daysAgo(4),
          created_at: daysAgo(10),
        },
        {
          id: 'd',
          settings: { idle_days: 3 },
          last_used_at: null,
          created_at: daysAgo(2),
        },
        {
          id: 'e',
          settings: { idle_days: 3 },
          last_used_at: null,
          created_at: daysAgo(5),
        },
      ],
      now
    );
    expect(ids).toEqual(['a', 'c', 'e']);
  });
});
