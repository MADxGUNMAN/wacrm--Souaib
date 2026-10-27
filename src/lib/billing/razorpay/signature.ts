// ============================================================
// Razorpay signature checks — constant time, hex only.
//
// Checkout (subscriptions): HMAC-SHA256(payment_id + "|" + subscription_id,
// key_secret). The subscription id MUST be the one stored on our server
// for this account, never the `razorpay_subscription_id` the browser
// echoes back — Razorpay's integration guide says so explicitly, and it
// is what stops a payment for one subscription being replayed against
// another.
//
// Webhooks: HMAC-SHA256(raw request body, webhook secret), sent in
// X-Razorpay-Signature. Verified against the exact bytes received, before
// any JSON parsing. During a secret rotation both the current and the
// previous secret are tried, because retries of older events stay signed
// with the old one.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

const HEX_64 = /^[0-9a-f]{64}$/i;

function hmacHex(secret: string, message: string | Buffer): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Constant-time compare of two hex digests. False for anything malformed. */
export function safeEqualHex(
  expectedHex: string,
  receivedHex: unknown
): boolean {
  if (typeof receivedHex !== 'string' || !HEX_64.test(receivedHex))
    return false;
  const a = Buffer.from(expectedHex.toLowerCase(), 'hex');
  const b = Buffer.from(receivedHex.toLowerCase(), 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function verifyCheckoutSignature(input: {
  paymentId: unknown;
  /** Our stored provider subscription id for this account. */
  subscriptionId: string;
  signature: unknown;
  keySecret: string;
}): boolean {
  const { paymentId, subscriptionId, signature, keySecret } = input;
  if (
    typeof paymentId !== 'string' ||
    !/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)
  )
    return false;
  if (!/^sub_[A-Za-z0-9]{6,40}$/.test(subscriptionId)) return false;
  if (!keySecret) return false;
  return safeEqualHex(
    hmacHex(keySecret, `${paymentId}|${subscriptionId}`),
    signature
  );
}

export function verifyWebhookSignature(input: {
  rawBody: string | Buffer;
  signature: unknown;
  /** Current secret first, then the previous one during a rotation. */
  secrets: readonly string[];
}): boolean {
  const { rawBody, signature, secrets } = input;
  let ok = false;
  // Evaluate every secret (no early return) so timing does not reveal
  // which one matched.
  for (const secret of secrets) {
    if (!secret) continue;
    if (safeEqualHex(hmacHex(secret, rawBody), signature)) ok = true;
  }
  return ok;
}

/** Test helper and the reference for the formula above. */
export function signCheckout(
  paymentId: string,
  subscriptionId: string,
  keySecret: string
): string {
  return hmacHex(keySecret, `${paymentId}|${subscriptionId}`);
}

export function signWebhook(rawBody: string | Buffer, secret: string): string {
  return hmacHex(secret, rawBody);
}
