import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  findCountryByCode,
  parsePhoneToCountryAndNational,
  validateCountryPhoneNumber,
  formatPhoneNumber,
  formatPhoneNumberParts,
} from './countries';

describe('countries phone validation & parsing', () => {
  it('defaults to India (+91)', () => {
    expect(DEFAULT_COUNTRY.code).toBe('IN');
    expect(DEFAULT_COUNTRY.dialCode).toBe('+91');
  });

  it('finds country by code case-insensitively', () => {
    expect(findCountryByCode('in')?.name).toBe('India');
    expect(findCountryByCode('US')?.dialCode).toBe('+1');
    expect(findCountryByCode('ae')?.name).toBe('United Arab Emirates');
  });

  it('validates 10-digit Indian phone number starting with [6-9]', () => {
    const india = findCountryByCode('IN')!;
    const valid = validateCountryPhoneNumber(india, '9876543210');
    expect(valid.isValid).toBe(true);
    expect(valid.fullE164).toBe('+919876543210');

    // 11 digits should be invalid
    const invalid11 = validateCountryPhoneNumber(india, '98765432101');
    expect(invalid11.isValid).toBe(false);
    expect(invalid11.error).toContain(
      'must be exactly 10 digits (you entered 11)'
    );

    // 9 digits should be invalid
    const invalid9 = validateCountryPhoneNumber(india, '987654321');
    expect(invalid9.isValid).toBe(false);
    expect(invalid9.error).toContain(
      'must be exactly 10 digits (you entered 9)'
    );

    // Starting with trunk 0
    const trunk0 = validateCountryPhoneNumber(india, '0987654321');
    expect(trunk0.isValid).toBe(false);
    expect(trunk0.error).toContain('should not start with domestic trunk 0');
  });

  it('validates US and UAE numbers with their respective lengths', () => {
    const us = findCountryByCode('US')!;
    expect(validateCountryPhoneNumber(us, '5551234567').isValid).toBe(true);
    expect(validateCountryPhoneNumber(us, '555123456').isValid).toBe(false);

    const uae = findCountryByCode('AE')!;
    expect(validateCountryPhoneNumber(uae, '501234567').isValid).toBe(true);
    expect(validateCountryPhoneNumber(uae, '5012345678').isValid).toBe(false);
  });

  it('parses full phone numbers with country dial codes correctly', () => {
    const res1 = parsePhoneToCountryAndNational('+919876543210');
    expect(res1.country.code).toBe('IN');
    expect(res1.nationalNumber).toBe('9876543210');

    const res2 = parsePhoneToCountryAndNational('+971501234567');
    expect(res2.country.code).toBe('AE');
    expect(res2.nationalNumber).toBe('501234567');

    const res3 = parsePhoneToCountryAndNational('9876543210', 'IN');
    expect(res3.country.code).toBe('IN');
    expect(res3.nationalNumber).toBe('9876543210');
  });

  it('formats phone numbers professionally with plus and separated country code', () => {
    // Standard Indian raw digits (from screenshot)
    expect(formatPhoneNumber('916359463987')).toBe('+91 63594 63987');
    expect(formatPhoneNumber('917861902341')).toBe('+91 78619 02341');
    expect(formatPhoneNumber('+919876543210')).toBe('+91 98765 43210');

    // US, UK, UAE
    expect(formatPhoneNumber('+14155552671')).toBe('+1 (415) 555-2671');
    expect(formatPhoneNumber('+447911123456')).toBe('+44 7911 123456');
    expect(formatPhoneNumber('971501234567')).toBe('+971 50 123 4567');

    // Already formatted
    expect(formatPhoneNumber('+91 63594 63987')).toBe('+91 63594 63987');

    // Empty and edge cases
    expect(formatPhoneNumber('')).toBe('');
    expect(formatPhoneNumber(null)).toBe('');
    expect(formatPhoneNumber('123')).toBe('+123');

    // Bare national numbers still use the default country
    expect(formatPhoneNumber('9876543210')).toBe('+91 98765 43210');

    // Parts breakdown
    const parts = formatPhoneNumberParts('916359463987');
    expect(parts.dialCode).toBe('+91');
    expect(parts.nationalNumber).toBe('63594 63987');
    expect(parts.country?.code).toBe('IN');
    expect(parts.formatted).toBe('+91 63594 63987');
  });
});

describe('international numbers are never re-labelled as the default country', () => {
  it('has one entry per ISO code', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Real values from a multi-country import that rendered as "+91 …"
  it.each([
    ['+98 71 5372 5951', 'IR', '+98'],
    ['+98 83 3725 8666', 'IR', '+98'],
    ['+211 92 246 6000', 'SS', '+211'],
    ['+222 45 25 50 70', 'MR', '+222'],
    ['+264 61 123 456', 'NA', '+264'],
    ['+373 22 123 456', 'MD', '+373'],
    ['+95 9 123 456 789', 'MM', '+95'],
    ['+592 225 1234', 'GY', '+592'],
    ['+382 20 123 456', 'ME', '+382'],
    ['+389 2 312 3456', 'MK', '+389'],
    ['+258 21 123 456', 'MZ', '+258'],
    ['+856 21 123 456', 'LA', '+856'],
    ['+268 2518 6997', 'SZ', '+268'],
    ['+1 868 625 1234', 'TT', '+1868'],
    ['+1 260-624-0622', 'US', '+1'],
  ])('%s → %s', (phone, code, dial) => {
    const parts = formatPhoneNumberParts(phone);
    expect(parts.country?.code).toBe(code);
    expect(parts.dialCode).toBe(dial);
    expect(parts.formatted.startsWith(`${dial} `)).toBe(true);
    // Every digit of the original survives
    expect(parts.formatted.replace(/\D/g, '')).toBe(phone.replace(/\D/g, ''));
  });

  it('shows an unknown +code as written instead of prefixing +91', () => {
    // +999 is unassigned
    const parts = formatPhoneNumberParts('+999 1234 5678');
    expect(parts.country).toBeNull();
    expect(parts.formatted).toBe('+99912345678');
  });

  it('shows local numbers without a country code as written', () => {
    expect(formatPhoneNumber('050 675 1025')).toBe('050 675 1025');
    expect(formatPhoneNumber('04 333 8923')).toBe('04 333 8923');
    expect(formatPhoneNumber('466 2615')).toBe('466 2615');
  });

  it('matches +CC exactly even when the default country differs', () => {
    const res = parsePhoneToCountryAndNational('+987153725951', 'IN');
    expect(res.country.code).toBe('IR');
    expect(res.nationalNumber).toBe('7153725951');
    expect(res.matched).toBe(true);
  });

  it('prefers an exact national length for digits-only wa_ids', () => {
    expect(parsePhoneToCountryAndNational('987153725951').country.code).toBe(
      'IR'
    );
    expect(parsePhoneToCountryAndNational('26651412347').country.code).toBe(
      'LS'
    );
    expect(parsePhoneToCountryAndNational('919426046258').country.code).toBe(
      'IN'
    );
  });
});
