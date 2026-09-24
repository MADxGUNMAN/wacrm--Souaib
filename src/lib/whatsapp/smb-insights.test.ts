import { describe, expect, it } from 'vitest';

import {
  isSmbBusinessTypeError,
  isTemplateInsightsDisabledError,
  MetaApiError,
  SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
} from './meta-api';

function metaError(fields: {
  message?: string;
  code?: number | null;
  subcode?: number | null;
  userMessage?: string | null;
  details?: string | null;
}): MetaApiError {
  return new MetaApiError({
    message: fields.message ?? 'Meta API error',
    code: fields.code ?? null,
    subcode: fields.subcode ?? null,
    details: fields.details ?? null,
    userMessage: fields.userMessage ?? null,
    userTitle: null,
    type: 'OAuthException',
    fbtraceId: 'trace',
    httpStatus: 400,
  });
}

describe('isSmbBusinessTypeError', () => {
  /**
   * The verbatim refusal Meta returns for a Coexistence number. Confirmed
   * against both Coexistence WABAs on this installation, while all three pure
   * Cloud API WABAs report insights enabled.
   */
  it('recognises Meta\u2019s SMB refusal', () => {
    expect(
      isSmbBusinessTypeError(
        metaError({
          code: 10,
          message: 'This operation can not be performed on SMB business type',
        })
      )
    ).toBe(true);
  });

  it('recognises it from error_user_msg', () => {
    expect(
      isSmbBusinessTypeError(
        metaError({
          code: 10,
          message: 'Application does not have permission for this action',
          userMessage:
            'This operation can not be performed on SMB business type.',
        })
      )
    ).toBe(true);
  });

  it('matches regardless of spacing and case', () => {
    expect(
      isSmbBusinessTypeError(
        metaError({ message: 'cannot be performed on smb  businesstype' })
      )
    ).toBe(true);
  });

  /**
   * Code 10 is Meta's generic "permission denied", shared by refusals that
   * have nothing to do with Coexistence. Matching on the code alone would
   * mislabel those as a permanent connection-type limit and hide a fixable
   * permission problem.
   */
  it('does not match an unrelated code 10', () => {
    expect(
      isSmbBusinessTypeError(
        metaError({
          code: 10,
          message: 'Application does not have permission for this action',
        })
      )
    ).toBe(false);
  });

  it('does not match the "insights not enabled" refusal', () => {
    // That one IS fixable and must keep rendering the Enable button.
    expect(
      isSmbBusinessTypeError(
        metaError({
          code: 200005,
          subcode: 4182002,
          message:
            'Template Insights are not available yet for this WhatsApp Business account',
        })
      )
    ).toBe(false);
  });

  it('handles plain errors and non-errors without throwing', () => {
    expect(isSmbBusinessTypeError(new Error('SMB business type'))).toBe(true);
    expect(isSmbBusinessTypeError(new Error('network down'))).toBe(false);
    expect(isSmbBusinessTypeError(null)).toBe(false);
    expect(isSmbBusinessTypeError('SMB business type')).toBe(false);
  });
});

describe('the two refusals stay distinct', () => {
  /**
   * They drive opposite UI — one offers an Enable button, the other must not —
   * so a payload matching both would be a bug.
   */
  it('SMB refusal is not classified as merely disabled', () => {
    const smb = metaError({
      code: 10,
      message: 'This operation can not be performed on SMB business type',
    });
    expect(isSmbBusinessTypeError(smb)).toBe(true);
    expect(isTemplateInsightsDisabledError(smb)).toBe(false);
  });

  it('disabled refusal is not classified as SMB', () => {
    const disabled = metaError({
      code: 1,
      message: 'API Unknown',
      userMessage:
        'Template insights have not been enabled for this WhatsApp Business account.',
    });
    expect(isTemplateInsightsDisabledError(disabled)).toBe(true);
    expect(isSmbBusinessTypeError(disabled)).toBe(false);
  });
});

describe('SMB_INSIGHTS_UNSUPPORTED_MESSAGE', () => {
  it('says it is permanent rather than a setting', () => {
    expect(SMB_INSIGHTS_UNSUPPORTED_MESSAGE).toMatch(/permanent/i);
  });

  /**
   * "Not supported" on its own reads as a dead end. The data does exist, in
   * two other places, and the message has to name them.
   */
  it('points at the places the numbers are still available', () => {
    expect(SMB_INSIGHTS_UNSUPPORTED_MESSAGE).toMatch(/Broadcasts/);
    expect(SMB_INSIGHTS_UNSUPPORTED_MESSAGE).toMatch(
      /WhatsApp Business app on your phone/i
    );
  });
});
