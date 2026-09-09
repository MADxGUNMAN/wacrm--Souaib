import { describe, expect, it } from 'vitest';
import { parseContactCsv, parseTagCell } from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      hasTagsColumn: true,
      hasCompanyColumn: false,
      customFieldColumns: [],
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
          customFields: undefined,
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          tagNames: ['Customer'],
          customFields: undefined,
        },
      ],
    });
  });

  it('returns empty tagNames and customFieldColumns when absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      hasTagsColumn: false,
      hasCompanyColumn: false,
      customFieldColumns: [],
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: [],
          customFields: undefined,
        },
      ],
    });
  });

  it('detects and parses dynamic custom field columns like Order ID and City', () => {
    const csv = `phone,name,email,company,tags,Order ID,City
+15551234567,Alice,alice@example.com,Acme,VIP,ORD-9921,New York
+15559876543,Bob,bob@example.com,TechCorp,,ORD-9922,London`;

    const result = parseContactCsv(csv);
    expect(result.hasTagsColumn).toBe(true);
    expect(result.hasCompanyColumn).toBe(true);
    expect(result.customFieldColumns).toEqual(['Order ID', 'City']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].customFields).toEqual({
      'Order ID': 'ORD-9921',
      City: 'New York',
    });
    expect(result.rows[1].customFields).toEqual({
      'Order ID': 'ORD-9922',
      City: 'London',
    });
  });
});
