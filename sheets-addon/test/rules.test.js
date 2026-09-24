import { beforeAll, describe, expect, it } from 'vitest';
import { ReplaiDates } from '../src/dates.js';
import { ReplaiConditions } from '../src/conditions.js';
import { ReplaiSchedule } from '../src/schedule.js';
import { ReplaiRuleSchema } from '../src/rules.js';

/*
  Rule validation. This is the last gate before a rule is stored, and a
  rule that stores half-configured is worse than one that is rejected —
  it looks finished in the sidebar and then quietly fails to send, or
  sends with the wrong variable in the message.

  Only the pure half of rules.js is covered here. The store itself needs
  DocumentProperties and is exercised by hand in a real sheet.
*/
beforeAll(() => {
  globalThis.ReplaiDates = ReplaiDates;
  globalThis.ReplaiConditions = ReplaiConditions;
  // Apps Script shares one global scope, so rules.js reaches this
  // directly. A reminder rule's schedule is normalised and validated
  // through it — see schedule.js.
  globalThis.ReplaiSchedule = ReplaiSchedule;
});

/** A rule that should validate cleanly; each test breaks one thing. */
function validDraft(overrides) {
  return Object.assign(
    {
      name: 'Delivery reminder',
      sheetName: 'Sheet1',
      triggerType: 'reminder',
      conditions: [
        { column: 'Status', operator: 'equals', value: 'Pass' },
        { column: 'Delivery Date', operator: 'date_in_days', value: '2' },
      ],
      campaign: {
        id: 'camp-1',
        name: 'Order confirmations',
        templateName: 'order_confirmation',
        templateLanguage: 'en_US',
        variableCount: 2,
        mediaRequired: false,
      },
      phoneColumn: 'Whatsapp',
      nameColumn: 'Name',
      countryCode: '+91',
      variables: [
        { source: 'column', column: 'Delivery id', value: '' },
        { source: 'literal', column: '', value: '2 Days' },
      ],
      media: { type: 'none', source: 'url', column: '', url: '' },
    },
    overrides || {}
  );
}

describe('a complete rule', () => {
  it('validates', () => {
    const result = ReplaiRuleSchema.validate(validDraft());
    expect(result.errors).toEqual({});
    expect(result.ok).toBe(true);
  });

  it('is stamped with the current schema version', () => {
    const result = ReplaiRuleSchema.validate(validDraft());
    expect(result.rule.schemaVersion).toBe(ReplaiRuleSchema.VERSION);
  });
});

describe('step 1 — basic setup', () => {
  it('needs a name', () => {
    const result = ReplaiRuleSchema.validate(validDraft({ name: '   ' }));
    expect(result.ok).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it('caps a very long name rather than rejecting it', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({ name: 'x'.repeat(200) })
    );
    expect(result.rule.name).toHaveLength(ReplaiRuleSchema.NAME_MAX);
    expect(result.ok).toBe(true);
  });

  it('needs a target sheet', () => {
    const result = ReplaiRuleSchema.validate(validDraft({ sheetName: '' }));
    expect(result.errors.sheetName).toBeTruthy();
  });

  it('needs a known trigger type', () => {
    expect(
      ReplaiRuleSchema.validate(validDraft({ triggerType: '' })).errors
        .triggerType
    ).toBeTruthy();
    expect(
      ReplaiRuleSchema.validate(validDraft({ triggerType: 'whenever' })).errors
        .triggerType
    ).toBeTruthy();
  });
});

