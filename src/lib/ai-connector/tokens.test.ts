import { describe, expect, it } from 'vitest';
import {
  TTL,
  addSeconds,
  candidateHashes,
  classifyRefreshToken,
  generateId,
  generateToken,
  hashSecret,
  looksLikeToken,
  nextRefreshExpiry,
  safeEqual,
  type RefreshRow,
} from './tokens';

describe('generateToken / looksLikeToken', () => {
  it('produces prefixed 256-bit values that match only their own kind', () => {
    const at = generateToken('access');
    expect(at).toMatch(/^rpl_at_[A-Za-z0-9_-]{43}$/);
    expect(looksLikeToken('access', at)).toBe(true);
    expect(looksLikeToken('refresh', at)).toBe(false);
    expect(looksLikeToken('code', generateToken('code'))).toBe(true);
  });

  it('never repeats', () => {
    const seen = new Set(
      Array.from({ length: 500 }, () => generateToken('refresh'))
    );
    expect(seen.size).toBe(500);
  });

  it('rejects non-strings, wrong lengths and foreign prefixes', () => {
    expect(looksLikeToken('access', undefined)).toBe(false);
    expect(looksLikeToken('access', 'rpl_at_short')).toBe(false);
    expect(looksLikeToken('access', 'wacrm_live_' + 'a'.repeat(43))).toBe(
      false
    );
    expect(looksLikeToken('access', generateToken('access') + 'x')).toBe(false);
  });
});

describe('hashing', () => {
  it('is keyed by the pepper and deterministic', () => {
    const t = generateToken('access');
    expect(hashSecret(t, 'p'.repeat(32))).toBe(hashSecret(t, 'p'.repeat(32)));
    expect(hashSecret(t, 'p'.repeat(32))).not.toBe(
      hashSecret(t, 'q'.repeat(32))
    );
    expect(hashSecret(t, 'p'.repeat(32))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an empty pepper', () => {
    expect(() => hashSecret('x', '')).toThrow();
  });

  it('offers the previous pepper during rotation', () => {
    expect(candidateHashes('x', 'a'.repeat(32), null)).toHaveLength(1);
    expect(candidateHashes('x', 'a'.repeat(32), 'b'.repeat(32))).toHaveLength(
      2
    );
  });

  it('compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('generates prefixed ids', () => {
    expect(generateId('cnf_')).toMatch(/^cnf_[A-Za-z0-9_-]{22}$/);
  });
});

describe('classifyRefreshToken', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const expected = {
    issuer: 'https://wacrm.junkiescoder.com',
    resource: 'https://wacrm.junkiescoder.com/mcp',
  };
  const row = (over: Partial<RefreshRow> = {}): RefreshRow => ({
    used_at: null,
    revoked_at: null,
    expires_at: '2026-10-20T00:00:00Z',
    absolute_expires_at: '2027-01-01T00:00:00Z',
    ...expected,
    ...over,
  });

  it('accepts a fresh token', () => {
    expect(classifyRefreshToken(row(), expected, now)).toBe('valid');
  });
  it('flags reuse so the family can be revoked', () => {
    expect(
      classifyRefreshToken(
        row({ used_at: '2026-10-01T09:00:00Z' }),
        expected,
        now
      )
    ).toBe('reused');
  });
  it('rejects revoked, expired and unknown tokens', () => {
    expect(
      classifyRefreshToken(
        row({ revoked_at: '2026-10-01T09:00:00Z' }),
        expected,
        now
      )
    ).toBe('revoked');
    expect(
      classifyRefreshToken(
        row({ expires_at: '2026-10-01T09:59:59Z' }),
        expected,
        now
      )
    ).toBe('expired');
    expect(
      classifyRefreshToken(
        row({ absolute_expires_at: '2026-10-01T09:00:00Z' }),
        expected,
        now
      )
    ).toBe('expired');
    expect(classifyRefreshToken(null, expected, now)).toBe('unknown');
  });
  it('rejects a token minted by the other deployment', () => {
    expect(
      classifyRefreshToken(
        row({ issuer: 'https://devcrm.junkiescoder.com' }),
        expected,
        now
      )
    ).toBe('wrong_audience');
    expect(
      classifyRefreshToken(
        row({ resource: 'https://x.com/mcp' }),
        expected,
        now
      )
    ).toBe('wrong_audience');
  });
});

describe('nextRefreshExpiry', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('slides 30 days ahead', () => {
    expect(
      nextRefreshExpiry(addSeconds(now, TTL.refreshAbsolute), now)
    ).toEqual(addSeconds(now, TTL.refreshSliding));
  });
  it('never passes the absolute limit', () => {
    const abs = addSeconds(now, 3600);
    expect(nextRefreshExpiry(abs, now)).toEqual(abs);
  });
});
