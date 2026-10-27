import { describe, expect, it } from 'vitest';
import { loginUrlWithNext, safeNextPath } from './next-path';

const GOOD = `/oauth/consent?request_id=req_${'a'.repeat(32)}`;

describe('safeNextPath', () => {
  it('accepts the consent page with a well-formed request id', () => {
    expect(safeNextPath(GOOD)).toBe(GOOD);
  });

  it.each([
    null,
    '',
    '/dashboard',
    'https://evil.example/oauth/consent?request_id=req_' + 'a'.repeat(32),
    '//evil.example/oauth/consent?request_id=req_' + 'a'.repeat(32),
    '/oauth/consent?request_id=req_short',
    GOOD + '&x=1',
    GOOD + '#frag',
    '/oauth/consent?request_id=req_' + 'a'.repeat(31) + '/',
    '/\\evil.example',
    '/oauth/consent/../../evil?request_id=req_' + 'a'.repeat(32),
  ])('rejects %s', (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('builds a login URL only for allowed paths', () => {
    expect(loginUrlWithNext(GOOD)).toBe(
      `/login?next=${encodeURIComponent(GOOD)}`
    );
    expect(loginUrlWithNext('https://evil.example')).toBe('/login');
  });
});
