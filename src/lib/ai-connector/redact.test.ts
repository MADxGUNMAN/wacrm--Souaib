import { describe, expect, it } from 'vitest';
import { redact, redactString } from './redact';
import { generateToken } from './tokens';

describe('redact', () => {
  it('removes every secret format the connector handles', () => {
    const at = generateToken('access');
    const rt = generateToken('refresh');
    const ac = generateToken('code');
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';
    const line = `auth=Bearer ${at} refresh=${rt} code=${ac} jwt=${jwt} key=wacrm_live_abc123 code_verifier=xyz`;
    const out = redactString(line);
    for (const secret of [at, rt, ac, jwt, 'wacrm_live_abc123', 'xyz']) {
      expect(out).not.toContain(secret);
    }
  });

  it('masks secret-named keys at any depth and keeps the rest', () => {
    const out = redact({
      headers: {
        Authorization: 'Bearer abc',
        'content-type': 'application/json',
      },
      body: {
        grant_type: 'refresh_token',
        refresh_token: 'rpl_rt_x',
        nested: [{ password: 'p' }],
      },
      count: 3,
    }) as Record<string, Record<string, unknown>>;
    expect(out.headers.Authorization).toBe('[redacted]');
    expect(out.headers['content-type']).toBe('application/json');
    expect(out.body.refresh_token).toBe('[redacted]');
    expect(out.body.grant_type).toBe('refresh_token');
    expect(
      (out.body.nested as Array<Record<string, unknown>>)[0].password
    ).toBe('[redacted]');
    expect(out.count).toBe(3);
  });
});
