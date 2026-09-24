import { beforeAll, describe, expect, it } from 'vitest';
import { ReplaiPhone } from '../src/phone.js';
import { ReplaiRowMap } from '../src/rowmap.js';

/*
  Row → recipient mapping. Every failure here happens per row, inside a
  paid message, so the tests care about two things: that a row which
  cannot make a correct message is skipped with a reason the operator can
  act on, and that a row which can produces exactly the payload the CRM
  expects.
*/
beforeAll(() => {
  globalThis.ReplaiPhone = ReplaiPhone;
});

/** Mirrors the demo sheet: Name | Whatsapp | Delivery id | Price | Date */
const HEADERS = {
  Name: 0,
  Whatsapp: 1,
  'Delivery id': 2,
  Price: 3,
  'Delivery Date': 4,
  Invoice: 5,
};

const ROW_VALUES = [
  'Souaib',
  6359465987,
  393392,
  200,
  new Date(2026, 8, 16),
  'https://example.com/invoice.pdf',
];

const ROW_DISPLAY = [
  'Souaib',
  '6359465987',
  '393392',
  '200',
  '16/09/2026',
  'https://example.com/invoice.pdf',
];

function rule(overrides) {
  return Object.assign(
    {
      id: 'r1',
      sheetName: 'Sheet1',
      triggerType: 'reminder',
      phoneColumn: 'Whatsapp',
      nameColumn: 'Name',
      countryCode: '+91',
      variables: [
        { source: 'column', column: 'Delivery id', value: '' },
        { source: 'literal', column: '', value: '2 Days' },
      ],
      media: { type: 'none', source: 'url', column: '', url: '' },
      campaign: { id: 'c1', variableCount: 2 },
    },
    overrides || {}
  );
}

const build = (r, values, display) =>
  ReplaiRowMap.buildRecipient(
    r || rule(),
    values || ROW_VALUES,
    display || ROW_DISPLAY,
    HEADERS
  );

describe('a complete row', () => {
  it('builds the payload the CRM expects', () => {
    const result = build();
    expect(result.ok).toBe(true);
    expect(result.recipient).toEqual({
      to: '+916359465987',
      name: 'Souaib',
      params: ['393392', '2 Days'],
    });
  });

  it('takes message text from the DISPLAYED value, not the raw one', () => {
    // The raw cell is a Date. Used directly it would render as
    // "Tue Sep 16 2026 00:00:00 GMT+0530 (India Standard Time)" inside a
    // customer's WhatsApp message.
    const result = build(
      rule({
        variables: [{ source: 'column', column: 'Delivery Date', value: '' }],
        campaign: { id: 'c1', variableCount: 1 },
      })
    );
    expect(result.recipient.params).toEqual(['16/09/2026']);
  });

  it('takes the phone from the RAW value, not the displayed one', () => {
    // A number format can display 6359465987 as "6,359,465,987".
    const display = ROW_DISPLAY.slice();
    display[1] = '6,359,465,987';
    const result = build(rule(), ROW_VALUES, display);
    expect(result.recipient.to).toBe('+916359465987');
  });

  it('omits the name when no name column is mapped', () => {
    const result = build(rule({ nameColumn: '' }));
    expect(result.recipient.name).toBeUndefined();
  });
});

describe('parameter sanitising', () => {
  it('collapses what Meta rejects in a template parameter', () => {
    // Newlines, tabs and runs of spaces are all rejected per recipient,
    // with an error no operator can act on.
    expect(ReplaiRowMap.sanitiseParam('a\nb')).toBe('a b');
    expect(ReplaiRowMap.sanitiseParam('a\tb')).toBe('a b');
    expect(ReplaiRowMap.sanitiseParam('a     b')).toBe('a b');
    expect(ReplaiRowMap.sanitiseParam('  padded  ')).toBe('padded');
    expect(ReplaiRowMap.sanitiseParam('line1\r\n\r\nline2')).toBe(
      'line1 line2'
    );
  });

  it('applies to values pulled from the sheet', () => {
    const display = ROW_DISPLAY.slice();
    display[2] = 'ORD\n393392';
    const result = build(rule(), ROW_VALUES, display);
    expect(result.recipient.params[0]).toBe('ORD 393392');
  });
});

