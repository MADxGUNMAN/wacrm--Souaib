// ============================================================
// Pins the decisions that make opt-out enforcement correct rather than
// merely present. Each block below exists because getting it wrong has a
// specific, real consequence:
//
//   * matching too loosely unsubscribes customers who never asked
//   * matching too strictly ignores customers who did ask
//   * getting the category default backwards sends marketing to people
//     who opted out
//   * failing to spot Meta's 131050 means rediscovering every
//     platform-level opt-out one wasted send at a time
//
// Pure functions only — no Supabase mocking. The DB helpers are
// integration surface and are covered by the send-path behaviour instead.
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_OPT_IN_RESPONSE,
  DEFAULT_OPT_OUT_RESPONSE,
  MARKETING_OPT_OUT_SOURCES,
  META_MARKETING_OPT_OUT_CODE,
  extractMetaErrorCode,
  isMarketingCategory,
  isTemplateCategoryKnown,
  marketingSuppressionReason,
  isMetaMarketingOptOutError,
  matchesKeyword,
  normalizeInboundText,
  normalizeKeyword,
  normalizeKeywordList,
  toOptInOutConfig,
} from './marketing-opt-out';
import { MetaApiError } from './meta-api';

describe('normalizeKeyword', () => {
  it('trims and upper-cases to the canonical stored form', () => {
    expect(normalizeKeyword('  stop ')).toBe('STOP');
    expect(normalizeKeyword('Unsubscribe')).toBe('UNSUBSCRIBE');
  });
});

describe('normalizeKeywordList', () => {
  it('drops blanks and de-duplicates case-insensitively', () => {
    expect(normalizeKeywordList(['stop', 'STOP', ' ', 'Stop', 'quit'])).toEqual(
      ['STOP', 'QUIT']
    );
  });

  it('preserves first-seen order so the UI list is stable', () => {
    expect(normalizeKeywordList(['quit', 'stop'])).toEqual(['QUIT', 'STOP']);
  });
});

describe('normalizeInboundText', () => {
  it('strips surrounding punctuation, quotes and whitespace', () => {
    expect(normalizeInboundText('  STOP. ')).toBe('STOP');
    expect(normalizeInboundText('"stop"')).toBe('STOP');
    expect(normalizeInboundText('*Stop!*')).toBe('STOP');
  });

  it('leaves inner characters alone, so two words never merge into one', () => {
    // If inner punctuation were stripped, "stop.by" would collapse to
    // "STOPBY" — harmless — but "un-subscribe" would become
    // "UNSUBSCRIBE" and silently opt the customer out.
    expect(normalizeInboundText('un-subscribe')).toBe('UN-SUBSCRIBE');
    expect(normalizeInboundText('stop by tomorrow')).toBe('STOP BY TOMORROW');
  });
});

describe('matchesKeyword', () => {
  const optOut = ['STOP', 'UNSUBSCRIBE'];

  it('matches regardless of case, padding or trailing punctuation', () => {
    for (const text of ['STOP', 'stop', ' Stop ', 'STOP.', '"stop"']) {
      expect(matchesKeyword(text, optOut)).toBe(true);
    }
  });

  it('does NOT match a keyword embedded in a sentence', () => {
    // The whole reason this is not built on the `keyword_match`
    // automation trigger, whose `contains` mode would opt all of these
    // customers out against their wishes.
    for (const text of [
      'stop by tomorrow',
      "please don't stop sending these",
      'nonstop',
      'I want to unsubscribe from the other one',
    ]) {
      expect(matchesKeyword(text, optOut)).toBe(false);
    }
  });

  it('handles empty and missing input without matching', () => {
    expect(matchesKeyword('', optOut)).toBe(false);
    expect(matchesKeyword(null, optOut)).toBe(false);
    expect(matchesKeyword(undefined, optOut)).toBe(false);
    expect(matchesKeyword('...', optOut)).toBe(false);
  });

  it('matches nothing when the keyword list is empty', () => {
    expect(matchesKeyword('STOP', [])).toBe(false);
  });

  it('tolerates un-normalized keywords from the caller', () => {
    expect(matchesKeyword('STOP', [' stop '])).toBe(true);
  });
});

describe('isMarketingCategory', () => {
  it('treats Marketing as marketing in either casing', () => {
    // The DB column is TitleCase; Meta's API uses UPPERCASE. Both reach
    // this function.
    expect(isMarketingCategory('Marketing')).toBe(true);
    expect(isMarketingCategory('MARKETING')).toBe(true);
  });

  it('lets utility and authentication through', () => {
    expect(isMarketingCategory('Utility')).toBe(false);
    expect(isMarketingCategory('Authentication')).toBe(false);
  });

  it('FAILS CLOSED on an unknown category', () => {
    // Reachable state: a template that exists at Meta but was never
    // synced locally, so templateRow is null and the category is
    // unknowable. Suppressing is the safe direction — it only ever
    // affects contacts who explicitly opted out.
    expect(isMarketingCategory(null)).toBe(true);
    expect(isMarketingCategory(undefined)).toBe(true);
    expect(isMarketingCategory('')).toBe(true);
  });
});

