// ============================================================
// Classifying PostgreSQL errors that are really CLIENT errors.
//
// A `/api/v1` route filters by an id the caller supplied
// (`/contacts/{id}`, `?contact_id=`, `?tag=`). When that value isn't a
// valid uuid, PostgreSQL can't even parse it, so the query fails
// before it matches anything:
//
//   select … from contacts where id = 'not-a-uuid'
//   → 22P02  invalid input syntax for type uuid: "not-a-uuid"
//
// PostgREST surfaces that verbatim (HTTP 400, `{"code":"22P02", …}`),
// and supabase-js hands it back as a normal `error`. Routes used to
// treat any `error` as "the database broke" and return a 500 — so a
// plain caller typo was reported as our fault, which is both a lie and
// unactionable: a 500 tells an integrator to retry, and the retry
// fails identically forever.
//
// ─── Why classify the error instead of regex-checking the input ───
//
// The obvious alternative is a `isUuid()` guard before the query. It
// was rejected because PostgreSQL's uuid parser accepts more than the
// canonical 8-4-4-4-12 form (bare 32 hex digits, brace-wrapped), so
// any regex we wrote would become a second, stricter definition of
// "valid id" and would start rejecting values that work today.
// Reading the SQLSTATE keeps PostgreSQL the single authority on what
// parses: whatever it accepts still works, and whatever it rejects
// gets a clean status instead of a 500.
// ============================================================

/**
 * SQLSTATE `22P02` — invalid_text_representation. Raised when a text
 * literal can't be cast to the column's type (uuid, timestamp, int,
 * enum…). On these routes it always means the caller sent a malformed
 * id, because every other filter value is either server-minted (see
 * `decodeCursor`) or already validated.
 */
export const PG_INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * True when a supabase-js error is a failed cast of caller-supplied
 * text — i.e. a 400/404-class mistake, not an outage.
 *
 * Accepts `unknown` so callers can pass a `PostgrestError`, a bare
 * `{ code }`, or null without narrowing at every call site.
 */
export function isInvalidTextRepresentation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_INVALID_TEXT_REPRESENTATION
  );
}
