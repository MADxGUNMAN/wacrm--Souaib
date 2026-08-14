import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateNamedBody,
  validateTemplatePayload,
  validateTtl,
  type TemplatePayload,
} from './template-validators';
import { buildSendComponents } from './template-send-builder';
import { buildSendPlan, missingSendValues } from './template-send-inputs';
import { extractNamedParams, isValidNamedParam } from './template-variables';
import { TTL_LIMITS } from './template-limits';
import type { MessageTemplate } from '@/types';

/**
 * The four smaller gaps closed together: location headers, the message
 * validity period, named parameters and the voice-call button.
 *
 * Grouped in one file because each is small, but each has one non-obvious
 * rule that a test is the only honest way to pin down.
 */

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'order_update',
    category: 'Utility',
    language: 'en_US',
    body_text: 'Your order is on its way.',
    ...over,
  };
}

// ============================================================
// Location headers
// ============================================================

describe('location headers', () => {
  it('creates with no example — the pin is per message', () => {
    // A template advertising one fixed address would be a text header.
    const out = buildMetaTemplatePayload(
      payload({ header_type: 'location' }),
    );
    expect(out.components[0]).toEqual({ type: 'HEADER', format: 'LOCATION' });
  });

  it('needs no sample URL to validate', () => {
    expect(() =>
      validateTemplatePayload(payload({ header_type: 'location' })),
    ).not.toThrow();
  });

  function row(): MessageTemplate {
    return {
      id: 't1',
      account_id: 'a1',
      user_id: 'u1',
      name: 'store_location',
      category: 'Utility',
      language: 'en_US',
      status: 'APPROVED',
      header_type: 'location',
      body_text: 'Here is the shop.',
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Here is the shop.' },
      ],
      created_at: '',
      updated_at: '',
    } as unknown as MessageTemplate;
  }

  it('sends the pin as a location parameter', () => {
    const components = buildSendComponents(row(), {
      headerLocation: {
        latitude: '18.5204',
        longitude: '73.8567',
        name: 'Replai HQ',
        address: 'FC Road, Pune',
      },
    });
    expect(components[0]).toEqual({
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: '18.5204',
            longitude: '73.8567',
            name: 'Replai HQ',
            address: 'FC Road, Pune',
          },
        },
      ],
    });
  });

  it('names the missing field rather than refusing vaguely', () => {
    // Meta rejects a partial location object without saying which part.
    expect(() =>
      buildSendComponents(row(), {
        headerLocation: {
          latitude: '18.5',
          longitude: '',
          name: 'Shop',
          address: '',
        },
      }),
    ).toThrow(/longitude, address/);
  });

  it('requires all four in the send plan', () => {
    const plan = buildSendPlan({
      name: 'store_location',
      category: 'Utility',
      body_text: 'Here is the shop.',
      components: [
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Here is the shop.' },
      ],
    });
    expect(plan.needsHeaderLocation).toBe(true);
    // No stored pin to fall back on, so this can never be a no-input send.
    expect(plan.needsNoInput).toBe(false);
    expect(missingSendValues(plan, {})).toHaveLength(4);
    expect(
      missingSendValues(plan, {
        headerLocation: {
          latitude: '1',
          longitude: '2',
          name: 'a',
          address: 'b',
        },
      }),
    ).toEqual([]);
  });
});

// ============================================================
// Validity period
// ============================================================

