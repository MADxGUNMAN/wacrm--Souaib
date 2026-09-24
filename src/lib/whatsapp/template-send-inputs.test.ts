import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_SCHEDULE_AHEAD_MS,
  MIN_SCHEDULE_LEAD_MS,
  buildSendPlan,
  defaultOfferExpiryLocal,
  isMediaHeaderType,
  localInputToMs,
  missingSendValues,
  msToLocalInput,
  sendValuesFromExtras,
  validateScheduleAt,
  type BroadcastSendExtras,
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

function card(
  over: { body?: string; url?: string; media?: string | null } = {}
) {
  const media = over.media === null ? undefined : (over.media ?? IMG);
  return {
    components: [
      mediaHeader(media),
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
  };
}

describe('buildSendPlan', () => {
  it('reports nothing to fill in for a fully static template', () => {
    const plan = buildSendPlan(
      row({ components: [{ type: 'BODY', text: 'No variables here' }] })
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
      })
    );
    expect(plan.bodyVarCount).toBe(2);
    expect(plan.headerVarCount).toBe(1);
    expect(plan.needsNoInput).toBe(false);
  });

  it('treats a media header with a stored URL as needing no input', () => {
    // It rides along on every send using the approved sample, exactly as
    // the send builder does.
    const plan = buildSendPlan(
      row({ components: [mediaHeader(IMG), { type: 'BODY', text: 'Static' }] })
    );
    expect(plan.headerMedia).toEqual({ format: 'IMAGE', defaultUrl: IMG });
    expect(plan.needsNoInput).toBe(true);
  });

  it('requires a media link when the template stored none', () => {
    const plan = buildSendPlan(
      row({
        components: [mediaHeader(undefined), { type: 'BODY', text: 'Static' }],
      })
    );
    expect(plan.headerMedia).toEqual({
      format: 'IMAGE',
      defaultUrl: undefined,
    });
    expect(plan.needsNoInput).toBe(false);
    expect(missingSendValues(plan, {})).toContain('A image for the header');
  });

  it('ignores header_handle as a send-time default', () => {
    // A creation-time upload handle is not a send-time media id; offering
    // it as a default would produce a send Meta rejects.
    const plan = buildSendPlan(
      row({
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
            example: { header_handle: ['4::abc'] },
          },
          { type: 'BODY', text: 'Static' },
        ],
      })
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
      })
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
      })
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
      expect(plan.offer).toMatchObject({
        text: '10% off',
        hasExpiration: true,
      });
      expect(missingSendValues(plan, {})).toContain(
        'The offer expiry date and time'
      );
    });

    it('needs the expiry even without a countdown', () => {
      // has_expiration only controls whether the countdown is DISPLAYED.
      const plan = buildSendPlan(offerRow({ hasExpiration: false, code: 'X' }));
      expect(plan.offer?.hasExpiration).toBe(false);
      expect(missingSendValues(plan, {})).toContain(
        'The offer expiry date and time'
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
        missingSendValues(plan, { offerExpiresAtMs: Date.now() + 60_000 })
      ).toEqual([]);
    });

    it('requires a code when the template carries no default', () => {
      const plan = buildSendPlan(offerRow());
      expect(
        missingSendValues(plan, { offerExpiresAtMs: Date.now() + 60_000 })
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
      const plan = buildSendPlan(
        carouselRow([card({ body: 'A' }), card({ body: 'B' })])
      );
      expect(plan.needsNoInput).toBe(true);
      expect(plan.cards).toHaveLength(2);
      expect(missingSendValues(plan, {})).toEqual([]);
    });

    it('describes each card in approved order', () => {
      const plan = buildSendPlan(
        carouselRow([
          card({ body: 'Aloe {{1}}' }),
          card({ url: 'https://x.test/{{1}}' }),
        ])
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
        ])
      );
      const missing = missingSendValues(plan, {});
      expect(missing).toContain('Card 1: variable {{1}}');
      expect(missing).toContain('Card 2: a image link');
      expect(missing).toContain('Card 3: link value for "Shop"');
    });

    it('clears once each card is filled in', () => {
      const plan = buildSendPlan(
        carouselRow([
          card({ body: 'Aloe {{1}}' }),
          card({ url: 'https://x.test/{{1}}' }),
        ])
      );
      expect(
        missingSendValues(plan, {
          cards: [{ body: ['fresh'] }, { buttonParams: { 0: 'aloe-2' } }],
        })
      ).toEqual([]);
    });

    it('still requires the top-level body variables', () => {
      const plan = buildSendPlan(carouselRow([card(), card()], 'Hi {{1}}'));
      expect(plan.bodyVarCount).toBe(1);
      expect(missingSendValues(plan, {})).toContain('Message variable {{1}}');
    });
  });

  it('treats whitespace as unfilled', () => {
    const plan = buildSendPlan(
      row({ components: [{ type: 'BODY', text: 'Hi {{1}}' }] })
    );
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
      new Date(2026, 7, 13, 17, 30).getTime()
    );
  });
});

