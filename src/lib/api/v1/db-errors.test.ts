import { describe, expect, it } from 'vitest';

import {
  PG_INVALID_TEXT_REPRESENTATION,
  isInvalidTextRepresentation,
} from './db-errors';

describe('isInvalidTextRepresentation', () => {
  it('recognises the real PostgREST error for a malformed uuid', () => {
    // Captured verbatim from PostgREST for
    // `GET /rest/v1/contacts?select=id&id=eq.not-a-uuid`.
    expect(
      isInvalidTextRepresentation({
        code: '22P02',
        details: null,
        hint: null,
        message: 'invalid input syntax for type uuid: "not-a-uuid"',
      })
    ).toBe(true);
  });

  it('matches on the exported SQLSTATE constant', () => {
    expect(
      isInvalidTextRepresentation({ code: PG_INVALID_TEXT_REPRESENTATION })
    ).toBe(true);
  });

  it('does not match unrelated database errors', () => {
    // A unique violation is a genuine conflict, not a caller typo.
    expect(isInvalidTextRepresentation({ code: '23505' })).toBe(false);
    // Permission / RLS failures must keep their own handling.
    expect(isInvalidTextRepresentation({ code: '42501' })).toBe(false);
  });

  it('treats a successful query (null error) as not a cast failure', () => {
    // Every call site passes the destructured `error`, which is null on
    // success — this must not be read as "bad input".
    expect(isInvalidTextRepresentation(null)).toBe(false);
    expect(isInvalidTextRepresentation(undefined)).toBe(false);
  });

  it('ignores non-object and code-less values', () => {
    expect(isInvalidTextRepresentation('22P02')).toBe(false);
    expect(isInvalidTextRepresentation(22102)).toBe(false);
    expect(isInvalidTextRepresentation({})).toBe(false);
    expect(isInvalidTextRepresentation(new Error('boom'))).toBe(false);
  });

  it('is exact, not a prefix or case-insensitive match', () => {
    expect(isInvalidTextRepresentation({ code: '22P0' })).toBe(false);
    expect(isInvalidTextRepresentation({ code: '22P022' })).toBe(false);
    expect(isInvalidTextRepresentation({ code: '22p02' })).toBe(false);
  });
});
