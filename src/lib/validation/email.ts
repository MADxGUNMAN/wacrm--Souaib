/**
 * Email address validation — pure, no I/O.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Signup accepted `akash@junkiescoder` and created the account. The
 * server only checked `email.includes('@')`, and the browser did not
 * catch it either: `<input type="email">` accepts a domain with no dot
 * on purpose (the HTML spec calls its email syntax a "willful violation"
 * of RFC 5322, and allows intranet hosts like `user@localhost`).
 *
 * That address cannot receive the confirmation link, so the account is
 * created and then permanently unverifiable — the user is stuck with no
 * way to log in and no way to re-register with the same address.
 *
 * Three separate copies of `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` were already
 * scattered across the codebase (profile form, newsletter, contact form)
 * and the two other auth routes had the same weak `includes('@')` check.
 * One validator, one message, every entry point.
 *
 * ─── What this deliberately does NOT do ───────────────────────────
 *
 * No DNS/MX lookup and no disposable-domain blocklist. Both belong to a
 * different question ("will this mailbox accept mail?") which only
 * actually sending can answer, and both fail closed on perfectly valid
 * addresses — a new company domain has no reputation yet.
 */

/**
 * The single message shown for any malformed address.
 *
 * Shared so the client and the server say exactly the same thing. A
 * validation error that changes wording depending on which layer caught
 * it reads like two different bugs.
 */
export const EMAIL_INVALID_MESSAGE = 'Please enter a valid email address.';

/**
 * Unquoted local part (before the `@`).
 *
 * RFC 5322 also permits a quoted form (`"weird name"@example.com`) which
 * is rejected here on purpose: no real signup uses it, and every mail
 * provider and every downstream system in this app would have to agree
 * on the quoting rules for it to be worth supporting.
 */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/**
 * Domain with at least two labels and an alphabetic TLD.
 *
 * The `\.[A-Za-z]{2,63}$` tail is the whole point of this file — it is
 * what rejects `junkiescoder` while accepting `junkiescoder.com`,
 * `junkiescoder.co.in` and `mail.junkiescoder.dev`. Labels may contain
 * hyphens but cannot start or end with one, per RFC 1035.
 */
const DOMAIN_PART =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;

/** RFC 5321 limits: 64 octets for the local part, 254 for the address. */
const MAX_LOCAL_LENGTH = 64;
const MAX_EMAIL_LENGTH = 254;

/**
 * Is this a deliverable-looking email address?
 *
 * Accepts `unknown` so an API route can hand it a raw JSON value without
 * a type guard first — a non-string is simply invalid.
 *
 * Declared as a type predicate so one check does both jobs: callers get
 * `string` narrowing afterwards and no longer need a separate
 * `typeof email !== 'string'` guard that could drift out of step with
 * this one.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const email = value.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;

  // Split on the LAST '@'. An address may legally contain only one, but
  // splitting on the last one means `a@b@example.com` fails on the local
  // part rather than being silently read as domain `b@example.com`.
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length > MAX_LOCAL_LENGTH) return false;
  if (!LOCAL_PART.test(local)) return false;
  // A dot is legal inside the local part but not at either end, and never
  // doubled.
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }

  if (domain.includes('..')) return false;
  if (!DOMAIN_PART.test(domain)) return false;

  return true;
}

/**
 * Canonical form for storage, lookups and rate-limit keys.
 *
 * Lowercased because mail domains are case-insensitive and every provider
 * that matters treats the local part that way too — without this, `A@x.com`
 * and `a@x.com` would get separate rate-limit buckets and could register
 * twice.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
