import { describe, expect, it } from 'vitest';
import { EMOJI_CATEGORIES, searchEmojis } from './emoji-data';

describe('emoji-data and searchEmojis', () => {
  it('loads all standard emoji categories', () => {
    expect(EMOJI_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    for (const cat of EMOJI_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.emojis.length).toBeGreaterThan(0);
    }
  });

  it('searches emojis by name', () => {
    const results = searchEmojis('grinning');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((e) => e.emoji === '😀')).toBe(true);
  });

  it('searches emojis by keyword', () => {
    const heartResults = searchEmojis('heart');
    expect(heartResults.length).toBeGreaterThan(0);
    expect(heartResults.some((e) => e.emoji === '❤️')).toBe(true);

    const fireResults = searchEmojis('lit');
    expect(fireResults.length).toBeGreaterThan(0);
    expect(fireResults.some((e) => e.emoji === '🔥')).toBe(true);
  });

  it('performs case-insensitive search', () => {
    const lower = searchEmojis('coffee');
    const upper = searchEmojis('COFFEE');
    expect(lower).toEqual(upper);
    expect(lower.some((e) => e.emoji === '☕')).toBe(true);
  });

  it('returns empty array for whitespace or empty query', () => {
    expect(searchEmojis('')).toEqual([]);
    expect(searchEmojis('   ')).toEqual([]);
  });
});
