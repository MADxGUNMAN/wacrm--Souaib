/**
 * Limited-time offer templates: validation, create payload, send payload.
 *
 * Several limits here are TIGHTER than a normal template's and two payload
 * details differ from every other template type. Both are the sort of
 * thing that comes back from Meta as an unhelpful rejection, so they are
 * pinned down here.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateLimitedTimeOffer,
  validateTemplatePayload,
  type TemplatePayload,
} from './template-validators';
import { buildSendComponents } from './template-send-builder';
import type { MessageTemplate } from '@/types';

function ltoPayload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'flash_sale',
    category: 'Marketing',
    language: 'en_US',
    body_text: 'Use code {{1}} for 25% off.',
    sample_values: { body: ['SAVE25'] },
    offer: { text: 'Expiring offer!', has_expiration: true },
    buttons: [{ type: 'COPY_CODE', text: 'Copy code', example: 'SAVE25' }],
    ...over,
  };
}

describe('validateLimitedTimeOffer', () => {
  it('accepts a minimal offer', () => {
    expect(() => validateLimitedTimeOffer(ltoPayload())).not.toThrow();
  });

  it('requires the Marketing category', () => {
    expect(() =>
      validateLimitedTimeOffer(ltoPayload({ category: 'Utility' })),
    ).toThrow(/Marketing category/);
  });

  /** Meta supports no footer at all on this type. */
  it('rejects a footer', () => {
    expect(() =>
      validateLimitedTimeOffer(ltoPayload({ footer_text: 'Reply STOP' })),
    ).toThrow(/cannot have a footer/);
  });

  it('enforces the 16-character offer label', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({ offer: { text: 'x'.repeat(17), has_expiration: true } }),
      ),
    ).toThrow(/16 characters or fewer/);
  });

  it('requires an offer label', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({ offer: { text: '  ', has_expiration: true } }),
      ),
    ).toThrow(/offer label/);
  });

  /**
   * The trap: 601 characters is fine on a normal template and rejected
   * here.
   */
  it('enforces the tighter 600-character body limit', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({ body_text: 'x'.repeat(601), sample_values: { body: [] } }),
      ),
    ).toThrow(/exceeds 600 chars/);
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({ body_text: 'x'.repeat(600), sample_values: { body: [] } }),
      ),
    ).not.toThrow();
  });

  it('requires exactly one copy-code button', () => {
    expect(() => validateLimitedTimeOffer(ltoPayload({ buttons: [] }))).toThrow(
      /exactly one copy-code button/,
    );
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          buttons: [
            { type: 'COPY_CODE', text: 'a', example: 'A' },
            { type: 'COPY_CODE', text: 'b', example: 'B' },
          ],
        }),
      ),
    ).toThrow(/exactly one copy-code button/);
  });

  it('rejects button types it does not support', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          buttons: [
            { type: 'COPY_CODE', text: 'c', example: 'C' },
            { type: 'QUICK_REPLY', text: 'More' },
          ],
        }),
      ),
    ).toThrow(/copy-code button and an optional website button only/);
  });

  it('enforces the 15-character offer code', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          buttons: [
            { type: 'COPY_CODE', text: 'c', example: 'x'.repeat(16) },
          ],
        }),
      ),
    ).toThrow(/15 characters or fewer/);
  });

  it('allows image and video headers but nothing else', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          header_type: 'image',
          header_media_url: 'https://x.test/a.jpg',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({ header_type: 'text', header_content: 'Hi' }),
      ),
    ).toThrow(/image or a video/);
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          header_type: 'document',
          header_media_url: 'https://x.test/a.pdf',
        }),
      ),
    ).toThrow(/image or a video/);
  });

  it('requires an example for a URL button with a variable', () => {
    expect(() =>
      validateLimitedTimeOffer(
        ltoPayload({
          buttons: [
            { type: 'COPY_CODE', text: 'c', example: 'C' },
            { type: 'URL', text: 'Shop', url: 'https://x.test/{{1}}' },
          ],
        }),
      ),
    ).toThrow(/needs an example value/);
  });

  it('is reached from validateTemplatePayload without the standard rules', () => {
    // The standard path would demand nothing extra here, but it must not
    // apply the 1024 body limit or allow a footer.
    expect(() => validateTemplatePayload(ltoPayload())).not.toThrow();
    expect(
      validateTemplatePayload(ltoPayload()),
    ).toEqual({ bodyVarCount: 1, headerVarCount: 0 });
  });
});

