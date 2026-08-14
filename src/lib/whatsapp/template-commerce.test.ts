import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateTemplatePayload,
  type TemplatePayload,
} from './template-validators';
import { buildSendComponents } from './template-send-builder';
import { buildSendPlan, missingSendValues } from './template-send-inputs';
import { templateSendability } from './template-sendability';
import type { MessageTemplate } from '@/types';

/**
 * The three commerce shapes and the calling-permission request.
 *
 * Each is gated on WhatsApp ACCOUNT setup the app cannot do — a linked
 * catalogue, WhatsApp Pay, voice calling. That gate is Meta's, not ours, so
 * these templates are buildable and sendable here and the account
 * requirement is stated in the editor. What these tests protect is the
 * shape: each has one rule that comes back from Meta as an unhelpful
 * component error if broken.
 */

function payload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'shop_our_range',
    category: 'Marketing',
    language: 'en_US',
    body_text: 'Shop our latest range on WhatsApp.',
    ...over,
  };
}

function row(over: Record<string, unknown> = {}): MessageTemplate {
  return {
    id: 't1',
    account_id: 'a1',
    user_id: 'u1',
    name: 'shop_our_range',
    category: 'Marketing',
    language: 'en_US',
    status: 'APPROVED',
    body_text: 'Shop our latest range on WhatsApp.',
    created_at: '',
    updated_at: '',
    ...over,
  } as unknown as MessageTemplate;
}

// ============================================================
// Catalogue
// ============================================================

describe('catalogue templates', () => {
  const catalogue = (over: Partial<TemplatePayload> = {}) =>
    payload({ catalog: { text: 'View catalogue' }, ...over });

  it('emits one CATALOG button and no header', () => {
    // Meta builds the header from a product image, so ours must be absent.
    const out = buildMetaTemplatePayload(catalogue());
    expect(out.components).toEqual([
      { type: 'BODY', text: 'Shop our latest range on WhatsApp.' },
      { type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'View catalogue' }] },
    ]);
  });

  it('refuses a header', () => {
    expect(() =>
      validateTemplatePayload(
        catalogue({ header_type: 'text', header_content: 'Shop' }),
      ),
    ).toThrow(/cannot have a header/i);
  });

  it('refuses the Utility category', () => {
    expect(() =>
      validateTemplatePayload(catalogue({ category: 'Utility' })),
    ).toThrow(/Marketing category/i);
  });

  it('refuses extra buttons', () => {
    expect(() =>
      validateTemplatePayload(
        catalogue({ buttons: [{ type: 'QUICK_REPLY', text: 'No thanks' }] }),
      ),
    ).toThrow(/only its own button/i);
  });

  it('sends with sub_type catalog and an optional thumbnail', () => {
    const components = buildSendComponents(
      row({
        components: [
          { type: 'BODY', text: 'Shop our latest range on WhatsApp.' },
          { type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'View catalogue' }] },
        ],
      }),
      { catalogThumbnailProductId: '2lc20305pt' },
    );
    expect(components.at(-1)).toEqual({
      type: 'button',
      sub_type: 'catalog',
      index: '0',
      parameters: [
        { type: 'action', action: { thumbnail_product_retailer_id: '2lc20305pt' } },
      ],
    });
  });

  it('needs no input — the thumbnail is optional', () => {
    // Meta falls back to the first item in the catalogue.
    const plan = buildSendPlan({
      name: 'shop_our_range',
      category: 'Marketing',
      body_text: 'Shop our latest range on WhatsApp.',
      components: [
        { type: 'BODY', text: 'Shop our latest range on WhatsApp.' },
        { type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'View catalogue' }] },
      ],
    });
    expect(plan.commerce).toBe('catalog');
    expect(plan.needsNoInput).toBe(true);
  });
});

// ============================================================
// Multi-product
// ============================================================

