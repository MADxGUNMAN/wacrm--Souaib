import { describe, expect, it } from 'vitest';
import { replaiRuleStateKeys } from '../src/rules.js';

/*
  Which document properties a reset deletes.

  Worth testing precisely because the operation is irreversible and
  reaches a shared resource: rules live only in the spreadsheet, there is
  no server copy, and a spreadsheet may carry properties belonging to
  other add-ons entirely. The two failure modes are symmetric and both
  bad — deleting a stranger's data, or telling the user everything was
  wiped while leaving orphans behind.

  Only the pure key selection is covered here. The deletion itself needs
  DocumentProperties and is exercised by hand in a real sheet, matching
  how the rest of the store is tested.
*/
describe('replaiRuleStateKeys', () => {
  it('selects the rule index, the settings blob and every rule', () => {
    const keys = replaiRuleStateKeys([
      'replai.ruleIndex.v1',
      'replai.settings.v1',
      'replai.rule.r1a2b3c4',
      'replai.rule.r9z8y7x6',
    ]);

    expect(keys.sort()).toEqual(
      [
        'replai.ruleIndex.v1',
        'replai.settings.v1',
        'replai.rule.r1a2b3c4',
        'replai.rule.r9z8y7x6',
      ].sort()
    );
  });

  it('leaves other add-ons\u2019 properties alone', () => {
    // The whole reason this is an allowlist by prefix rather than a
    // "clear everything" call on DocumentProperties.
    const keys = replaiRuleStateKeys([
      'replai.rule.r1',
      'someOtherAddon.config',
      'mailmerge.template',
      'REPLAI.rule.r2', // wrong case is a different namespace
      'notreplai.rule.r3',
    ]);

    expect(keys).toEqual(['replai.rule.r1']);
  });

  it('catches an orphaned rule whose id fell out of the index', () => {
    // ReplaiRules.list() self-heals by dropping unreadable ids from the
    // index, which leaves the rule property behind. A reset driven by the
    // index alone would walk straight past this one and leave junk in a
    // spreadsheet the user was told had been cleared.
    const keys = replaiRuleStateKeys([
      'replai.ruleIndex.v1',
      'replai.rule.rOrphaned',
    ]);

    expect(keys).toContain('replai.rule.rOrphaned');
  });

  it('does not touch user-scoped keys that live elsewhere', () => {
    // The API key and the trigger bookkeeping are in UserProperties, not
    // DocumentProperties. Listing them here would be harmless but
    // misleading about where they are cleared.
    const keys = replaiRuleStateKeys([
      'replai.apiKey',
      'replai.triggerRanAt',
      'replai.sweepTrigger.abc',
      'replai.sweepMode.abc',
      'replai.dailyHour',
    ]);

    expect(keys).toEqual([]);
  });

  it('handles an empty or absent property set', () => {
    expect(replaiRuleStateKeys([])).toEqual([]);
    expect(replaiRuleStateKeys(undefined)).toEqual([]);
    expect(replaiRuleStateKeys(null)).toEqual([]);
  });

  it('ignores non-string keys rather than throwing', () => {
    // getProperties() should only ever yield string keys; this is here so
    // a malformed input degrades instead of taking the reset down
    // half-finished.
    expect(
      replaiRuleStateKeys([null, 42, undefined, 'replai.rule.r1'])
    ).toEqual(['replai.rule.r1']);
  });

  it('does not match the rule prefix appearing later in a key', () => {
    expect(replaiRuleStateKeys(['x.replai.rule.r1'])).toEqual([]);
  });
});
