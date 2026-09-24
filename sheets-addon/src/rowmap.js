/**
 * rowmap.js — one spreadsheet row → one API recipient. PURE: no Apps
 * Script services, no network. Unit-tested, because everything that can
 * go wrong here goes wrong per row, silently, in a paid message.
 *
 * TWO VIEWS OF THE SAME ROW, AND WHY BOTH ARE NEEDED
 * Conditions are evaluated against the raw values, where a date cell is
 * a real Date and a number is a number — that is what makes
 * `Price > 500` and the date operators work. Message text is taken from
 * the DISPLAYED values, what the operator sees in the cell. Use the raw
 * value in a message and a date becomes
 * "Mon Sep 14 2026 00:00:00 GMT+0530 (India Standard Time)"; use the
 * displayed value in a comparison and "1,200" stops being a number.
 */
const ReplaiRowMap = {
  /**
   * Meta rejects a template parameter containing a newline, a tab, or
   * more than four consecutive spaces. A cell pasted from an email
   * routinely has all three, and the rejection arrives per recipient
   * with a message no operator can act on — so collapse it here.
   */
  sanitiseParam: function (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  },

  /** Value of one named column in one row, or '' when the column is gone. */
  cell: function (row, headerIndex, columnName) {
    if (!columnName) return '';
    const index = headerIndex[columnName];
    if (index === undefined) return '';
    const value = row[index];
    return value === null || value === undefined ? '' : value;
  },

  /**
   * Build the send payload for one row.
   *
   * @param {Object} rule         stored rule record
   * @param {Array} values        raw row values (conditions, dates)
   * @param {Array} display       displayed row values (message text)
   * @param {Object} headerIndex  column name → 0-based index
   * @returns {{ok: boolean, recipient: Object, reason: string}} `reason`
   *   is written to the row's status cell, so it is phrased for the
   *   person looking at the sheet, not for a log.
   */
  buildRecipient: function (rule, values, display, headerIndex) {
    // The phone comes from the RAW value: a number cell displayed as
    // "6,359,465,987" by a stray number format would otherwise arrive
    // with commas in it.
    const phoneRaw = ReplaiRowMap.cell(values, headerIndex, rule.phoneColumn);
    const phone = ReplaiPhone.normalise(phoneRaw, rule.countryCode);
    if (!phone.ok) {
      return { ok: false, recipient: null, reason: phone.reason };
    }

    const recipient = { to: phone.phone };

    if (rule.nameColumn) {
      const name = ReplaiRowMap.sanitiseParam(
        ReplaiRowMap.cell(display, headerIndex, rule.nameColumn)
      );
      if (name) recipient.name = name;
    }

    // ---- body variables ----
    const params = [];
    const variables = rule.variables || [];
    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];
      let value;

      if (variable.source === 'literal') {
        value = ReplaiRowMap.sanitiseParam(variable.value);
      } else {
        if (headerIndex[variable.column] === undefined) {
          return {
            ok: false,
            recipient: null,
            reason:
              'column "' +
              variable.column +
              '" is missing from this sheet — edit the rule',
          };
        }
        value = ReplaiRowMap.sanitiseParam(
          ReplaiRowMap.cell(display, headerIndex, variable.column)
        );
      }

      if (!value) {
        // Meta rejects an empty body parameter outright, and a message
        // reading "Your order  is ready" would be worse if it did not.
        // Skipping the row is the honest outcome.
        return {
          ok: false,
          recipient: null,
          reason:
            variable.source === 'literal'
              ? 'variable ' + (i + 1) + ' has no value'
              : '"' + variable.column + '" is empty in this row',
        };
      }

      params.push(value);
    }
    if (params.length) recipient.params = params;

    // ---- media header ----
    const media = rule.media || {};
    if (media.type && media.type !== 'none') {
      let url;
      if (media.source === 'column') {
        if (headerIndex[media.column] === undefined) {
          return {
            ok: false,
            recipient: null,
            reason:
              'media column "' +
              media.column +
              '" is missing from this sheet — edit the rule',
          };
        }
        url = String(
          ReplaiRowMap.cell(display, headerIndex, media.column) || ''
        ).trim();
      } else {
        url = String(media.url || '').trim();
      }

      if (!url) {
        return {
          ok: false,
          recipient: null,
          reason: 'no file URL for this row',
        };
      }
      if (!/^https:\/\/.+/i.test(url)) {
        // Meta fetches the asset itself and refuses plain http, so this
        // would fail at send time with a far less obvious message.
        return {
          ok: false,
          recipient: null,
          reason:
            'file URL must start with https:// (got "' +
            ReplaiRowMap.short_(url) +
            '")',
        };
      }
      recipient.media_url = url;
    }

    return { ok: true, recipient: recipient, reason: '' };
  },

  /**
   * The string that gets hashed into the idempotency key (plan §5.3):
   *
   *   spreadsheetId | sheetName | ruleId | rowIdentity | fireDate
   *
   * `rowIdentity` is the normalised phone AND the row number. The phone
   * alone would collapse two different rows for the same customer into
   * one send; the row number alone breaks the moment a row is inserted
   * above, because every row below it silently becomes a new identity
   * and re-sends.
   *
   * `fireDate` is present ONLY for reminders, and that single difference
   * is what implements two different product rules with one mechanism:
   *   - reminder  → key changes daily, so a row can send once per day
   *   - new_row / on_change → no date, so the server's UNIQUE constraint
   *     makes a second send for that row structurally impossible, ever
   *     (decision §14.2).
   */
  keySource: function (input) {
    const parts = [
      input.spreadsheetId || '',
      input.sheetName || '',
      input.ruleId || '',
      (input.phone || '') + '#' + (input.rowNumber || 0),
    ];
    if (input.fireDate) parts.push(input.fireDate);
    return parts.join('|');
  },

  /** True when this trigger type re-sends on a later day. */
  usesFireDate: function (triggerType) {
    return triggerType === 'reminder';
  },

  /**
   * Names for the positional params `buildRecipient` produces, in the
   * same order.
   *
   * The rule already knows these — `variable.column` is the sheet header
   * a variable reads from, and `buildRecipient` uses it to find the cell
   * before discarding it. Sending it too costs nothing and is the
   * difference between a campaign report reading "Delevery id: 393392"
   * and a column of bare numbers with no indication of what they are.
   *
   * A literal variable has no column, so it yields '' rather than a made
   * up name: the CRM labels it generically but the positions stay
   * aligned, which is what matters. Returning a ragged array would push
   * every later label onto the wrong value.
   */
  paramLabels: function (rule) {
    const variables = (rule && rule.variables) || [];
    const labels = [];
    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i] || {};
      labels.push(
        variable.source === 'column' ? String(variable.column || '') : ''
      );
    }
    return labels;
  },

  short_: function (value) {
    const text = String(value);
    return text.length > 30 ? text.slice(0, 30) + '…' : text;
  },
};

/* Node/vitest only — see the note at the foot of dates.js. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiRowMap: ReplaiRowMap };
}
