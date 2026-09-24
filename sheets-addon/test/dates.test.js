import { describe, expect, it } from 'vitest';
import { ReplaiDates } from '../src/dates.js';

/*
  Dates are the part of this add-on that can be wrong without anyone
  noticing until a customer gets a reminder on the wrong day, so the
  awkward cases are tested explicitly: locale-ambiguous text, month and
  year boundaries, leap years, and impossible dates.
*/

const parts = (y, m, d) => ({ y, m, d });

describe('reading a date out of a cell', () => {
  it('reads a real date cell with the local getters', () => {
    // Apps Script builds this Date from the cell's serial number using
    // the script timezone, so the local getters give back the y/m/d the
    // user actually typed.
    expect(ReplaiDates.partsFromValue(new Date(2026, 8, 14))).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('reads ISO text', () => {
    expect(ReplaiDates.partsFromValue('2026-09-14')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('2026/09/14')).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('drops a time component', () => {
    expect(ReplaiDates.partsFromValue('2026-09-14 10:30:00')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('2026-09-14T22:45:00Z')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('2026-09-14 10:30 AM')).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('does not mistake the day for a time when stripping one', () => {
    // Regression: splitting on whitespace to drop the clock reduced
    // '14 Sep 2026' to '14' and the date came back null.
    expect(ReplaiDates.partsFromValue('14 Sep 2026 09:00')).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('uses the locale hint only when both readings are possible', () => {
    expect(ReplaiDates.partsFromValue('05/06/2026', 'DMY')).toEqual(
      parts(2026, 6, 5)
    );
    expect(ReplaiDates.partsFromValue('05/06/2026', 'MDY')).toEqual(
      parts(2026, 5, 6)
    );
  });

  it('ignores the locale hint when the numbers settle it', () => {
    // 25 cannot be a month, so this is day-first whatever the locale says.
    expect(ReplaiDates.partsFromValue('25/06/2026', 'MDY')).toEqual(
      parts(2026, 6, 25)
    );
    expect(ReplaiDates.partsFromValue('06/25/2026', 'DMY')).toEqual(
      parts(2026, 6, 25)
    );
  });

  it('reads textual months in both orders', () => {
    expect(ReplaiDates.partsFromValue('14 Sep 2026')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('Sep 14, 2026')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('14-September-2026')).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('expands a two-digit year around the 70 pivot', () => {
    expect(ReplaiDates.partsFromValue('14/09/26', 'DMY')).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.partsFromValue('14/09/99', 'DMY')).toEqual(
      parts(1999, 9, 14)
    );
  });

  it('refuses a date that does not exist', () => {
    // Without this, 30 February silently becomes 2 March and a condition
    // matches on a date nobody wrote.
    expect(ReplaiDates.partsFromValue('2026-02-30')).toBeNull();
    expect(ReplaiDates.partsFromValue('2026-13-01')).toBeNull();
    expect(ReplaiDates.partsFromValue('2026-04-31')).toBeNull();
  });

  it('accepts 29 February only in a leap year', () => {
    expect(ReplaiDates.partsFromValue('2028-02-29')).toEqual(
      parts(2028, 2, 29)
    );
    expect(ReplaiDates.partsFromValue('2026-02-29')).toBeNull();
  });

  it('is not a date for anything that is not one', () => {
    expect(ReplaiDates.partsFromValue('')).toBeNull();
    expect(ReplaiDates.partsFromValue(null)).toBeNull();
    expect(ReplaiDates.partsFromValue(undefined)).toBeNull();
    expect(ReplaiDates.partsFromValue('delivered')).toBeNull();
    expect(ReplaiDates.partsFromValue(new Date('nonsense'))).toBeNull();
  });

  it('does not read a bare number as a date serial', () => {
    // A Price column of 45000 must not look like a date in 2023.
    expect(ReplaiDates.partsFromValue(45000)).toBeNull();
  });
});

describe('resolveToday', () => {
  it('accepts a string, parts, or a Date', () => {
    expect(ReplaiDates.resolveToday('2026-09-14')).toEqual(parts(2026, 9, 14));
    expect(ReplaiDates.resolveToday(parts(2026, 9, 14))).toEqual(
      parts(2026, 9, 14)
    );
    expect(ReplaiDates.resolveToday(new Date(2026, 8, 14))).toEqual(
      parts(2026, 9, 14)
    );
  });

  it('returns null for nothing usable', () => {
    expect(ReplaiDates.resolveToday(null)).toBeNull();
    expect(ReplaiDates.resolveToday('later')).toBeNull();
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(ReplaiDates.addDays(parts(2026, 9, 30), 1)).toEqual(
      parts(2026, 10, 1)
    );
    expect(ReplaiDates.addDays(parts(2026, 10, 1), -1)).toEqual(
      parts(2026, 9, 30)
    );
  });

  it('crosses a year boundary', () => {
    expect(ReplaiDates.addDays(parts(2026, 12, 31), 1)).toEqual(
      parts(2027, 1, 1)
    );
    expect(ReplaiDates.addDays(parts(2027, 1, 1), -1)).toEqual(
      parts(2026, 12, 31)
    );
  });

  it('handles February in a leap and a non-leap year', () => {
    expect(ReplaiDates.addDays(parts(2028, 2, 28), 1)).toEqual(
      parts(2028, 2, 29)
    );
    expect(ReplaiDates.addDays(parts(2026, 2, 28), 1)).toEqual(
      parts(2026, 3, 1)
    );
  });

  it('is unaffected by a DST transition', () => {
    // 8 March 2026 is a spring-forward date in the US. Local-time
    // arithmetic here can land on the same calendar day twice; UTC
    // arithmetic cannot.
    expect(ReplaiDates.addDays(parts(2026, 3, 8), 1)).toEqual(
      parts(2026, 3, 9)
    );
    expect(ReplaiDates.addDays(parts(2026, 10, 25), 1)).toEqual(
      parts(2026, 10, 26)
    );
  });

  it('shifts by a whole month of days', () => {
    expect(ReplaiDates.addDays(parts(2026, 1, 15), 30)).toEqual(
      parts(2026, 2, 14)
    );
  });
});

describe('formatting and comparing', () => {
  it('zero-pads toIso, because idempotency keys are compared as strings', () => {
    expect(ReplaiDates.toIso(parts(2026, 1, 5))).toBe('2026-01-05');
    expect(ReplaiDates.toIso(parts(2026, 12, 31))).toBe('2026-12-31');
  });

  it('isSameDate needs the year to match', () => {
    expect(ReplaiDates.isSameDate(parts(2026, 9, 14), parts(2026, 9, 14))).toBe(
      true
    );
    expect(ReplaiDates.isSameDate(parts(1990, 9, 14), parts(2026, 9, 14))).toBe(
      false
    );
  });

  it('isSameDayMonth ignores the year, for annual recurrence', () => {
    expect(
      ReplaiDates.isSameDayMonth(parts(1990, 9, 14), parts(2026, 9, 14))
    ).toBe(true);
    expect(
      ReplaiDates.isSameDayMonth(parts(1990, 8, 14), parts(2026, 9, 14))
    ).toBe(false);
  });

  it('isSameDayOfMonth ignores the month, for monthly recurrence', () => {
    expect(
      ReplaiDates.isSameDayOfMonth(parts(2026, 3, 5), parts(2026, 9, 5))
    ).toBe(true);
    expect(
      ReplaiDates.isSameDayOfMonth(parts(2026, 3, 6), parts(2026, 9, 5))
    ).toBe(false);
  });
});
