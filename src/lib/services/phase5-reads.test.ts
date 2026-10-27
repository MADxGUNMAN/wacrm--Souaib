import { describe, expect, it } from 'vitest';
import { sumTemplateDays } from './analytics';
import { topFailureReasons } from './broadcasts';
import { likeLiteral, one } from './shared';
import { templateRequirements } from './templates';

describe('templateRequirements', () => {
  it('reads positional body variables, a text header variable and URL suffix buttons', () => {
    const r = templateRequirements({
      name: 'order_update',
      category: 'Utility',
      language: 'en',
      template_type: 'default',
      parameter_format: 'POSITIONAL',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' },
        { type: 'BODY', text: 'Hi {{1}}, your order {{2}} ships {{3}}.' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Thanks' },
            { type: 'URL', text: 'Track', url: 'https://x.example/t/{{1}}' },
          ],
        },
      ],
    });
    expect(r).toEqual({
      parameter_format: 'POSITIONAL',
      body_variables: { count: 3, names: [] },
      header: { type: 'text', needs_value: true },
      url_buttons_needing_suffix: [1],
      special_type: null,
    });
  });

  it('reads named variables and media headers', () => {
    const r = templateRequirements({
      name: 'promo',
      category: 'Marketing',
      language: 'en',
      template_type: 'default',
      parameter_format: 'NAMED',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hello {{first_name}}, use {{code}}' },
      ],
    });
    expect(r.body_variables).toEqual({
      count: 2,
      names: ['first_name', 'code'],
    });
    expect(r.header).toEqual({ type: 'image', needs_value: false });
  });
});

describe('topFailureReasons', () => {
  it('groups by code + message, most common first', () => {
    const rows = [
      { error_code: '131026', error_message: 'Message undeliverable' },
      { error_code: '131026', error_message: 'Message undeliverable' },
      { error_code: '131049', error_message: 'Marketing limit' },
      { error_code: null, error_message: null },
    ];
    expect(topFailureReasons(rows, 2)).toEqual([
      { reason: 'Message undeliverable', code: '131026', count: 2 },
      { reason: 'Marketing limit', code: '131049', count: 1 },
    ]);
  });
});

describe('sumTemplateDays', () => {
  it('sums per template and keeps spend null when Meta reported none', () => {
    const by = sumTemplateDays([
      {
        template_id: 'a',
        sent: 5,
        delivered: 4,
        read: 2,
        clicked: 1,
        replied: 0,
        amount_spent: '1.5',
        currency: 'INR',
      },
      {
        template_id: 'a',
        sent: 3,
        delivered: 3,
        read: 1,
        clicked: 0,
        replied: 1,
        amount_spent: 2,
        currency: 'INR',
      },
      {
        template_id: 'b',
        sent: 1,
        delivered: null,
        read: null,
        clicked: null,
        replied: null,
        amount_spent: null,
        currency: null,
      },
    ]);
    expect(by.get('a')).toMatchObject({
      sent: 8,
      delivered: 7,
      read: 3,
      clicked: 1,
      replied: 1,
      spentRaw: 3.5,
    });
    expect(by.get('b')).toMatchObject({ sent: 1, spentRaw: null });
  });
});

describe('shared helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(likeLiteral('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
  it('unwraps to-one embeds', () => {
    expect(one([{ a: 1 }])).toEqual({ a: 1 });
    expect(one({ a: 1 })).toEqual({ a: 1 });
    expect(one(null)).toBeNull();
  });
});
