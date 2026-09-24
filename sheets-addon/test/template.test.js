import { describe, expect, it } from 'vitest';
import { ReplaiTemplate } from '../src/template.js';

/*
  The starter sheet exists to teach the right layout, so the things worth
  testing are the ones that would teach the WRONG layout: a name collision
  that overwrites someone's data, sample dates that are not real dates, and
  sample phone numbers that could reach a real person.
*/

describe('column layout', () => {
  it('leads with the two columns every rule needs', () => {
    const headers = ReplaiTemplate.COLUMNS.map((c) => c.header);
    expect(headers[0]).toBe('Name');
    expect(headers[1]).toBe('WhatsApp Number');
  });

  it('covers each condition family with a column that suits it', () => {
    const kinds = ReplaiTemplate.COLUMNS.map((c) => c.kind);
    // text for equals/contains, number for the numeric comparisons,
    // date for the nine date operators.
    expect(kinds).toContain('text');
    expect(kinds).toContain('number');
    expect(kinds).toContain('date');
    expect(kinds).toContain('phone');
  });

  it('explains every column in a note', () => {
    // Guidance lives in header notes rather than extra rows, because a row
    // added here would be evaluated by a rule and could be messaged.
    ReplaiTemplate.COLUMNS.forEach((column) => {
      expect(typeof column.note).toBe('string');
      expect(column.note.length).toBeGreaterThan(10);
    });
  });

  it('does not pre-create the status column the engine owns', () => {
    const headers = ReplaiTemplate.COLUMNS.map((c) => c.header);
    expect(headers).not.toContain('Replai Status');
  });
});

describe('sample rows', () => {
  const today = new Date(2026, 8, 16); // 16 Sep 2026, local
  const rows = ReplaiTemplate.sampleRows(today);

  it('produces one row per column, twice over', () => {
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row).toHaveLength(ReplaiTemplate.COLUMNS.length);
    });
  });

  it('uses real Date objects in the date column, not text', () => {
    // The date operators read a cell's real Date and only fall back to
    // parsing text. A starter sheet with text dates would demonstrate the
    // weaker path.
    const dateIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'date'
    );
    rows.forEach((row) => {
      expect(row[dateIndex]).toBeInstanceOf(Date);
      expect(isNaN(row[dateIndex].getTime())).toBe(false);
    });
  });

  it('dates the samples in the future, so a reminder rule can match', () => {
    const dateIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'date'
    );
    rows.forEach((row) => {
      expect(row[dateIndex].getTime()).toBeGreaterThan(today.getTime());
    });
  });

  it('shifts dates without slipping a day across a DST boundary', () => {
    // 8 March 2026 is a spring-forward date in the US; local-time
    // arithmetic here can land on the same calendar day twice.
    const dst = ReplaiTemplate.sampleRows(new Date(2026, 2, 8));
    const dateIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'date'
    );
    expect(dst[0][dateIndex].getDate()).toBe(11); // 8 + 3
    expect(dst[1][dateIndex].getDate()).toBe(15); // 8 + 7
  });

  it('uses only phone numbers reserved for fiction', () => {
    // A plausible placeholder like +91 98765 43210 is a valid Indian
    // mobile number and may belong to someone. The NANP reserves
    // 555-0100..555-0199 in every area code precisely for this.
    const phoneIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'phone'
    );
    rows.forEach((row) => {
      expect(row[phoneIndex]).toMatch(/^\+1\d{3}55501\d{2}$/);
    });
  });

  it('writes phone numbers as strings so the leading plus survives', () => {
    const phoneIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'phone'
    );
    rows.forEach((row) => {
      expect(typeof row[phoneIndex]).toBe('string');
      expect(row[phoneIndex].charAt(0)).toBe('+');
    });
  });

  it('writes the amount as a number so numeric conditions work', () => {
    const amountIndex = ReplaiTemplate.COLUMNS.findIndex(
      (c) => c.kind === 'number'
    );
    rows.forEach((row) => {
      expect(typeof row[amountIndex]).toBe('number');
    });
  });
});

describe('uniqueName', () => {
  it('uses the plain name when nothing is in the way', () => {
    expect(ReplaiTemplate.uniqueName(['Sheet1'], 'Replai Starter')).toBe(
      'Replai Starter'
    );
  });

  it('never reuses an existing tab', () => {
    // Someone with a sheet called "Replai Starter" has their own data in
    // it. Overwriting that to demonstrate a layout is indefensible.
    expect(
      ReplaiTemplate.uniqueName(['Sheet1', 'Replai Starter'], 'Replai Starter')
    ).toBe('Replai Starter 2');
  });

  it('keeps counting past the first collision', () => {
    expect(
      ReplaiTemplate.uniqueName(
        ['Replai Starter', 'Replai Starter 2', 'Replai Starter 3'],
        'Replai Starter'
      )
    ).toBe('Replai Starter 4');
  });

  it('compares names case-insensitively and ignores padding', () => {
    // Google treats sheet names case-insensitively when refusing a
    // duplicate, so matching exactly would produce a name insertSheet
    // rejects.
    expect(
      ReplaiTemplate.uniqueName(['  replai starter '], 'Replai Starter')
    ).toBe('Replai Starter 2');
  });

  it('falls back to the default base when none is given', () => {
    expect(ReplaiTemplate.uniqueName([])).toBe(ReplaiTemplate.SHEET_NAME);
  });

  it('still returns a name in an absurd case rather than throwing', () => {
    const many = [ReplaiTemplate.SHEET_NAME];
    for (let n = 2; n < 100; n++)
      many.push(ReplaiTemplate.SHEET_NAME + ' ' + n);
    const name = ReplaiTemplate.uniqueName(many, ReplaiTemplate.SHEET_NAME);
    expect(typeof name).toBe('string');
    expect(many).not.toContain(name);
  });
});
