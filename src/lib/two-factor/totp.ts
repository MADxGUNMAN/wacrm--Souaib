// ============================================================
// TOTP (RFC 6238) — the codes shown by Google Authenticator, Microsoft
// Authenticator, Authy, 1Password and every other standard app.
//
// HMAC-SHA1, 6 digits, 30-second steps: the defaults every authenticator
// assumes when scanning an otpauth:// QR code. Server-side only.
// ============================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Accept the previous and next step too, to absorb clock drift. */
export const TOTP_WINDOW = 1;
/** 160-bit secret, as recommended by RFC 4226. */
const SECRET_BYTES = 20;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function timeStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP value for one counter (RFC 4226 dynamic truncation). */
export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS
): string {
  const msg = Buffer.alloc(8);
  // Counter fits comfortably in 53 bits for any realistic time.
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpAt(
  secretBase32: string,
  nowMs: number = Date.now()
): string {
  return hotp(base32Decode(secretBase32), timeStep(nowMs));
}

/** Digits only, or null if it isn't a 6-digit code. */
export function normalizeTotpCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * The matching time step if `code` is valid now (± TOTP_WINDOW), else
 * null. The caller must then claim the step so the code can't be replayed.
 * Every candidate is compared in constant time.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number = Date.now()
): number | null {
  const normalized = normalizeTotpCode(code);
  if (!normalized) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(nowMs);
  const given = Buffer.from(normalized);
  let match: number | null = null;
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const step = current + d;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, given) && match === null) match = step;
  }
  return match;
}

/** otpauth:// URI that authenticator apps read from the QR code. */
export function otpauthUri({
  secret,
  accountName,
  issuer,
}: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** "ABCD EFGH IJKL …" — easier to type into an app by hand. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
