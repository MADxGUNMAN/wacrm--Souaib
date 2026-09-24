import { describe, expect, it } from 'vitest';
import { ReplaiPhone } from '../src/phone.js';

/*
  Phone normalisation, tested hard because both failure directions are
  expensive: too strict and a legitimate customer never gets their
  message, too loose and a paid message reaches a stranger in the wrong
  country.
*/

const ok = (raw, cc) => ReplaiPhone.normalise(raw, cc);

describe('numbers that are already international', () => {
  it('keeps a + number exactly as given', () => {
    expect(ok('+919876543210').phone).toBe('+919876543210');
    expect(ok('+1 555 012 3456').phone).toBe('+15550123456');
    expect(ok('+44 (20) 7946-0958').phone).toBe('+442079460958');
  });

  it('never prepends a country code onto a + number', () => {
    // The bug this prevents: a +1 number in a sheet with a +91 rule
    // becoming +9115550123456, which is a real number in India.
    expect(ok('+15550123456', '+91').phone).toBe('+15550123456');
  });

  it('understands the 00 international prefix', () => {
    expect(ok('0091 98765 43210').phone).toBe('+919876543210');
    expect(ok('00447700900123').phone).toBe('+447700900123');
  });
});

describe('national numbers with a rule country code', () => {
  it('prefixes the code', () => {
    expect(ok('9876543210', '+91').phone).toBe('+919876543210');
    expect(ok('9876543210', '91').phone).toBe('+919876543210');
  });

  it('drops a national trunk prefix before prefixing', () => {
    // 0 is a trunk prefix across India, the UK and much of Europe.
    // Keeping it makes the number one digit too long and Meta rejects it.
    expect(ok('09876543210', '+91').phone).toBe('+919876543210');
    expect(ok('07700900123', '+44').phone).toBe('+447700900123');
  });

  it('does not double a country code the cell already carries', () => {
    // 919876543210 with a +91 rule must not become +9191…
    expect(ok('919876543210', '+91').phone).toBe('+919876543210');
  });

  it('reads a number cell, where a leading zero is already lost', () => {
    // Sheets stores 6359465987 as a number; String() must not produce
    // exponential notation for it.
    expect(ok(6359465987, '+91').phone).toBe('+916359465987');
  });
});

describe('refusing to guess', () => {
  it('rejects a bare national number with no country code', () => {
    // Guessing the country is how a paid message reaches a stranger.
    const result = ok('9876543210');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/country code/);
  });

  it('rejects text that is not a number', () => {
    expect(ok('call John').ok).toBe(false);
    expect(ok('N/A', '+91').ok).toBe(false);
    expect(ok('9876543210 ext 4', '+91').ok).toBe(false);
  });

  it('rejects an empty cell with a readable reason', () => {
    ['', '   ', null, undefined].forEach((value) => {
      const result = ok(value, '+91');
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  it('rejects lengths outside E.164', () => {
    expect(ok('+12345').ok).toBe(false);
    expect(ok('+1234567890123456').ok).toBe(false);
  });

  it('ignores a nonsense country code rather than using it', () => {
    // 'abc' yields no digits, so this falls through to "no country code"
    // instead of building '+abc9876543210'.
    const result = ok('9876543210', 'abc');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/country code/);
  });
});

describe('formatting noise', () => {
  it('strips spaces, dashes, dots, brackets and non-breaking spaces', () => {
    expect(ok('+91-98765.43210').phone).toBe('+919876543210');
    expect(ok('+91\u00a098765\u00a043210').phone).toBe('+919876543210');
    expect(ok('  +91 98765 43210  ').phone).toBe('+919876543210');
  });

  it('always returns a leading plus on success', () => {
    expect(ok('9876543210', '+91').phone.charAt(0)).toBe('+');
  });
});