describe('rows that cannot produce a correct message', () => {
  it('skips a row whose phone will not normalise', () => {
    const values = ROW_VALUES.slice();
    values[1] = 'no number';
    const result = build(rule(), values, ROW_DISPLAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('skips a row with an empty variable, naming the column', () => {
    // Meta rejects an empty body parameter, and "Your order  is ready"
    // would be worse if it did not.
    const display = ROW_DISPLAY.slice();
    display[2] = '';
    const result = build(rule(), ROW_VALUES, display);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Delivery id');
  });

  it('names the missing column when a rule points at one that is gone', () => {
    const result = build(
      rule({
        variables: [{ source: 'column', column: 'Discount', value: '' }],
        campaign: { id: 'c1', variableCount: 1 },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Discount');
    expect(result.reason).toMatch(/edit the rule/);
  });

  it('skips a literal variable that was saved empty', () => {
    const result = build(
      rule({
        variables: [{ source: 'literal', column: '', value: '' }],
        campaign: { id: 'c1', variableCount: 1 },
      })
    );
    expect(result.ok).toBe(false);
  });
});

describe('media', () => {
  it('attaches a fixed URL', () => {
    const result = build(
      rule({
        media: {
          type: 'image',
          source: 'url',
          column: '',
          url: 'https://example.com/promo.png',
        },
      })
    );
    expect(result.recipient.media_url).toBe('https://example.com/promo.png');
  });

  it('attaches a per-row URL from a column', () => {
    const result = build(
      rule({
        media: {
          type: 'document',
          source: 'column',
          column: 'Invoice',
          url: '',
        },
      })
    );
    expect(result.recipient.media_url).toBe('https://example.com/invoice.pdf');
  });

  it('skips a row whose media cell is empty', () => {
    const display = ROW_DISPLAY.slice();
    display[5] = '';
    const result = build(
      rule({
        media: {
          type: 'document',
          source: 'column',
          column: 'Invoice',
          url: '',
        },
      }),
      ROW_VALUES,
      display
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/file URL/);
  });

  it('refuses plain http, which Meta cannot fetch', () => {
    const display = ROW_DISPLAY.slice();
    display[5] = 'http://example.com/invoice.pdf';
    const result = build(
      rule({
        media: {
          type: 'document',
          source: 'column',
          column: 'Invoice',
          url: '',
        },
      }),
      ROW_VALUES,
      display
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/https/);
  });

  it('sends no media_url when the rule has none', () => {
    expect(build().recipient.media_url).toBeUndefined();
  });
});

describe('the idempotency key recipe', () => {
  const base = {
    spreadsheetId: 'ss1',
    sheetName: 'Sheet1',
    ruleId: 'r1',
    phone: '+916359465987',
    rowNumber: 2,
  };

  it('is stable for the same row', () => {
    expect(ReplaiRowMap.keySource(base)).toBe(
      ReplaiRowMap.keySource(Object.assign({}, base))
    );
  });

  it('differs per row, per rule, per sheet and per spreadsheet', () => {
    const key = ReplaiRowMap.keySource(base);
    expect(ReplaiRowMap.keySource({ ...base, rowNumber: 3 })).not.toBe(key);
    expect(ReplaiRowMap.keySource({ ...base, ruleId: 'r2' })).not.toBe(key);
    expect(ReplaiRowMap.keySource({ ...base, sheetName: 'Sheet2' })).not.toBe(
      key
    );
    expect(ReplaiRowMap.keySource({ ...base, spreadsheetId: 'ss2' })).not.toBe(
      key
    );
  });

  it('includes the phone as well as the row number', () => {
    // Row number alone breaks when a row is inserted above: every row
    // below shifts and would look like a new send.
    expect(
      ReplaiRowMap.keySource({ ...base, phone: '+919999999999' })
    ).not.toBe(ReplaiRowMap.keySource(base));
  });

  it('adds the fire date only for reminders', () => {
    // With a date the row can send once per day; without one the server's
    // UNIQUE constraint makes a second send impossible, ever.
    expect(ReplaiRowMap.usesFireDate('reminder')).toBe(true);
    expect(ReplaiRowMap.usesFireDate('new_row')).toBe(false);
    expect(ReplaiRowMap.usesFireDate('on_change')).toBe(false);

    const withDate = ReplaiRowMap.keySource({
      ...base,
      fireDate: '2026-09-14',
    });
    const nextDay = ReplaiRowMap.keySource({ ...base, fireDate: '2026-09-15' });
    expect(withDate).not.toBe(ReplaiRowMap.keySource(base));
    expect(withDate).not.toBe(nextDay);
  });
});

describe('paramLabels', () => {
  /*
    These labels are what turns "393392" in the CRM's campaign report
    into "Delevery id: 393392". The only property that really matters is
    index alignment with the params buildRecipient produces — a shorter
    or reordered array silently labels every value after the gap with the
    wrong name, which is worse than no labels at all.
  */
  it('names each column variable and stays aligned with params', () => {
    const r = rule();
    const built = build(r);
    const labels = ReplaiRowMap.paramLabels(r);

    expect(labels).toEqual(['Delivery id', '']);
    expect(labels).toHaveLength(built.recipient.params.length);
  });

  it('yields an empty label for a literal rather than inventing one', () => {
    expect(
      ReplaiRowMap.paramLabels(
        rule({
          variables: [{ source: 'literal', column: '', value: '2 Days' }],
        })
      )
    ).toEqual(['']);
  });

  it('survives a rule with no variables at all', () => {
    expect(ReplaiRowMap.paramLabels(rule({ variables: [] }))).toEqual([]);
    expect(ReplaiRowMap.paramLabels({})).toEqual([]);
  });

  it('coerces a missing column name to an empty string, keeping length', () => {
    const labels = ReplaiRowMap.paramLabels(
      rule({
        variables: [
          { source: 'column', column: 'Price', value: '' },
          { source: 'column', value: '' },
        ],
      })
    );
    expect(labels).toEqual(['Price', '']);
  });
});

describe('cell', () => {
  it('returns empty rather than throwing for a column that is gone', () => {
    expect(ReplaiRowMap.cell(ROW_VALUES, HEADERS, 'Nope')).toBe('');
    expect(ReplaiRowMap.cell(ROW_VALUES, HEADERS, '')).toBe('');
  });

  it('normalises null and undefined cells to empty', () => {
    expect(ReplaiRowMap.cell([null], { A: 0 }, 'A')).toBe('');
    expect(ReplaiRowMap.cell([undefined], { A: 0 }, 'A')).toBe('');
  });
});
