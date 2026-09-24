/**
 * template.js — writes a correctly-shaped starter sheet.
 *
 * The empty state offers this because the first question after installing
 * is "what should my columns look like?", and getting it wrong is not
 * obvious until a rule silently skips every row. A sheet with the right
 * shape, real sample values and the right CELL FORMATS teaches the layout
 * faster than any documentation.
 *
 * Three details here are correctness, not decoration:
 *
 * 1. The phone column is formatted as PLAIN TEXT before anything is
 *    written. A phone number written into a default cell is parsed as a
 *    number: '+919876543210' loses its plus, and a long number can render
 *    in scientific notation. Either way the value the rule reads is not
 *    the value the user typed.
 * 2. The date column holds real Date values, not text. The date operators
 *    read a cell's real Date when it has one and only fall back to parsing
 *    text — so a starter sheet with text dates would quietly demonstrate
 *    the weaker path.
 * 3. The sample numbers are drawn from the NANP range reserved for
 *    fiction (555-0100 to 555-0199), so they cannot be assigned to a real
 *    person. A plausible-looking placeholder like '+91 98765 43210' is a
 *    valid Indian mobile number and may well belong to someone.
 */
const ReplaiTemplate = {
  /** Base name. A suffix is added if this is already taken. */
  SHEET_NAME: 'Replai Starter',

  /**
   * Column layout. `kind` drives the cell formatting applied per column
   * and is the reason this is a table rather than a flat array of names.
   */
  COLUMNS: [
    {
      header: 'Name',
      kind: 'text',
      note: 'Used as the contact name on the message. Optional.',
    },
    {
      header: 'WhatsApp Number',
      kind: 'phone',
      note:
        'Include the country code, e.g. +919876543210. Numbers without one ' +
        'only work if the rule sets a default country code.',
    },
    {
      header: 'Order ID',
      kind: 'text',
      note: 'Example of a column you can map to a template variable.',
    },
    {
      header: 'Amount',
      kind: 'number',
      note: 'Numeric columns work with the greater/less than conditions.',
    },
    {
      header: 'Delivery Date',
      kind: 'date',
      note:
        'A real date, not text. The "Date:" conditions use this for ' +
        'reminders — for example, three days before this date.',
    },
    {
      header: 'Status',
      kind: 'text',
      note: 'Example of a column to match on, e.g. Status equals Shipped.',
    },
  ],

  /**
   * Sample rows, dated relative to a supplied "today" so the date
   * conditions have something to match the day the sheet is created.
   * Pure: takes the base date, returns values. No Apps Script here.
   *
   * @param {Date} today
   * @returns {Array<Array>} rows in COLUMNS order
   */
  sampleRows: function (today) {
    const shift = function (days) {
      // UTC arithmetic then a local Date, so the sample dates cannot slip
      // a day across a DST boundary — the same reason dates.js does this.
      const ms = Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const moved = new Date(ms + days * 86400000);
      return new Date(
        moved.getUTCFullYear(),
        moved.getUTCMonth(),
        moved.getUTCDate()
      );
    };

    return [
      ['Asha Patel', '+12025550100', 'ORD-1001', 1499, shift(3), 'Shipped'],
      ['Sam Lee', '+12025550101', 'ORD-1002', 2350, shift(7), 'Pending'],
    ];
  },

  /**
   * First free name in the series "Replai Starter", "Replai Starter 2", …
   * Pure, so the awkward part is testable.
   *
   * Renaming rather than reusing an existing tab is deliberate: someone
   * who already has a sheet called "Replai Starter" has their own data in
   * it, and overwriting that to demonstrate a layout would be indefensible.
   */
  uniqueName: function (existingNames, base) {
    const taken = {};
    for (let i = 0; i < existingNames.length; i++) {
      taken[String(existingNames[i]).trim().toLowerCase()] = true;
    }

    const wanted = base || ReplaiTemplate.SHEET_NAME;
    if (!taken[wanted.toLowerCase()]) return wanted;

    for (let n = 2; n < 100; n++) {
      const candidate = wanted + ' ' + n;
      if (!taken[candidate.toLowerCase()]) return candidate;
    }
    // 98 starter sheets is not a real scenario, but returning something
    // beats throwing.
    return wanted + ' ' + new Date().getTime();
  },

  /**
   * Create the starter sheet and make it the active tab.
   *
   * @returns {{ok: boolean, sheetName: string, message: string}}
   */
  build: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const existing = [];
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) existing.push(sheets[i].getName());

    const name = ReplaiTemplate.uniqueName(existing, ReplaiTemplate.SHEET_NAME);
    const sheet = ss.insertSheet(name);

    const headers = ReplaiTemplate.COLUMNS.map(function (column) {
      return column.header;
    });
    const rows = ReplaiTemplate.sampleRows(new Date());

    // Format BEFORE writing. Applying a text format to a phone column
    // after the value is in it does not restore the plus that was already
    // parsed away.
    for (let c = 0; c < ReplaiTemplate.COLUMNS.length; c++) {
      const column = ReplaiTemplate.COLUMNS[c];
      const range = sheet.getRange(2, c + 1, Math.max(rows.length, 20), 1);
      if (column.kind === 'phone') {
        range.setNumberFormat('@'); // plain text
      } else if (column.kind === 'date') {
        range.setNumberFormat('d mmm yyyy');
      } else if (column.kind === 'number') {
        range.setNumberFormat('#,##0');
      }
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // Header styling and a frozen row, so it reads as a deliberate layout
    // rather than something half-filled.
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f4f4f7');
    sheet.setFrozenRows(1);

    // Guidance goes in header NOTES, not in extra rows: any row added here
    // would be evaluated by a rule and could be messaged.
    for (let n = 0; n < ReplaiTemplate.COLUMNS.length; n++) {
      const note = ReplaiTemplate.COLUMNS[n].note;
      if (note) sheet.getRange(1, n + 1).setNote(note);
    }

    for (let w = 1; w <= headers.length; w++) {
      sheet.autoResizeColumn(w);
    }

    ss.setActiveSheet(sheet);

    return {
      ok: true,
      sheetName: name,
      message:
        'Created "' +
        name +
        '" with two sample rows. The sample numbers are reserved test ' +
        'numbers and cannot receive a message — replace them with real ones.',
    };
  },
};

/* Node/vitest only — see the note at the foot of dates.js. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiTemplate: ReplaiTemplate };
}
