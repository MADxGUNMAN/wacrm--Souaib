import { describe, expect, it } from 'vitest';

import {
  syncWindowHoursRemaining,
  SYNC_WINDOW_HOURS,
} from './coexistence-sync';

/**
 * The 24-hour window is the highest-stakes number in the whole
 * Coexistence feature.
 *
 * Meta accepts the history + contact import request ONCE, and only within
 * 24 hours of the number being connected. Miss it and the only way back is
 * for the customer to disconnect and re-onboard — losing the history they
 * chose Coexistence in order to keep.
 *
 * So the countdown that drives the UI, and the guard that decides whether
 * to bother calling Meta at all, get tested rather than assumed.
 */

/** Hours ago, as an ISO string. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

describe('syncWindowHoursRemaining', () => {
  it('reports nearly the full window immediately after connecting', () => {
    const remaining = syncWindowHoursRemaining(new Date().toISOString());
    expect(remaining).not.toBeNull();
    // Allow a hair under for the milliseconds spent getting here.
    expect(remaining!).toBeGreaterThan(SYNC_WINDOW_HOURS - 0.1);
    expect(remaining!).toBeLessThanOrEqual(SYNC_WINDOW_HOURS);
  });

  it('counts down as time passes', () => {
    expect(syncWindowHoursRemaining(hoursAgo(6))).toBeCloseTo(18, 0);
    expect(syncWindowHoursRemaining(hoursAgo(20))).toBeCloseTo(4, 0);
  });

  it('goes NEGATIVE once the window has closed, rather than clamping at 0', () => {
    // Deliberate: the UI needs to distinguish "no time left" from "expired
    // some time ago", and the sync guard tests `> 0`. Clamping at zero
    // would make an expired window look like one about to expire, and
    // leave a Retry button on screen that cannot possibly work.
    const remaining = syncWindowHoursRemaining(hoursAgo(30));
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeLessThan(0);
  });

  it('returns null when there is no connection timestamp', () => {
    // Null means "unknown", NOT "expired". A missing timestamp must not
    // block the import — the caller treats null as permission to try,
    // because refusing on missing data would deny an import that Meta
    // would have accepted.
    expect(syncWindowHoursRemaining(null)).toBeNull();
    expect(syncWindowHoursRemaining(undefined)).toBeNull();
  });
});
