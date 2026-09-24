import { describe, expect, it } from 'vitest';

import {
  OFFLINE_AFTER_MS,
  derivePresence,
  formatLastSeen,
  presenceLabel,
  summarize,
} from './presence';

// Fixed reference clock so every case is deterministic.
const NOW = new Date('2026-06-22T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('derivePresence', () => {
  it('returns the stored status for a fresh heartbeat', () => {
    expect(derivePresence('online', ago(1_000), NOW)).toBe('online');
    expect(derivePresence('away', ago(1_000), NOW)).toBe('away');
  });

  it('reads as offline when the heartbeat is stale', () => {
    expect(derivePresence('online', ago(OFFLINE_AFTER_MS + 1_000), NOW)).toBe(
      'offline'
    );
    // Stored 'away' goes stale to offline too (tab was closed while idle).
    expect(derivePresence('away', ago(OFFLINE_AFTER_MS + 1_000), NOW)).toBe(
      'offline'
    );
  });

  it('treats a missing row or timestamp as offline', () => {
    expect(derivePresence(undefined, null, NOW)).toBe('offline');
    expect(derivePresence('online', null, NOW)).toBe('offline');
    expect(derivePresence('online', 'not-a-date', NOW)).toBe('offline');
  });

  it('stays online exactly at the threshold and flips just past it', () => {
    expect(derivePresence('online', ago(OFFLINE_AFTER_MS), NOW)).toBe('online');
    expect(derivePresence('online', ago(OFFLINE_AFTER_MS + 1), NOW)).toBe(
      'offline'
    );
  });
});

describe('formatLastSeen', () => {
  it('describes recent activity coarsely', () => {
    expect(formatLastSeen(ago(10_000), NOW)).toBe('just now');
    expect(formatLastSeen(ago(60_000), NOW)).toBe('1 minute ago');
    expect(formatLastSeen(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
  });

  const HOUR = 60 * 60_000;
  const DAY = 24 * HOUR;

  it('rolls up into hours within the day', () => {
    expect(formatLastSeen(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(formatLastSeen(ago(2 * HOUR), NOW)).toBe('2 hours ago');
    expect(formatLastSeen(ago(23 * HOUR), NOW)).toBe('23 hours ago');
  });

  it('reports days AND hours past the first day, like WhatsApp', () => {
    // A bare "2 days ago" covered everything from 48 to 71 hours, hiding
    // the difference between "left this morning" and "left three days ago".
    expect(formatLastSeen(ago(DAY + 5 * HOUR), NOW)).toBe('1 day 5 hours ago');
    expect(formatLastSeen(ago(2 * DAY + 5 * HOUR), NOW)).toBe(
      '2 days 5 hours ago'
    );
    expect(formatLastSeen(ago(3 * DAY + 1 * HOUR), NOW)).toBe(
      '3 days 1 hour ago'
    );
  });

  it("drops a zero hours part rather than saying '0 hours'", () => {
    expect(formatLastSeen(ago(DAY), NOW)).toBe('1 day ago');
    expect(formatLastSeen(ago(3 * DAY), NOW)).toBe('3 days ago');
  });

  it('does not round up across a boundary', () => {
    // 47h59m is still 1 day, not 2.
    expect(formatLastSeen(ago(2 * DAY - 60_000), NOW)).toBe(
      '1 day 23 hours ago'
    );
    expect(formatLastSeen(ago(60 * 60_000 - 1_000), NOW)).toBe(
      '59 minutes ago'
    );
  });

  it("reads 'just now' for a clock running ahead of the server", () => {
    // Negative elapsed time is clamped, not rendered as "-3 minutes".
    expect(formatLastSeen(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe(
      'just now'
    );
  });

  it('falls back gracefully on missing/invalid input', () => {
    expect(formatLastSeen(null, NOW)).toBe('a while ago');
    expect(formatLastSeen('nonsense', NOW)).toBe('a while ago');
  });
});

describe('presenceLabel', () => {
  it('labels each state for the tooltip', () => {
    expect(presenceLabel('online', ago(1_000), NOW)).toBe(
      'Online — active now'
    );
    expect(presenceLabel('away', ago(1_000), NOW)).toBe('Away — idle');
    expect(presenceLabel('offline', ago(2 * 60 * 60_000), NOW)).toBe(
      'Offline — last seen 2 hours ago'
    );
  });
});

describe('summarize', () => {
  it('counts each status', () => {
    expect(
      summarize(['online', 'online', 'online', 'away', 'offline'])
    ).toEqual({ online: 3, away: 1, offline: 1 });
  });

  it('returns zeroes for an empty roster', () => {
    expect(summarize([])).toEqual({ online: 0, away: 0, offline: 0 });
  });
});
