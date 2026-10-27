import { describe, expect, it } from 'vitest';
import {
  daysAgoStart,
  isValidTimeZone,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils';
import { loadConversationsSeries, loadMetrics } from './queries';

// 2026-08-06T20:00Z is 01:30 on Friday 7 Aug in India.
const NOW = new Date('2026-08-06T20:00:00Z');
const IST = 'Asia/Kolkata';
const RUNTIME_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('explicit timezone day boundaries', () => {
  it('computes IST midnight regardless of the server zone', () => {
    expect(startOfLocalDay(NOW, IST).toISOString()).toBe(
      '2026-08-06T18:30:00.000Z'
    );
    expect(daysAgoStart(1, { timeZone: IST, now: NOW }).toISOString()).toBe(
      '2026-08-05T18:30:00.000Z'
    );
    expect(daysAgoStart(31, { timeZone: IST, now: NOW }).toISOString()).toBe(
      '2026-07-06T18:30:00.000Z'
    );
    expect(localDayKey(NOW, IST)).toBe('2026-08-07');
    expect(localDayKey(NOW, 'UTC')).toBe('2026-08-06');
    expect(mondayIndex(NOW, IST)).toBe(4); // Friday
    expect(lastNDayKeys(3, { timeZone: IST, now: NOW })).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('handles DST zones', () => {
    // 2026-03-08 is the US spring-forward day; midnight is still UTC-5.
    expect(
      startOfLocalDay(
        new Date('2026-03-08T12:00:00Z'),
        'America/New_York'
      ).toISOString()
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      startOfLocalDay(
        new Date('2026-03-09T12:00:00Z'),
        'America/New_York'
      ).toISOString()
    ).toBe('2026-03-09T04:00:00.000Z');
  });

  it('matches the browser behaviour when the zone is the runtime zone', () => {
    expect(startOfLocalDay(NOW, RUNTIME_TZ).getTime()).toBe(
      startOfLocalDay(NOW).getTime()
    );
    expect(daysAgoStart(13, { timeZone: RUNTIME_TZ, now: NOW }).getTime()).toBe(
      daysAgoStart(13, { now: NOW }).getTime()
    );
    expect(lastNDayKeys(7, { timeZone: RUNTIME_TZ, now: NOW })).toEqual(
      lastNDayKeys(7, { now: NOW })
    );
    expect(mondayIndex(NOW, RUNTIME_TZ)).toBe(mondayIndex(NOW));
  });

  it('validates zone names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

// ------------------------------------------------------------
// The AI's numbers come from the same loaders as the Dashboard page.
// A recording fake DB proves both issue identical queries for the same
// day, so they return identical numbers for the same data.
// ------------------------------------------------------------

type Call = [string, ...unknown[]];
function recordingDb(rows: Record<string, unknown[]> = {}) {
  const log: { table: string; calls: Call[] }[] = [];
  const db = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] };
      log.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lt', 'in', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => {
          entry.calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: rows[table] ?? [],
          count: (rows[table] ?? []).length,
          error: null,
        });
      return builder;
    },
  };
  return { db: db as never, log };
}

describe('dashboard parity', () => {
  it('loadMetrics issues the same queries with the runtime zone as the dashboard does without one', async () => {
    const a = recordingDb();
    const b = recordingDb();
    await loadMetrics(a.db, { now: NOW });
    await loadMetrics(b.db, { now: NOW, timeZone: RUNTIME_TZ });
    expect(b.log).toEqual(a.log);
  });

  it('uses the workspace day for "today" (IST, not server UTC)', async () => {
    const r = recordingDb();
    await loadMetrics(r.db, { now: NOW, timeZone: IST });
    const gtes = r.log.flatMap((e) =>
      e.calls.filter((c) => c[0] === 'gte').map((c) => c[2])
    );
    expect(gtes).toContain('2026-08-06T18:30:00.000Z');
    expect(gtes).toContain('2026-08-05T18:30:00.000Z');
  });

  it('buckets the series by the workspace day', async () => {
    const r = recordingDb({
      messages: [
        { created_at: '2026-08-06T19:00:00Z', sender_type: 'customer' }, // 00:30 IST on the 7th
        { created_at: '2026-08-06T10:00:00Z', sender_type: 'agent' }, // 15:30 IST on the 6th
      ],
    });
    const series = await loadConversationsSeries(r.db, 7, {
      now: NOW,
      timeZone: IST,
    });
    expect(series.at(-1)).toEqual({
      day: '2026-08-07',
      incoming: 1,
      outgoing: 0,
    });
    expect(series.at(-2)).toEqual({
      day: '2026-08-06',
      incoming: 0,
      outgoing: 1,
    });
  });
});