describe('multi-product templates', () => {
  const mpm = (over: Partial<TemplatePayload> = {}) =>
    payload({
      mpm: { text: 'View items' },
      header_type: 'text',
      header_content: 'Forget something?',
      ...over,
    });

  it('REQUIRES a text header', () => {
    // The one rule unique to this shape — every other type treats a header
    // as optional, so its absence returns a generic component error.
    expect(() =>
      validateTemplatePayload(
        mpm({ header_type: undefined, header_content: undefined }),
      ),
    ).toThrow(/require a text header/i);
  });

  it('emits header, body and one MPM button', () => {
    const out = buildMetaTemplatePayload(mpm());
    expect(out.components.map((c) => c.type)).toEqual([
      'HEADER',
      'BODY',
      'BUTTONS',
    ]);
    const buttons = out.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons).toEqual([{ type: 'MPM', text: 'View items' }]);
  });

  const mpmRow = () =>
    row({
      header_type: 'text',
      header_content: 'Forget something?',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Forget something?' },
        { type: 'BODY', text: 'Shop our latest range on WhatsApp.' },
        { type: 'BUTTONS', buttons: [{ type: 'MPM', text: 'View items' }] },
      ],
    });

  it('sends sections and products', () => {
    const components = buildSendComponents(mpmRow(), {
      mpm: {
        thumbnailProductId: 'thumb1',
        sections: [
          { title: 'Best sellers', productIds: ['a1', 'a2'] },
          { title: 'New in', productIds: ['b1'] },
        ],
      },
    });
    expect(components.at(-1)).toEqual({
      type: 'button',
      sub_type: 'mpm',
      index: '0',
      parameters: [
        {
          type: 'action',
          action: {
            thumbnail_product_retailer_id: 'thumb1',
            sections: [
              {
                title: 'Best sellers',
                product_items: [
                  { product_retailer_id: 'a1' },
                  { product_retailer_id: 'a2' },
                ],
              },
              { title: 'New in', product_items: [{ product_retailer_id: 'b1' }] },
            ],
          },
        },
      ],
    });
  });

  it('refuses a send with no products, because the template stores none', () => {
    expect(() => buildSendComponents(mpmRow(), {})).toThrow(/at least one section/i);
  });

  it('enforces the 30-product cap across ALL sections, not per section', () => {
    const sections = Array.from({ length: 4 }, (_, s) => ({
      title: `S${s}`,
      productIds: Array.from({ length: 8 }, (_, p) => `p${s}-${p}`),
    }));
    expect(() =>
      buildSendComponents(mpmRow(), { mpm: { sections } }),
    ).toThrow(/at most 30 products/i);
  });

  it('can never be sent without input', () => {
    const plan = buildSendPlan({
      name: 'x',
      category: 'Marketing',
      body_text: 'b',
      components: [
        { type: 'BODY', text: 'b' },
        { type: 'BUTTONS', buttons: [{ type: 'MPM', text: 'View items' }] },
      ],
    });
    expect(plan.commerce).toBe('mpm');
    expect(plan.needsNoInput).toBe(false);
    expect(missingSendValues(plan, {})).toContain('At least one product to show');
  });
});

// ============================================================
// Order details (invoice)
// ============================================================

