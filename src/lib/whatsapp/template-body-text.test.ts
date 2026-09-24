import { describe, expect, it } from 'vitest';

import { interpolateTemplateBody } from './template-body-text';

/**
 * This renders what gets STORED as a broadcast message's text — the chat
 * bubble and the conversation preview line. An off-by-one here would
 * silently shift every value in every stored campaign message, and it
 * would look like a data-entry mistake rather than a code bug.
 */
describe('interpolateTemplateBody', () => {
  it('is 1-indexed, matching Meta placeholder numbering', () => {
    // {{1}} takes params[0]. Getting this backwards is the single most
    // damaging possible error in this function.
    expect(
      interpolateTemplateBody('Hi {{1}}, order {{2}}', ['Jane', 'A-99'])
    ).toBe('Hi Jane, order A-99');
  });

  it('substitutes the same placeholder everywhere it appears', () => {
    expect(interpolateTemplateBody('{{1}} — thanks, {{1}}!', ['Sam'])).toBe(
      'Sam — thanks, Sam!'
    );
  });

  it('handles double-digit placeholders', () => {
    const params = Array.from({ length: 10 }, (_, i) => `v${i + 1}`);
    expect(interpolateTemplateBody('{{9}} then {{10}}', params)).toBe(
      'v9 then v10'
    );
  });

  it('leaves an unsupplied placeholder visible rather than blanking it', () => {
    // "Hi , your order shipped" reads as a bug in the message the customer
    // received. Leaving {{2}} shows the value is unknown to US, which is
    // the truth.
    expect(interpolateTemplateBody('Hi {{1}}, order {{2}}', ['Jane'])).toBe(
      'Hi Jane, order {{2}}'
    );
  });

  it('treats an empty-string value as unsupplied', () => {
    expect(interpolateTemplateBody('Hi {{1}}', [''])).toBe('Hi {{1}}');
  });

  it('returns null for an absent or blank body so the caller can fall back', () => {
    // Storing '' would render as an empty chat bubble; null lets the
    // caller substitute a template-name placeholder instead.
    expect(interpolateTemplateBody(null)).toBeNull();
    expect(interpolateTemplateBody(undefined)).toBeNull();
    expect(interpolateTemplateBody('')).toBeNull();
    expect(interpolateTemplateBody('   ')).toBeNull();
  });

  it('returns a body with no placeholders unchanged', () => {
    expect(interpolateTemplateBody('Your order has shipped.', [])).toBe(
      'Your order has shipped.'
    );
  });

  it('ignores extra params beyond the placeholders present', () => {
    expect(interpolateTemplateBody('Hi {{1}}', ['Jane', 'unused'])).toBe(
      'Hi Jane'
    );
  });

  it('does not treat {{0}} as an index into params', () => {
    // Meta numbers from 1, so {{0}} is not a valid placeholder; mapping it
    // to params[-1] would be meaningless.
    expect(interpolateTemplateBody('{{0}} and {{1}}', ['first'])).toBe(
      '{{0}} and first'
    );
  });

  it('leaves non-numeric (named) placeholders alone', () => {
    // NAMED templates are sent with a keyed body, not a positional array,
    // so this function must not try to fill them.
    expect(interpolateTemplateBody('Hi {{name}}', ['Jane'])).toBe(
      'Hi {{name}}'
    );
  });

  it('inserts a value containing regex-special characters literally', () => {
    // `$&` in a replacement string means "the whole match" — a value
    // carrying it would corrupt the output if passed as a raw pattern.
    expect(interpolateTemplateBody('Code: {{1}}', ['$& 50% off'])).toBe(
      'Code: $& 50% off'
    );
  });
});
