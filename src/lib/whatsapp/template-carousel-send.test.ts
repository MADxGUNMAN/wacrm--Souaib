/**
 * Sending a carousel template.
 *
 * The two rules Meta is unforgiving about — the card count must equal the
 * approved count, and card buttons are addressed by their index within
 * the card — are structural here rather than validated, because the cards
 * are built from the STORED components and the caller only fills them in.
 * These tests pin that down.
 */

import { describe, expect, it } from 'vitest';

import {
  buildCarouselSendComponents,
  buildSendComponents,
  carouselNeedsSendInput,
  type MetaSendCard,
} from './template-send-builder';
import type { TemplateComponent, TemplateDefinition } from './template-definition';
import type { MessageTemplate } from '@/types';

function card(over: {
  url?: string;
  body?: string;
  mediaUrl?: string | null;
  format?: 'IMAGE' | 'VIDEO';
  buttons?: TemplateComponent[];
} = {}) {
  const components: TemplateComponent[] = [
    {
      type: 'HEADER',
      format: over.format ?? 'IMAGE',
      ...(over.mediaUrl === null
        ? {}
        : { example: { header_url: [over.mediaUrl ?? 'https://x.test/a.jpg'] } }),
    },
  ];
  if (over.body) components.push({ type: 'BODY', text: over.body });
  if (over.url) {
    components.push({
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        { type: 'URL', text: 'Shop', url: over.url },
      ],
    });
  }
  return { components };
}

function definition(
  cards: { components: TemplateComponent[] }[],
  bodyText = 'Our range',
): TemplateDefinition {
  return {
    name: 'range',
    category: 'Marketing',
    language: 'en_US',
    template_type: 'carousel',
    parameter_format: 'POSITIONAL',
    components: [
      { type: 'BODY', text: bodyText },
      { type: 'CAROUSEL', cards },
    ] as TemplateComponent[],
  };
}

function cardsOf(components: ReturnType<typeof buildCarouselSendComponents>) {
  const carousel = components.find((c) => c.type === 'carousel');
  return (carousel && 'cards' in carousel ? carousel.cards : []) as MetaSendCard[];
}

describe('carouselNeedsSendInput', () => {
  it('is false for fixed cards — they send with no extra input', () => {
    expect(
      carouselNeedsSendInput(definition([card({ body: 'A' }), card({ body: 'B' })])),
    ).toBe(false);
  });

  it('is true when card text has a variable', () => {
    expect(
      carouselNeedsSendInput(definition([card({ body: 'A {{1}}' }), card()])),
    ).toBe(true);
  });

  it('is true when a card URL has a variable', () => {
    expect(
      carouselNeedsSendInput(
        definition([card({ url: 'https://x.test/{{1}}' }), card()]),
      ),
    ).toBe(true);
  });

  it('is false when a card URL is static', () => {
    expect(
      carouselNeedsSendInput(definition([card({ url: 'https://x.test' }), card()])),
    ).toBe(false);
  });

  it('is true when a card has no stored media URL to fall back on', () => {
    expect(carouselNeedsSendInput(definition([card({ mediaUrl: null }), card()]))).toBe(
      true,
    );
  });
});