/**
 * A scheduled broadcast fires from a server-side sweep the operator
 * cannot watch. So the only place a bad instant can be caught is here,
 * before it becomes a row — an off-by-one at either boundary means a
 * campaign that either sends immediately (surprising thousands of
 * recipients) or never sends at all (silently, with the UI still
 * claiming "Scheduled").
 */
describe('validateScheduleAt', () => {
  const NOW = new Date(2026, 8, 10, 12, 0).getTime();
  const local = (y: number, m: number, d: number, h: number, min = 0): string =>
    msToLocalInput(new Date(y, m - 1, d, h, min).getTime());

  it('rejects an empty value with a prompt, not a scary error', () => {
    const result = validateScheduleAt('', NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('empty');
    expect(result.atMs).toBeNull();
    expect(result.message).toBeTruthy();
  });

  it('rejects an unparseable value', () => {
    const result = validateScheduleAt('tomorrow-ish', NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('unparseable');
  });

  it('rejects a time in the past', () => {
    const result = validateScheduleAt(local(2026, 9, 10, 11), NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('past');
  });

  it('rejects "now" itself, which would fire on the next sweep', () => {
    const result = validateScheduleAt(local(2026, 9, 10, 12), NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('past');
  });

  it('rejects a lead time under the minimum', () => {
    // 1 minute ahead: the sweep runs every 5 minutes, so this would
    // send LATE and look broken rather than scheduled.
    const oneMinute = msToLocalInput(NOW + 60_000);
    const result = validateScheduleAt(oneMinute, NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('too_soon');
  });

  it('accepts exactly the minimum lead time', () => {
    const atMin = msToLocalInput(NOW + MIN_SCHEDULE_LEAD_MS);
    const result = validateScheduleAt(atMin, NOW);
    expect(result.ok).toBe(true);
    expect(result.problem).toBeNull();
    expect(result.message).toBeNull();
  });

  it('accepts the far edge of the allowed window', () => {
    const atMax = msToLocalInput(NOW + MAX_SCHEDULE_AHEAD_MS);
    expect(validateScheduleAt(atMax, NOW).ok).toBe(true);
  });

  it('rejects beyond the allowed window', () => {
    const past = msToLocalInput(NOW + MAX_SCHEDULE_AHEAD_MS + 60_000);
    const result = validateScheduleAt(past, NOW);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('too_far');
  });

  it('returns the parsed instant so the caller stores the same value it validated', () => {
    const chosen = new Date(2026, 8, 11, 9, 30).getTime();
    const result = validateScheduleAt(msToLocalInput(chosen), NOW);
    expect(result.ok).toBe(true);
    expect(result.atMs).toBe(chosen);
  });
});

/**
 * This mapper is the single source of the recipient-independent half of
 * a send. Three hand-written copies existed before it and had already
 * drifted, so these assertions are about the contract every surface now
 * shares: the immediate broadcast, the scheduled executor and the test
 * send must build byte-identical params from the same state.
 */
describe('sendValuesFromExtras', () => {
  const extras = (
    over: Partial<BroadcastSendExtras> = {}
  ): BroadcastSendExtras => ({
    offerExpiryLocal: '',
    cards: [],
    buttonParams: {},
    ...over,
  });

  it('omits everything when there is nothing to send', () => {
    const values = sendValuesFromExtras({
      extras: extras(),
      isMediaHeader: false,
    });
    expect(values).toEqual({});
  });

  it('omits, rather than empties, an absent extras object', () => {
    expect(
      sendValuesFromExtras({ extras: undefined, isMediaHeader: true })
    ).toEqual({});
  });

  it('drops the media URL when the template has no media header', () => {
    // Attaching media to a text-header template sends Meta a component
    // it never approved, which it rejects.
    const values = sendValuesFromExtras({
      extras: extras(),
      headerMediaUrl: IMG,
      isMediaHeader: false,
    });
    expect(values.headerMediaUrl).toBeUndefined();
  });

  it('carries the media URL when the header is media', () => {
    const values = sendValuesFromExtras({
      extras: extras(),
      headerMediaUrl: IMG,
      isMediaHeader: true,
    });
    expect(values.headerMediaUrl).toBe(IMG);
  });

  it('ignores a whitespace-only media URL', () => {
    const values = sendValuesFromExtras({
      extras: extras(),
      headerMediaUrl: '   ',
      isMediaHeader: true,
    });
    expect(values.headerMediaUrl).toBeUndefined();
  });

  it('converts the offer deadline to epoch ms', () => {
    const deadline = new Date(2026, 8, 20, 18, 0).getTime();
    const values = sendValuesFromExtras({
      extras: extras({ offerExpiryLocal: msToLocalInput(deadline) }),
      isMediaHeader: false,
    });
    expect(values.offerExpiresAtMs).toBe(deadline);
  });

  it('omits empty button params rather than sending an empty map', () => {
    const values = sendValuesFromExtras({
      extras: extras({ buttonParams: {} }),
      isMediaHeader: false,
    });
    expect('buttonParams' in values).toBe(false);
  });

  it('carries button params when present', () => {
    const values = sendValuesFromExtras({
      extras: extras({ buttonParams: { 0: 'SAVE10' } }),
      isMediaHeader: false,
    });
    expect(values.buttonParams).toEqual({ 0: 'SAVE10' });
  });

  it('omits an empty card list but carries a populated one', () => {
    expect(
      'cards' in
        sendValuesFromExtras({
          extras: extras({ cards: [] }),
          isMediaHeader: false,
        })
    ).toBe(false);

    const cards = [{ headerMediaUrl: IMG }];
    expect(
      sendValuesFromExtras({ extras: extras({ cards }), isMediaHeader: false })
        .cards
    ).toEqual(cards);
  });

  it('uses the auth code as body[0] when no explicit body is given', () => {
    const values = sendValuesFromExtras({
      extras: extras({ authCode: '123456' }),
      isMediaHeader: false,
    });
    expect(values.body).toEqual(['123456']);
  });

  it('lets an explicit body win over the auth code', () => {
    // The caller resolved real per-recipient values; those are more
    // specific than the wizard-level auth code and must not be replaced.
    const values = sendValuesFromExtras({
      extras: extras({ authCode: '123456' }),
      isMediaHeader: false,
      body: ['Jane'],
    });
    expect(values.body).toEqual(['Jane']);
  });

  it('omits an empty namedBody but carries a populated one', () => {
    expect(
      'namedBody' in
        sendValuesFromExtras({
          extras: extras(),
          isMediaHeader: false,
          namedBody: {},
        })
    ).toBe(false);

    const values = sendValuesFromExtras({
      extras: extras(),
      isMediaHeader: false,
      namedBody: { order_id: 'A-1' },
    });
    expect(values.namedBody).toEqual({ order_id: 'A-1' });
  });

  it('carries the commerce and order-status fields', () => {
    const values = sendValuesFromExtras({
      extras: extras({
        catalogThumbnailProductId: 'sku-1',
        orderStatus: {
          orderReferenceId: 'ORD-9',
          orderStatus: 'shipped',
          orderStatusDescription: 'On its way',
        },
      }),
      isMediaHeader: false,
    });
    expect(values.catalogThumbnailProductId).toBe('sku-1');
    expect(values.orderReferenceId).toBe('ORD-9');
    expect(values.orderStatus).toBe('shipped');
    expect(values.orderStatusDescription).toBe('On its way');
  });
});

describe('isMediaHeaderType', () => {
  it('recognises exactly the three media header formats', () => {
    expect(isMediaHeaderType('image')).toBe(true);
    expect(isMediaHeaderType('video')).toBe(true);
    expect(isMediaHeaderType('document')).toBe(true);
  });

  it('rejects text, location, absent and unknown headers', () => {
    expect(isMediaHeaderType('text')).toBe(false);
    expect(isMediaHeaderType('location')).toBe(false);
    expect(isMediaHeaderType(null)).toBe(false);
    expect(isMediaHeaderType(undefined)).toBe(false);
  });
});
