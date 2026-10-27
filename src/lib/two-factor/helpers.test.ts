import { beforeEach, describe, expect, it } from 'vitest';

process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery';
import { safeTwoFactorNext, twoFactorUrl } from './next-path';
import {
  __resetTwoFactorGateCacheForTests,
  GATE_CACHE_TTL_MS,
  gateCacheKey,
  isGateCached,
  isTwoFactorOpenPath,
  readTwoFactorGate,
  rememberGatePassed,
  sessionIdFromAccessToken,
} from './gate';

describe('recovery codes', () => {
  it('generates 10 unique, readable codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes)
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it('hashes tolerant of case, spaces and dashes', () => {
    expect(hashRecoveryCode('abcde-fghjk')).toBe(
      hashRecoveryCode(' ABCDE FGHJK ')
    );
    expect(hashRecoveryCode('ABCDE-FGHJK')).not.toBe(
      hashRecoveryCode('ABCDE-FGHJM')
    );
    expect(normalizeRecoveryCode('123456')).toBeNull();
    expect(() => hashRecoveryCode('nope')).toThrow();
  });
});

describe('safeTwoFactorNext', () => {
  it('keeps same-site app paths', () => {
    expect(safeTwoFactorNext('/inbox?c=1')).toBe('/inbox?c=1');
    expect(safeTwoFactorNext('/oauth/consent?request_id=req_x')).toBe(
      '/oauth/consent?request_id=req_x'
    );
  });

  it('rejects open redirects and loops', () => {
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      '/two-factor?next=/x',
      '/api/contacts',
      '/login',
      '/x\n/y',
      null,
      '',
    ]) {
      expect(safeTwoFactorNext(bad)).toBe('/dashboard');
    }
    expect(twoFactorUrl('/inbox')).toBe('/two-factor?next=%2Finbox');
    expect(twoFactorUrl('//evil')).toBe('/two-factor');
  });
});

describe('two-factor gate', () => {
  beforeEach(() => __resetTwoFactorGateCacheForTests());

  it('leaves public pages and the 2FA flow open, gates the app', () => {
    for (const open of [
      '/',
      '/two-factor',
      '/api/security/two-factor/verify',
      '/api/security/two-factor/challenge',
      '/api/security/sessions/logout',
      '/docs/getting-started',
      '/legal/privacy-policy',
      '/sitemap.xml',
      '/api/v1/contacts',
      '/api/whatsapp/webhook',
    ]) {
      expect(isTwoFactorOpenPath(open)).toBe(true);
    }
    for (const gated of [
      '/dashboard',
      '/inbox',
      '/settings',
      '/super-admin',
      '/oauth/consent',
      '/join/abc',
      '/api/contacts',
      '/api/security/sessions',
      '/api/security/two-factor',
      '/api/security/two-factor/enroll',
      '/api/security/two-factor/workspace',
      '/two-factorx',
    ]) {
      expect(isTwoFactorOpenPath(gated)).toBe(false);
    }
  });

  it('caches passed checks briefly per user and session', () => {
    const key = gateCacheKey('u1', 's1');
    expect(isGateCached(key)).toBe(false);
    rememberGatePassed(key, 1000);
    expect(isGateCached(key, 1000 + GATE_CACHE_TTL_MS - 1)).toBe(true);
    expect(isGateCached(gateCacheKey('u1', 's2'), 1000)).toBe(false);
    expect(isGateCached(key, 1000 + GATE_CACHE_TTL_MS + 1)).toBe(false);
  });

  it('reads the session id claim from an access token', () => {
    const payload = Buffer.from(JSON.stringify({ session_id: 'abc-123' }))
      .toString('base64')
      .replace(/=+$/, '');
    expect(sessionIdFromAccessToken(`h.${payload}.s`)).toBe('abc-123');
    expect(sessionIdFromAccessToken('garbage')).toBeNull();
    expect(sessionIdFromAccessToken(null)).toBeNull();
  });

  it('normalises the RPC result and throws on error', async () => {
    const client = (data: unknown, error: unknown = null) =>
      ({ rpc: async () => ({ data, error }) }) as never;
    expect(
      await readTwoFactorGate(client([{ required: 'owner', satisfied: false }]))
    ).toEqual({
      required: 'owner',
      satisfied: false,
    });
    expect(
      await readTwoFactorGate(client([{ required: 'none', satisfied: false }]))
    ).toEqual({
      required: 'none',
      satisfied: true,
    });
    expect(await readTwoFactorGate(client([{ required: 'weird' }]))).toEqual({
      required: 'none',
      satisfied: true,
    });
    await expect(
      readTwoFactorGate(client(null, { message: 'down' }))
    ).rejects.toThrow();
  });
});
