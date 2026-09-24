/**
 * dates.js — date reading and date arithmetic. PURE: no Apps Script
 * services, no `new Date()` for "now", no timezone lookups. Everything
 * it needs is passed in, which is what makes the date operators (the
 * part of this add-on most likely to be subtly wrong) unit-testable in
 * Node.
 *
 * THE UNIT IS "PARTS", NOT Date
 * A calendar date in a spreadsheet has no timezone: a cell holding
 * 14 September 2026 means that wall-clock date to whoever typed it. A
 * JS Date is an instant, so the moment you put one of these in a Date
 * you have silently attached a timezone, and the day can shift when it
 * comes back out. So dates travel through here as
 * `{ y: 2026, m: 9, d: 14 }` — m is 1-12, not 0-11.
 *
 * WHERE THE TIMEZONE IS HONOURED
 * Not here. The caller resolves "today" in the SPREADSHEET's timezone
 * (`Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(),
 * 'yyyy-MM-dd')`) and passes it in. This diverges from the plan's §9.2
 * sketch, which passed `{ today: Date, timezone: string }` — a Date
 * cannot express "today in Kolkata" without this layer re-implementing
 * timezone maths it has no business owning, and a reminder that fires a
 * day early is a visible failure.
 *
 * Cell Date objects are read with the LOCAL getters on purpose. Apps
 * Script builds them from the cell's serial number using the script's
 * timezone, so the local getters give back exactly the y/m/d the user
 * typed. Converting them to any other zone would corrupt the date.
 */
