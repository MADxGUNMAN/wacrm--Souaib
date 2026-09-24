import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  claimScheduledBroadcast,
  parseStoredSendParams,
} from './scheduled-broadcasts';

/**
 * `send_params` is JSONB written by whichever version of the app booked
 * the campaign, then read back — possibly weeks later — by the sweep.
 * A throw here would strand the broadcast in 'sending', where it is
 * invisible to both the sweep (which only looks for 'scheduled') and the
 * operator (who sees a spinner that never resolves). So every malformed
 * shape has to degrade to "send with no parameters" instead.
 */
describe('parseStoredSendParams', () => {
  it('reads a well-formed value', () => {
    const stored = {
      params: ['Jane', 'ORD-1'],
      messageParams: { headerMediaUrl: 'https://x.test/a.jpg' },
    };
    expect(parseStoredSendParams(stored)).toEqual({
      params: ['Jane', 'ORD-1'],
      messageParams: { headerMediaUrl: 'https://x.test/a.jpg' },
    });
  });

  it('degrades to empty params for null and undefined', () => {
    expect(parseStoredSendParams(null)).toEqual({ params: [] });
    expect(parseStoredSendParams(undefined)).toEqual({ params: [] });
  });

  it('degrades to empty params for a non-object', () => {
    expect(parseStoredSendParams('nonsense')).toEqual({ params: [] });
    expect(parseStoredSendParams(42)).toEqual({ params: [] });
  });

  it('treats a non-array params field as no params', () => {
    expect(parseStoredSendParams({ params: 'Jane' })).toEqual({ params: [] });
    expect(parseStoredSendParams({ params: { 0: 'Jane' } })).toEqual({
      params: [],
    });
  });

  it('drops non-string entries rather than sending null to Meta', () => {
    // Meta rejects a null parameter outright, and `String(null)` would
    // deliver the literal text "null" to a customer.
    expect(
      parseStoredSendParams({ params: ['Jane', null, 7, 'ORD-1'] })
    ).toEqual({ params: ['Jane', 'ORD-1'] });
  });

  it('omits messageParams when it is absent or not an object', () => {
    expect(parseStoredSendParams({ params: [] }).messageParams).toBeUndefined();
    expect(
      parseStoredSendParams({ params: [], messageParams: 'x' }).messageParams
    ).toBeUndefined();
  });

  it('keeps an empty params array distinguishable from a missing one', () => {
    // Both end up as [], which is correct: a template with no variables
    // and a lost value both mean "send no body parameters".
    expect(parseStoredSendParams({ params: [] })).toEqual({ params: [] });
  });
});

/**
 * The claim is the ENTIRE protection against sending a paid marketing
 * campaign twice. The sweep runs on a timer, so a run slower than its
 * interval overlaps the next one; both would read the same due row.
 *
 * These tests pin the contract that the guard lives in the WHERE clause
 * (`status = 'scheduled'`), not in a read-then-decide in JavaScript —
 * which could not be safe, because both ticks would read "not sent yet".
 */
describe('claimScheduledBroadcast', () => {
  /** Minimal chainable stub of the Supabase query builder. */
  function stubDb(result: { data: unknown; error: unknown }) {
    const eq = vi.fn();
    const chain = {
      update: vi.fn(() => chain),
      eq: eq.mockImplementation(() => chain),
      select: vi.fn(() => Promise.resolve(result)),
    };
    const from = vi.fn(() => chain);
    return { db: { from } as unknown as SupabaseClient, chain, from };
  }

  it('claims the broadcast when the conditional update matches a row', async () => {
    const { db } = stubDb({ data: [{ id: 'b1' }], error: null });
    await expect(claimScheduledBroadcast(db, 'b1')).resolves.toBe('claimed');
  });

  it('guards the update on status, so a second tick cannot claim it', async () => {
    const { db, chain } = stubDb({ data: [{ id: 'b1' }], error: null });
    await claimScheduledBroadcast(db, 'b1');

    // Both filters must be present: the id AND the status. Dropping the
    // status filter is what would allow a double send.
    expect(chain.eq).toHaveBeenCalledWith('id', 'b1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'scheduled');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sending' })
    );
  });

  it('reports already_taken when zero rows matched', async () => {
    // The losing side of a race. A normal outcome, not an error — this
    // happens every time two ticks overlap.
    const { db } = stubDb({ data: [], error: null });
    await expect(claimScheduledBroadcast(db, 'b1')).resolves.toBe(
      'already_taken'
    );
  });

  it('reports already_taken when the update returns no data at all', async () => {
    const { db } = stubDb({ data: null, error: null });
    await expect(claimScheduledBroadcast(db, 'b1')).resolves.toBe(
      'already_taken'
    );
  });

  it('throws on a database error rather than silently skipping', async () => {
    // Skipping on error would mean a due campaign quietly never sends.
    // The caller marks it failed so the operator can see it.
    const { db } = stubDb({
      data: null,
      error: { message: 'connection lost' },
    });
    await expect(claimScheduledBroadcast(db, 'b1')).rejects.toThrow(
      /connection lost/
    );
  });
});
