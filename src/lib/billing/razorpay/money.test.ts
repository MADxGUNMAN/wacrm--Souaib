import { describe, expect, it } from 'vitest';

import { MoneyError, currencyExponent, fromMinor, toMinor } from './money';

describe('toMinor', () => {
  it('converts the live catalogue prices exactly', () => {
    expect(toMinor(990, 'INR')).toBe(99000);
    expect(toMinor(9000, 'INR')).toBe(900000);
    // NUMERIC from PostgREST arrives as "990.00" and is coerced first.
    expect(toMinor(Number('990.00'), 'inr')).toBe(99000);
  });

  it('absorbs float noise but refuses sub-paise amounts', () => {
    expect(toMinor(990.1, 'INR')).toBe(99010);
    expect(toMinor(0.29, 'INR')).toBe(29);
    expect(() => toMinor(990.005, 'INR')).toThrow(MoneyError);
  });

  it('respects zero and three decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(toMinor(295, 'JPY')).toBe(295);
    expect(toMinor(295.991, 'KWD')).toBe(295991);
  });

  it('rejects bad input instead of guessing', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toMinor(bad, 'INR')).toThrow(MoneyError);
    }
    expect(() => toMinor(1, 'RUPEES')).toThrow(MoneyError);
    expect(() => toMinor(1, '')).toThrow(MoneyError);
  });
});

describe('fromMinor', () => {
  it('round-trips', () => {
    expect(fromMinor(99000, 'INR')).toBe(990);
    expect(fromMinor(500, 'INR')).toBe(5);
    expect(fromMinor(295991, 'KWD')).toBe(295.991);
    expect(() => fromMinor(1.5, 'INR')).toThrow(MoneyError);
  });
});
