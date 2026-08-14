/**
 * Carousel templates: validation and the create payload.
 *
 * Meta's uniformity rules are the interesting part. Its rejection
 * messages for them are cryptic (a wrong card count comes back as
 * "header component parameter should not be empty"), so these are
 * enforced locally where the error can name the offending card — and
 * these tests are what keep those messages honest.
 */

import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateCarousel,
  validateTemplatePayload,
  type CarouselCardPayload,
  type TemplatePayload,
} from './template-validators';

function card(over: Partial<CarouselCardPayload> = {}): CarouselCardPayload {
  return {
    header_format: 'image',
    header_media_url: 'https://x.test/a.jpg',
    ...over,
  };
}

function carouselPayload(
  cards: CarouselCardPayload[],
  over: Partial<TemplatePayload> = {},
): TemplatePayload {
  return {
    name: 'summer_range',
    category: 'Marketing',
    language: 'en_US',
    body_text: 'Our new range is here.',
    cards,
    ...over,
  };
}

describe('validateCarousel — structure', () => {
  it('accepts a minimal two-card carousel', () => {
    expect(() =>
      validateCarousel(carouselPayload([card(), card()])),
    ).not.toThrow();
  });

  it('rejects fewer than two cards', () => {
    expect(() => validateCarousel(carouselPayload([card()]))).toThrow(
      /between 2 and 10 cards/,
    );
  });

  it('rejects more than ten cards', () => {
    expect(() =>
      validateCarousel(carouselPayload(Array.from({ length: 11 }, () => card()))),
    ).toThrow(/between 2 and 10 cards/);
  });

  it('requires the Marketing category', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card(), card()], { category: 'Utility' }),
      ),
    ).toThrow(/Marketing category/);
  });

  it('still requires the message body above the cards', () => {
    expect(() =>
      validateCarousel(carouselPayload([card(), card()], { body_text: '  ' })),
    ).toThrow(/Body text is required/);
  });

  it('requires example values for message body variables', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card(), card()], { body_text: 'Hi {{1}}' }),
      ),
    ).toThrow(/exactly that many example values/);
  });
});

describe('validateCarousel — uniformity', () => {
  it('rejects mixed header formats and names the card', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card(),
          card({ header_format: 'video', header_media_url: 'https://x.test/a.mp4' }),
        ]),
      ),
    ).toThrow(/Card 2 is a video but card 1 is a image/);
  });

  it('rejects a document or text header outright', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({ header_format: 'document' as unknown as 'image' }),
          card(),
        ]),
      ),
    ).toThrow(/image or a video/);
  });

  it('requires a sample media URL or handle on every card', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card(), card({ header_media_url: undefined })]),
      ),
    ).toThrow(/Card 2: add a sample image/);
  });

  it('rejects an invalid sample media URL', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card(), card({ header_media_url: 'not-a-url' })]),
      ),
    ).toThrow(/Card 2: the sample media URL is not a valid URL/);
  });

  /**
   * Meta needs body text on all cards or none so they render at equal
   * heights. Half-filled is the mistake an operator actually makes.
   */
  it('rejects body text on some cards but not others', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card({ body_text: 'One' }), card()]),
      ),
    ).toThrow(/Card 2 has no text, but other cards do/);
  });

  it('accepts body text on every card', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([card({ body_text: 'One' }), card({ body_text: 'Two' })]),
      ),
    ).not.toThrow();
  });

  it('caps card text at 160 characters', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({ body_text: 'x'.repeat(161) }),
          card({ body_text: 'ok' }),
        ]),
      ),
    ).toThrow(/exceeds 160 chars/);
  });

  it('requires example values for card text variables', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({ body_text: 'Buy {{1}}' }),
          card({ body_text: 'Buy {{1}}', body_samples: ['b'] }),
        ]),
      ),
    ).toThrow(/Card 1: has 1 variable/);
  });

  /**
   * The subtle one. At send time card buttons are addressed by index, so
   * if card 1 is [quick_reply, url] and card 2 is [url, quick_reply],
   * Meta rejects the send with a message about the URL parameter rather
   * than about the ordering.
   */
  it('rejects buttons that differ in order between cards', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({
            buttons: [
              { type: 'QUICK_REPLY', text: 'More' },
              { type: 'URL', text: 'Shop', url: 'https://x.test' },
            ],
          }),
          card({
            buttons: [
              { type: 'URL', text: 'Shop', url: 'https://x.test' },
              { type: 'QUICK_REPLY', text: 'More' },
            ],
          }),
        ]),
      ),
    ).toThrow(/must match card 1 in type and order/);
  });

  it('rejects a card with a different NUMBER of buttons', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({ buttons: [{ type: 'QUICK_REPLY', text: 'More' }] }),
          card({ buttons: [] }),
        ]),
      ),
    ).toThrow(/must match card 1 in type and order/);
  });

  it('caps buttons at two per card', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({
            buttons: [
              { type: 'QUICK_REPLY', text: 'A' },
              { type: 'QUICK_REPLY', text: 'B' },
              { type: 'QUICK_REPLY', text: 'C' },
            ],
          }),
          card(),
        ]),
      ),
    ).toThrow(/at most 2 buttons per card/);
  });

  it('rejects copy-code buttons, which carousels do not support', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({ buttons: [{ type: 'COPY_CODE', text: 'Copy', example: 'X' }] }),
          card({ buttons: [{ type: 'COPY_CODE', text: 'Copy', example: 'X' }] }),
        ]),
      ),
    ).toThrow(/quick reply, website and call buttons only/);
  });

  it('requires an example for a URL button with a variable', () => {
    expect(() =>
      validateCarousel(
        carouselPayload([
          card({
            buttons: [{ type: 'URL', text: 'Shop', url: 'https://x.test/{{1}}' }],
          }),
          card({
            buttons: [
              {
                type: 'URL',
                text: 'Shop',
                url: 'https://x.test/{{1}}',
                example: 'b',
              },
            ],
          }),
        ]),
      ),
    ).toThrow(/Card 1, button 1: uses a variable/);
  });
});