describe('conditions', () => {
  it('allows New Row Added with no conditions — "every new row"', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({ triggerType: 'new_row', conditions: [] })
    );
    expect(result.errors).toEqual({});
    expect(result.ok).toBe(true);
  });

  it('requires a condition for On Change and reminders', () => {
    // Without one, the rule would match every row in the sheet, which is
    // never what someone meant to build.
    ['on_change', 'reminder'].forEach((triggerType) => {
      const result = ReplaiRuleSchema.validate(
        validDraft({ triggerType, conditions: [] })
      );
      expect(result.errors.conditionsMissing).toBeTruthy();
    });
  });

  it('rejects a condition with no column', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [{ column: '', operator: 'equals', value: 'Pass' }],
      })
    );
    expect(result.errors.conditions[0]).toBeTruthy();
  });

  it('rejects an unknown operator', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [{ column: 'Status', operator: 'vibes', value: 'Pass' }],
      })
    );
    expect(result.errors.conditions[0]).toBeTruthy();
  });

  it('requires a value when the operator compares against one', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [{ column: 'Status', operator: 'equals', value: '' }],
      })
    );
    expect(result.errors.conditions[0]).toBeTruthy();
  });

  it('requires no value for is_empty, and drops any stale one', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [
          { column: 'Status', operator: 'is_empty', value: 'left over' },
        ],
      })
    );
    expect(result.errors.conditions).toBeUndefined();
    // A stale value would reappear in the wizard on edit and read as
    // meaningful when it is ignored.
    expect(result.rule.conditions[0].value).toBe('');
  });

  it('requires a whole number of days for the offset operators', () => {
    const bad = ['x', '-2', '1.5', ''];
    bad.forEach((value) => {
      const result = ReplaiRuleSchema.validate(
        validDraft({
          conditions: [
            { column: 'Delivery Date', operator: 'date_in_days', value },
          ],
        })
      );
      expect(result.errors.conditions[0]).toBeTruthy();
    });

    const good = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [
          { column: 'Delivery Date', operator: 'date_in_days', value: '0' },
        ],
      })
    );
    expect(good.errors.conditions).toBeUndefined();
  });

  it('requires a number for the numeric operators', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [
          { column: 'Price', operator: 'greater_than', value: 'a lot' },
        ],
      })
    );
    expect(result.errors.conditions[0]).toBeTruthy();
  });

  it('reports the index of each bad condition, not just the first', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        conditions: [
          { column: 'Status', operator: 'equals', value: 'Pass' },
          { column: '', operator: 'equals', value: 'x' },
          { column: 'Price', operator: 'greater_than', value: 'nope' },
        ],
      })
    );
    expect(Object.keys(result.errors.conditions)).toEqual(['1', '2']);
  });
});

describe('step 2 — what gets sent', () => {
  it('needs a campaign', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        campaign: Object.assign(validDraft().campaign, { id: '' }),
      })
    );
    expect(result.errors.campaign).toBeTruthy();
  });

  it('needs the WhatsApp number column', () => {
    const result = ReplaiRuleSchema.validate(validDraft({ phoneColumn: '' }));
    expect(result.errors.phoneColumn).toBeTruthy();
  });

  it('treats the contact name column as optional', () => {
    const result = ReplaiRuleSchema.validate(validDraft({ nameColumn: '' }));
    expect(result.ok).toBe(true);
  });
});

describe('country code', () => {
  it('adds the missing plus', () => {
    expect(
      ReplaiRuleSchema.validate(validDraft({ countryCode: '91' })).rule
        .countryCode
    ).toBe('+91');
  });

  it('leaves a well-formed code alone and allows none at all', () => {
    expect(
      ReplaiRuleSchema.validate(validDraft({ countryCode: '+1' })).rule
        .countryCode
    ).toBe('+1');
    const blank = ReplaiRuleSchema.validate(validDraft({ countryCode: '' }));
    expect(blank.rule.countryCode).toBe('');
    expect(blank.ok).toBe(true);
  });

  it('rejects anything that is not a dialling code', () => {
    ['abc', '+', '+123456', '9 1a'].forEach((countryCode) => {
      const result = ReplaiRuleSchema.validate(validDraft({ countryCode }));
      expect(result.errors.countryCode).toBeTruthy();
    });
  });
});