describe('order details templates', () => {
  const orderDetails = (over: Partial<TemplatePayload> = {}) =>
    payload({
      category: 'Utility',
      order_details: { text: 'Review and pay' },
      ...over,
    });

  it('emits one ORDER_DETAILS button', () => {
    const out = buildMetaTemplatePayload(orderDetails());
    const buttons = out.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons).toEqual([
      { type: 'ORDER_DETAILS', text: 'Review and pay' },
    ]);
  });

  it('requires the Utility category', () => {
    expect(() =>
      validateTemplatePayload(orderDetails({ category: 'Marketing' })),
    ).toThrow(/Utility category/i);
  });

  const odRow = () =>
    row({
      category: 'Utility',
      components: [
        { type: 'BODY', text: 'Shop our latest range on WhatsApp.' },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'ORDER_DETAILS', text: 'Review and pay' }],
        },
      ],
    });

  it('converts money to Meta’s offset/value form', () => {
    // THE dangerous detail: `value` is in MINOR units. 250 with offset 100
    // is ₹2.50, so a raw pass-through would bill 100x wrong.
    const components = buildSendComponents(odRow(), {
      orderDetails: {
        referenceId: 'ORD-1',
        currency: 'inr',
        items: [{ name: 'Tea', amount: 250, quantity: 2 }],
        taxAmount: 50,
      },
    });
    const action = (
      components.at(-1) as unknown as {
        parameters: { action: { order_details: Record<string, unknown> } }[];
      }
    ).parameters[0].action.order_details;

    expect(action.currency).toBe('INR');
    expect(action.total_amount).toEqual({ offset: 100, value: 55000 });
    expect((action.order as Record<string, unknown>).subtotal).toEqual({
      offset: 100,
      value: 50000,
    });
  });

  it('rounds rather than truncates', () => {
    // 19.99 * 100 is 1998.9999… in floating point; truncating undercharges.
    const components = buildSendComponents(odRow(), {
      orderDetails: {
        referenceId: 'ORD-2',
        currency: 'INR',
        items: [{ name: 'Item', amount: 19.99, quantity: 1 }],
      },
    });
    const action = (
      components.at(-1) as {
        parameters: { action: { order_details: { total_amount: unknown } } }[];
      }
    ).parameters[0].action.order_details;
    expect(action.total_amount).toEqual({ offset: 100, value: 1999 });
  });

  it('computes the total instead of trusting one', () => {
    // Meta rejects total ≠ subtotal + tax + shipping − discount, and a
    // mismatch shows up as a wrong charge rather than an error.
    const components = buildSendComponents(odRow(), {
      orderDetails: {
        referenceId: 'ORD-3',
        currency: 'INR',
        items: [{ name: 'A', amount: 100, quantity: 1 }],
        taxAmount: 10,
        shippingAmount: 20,
        discountAmount: 30,
      },
    });
    const action = (
      components.at(-1) as {
        parameters: { action: { order_details: { total_amount: unknown } } }[];
      }
    ).parameters[0].action.order_details;
    expect(action.total_amount).toEqual({ offset: 100, value: 10000 });
  });

  it('refuses an invoice with no items or a zero total', () => {
    expect(() => buildSendComponents(odRow(), {})).toThrow(/needs the invoice/i);
    expect(() =>
      buildSendComponents(odRow(), {
        orderDetails: {
          referenceId: 'ORD-4',
          currency: 'INR',
          items: [{ name: 'A', amount: 100, quantity: 1 }],
          discountAmount: 100,
        },
      }),
    ).toThrow(/more than zero/i);
  });

  it('is sendable from a conversation but not a broadcast', () => {
    // One invoice belongs to one customer.
    const t = { template_type: 'order_details', status: 'APPROVED' };
    expect(templateSendability(t)).toEqual({ sendable: true });
    expect(templateSendability(t, 'broadcast').sendable).toBe(false);
  });
});

// ============================================================
// Calling permission request
// ============================================================

describe('calling permission requests', () => {
  const callPermission = (over: Partial<TemplatePayload> = {}) =>
    payload({
      category: 'Utility',
      sub_category: 'CALL_PERMISSION_REQUEST',
      body_text: 'May we call you about your order?',
      ...over,
    });

  it('emits NO buttons — WhatsApp adds the consent options', () => {
    const out = buildMetaTemplatePayload(callPermission());
    expect(out.sub_category).toBe('CALL_PERMISSION_REQUEST');
    expect(out.components.some((c) => c.type === 'BUTTONS')).toBe(false);
  });

  it('allows a text header but not a media one', () => {
    expect(() =>
      validateTemplatePayload(
        callPermission({ header_type: 'text', header_content: 'Can we call?' }),
      ),
    ).not.toThrow();
    expect(() =>
      validateTemplatePayload(
        callPermission({
          header_type: 'image',
          header_media_url: 'https://x.test/a.jpg',
        }),
      ),
    ).toThrow(/text header, or none/i);
  });

  it('requires the Utility category', () => {
    expect(() =>
      validateTemplatePayload(callPermission({ category: 'Marketing' })),
    ).toThrow(/Utility category/i);
  });

  it('needs nothing at send time', () => {
    const plan = buildSendPlan({
      name: 'call_permission',
      category: 'Utility',
      template_type: 'calling_permission_request',
      body_text: 'May we call you about your order?',
      components: [{ type: 'BODY', text: 'May we call you about your order?' }],
    });
    expect(plan.needsNoInput).toBe(true);
    expect(
      templateSendability({
        template_type: 'calling_permission_request',
        status: 'APPROVED',
      }),
    ).toEqual({ sendable: true });
  });
});
