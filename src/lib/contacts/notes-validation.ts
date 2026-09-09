/**
 * Contact Notes Validation and Limits.
 *
 * Industrial-standard validation rules for CRM contact notes.
 * Enforces character limits, whitespace trimming, and clean error messages.
 */

export const MAX_NOTE_LENGTH = 1000;
export const MIN_NOTE_LENGTH = 1;

export interface NoteValidationResult {
  isValid: boolean;
  error: string | null;
  cleanText: string;
  charCount: number;
  remainingChars: number;
}

/**
 * Validates a contact note string.
 */
export function validateContactNote(rawText: unknown): NoteValidationResult {
  if (typeof rawText !== 'string') {
    return {
      isValid: false,
      error: 'Note must be a text value.',
      cleanText: '',
      charCount: 0,
      remainingChars: MAX_NOTE_LENGTH,
    };
  }

  const cleanText = rawText.trim();
  const charCount = rawText.length;
  const remainingChars = MAX_NOTE_LENGTH - charCount;

  if (cleanText.length < MIN_NOTE_LENGTH) {
    return {
      isValid: false,
      error: 'Please enter a note before saving.',
      cleanText,
      charCount,
      remainingChars,
    };
  }

  if (charCount > MAX_NOTE_LENGTH) {
    return {
      isValid: false,
      error: `Note cannot exceed ${MAX_NOTE_LENGTH.toLocaleString()} characters (currently ${charCount.toLocaleString()}).`,
      cleanText,
      charCount,
      remainingChars,
    };
  }

  return {
    isValid: true,
    error: null,
    cleanText,
    charCount,
    remainingChars,
  };
}
