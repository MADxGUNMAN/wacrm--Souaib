/**
 * conditions.js — the 19 condition operators. PURE: no Apps Script
 * services, no clock, no timezone lookup. This is the file most likely
 * to contain a quiet bug that sends a real message on the wrong day, so
 * it is also the file that is unit-tested.
 *
 * Contract:
 *   evaluate(operatorId, cellValue, expected, ctx) → boolean
 *   ctx = { today: 'yyyy-MM-dd' | parts | Date, dateOrder: 'MDY'|'DMY' }
 *
 * `today` must already be resolved in the SPREADSHEET's timezone by the
 * caller — see the header of dates.js for why that is not done here.
 *
 * Three rules that hold for every operator:
 *
 * 1. It returns false rather than throwing. A messy column (a stray
 *    header row, an #N/A, a half-typed date) must skip that row, not end
 *    the run and strand every later rule.
 * 2. Text comparison trims and ignores case. A trailing space in a cell
 *    is invisible and routine, and `'Pass '` failing to match `'Pass'`
 *    reads as a broken product, not as strictness.
 * 3. Numeric comparison parses strictly. A non-numeric cell makes the
 *    condition false; it never coerces its way to an answer.
 */
const ReplaiConditions = {
  /**
   * Dropdown order is copied from the reference product (plan §2.5)
   * because operators are picked by scanning, and re-sorting a list
   * users already know is a gratuitous cost.
   *
   * valueKind drives the wizard: 'none' hides the value input entirely,
   * 'days' relabels it to a day count, 'number' and 'text' show it as-is.
   */
  OPERATORS: [
    { id: 'equals', label: 'Equals', valueKind: 'text' },
    { id: 'contains', label: 'Contains', valueKind: 'text' },
    { id: 'not_equals', label: 'Not equals', valueKind: 'text' },
    { id: 'not_contains', label: 'Does not contain', valueKind: 'text' },
    { id: 'is_empty', label: 'Is empty', valueKind: 'none' },
    { id: 'is_not_empty', label: 'Is not empty', valueKind: 'none' },
    { id: 'greater_than', label: 'Greater than', valueKind: 'number' },
    {
      id: 'greater_than_or_equal',
      label: 'Greater than or equal',
      valueKind: 'number',
    },
    { id: 'less_than', label: 'Less than', valueKind: 'number' },
    {
      id: 'less_than_or_equal',
      label: 'Less than or equal',
      valueKind: 'number',
    },
    {
      id: 'date_equals_today',
      label: 'Date: Equals today',
      valueKind: 'none',
      isDate: true,
    },
    {
      id: 'date_day_month_today',
      label: 'Date: Day & Month today',
      valueKind: 'none',
      isDate: true,
    },
    {
      id: 'date_day_month_in_days',
      label: 'Date: Day & Month in X days (upcoming)',
      valueKind: 'days',
      isDate: true,
    },
    {
      id: 'date_day_month_days_ago',
      label: 'Date: Day & Month was X days ago (past)',
      valueKind: 'days',
      isDate: true,
    },
    {
      id: 'date_day_today',
      label: 'Date: Day only today',
      valueKind: 'none',
      isDate: true,
    },
    {
      id: 'date_day_in_days',
      label: 'Date: Day in X days (upcoming)',
      valueKind: 'days',
      isDate: true,
    },
    {
      id: 'date_day_days_ago',
      label: 'Date: Day was X days ago (past)',
      valueKind: 'days',
      isDate: true,
    },
    {
      id: 'date_in_days',
      label: 'Date: In X days from today (upcoming)',
      valueKind: 'days',
      isDate: true,
    },
    {
      id: 'date_days_ago',
      label: 'Date: Was X days ago (past)',
      valueKind: 'days',
      isDate: true,
    },
  ],

  /** @returns {?Object} operator metadata, or null for an unknown id. */
  find: function (operatorId) {
    for (let i = 0; i < ReplaiConditions.OPERATORS.length; i++) {
      if (ReplaiConditions.OPERATORS[i].id === operatorId) {
        return ReplaiConditions.OPERATORS[i];
      }
    }
    return null;
  },

  /** True when this operator needs no value input. */
  needsNoValue: function (operatorId) {
    const op = ReplaiConditions.find(operatorId);
    return !!op && op.valueKind === 'none';
  },

  /** True when the value input is a day count rather than free text. */
  needsDayCount: function (operatorId) {
    const op = ReplaiConditions.find(operatorId);
    return !!op && op.valueKind === 'days';
  },

  /**
   * @param {string} operatorId
   * @param {*} cellValue  Raw value from the sheet: string, number, Date,
   *   or empty.
   * @param {*} expected   The rule's configured value. Ignored for
   *   'none' operators.
   * @param {{today: *, dateOrder: string}} [ctx]
   * @returns {boolean}
   */
  evaluate: function (operatorId, cellValue, expected, ctx) {
    const context = ctx || {};

    switch (operatorId) {
      // ---- presence ----
      case 'is_empty':
        return ReplaiConditions.isBlank_(cellValue);
      case 'is_not_empty':
        return !ReplaiConditions.isBlank_(cellValue);

      // ---- text ----
      case 'equals':
        return (
          ReplaiConditions.text_(cellValue) === ReplaiConditions.text_(expected)
        );
      case 'not_equals':
        return (
          ReplaiConditions.text_(cellValue) !== ReplaiConditions.text_(expected)
        );
      case 'contains':
        return ReplaiConditions.contains_(cellValue, expected);
      case 'not_contains':
        // Deliberately NOT `!contains_`: an empty needle makes contains_
        // false, and flipping that would make "does not contain <blank>"
        // match every row in the sheet.
        return (
          ReplaiConditions.text_(expected) !== '' &&
          !ReplaiConditions.contains_(cellValue, expected)
        );

      // ---- numeric ----
      case 'greater_than':
        return ReplaiConditions.compare_(cellValue, expected, function (a, b) {
          return a > b;
        });
      case 'greater_than_or_equal':
        return ReplaiConditions.compare_(cellValue, expected, function (a, b) {
          return a >= b;
        });
      case 'less_than':
        return ReplaiConditions.compare_(cellValue, expected, function (a, b) {
          return a < b;
        });
      case 'less_than_or_equal':
        return ReplaiConditions.compare_(cellValue, expected, function (a, b) {
          return a <= b;
        });

      // ---- dates ----
      // Three recurrence shapes, and each has an "on the day", an
      // "upcoming" and a "past" form:
      //   full date  → one-off      (11, 18, 19)
      //   day+month  → annual       (12, 13, 14)
      //   day only   → monthly      (15, 16, 17)
      case 'date_equals_today':
        return ReplaiConditions.date_(
          cellValue,
          0,
          context,
          ReplaiDates.isSameDate
        );
      case 'date_in_days':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.days_(expected),
          context,
          ReplaiDates.isSameDate
        );
      case 'date_days_ago':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.negate_(ReplaiConditions.days_(expected)),
          context,
          ReplaiDates.isSameDate
        );

      case 'date_day_month_today':
        return ReplaiConditions.date_(
          cellValue,
          0,
          context,
          ReplaiDates.isSameDayMonth
        );
      case 'date_day_month_in_days':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.days_(expected),
          context,
          ReplaiDates.isSameDayMonth
        );
      case 'date_day_month_days_ago':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.negate_(ReplaiConditions.days_(expected)),
          context,
          ReplaiDates.isSameDayMonth
        );

      case 'date_day_today':
        return ReplaiConditions.date_(
          cellValue,
          0,
          context,
          ReplaiDates.isSameDayOfMonth
        );
      case 'date_day_in_days':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.days_(expected),
          context,
          ReplaiDates.isSameDayOfMonth
        );
      case 'date_day_days_ago':
        return ReplaiConditions.date_(
          cellValue,
          ReplaiConditions.negate_(ReplaiConditions.days_(expected)),
          context,
          ReplaiDates.isSameDayOfMonth
        );

      default:
        // An unknown operator is a bug or a rule written by a newer
        // version of the add-on. Either way, not matching is the safe
        // answer: it withholds a message rather than sending a wrong one.
        return false;
    }
  },

  /**
   * Every condition must hold (AND). There is no OR: the reference
   * product offers no selector for it, and inventing one changes what a
   * rule means without the operator asking.
   *
   * Zero conditions is legitimate — `New Row Added` with no conditions
   * means "every new row" (plan §8.2) — so it returns true.
   *
   * @param {Array} conditions [{ column, operator, value }]
   * @param {function(string): *} getCell  column header → cell value
   */
  evaluateAll: function (conditions, getCell, ctx) {
    if (!conditions || conditions.length === 0) return true;

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const value = getCell(condition.column);
      if (
        !ReplaiConditions.evaluate(
          condition.operator,
          value,
          condition.value,
          ctx
        )
      ) {
        return false;
      }
    }
    return true;
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  isBlank_: function (value) {
    if (value === null || value === undefined) return true;
    if (value instanceof Date) return false;
    return String(value).trim() === '';
  },

  text_: function (value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
  },

  contains_: function (cellValue, expected) {
    const needle = ReplaiConditions.text_(expected);
    if (needle === '') return false;
    return ReplaiConditions.text_(cellValue).indexOf(needle) !== -1;
  },

  /**
   * Strict number parse. Accepts a real number cell as-is and text that
   * is nothing but a number. Rejects '12abc', '1,200' and '' — Number()
   * and parseFloat both say yes to at least one of those, which is how a
   * "Price > 1000" condition ends up firing on a row that says
   * "1000 units".
   */
  number_: function (value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw)) return null;
    const parsed = Number(raw);
    return isFinite(parsed) ? parsed : null;
  },

  compare_: function (cellValue, expected, test) {
    const a = ReplaiConditions.number_(cellValue);
    const b = ReplaiConditions.number_(expected);
    if (a === null || b === null) return false;
    return test(a, b);
  },

  /** Day count for the offset operators: a non-negative integer, or null. */
  days_: function (value) {
    const parsed = ReplaiConditions.number_(value);
    if (parsed === null) return null;
    if (parsed < 0 || Math.floor(parsed) !== parsed) return null;
    return parsed;
  },

  negate_: function (days) {
    return days === null ? null : -days;
  },

  /**
   * Shared shape of every date operator: resolve today, shift it by the
   * offset, read the cell as a date, then compare with the supplied
   * matcher. Any missing piece means false.
   */
  date_: function (cellValue, offsetDays, ctx, matcher) {
    if (offsetDays === null) return false;

    const today = ReplaiDates.resolveToday(ctx.today);
    if (!today) return false;

    const cell = ReplaiDates.partsFromValue(cellValue, ctx.dateOrder);
    if (!cell) return false;

    const target =
      offsetDays === 0 ? today : ReplaiDates.addDays(today, offsetDays);
    return matcher(cell, target);
  },
};

/*
  Node/vitest only — see the note at the foot of dates.js.

  Apps Script gives every project file one shared global scope, so the
  `ReplaiDates` reference above simply resolves. Under Node each file is
  its own module, so the test harness puts ReplaiDates on globalThis
  before calling anything here. Doing that from the test rather than with
  a require() in this file keeps the production source free of a module
  system Apps Script does not have.
*/
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiConditions: ReplaiConditions };
}
