import { beforeAll, describe, expect, it } from 'vitest';

/*
  Regression tests for the bug that made On Change rules silently never
  fire.

  What went wrong: the dispatcher asked `e.source.getActiveRange()` on an
  onChange event to find out which row had changed. The onChange event
  object carries no range at all, and the "active range" it fell back to
  is the selection of whoever is looking at the sheet — which in a
  background trigger is routinely null. So the run started, found zero
  candidate rows, and did nothing. Nothing failed; nothing happened.

  The fix reads `e.range`, which only the Edit and form-submit triggers
  provide. These tests pin that: a range-bearing event yields rows, and
  everything else yields none.

  `ReplaiSheets.rowsFromEvent` is the piece under test. It touches
  SpreadsheetApp nowhere, so it can be exercised directly once the file's
  one global reference (FIRST_DATA_ROW, its own constant) is available.
*/

let ReplaiSheets;

beforeAll(async () => {
  // sheets.js is an Apps Script file with no module system, so it is
  // evaluated here the way Apps Script evaluates it: as a script sharing
  // one global scope.
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(
    new URL('../src/sheets.js', import.meta.url),
    'utf8'
  );
  const context = { console: { warn() {}, error() {} } };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.__sheets = ReplaiSheets;', context);
  ReplaiSheets = context.__sheets;
});

/** An Edit or form-submit event: the shape that carries a range. */
function editEvent(sheetName, row, numRows) {
  return {
    range: {
      getRow: () => row,
      getNumRows: () => numRows || 1,
      getSheet: () => ({ getName: () => sheetName }),
    },
  };
}

describe('rowsFromEvent', () => {
  it('reads the edited row out of e.range', () => {
    expect(
      ReplaiSheets.rowsFromEvent(editEvent('Sheet1', 3), 'Sheet1')
    ).toEqual([3]);
  });

  it('reads every row of a multi-row edit, such as a paste', () => {
    expect(
      ReplaiSheets.rowsFromEvent(editEvent('Sheet1', 5, 3), 'Sheet1')
    ).toEqual([5, 6, 7]);
  });

  it('ignores an edit on a different sheet', () => {
    // Without the sheet check, editing row 3 of an unrelated tab would
    // evaluate row 3 of the rule's own sheet.
    expect(ReplaiSheets.rowsFromEvent(editEvent('Other', 3), 'Sheet1')).toEqual(
      []
    );
  });

  it('never returns the header row', () => {
    expect(
      ReplaiSheets.rowsFromEvent(editEvent('Sheet1', 1, 3), 'Sheet1')
    ).toEqual([2, 3]);
  });

  it('returns nothing for an event with no range at all', () => {
    // This is precisely the onChange event object, and returning nothing
    // is what makes the dispatcher do nothing rather than sweep the sheet.
    expect(
      ReplaiSheets.rowsFromEvent({ changeType: 'EDIT' }, 'Sheet1')
    ).toEqual([]);
    expect(ReplaiSheets.rowsFromEvent({}, 'Sheet1')).toEqual([]);
    expect(ReplaiSheets.rowsFromEvent(null, 'Sheet1')).toEqual([]);
    expect(ReplaiSheets.rowsFromEvent(undefined, 'Sheet1')).toEqual([]);
  });

  it('refuses a range it cannot attribute to a sheet', () => {
    // No getSheet means no way to confirm which tab was edited, and
    // guessing would send on the wrong rows.
    const headless = { range: { getRow: () => 3, getNumRows: () => 1 } };
    expect(ReplaiSheets.rowsFromEvent(headless, 'Sheet1')).toEqual([]);
  });

  it('survives a range that throws instead of answering', () => {
    const hostile = {
      range: {
        getRow: () => {
          throw new Error('detached range');
        },
        getNumRows: () => 1,
        getSheet: () => ({ getName: () => 'Sheet1' }),
      },
    };
    expect(ReplaiSheets.rowsFromEvent(hostile, 'Sheet1')).toEqual([]);
  });

  it('treats a single-cell edit as exactly one row', () => {
    const single = {
      range: {
        getRow: () => 4,
        getSheet: () => ({ getName: () => 'Sheet1' }),
      },
    };
    expect(ReplaiSheets.rowsFromEvent(single, 'Sheet1')).toEqual([4]);
  });
});
