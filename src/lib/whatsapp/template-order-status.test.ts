import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateOrderStatus,
  validateTemplatePayload,
  type TemplatePayload,
} from './template-validators';
import {
  ORDER_STATUS_VALUES,
  buildSendComponents,
} from './template-send-builder';
import { templateSendability } from './template-sendability';
import {
  ORDER_STATUS_OPTIONS,
  buildSendPlan,
  missingSendValues,
} from './template-send-inputs';
import type { MessageTemplate } from '@/types';

/**
 * Order-status templates.
 *
 * The defining property is INVISIBLE in the content: the components are a
 * body and an optional footer, exactly like a plain Utility template, and
 * only `sub_category: ORDER_STATUS` makes a send update an order. Most of
 * what follows guards that distinction from being quietly lost.
 */

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'order_shipped_update',
    category: 'Utility',
    language: 'en_US',
    body_text: 'Your order has shipped.',
    sub_category: 'ORDER_STATUS',
    ...over,
  };
}

describe('validateOrderStatus', () => {
  it('accepts a body-only template', () => {
    expect(() => validateOrderStatus(payload())).not.toThrow();
  });

  it('accepts an optional footer', () => {
    expect(() =>
      validateOrderStatus(payload({ footer_text: 'Reply here for help' })),
    ).not.toThrow();
  });

  it('requires the Utility category', () => {
    expect(() =>
      validateOrderStatus(payload({ category: 'Marketing' })),
    ).toThrow(/Utility category/i);
  });

  it('refuses a header', () => {
    expect(() =>
      validateOrderStatus(
        payload({ header_type: 'text', header_content: 'Update' }),
      ),
    ).toThrow(/cannot have a header/i);
  });

  it('refuses buttons', () => {
    expect(() =>
      validateOrderStatus(
        payload({ buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }] }),
      ),
    ).toThrow(/cannot have buttons/i);
  });

  it('refuses a payload that also claims another shape', () => {
    // Without this, buildMetaTemplatePayload would resolve the conflict by
    // whichever branch happened to run first.
    expect(() =>
      validateOrderStatus(
        payload({
          flow: { flow_id: '1', text: 'Open', flow_action: 'data_exchange' },
        }),
      ),
    ).toThrow(/cannot also be/i);
  });

  it('is dispatched by validateTemplatePayload', () => {
    expect(() =>
      validateTemplatePayload(
        payload({ header_type: 'text', header_content: 'Update' }),
      ),
    ).toThrow(/cannot have a header/i);
  });
});

describe('buildMetaTemplatePayload — order status', () => {
  it('sends sub_category alongside a body-only components array', () => {
    // Omitting sub_category produces a normal Utility template that looks
    // correct and cannot update an order.
    const out = buildMetaTemplatePayload(payload());
    expect(out.sub_category).toBe('ORDER_STATUS');
    expect(out.category).toBe('UTILITY');
    expect(out.components).toEqual([
      { type: 'BODY', text: 'Your order has shipped.' },
    ]);
  });

  it('includes the footer when set', () => {
    const out = buildMetaTemplatePayload(payload({ footer_text: 'Thanks' }));
    expect(out.components).toEqual([
      { type: 'BODY', text: 'Your order has shipped.' },
      { type: 'FOOTER', text: 'Thanks' },
    ]);
  });

  it('does not set sub_category on an ordinary template', () => {
    const out = buildMetaTemplatePayload({
      name: 'plain',
      category: 'Utility',
      language: 'en_US',
      body_text: 'Hello',
    });
    expect(out.sub_category).toBeUndefined();
  });
});

