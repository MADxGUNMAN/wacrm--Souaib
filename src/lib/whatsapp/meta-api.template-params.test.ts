import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendTemplateMessage } from './meta-api';
import type { MessageTemplate } from '@/types';

/**
 * `sendTemplateMessage` used to forward `messageParams` to the send
 * builder FIELD BY FIELD, naming five of them. When `offerExpiresAtMs`
 * and `cards` were added to `SendTimeParams`, this function kept
 * compiling and kept passing every existing test while silently dropping
 * both — a limited-time offer would have gone out with no expiry no
 * matter what the caller supplied, and no error anywhere to explain it.
 *
 * These tests read the actual request body, so a value the caller sets
 * has to survive all the way to the wire.
 */

const TEMPLATE_BASE = {
  id: 't1',
  account_id: 'a1',
  user_id: 'u1',
  name: 'promo',
  category: 'Marketing' as const,
  language: 'en_US',
  status: 'APPROVED' as const,
  body_text: 'Flash sale',
  created_at: '',
  updated_at: '',
};

function captureFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), {
      status: 200,
    });
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

const ARGS = {
  phoneNumberId: 'pn',
  accessToken: 'tok',
  to: '1234567890',
  templateName: 'promo',
};

describe('sendTemplateMessage — messageParams reach the wire', () => {
  let calls: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    calls = captureFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function componentsOf(): Record<string, unknown>[] {
    const template = calls[0].body.template as Record<string, unknown>;
    return (template.components ?? []) as Record<string, unknown>[];
  }

  it('carries a limited-time offer expiry through', async () => {
    const expiry = Date.now() + 3_600_000;
    const template: MessageTemplate = {
      ...TEMPLATE_BASE,
      template_type: 'limited_time_offer',
      components: [
        { type: 'BODY', text: 'Flash sale' },
        {
          type: 'LIMITED_TIME_OFFER',
          limited_time_offer: { text: '10% off', has_expiration: true },
        },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'COPY_CODE', text: 'Copy', example: ['SAVE10'] }],
        },
      ],
    } as unknown as MessageTemplate;

    await sendTemplateMessage({
      ...ARGS,
      template,
      messageParams: { offerExpiresAtMs: expiry },
    });

    const offer = componentsOf().find((c) => c.type === 'limited_time_offer');
    expect(offer).toBeDefined();
    expect(offer).toEqual({
      type: 'limited_time_offer',
      parameters: [
        {
          type: 'limited_time_offer',
          limited_time_offer: { expiration_time_ms: expiry },
        },
      ],
    });
  });

  it('carries per-card carousel values through', async () => {
    const template: MessageTemplate = {
      ...TEMPLATE_BASE,
      template_type: 'carousel',
      body_text: 'Our range',
      components: [
        { type: 'BODY', text: 'Our range' },
        {
          type: 'CAROUSEL',
          cards: [
            {
              components: [
                { type: 'HEADER', format: 'IMAGE' },
                { type: 'BODY', text: 'Aloe {{1}}' },
              ],
            },
          ],
        },
      ],
    } as unknown as MessageTemplate;

    await sendTemplateMessage({
      ...ARGS,
      template,
      messageParams: {
        cards: [
          { headerMediaUrl: 'https://x.test/card1.jpg', body: ['fresh'] },
        ],
      },
    });

    const carousel = componentsOf().find((c) => c.type === 'carousel');
    expect(carousel).toEqual({
      type: 'carousel',
      cards: [
        {
          card_index: 0,
          components: [
            {
              type: 'header',
              parameters: [
                { type: 'image', image: { link: 'https://x.test/card1.jpg' } },
              ],
            },
            { type: 'body', parameters: [{ type: 'text', text: 'fresh' }] },
          ],
        },
      ],
    });
  });

  it('still prefers messageParams.body over the legacy params array', async () => {
    const template: MessageTemplate = {
      ...TEMPLATE_BASE,
      body_text: 'Hi {{1}}',
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
    } as unknown as MessageTemplate;

    await sendTemplateMessage({
      ...ARGS,
      template,
      params: ['legacy'],
      messageParams: { body: ['structured'] },
    });

    expect(componentsOf()).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'structured' }] },
    ]);
  });

  it('falls back to the legacy params array when messageParams has no body', async () => {
    const template: MessageTemplate = {
      ...TEMPLATE_BASE,
      body_text: 'Hi {{1}}',
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
    } as unknown as MessageTemplate;

    await sendTemplateMessage({
      ...ARGS,
      template,
      params: ['legacy'],
      messageParams: { headerText: 'ignored' },
    });

    expect(componentsOf()).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'legacy' }] },
    ]);
  });
});