const ReplaiDates = {
  MONTH_NAMES: {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  },

  /** yyyy-mm-dd (or yyyy/mm/dd), unambiguous in every locale. */
  ISO_RE: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/,

  /** Three numbers with a separator — order depends on locale. */
  TRIPLE_RE: /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/,

  /** 14 Sep 2026 · 14-September-2026 */
  DAY_MONTH_RE: /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})$/,

  /** Sep 14, 2026 · September 14 2026 */
  MONTH_DAY_RE: /^([A-Za-z]{3,9})[\s-]+(\d{1,2})[\s,-]+(\d{2,4})$/,

  /**
   * Read a calendar date out of whatever a sheet cell produced.
   *
   * @param {*} value  A Date (a real date cell), or text (a cell
   *   formatted as text, which is routine in imported sheets).
   * @param {string} [dateOrder] 'MDY' or 'DMY' — only consulted for
   *   text like 05/06/2026 where both readings are possible. Derive it
   *   from the spreadsheet locale; see sheets.js.
   * @returns {?{y: number, m: number, d: number}} null when the value is
   *   not a date. Never throws: a condition on a messy column must
   *   evaluate to false, not break the whole run.
   */
  partsFromValue: function (value, dateOrder) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) return ReplaiDates.partsFromDate(value);

    // A bare number is NOT read as a date serial. Sheets hands back a
    // real Date for anything actually formatted as a date, so a number
    // here means a number column — and guessing would make
    // "Price = 45000" look like a date in 2023.
    if (typeof value === 'number') return null;

    return ReplaiDates.partsFromText(String(value), dateOrder);
  },

  /** Local getters, deliberately. See the header note. */
  partsFromDate: function (date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
    return {
      y: date.getFullYear(),
      m: date.getMonth() + 1,
      d: date.getDate(),
    };
  },

  partsFromText: function (text, dateOrder) {
    let raw = String(text).trim();
    if (!raw) return null;

    // Drop a trailing clock time: '2026-09-14 10:30', '…T10:30:00Z',
    // '… 10:30 AM'. The clock is irrelevant to every operator here.
    //
    // Matched as a time rather than by splitting on whitespace — a split
    // would reduce '14 Sep 2026' to '14'.
    raw = raw
      .replace(
        /[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[AP]\.?M\.?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i,
        ''
      )
      .trim();

    let m = ReplaiDates.ISO_RE.exec(raw);
    if (m) {
      return ReplaiDates.validate_({
        y: Number(m[1]),
        m: Number(m[2]),
        d: Number(m[3]),
      });
    }

    m = ReplaiDates.TRIPLE_RE.exec(raw);
    if (m) {
      const first = Number(m[1]);
      const second = Number(m[2]);
      const year = ReplaiDates.expandYear_(Number(m[3]));

      // Prefer what the numbers themselves prove over the locale hint:
      // 25/06 can only be day-first, 06/25 can only be month-first.
      // The hint decides only the genuinely ambiguous middle ground.
      let day, month;
      if (first > 12) {
        day = first;
        month = second;
      } else if (second > 12) {
        month = first;
        day = second;
      } else if (dateOrder === 'MDY') {
        month = first;
        day = second;
      } else {
        day = first;
        month = second;
      }

      return ReplaiDates.validate_({ y: year, m: month, d: day });
    }

    m = ReplaiDates.DAY_MONTH_RE.exec(raw);
    if (m) {
      return ReplaiDates.validate_({
        y: ReplaiDates.expandYear_(Number(m[3])),
        m: ReplaiDates.monthFromName_(m[2]),
        d: Number(m[1]),
      });
    }

    m = ReplaiDates.MONTH_DAY_RE.exec(raw);
    if (m) {
      return ReplaiDates.validate_({
        y: ReplaiDates.expandYear_(Number(m[3])),
        m: ReplaiDates.monthFromName_(m[1]),
        d: Number(m[2]),
      });
    }

    return null;
  },

  /**
   * Normalise whatever the caller called "today" into parts. Accepts
   * parts, 'yyyy-MM-dd', or a Date (read locally, same reasoning as a
   * cell Date).
   */
  resolveToday: function (today) {
    if (!today) return null;
    if (today instanceof Date) return ReplaiDates.partsFromDate(today);
    if (typeof today === 'string') return ReplaiDates.partsFromText(today);
    if (
      typeof today.y === 'number' &&
      typeof today.m === 'number' &&
      typeof today.d === 'number'
    ) {
      return ReplaiDates.validate_(today);
    }
    return null;
  },

  /**
   * Shift by whole days. Done in UTC milliseconds so it is immune to
   * DST: local-time arithmetic across a spring-forward boundary can
   * land on the same calendar day twice or skip one, which would make a
   * "3 days before" reminder fire on the wrong date twice a year.
   */
  addDays: function (parts, days) {
    if (!parts) return null;
    const ms = Date.UTC(parts.y, parts.m - 1, parts.d) + days * 86400000;
    const shifted = new Date(ms);
    return {
      y: shifted.getUTCFullYear(),
      m: shifted.getUTCMonth() + 1,
      d: shifted.getUTCDate(),
    };
  },

  /** 'yyyy-MM-dd'. Used in idempotency keys, so zero-padding matters. */
  toIso: function (parts) {
    if (!parts) return '';
    const pad = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return parts.y + '-' + pad(parts.m) + '-' + pad(parts.d);
  },

  /** Same calendar day, year included. One-off dates. */
  isSameDate: function (a, b) {
    return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
  },

  /** Same day and month, year ignored. Birthdays, anniversaries. */
  isSameDayMonth: function (a, b) {
    return !!a && !!b && a.m === b.m && a.d === b.d;
  },

  /**
   * Same day-of-month. Rent, EMIs, monthly bills.
   *
   * Note what this cannot do: a rule keyed to the 31st simply does not
   * fire in a 30-day month or in February. Clamping to the month end
   * would be a guess about intent, and guessing wrong here sends a real
   * message on a date the operator did not choose.
   */
  isSameDayOfMonth: function (a, b) {
    return !!a && !!b && a.d === b.d;
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  /**
   * Reject impossible dates by round-tripping through UTC: 2026-02-30
   * would otherwise silently become 2026-03-02 and a condition would
   * match on a date nobody wrote.
   */
  validate_: function (parts) {
    if (
      !parts ||
      !isFinite(parts.y) ||
      !isFinite(parts.m) ||
      !isFinite(parts.d) ||
      parts.m < 1 ||
      parts.m > 12 ||
      parts.d < 1 ||
      parts.d > 31
    ) {
      return null;
    }
    const probe = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    if (
      probe.getUTCFullYear() !== parts.y ||
      probe.getUTCMonth() + 1 !== parts.m ||
      probe.getUTCDate() !== parts.d
    ) {
      return null;
    }
    return { y: parts.y, m: parts.m, d: parts.d };
  },

  /** '26' → 2026, '99' → 1999. The usual 70 pivot. */
  expandYear_: function (year) {
    if (year >= 100) return year;
    return year < 70 ? 2000 + year : 1900 + year;
  },

  monthFromName_: function (name) {
    const key = String(name).toLowerCase();
    return ReplaiDates.MONTH_NAMES[key] || 0;
  },
};

/*
  Node/vitest only. Apps Script has no module system, so `module` is
  undefined there and this block never runs — which is the point: the
  pure logic can be tested outside Sheets without a second copy of it.
*/
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiDates: ReplaiDates };
}