describe('validateTemplatePayload routes carousels correctly', () => {
  /**
   * A carousel has no top-level header or footer, so the standard header
   * rules must not run — otherwise a valid carousel would be rejected for
   * a header it is not allowed to have.
   */
  it('does not apply the standard header rules', () => {
    expect(() =>
      validateTemplatePayload(carouselPayload([card(), card()])),
    ).not.toThrow();
  });

  it('reports the message body variable count', () => {
    expect(
      validateTemplatePayload(
        carouselPayload([card(), card()], {
          body_text: 'Hi {{1}}, {{2}} off',
          sample_values: { body: ['Pat', '20%'] },
        }),
      ),
    ).toEqual({ bodyVarCount: 2, headerVarCount: 0 });
  });
});

describe('buildMetaTemplatePayload — carousel', () => {
  const payload = carouselPayload([
    card({
      header_handle: 'H1',
      body_text: 'Aloe {{1}}',
      body_samples: ['Vera'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        { type: 'URL', text: 'Shop', url: 'https://x.test/{{1}}', example: 'aloe' },
      ],
    }),
    card({
      header_handle: 'H2',
      body_text: 'Cactus {{1}}',
      body_samples: ['Mini'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        { type: 'URL', text: 'Shop', url: 'https://x.test/{{1}}', example: 'cactus' },
      ],
    }),
  ]);

  it('emits BODY then CAROUSEL, with no top-level header or footer', () => {
    const built = buildMetaTemplatePayload(payload);
    expect(built.components.map((c) => c.type)).toEqual(['BODY', 'CAROUSEL']);
  });

  it('nests each card with its own header, body and buttons', () => {
    const built = buildMetaTemplatePayload(payload);
    const carousel = built.components.find((c) => c.type === 'CAROUSEL');
    expect(carousel?.cards).toHaveLength(2);
    expect(carousel?.cards?.[0].components.map((c) => c.type)).toEqual([
      'HEADER',
      'BODY',
      'BUTTONS',
    ]);
  });

  it('uses header_handle for card media, never a URL', () => {
    const built = buildMetaTemplatePayload(payload);
    const first = built.components.find((c) => c.type === 'CAROUSEL')?.cards?.[0];
    const header = first?.components.find((c) => c.type === 'HEADER');
    expect(header).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['H1'] },
    });
  });

  it('wraps card body examples in the 2D array Meta expects', () => {
    const built = buildMetaTemplatePayload(payload);
    const first = built.components.find((c) => c.type === 'CAROUSEL')?.cards?.[0];
    expect(first?.components.find((c) => c.type === 'BODY')).toEqual({
      type: 'BODY',
      text: 'Aloe {{1}}',
      example: { body_text: [['Vera']] },
    });
  });

  it('marks a video card header as VIDEO', () => {
    const built = buildMetaTemplatePayload(
      carouselPayload([
        card({ header_format: 'video', header_handle: 'V1' }),
        card({ header_format: 'video', header_handle: 'V2' }),
      ]),
    );
    const header = built.components
      .find((c) => c.type === 'CAROUSEL')
      ?.cards?.[0].components.find((c) => c.type === 'HEADER');
    expect(header).toMatchObject({ format: 'VIDEO' });
  });

  it('omits a card BODY entirely when the card has no text', () => {
    const built = buildMetaTemplatePayload(
      carouselPayload([
        card({ header_handle: 'H1' }),
        card({ header_handle: 'H2' }),
      ]),
    );
    const first = built.components.find((c) => c.type === 'CAROUSEL')?.cards?.[0];
    expect(first?.components.map((c) => c.type)).toEqual(['HEADER']);
  });
});
