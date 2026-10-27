import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils';

/**
 * Contact de-duplication helpers, shared by the WhatsApp webhook, the
 * manual contact form, and CSV import so all paths agree on what
 * "same number" means (issue #212).
 *
 * The canonical key is `normalizePhone` (digits-only) — the same form
 * the DB stores in the generated `contacts.phone_normalized` column
 * and enforces unique per account. `phonesMatch` adds trunk-prefix
 * tolerance (last-8-digit match) for the softer "possible duplicate"
 * surfaces.
 *
 * DB lookups always query `phone_normalized`, never the raw `phone`:
 * raw values may be stored formatted (`+238 988 48 84`), which a
 * digits-only LIKE cannot match. See `findExistingContact`.
 */

/** Canonical de-dup key for a phone string (digits only). */
export function normalizeKey(phone: string): string {
  return normalizePhone(phone);
}

/** Minimal shape we need back from a contacts lookup. */
export interface ExistingContact {
  id: string;
  phone: string;
  name?: string | null;
  [key: string]: unknown;
}

/** Error shape surfaced by the lookups, so a caller can log it. */
export interface ContactLookupError {
  code?: string;
  message: string;
}

/**
 * Exact lookup on the generated digits-only `phone_normalized` column
 * (migration 022) — the same `(account_id, phone_normalized)` key the
 * unique index `idx_contacts_account_phone_normalized` enforces, so a
 * 23505 from a contact insert can always be resolved through here.
 *
 * Returns the error separately so a caller can tell "not found" from
 * "lookup failed". An input with no digits returns `{ null, null }`
 * without querying.
 */
export async function findContactByNormalizedPhone(
  db: SupabaseClient,
  accountId: string,
  phone: string
): Promise<{
  contact: ExistingContact | null;
  error: ContactLookupError | null;
}> {
  const key = normalizePhone(phone);
  if (!key) return { contact: null, error: null };

  // .limit(1), not .maybeSingle(): the unique index makes a second row
  // impossible, but if one ever appeared it must not turn into an error
  // that reads as "not found".
  const { data, error } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone_normalized', key)
    .limit(1);

  if (error) {
    return {
      contact: null,
      error: { code: error.code, message: error.message },
    };
  }
  const rows = (data ?? []) as ExistingContact[];
  return { contact: rows[0] ?? null, error: null };
}

/**
 * Find an existing contact in `accountId` whose phone matches `phone`,
 * or null.
 *
 * Both steps query the generated digits-only `phone_normalized` column,
 * never the raw `phone`. Raw `phone` can be stored formatted
 * (`+238 988 48 84`), and a LIKE on its last 8 digits (`%89884884`)
 * never matched such a row — so the webhook tried to insert a duplicate,
 * hit 23505, and dropped the customer's message (2 Oct 2026 incident:
 * broadcast replies missing for ~8,900 contacts of one account).
 *
 *   1. Exact match on `phone_normalized` (served by the unique index).
 *   2. Only when the input has ≥ 8 digits: suffix pre-filter
 *      `phone_normalized LIKE '%<last 8>'`, then the strict
 *      `phonesMatch` in JS for trunk / country-code variants. Below 8
 *      digits `phonesMatch` can only succeed by exact equality, which
 *      step 1 already covered, so the query could add nothing.
 *
 * A lookup error is logged and treated as "not found", as before.
 */
export async function findExistingContact(
  db: SupabaseClient,
  accountId: string,
  phone: string
): Promise<ExistingContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const exact = await findContactByNormalizedPhone(db, accountId, normalized);
  if (exact.contact) return exact.contact;
  if (exact.error) {
    console.error('[dedupe] exact contact lookup failed', {
      accountId,
      phone: normalized,
      code: exact.error.code,
      message: exact.error.message,
    });
  }

  if (normalized.length < 8) return null;

  // Digits only, so the pattern carries no LIKE metacharacters.
  const suffix = normalized.slice(-8);
  const { data, error } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .like('phone_normalized', `%${suffix}`);

  if (error) {
    console.error('[dedupe] suffix contact lookup failed', {
      accountId,
      phone: normalized,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;

  return (
    (data as ExistingContact[]).find((c) => phonesMatch(c.phone, phone)) ?? null
  );
}

/**
 * True when an existing contact is an *exact* normalized match for
 * `phone` (vs only a fuzzy trunk-variant match). The form hard-blocks
 * exact matches but only warns on fuzzy ones.
 */
export function isExactMatch(
  existing: ExistingContact,
  phone: string
): boolean {
  return normalizeKey(existing.phone) === normalizeKey(phone);
}

/**
 * True for a Postgres unique-constraint violation (SQLSTATE 23505).
 * Used as the backstop when the DB unique index rejects a racing or
 * format-equal insert that slipped past the in-app check.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === '23505';
}

/**
 * De-duplicate parsed CSV rows by normalized phone, keeping the first
 * occurrence of each. Rows with an empty normalized phone are dropped
 * (they can't be a valid contact). Returns the unique rows plus the
 * count removed as in-file duplicates.
 */
export function dedupeByPhone<T extends { phone: string }>(
  rows: T[]
): { unique: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const key = normalizeKey(row.phone);
    if (!key) {
      duplicates++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}
