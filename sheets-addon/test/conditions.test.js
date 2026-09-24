import { beforeAll, describe, expect, it } from 'vitest';
import { ReplaiDates } from '../src/dates.js';
import { ReplaiConditions } from '../src/conditions.js';

/*
  All 19 operators, each in a matching and a non-matching case, plus the
  input shapes a real sheet produces: trailing spaces, mixed case, text
  that only looks numeric, and dates in half a dozen formats.

  Apps Script gives every project file one shared global scope, so
  conditions.js just refers to ReplaiDates. Under Node each file is a
  module, so the dependency is wired up here rather than with a require()
  inside the production source.
*/
beforeAll(() => {
  globalThis.ReplaiDates = ReplaiDates;
});

/** Fixed "today" for every date case: Monday 14 September 2026. */
const CTX = { today: '2026-09-14', dateOrder: 'DMY' };

const check = (operator, cell, expected, ctx) =>
  ReplaiConditions.evaluate(operator, cell, expected, ctx || CTX);

describe('operator catalogue', () => {
  it('exposes exactly the 19 operators from the reference dropdown', () => {
    expect(ReplaiConditions.OPERATORS).toHaveLength(19);
  });

  it('keeps the reference order: 10 comparison, then 9 date-aware', () => {
    const kinds = ReplaiConditions.OPERATORS.map((op) => !!op.isDate);
    expect(kinds.slice(0, 10).every((isDate) => isDate === false)).toBe(true);
    expect(kinds.slice(10).every((isDate) => isDate === true)).toBe(true);
  });

  it('marks which operators hide or relabel the value input', () => {
    expect(ReplaiConditions.needsNoValue('is_empty')).toBe(true);
    expect(ReplaiConditions.needsNoValue('date_day_month_today')).toBe(true);
    expect(ReplaiConditions.needsNoValue('equals')).toBe(false);
    expect(ReplaiConditions.needsDayCount('date_in_days')).toBe(true);
    expect(ReplaiConditions.needsDayCount('greater_than')).toBe(false);
  });

  it('has no unknown valueKind', () => {
    const allowed = ['none', 'text', 'number', 'days'];
    ReplaiConditions.OPERATORS.forEach((op) => {
      expect(allowed).toContain(op.valueKind);
    });
  });
});

describe('presence operators', () => {
  it('is_empty', () => {
    expect(check('is_empty', '')).toBe(true);
    expect(check('is_empty', '   ')).toBe(true);
    expect(check('is_empty', null)).toBe(true);
    expect(check('is_empty', undefined)).toBe(true);
    expect(check('is_empty', 'Pass')).toBe(false);
  });

  it('treats zero as a value, not as empty', () => {
    // A Quantity column of 0 is data. Reading it as blank would silently
    // change which rows a rule picks.
    expect(check('is_empty', 0)).toBe(false);
    expect(check('is_not_empty', 0)).toBe(true);
  });

  it('is_not_empty', () => {
    expect(check('is_not_empty', 'Pass')).toBe(true);
    expect(check('is_not_empty', '  ')).toBe(false);
  });
});

describe('text operators', () => {
  it('equals ignores case and surrounding space', () => {
    // A trailing space in a cell is invisible and routine; 'Pass ' failing
    // to match 'Pass' reads as a broken product.
    expect(check('equals', 'Pass ', 'Pass')).toBe(true);
    expect(check('equals', 'pass', 'PASS')).toBe(true);
    expect(check('equals', 'Passed', 'Pass')).toBe(false);
  });

  it('equals compares a number cell as text', () => {
    expect(check('equals', 393392, '393392')).toBe(true);
  });

  it('not_equals', () => {
    expect(check('not_equals', 'Fail', 'Pass')).toBe(true);
    expect(check('not_equals', 'PASS ', 'pass')).toBe(false);
  });

  it('contains', () => {
    expect(check('contains', 'Order shipped', 'ship')).toBe(true);
    expect(check('contains', 'Order shipped', 'cancel')).toBe(false);
  });

  it('contains with an empty needle matches nothing', () => {
    // The alternative is matching every row, which is never intended.
    expect(check('contains', 'anything', '')).toBe(false);
  });

  it('not_contains', () => {
    expect(check('not_contains', 'Order shipped', 'cancel')).toBe(true);
    expect(check('not_contains', 'Order shipped', 'ship')).toBe(false);
  });

  it('not_contains with an empty needle also matches nothing', () => {
    // Deliberately not the inverse of contains: "does not contain
    // <blank>" would otherwise match the whole sheet.
    expect(check('not_contains', 'anything', '')).toBe(false);
  });
});

