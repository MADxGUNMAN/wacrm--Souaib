import { describe, expect, it } from 'vitest';

import { formatSubscriptionSince } from './subscription-status';

describe('formatSubscriptionSince', () => {
  it('formats an ISO timestamp as a short unambiguous date', () => {
    // Fixed offset in the string so the assertion is not timezone-dependent
    // on the machine running the suite.
    const out = formatSubscriptionSince('2026-07-02T10:44:00+00:00');
    expect(out).toMatch(/2 Jul 2026/);
  });

  it('returns null for a missing date rather than a placeholder', () => {
    // The caller decides what to render when there is no recorded
    // transition. Returning "—" or "Unknown" here would force that
    // decision into the formatter and make the fallback path unreachable.
    expect(formatSubscriptionSince(null)).toBeNull();
  });

  it('returns null for an unparseable value instead of "Invalid Date"', () => {
    expect(formatSubscriptionSince('not a date')).toBeNull();
    expect(formatSubscriptionSince('')).toBeNull();
  });
});
