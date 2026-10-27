// PKCE (RFC 7636), S256 only. `plain` is never accepted (OAuth 2.1).

import crypto from 'node:crypto';
import { safeEqual } from './tokens';

/** RFC 7636 §4.1: 43–128 chars from the unreserved set. */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url(SHA-256) without padding is always 43 chars. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidChallenge(
  challenge: unknown,
  method: unknown
): challenge is string {
  return (
    method === 'S256' &&
    typeof challenge === 'string' &&
    CHALLENGE_RE.test(challenge)
  );
}

export function s256Challenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier, 'ascii')
    .digest('base64url');
}

/** True only if `verifier` is well formed and hashes to `challenge`. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
  if (!CHALLENGE_RE.test(challenge)) return false;
  return safeEqual(s256Challenge(verifier), challenge);
}