describe('validity period', () => {
  it('accepts Meta’s -1 sentinel for every category', () => {
    // Migration 063 exists because an earlier CHECK rejected this and
    // broke syncing any template that carried it.
    for (const category of ['Marketing', 'Utility'] as const) {
      expect(() =>
        validateTtl(payload({ category, message_send_ttl_seconds: -1 })),
      ).not.toThrow();
    }
  });

  it('enforces the UTILITY window', () => {
    expect(() =>
      validateTtl(payload({ message_send_ttl_seconds: TTL_LIMITS.Utility.min })),
    ).not.toThrow();
    expect(() =>
      validateTtl(payload({ message_send_ttl_seconds: 29 })),
    ).toThrow(/Utility template/);
  });

  it('enforces the MARKETING window, which starts where Utility ends', () => {
    // This is the trap: 60 seconds is fine on a utility template and
    // rejected on a marketing one, and Meta's error says neither.
    expect(() =>
      validateTtl(
        payload({ category: 'Marketing', message_send_ttl_seconds: 60 }),
      ),
    ).toThrow(/Marketing template/);
    expect(() =>
      validateTtl(
        payload({
          category: 'Marketing',
          message_send_ttl_seconds: TTL_LIMITS.Marketing.min,
        }),
      ),
    ).not.toThrow();
  });

  it('treats an absent value as Meta’s default', () => {
    expect(() => validateTtl(payload())).not.toThrow();
    expect(buildMetaTemplatePayload(payload()).message_send_ttl_seconds).toBeUndefined();
  });

  it('is reached by validateTemplatePayload', () => {
    expect(() =>
      validateTemplatePayload(payload({ message_send_ttl_seconds: 5 })),
    ).toThrow(/validity period/);
  });
});

// ============================================================
// Named parameters
// ============================================================

describe('named parameters', () => {
  it('extracts names in order of appearance, not sorted', () => {
    // The editor shows sample inputs in this order, so alphabetical would
    // put a two-variable sentence's fields the wrong way round.
    expect(
      extractNamedParams('Thank you {{zebra}}! Order {{apple}} shipped.'),
    ).toEqual(['zebra', 'apple']);
  });

  it('never treats {{1}} as a named parameter', () => {
    expect(extractNamedParams('Hi {{1}} and {{name}}')).toEqual(['name']);
  });

  it('deduplicates a repeated name', () => {
    expect(extractNamedParams('{{name}} — hello {{name}}')).toEqual(['name']);
  });

  it('rejects invalid names', () => {
    expect(isValidNamedParam('order_id')).toBe(true);
    expect(isValidNamedParam('Order_ID')).toBe(false);
    expect(isValidNamedParam('order-id')).toBe(false);
    expect(isValidNamedParam('12')).toBe(false);
  });

  const named = (over: Partial<TemplatePayload> = {}) =>
    payload({
      parameter_format: 'NAMED',
      body_text: 'Thank you {{first_name}}! Order {{order_number}}.',
      named_samples: { first_name: 'Pablo', order_number: '860198' },
      ...over,
    });

  it('refuses a template that mixes both formats', () => {
    // Meta's rejection is "The parameter name is required", which points
    // at neither the stray placeholder nor the rule.
    expect(() =>
      validateNamedBody('Hi {{1}} and {{first_name}}', { first_name: 'P' }),
    ).toThrow(/cannot also contain \{\{1\}\}/);
  });

  it('requires an example for every name', () => {
    expect(() =>
      validateNamedBody('Order {{order_number}}', {}),
    ).toThrow(/example value for \{\{order_number\}\}/);
  });

  it('builds the named example shape, not the positional one', () => {
    // Sending body_text for a named template is rejected.
    const out = buildMetaTemplatePayload(named());
    expect(out.parameter_format).toBe('NAMED');
    expect(out.components[0]).toEqual({
      type: 'BODY',
      text: 'Thank you {{first_name}}! Order {{order_number}}.',
      example: {
        body_text_named_params: [
          { param_name: 'first_name', example: 'Pablo' },
          { param_name: 'order_number', example: '860198' },
        ],
      },
    });
  });

  it('omits parameter_format for positional templates', () => {
    // Keeps every existing template's payload byte-identical to before.
    expect(buildMetaTemplatePayload(payload()).parameter_format).toBeUndefined();
  });

  function namedRow(): MessageTemplate {
    return {
      id: 't1',
      account_id: 'a1',
      user_id: 'u1',
      name: 'order_confirmation',
      category: 'Utility',
      language: 'en_US',
      status: 'APPROVED',
      parameter_format: 'NAMED',
      body_text: 'Thank you {{first_name}}! Order {{order_number}}.',
      components: [
        {
          type: 'BODY',
          text: 'Thank you {{first_name}}! Order {{order_number}}.',
        },
      ],
      created_at: '',
      updated_at: '',
    } as unknown as MessageTemplate;
  }

  it('sends parameter_name alongside each value', () => {
    const components = buildSendComponents(namedRow(), {
      namedBody: { first_name: 'Jessica', order_number: 'SKBUP2' },
    });
    expect(components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'first_name', text: 'Jessica' },
          { type: 'text', parameter_name: 'order_number', text: 'SKBUP2' },
        ],
      },
    ]);
  });

  it('ignores a positional array for a named template', () => {
    // Accepting it would send the right values under the wrong labels.
    expect(() =>
      buildSendComponents(namedRow(), { body: ['Jessica', 'SKBUP2'] }),
    ).toThrow(/Missing value\(s\) for \{\{first_name\}\}/);
  });

  it('asks for names, not indexes, in the send plan', () => {
    const plan = buildSendPlan({
      name: 'order_confirmation',
      category: 'Utility',
      parameter_format: 'NAMED',
      body_text: 'Thank you {{first_name}}! Order {{order_number}}.',
      components: [
        {
          type: 'BODY',
          text: 'Thank you {{first_name}}! Order {{order_number}}.',
        },
      ],
    });
    expect(plan.bodyVarCount).toBe(0);
    expect(plan.bodyParamNames).toEqual(['first_name', 'order_number']);
    expect(missingSendValues(plan, {})).toEqual([
      'Message variable {{first_name}}',
      'Message variable {{order_number}}',
    ]);
    expect(
      missingSendValues(plan, {
        namedBody: { first_name: 'a', order_number: 'b' },
      }),
    ).toEqual([]);
  });
});

