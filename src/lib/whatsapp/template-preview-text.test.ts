import { describe, expect, it } from 'vitest';

import {
  buildPreviewSegments,
  positionalValues,
} from './template-preview-text';

/** Collapse segments to a readable shape for assertions. */
function plain(text: string, values?: Record<string, string | undefined>) {
  return buildPreviewSegments(text, values)
    .map((s) => {
      const marks = [
        s.bold && 'b',
        s.italic && 'i',
        s.strike && 's',
        s.mono && 'm',
        s.placeholder && 'p',
      ]
        .filter(Boolean)
        .join('');
      return marks ? `${s.text}[${marks}]` : s.text;
    })
    .join('|');
}

describe('buildPreviewSegments — formatting', () => {
  it('returns nothing for empty text', () => {
    expect(buildPreviewSegments('')).toEqual([]);
  });

  it('leaves plain text as one segment', () => {
    expect(plain('Hello there')).toBe('Hello there');
  });

  it('parses bold, italic and strikethrough', () => {
    expect(plain('a *bold* b')).toBe('a |bold[b]| b');
    expect(plain('a _it_ b')).toBe('a |it[i]| b');
    expect(plain('a ~st~ b')).toBe('a |st[s]| b');
  });

  it('parses monospace before treating the backticks as text', () => {
    expect(plain('run ```npm test``` now')).toBe('run |npm test[m]| now');
  });

  it('nests styles', () => {
    expect(plain('*_both_*')).toBe('both[bi]');
  });

  /**
   * The important negative case. WhatsApp treats a lone marker as
   * literal, so "2 * 3" must not silently turn the rest of the message
   * bold — an operator typing arithmetic or a footnote asterisk should
   * see exactly what they typed.
   */
  it('treats an unmatched marker as literal text', () => {
    expect(plain('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(plain('a_b')).toBe('a_b');
  });

  it('treats an empty marker pair as literal', () => {
    expect(plain('**')).toBe('**');
  });

  it('keeps newlines intact for whitespace-pre-wrap rendering', () => {
    expect(plain('one\ntwo')).toBe('one\ntwo');
  });
});

describe('buildPreviewSegments — variables', () => {
  it('substitutes a supplied value', () => {
    expect(plain('Hi {{1}}!', { '1': 'Souaib' })).toBe('Hi |Souaib|!');
  });

  it('marks an unsupplied variable as a placeholder, keeping its name', () => {
    expect(plain('Hi {{1}} and {{2}}', { '1': 'A' })).toBe(
      'Hi |A| and |{{2}}[p]',
    );
  });

  it('treats an empty string as unsupplied', () => {
    // Otherwise a cleared sample field would render as a gap in the
    // sentence with no indication anything was missing.
    expect(plain('Hi {{1}}', { '1': '' })).toBe('Hi |{{1}}[p]');
  });

  it('supports named parameters', () => {
    expect(plain('Order {{order_id}}', { order_id: 'A-12' })).toBe(
      'Order |A-12',
    );
  });

  it('tolerates whitespace inside the braces', () => {
    expect(plain('Hi {{ 1 }}', { '1': 'X' })).toBe('Hi |X');
  });

  it('substitutes every occurrence of a repeated variable', () => {
    expect(plain('{{1}} and {{1}}', { '1': 'X' })).toBe('X| and |X');
  });

  it('carries the surrounding style onto the substituted value', () => {
    expect(plain('*Hi {{1}}*', { '1': 'Souaib' })).toBe('Hi [b]|Souaib[b]');
  });

  it('marks a placeholder that sits inside a styled run', () => {
    expect(plain('*Hi {{1}}*')).toBe('Hi [b]|{{1}}[bp]');
  });
});

describe('positionalValues', () => {
  it('maps an array onto 1-based keys', () => {
    expect(positionalValues(['a', 'b'])).toEqual({ '1': 'a', '2': 'b' });
  });

  it('keeps holes as undefined so they render as placeholders', () => {
    expect(positionalValues([undefined, 'b'])).toEqual({
      '1': undefined,
      '2': 'b',
    });
  });

  it('returns an empty map for no samples', () => {
    expect(positionalValues([])).toEqual({});
  });
});