describe('template variables', () => {
  it('requires a column when the source is a column', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        variables: [
          { source: 'column', column: '', value: '' },
          { source: 'literal', column: '', value: '2 Days' },
        ],
      })
    );
    expect(result.errors['variable.0']).toBeTruthy();
    expect(result.errors['variable.1']).toBeUndefined();
  });

  it('requires a value when the source is a fixed value', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        variables: [
          { source: 'column', column: 'Delivery id', value: '' },
          { source: 'literal', column: '', value: '  ' },
        ],
      })
    );
    expect(result.errors['variable.1']).toBeTruthy();
  });

  it('clears the unused half of a variable', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        variables: [
          { source: 'column', column: 'Delivery id', value: 'ignored' },
          { source: 'literal', column: 'ignored', value: '2 Days' },
        ],
      })
    );
    expect(result.rule.variables[0].value).toBe('');
    expect(result.rule.variables[1].column).toBe('');
  });

  it('rejects a count that no longer matches the template', () => {
    // Reachable when the template is edited in the CRM after the wizard
    // loaded it. Meta rejects the wrong variable count per recipient, so
    // it is caught before the rule is stored.
    const result = ReplaiRuleSchema.validate(
      validDraft({
        variables: [{ source: 'column', column: 'Delivery id', value: '' }],
      })
    );
    expect(result.errors.variables).toContain('2');
  });

  it('accepts a template with no variables at all', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        campaign: Object.assign(validDraft().campaign, { variableCount: 0 }),
        variables: [],
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe('media', () => {
  it('needs a URL when the source is a fixed URL', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        media: { type: 'image', source: 'url', column: '', url: '' },
      })
    );
    expect(result.errors.media).toBeTruthy();
  });

  it('insists on https', () => {
    // Meta fetches the asset itself and rejects plain http, so storing
    // one would only produce a failure later.
    const http = ReplaiRuleSchema.validate(
      validDraft({
        media: {
          type: 'image',
          source: 'url',
          column: '',
          url: 'http://example.com/a.png',
        },
      })
    );
    expect(http.errors.media).toBeTruthy();

    const https = ReplaiRuleSchema.validate(
      validDraft({
        media: {
          type: 'image',
          source: 'url',
          column: '',
          url: 'https://example.com/a.png',
        },
      })
    );
    expect(https.ok).toBe(true);
  });

  it('needs a column when the source is a column', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({
        media: { type: 'document', source: 'column', column: '', url: '' },
      })
    );
    expect(result.errors.media).toBeTruthy();

    const ok = ReplaiRuleSchema.validate(
      validDraft({
        media: {
          type: 'document',
          source: 'column',
          column: 'Invoice',
          url: '',
        },
      })
    );
    expect(ok.ok).toBe(true);
  });

  it('refuses "no media" when the template has a media header', () => {
    // Such a template is rejected by Meta for every single recipient.
    const result = ReplaiRuleSchema.validate(
      validDraft({
        campaign: Object.assign(validDraft().campaign, { mediaRequired: true }),
        media: { type: 'none', source: 'url', column: '', url: '' },
      })
    );
    expect(result.errors.media).toBeTruthy();
  });
});

describe('normalise', () => {
  it('drops keys the schema does not know about', () => {
    const rule = ReplaiRuleSchema.normalise(
      validDraft({ sendTwice: true, secret: 'nope' })
    );
    expect(rule.sendTwice).toBeUndefined();
    expect(rule.secret).toBeUndefined();
  });

  it('trims whitespace off every string field', () => {
    const rule = ReplaiRuleSchema.normalise(
      validDraft({ name: '  Padded  ', phoneColumn: ' Whatsapp ' })
    );
    expect(rule.name).toBe('Padded');
    expect(rule.phoneColumn).toBe('Whatsapp');
  });

  it('defaults a missing draft to something inert rather than throwing', () => {
    const rule = ReplaiRuleSchema.normalise(undefined);
    expect(rule.conditions).toEqual([]);
    expect(rule.variables).toEqual([]);
    expect(rule.media.type).toBe('none');
    expect(rule.enabled).toBe(true);
    expect(ReplaiRuleSchema.validate(undefined).ok).toBe(false);
  });
});

describe('reminder schedules', () => {
  it('stores the schedule the wizard sent', () => {
    const rule = ReplaiRuleSchema.normalise(
      validDraft({
        schedule: { frequency: 'weekly', hour: '18', dayOfWeek: '5' },
      })
    );
    expect(rule.schedule.frequency).toBe('weekly');
    expect(rule.schedule.hour).toBe(18);
    expect(rule.schedule.dayOfWeek).toBe(5);
  });

  it('accepts a reminder saved before schedules existed', () => {
    // validDraft() is a reminder with no schedule key at all, which is
    // exactly the shape of every rule stored by an earlier version. If
    // this fails, upgrading makes old rules unsaveable.
    const result = ReplaiRuleSchema.validate(validDraft());
    expect(result.ok).toBe(true);
    expect(result.errors.schedule).toBeUndefined();
    // It still comes back with a usable plan rather than nothing.
    expect(result.rule.schedule.frequency).toBe('daily');
  });

  it('rejects a monthly rule with an impossible date', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({ schedule: { frequency: 'monthly', hour: 9, dayOfMonth: 0 } })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.schedule).toMatch(/between 1 and 31/i);
  });

  it('rejects an out-of-range hour instead of rounding it', () => {
    const result = ReplaiRuleSchema.validate(
      validDraft({ schedule: { frequency: 'daily', hour: 25 } })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.schedule).toBeTruthy();
  });

  it('ignores the schedule on a trigger that has no schedule', () => {
    // A New Row rule cannot be blocked by a field it never shows. Note it
    // also needs no conditions, unlike a reminder.
    const result = ReplaiRuleSchema.validate(
      validDraft({
        triggerType: 'new_row',
        conditions: [],
        schedule: { frequency: 'monthly', hour: 9, dayOfMonth: 99 },
      })
    );
    expect(result.errors.schedule).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
