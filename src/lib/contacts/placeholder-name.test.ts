import { describe, expect, it } from 'vitest';

import {
  betterContactName,
  isPlaceholderName,
} from '@/lib/contacts/placeholder-name';

/**
 * These two functions decide whether a coexistence sync is allowed to
 * overwrite a contact's name. Getting `betterContactName` wrong in the
 * permissive direction means an address book silently renaming contacts an
 * agent has already corrected — which is worse than the bug it fixes.
 */
describe('isPlaceholderName', () => {
  it('treats absent and blank names as placeholders', () => {
    expect(isPlaceholderName(null)).toBe(true);
    expect(isPlaceholderName(undefined)).toBe(true);
    expect(isPlaceholderName('')).toBe(true);
    expect(isPlaceholderName('   ')).toBe(true);
  });

  it('treats every shape the phone-number fallbacks produce as a placeholder', () => {
    // These are the exact forms the three fallback paths generate:
    // `name || phone`, `full_name || first_name || phone`, and the raw
    // thread id from a history payload.
    expect(isPlaceholderName('919716747472')).toBe(true);
    expect(isPlaceholderName('+91 97167 47472')).toBe(true);
    expect(isPlaceholderName('(919) 716-7472')).toBe(true);
    expect(isPlaceholderName('+1-650-555-1234')).toBe(true);
  });

  it('treats a real name as a real name', () => {
    expect(isPlaceholderName('Sabzi Wala')).toBe(false);
    expect(isPlaceholderName('Pablo Morales')).toBe(false);
    // A name that merely CONTAINS digits is still a name.
    expect(isPlaceholderName('Shop 42')).toBe(false);
  });

  it('recognises non-Latin scripts as names', () => {
    // This app's contacts are largely Indian and Gulf numbers, so an
    // ASCII-only letter test would classify these as placeholders and let a
    // phone number overwrite them.
    expect(isPlaceholderName('सब्ज़ी वाला')).toBe(false);
    expect(isPlaceholderName('محمد')).toBe(false);
    expect(isPlaceholderName('മലയാളം')).toBe(false);
  });
});

describe('betterContactName', () => {
  it('upgrades a phone-number name to a real one', () => {
    expect(betterContactName('919716747472', 'Sabzi Wala')).toBe('Sabzi Wala');
    expect(betterContactName(null, 'Sabzi Wala')).toBe('Sabzi Wala');
    expect(betterContactName('', 'Sabzi Wala')).toBe('Sabzi Wala');
  });

  it('NEVER replaces one real name with another', () => {
    // The whole safety property. The phone's address book is not more
    // authoritative than a person who typed a name into the CRM.
    expect(betterContactName('Ramesh (accounts)', 'Sabzi Wala')).toBeNull();
  });

  it('returns null when the incoming name is useless', () => {
    expect(betterContactName('919716747472', null)).toBeNull();
    expect(betterContactName('919716747472', '')).toBeNull();
    expect(betterContactName('919716747472', '   ')).toBeNull();
    // Incoming is itself just a number — no better than what is there.
    expect(betterContactName('919716747472', '+91 97167 47472')).toBeNull();
  });

  it('returns null when nothing would change', () => {
    // Lets callers skip the round trip entirely, so re-importing an
    // already-named address book costs zero writes.
    expect(betterContactName('Sabzi Wala', 'Sabzi Wala')).toBeNull();
  });

  it('trims the value it returns', () => {
    expect(betterContactName('919716747472', '  Sabzi Wala  ')).toBe(
      'Sabzi Wala'
    );
  });
});
