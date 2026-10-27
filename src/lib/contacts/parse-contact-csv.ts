/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column and custom-fields handling stays aligned with phone/name/email/company.
 */

import { cleanImportPhone } from './import-phone';

export interface ParsedContactRow {
  /** Cleaned phone: E.164 when the sheet gave a country code, else as written. */
  phone: string;
  /** False when the sheet gave no "+"/"00" country code for this number. */
  hasCountryCode: boolean;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
  /** Dynamic custom field values keyed by column name (e.g. { "Order ID": "12345" }). */
  customFields?: Record<string, string>;
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
  /** List of detected custom field column names (e.g. ["Order ID", "City"]). */
  customFieldColumns: string[];
  /** Data rows left out because the phone cell was empty. */
  emptyPhoneRows: number;
  /** Phone values that can't be a number (e.g. Excel "2.14E+11"), as written. */
  invalidPhones: string[];
}

const EMPTY_RESULT: ParseContactCsvResult = {
  rows: [],
  hasTagsColumn: false,
  hasCompanyColumn: false,
  customFieldColumns: [],
  emptyPhoneRows: 0,
  invalidPhones: [],
};

export function parseContactCsv(text: string): ParseContactCsvResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { ...EMPTY_RESULT };

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map((h) =>
    h.trim().toLowerCase().replace(/["']/g, '')
  );

  const phoneIdx = headers.indexOf('phone');
  if (phoneIdx === -1) return { ...EMPTY_RESULT };

  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const companyIdx = headers.indexOf('company');
  const tagsIdx = headers.indexOf('tags');

  // Identify all other non-empty headers as dynamic custom field columns
  const standardIndices = new Set(
    [phoneIdx, nameIdx, emailIdx, companyIdx, tagsIdx].filter((i) => i >= 0)
  );
  const customFieldIndices: { index: number; name: string }[] = [];

  rawHeaders.forEach((rawHeader, idx) => {
    if (!standardIndices.has(idx)) {
      const cleanName = rawHeader.trim().replace(/^["']|["']$/g, '');
      if (cleanName.length > 0) {
        customFieldIndices.push({ index: idx, name: cleanName });
      }
    }
  });

  const customFieldColumns = customFieldIndices.map((c) => c.name);
  const rows: ParsedContactRow[] = [];
  let emptyPhoneRows = 0;
  const invalidPhones: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const rawPhone = values[phoneIdx]?.replace(/["']/g, '').trim();
    if (!rawPhone) {
      // Only count rows that carry other data — a line of bare commas
      // (spreadsheet padding) isn't a contact the user expects to see.
      if (values.some((v) => v.replace(/["']/g, '').trim())) emptyPhoneRows++;
      continue;
    }

    const cleaned = cleanImportPhone(rawPhone);
    if (cleaned.status === 'invalid') {
      invalidPhones.push(rawPhone);
      continue;
    }
    const phone = cleaned.phone;

    const customFields: Record<string, string> = {};
    for (const { index, name } of customFieldIndices) {
      const val = values[index]?.replace(/^["']|["']$/g, '').trim();
      if (val !== undefined && val !== '') {
        customFields[name] = val;
      }
    }

    rows.push({
      phone,
      hasCountryCode: cleaned.status === 'international',
      name:
        nameIdx >= 0
          ? values[nameIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      email:
        emailIdx >= 0
          ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0 ? parseTagCell(values[tagsIdx]?.replace(/["']/g, '')) : [],
      customFields:
        Object.keys(customFields).length > 0 ? customFields : undefined,
    });
  }

  return {
    rows,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
    customFieldColumns,
    emptyPhoneRows,
    invalidPhones,
  };
}

/** Simple CSV line parse (handles quoted fields). */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Decode an uploaded CSV. Excel's "CSV" export is often Windows-1252,
 * not UTF-8; decoding that as UTF-8 turns accented letters and
 * non-breaking spaces into "�". Try strict UTF-8 first, then fall back.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
