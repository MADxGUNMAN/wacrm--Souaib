// ============================================================
// Recovery codes — single-use backup codes for when the authenticator
// app is unavailable. Shown once at setup / regeneration; only keyed
// HMAC hashes are stored, so a database leak doesn't reveal them.
// ============================================================

import { createHmac, randomInt } from 'node:crypto';

export const RECOVERY_CODE_COUNT = 10;

// No 0/O, 1/I/L — codes are often copied by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP = 5;

function pepper(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  return key;
}

/** "ABCDE-FGHJK" */
export function generateRecoveryCode(): string {
  let s = '';
  for (let i = 0; i < GROUP * 2; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, GROUP)}-${s.slice(GROUP)}`;
}

export function generateRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < n) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Uppercase, alphanumerics only — tolerant of spaces and dashes. */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return v.length === GROUP * 2 ? v : null;
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error('Invalid recovery code');
  return createHmac('sha256', pepper())
    .update(`2fa-recovery:${normalized}`)
    .digest('hex');
}
