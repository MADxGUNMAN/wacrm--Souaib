import { describe, expect, it } from 'vitest';
import {
  decodeCsvBytes,
  parseContactCsv,
  parseTagCell,
} from './parse-contact-csv';

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
      emptyPhoneRows: 0,
      invalidPhones: [],
      rows: [
        {
          phone: '+15551234567',
          hasCountryCode: true,
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
          customFields: undefined,
        },
        {
          phone: '+15559876543',
          hasCountryCode: true,
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
      emptyPhoneRows: 0,
      invalidPhones: [],
      rows: [
        {
          phone: '+15551234567',
          hasCountryCode: true,
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

  it('keeps every country code, strips extensions and reports unusable rows', () => {
    // Shape of a real multi-country sheet: trailing empty columns, blank
    // phones, extensions, local numbers and an Excel-mangled value.
    const csv = [
      'phone,name,email,company,tags,,,',
      '+98 71 5372 5951,Iran Khodro Car Dealer,,,IRAN,,,',
      '+211 92 246 6000,Global Link,,,SOUTH SUDAN,,,',
      '+266 5141 2347 ext. 58429948,Toyota Lesotho,,,LESOTHO,,,',
      '050 675 1025,Dubai Dealer,,,UAE,,,',
      ',No Phone Motors,,,IRAQ,,,',
      ',,,,,,,',
      '2.14E+11,Broken Number,,,NIGERIA,,,',
    ].join('\r\n');

    const result = parseContactCsv(csv);
    expect(result.rows.map((r) => [r.phone, r.hasCountryCode])).toEqual([
      ['+987153725951', true],
      ['+211922466000', true],
      ['+26651412347', true],
      ['050 675 1025', false],
    ]);
    expect(result.emptyPhoneRows).toBe(1);
    expect(result.invalidPhones).toEqual(['2.14E+11']);
    expect(result.customFieldColumns).toEqual([]);
  });
});

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and falls back to Windows-1252', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('Café'))).toBe('Café');
    // "Café" + NBSP in Windows-1252 (invalid as UTF-8)
    expect(decodeCsvBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0xa0]))).toBe(
      'Caf\u00e9\u00a0'
    );
  });
});
