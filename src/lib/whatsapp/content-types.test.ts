import { describe, expect, it } from 'vitest';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_SET,
  normalizeContentType,
} from '@/lib/whatsapp/content-types';

describe('content-types', () => {
  it('exports expected canonical list of content types', () => {
    expect(CONTENT_TYPES).toEqual([
      'text',
      'image',
      'document',
      'audio',
      'video',
      'location',
      'template',
      'interactive',
      'sticker',
      'contacts',
      'unsupported',
    ]);
  });

  it('normalizes valid types correctly', () => {
    expect(normalizeContentType('text')).toBe('text');
    expect(normalizeContentType('sticker')).toBe('sticker');
    expect(normalizeContentType('contacts')).toBe('contacts');
    expect(normalizeContentType('location')).toBe('location');
    expect(normalizeContentType('interactive')).toBe('interactive');
  });

  it("maps Meta's template-button type onto interactive", () => {
    // A quick-reply tap on a template arrives as type 'button', not
    // 'interactive'. Left unmapped it became 'unsupported' and the inbox
    // showed a "not supported" card for a reply we had parsed perfectly.
    expect(normalizeContentType('button')).toBe('interactive');
  });

  it('normalizes unknown or invalid types to unsupported', () => {
    expect(normalizeContentType('poll')).toBe('unsupported');
    expect(normalizeContentType('live_location')).toBe('unsupported');
    expect(normalizeContentType('unknown_xyz')).toBe('unsupported');
    expect(normalizeContentType(null)).toBe('unsupported');
    expect(normalizeContentType(undefined)).toBe('unsupported');
  });

  it('maintains synchronized set', () => {
    for (const ct of CONTENT_TYPES) {
      expect(CONTENT_TYPE_SET.has(ct)).toBe(true);
    }
    expect(CONTENT_TYPE_SET.has('random_type')).toBe(false);
  });
});
