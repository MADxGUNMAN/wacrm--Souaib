// Where to go after passing 2FA. Same-site app paths only — never an
// absolute URL, protocol-relative URL, API route or the 2FA page itself.

export const TWO_FACTOR_PATH = '/two-factor';
export const DEFAULT_AFTER_TWO_FACTOR = '/dashboard';

export function safeTwoFactorNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) {
    return DEFAULT_AFTER_TWO_FACTOR;
  }
  if (
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\') ||
    // Control characters / whitespace tricks.
    /[\u0000-\u001f\u007f\s]/.test(raw) ||
    raw.startsWith(TWO_FACTOR_PATH) ||
    raw.startsWith('/api/') ||
    raw === '/login' ||
    raw.startsWith('/login?')
  ) {
    return DEFAULT_AFTER_TWO_FACTOR;
  }
  return raw;
}

export function twoFactorUrl(next: string): string {
  const safe = safeTwoFactorNext(next);
  return safe === DEFAULT_AFTER_TWO_FACTOR
    ? TWO_FACTOR_PATH
    : `${TWO_FACTOR_PATH}?next=${encodeURIComponent(safe)}`;
}