describe('suppression reason wording', () => {
  it('distinguishes a real marketing template from an unsynced one', () => {
    // Both are withheld, but the fixes differ: the first is the feature
    // working, the second is fixed by "Sync from Meta". Telling an operator
    // their utility template "is marketing" sends them to the wrong place.
    expect(isTemplateCategoryKnown('Utility')).toBe(true);
    expect(isTemplateCategoryKnown(null)).toBe(false);
    expect(isTemplateCategoryKnown('   ')).toBe(false);

    expect(marketingSuppressionReason('Marketing')).not.toMatch(
      /Sync from Meta/
    );
    expect(marketingSuppressionReason(null)).toMatch(/Sync from Meta/);
  });
});

describe('MARKETING_OPT_OUT_SOURCES', () => {
  it('matches the values the source CHECK constraint allows', () => {
    // Pinned because the reporting layer tallies each one; a value added to
    // the migration but not here would silently report zero.
    expect([...MARKETING_OPT_OUT_SOURCES]).toEqual([
      'customer_keyword',
      'customer_button',
      'meta_131050',
      'agent',
      'api',
      'import',
    ]);
  });
});

describe('extractMetaErrorCode', () => {
  it('reads the code structurally off a MetaApiError', () => {
    const err = new MetaApiError({
      message: 'Recipient has opted out',
      code: META_MARKETING_OPT_OUT_CODE,
      httpStatus: 400,
    });
    expect(extractMetaErrorCode(err)).toBe(META_MARKETING_OPT_OUT_CODE);
    expect(isMetaMarketingOptOutError(err)).toBe(true);
  });

  it('falls back to the message when the code was flattened to text', () => {
    // The broadcast loops catch `error.message`, so by the time an error
    // reaches some call sites the object is gone.
    expect(extractMetaErrorCode(new Error('failed (#131050)'))).toBe(131050);
    expect(extractMetaErrorCode('code: 131050')).toBe(131050);
    expect(isMetaMarketingOptOutError('Meta error 131050 blah')).toBe(true);
  });

  it('does not confuse a different Meta error for an opt-out', () => {
    expect(isMetaMarketingOptOutError(new Error('failed (#131047)'))).toBe(
      false
    );
    expect(isMetaMarketingOptOutError(new Error('no code here'))).toBe(false);
    expect(isMetaMarketingOptOutError(null)).toBe(false);
  });
});

describe('toOptInOutConfig', () => {
  it('returns usable defaults when the account has no row', () => {
    const config = toOptInOutConfig(null);
    expect(config.isActive).toBe(true);
    expect(config.optOutKeywords).toEqual(['STOP']);
    expect(config.optInKeywords).toEqual(['START']);
    expect(config.optOutResponseMessage).toBe(DEFAULT_OPT_OUT_RESPONSE);
    expect(config.optInResponseMessage).toBe(DEFAULT_OPT_IN_RESPONSE);
  });

  it('normalizes stored keywords to UPPERCASE', () => {
    const config = toOptInOutConfig({
      opt_out_keywords: ['stop', 'quit'],
      opt_in_keywords: ['start'],
    });
    expect(config.optOutKeywords).toEqual(['STOP', 'QUIT']);
    expect(config.optInKeywords).toEqual(['START']);
  });

  it('never leaves an account with no way to opt out', () => {
    // The DB constraint forbids an empty list on write, but a row
    // predating it — or one edited by hand — must not silently remove
    // the customer's escape hatch.
    expect(toOptInOutConfig({ opt_out_keywords: [] }).optOutKeywords).toEqual([
      'STOP',
    ]);
  });

  it('preserves an intentionally empty opt-IN list', () => {
    // Accepting opt-outs without offering keyword re-subscription is a
    // valid configuration, so this one is not back-filled.
    expect(toOptInOutConfig({ opt_in_keywords: [] }).optInKeywords).toEqual([]);
  });

  it('falls back to default wording for blank response messages', () => {
    const config = toOptInOutConfig({
      opt_out_response_message: '   ',
      opt_in_response_message: '',
    });
    expect(config.optOutResponseMessage).toBe(DEFAULT_OPT_OUT_RESPONSE);
    expect(config.optInResponseMessage).toBe(DEFAULT_OPT_IN_RESPONSE);
  });

  it('carries is_active through, including false', () => {
    // is_active gates CAPTURE only. Enforcement never reads it, so a
    // false value here must not be mistaken for "opt-outs released".
    expect(toOptInOutConfig({ is_active: false }).isActive).toBe(false);
  });
});
