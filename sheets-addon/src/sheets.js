/**
 * sheets.js — everything the add-on reads from and writes to the
 * workbook itself: the tab list and header rows the wizard needs, the
 * spreadsheet's timezone and locale that make the date operators
 * correct, the data rows a run evaluates, and the status column a run
 * writes back to.
 *
 * Spreadsheet calls are the slow part of any Apps Script run, so this
 * file is written to make as few as possible: one read of the whole data
 * range per rule, and one write of the status column per run.
 */
const ReplaiSheets = {
  /**
   * Where a run reports what it did. Created on first use, at the end of
   * the header row so it never displaces the operator's own columns.
   *
   * Without it the operator has no way to tell a row that was skipped
   * from one that failed from one that was never looked at, and the
   * idempotency guard becomes the only thing standing between them and a
   * duplicate (plan §8.3).
   */
  STATUS_COLUMN: 'Replai Status',

  /** Data starts on row 2; row 1 is the header. */
  FIRST_DATA_ROW: 2,
  /**
   * Locales that write dates month-first. Consulted only to break a tie
   * on ambiguous TEXT like 05/06/2026 — a real date cell carries no
   * ambiguity, and 25/06/2026 resolves itself. Getting this wrong for a
   * rare locale costs one misread text date; hard-coding UTC-style
   * assumptions for everyone would cost far more.
   */
  MONTH_FIRST_LOCALES: ['en_us', 'en_ph', 'fil_ph'],

  ss_: function () {
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  /** Tab names, in tab order. */
  listSheetNames: function () {
    const sheets = ReplaiSheets.ss_().getSheets();
    const names = [];
    for (let i = 0; i < sheets.length; i++) {
      names.push(sheets[i].getName());
    }
    return names;
  },

  /**
   * The spreadsheet's own timezone — never the script's and never UTC.
   * "Today" in Asia/Kolkata is not "today" in UTC for five and a half
   * hours a day, and a reminder that fires a day early is a visible
   * failure the operator cannot explain.
   */
  getTimezone: function () {
    return ReplaiSheets.ss_().getSpreadsheetTimeZone();
  },

  getLocale: function () {
    try {
      return ReplaiSheets.ss_().getSpreadsheetLocale() || '';
    } catch (err) {
      console.warn('[replai] could not read spreadsheet locale: ' + err);
      return '';
    }
  },

  /** 'MDY' or 'DMY'. See MONTH_FIRST_LOCALES. */
  getDateOrder: function () {
    const locale = ReplaiSheets.getLocale().toLowerCase().replace('-', '_');
    return ReplaiSheets.MONTH_FIRST_LOCALES.indexOf(locale) === -1
      ? 'DMY'
      : 'MDY';
  },

  /**
   * The current date AND hour in the spreadsheet's timezone.
   *
   * The reminder sweep needs the clock to the minute, not just the
   * calendar, because each rule carries its own time. Formatting through
   * the spreadsheet timezone is the whole point: a sweep that read the
   * script's clock would fire an operator's 09:30 reminder at their 04:00.
   *
   * The weekday is deliberately NOT read from here — once the calendar
   * date is known its weekday is the same everywhere, so
   * ReplaiSchedule.dowOf derives it and stays unit-testable.
   *
   * @returns {?{y: number, m: number, d: number, hour: number,
   *             minute: number}} null when the clock could not be read,
   *   which callers must treat as "not due" rather than guessing.
   */
  nowParts: function () {
    try {
      const stamp = Utilities.formatDate(
        new Date(),
        ReplaiSheets.getTimezone(),
        'yyyy-MM-dd-HH-mm'
      );
      const bits = stamp.split('-');
      if (bits.length !== 5) return null;
      return {
        y: parseInt(bits[0], 10),
        m: parseInt(bits[1], 10),
        d: parseInt(bits[2], 10),
        hour: parseInt(bits[3], 10),
        minute: parseInt(bits[4], 10),
      };
    } catch (err) {
      console.error('[replai] could not read the current time: ' + err);
      return null;
    }
  },

  /** Today, resolved in the spreadsheet's timezone, as 'yyyy-MM-dd'. */
  today: function () {
    return Utilities.formatDate(
      new Date(),
      ReplaiSheets.getTimezone(),
      'yyyy-MM-dd'
    );
  },

  /**
   * Header row of one tab.
   *
   * Columns are identified by header NAME rather than by index, because
   * inserting a column shifts every index and would silently repoint a
   * rule at the wrong data. The trade-off is duplicate headers, which are
   * reported so the wizard can warn instead of quietly using the first.
   *
   * @returns {{ok: boolean, headers: Array, duplicates: Array,
   *            rowCount: number, message: string}}
   */
  readHeaders: function (sheetName) {
    const sheet = ReplaiSheets.ss_().getSheetByName(sheetName);
    if (!sheet) {
      return {
        ok: false,
        headers: [],
        duplicates: [],
        rowCount: 0,
        message: 'That sheet no longer exists. Pick another one.',
      };
    }

    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) {
      return {
        ok: false,
        headers: [],
        duplicates: [],
        rowCount: 0,
        message:
          'This sheet is empty. Add a header row naming your columns, then try again.',
      };
    }

    const values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const headers = [];
    const seen = {};
    const duplicates = [];

    for (let i = 0; i < values.length; i++) {
      const name = String(values[i] === null ? '' : values[i]).trim();
      // Blank header = a spacer column. Skipping it keeps the picker
      // clean, and a column with no name cannot be referenced anyway.
      if (!name) continue;

      if (seen[name]) {
        if (duplicates.indexOf(name) === -1) duplicates.push(name);
        continue;
      }
      seen[name] = true;

      headers.push({
        name: name,
        index: i + 1,
        letter: ReplaiSheets.columnLetter_(i + 1),
      });
    }

    return {
      ok: headers.length > 0,
      headers: headers,
      duplicates: duplicates,
      // Excludes the header row: this is how many data rows a rule would
      // scan, which is the number worth showing.
      rowCount: Math.max(0, sheet.getLastRow() - 1),
      message: headers.length
        ? ''
        : 'No column names found in row 1 of this sheet.',
    };
  },

  /**
   * Every data row of one tab, in the two forms a run needs.
   *
   * `values` keeps real types — a date cell is a Date, a number is a
   * number — which is what the condition operators are built to read.
   * `display` is what the operator sees in the cell, which is what
   * belongs in a message: the raw value of a date cell renders as
   * "Mon Sep 14 2026 00:00:00 GMT+0530 (India Standard Time)".
   *
   * Read in two calls rather than N: a 5000-row sheet costs two
   * spreadsheet round trips here, or ten thousand if read per cell.
   *
   * @returns {{ok: boolean, values: Array<Array>, display: Array<Array>,
   *            headerIndex: Object, firstRow: number, message: string}}
   *   `headerIndex` maps a column NAME to its 0-based offset within each
   *   row array, so a rule stored against names keeps working when
   *   columns move.
   */
  readRows: function (sheetName) {
    const empty = {
      ok: false,
      values: [],
      display: [],
      headerIndex: {},
      firstRow: ReplaiSheets.FIRST_DATA_ROW,
      message: '',
    };

    const sheet = ReplaiSheets.ss_().getSheetByName(sheetName);
    if (!sheet) {
      empty.message = 'sheet "' + sheetName + '" no longer exists';
      return empty;
    }

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0 || lastRow < ReplaiSheets.FIRST_DATA_ROW) {
      empty.message = 'sheet "' + sheetName + '" has no data rows';
      return empty;
    }

    const range = sheet.getRange(
      ReplaiSheets.FIRST_DATA_ROW,
      1,
      lastRow - 1,
      lastColumn
    );

    const headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const headerIndex = {};
    for (let i = 0; i < headerValues.length; i++) {
      const name = String(
        headerValues[i] === null ? '' : headerValues[i]
      ).trim();
      // First occurrence wins, matching what the wizard offered: a
      // duplicate header is already flagged there.
      if (name && headerIndex[name] === undefined) headerIndex[name] = i;
    }

    return {
      ok: true,
      values: range.getValues(),
      display: range.getDisplayValues(),
      headerIndex: headerIndex,
      firstRow: ReplaiSheets.FIRST_DATA_ROW,
      message: '',
    };
  },

  /**
   * Which rows an event actually touched, read from `e.range`.
   *
   * ONLY works for events that carry a range: the installable **Edit**
   * trigger and the **form-submit** trigger. That is deliberate, and it
   * replaces an earlier version of this function that read
   * `e.source.getActiveRange()` on an onChange event.
   *
   * Why that earlier version was wrong: the onChange event object has no
   * range at all — Google's own docs say it reports only a coarse
   * `changeType` — and the "active range" it fell back to is the
   * selection of whoever happens to be looking at the sheet, which in a
   * background trigger context is routinely null. The result was an
   * On Change rule that silently never fired: the run started, found no
   * candidate rows, and did nothing. `e.range` on an Edit trigger is the
   * cell the user actually changed, which is the fact the rule needs.
   */
  rowsFromEvent: function (event, sheetName) {
    try {
      const range = event && event.range ? event.range : null;
      if (!range) return [];

      // Confirm the edit landed on the sheet this rule watches. Without
      // this, editing an unrelated tab would evaluate the same row number
      // against the rule's own sheet.
      if (typeof range.getSheet === 'function') {
        const sheet = range.getSheet();
        if (!sheet || sheet.getName() !== sheetName) return [];
      } else {
        // No way to confirm the sheet, so no way to be safe.
        return [];
      }

      const start = range.getRow();
      const height =
        typeof range.getNumRows === 'function' ? range.getNumRows() : 1;

      const rows = [];
      for (let i = 0; i < height; i++) {
        const rowNumber = start + i;
        if (rowNumber >= ReplaiSheets.FIRST_DATA_ROW) rows.push(rowNumber);
      }
      return rows;
    } catch (err) {
      // Never let event-shape surprises take down a run: no candidates
      // means no sends, which is the safe direction.
      console.warn('[replai] could not read the edited range: ' + err);
      return [];
    }
  },

  /** Row number of the last row holding anything, or 1 for header-only. */
  lastRow: function (sheetName) {
    const sheet = ReplaiSheets.ss_().getSheetByName(sheetName);
    return sheet ? sheet.getLastRow() : 1;
  },

  /**
   * Find the status column, creating it if this sheet has never had one.
   *
   * @returns {number} 1-based column index, or 0 when the sheet is gone.
   */
  ensureStatusColumn: function (sheetName) {
    const sheet = ReplaiSheets.ss_().getSheetByName(sheetName);
    if (!sheet) return 0;

    const lastColumn = sheet.getLastColumn();
    if (lastColumn > 0) {
      const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
      for (let i = 0; i < headers.length; i++) {
        if (String(headers[i] || '').trim() === ReplaiSheets.STATUS_COLUMN) {
          return i + 1;
        }
      }
    }

    const column = lastColumn + 1;
    sheet.getRange(1, column).setValue(ReplaiSheets.STATUS_COLUMN);
    return column;
  },

  /**
   * Write a batch of row statuses in ONE spreadsheet call.
   *
   * Writing per row would be one round trip per message on a sheet that
   * may have hundreds of matches, and Apps Script's 6-minute ceiling is
   * spent on round trips long before it is spent on logic. So the
   * touched span is read once, patched in memory, and written back once
   * — reading first is what stops the untouched rows in between from
   * being blanked.
   *
   * @param {Object} updates  row number → status text
   */
  writeStatuses: function (sheetName, updates) {
    const rowNumbers = Object.keys(updates || {});
    if (!rowNumbers.length) return;

    const sheet = ReplaiSheets.ss_().getSheetByName(sheetName);
    if (!sheet) return;

    const column = ReplaiSheets.ensureStatusColumn(sheetName);
    if (!column) return;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < rowNumbers.length; i++) {
      const row = Number(rowNumbers[i]);
      if (row < min) min = row;
      if (row > max) max = row;
    }

    const height = max - min + 1;
    const range = sheet.getRange(min, column, height, 1);
    const existing = range.getValues();

    for (let i = 0; i < rowNumbers.length; i++) {
      const row = Number(rowNumbers[i]);
      existing[row - min][0] = updates[rowNumbers[i]];
    }

    range.setValues(existing);
  },

  /** Human timestamp for a status cell, in the spreadsheet's timezone. */
  stamp: function () {
    return Utilities.formatDate(
      new Date(),
      ReplaiSheets.getTimezone(),
      'd MMM yyyy HH:mm'
    );
  },

  /**
   * Render a stored ISO timestamp in the SPREADSHEET's timezone.
   *
   * Not the viewer's: a run stamped "18:20" in the status cells must not
   * read "12:50" on a rule card because the person looking at it is in
   * another country.
   */
  formatIso: function (iso) {
    if (!iso) return '';
    try {
      return Utilities.formatDate(
        new Date(iso),
        ReplaiSheets.getTimezone(),
        'd MMM, HH:mm'
      );
    } catch (err) {
      return '';
    }
  },

  /** Stable id for the idempotency key recipe. */
  spreadsheetId: function () {
    return ReplaiSheets.ss_().getId();
  },

  /** 1 → A, 27 → AA. Shown next to header names to disambiguate. */
  columnLetter_: function (index) {
    let letter = '';
    let n = index;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      n = Math.floor((n - remainder) / 26);
    }
    return letter;
  },
};
