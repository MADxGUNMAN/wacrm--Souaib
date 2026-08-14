import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSendPlan,
  defaultOfferExpiryLocal,
  localInputToMs,
  missingSendValues,
  msToLocalInput,
} from './template-send-inputs';
import type { TemplateRowLike } from './template-definition';

/**
 * The plan is what the send-time forms render, so its job is to agree
 * with `template-send-builder.ts` about which values are required. Where a
 * test below asserts something is required, the builder throws without
 * it — that pairing is the point, since a disagreement means either a
 * form field nobody needs or a send that fails after the operator was
 * told everything was filled in.
 */

function row(over: Partial<TemplateRowLike> = {}): TemplateRowLike {
  return {
    name: 't',
    category: 'Marketing',
    body_text: 'Hello',
    ...over,
  };
}

const IMG = 'https://x.test/a.jpg';

function mediaHeader(url?: string) {
  return {
    type: 'HEADER',
    format: 'IMAGE',
    ...(url ? { example: { header_url: [url] } } : {}),
  };
}

function card(over: { body?: string; url?: string; media?: string | null } = {}) {
  const media = over.media === null ? undefined : (over.media ?? IMG);
  return {
    components: [
      mediaHeader(media),
      ...(over.body ? [{ type: 'BODY', text: over.body }] : []),
      ...(over.url
        ? [{ type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Shop', url: over.url }] }]
        : []),
    ],
  };
}

describe('buildSendPlan', () => {
  it('reports nothing to fill in for a fully static template', () => {
    const plan = buildSendPlan(
      row({ components: [{ type: 'BODY', text: 'No variables here' }] }),
    );
    expect(plan.needsNoInput).toBe(true);
    expect(plan.bodyVarCount).toBe(0);
    expect(plan.offer).toBeNull();
    expect(plan.cards).toEqual([]);
  });

  it('counts body and header variables', () => {
    const plan = buildSendPlan(
      row({
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Re: {{1}}' },
          { type: 'BODY', text: 'Hi {{1}}, your {{2}} is ready' },
        ],
      }),
    );
    expect(plan.bodyVarCount).toBe(2);
    expect(plan.headerVarCount).toBe(1);
    expect(plan.needsNoInput).toBe(false);
  });

  it('treats a media header with a stored URL as needing no input', () => {
    // It rides along on every send using the approved sample, exactly as
    // the send builder does.
    const plan = buildSendPlan(
      row({ components: [mediaHeader(IMG), { type: 'BODY', text: 'Static' }] }),
    );
    expect(plan.headerMedia).toEqual({ format: 'IMAGE', defaultUrl: IMG });
    expect(plan.needsNoInput).toBe(true);
  });

  it('requires a media link when the template stored none', () => {
    const plan = buildSendPlan(
      row({ components: [mediaHeader(undefined), { type: 'BODY', text: 'Static' }] }),
    );
    expect(plan.headerMedia).toEqual({ format: 'IMAGE', defaultUrl: undefined });
    expect(plan.needsNoInput).toBe(false);
    expect(missingSendValues(plan, {})).toContain('A image for the header');
  });

  it('ignores header_handle as a send-time default', () => {
    // A creation-time upload handle is not a send-time media id; offering
    // it as a default would produce a send Meta rejects.
    const plan = buildSendPlan(
      row({
        components: [
          { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::abc'] } },
          { type: 'BODY', text: 'Static' },
        ],
      }),
    );
    expect(plan.headerMedia?.defaultUrl).toBeUndefined();
  });

  it('lists only URL buttons that carry a variable', () => {
    const plan = buildSendPlan(
      row({
        components: [
          { type: 'BODY', text: 'Static' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'URL', text: 'Home', url: 'https://x.test/' },
              { type: 'URL', text: 'Track', url: 'https://x.test/{{1}}' },
              { type: 'QUICK_REPLY', text: 'Stop' },
              { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+100' },
            ],
          },
        ],
      }),
    );
    expect(plan.urlButtons).toEqual([
      { index: 1, text: 'Track', url: 'https://x.test/{{1}}' },
    ]);
  });

  it('shows no body variables for an authentication template', () => {
    // Meta owns the wording; the synthesised body_text contains {{1}} but
    // the operator supplies a code, not a body variable.
    const plan = buildSendPlan(
      row({
        category: 'Authentication',
        template_type: 'authentication',
        body_text: '{{1}} is your verification code.',
      }),
    );
    expect(plan.isAuthentication).toBe(true);
    expect(plan.bodyVarCount).toBe(0);
    expect(plan.needsNoInput).toBe(false);
    expect(missingSendValues(plan, {})).toEqual(['The one-time code']);
    expect(missingSendValues(plan, { body: ['428913'] })).toEqual([]);
  });

  describe('limited-time offer', () => {
    const offerRow = (opts: { hasExpiration?: boolean; code?: string } = {}) =>
      row({
        template_type: 'limited_time_offer',
        components: [
          { type: 'BODY', text: 'Flash sale' },
          {
            type: 'LIMITED_TIME_OFFER',
            limited_time_offer: {
              text: '10% off',
              has_expiration: opts.hasExpiration ?? true,
            },
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'COPY_CODE',
                text: 'Copy code',
                ...(opts.code ? { example: [opts.code] } : {}),
              },
            ],
          },
        ],
      });

    it('always needs input, because the expiry has no default', () => {
      const plan = buildSendPlan(offerRow({ code: 'SAVE10' }));
      expect(plan.needsNoInput).toBe(false);
      expect(plan.offer).toMatchObject({ text: '10% off', hasExpiration: true });
      expect(missingSendValues(plan, {})).toContain(
        'The offer expiry date and time',
      );
    });

    it('needs the expiry even without a countdown', () => {
      // has_expiration only controls whether the countdown is DISPLAYED.
      const plan = buildSendPlan(offerRow({ hasExpiration: false, code: 'X' }));
      expect(plan.offer?.hasExpiration).toBe(false);
      expect(missingSendValues(plan, {})).toContain(
        'The offer expiry date and time',
      );
    });

    it('rejects an expiry in the past', () => {
      const plan = buildSendPlan(offerRow({ code: 'SAVE10' }));
      const missing = missingSendValues(plan, {
        offerExpiresAtMs: Date.now() - 1000,
      });
      expect(missing.some((m) => /future/.test(m))).toBe(true);
    });

    it('accepts a future expiry when the code has an approved default', () => {
      const plan = buildSendPlan(offerRow({ code: 'SAVE10' }));
      expect(plan.offer?.code).toMatchObject({ defaultCode: 'SAVE10' });
      expect(
        missingSendValues(plan, { offerExpiresAtMs: Date.now() + 60_000 }),
      ).toEqual([]);
    });

    it('requires a code when the template carries no default', () => {
      const plan = buildSendPlan(offerRow());
      expect(
        missingSendValues(plan, { offerExpiresAtMs: Date.now() + 60_000 }),
      ).toEqual(['The offer code']);
    });

    it('does not present the offer code twice', () => {
      // It belongs to the offer block, not the generic copy-code list.
      const plan = buildSendPlan(offerRow({ code: 'SAVE10' }));
      expect(plan.copyCodeButtons).toEqual([]);
    });
  });

  describe('carousel', () => {
    const carouselRow = (cards: unknown[], topBody = 'Our range') =>
      row({
        template_type: 'carousel',
        components: [
          { type: 'BODY', text: topBody },
          { type: 'CAROUSEL', cards },
        ],
      });

    it('needs no input when every card is static with stored media', () => {
      const plan = buildSendPlan(carouselRow([card({ body: 'A' }), card({ body: 'B' })]));
      expect(plan.needsNoInput).toBe(true);
      expect(plan.cards).toHaveLength(2);
      expect(missingSendValues(plan, {})).toEqual([]);
    });

    it('describes each card in approved order', () => {
      const plan = buildSendPlan(
        carouselRow([
          card({ body: 'Aloe {{1}}' }),
          card({ url: 'https://x.test/{{1}}' }),
        ]),
      );
      expect(plan.cards[0]).toMatchObject({
        cardIndex: 0,
        bodyVarCount: 1,
        urlButtons: [],
      });
      expect(plan.cards[1]).toMatchObject({
        cardIndex: 1,
        bodyVarCount: 0,
        urlButtons: [{ index: 0, text: 'Shop' }],
      });
    });

    it('names the card in every missing-value message', () => {
      // "A media link is required" on a ten-card carousel is not
      // actionable; the card number is the whole point.
      const plan = buildSendPlan(
        carouselRow([
          card({ body: 'Aloe {{1}}' }),
          card({ media: null }),
          card({ url: 'https://x.test/{{1}}' }),
        ]),
      );
      const missing = missingSendValues(plan, {});
      expect(missing).toContain('Card 1: variable {{1}}');
      expect(missing).toContain('Card 2: a image link');
      expect(missing).toContain('Card 3: link value for "Shop"');
    });

    it('clears once each card is filled in', () => {
      const plan = buildSendPlan(
        carouselRow([card({ body: 'Aloe {{1}}' }), card({ url: 'https://x.test/{{1}}' })]),
      );
      expect(
        missingSendValues(plan, {
          cards: [{ body: ['fresh'] }, { buttonParams: { 0: 'aloe-2' } }],
        }),
      ).toEqual([]);
    });

    it('still requires the top-level body variables', () => {
      const plan = buildSendPlan(carouselRow([card(), card()], 'Hi {{1}}'));
      expect(plan.bodyVarCount).toBe(1);
      expect(missingSendValues(plan, {})).toContain('Message variable {{1}}');
    });
  });

  it('treats whitespace as unfilled', () => {
    const plan = buildSendPlan(row({ components: [{ type: 'BODY', text: 'Hi {{1}}' }] }));
    expect(missingSendValues(plan, { body: ['   '] })).toEqual([
      'Message variable {{1}}',
    ]);
  });
});

describe('datetime-local conversion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a local wall-clock time', () => {
    const ms = new Date(2026, 7, 12, 17, 30).getTime();
    expect(localInputToMs(msToLocalInput(ms))).toBe(ms);
  });

  it('reads the input as LOCAL time, not UTC', () => {
    // The operator sets a deadline by their own clock. Parsing
    // "2026-08-12T17:30" as UTC would shift the offer's end by the
    // timezone offset — hours early or late for every recipient.
    const parsed = localInputToMs('2026-08-12T17:30');
    const expected = new Date(2026, 7, 12, 17, 30).getTime();
    expect(parsed).toBe(expected);
  });

  it('returns undefined for empty or unparseable input', () => {
    expect(localInputToMs('')).toBeUndefined();
    expect(localInputToMs('not a date')).toBeUndefined();
    expect(msToLocalInput(undefined)).toBe('');
  });

  it('defaults the offer expiry to the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 17, 30));
    expect(localInputToMs(defaultOfferExpiryLocal(24))).toBe(
      new Date(2026, 7, 13, 17, 30).getTime(),
    );
  });
});
