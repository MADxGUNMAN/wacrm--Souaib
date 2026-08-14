/**
 * AUTHENTICATION templates end to end: validation, the create payload,
 * the preset wording, and the send payload.
 *
 * Kept in one file because the four are only correct together — the whole
 * point of this category is that Meta owns the wording, so a create
 * payload that looks right but a send payload that omits the code is a
 * template that appears to work and delivers a dead button.
 */

import { describe, expect, it } from 'vitest';

import { buildMetaTemplatePayload } from './template-components';
import {
  validateAuthTemplate,
  validateTemplatePayload,
  type TemplatePayload,
} from './template-validators';
import { buildAuthSendComponents, buildSendComponents } from './template-send-builder';
import {
  authPresetBody,
  authPresetFooter,
  deriveFlatColumns,
  resolveBodyText,
  resolveFooterText,
} from './template-definition';
import type { MessageTemplate } from '@/types';

function authPayload(over: Partial<TemplatePayload> = {}): TemplatePayload {
  return {
    name: 'verification_code',
    category: 'Authentication',
    language: 'en_US',
    body_text: '',
    auth: { otp_type: 'COPY_CODE' },
    ...over,
  };
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe('validateAuthTemplate', () => {
  it('accepts a minimal copy-code template', () => {
    expect(() => validateAuthTemplate(authPayload())).not.toThrow();
  });

  it('requires the auth options', () => {
    expect(() => validateAuthTemplate(authPayload({ auth: undefined }))).toThrow(
      /one-time-password options/,
    );
  });

  it('rejects an unknown otp_type', () => {
    expect(() =>
      validateAuthTemplate(
        authPayload({
          auth: { otp_type: 'MAGIC' as unknown as 'COPY_CODE' },
        }),
      ),
    ).toThrow(/COPY_CODE, ONE_TAP or ZERO_TAP/);
  });

  it('rejects a button label over 25 characters', () => {
    expect(() =>
      validateAuthTemplate(
        authPayload({
          auth: { otp_type: 'COPY_CODE', button_text: 'x'.repeat(26) },
        }),
      ),
    ).toThrow(/25 chars/);
  });

  it('enforces the 1–90 minute expiry window', () => {
    expect(() =>
      validateAuthTemplate(
        authPayload({ auth: { otp_type: 'COPY_CODE', code_expiration_minutes: 0 } }),
      ),
    ).toThrow(/between 1 and 90/);
    expect(() =>
      validateAuthTemplate(
        authPayload({ auth: { otp_type: 'COPY_CODE', code_expiration_minutes: 91 } }),
      ),
    ).toThrow(/between 1 and 90/);
    expect(() =>
      validateAuthTemplate(
        authPayload({ auth: { otp_type: 'COPY_CODE', code_expiration_minutes: 90 } }),
      ),
    ).not.toThrow();
  });

  it('requires the Android handshake details for one-tap and zero-tap', () => {
    expect(() =>
      validateAuthTemplate(authPayload({ auth: { otp_type: 'ONE_TAP' } })),
    ).toThrow(/package name/);
    expect(() =>
      validateAuthTemplate(
        authPayload({
          auth: { otp_type: 'ZERO_TAP', package_name: 'com.x.y' },
        }),
      ),
    ).toThrow(/signing key hash/);
    expect(() =>
      validateAuthTemplate(
        authPayload({
          auth: {
            otp_type: 'ONE_TAP',
            package_name: 'com.x.y',
            signature_hash: 'abc',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('enforces the narrower 60–600s validity window', () => {
    expect(() =>
      validateAuthTemplate(authPayload({ message_send_ttl_seconds: 59 })),
    ).toThrow(/60–600 seconds/);
    expect(() =>
      validateAuthTemplate(authPayload({ message_send_ttl_seconds: 601 })),
    ).toThrow(/60–600 seconds/);
    expect(() =>
      validateAuthTemplate(authPayload({ message_send_ttl_seconds: 600 })),
    ).not.toThrow();
  });

  it('accepts -1, which is Meta\u2019s "use 24 hours" sentinel', () => {
    expect(() =>
      validateAuthTemplate(authPayload({ message_send_ttl_seconds: -1 })),
    ).not.toThrow();
  });

  /**
   * The regression that matters most: the standard rules demand a body,
   * and an authentication template has none. If validateTemplatePayload
   * did not branch, every auth template would be rejected locally for
   * missing text Meta does not want.
   */
  it('does not apply the standard body rule to authentication', () => {
    expect(() => validateTemplatePayload(authPayload())).not.toThrow();
  });
});

// ------------------------------------------------------------
// Create payload
// ------------------------------------------------------------

describe('buildMetaTemplatePayload — authentication', () => {
  it('emits a text-less BODY carrying the disclaimer flag', () => {
    const payload = buildMetaTemplatePayload(
      authPayload({
        auth: { otp_type: 'COPY_CODE', add_security_recommendation: true },
      }),
    );
    expect(payload.category).toBe('AUTHENTICATION');
    expect(payload.components[0]).toEqual({
      type: 'BODY',
      add_security_recommendation: true,
    });
    // Sending `text` here is rejected by Meta.
    expect(payload.components[0]).not.toHaveProperty('text');
  });

  it('keeps an explicit false rather than dropping it', () => {
    const payload = buildMetaTemplatePayload(
      authPayload({
        auth: { otp_type: 'COPY_CODE', add_security_recommendation: false },
      }),
    );
    expect(payload.components[0]).toEqual({
      type: 'BODY',
      add_security_recommendation: false,
    });
  });

  it('omits the FOOTER entirely when there is no expiry', () => {
    const payload = buildMetaTemplatePayload(authPayload());
    expect(payload.components.map((c) => c.type)).toEqual(['BODY', 'BUTTONS']);
  });

  it('emits the FOOTER as an expiry, not as text', () => {
    const payload = buildMetaTemplatePayload(
      authPayload({
        auth: { otp_type: 'COPY_CODE', code_expiration_minutes: 5 },
      }),
    );
    expect(payload.components[1]).toEqual({
      type: 'FOOTER',
      code_expiration_minutes: 5,
    });
  });

  it('emits an OTP button, not COPY_CODE', () => {
    const payload = buildMetaTemplatePayload(
      authPayload({
        auth: { otp_type: 'COPY_CODE', button_text: 'Copy Code' },
      }),
    );
    const buttons = payload.components.find((c) => c.type === 'BUTTONS');
    expect(buttons?.buttons).toEqual([
      { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy Code' },
    ]);
  });

  it('includes the handshake fields for one-tap only', () => {
    const oneTap = buildMetaTemplatePayload(
      authPayload({
        auth: {
          otp_type: 'ONE_TAP',
          button_text: 'Copy Code',
          autofill_text: 'Autofill',
          package_name: 'com.example.app',
          signature_hash: 'K8a/AINcGX7',
        },
      }),
    );
    expect(
      oneTap.components.find((c) => c.type === 'BUTTONS')?.buttons?.[0],
    ).toEqual({
      type: 'OTP',
      otp_type: 'ONE_TAP',
      text: 'Copy Code',
      autofill_text: 'Autofill',
      package_name: 'com.example.app',
      signature_hash: 'K8a/AINcGX7',
    });

    const copyCode = buildMetaTemplatePayload(
      authPayload({
        auth: {
          otp_type: 'COPY_CODE',
          package_name: 'com.example.app',
          signature_hash: 'nope',
        },
      }),
    );
    const btn = copyCode.components.find((c) => c.type === 'BUTTONS')
      ?.buttons?.[0];
    expect(btn).not.toHaveProperty('package_name');
    expect(btn).not.toHaveProperty('signature_hash');
  });

  it('omits the button text so Meta can localise its default', () => {
    const payload = buildMetaTemplatePayload(authPayload());
    const btn = payload.components.find((c) => c.type === 'BUTTONS')
      ?.buttons?.[0];
    expect(btn).toEqual({ type: 'OTP', otp_type: 'COPY_CODE' });
  });

  it('only sends message_send_ttl_seconds when set', () => {
    expect(buildMetaTemplatePayload(authPayload())).not.toHaveProperty(
      'message_send_ttl_seconds',
    );
    expect(
      buildMetaTemplatePayload(authPayload({ message_send_ttl_seconds: 300 })),
    ).toMatchObject({ message_send_ttl_seconds: 300 });
  });
});

// ------------------------------------------------------------
// Preset wording
// ------------------------------------------------------------

describe('authentication preset wording', () => {
  it('composes the body Meta will render', () => {
    expect(authPresetBody(false)).toBe('{{1}} is your verification code.');
    expect(authPresetBody(true)).toBe(
      '{{1}} is your verification code. For your security, do not share this code.',
    );
  });

  it('composes the expiry footer only when there is an expiry', () => {
    expect(authPresetFooter(null)).toBeNull();
    expect(authPresetFooter(0)).toBeNull();
    expect(authPresetFooter(5)).toBe('This code expires in 5 minutes.');
  });

  it('resolves a text-less auth body to the preset', () => {
    expect(
      resolveBodyText({ type: 'BODY', add_security_recommendation: false }),
    ).toBe('{{1}} is your verification code.');
  });

  it('prefers real text when a normal template has it', () => {
    expect(resolveBodyText({ type: 'BODY', text: 'Hello' })).toBe('Hello');
  });

  it('resolves an expiry footer with no text', () => {
    expect(
      resolveFooterText({ type: 'FOOTER', code_expiration_minutes: 3 }),
    ).toBe('This code expires in 3 minutes.');
  });

  /**
   * This is the one that protects the whole account: template-row-guard
   * requires a truthy body_text, and an auth row without one would make
   * every broadcast throw.
   */
  it('never derives an empty body_text for an auth template', () => {
    const flat = deriveFlatColumns({
      name: 'v',
      category: 'Authentication',
      language: 'en_US',
      template_type: 'authentication',
      parameter_format: 'POSITIONAL',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 10 },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }],
        },
      ],
    });
    expect(flat.body_text).toContain('verification code');
    expect(flat.footer_text).toBe('This code expires in 10 minutes.');
    // The OTP button is not representable in the legacy flat column.
    expect(flat.buttons).toBeNull();
  });
});

// ------------------------------------------------------------
// Send payload
// ------------------------------------------------------------

describe('buildAuthSendComponents', () => {
  it('puts the code in BOTH the body and the button', () => {
    // Meta requires it twice: the body interpolates it into the preset
    // wording, the button is what gets copied. One without the other
    // ships a message whose button copies nothing.
    expect(buildAuthSendComponents({ body: ['482913'] })).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: '482913' }],
      },
    ]);
  });

  it('uses sub_type url, because Meta converts OTP buttons to URL', () => {
    const [, button] = buildAuthSendComponents({ body: ['1'] });
    expect(button).toMatchObject({ sub_type: 'url' });
  });

  it('throws a readable error when no code is supplied', () => {
    expect(() => buildAuthSendComponents({})).toThrow(/one-time code/);
    expect(() => buildAuthSendComponents({ body: ['  '] })).toThrow(
      /one-time code/,
    );
  });

  it('is reached via buildSendComponents for the auth category', () => {
    const template = {
      id: 't',
      user_id: 'u',
      name: 'verification_code',
      category: 'Authentication',
      body_text: '{{1}} is your verification code.',
      created_at: '',
    } as MessageTemplate;

    expect(buildSendComponents(template, { body: ['9911'] })).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '9911' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: '9911' }],
      },
    ]);
  });
});
