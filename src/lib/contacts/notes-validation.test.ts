import { describe, it, expect } from 'vitest';
import {
  validateContactNote,
  MAX_NOTE_LENGTH,
} from './notes-validation';

describe('Contact Notes Validation', () => {
  it('rejects non-string inputs', () => {
    expect(validateContactNote(null).isValid).toBe(false);
    expect(validateContactNote(undefined).isValid).toBe(false);
    expect(validateContactNote(123).isValid).toBe(false);
  });

  it('rejects empty or whitespace-only strings', () => {
    const res = validateContactNote('   \n\t  ');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Please enter a note before saving.');
  });

  it('accepts valid note text', () => {
    const text = 'Client requested quote for 10 vans to be delivered by October.';
    const res = validateContactNote(text);
    expect(res.isValid).toBe(true);
    expect(res.error).toBeNull();
    expect(res.cleanText).toBe(text);
    expect(res.charCount).toBe(text.length);
    expect(res.remainingChars).toBe(MAX_NOTE_LENGTH - text.length);
  });

  it('accepts exactly MAX_NOTE_LENGTH characters', () => {
    const text = 'a'.repeat(MAX_NOTE_LENGTH);
    const res = validateContactNote(text);
    expect(res.isValid).toBe(true);
    expect(res.remainingChars).toBe(0);
  });

  it('rejects notes exceeding MAX_NOTE_LENGTH characters', () => {
    const text = 'a'.repeat(MAX_NOTE_LENGTH + 1);
    const res = validateContactNote(text);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain(`cannot exceed ${MAX_NOTE_LENGTH.toLocaleString()} characters`);
    expect(res.remainingChars).toBe(-1);
  });
});
