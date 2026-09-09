import { describe, it, expect } from 'vitest';
import { isGreenish, getTagTextColor } from './tag-color';

describe('tag-color', () => {
  it('identifies green and emerald colors correctly', () => {
    // Preset emerald
    expect(isGreenish('#10b981')).toBe(true);
    // Standard greens
    expect(isGreenish('#22c55e')).toBe(true);
    expect(isGreenish('#16a34a')).toBe(true);
    expect(isGreenish('#15803d')).toBe(true);
    expect(isGreenish('#059669')).toBe(true);
    // 3-char hex green
    expect(isGreenish('#0f0')).toBe(true);
  });

  it('rejects non-green colors', () => {
    // Preset blue, red, pink, violet, amber, orange, cyan
    expect(isGreenish('#3b82f6')).toBe(false); // blue
    expect(isGreenish('#ef4444')).toBe(false); // red
    expect(isGreenish('#ec4899')).toBe(false); // pink
    expect(isGreenish('#8b5cf6')).toBe(false); // violet
    expect(isGreenish('#f59e0b')).toBe(false); // amber
    expect(isGreenish('#f97316')).toBe(false); // orange
    expect(isGreenish('#06b6d4')).toBe(false); // cyan
    expect(isGreenish(null)).toBe(false);
    expect(isGreenish('')).toBe(false);
  });

  it('returns black text color for green tags and original color for others', () => {
    expect(getTagTextColor('#10b981')).toBe('#000000');
    expect(getTagTextColor('#22c55e')).toBe('#000000');
    expect(getTagTextColor('#3b82f6')).toBe('#3b82f6');
    expect(getTagTextColor('#ef4444')).toBe('#ef4444');
    expect(getTagTextColor(null)).toBe('#3b82f6');
  });
});
