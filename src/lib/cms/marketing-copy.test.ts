import { describe, expect, it } from 'vitest';
import {
  MARKETING_COPY_DEFAULTS,
  resolveMarketingCopy,
} from './marketing-copy';
import { boldSegments, list, text, withSiteName } from './content-helpers';

describe('resolveMarketingCopy', () => {
  it('returns the defaults for empty or malformed values', () => {
    for (const raw of [null, undefined, {}, [], 'x', { auth: 'nope' }]) {
      expect(resolveMarketingCopy(raw)).toEqual(MARKETING_COPY_DEFAULTS);
    }
  });

  it('keeps edited fields and fills the rest per field', () => {
    const c = resolveMarketingCopy({
      auth: { heading: 'Grow faster', description: '' },
      navbar: { login_text: 'Sign in', signup_text: 42 },
    });
    expect(c.auth.heading).toBe('Grow faster');
    expect(c.auth.description).toBe(MARKETING_COPY_DEFAULTS.auth.description);
    expect(c.navbar.login_text).toBe('Sign in');
    expect(c.navbar.signup_text).toBe(
      MARKETING_COPY_DEFAULTS.navbar.signup_text
    );
    expect(c.newsletter).toEqual(MARKETING_COPY_DEFAULTS.newsletter);
  });

  it('ignores unknown keys', () => {
    const c = resolveMarketingCopy({ navbar: { evil: '<script>' } });
    expect(c.navbar).toEqual(MARKETING_COPY_DEFAULTS.navbar);
    expect(Object.keys(c.navbar)).toEqual(['login_text', 'signup_text']);
  });
});

describe('content helpers', () => {
  it('text falls back on blank and non-strings', () => {
    expect(text('  ', 'd')).toBe('d');
    expect(text(5, 'd')).toBe('d');
    expect(text('x', 'd')).toBe('x');
  });

  it('list filters and falls back when nothing is left', () => {
    expect(list(['', 'a'], ['d'], (s: string) => s.length > 0)).toEqual(['a']);
    expect(list([''], ['d'], (s: string) => s.length > 0)).toEqual(['d']);
    expect(list('nope', ['d'], () => true)).toEqual(['d']);
    expect(list([null, 'a'], ['d'], () => true)).toEqual(['a']);
  });

  it('boldSegments splits **markers** without interpreting HTML', () => {
    expect(boldSegments('Hi **Asha**, <b>x</b>')).toEqual([
      { text: 'Hi ', bold: false },
      { text: 'Asha', bold: true },
      { text: ', <b>x</b>', bold: false },
    ]);
    expect(boldSegments('a ** b')).toEqual([{ text: 'a ** b', bold: false }]);
  });

  it('withSiteName replaces every token', () => {
    expect(withSiteName('{site_name} and {site_name}', 'Replai')).toBe(
      'Replai and Replai'
    );
  });
});
