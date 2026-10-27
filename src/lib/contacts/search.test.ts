import { describe, expect, it } from 'vitest';
import { buildContactSearchFilter, phoneSearchDigits } from './search';

describe('phoneSearchDigits', () => {
  it('reduces any phone formatting to the same digits', () => {
    expect(phoneSearchDigits('+222 4855 0082')).toBe('22248550082');
    expect(phoneSearchDigits('+22248550082')).toBe('22248550082');
    expect(phoneSearchDigits('(222) 4855-0082')).toBe('22248550082');
    expect(phoneSearchDigits('4855 0082')).toBe('48550082');
  });

  it('drops trunk 0 / 00 prefixes so local input finds international numbers', () => {
    expect(phoneSearchDigits('050 675 1025')).toBe('506751025');
    expect(phoneSearchDigits('00971 50 675 1025')).toBe('971506751025');
  });

  it('ignores non-phone searches', () => {
    expect(phoneSearchDigits('Toyota')).toBeNull();
    expect(phoneSearchDigits('Toyota 22')).toBeNull();
    expect(phoneSearchDigits('a@b.com')).toBeNull();
    expect(phoneSearchDigits('   ')).toBeNull();
    expect(phoneSearchDigits('+ - ()')).toBeNull();
  });
});

describe('buildContactSearchFilter', () => {
  it('adds a phone_normalized match for phone-looking input', () => {
    expect(buildContactSearchFilter('+222 4855 0082')).toBe(
      'name.ilike."%+222 4855 0082%",phone.ilike."%+222 4855 0082%",' +
        'email.ilike."%+222 4855 0082%",phone_normalized.like."%22248550082%"'
    );
  });

  it('keeps text searches on the given columns only', () => {
    expect(buildContactSearchFilter('Toyota', ['name', 'phone'])).toBe(
      'name.ilike."%Toyota%",phone.ilike."%Toyota%"'
    );
  });

  it('quotes values so commas and quotes cannot break the filter', () => {
    expect(buildContactSearchFilter('a,b"c', ['name'])).toBe(
      'name.ilike."%a,b\\"c%"'
    );
  });
});