describe('buildMetaTemplatePayload — limited-time offer', () => {
  it('orders components HEADER → LIMITED_TIME_OFFER → BODY → BUTTONS', () => {
    const built = buildMetaTemplatePayload(
      ltoPayload({
        header_type: 'image',
        header_handle: 'H1',
        header_media_url: 'https://x.test/a.jpg',
      }),
    );
    expect(built.components.map((c) => c.type)).toEqual([
      'HEADER',
      'LIMITED_TIME_OFFER',
      'BODY',
      'BUTTONS',
    ]);
  });

  it('omits the header when there is none', () => {
    const built = buildMetaTemplatePayload(ltoPayload());
    expect(built.components.map((c) => c.type)).toEqual([
      'LIMITED_TIME_OFFER',
      'BODY',
      'BUTTONS',
    ]);
  });

  it('carries the offer label and expiration flag', () => {
    const built = buildMetaTemplatePayload(
      ltoPayload({ offer: { text: 'Ends soon!', has_expiration: false } }),
    );
    expect(built.components[0]).toEqual({
      type: 'LIMITED_TIME_OFFER',
      limited_time_offer: { text: 'Ends soon!', has_expiration: false },
    });
  });

  /**
   * Meta's limited-time-offer reference specifies the copy-code button's
   * `example` as a bare STRING here, unlike the one-element array used on
   * every other template type, and carries no label.
   */
  it('emits the copy-code example as a string, not an array', () => {
    const built = buildMetaTemplatePayload(ltoPayload());
    const buttons = built.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons?.[0]).toEqual({
      type: 'COPY_CODE',
      example: 'SAVE25',
    });
  });

  it('keeps a website button in the normal array-example shape', () => {
    const built = buildMetaTemplatePayload(
      ltoPayload({
        buttons: [
          { type: 'COPY_CODE', text: 'c', example: 'SAVE25' },
          {
            type: 'URL',
            text: 'Shop',
            url: 'https://x.test/{{1}}',
            example: 'sale',
          },
        ],
      }),
    );
    const buttons = built.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons?.[1]).toEqual({
      type: 'URL',
      text: 'Shop',
      url: 'https://x.test/{{1}}',
      example: ['sale'],
    });
  });
});

describe('sending a limited-time offer', () => {
  afterEach(() => vi.useRealTimers());

  const template = {
    id: 't',
    user_id: 'u',
    name: 'flash_sale',
    category: 'Marketing',
    body_text: 'Use code {{1}} for 25% off.',
    components: [
      {
        type: 'LIMITED_TIME_OFFER',
        limited_time_offer: { text: 'Expiring offer!', has_expiration: true },
      },
      { type: 'BODY', text: 'Use code {{1}} for 25% off.' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'COPY_CODE', text: 'Copy code', example: ['SAVE25'] },
          { type: 'URL', text: 'Shop', url: 'https://x.test/{{1}}' },
        ],
      },
    ],
    created_at: '',
  } as unknown as MessageTemplate;

  const future = Date.now() + 3_600_000;

  it('emits the offer expiry in milliseconds', () => {
    const out = buildSendComponents(template, {
      body: ['SAVE25'],
      offerExpiresAtMs: future,
      buttonParams: { 1: 'sale' },
    });
    expect(out).toContainEqual({
      type: 'limited_time_offer',
      parameters: [
        {
          type: 'limited_time_offer',
          limited_time_offer: { expiration_time_ms: future },
        },
      ],
    });
  });

  it('refuses to send without an expiry rather than inventing one', () => {
    // Guessing a deadline would promise the customer something untrue.
    expect(() =>
      buildSendComponents(template, { body: ['SAVE25'], buttonParams: { 1: 's' } }),
    ).toThrow(/needs an expiry time/);
  });

  it('refuses an expiry already in the past', () => {
    expect(() =>
      buildSendComponents(template, {
        body: ['SAVE25'],
        offerExpiresAtMs: Date.now() - 1000,
        buttonParams: { 1: 's' },
      }),
    ).toThrow(/already-expired offer/);
  });

  it('falls back to the approved code when none is supplied', () => {
    const out = buildSendComponents(template, {
      body: ['SAVE25'],
      offerExpiresAtMs: future,
      buttonParams: { 1: 'sale' },
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'copy_code',
      index: '0',
      parameters: [{ type: 'coupon_code', coupon_code: 'SAVE25' }],
    });
  });

  it('lets the caller override the code per send', () => {
    const out = buildSendComponents(template, {
      body: ['DIWALI'],
      offerExpiresAtMs: future,
      buttonParams: { 0: 'DIWALI30', 1: 'sale' },
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'copy_code',
      index: '0',
      parameters: [{ type: 'coupon_code', coupon_code: 'DIWALI30' }],
    });
  });

  /**
   * Meta's rule: with a copy-code button present the website button is
   * index 1. Using 0 makes Meta report a missing URL parameter.
   */
  it('puts the website button at index 1, after the copy-code button', () => {
    const out = buildSendComponents(template, {
      body: ['SAVE25'],
      offerExpiresAtMs: future,
      buttonParams: { 1: 'sale' },
    });
    expect(out).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '1',
      parameters: [{ type: 'text', text: 'sale' }],
    });
  });

  it('throws when the URL variable has no value', () => {
    expect(() =>
      buildSendComponents(template, {
        body: ['SAVE25'],
        offerExpiresAtMs: future,
      }),
    ).toThrow(/website button URL has a variable/);
  });
});