// ============================================================
// Voice call button
// ============================================================

describe('voice call button', () => {
  const withVoice = (over: Partial<TemplatePayload> = {}) =>
    payload({
      buttons: [{ type: 'VOICE_CALL', text: 'Call us' }],
      ...over,
    });

  it('creates as a label-only button', () => {
    const out = buildMetaTemplatePayload(withVoice());
    const buttons = out.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons).toEqual([{ type: 'VOICE_CALL', text: 'Call us' }]);
  });

  it('allows only one', () => {
    expect(() =>
      validateTemplatePayload(
        withVoice({
          buttons: [
            { type: 'VOICE_CALL', text: 'Call' },
            { type: 'VOICE_CALL', text: 'Call again' },
          ],
        }),
      ),
    ).toThrow(/At most 1 voice call button/);
  });

  it('still requires a label', () => {
    expect(() =>
      validateTemplatePayload(withVoice({ buttons: [{ type: 'VOICE_CALL', text: '' }] })),
    ).toThrow(/missing text/i);
  });

  it('takes no send-time parameter', () => {
    const components = buildSendComponents({
      id: 't1',
      account_id: 'a1',
      user_id: 'u1',
      name: 'call_us',
      category: 'Utility',
      language: 'en_US',
      status: 'APPROVED',
      body_text: 'Questions?',
      buttons: [{ type: 'VOICE_CALL', text: 'Call us' }],
      components: [
        { type: 'BODY', text: 'Questions?' },
        { type: 'BUTTONS', buttons: [{ type: 'VOICE_CALL', text: 'Call us' }] },
      ],
      created_at: '',
      updated_at: '',
    } as unknown as MessageTemplate);
    // No button component at all — emitting an empty one is rejected.
    expect(components.some((c) => c.type === 'button')).toBe(false);
  });

  it('survives the flat-column round trip', () => {
    // Unlike FLOW, a voice-call button needs no send-time parameter, so it
    // is safe in the flat `buttons` cache and must not be dropped.
    const plan = buildSendPlan({
      name: 'call_us',
      category: 'Utility',
      body_text: 'Questions?',
      buttons: [{ type: 'VOICE_CALL', text: 'Call us' }],
    });
    expect(plan.needsNoInput).toBe(true);
  });
});
