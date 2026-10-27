import { describe, expect, it } from 'vitest';

import {
  safeEqualHex,
  signCheckout,
  signWebhook,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './signature';

const SECRET = 'test_key_secret_value_1234';
const PAY = 'pay_TqRBdZ9TAT3iGD';
const SUB = 'sub_TqQrUBh0Ic4tPv';

describe('verifyCheckoutSignature', () => {
  it('accepts HMAC(payment_id|subscription_id) with the key secret', () => {
    const signature = signCheckout(PAY, SUB, SECRET);
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature,
        keySecret: SECRET,
      })
    ).toBe(true);
    // Upper-case hex is the same digest.
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature: signature.toUpperCase(),
        keySecret: SECRET,
      })
    ).toBe(true);
  });

  it('rejects a signature for a different subscription (replay across subscriptions)', () => {
    const signature = signCheckout(PAY, 'sub_OtherSubscriptn', SECRET);
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature,
        keySecret: SECRET,
      })
    ).toBe(false);
  });

  it('rejects wrong secret, swapped order and malformed input', () => {
    const good = signCheckout(PAY, SUB, SECRET);
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature: good,
        keySecret: 'another_secret_xyz',
      })
    ).toBe(false);
    const swapped = signCheckout(SUB, PAY, SECRET);
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature: swapped,
        keySecret: SECRET,
      })
    ).toBe(false);
    for (const signature of [
      null,
      undefined,
      42,
      '',
      'abc',
      good.slice(1),
      `${good}00`,
      'z'.repeat(64),
    ]) {
      expect(
        verifyCheckoutSignature({
          paymentId: PAY,
          subscriptionId: SUB,
          signature,
          keySecret: SECRET,
        })
      ).toBe(false);
    }
    for (const paymentId of [null, '', 'order_123456', 'pay_', 'pay_a|b']) {
      expect(
        verifyCheckoutSignature({
          paymentId,
          subscriptionId: SUB,
          signature: good,
          keySecret: SECRET,
        })
      ).toBe(false);
    }
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: 'plan_x',
        signature: good,
        keySecret: SECRET,
      })
    ).toBe(false);
    expect(
      verifyCheckoutSignature({
        paymentId: PAY,
        subscriptionId: SUB,
        signature: good,
        keySecret: '',
      })
    ).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const body = '{"entity":"event","event":"subscription.charged","payload":{}}';

  it('verifies against the exact raw body', () => {
    const sig = signWebhook(body, 'whsec_current_secret_1');
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: sig,
        secrets: ['whsec_current_secret_1'],
      })
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody: Buffer.from(body),
        signature: sig,
        secrets: ['whsec_current_secret_1'],
      })
    ).toBe(true);
    // Re-serialised JSON is a different message.
    const reserialised = JSON.stringify(JSON.parse(body), null, 1);
    expect(
      verifyWebhookSignature({
        rawBody: reserialised,
        signature: sig,
        secrets: ['whsec_current_secret_1'],
      })
    ).toBe(false);
  });

  it('accepts the previous secret during a rotation, and nothing else', () => {
    const oldSig = signWebhook(body, 'whsec_previous_secret');
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: oldSig,
        secrets: ['whsec_current_secret_1', 'whsec_previous_secret'],
      })
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: oldSig,
        secrets: ['whsec_current_secret_1'],
      })
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: oldSig,
        secrets: ['', ''],
      })
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: undefined,
        secrets: ['whsec_previous_secret'],
      })
    ).toBe(false);
  });
});

describe('safeEqualHex', () => {
  it('needs two equal-length 32-byte hex digests', () => {
    const a = 'a'.repeat(64);
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, 'b'.repeat(64))).toBe(false);
    expect(safeEqualHex(a, 'a'.repeat(62))).toBe(false);
    expect(safeEqualHex(a, { toString: () => a })).toBe(false);
  });
});
