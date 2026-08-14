import { describe, expect, it, vi } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateFlowTemplate,
  validateTemplatePayload,
  type TemplatePayload,
} from './template-validators';
import { buildSendComponents } from './template-send-builder';
import { templateSendability } from './template-sendability';
import type { MessageTemplate } from '@/types';

/**
 * FLOW-button templates.
 *
 * The Flow referenced here is one of META'S WhatsApp Flows, not this
 * app's own /flows automation graph — a template button cannot point at
 * the latter, which is why the wizard picks from the WABA.
 */

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'appointment_booking',
    category: 'Marketing',
    language: 'en_US',
    body_text: 'Tap below to pick a time.',
    flow: {
      flow_id: '1234567890',
      text: 'Book now',
      flow_action: 'navigate',
      navigate_screen: 'WELCOME_SCREEN',
    },
    ...over,
  };
}

describe('validateFlowTemplate', () => {
  it('accepts a navigate Flow with a screen', () => {
    expect(() => validateFlowTemplate(payload())).not.toThrow();
  });

  it('accepts a data_exchange Flow with no screen', () => {
    expect(() =>
      validateFlowTemplate(
        payload({
          flow: {
            flow_id: '1',
            text: 'Start',
            flow_action: 'data_exchange',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('requires the starting screen for a navigate Flow', () => {
    // Meta rejects this, but the message names neither the field nor the
    // rule, so it is caught locally.
    expect(() =>
      validateFlowTemplate(
        payload({
          flow: { flow_id: '1', text: 'Book', flow_action: 'navigate' },
        }),
      ),
    ).toThrow(/first screen/i);
  });

  it('refuses a screen on a data_exchange Flow', () => {
    // Meta rejects the reverse case too — the endpoint chooses the screen.
    expect(() =>
      validateFlowTemplate(
        payload({
          flow: {
            flow_id: '1',
            text: 'Start',
            flow_action: 'data_exchange',
            navigate_screen: 'WELCOME_SCREEN',
          },
        }),
      ),
    ).toThrow(/must not name a screen/i);
  });

  it('requires a Flow id', () => {
    expect(() =>
      validateFlowTemplate(
        payload({
          flow: {
            flow_id: '   ',
            text: 'Book',
            flow_action: 'navigate',
            navigate_screen: 'S',
          },
        }),
      ),
    ).toThrow(/published Flow/i);
  });

  it('requires a button label within Meta’s 25 characters', () => {
    expect(() =>
      validateFlowTemplate(
        payload({
          flow: {
            flow_id: '1',
            text: '',
            flow_action: 'navigate',
            navigate_screen: 'S',
          },
        }),
      ),
    ).toThrow(/button label/i);

    expect(() =>
      validateFlowTemplate(
        payload({
          flow: {
            flow_id: '1',
            text: 'x'.repeat(26),
            flow_action: 'navigate',
            navigate_screen: 'S',
          },
        }),
      ),
    ).toThrow(/25 characters/);
  });

  it('refuses other buttons alongside the Flow button', () => {
    // The FLOW button is assembled from `flow`; anything in `buttons`
    // would be a second, conflicting source, and Meta allows one Flow
    // button only.
    expect(() =>
      validateFlowTemplate(
        payload({
          buttons: [{ type: 'QUICK_REPLY', text: 'No thanks' }],
        }),
      ),
    ).toThrow(/only its Flow button/i);
  });

  it('refuses the Authentication category', () => {
    expect(() =>
      validateFlowTemplate(payload({ category: 'Authentication' })),
    ).toThrow(/Marketing or Utility/i);
  });

  it('is reached by validateTemplatePayload', () => {
    // The standard path would pass a flow payload silently, because a
    // template with no `buttons` is perfectly valid there.
    expect(() =>
      validateTemplatePayload(
        payload({
          flow: { flow_id: '1', text: 'Book', flow_action: 'navigate' },
        }),
      ),
    ).toThrow(/first screen/i);
  });

  it('still applies the standard body and footer rules', () => {
    expect(() => validateFlowTemplate(payload({ body_text: '' }))).toThrow(
      /Body text is required/i,
    );
    expect(() =>
      validateFlowTemplate(payload({ footer_text: 'Ends {{1}}' })),
    ).toThrow(/cannot contain/i);
  });
});

describe('buildMetaTemplatePayload — Flow templates', () => {
  it('emits a single FLOW button with the screen', () => {
    const out = buildMetaTemplatePayload(payload());
    expect(out.components).toEqual([
      { type: 'BODY', text: 'Tap below to pick a time.' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'FLOW',
            text: 'Book now',
            flow_id: '1234567890',
            flow_action: 'navigate',
            navigate_screen: 'WELCOME_SCREEN',
          },
        ],
      },
    ]);
  });

  it('omits navigate_screen for data_exchange', () => {
    const out = buildMetaTemplatePayload(
      payload({
        flow: { flow_id: '1', text: 'Start', flow_action: 'data_exchange' },
      }),
    );
    const buttons = out.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons?.[0]).toEqual({
      type: 'FLOW',
      text: 'Start',
      flow_id: '1',
      flow_action: 'data_exchange',
    });
  });

  it('keeps the header and footer of a Flow template', () => {
    const out = buildMetaTemplatePayload(
      payload({
        header_type: 'text',
        header_content: 'Book your slot',
        footer_text: 'Takes a minute',
      }),
    );
    expect(out.components.map((c) => c.type)).toEqual([
      'HEADER',
      'BODY',
      'FOOTER',
      'BUTTONS',
    ]);
  });
});

describe('sending a Flow template', () => {
  function row(over: Partial<MessageTemplate> = {}): MessageTemplate {
    return {
      id: 't1',
      account_id: 'a1',
      user_id: 'u1',
      name: 'appointment_booking',
      category: 'Marketing',
      language: 'en_US',
      status: 'APPROVED',
      body_text: 'Tap below to pick a time.',
      // A Flow template's flat `buttons` column is NULL by design —
      // toLegacyButton drops FLOW — so `components` is the only source.
      buttons: null,
      components: [
        { type: 'BODY', text: 'Tap below to pick a time.' },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'FLOW',
              text: 'Book now',
              flow_id: '1234567890',
              flow_action: 'navigate',
              navigate_screen: 'WELCOME_SCREEN',
            },
          ],
        },
      ],
      created_at: '',
      updated_at: '',
      ...over,
    } as unknown as MessageTemplate;
  }

  it('emits sub_type flow with a generated flow_token', () => {
    const components = buildSendComponents(row());
    const button = components.find((c) => c.type === 'button');
    expect(button).toMatchObject({
      type: 'button',
      sub_type: 'flow',
      index: '0',
    });
    const param = (button as { parameters: Record<string, unknown>[] })
      .parameters[0] as {
      type: string;
      action: { flow_token: string; flow_action_data?: unknown };
    };
    expect(param.type).toBe('action');
    // Generated rather than demanded: the token identifies the session and
    // there is nothing for an operator to decide about it.
    expect(param.action.flow_token).toMatch(/[0-9a-f-]{36}/);
    expect(param.action.flow_action_data).toEqual({ screen: 'WELCOME_SCREEN' });
  });

  it('uses a caller-supplied token when given', () => {
    const components = buildSendComponents(row(), {
      flowToken: 'session-abc',
    });
    const button = components.find((c) => c.type === 'button') as {
      parameters: { action: { flow_token: string } }[];
    };
    expect(button.parameters[0].action.flow_token).toBe('session-abc');
  });

  it('generates a DIFFERENT token per send', () => {
    // One token per session is the whole point — a shared token would make
    // every customer's answers look like the same submission.
    const a = buildSendComponents(row()) as {
      parameters?: { action: { flow_token: string } }[];
    }[];
    const b = buildSendComponents(row()) as {
      parameters?: { action: { flow_token: string } }[];
    }[];
    const tokenOf = (cs: typeof a) =>
      cs.find((c) => c.parameters?.[0]?.action)?.parameters?.[0].action
        .flow_token;
    expect(tokenOf(a)).not.toBe(tokenOf(b));
  });

  it('omits flow_action_data for a data_exchange Flow', () => {
    const components = buildSendComponents(
      row({
        components: [
          { type: 'BODY', text: 'Tap below to pick a time.' },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'FLOW',
                text: 'Start',
                flow_id: '1',
                flow_action: 'data_exchange',
              },
            ],
          },
        ],
      } as unknown as Partial<MessageTemplate>),
    );
    const button = components.find((c) => c.type === 'button') as {
      parameters: { action: { flow_action_data?: unknown } }[];
    };
    expect(button.parameters[0].action.flow_action_data).toBeUndefined();
  });

  it('passes initial screen data through', () => {
    const components = buildSendComponents(row(), {
      flowActionData: { name: 'Aisha' },
    });
    const button = components.find((c) => c.type === 'button') as {
      parameters: { action: { flow_action_data?: unknown } }[];
    };
    expect(button.parameters[0].action.flow_action_data).toEqual({
      screen: 'WELCOME_SCREEN',
      data: { name: 'Aisha' },
    });
  });

  it('refuses to send a navigate Flow with no recorded screen', () => {
    // Meta would reject it with a parameter error naming nothing useful.
    expect(() =>
      buildSendComponents(
        row({
          components: [
            { type: 'BODY', text: 'Hi' },
            {
              type: 'BUTTONS',
              buttons: [
                { type: 'FLOW', text: 'Book', flow_id: '1', flow_action: 'navigate' },
              ],
            },
          ],
        } as unknown as Partial<MessageTemplate>),
      ),
    ).toThrow(/starting screen/i);
  });

  it('still interpolates body variables', () => {
    const components = buildSendComponents(
      row({
        body_text: 'Hi {{1}}, pick a time.',
        components: [
          { type: 'BODY', text: 'Hi {{1}}, pick a time.' },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'FLOW',
                text: 'Book now',
                flow_id: '1',
                flow_action: 'navigate',
                navigate_screen: 'S',
              },
            ],
          },
        ],
      } as unknown as Partial<MessageTemplate>),
      { body: ['Aisha'] },
    );
    expect(components[0]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'Aisha' }],
    });
  });

  it('is judged sendable once approved', () => {
    expect(
      templateSendability({ template_type: 'flows', status: 'APPROVED' }),
    ).toEqual({ sendable: true });
  });
});

describe('listWhatsAppFlows', () => {
  it('reads Meta’s list shape and keeps unpublished Flows', async () => {
    // Unpublished Flows are returned so the picker can show them greyed
    // out. Filtering them here would look like a Flow the operator just
    // built had failed to appear.
    const { listWhatsAppFlows } = await import('./meta-api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'f1', name: 'Booking', status: 'PUBLISHED', categories: ['APPOINTMENT_BOOKING'] },
              { id: 'f2', name: 'Draft one', status: 'DRAFT' },
              { id: '', name: 'broken' },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const flows = await listWhatsAppFlows({
      wabaId: 'waba1',
      accessToken: 'tok',
    });
    vi.unstubAllGlobals();

    expect(flows).toEqual([
      {
        id: 'f1',
        name: 'Booking',
        status: 'PUBLISHED',
        categories: ['APPOINTMENT_BOOKING'],
        validation_errors: undefined,
      },
      {
        id: 'f2',
        name: 'Draft one',
        status: 'DRAFT',
        categories: undefined,
        validation_errors: undefined,
      },
    ]);
  });
});
