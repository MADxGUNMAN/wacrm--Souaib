import { describe, expect, it } from 'vitest';
import { cleanImportPhone } from './import-phone';

// Samples taken from a real multi-country dealer sheet that previously
// displayed foreign numbers as +91.
describe('cleanImportPhone', () => {
  it('keeps the written country code and stores E.164', () => {
    expect(cleanImportPhone('+98 71 5372 5951')).toEqual({
      phone: '+987153725951',
      status: 'international',
    });
    expect(cleanImportPhone('+1 260-624-0622').phone).toBe('+12606240622');
    expect(cleanImportPhone('+54 11 2158-9594').phone).toBe('+541121589594');
    expect(cleanImportPhone('+593 4-228-1423').phone).toBe('+59342281423');
    expect(cleanImportPhone('+211 92 246 6000').phone).toBe('+211922466000');
    expect(cleanImportPhone('+222 45 25 50 70').phone).toBe('+22245255070');
    // "(0)" marks a trunk digit that is dropped when dialling from abroad
    expect(cleanImportPhone('+44 (0)20 7946 0958').phone).toBe('+442079460958');
  });

  it('treats a 00 international prefix as +', () => {
    expect(cleanImportPhone('00971 50 123 4567').phone).toBe('+971501234567');
  });

  it('strips extensions instead of gluing them onto the number', () => {
    expect(cleanImportPhone('+266 5141 2347 ext. 58429948').phone).toBe(
      '+26651412347'
    );
    expect(cleanImportPhone('+598 2600 1212 int. 2').phone).toBe(
      '+59826001212'
    );
    expect(cleanImportPhone('+598 2924 3125 int. 2100').phone).toBe(
      '+59829243125'
    );
    expect(cleanImportPhone('+1 415 555 2671 x 45').phone).toBe('+14155552671');
  });

  it('keeps numbers without a country code as written, never guessing', () => {
    expect(cleanImportPhone('050 675 1025')).toEqual({
      phone: '050 675 1025',
      status: 'local',
    });
    expect(cleanImportPhone('800 698')).toEqual({
      phone: '800 698',
      status: 'local',
    });
    // Windows-1252 non-breaking space in front of the number
    expect(cleanImportPhone('\u00a05 259 6470')).toEqual({
      phone: '5 259 6470',
      status: 'local',
    });
    // Mis-decoded character
    expect(cleanImportPhone('\ufffd5 259 6470').phone).toBe('5 259 6470');
  });

  it('rejects values that cannot be a phone number', () => {
    expect(cleanImportPhone('2.14E+11')).toEqual({
      phone: '',
      status: 'invalid',
      reason: 'scientific-notation',
    });
    expect(cleanImportPhone('123').status).toBe('invalid');
    expect(cleanImportPhone('+12345').status).toBe('invalid');
    expect(cleanImportPhone('+1234567890123456').reason).toBe('too-long');
  });
});
