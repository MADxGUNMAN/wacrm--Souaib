import { describe, expect, it } from 'vitest';

import { parseNameStatus } from './limits';
import { explainMetaSendError } from './meta-send-errors';

describe('parseNameStatus', () => {
  /**
   * THE GAP. `NON_EXISTS` is what Meta returns for a number with no display
   * name record at all, and it was missing from the switch — so it fell
   * through to `unknown` and the Display name tile rendered a bare em dash
   * with no explanation, on a number that could not send a single message.
   *
   * The operator's first warning was Meta refusing the send with 131037,
   * which is precisely what that tile exists to pre-empt.
   */
  it('maps NON_EXISTS to "not submitted" rather than unknown', () => {
    const review = parseNameStatus('NON_EXISTS');
    expect(review.state).toBe('none');
    expect(review.label).toBe('Not submitted');
    expect(review.detail).toBeTruthy();
  });

  it('says that sending is blocked, not merely that nothing was submitted', () => {
    // "Not submitted" alone reads as a nice-to-have. On a WhatsApp-provided
    // number it is a hard block on every send.
    expect(parseNameStatus('NON_EXISTS').detail).toMatch(/blocks sending/i);
  });

  it('names where to fix it', () => {
    expect(parseNameStatus('NON_EXISTS').detail).toMatch(/WhatsApp Manager/);
  });

  it('still treats NONE as not submitted', () => {
    expect(parseNameStatus('NONE').state).toBe('none');
  });

  it('keeps the approved states approved', () => {
    expect(parseNameStatus('APPROVED').state).toBe('approved');
    expect(parseNameStatus('AVAILABLE_WITHOUT_REVIEW').state).toBe('approved');
  });

  it('keeps pending, declined and expired distinct', () => {
    expect(parseNameStatus('PENDING_REVIEW').state).toBe('pending');
    expect(parseNameStatus('DECLINED').state).toBe('declined');
    expect(parseNameStatus('EXPIRED').state).toBe('expired');
  });

  it('is case and whitespace tolerant', () => {
    expect(parseNameStatus('  non_exists  ').state).toBe('none');
  });

  it('falls back to unknown for a value Meta has not documented', () => {
    // Deliberate: inventing a state for an unrecognised value would be a
    // confident lie about an account's ability to send.
    expect(parseNameStatus('SOMETHING_NEW').state).toBe('unknown');
    expect(parseNameStatus(null).state).toBe('unknown');
    expect(parseNameStatus(undefined).state).toBe('unknown');
  });
});

describe('explainMetaSendError for 131037', () => {
  /**
   * The verbatim text Meta returned on the failed sends, so the code is
   * extracted from the same shape the app actually stores.
   */
  const RAW =
    'WhatsApp provided number needs display name approval before message can be sent. (Meta error 131037)';

  it('explains the display-name block and is not retryable', () => {
    const explained = explainMetaSendError(RAW);
    expect(explained).not.toBeNull();
    expect(explained?.code).toBe(131037);
    expect(explained?.retryable).toBe(false);
  });

  /**
   * Meta's own text ("WhatsApp provided number needs display name approval
   * before message can be sent") states the cause and stops there. Retrying
   * cannot help, so the explanation has to carry the actual next step.
   */
  it('names the screen to fix it on', () => {
    expect(explainMetaSendError(RAW)?.message).toMatch(/WhatsApp Manager/);
    expect(explainMetaSendError(RAW)?.message).toMatch(/Display name/i);
  });

  it('calls out the test-number case specifically', () => {
    // A +1 555 number can never be used for real customers, so telling
    // someone to wait for a review they cannot pass would waste days.
    expect(explainMetaSendError(RAW)?.message).toMatch(/555/);
  });

  it('still recognises the code in a bare parenthesised form', () => {
    expect(explainMetaSendError('(#131037)')?.code).toBe(131037);
  });
});
