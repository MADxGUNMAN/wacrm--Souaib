import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dedupeByPhone,
  findContactByNormalizedPhone,
  findExistingContact,
  isExactMatch,
  isUniqueViolation,
  normalizeKey,
} from './dedupe';

describe('normalizeKey', () => {
  it('strips every non-digit', () => {
    expect(normalizeKey('+1 (555) 123-4567')).toBe('15551234567');
    expect(normalizeKey('15551234567')).toBe('15551234567');
  });

  it('collapses different formats of the same number to one key', () => {
    expect(normalizeKey('+44 7911 123456')).toBe(normalizeKey('447911123456'));
  });
});

describe('isExactMatch', () => {
  it('treats different formatting of the same digits as exact', () => {
    expect(
      isExactMatch({ id: '1', phone: '+1 555-123-4567' }, '15551234567')
    ).toBe(true);
  });

  it('is false for a trunk-variant (fuzzy) match', () => {
    // last-8 match but not the same full number
    expect(
      isExactMatch({ id: '1', phone: '37063949836' }, '370063949836')
    ).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('detects Postgres 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('is false for other errors / non-objects', () => {
    expect(isUniqueViolation({ code: '23502' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('boom')).toBe(false);
  });
});

describe('dedupeByPhone', () => {
  it('keeps the first occurrence and counts in-file duplicates', () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: '+1 555-1111', name: 'A' },
      { phone: '15551111', name: 'B' }, // same digits as #1
      { phone: '+1 555-2222', name: 'C' },
    ]);
    expect(unique.map((r) => r.name)).toEqual(['A', 'C']);
    expect(duplicates).toBe(1);
  });

  it('drops rows with no digits', () => {
    const { unique, duplicates } = dedupeByPhone([
      { phone: '   ' },
      { phone: '+1 555-3333' },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toBe(1);
  });
});

// In-memory SupabaseClient stub that EVALUATES the query chain instead of
// returning a fixed row set (AGENTS.md §4: a mock that ignores the column
// proves only that the code runs). Rows carry the raw `phone`; the stub
// derives `phone_normalized` exactly like the generated column in
// migration 022 (regexp_replace(phone, '\D', '', 'g')). Every call is
// recorded as [method, column, value] so tests can assert the predicate.
type Row = { id: string; account_id: string; phone: string };
type Call = [string, string, unknown];

function stubDb(rows: Row[]) {
  const calls: Call[] = [];
  let fromCalls = 0;
  const table = rows.map((r) => ({
    ...r,
    phone_normalized: r.phone.replace(/\D/g, ''),
  }));

  function builder() {
    let result: Array<Record<string, unknown>> = [...table];
    const b = {
      select: (cols: string) => {
        calls.push(['select', cols, undefined]);
        return b;
      },
      eq: (col: string, val: unknown) => {
        calls.push(['eq', col, val]);
        result = result.filter((r) => r[col] === val);
        return b;
      },
      like: (col: string, pattern: string) => {
        calls.push(['like', col, pattern]);
        if (!pattern.startsWith('%') || pattern.slice(1).includes('%')) {
          throw new Error(`stub only supports '%suffix' patterns: ${pattern}`);
        }
        result = result.filter((r) =>
          String(r[col]).endsWith(pattern.slice(1))
        );
        return b;
      },
      limit: (n: number) => {
        calls.push(['limit', '', n]);
        result = result.slice(0, n);
        return b;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: result, error: null }),
    };
    return b;
  }

  const db = {
    from: (name: string) => {
      fromCalls++;
      if (name !== 'contacts') throw new Error(`unexpected table ${name}`);
      return builder();
    },
  } as unknown as SupabaseClient;

  return { db, calls, fromCount: () => fromCalls };
}

describe('findExistingContact', () => {
  it('finds a FORMATTED stored phone by its digits (2 Oct incident)', async () => {
    const { db, calls } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '+238 988 48 84' },
    ]);
    const hit = await findExistingContact(db, 'acct', '2389884884');
    expect(hit?.id).toBe('c1');
    expect(calls).toContainEqual(['eq', 'account_id', 'acct']);
    expect(calls).toContainEqual(['eq', 'phone_normalized', '2389884884']);
    // Exact hit short-circuits: no suffix query.
    expect(calls.some(([m]) => m === 'like')).toBe(false);
    // The raw column is never queried.
    expect(calls.some(([, col]) => col === 'phone')).toBe(false);
  });

  it('returns a trunk-variant match via the phone_normalized suffix', async () => {
    const { db, calls } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '37063949836' },
    ]);
    const hit = await findExistingContact(db, 'acct', '+370 063 949 836');
    expect(hit?.id).toBe('c1');
    expect(calls).toContainEqual(['like', 'phone_normalized', '%63949836']);
    expect(
      calls.filter(([m, col]) => m === 'eq' && col === 'account_id')
    ).toHaveLength(2);
  });

  it('is scoped to the account', async () => {
    const { db } = stubDb([
      { id: 'c1', account_id: 'other-acct', phone: '+238 988 48 84' },
    ]);
    expect(await findExistingContact(db, 'acct', '2389884884')).toBeNull();
  });

  it('returns null when no candidate matches', async () => {
    const { db } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '15559999999' },
    ]);
    const hit = await findExistingContact(db, 'acct', '+1 555-123-4567');
    expect(hit).toBeNull();
  });

  it('returns null for an empty phone without querying', async () => {
    const { db, fromCount } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '15551234567' },
    ]);
    expect(await findExistingContact(db, 'acct', '   ')).toBeNull();
    expect(fromCount()).toBe(0);
  });

  it('skips the suffix query for numbers under 8 digits', async () => {
    const { db, calls } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '99 1234567' },
    ]);
    expect(await findExistingContact(db, 'acct', '1234567')).toBeNull();
    expect(calls).toContainEqual(['eq', 'phone_normalized', '1234567']);
    expect(calls.some(([m]) => m === 'like')).toBe(false);
  });
});

describe('findContactByNormalizedPhone', () => {
  it('finds a formatted stored row by exact digits', async () => {
    const { db, calls } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '+226 72 36 23 25' },
    ]);
    const { contact, error } = await findContactByNormalizedPhone(
      db,
      'acct',
      '22672362325'
    );
    expect(error).toBeNull();
    expect(contact?.id).toBe('c1');
    expect(calls).toContainEqual(['eq', 'account_id', 'acct']);
    expect(calls).toContainEqual(['eq', 'phone_normalized', '22672362325']);
  });

  it('returns { null, null } for an empty input without querying', async () => {
    const { db, fromCount } = stubDb([
      { id: 'c1', account_id: 'acct', phone: '15551234567' },
    ]);
    expect(await findContactByNormalizedPhone(db, 'acct', ' - ')).toEqual({
      contact: null,
      error: null,
    });
    expect(fromCount()).toBe(0);
  });
});
