import { describe, expect, it } from 'vitest';

import {
  describeEmbeddedSignupError,
  extractEmbeddedSignupErrorCode,
  formatEmbeddedSignupError,
} from './embedded-signup-errors';

describe('extractEmbeddedSignupErrorCode', () => {
  it('reads an explicit numeric error_code', () => {
    expect(extractEmbeddedSignupErrorCode({ error_code: 3441042 })).toBe(
      3441042
    );
  });

  it('reads a numeric code that arrived as a string', () => {
    expect(extractEmbeddedSignupErrorCode({ error_code: '2655095' })).toBe(
      2655095
    );
  });

  it('falls back to error_id when error_code is absent', () => {
    expect(extractEmbeddedSignupErrorCode({ error_id: 2494028 })).toBe(2494028);
  });

  /**
   * THE COMMON CASE. Meta frequently sends no dedicated code field at all and
   * only embeds the number in the human-readable message. Reading a single
   * field would have missed most real failures, which is how a permanent
   * rejection kept surfacing as "Connection cancelled or incomplete".
   */
  it('scans the message when no code field is present', () => {
    expect(
      extractEmbeddedSignupErrorCode({
        error_message:
          "This feature isn't available for phone numbers from this region. (3441042)",
      })
    ).toBe(3441042);
  });

  it('ignores a numeric field that is not a code we know', () => {
    expect(extractEmbeddedSignupErrorCode({ error_code: 999999 })).toBeNull();
  });

  it('returns null for a payload with nothing usable', () => {
    expect(
      extractEmbeddedSignupErrorCode({ current_step: 'PHONE' })
    ).toBeNull();
    expect(extractEmbeddedSignupErrorCode(null)).toBeNull();
    expect(extractEmbeddedSignupErrorCode('nope')).toBeNull();
  });
});

describe('describeEmbeddedSignupError', () => {
  it('marks an unsupported region as not retryable', () => {
    const info = describeEmbeddedSignupError({
      payload: { error_code: 3441042 },
    });
    expect(info.family).toBe('eligibility');
    expect(info.retryable).toBe(false);
    expect(info.fix).not.toBe('');
  });

  it('marks a WABA already shared with another provider as not retryable', () => {
    const info = describeEmbeddedSignupError({
      payload: { error_code: 2655093 },
    });
    expect(info.family).toBe('asset_sharing');
    expect(info.retryable).toBe(false);
  });

  it('attributes our own missing business verification to our side', () => {
    const info = describeEmbeddedSignupError({
      payload: { error_code: 2494091 },
    });
    expect(info.family).toBe('our_side');
  });

  it('treats a wrong-portfolio number as retryable, since the operator can reselect', () => {
    const info = describeEmbeddedSignupError({
      payload: { error_code: 3441041 },
    });
    expect(info.retryable).toBe(true);
  });

  it("keeps Meta's own message when the code is unrecognised", () => {
    const info = describeEmbeddedSignupError({
      payload: { error_message: 'Something entirely new went wrong' },
    });
    expect(info.code).toBeNull();
    expect(info.family).toBe('unknown');
    expect(info.message).toBe('Something entirely new went wrong');
    expect(info.retryable).toBe(true);
  });

  it('names the failing step when Meta gave no message at all', () => {
    const info = describeEmbeddedSignupError({
      payload: {},
      currentStep: 'PHONE_NUMBER_SETUP',
    });
    expect(info.message).toContain('PHONE_NUMBER_SETUP');
  });

  it('never returns an empty message', () => {
    const info = describeEmbeddedSignupError({});
    expect(info.message.length).toBeGreaterThan(0);
  });
});

describe('formatEmbeddedSignupError', () => {
  it('joins the message and the fix', () => {
    const line = formatEmbeddedSignupError(
      describeEmbeddedSignupError({ payload: { error_code: 2655095 } })
    );
    expect(line).toContain('WhatsApp Business app');
    expect(line).toContain('7 days');
  });

  it('omits the separator when there is no fix', () => {
    const line = formatEmbeddedSignupError({
      code: null,
      family: 'unknown',
      message: 'Closed early.',
      fix: '',
      retryable: true,
    });
    expect(line).toBe('Closed early.');
  });
});
