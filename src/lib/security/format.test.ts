import { describe, expect, it } from 'vitest';
import { dash, formatCountry, formatEventTime, formatRelative } from './format';

describe('security formatting', () => {
  it('formats event times with an ordinal day', () => {
    // Build the date in local time so the assertion is timezone-proof.
    const d = new Date(2026, 9, 15, 17, 38);
    expect(formatEventTime(d.toISOString())).toBe('15th Oct 26 17:38');
    expect(formatEventTime(null)).toBe('—');
    expect(formatEventTime('nope')).toBe('—');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(formatRelative('2026-10-15T11:59:58Z', now)).toBe('Active now');
    expect(formatRelative(null, now)).toBe('—');
    expect(formatRelative('2026-10-15T11:59:00Z', Date.now())).toMatch(/ago$/);
  });

  it('formats countries and empty values', () => {
    expect(formatCountry('India', 'IN')).toBe('India (IN)');
    expect(formatCountry(null, 'IN')).toBe('IN');
    expect(formatCountry(null, null)).toBe('—');
    expect(dash('  ')).toBe('—');
    expect(dash('Chrome')).toBe('Chrome');
  });
});