describe('numeric operators', () => {
  it('compares numbers however the cell is typed', () => {
    expect(check('greater_than', 1200, '500')).toBe(true);
    expect(check('greater_than', '1200', 500)).toBe(true);
    expect(check('greater_than', 200, '500')).toBe(false);
  });

  it('covers the four comparisons at the boundary', () => {
    expect(check('greater_than', 500, '500')).toBe(false);
    expect(check('greater_than_or_equal', 500, '500')).toBe(true);
    expect(check('less_than', 500, '500')).toBe(false);
    expect(check('less_than_or_equal', 500, '500')).toBe(true);
    expect(check('less_than', 499.99, '500')).toBe(true);
  });

  it('handles negatives and decimals', () => {
    expect(check('less_than', '-5', '0')).toBe(true);
    expect(check('greater_than', '0.5', '.25')).toBe(true);
  });

  it('refuses to guess at text that merely starts with a number', () => {
    // parseFloat would read '1000 units' as 1000 and fire this rule.
    expect(check('greater_than', '1000 units', '500')).toBe(false);
    expect(check('greater_than', '1,200', '500')).toBe(false);
    expect(check('greater_than', '', '500')).toBe(false);
    expect(check('greater_than', 'abc', '500')).toBe(false);
  });

  it('is false, not an error, when the rule value is not a number', () => {
    expect(check('greater_than', 1200, 'five hundred')).toBe(false);
  });
});

describe('date operators — full date (one-off)', () => {
  it('date_equals_today', () => {
    expect(check('date_equals_today', '2026-09-14')).toBe(true);
    expect(check('date_equals_today', new Date(2026, 8, 14))).toBe(true);
    expect(check('date_equals_today', '2026-09-15')).toBe(false);
    expect(check('date_equals_today', '2025-09-14')).toBe(false);
  });

  it('date_in_days', () => {
    expect(check('date_in_days', '2026-09-19', '5')).toBe(true);
    expect(check('date_in_days', '2026-09-20', '5')).toBe(false);
    expect(check('date_in_days', '2026-09-14', '0')).toBe(true);
  });

  it('date_days_ago', () => {
    expect(check('date_days_ago', '2026-09-09', '5')).toBe(true);
    expect(check('date_days_ago', '2026-09-19', '5')).toBe(false);
  });

  it('crosses a month boundary', () => {
    const ctx = { today: '2026-09-30', dateOrder: 'DMY' };
    expect(check('date_in_days', '2026-10-02', '2', ctx)).toBe(true);
    expect(check('date_in_days', '2026-10-03', '2', ctx)).toBe(false);
  });

  it('crosses a year boundary', () => {
    const ctx = { today: '2026-12-31', dateOrder: 'DMY' };
    expect(check('date_in_days', '2027-01-01', '1', ctx)).toBe(true);
    expect(check('date_days_ago', '2026-12-30', '1', ctx)).toBe(true);
  });
});

describe('date operators — day and month (annual)', () => {
  it('date_day_month_today matches a birthday from any year', () => {
    expect(check('date_day_month_today', '1990-09-14')).toBe(true);
    expect(check('date_day_month_today', '1990-09-15')).toBe(false);
    expect(check('date_day_month_today', '1990-08-14')).toBe(false);
  });

  it('date_day_month_in_days for an anniversary reminder', () => {
    expect(check('date_day_month_in_days', '1988-09-17', '3')).toBe(true);
    expect(check('date_day_month_in_days', '1988-09-18', '3')).toBe(false);
  });

  it('date_day_month_days_ago', () => {
    expect(check('date_day_month_days_ago', '1988-09-11', '3')).toBe(true);
    expect(check('date_day_month_days_ago', '1988-09-12', '3')).toBe(false);
  });

  it('rolls the day+month target across the year end', () => {
    const ctx = { today: '2026-12-30', dateOrder: 'DMY' };
    expect(check('date_day_month_in_days', '1995-01-02', '3', ctx)).toBe(true);
  });
});