describe('buildCarouselSendComponents', () => {
  it('emits one card per APPROVED card, indexed in order', () => {
    const out = buildCarouselSendComponents(
      definition([card(), card(), card()]),
    );
    const cards = cardsOf(out);
    expect(cards.map((c) => c.card_index)).toEqual([0, 1, 2]);
  });

  /**
   * The count is taken from the stored components, so extra params cannot
   * add cards and missing params cannot drop them. Sending the wrong
   * number is Meta error #132012, whose message names the header rather
   * than the count.
   */
  it('ignores extra card params rather than sending more cards', () => {
    const out = buildCarouselSendComponents(definition([card(), card()]), {
      cards: [{}, {}, {}, {}],
    });
    expect(cardsOf(out)).toHaveLength(2);
  });

  it('sends every card even when no params are supplied at all', () => {
    const out = buildCarouselSendComponents(definition([card(), card()]));
    expect(cardsOf(out)).toHaveLength(2);
  });

  it('falls back to the media URL stored at creation', () => {
    const out = buildCarouselSendComponents(
      definition([card({ mediaUrl: 'https://x.test/one.jpg' }), card()]),
    );
    expect(cardsOf(out)[0].components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://x.test/one.jpg' } }],
    });
  });

  it('lets a caller override the media per card', () => {
    const out = buildCarouselSendComponents(definition([card(), card()]), {
      cards: [{ headerMediaUrl: 'https://x.test/new.jpg' }],
    });
    expect(cardsOf(out)[0].components[0]).toMatchObject({
      parameters: [{ type: 'image', image: { link: 'https://x.test/new.jpg' } }],
    });
  });

  it('prefers a real media id over a link when given', () => {
    const out = buildCarouselSendComponents(definition([card(), card()]), {
      cards: [{ headerMediaId: '998877' }],
    });
    expect(cardsOf(out)[0].components[0]).toMatchObject({
      parameters: [{ type: 'image', image: { id: '998877' } }],
    });
  });

  it('marks a video card as video', () => {
    const out = buildCarouselSendComponents(
      definition([card({ format: 'VIDEO' }), card({ format: 'VIDEO' })]),
    );
    expect(cardsOf(out)[0].components[0]).toMatchObject({
      parameters: [{ type: 'video', video: { link: 'https://x.test/a.jpg' } }],
    });
  });

  it('supplies the top-level body variables', () => {
    const out = buildCarouselSendComponents(
      definition([card(), card()], 'Hi {{1}}, {{2}} off'),
      { body: ['Pat', '20%'] },
    );
    expect(out[0]).toEqual({
      type: 'body',
      parameters: [
        { type: 'text', text: 'Pat' },
        { type: 'text', text: '20%' },
      ],
    });
  });

  it('throws when the top-level body is under-supplied', () => {
    expect(() =>
      buildCarouselSendComponents(definition([card(), card()], 'Hi {{1}} {{2}}'), {
        body: ['Pat'],
      }),
    ).toThrow(/2 variable\(s\) but 1 value/);
  });

  it('omits a body component when the message body is static', () => {
    const out = buildCarouselSendComponents(definition([card(), card()]));
    expect(out.map((c) => c.type)).toEqual(['carousel']);
  });

  it('supplies card text variables per card', () => {
    const out = buildCarouselSendComponents(
      definition([card({ body: 'Aloe {{1}}' }), card({ body: 'Cactus {{1}}' })]),
      { cards: [{ body: ['Vera'] }, { body: ['Mini'] }] },
    );
    const cards = cardsOf(out);
    expect(cards[0].components[1]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'Vera' }],
    });
    expect(cards[1].components[1]).toMatchObject({
      parameters: [{ type: 'text', text: 'Mini' }],
    });
  });

  it('names the card when its text values are missing', () => {
    expect(() =>
      buildCarouselSendComponents(
        definition([card(), card({ body: 'Cactus {{1}}' })]),
      ),
    ).toThrow(/Card 2 text has 1 variable/);
  });

  /**
   * Button index is the position WITHIN the card. The quick reply sits at
   * 0 and the URL at 1, so the URL parameter must carry index "1" — using
   * 0 makes Meta report a missing URL parameter.
   */
  it('addresses a card URL button by its index within the card', () => {
    const out = buildCarouselSendComponents(
      definition([
        card({ url: 'https://x.test/{{1}}' }),
        card({ url: 'https://x.test/{{1}}' }),
      ]),
      {
        cards: [
          { buttonParams: { 1: 'aloe' } },
          { buttonParams: { 1: 'cactus' } },
        ],
      },
    );
    const first = cardsOf(out)[0];
    expect(first.components.find((c) => c.type === 'button')).toEqual({
      type: 'button',
      sub_type: 'url',
      index: '1',
      parameters: [{ type: 'text', text: 'aloe' }],
    });
  });

  it('emits nothing for a static URL button', () => {
    const out = buildCarouselSendComponents(
      definition([card({ url: 'https://x.test' }), card({ url: 'https://x.test' })]),
    );
    expect(
      cardsOf(out)[0].components.some((c) => c.type === 'button'),
    ).toBe(false);
  });

  it('names the card and button when a URL value is missing', () => {
    expect(() =>
      buildCarouselSendComponents(
        definition([
          card({ url: 'https://x.test/{{1}}' }),
          card({ url: 'https://x.test/{{1}}' }),
        ]),
      ),
    ).toThrow(/Card 1, button 2 has a URL variable/);
  });

  it('emits a quick-reply payload only when one is supplied', () => {
    const withPayload = buildCarouselSendComponents(
      definition([card({ url: 'https://x.test' }), card({ url: 'https://x.test' })]),
      { cards: [{ buttonParams: { 0: 'more-aloes' } }] },
    );
    expect(cardsOf(withPayload)[0].components).toContainEqual({
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: 'more-aloes' }],
    });
  });

  it('throws when a card has no media anywhere', () => {
    expect(() =>
      buildCarouselSendComponents(definition([card({ mediaUrl: null }), card()])),
    ).toThrow(/Card 1 needs a media link or id/);
  });
});

describe('buildSendComponents routes carousels', () => {
  it('detects a carousel from stored components, not the flat columns', () => {
    const template = {
      id: 't',
      user_id: 'u',
      name: 'range',
      category: 'Marketing',
      // Flat columns say "plain template" — components are authoritative.
      body_text: 'Our range',
      components: [
        { type: 'BODY', text: 'Our range' },
        { type: 'CAROUSEL', cards: [card(), card()] },
      ],
      created_at: '',
    } as unknown as MessageTemplate;

    const out = buildSendComponents(template);
    expect(out.map((c) => c.type)).toEqual(['carousel']);
    expect(cardsOf(out)).toHaveLength(2);
  });
});
