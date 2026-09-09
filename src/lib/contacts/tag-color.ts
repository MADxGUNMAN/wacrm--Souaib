/**
 * Detects whether a color hex string represents a green/emerald shade.
 * Used to ensure green tags render with black text for high contrast and legibility.
 */
export function isGreenish(colorStr?: string | null): boolean {
  if (!colorStr) return false;
  const hex = colorStr.trim().replace(/^#/, '');
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
    // Green channel is prominent and exceeds red and blue
    return g > 90 && g >= r * 1.15 && g >= b;
  }
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
    return g > 90 && g >= r * 1.15 && g >= b;
  }
  return false;
}

/**
 * Returns black text (#000000) for green tags, or the original tag color otherwise.
 */
export function getTagTextColor(colorStr?: string | null): string {
  if (isGreenish(colorStr)) {
    return '#000000';
  }
  return colorStr || '#3b82f6';
}
