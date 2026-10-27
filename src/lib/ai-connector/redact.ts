// ============================================================
// Log redaction for the AI connector.
//
// Nothing that can act as a credential may reach a log line: our OAuth
// codes and tokens, bearer headers, PKCE verifiers, JWTs (Supabase user
// JWTs, API keys shaped as JWTs), and our own API keys.
// Plan: docs/ai-connector/02-security.md §3.6.
// ============================================================

const PATTERNS: Array<[RegExp, string]> = [
  [/\brpl_(ac|at|rt)_[A-Za-z0-9_-]+/g, 'rpl_$1_[redacted]'],
  [/\bwacrm_live_[A-Za-z0-9_-]+/g, 'wacrm_live_[redacted]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]'],
  [/(Bearer\s+)[^\s",]+/gi, '$1[redacted]'],
  [/(code_verifier=)[^&\s"]+/gi, '$1[redacted]'],
  [/(refresh_token=)[^&\s"]+/gi, '$1[redacted]'],
  [/(\bcode=)[^&\s"]+/gi, '$1[redacted]'],
];

const SECRET_KEYS = new Set([
  'authorization',
  'access_token',
  'refresh_token',
  'code',
  'code_verifier',
  'client_secret',
  'password',
  'token',
  'cookie',
  'set-cookie',
]);

export function redactString(value: string): string {
  let out = value;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

/** Deep copy with secret-named keys masked and secret patterns removed. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase())
        ? '[redacted]'
        : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
