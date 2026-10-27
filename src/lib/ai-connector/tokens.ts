// ============================================================
// Opaque OAuth secrets: generation, recognition, hashing, lifetimes.
//
// Codes and tokens are 256-bit random values with a readable prefix
// (so a leaked one is greppable and scanner-friendly). The database
// stores only HMAC-SHA256(pepper, token) — never the token itself.
// Plan: docs/ai-connector/01-architecture.md §4.
// ============================================================

import crypto from 'node:crypto';

export const TOKEN_PREFIX = {
  code: 'rpl_ac_',
  access: 'rpl_at_',
  refresh: 'rpl_rt_',
} as const;

export type TokenKind = keyof typeof TOKEN_PREFIX;

/** 32 random bytes in base64url = 43 characters. */
const SECRET_BYTES = 32;
const SECRET_CHARS = 43;

const TOKEN_RE: Record<TokenKind, RegExp> = {
  code: new RegExp(`^${TOKEN_PREFIX.code}[A-Za-z0-9_-]{${SECRET_CHARS}}$`),
  access: new RegExp(`^${TOKEN_PREFIX.access}[A-Za-z0-9_-]{${SECRET_CHARS}}$`),
  refresh: new RegExp(
    `^${TOKEN_PREFIX.refresh}[A-Za-z0-9_-]{${SECRET_CHARS}}$`
  ),
};

/** Lifetimes, in seconds. */
export const TTL = {
  authorizationRequest: 10 * 60,
  code: 60,
  access: 60 * 60,
  refreshSliding: 30 * 24 * 60 * 60,
  refreshAbsolute: 180 * 24 * 60 * 60,
  confirmation: 10 * 60,
  userJwt: 5 * 60,
} as const;

export function generateToken(kind: TokenKind): string {
  return (
    TOKEN_PREFIX[kind] + crypto.randomBytes(SECRET_BYTES).toString('base64url')
  );
}

/** Cheap shape check before any database lookup. */
export function looksLikeToken(
  kind: TokenKind,
  value: unknown
): value is string {
  return typeof value === 'string' && TOKEN_RE[kind].test(value);
}

/** Random opaque id with a prefix, e.g. `req_…`, `cnf_…`, `prf_…`. */
export function generateId(prefix: string, bytes = 16): string {
  return `${prefix}${crypto.randomBytes(bytes).toString('base64url')}`;
}

/** HMAC-SHA256(pepper, value) as lowercase hex. */
export function hashSecret(value: string, pepper: string): string {
  if (!pepper) throw new Error('hashSecret: empty pepper');
  return crypto
    .createHmac('sha256', pepper)
    .update(value, 'utf8')
    .digest('hex');
}

/**
 * Hashes to look up for a presented secret: the current pepper first,
 * then the previous one during a pepper rotation window.
 */
export function candidateHashes(
  value: string,
  pepper: string,
  previous: string | null
): string[] {
  const out = [hashSecret(value, pepper)];
  if (previous) out.push(hashSecret(value, previous));
  return out;
}

/** Constant-time string comparison (false for different lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export type RefreshState =
  'valid' | 'unknown' | 'reused' | 'revoked' | 'expired' | 'wrong_audience';

export interface RefreshRow {
  used_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  absolute_expires_at: string;
  issuer: string;
  resource: string;
}

/**
 * Classify a presented refresh token. `reused` is the dangerous case:
 * the caller must revoke the whole family (01 §3.2).
 */
export function classifyRefreshToken(
  row: RefreshRow | null,
  expected: { issuer: string; resource: string },
  now: Date = new Date()
): RefreshState {
  if (!row) return 'unknown';
  if (row.issuer !== expected.issuer || row.resource !== expected.resource)
    return 'wrong_audience';
  if (row.revoked_at) return 'revoked';
  if (row.used_at) return 'reused';
  const t = now.getTime();
  if (
    Date.parse(row.expires_at) <= t ||
    Date.parse(row.absolute_expires_at) <= t
  )
    return 'expired';
  return 'valid';
}

/**
 * Expiry of a rotated refresh token: sliding window, never past the
 * family's absolute limit.
 */
export function nextRefreshExpiry(
  absoluteExpiresAt: Date,
  now: Date = new Date()
): Date {
  const sliding = addSeconds(now, TTL.refreshSliding);
  return sliding < absoluteExpiresAt ? sliding : absoluteExpiresAt;
}