describe('date operators — day of month (monthly)', () => {
  it('date_day_today matches the same day in any month', () => {
    expect(check('date_day_today', '2026-08-14')).toBe(true);
    expect(check('date_day_today', '2001-01-14')).toBe(true);
    expect(check('date_day_today', '2026-08-13')).toBe(false);
  });

  it('date_day_in_days', () => {
    expect(check('date_day_in_days', '2020-01-16', '2')).toBe(true);
    expect(check('date_day_in_days', '2020-01-17', '2')).toBe(false);
  });

  it('date_day_days_ago', () => {
    expect(check('date_day_days_ago', '2020-01-10', '4')).toBe(true);
    expect(check('date_day_days_ago', '2020-01-11', '4')).toBe(false);
  });

  it('does not fire on the 31st in a month that has no 31st', () => {
    // February 2026 has 28 days, so a rule keyed to day 31 simply does
    // not fire that month. Clamping to the month end would be a guess
    // about intent, and it would send on a date nobody chose.
    const ctx = { today: '2026-02-28', dateOrder: 'DMY' };
    expect(check('date_day_today', '2026-01-31', '', ctx)).toBe(false);
    expect(check('date_day_today', '2026-01-28', '', ctx)).toBe(true);
  });

  it('handles 29 February in a leap year', () => {
    const ctx = { today: '2028-02-29', dateOrder: 'DMY' };
    expect(check('date_day_today', '2028-01-29', '', ctx)).toBe(true);
  });
});

describe('date operators — bad input', () => {
  it('is false when the cell is not a date', () => {
    expect(check('date_equals_today', 'delivered')).toBe(false);
    expect(check('date_equals_today', '')).toBe(false);
    expect(check('date_in_days', 45000, '2')).toBe(false);
  });

  it('is false when the day count is not a whole number of days', () => {
    expect(check('date_in_days', '2026-09-19', 'five')).toBe(false);
    expect(check('date_in_days', '2026-09-19', '-5')).toBe(false);
    expect(check('date_in_days', '2026-09-19', '1.5')).toBe(false);
    expect(check('date_in_days', '2026-09-19', '')).toBe(false);
  });

  it('is false when today was never resolved', () => {
    expect(check('date_equals_today', '2026-09-14', '', {})).toBe(false);
    expect(check('date_equals_today', '2026-09-14', '', { today: null })).toBe(
      false
    );
  });

  it('respects the locale hint for an ambiguous cell', () => {
    expect(check('date_equals_today', '14/09/2026', '', CTX)).toBe(true);
    expect(
      check('date_equals_today', '14/09/2026', '', {
        today: '2026-09-14',
        dateOrder: 'MDY',
      })
    ).toBe(true); // 14 cannot be a month, so it resolves either way

    expect(
      check('date_equals_today', '09/14/2026', '', {
        today: '2026-09-14',
        dateOrder: 'MDY',
      })
    ).toBe(true);
  });
});

describe('unknown operators', () => {
  it('never match', () => {
    // A rule written by a newer version of the add-on withholds a
    // message rather than sending a wrong one.
    expect(check('spins_the_wheel', 'anything', 'anything')).toBe(false);
    expect(check('', 'anything', 'anything')).toBe(false);
  });
});

describe('evaluateAll', () => {
  const row = { Status: 'Pass ', Price: 1200, Delivery: '2026-09-19' };
  const getCell = (column) => row[column];

  it('treats no conditions as a match, for "every new row"', () => {
    expect(ReplaiConditions.evaluateAll([], getCell, CTX)).toBe(true);
    expect(ReplaiConditions.evaluateAll(null, getCell, CTX)).toBe(true);
  });

  it('requires every condition to hold', () => {
    const conditions = [
      { column: 'Status', operator: 'equals', value: 'Pass' },
      { column: 'Price', operator: 'greater_than', value: '500' },
      { column: 'Delivery', operator: 'date_in_days', value: '5' },
    ];
    expect(ReplaiConditions.evaluateAll(conditions, getCell, CTX)).toBe(true);
  });

  it('fails the whole set when one condition fails', () => {
    const conditions = [
      { column: 'Status', operator: 'equals', value: 'Pass' },
      { column: 'Price', operator: 'greater_than', value: '5000' },
    ];
    expect(ReplaiConditions.evaluateAll(conditions, getCell, CTX)).toBe(false);
  });

  it('fails rather than throwing when a column is missing', () => {
    const conditions = [{ column: 'Nope', operator: 'equals', value: 'Pass' }];
    expect(ReplaiConditions.evaluateAll(conditions, getCell, CTX)).toBe(false);
  });
});
