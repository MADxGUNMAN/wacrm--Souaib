import { describe, expect, it } from 'vitest';


import { templateSendability } from './template-sendability';

/**
 * These assertions are the reminder the compiler cannot give: when a
 * template type becomes sendable, its case is deleted from
 * templateSendability and the matching test here fails, forcing the
 * decision to be conscious.
 */
describe('templateSendability', () => {
  it('refuses anything not approved, whatever its type', () => {
    for (const status of ['DRAFT', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED']) {
      expect(
        templateSendability({ template_type: 'default', status }),
      ).toMatchObject({ sendable: false });
    }
  });

  it('allows approved standard templates', () => {
    expect(
      templateSendability({ template_type: 'default', status: 'APPROVED' }),
    ).toEqual({ sendable: true });
  });

  it('allows approved authentication templates', () => {
    // Auth sends through a dedicated builder but needs no extra operator
    // input beyond the code, so it is sendable.
    expect(
      templateSendability({ template_type: 'authentication', status: 'APPROVED' }),
    ).toEqual({ sendable: true });
  });

  it('treats a missing template_type as standard', () => {
    // Rows synced before migration 061 have no type; refusing them would
    // break sending for existing customers.
    expect(templateSendability({ status: 'APPROVED' })).toEqual({
      sendable: true,
    });
  });

  /**
   * Carousels used to be judged on their CONTENTS: a carousel of fixed
   * cards was sendable, one with per-card variables was not, because no
   * form collected those values. Both pickers now render the per-card
   * inputs described by `buildSendPlan`, so the distinction is gone and
   * every approved carousel is sendable.
   */
  describe('carousel', () => {
    const card = (over: Record<string, unknown> = {}) => ({
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_url: ['https://x.test/a.jpg'] },
        },
        ...(over.body ? [{ type: 'BODY', text: over.body }] : []),
        ...(over.url
          ? [
              {
                type: 'BUTTONS',
                buttons: [{ type: 'URL', text: 'Shop', url: over.url }],
              },
            ]
          : []),
      ],
    });

    const carousel = (cards: unknown[]) => ({
      template_type: 'carousel',
      status: 'APPROVED',
      name: 'c',
      category: 'Marketing' as const,
      components: [
        { type: 'BODY', text: 'Our range' },
        { type: 'CAROUSEL', cards },
      ],
    });

    it('allows a carousel whose cards are entirely static', () => {
      expect(
        templateSendability(carousel([card({ body: 'Aloe' }), card({ body: 'Cactus' })])),
      ).toEqual({ sendable: true });
    });

    it('allows a carousel with a variable in card text', () => {
      expect(
        templateSendability(
          carousel([card({ body: 'Aloe {{1}}' }), card({ body: 'Cactus' })]),
        ),
      ).toEqual({ sendable: true });
    });

    it('allows a carousel with a variable in a card URL button', () => {
      expect(
        templateSendability(
          carousel([
            card({ url: 'https://x.test/{{1}}' }),
            card({ url: 'https://x.test/{{1}}' }),
          ]),
        ),
      ).toEqual({ sendable: true });
    });

    it('allows a carousel whose card has no stored media URL', () => {
      // The picker now asks for a link per card, so a card with nothing
      // to fall back on is a form to fill in rather than a dead end.
      expect(
        templateSendability(
          carousel([{ components: [{ type: 'HEADER', format: 'IMAGE' }] }, card()]),
        ),
      ).toEqual({ sendable: true });
    });
  });

  it('allows approved limited-time offers', () => {
    // The pickers collect the per-message expiry, so the block is gone.
    expect(
      templateSendability({
        template_type: 'limited_time_offer',
        status: 'APPROVED',
      }),
    ).toEqual({ sendable: true });
  });

  it('allows approved order status updates from a conversation', () => {
    // The inbox picker collects the order reference and the new status.
    // Broadcasts still refuse them — see template-order-status.test.ts,
    // which owns the context-dependent half of this verdict.
    expect(
      templateSendability({ template_type: 'order_status', status: 'APPROVED' }),
    ).toEqual({ sendable: true });
  });

  /**
   * NOTHING IS BLOCKED BY TYPE ANY MORE.
   *
   * Catalogue, multi-product, order details and calling permission are all
   * built now. Each still depends on WhatsApp ACCOUNT setup — a linked
   * catalogue, WhatsApp Pay, voice calling — but that is Meta's gate, not
   * ours: the template is legitimate to create and submit, and Meta returns
   * a specific error if the account is not ready. Refusing them here would
   * hide a working feature from an account that IS ready.
   *
   * The only refusals left are "not approved yet" and the two shapes that
   * cannot be broadcast because they address one specific order.
   */
  it.each([
    'catalogue',
    'multi_product',
    'order_details',
    'calling_permission_request',
  ])('allows approved %s templates from a conversation', (type) => {
    expect(
      templateSendability({ template_type: type, status: 'APPROVED' }),
    ).toEqual({ sendable: true });
  });

  it.each(['order_status', 'order_details'])(
    'refuses %s in a broadcast, with the reason',
    (type) => {
      // Both address ONE order, so one set of values cannot serve a list.
      const v = templateSendability(
        { template_type: type, status: 'APPROVED' },
        'broadcast',
      );
      expect(v.sendable).toBe(false);
      expect(v.reason).toBeTruthy();
    },
  );
});
