import crypto from 'crypto';

/**
 * Two-step verification PIN generation for automatic number registration.
 *
 * ─── Why the app generates this at all ────────────────────────────
 *
 * Activating a number on the Cloud API requires
 * `POST /{phone_number_id}/register`, which takes a 6-digit `pin`. On a
 * number with no two-step verification yet (`is_pin_enabled: false`),
 * the PIN passed to that call BECOMES the number's permanent two-step
 * PIN on Meta's side.
 *
 * Embedded Signup never asks the operator for a PIN — Meta's popup does
 * not collect one and does not hand one back. So either the app
 * generates one and registers the number, or the number is never
 * registered at all. The second option was what happened previously:
 * virtual numbers sat at `status: PENDING` / `platform_type:
 * NOT_APPLICABLE` indefinitely, unable to send a single message.
 *
 * ─── Why `crypto.randomInt` and not `Math.random` ─────────────────
 *
 * This is a credential that gates two-step verification on a live
 * business phone number, and it cannot be rotated by the operator
 * without Meta support. `Math.random` is seeded predictably and is
 * explicitly not for secrets; a PIN guessable from generation time
 * would undermine the very control it is meant to enable.
 */

/** Meta requires exactly 6 digits. */
export const TWO_STEP_PIN_LENGTH = 6;

/**
 * PINs Meta's two-step verification is liable to reject, or that are
 * trivially guessable.
 *
 * Rejected here rather than discovered at the API boundary: a rejected
 * PIN fails the whole registration, and the operator has no way to
 * understand or retry that failure. Cheaper to never emit one.
 *
 * Covers all six repeated digits (000000, 111111, …) and both
 * directions of a full sequential run.
 */
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;

  const ascending = '01234567890';
  const descending = '09876543210';
  return ascending.includes(pin) || descending.includes(pin);
}

/**
 * A cryptographically random 6-digit PIN, zero-padded.
 *
 * Leading zeros are preserved as a string throughout. Treating a PIN as
 * a number is a classic way to turn "042591" into "42591" and then into
 * a rejected 5-digit registration.
 *
 * Loops until the candidate is not weak. The weak set is tiny (about 30
 * values out of a million) so this effectively never iterates, and the
 * bound removes any doubt about it not terminating.
 */
export function generateTwoStepPin(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(
      TWO_STEP_PIN_LENGTH,
      '0'
    );
    if (!isWeakPin(pin)) return pin;
  }
  // Unreachable in practice. Throwing beats returning a weak PIN or
  // silently returning something of the wrong shape.
  throw new Error('Could not generate a two-step PIN.');
}

/** True when a string is exactly 6 digits, the shape Meta accepts. */
export function isValidTwoStepPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