describe('sending an order status update', () => {
  function row(over: Partial<MessageTemplate> = {}): MessageTemplate {
    return {
      id: 't1',
      account_id: 'a1',
      user_id: 'u1',
      name: 'order_shipped_update',
      category: 'Utility',
      language: 'en_US',
      status: 'APPROVED',
      template_type: 'order_status',
      body_text: 'Your order {{1}} has shipped.',
      components: [{ type: 'BODY', text: 'Your order {{1}} has shipped.' }],
      created_at: '',
      updated_at: '',
      ...over,
    } as unknown as MessageTemplate;
  }

  it('emits the order_status component with the reference and status', () => {
    const components = buildSendComponents(row(), {
      body: ['#12345'],
      orderReferenceId: 'ref-99',
      orderStatus: 'shipped',
    });
    expect(components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '#12345' }] },
      {
        type: 'order_status',
        parameters: [
          {
            type: 'order_status',
            order_status: {
              reference_id: 'ref-99',
              order: { status: 'shipped' },
            },
          },
        ],
      },
    ]);
  });

  it('includes the optional description', () => {
    const components = buildSendComponents(row(), {
      body: ['#1'],
      orderReferenceId: 'ref-1',
      orderStatus: 'partially_shipped',
      orderStatusDescription: 'Two of three items sent',
    });
    const status = components.find((c) => c.type === 'order_status') as {
      parameters: { order_status: { order: Record<string, unknown> } }[];
    };
    expect(status.parameters[0].order_status.order).toEqual({
      status: 'partially_shipped',
      description: 'Two of three items sent',
    });
  });

  it('refuses a send with no reference id', () => {
    // Meta has nothing to update without it, and there is no default.
    expect(() =>
      buildSendComponents(row(), { body: ['#1'], orderStatus: 'shipped' }),
    ).toThrow(/reference id/i);
  });

  it('refuses a send with no status', () => {
    // A defaulted status could tell a customer their order had shipped
    // when it had not.
    expect(() =>
      buildSendComponents(row(), { body: ['#1'], orderReferenceId: 'r' }),
    ).toThrow(/needs a status/i);
  });

  it('refuses a status Meta does not accept', () => {
    expect(() =>
      buildSendComponents(row(), {
        body: ['#1'],
        orderReferenceId: 'r',
        // Meta's prose table hyphenates this; the API wants underscores.
        orderStatus: 'partially-shipped' as never,
      }),
    ).toThrow(/needs a status/i);
  });

  it('is routed on template_type, since the components look ordinary', () => {
    // Same components, no order-status type: it must take the standard
    // path and emit no order_status component.
    const components = buildSendComponents(
      row({ template_type: 'default' } as Partial<MessageTemplate>),
      { body: ['#1'], orderReferenceId: 'r', orderStatus: 'shipped' },
    );
    expect(components.some((c) => c.type === 'order_status')).toBe(false);
  });
});

describe('sendability of order status', () => {
  const approved = { template_type: 'order_status', status: 'APPROVED' };

  it('is sendable from a conversation', () => {
    expect(templateSendability(approved)).toEqual({ sendable: true });
    expect(templateSendability(approved, 'inbox')).toEqual({ sendable: true });
  });

  it('is refused in a broadcast, with the reason', () => {
    // One order reference cannot apply to a whole list — every recipient
    // would get the same order's status.
    const v = templateSendability(approved, 'broadcast');
    expect(v.sendable).toBe(false);
    expect(v.reason).toMatch(/one specific order/i);
  });

  it('does not affect other types in a broadcast', () => {
    expect(
      templateSendability({ template_type: 'default', status: 'APPROVED' }, 'broadcast'),
    ).toEqual({ sendable: true });
  });
});

describe('the send plan for an order status template', () => {
  const row = {
    name: 'order_shipped_update',
    category: 'Utility' as const,
    template_type: 'order_status',
    body_text: 'Your order has shipped.',
    components: [{ type: 'BODY', text: 'Your order has shipped.' }],
  };

  it('always needs input, even with no body variables', () => {
    const plan = buildSendPlan(row);
    expect(plan.isOrderStatus).toBe(true);
    expect(plan.bodyVarCount).toBe(0);
    expect(plan.needsNoInput).toBe(false);
  });

  it('asks for the reference id and the status', () => {
    const plan = buildSendPlan(row);
    expect(missingSendValues(plan, {})).toEqual([
      'The reference id of the order being updated',
      'The new order status',
    ]);
  });

  it('clears once both are supplied', () => {
    const plan = buildSendPlan(row);
    expect(
      missingSendValues(plan, {
        orderReferenceId: 'ref-1',
        orderStatus: 'shipped',
      }),
    ).toEqual([]);
  });

  it('offers exactly the statuses the send builder accepts', () => {
    // The list is duplicated on purpose — the builder is server-only and
    // the picker is a client component — so it has to be checked.
    expect(ORDER_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      ...ORDER_STATUS_VALUES,
    ]);
  });
});
