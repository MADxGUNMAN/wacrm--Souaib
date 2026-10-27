import { describe, expect, it } from 'vitest';

import { formatBillingDate } from './format';

describe('formatBillingDate', () => {
  it('uses the IST calendar date', () => {
    // 18:29 UTC is 23:59 IST the same day; 18:31 UTC is past midnight IST.
    expect(formatBillingDate('2026-10-21T18:29:00.000Z')).toBe('21 Oct 2026');
    expect(formatBillingDate('2026-10-21T18:31:00.000Z')).toBe('22 Oct 2026');
    expect(formatBillingDate(new Date('2027-04-06T00:00:00.000Z'))).toBe(
      '6 Apr 2027'
    );
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatBillingDate(null)).toBe('');
    expect(formatBillingDate(undefined)).toBe('');
    expect(formatBillingDate('not a date')).toBe('');
  });
});
