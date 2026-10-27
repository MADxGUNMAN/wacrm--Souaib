import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  formatSecretForDisplay,
  generateTotpSecret,
  hotp,
  normalizeTotpCode,
  otpauthUri,
  totpAt,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B, SHA-1 secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [t, expected8] of RFC_VECTORS) {
      expect(hotp(base32Decode(RFC_SECRET), Math.floor(t / 30), 8)).toBe(
        expected8
      );
      // 6-digit codes are the last six digits of the 8-digit value.
      expect(totpAt(RFC_SECRET, t * 1000)).toBe(expected8.slice(-6));
    }
  });

  it('base32 round-trips random secrets', () => {
    for (let i = 0; i < 20; i++) {
      const s = generateTotpSecret();
      expect(s).toMatch(/^[A-Z2-7]{32}$/);
      expect(base32Encode(base32Decode(s))).toBe(s);
    }
    expect(base32Decode('mfrg gzdf-mztq')).toEqual(
      base32Decode('MFRGGZDFMZTQ')
    );
    expect(() => base32Decode('abc1')).toThrow();
  });

  it('accepts the current, previous and next step only', () => {
    const now = 1_760_000_000_000;
    const step = Math.floor(now / 30_000);
    const s = generateTotpSecret();
    expect(verifyTotp(s, totpAt(s, now), now)).toBe(step);
    expect(verifyTotp(s, totpAt(s, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(s, totpAt(s, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(s, totpAt(s, now - 90_000), now)).toBeNull();
  });

  it('rejects malformed codes', () => {
    const s = generateTotpSecret();
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 5x']) {
      expect(verifyTotp(s, bad)).toBeNull();
    }
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode(123456)).toBeNull();
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = otpauthUri({
      secret: 'ABC',
      accountName: 'Asha <a@x.com>',
      issuer: 'Replai',
    });
    expect(
      uri.startsWith('otpauth://totp/Replai%3AAsha%20%3Ca%40x.com%3E?')
    ).toBe(true);
    const params = new URL(uri.replace('otpauth://', 'https://')).searchParams;
    expect(params.get('secret')).toBe('ABC');
    expect(params.get('issuer')).toBe('Replai');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
    expect(formatSecretForDisplay('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});
