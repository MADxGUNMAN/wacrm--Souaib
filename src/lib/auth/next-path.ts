// ============================================================
// Post-login `next` destinations — STRICT allowlist.
//
// `/login?next=…` exists so the AI connector's consent page can send a
// signed-out user to sign in and bring them straight back. An open
// `next` would be an open redirect (and a phishing aid), so only exact,
// known shapes are accepted; everything else falls back to the default.
// Add a pattern here only for a page that genuinely needs it.
// ============================================================

const ALLOWED_NEXT: readonly RegExp[] = [
  // AI connector consent: /oauth/consent?request_id=req_<32 base64url>
  /^\/oauth\/consent\?request_id=req_[A-Za-z0-9_-]{32}$/,
];

/** The value if it is an allowed same-site path, otherwise null. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  return ALLOWED_NEXT.some((re) => re.test(raw)) ? raw : null;
}

/** `/login?next=…` for an allowed path (plain `/login` otherwise). */
export function loginUrlWithNext(next: string): string {
  const safe = safeNextPath(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login';
}
