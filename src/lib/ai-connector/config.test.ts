import { describe, expect, it } from 'vitest';
import { isAccountAllowed, loadConfig, normalizeIssuer } from './config';

const GOOD = {
  AI_CONNECTOR_ENABLED: 'true',
  AI_CONNECTOR_ISSUER: 'https://wacrm.junkiescoder.com',
  AI_CONNECTOR_TOKEN_PEPPER: 'x'.repeat(48),
  AI_CONNECTOR_JWT_PRIVATE_KEY: '{"kty":"EC"}',
  AI_CONNECTOR_JWT_KID: 'kid-1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
};

describe('normalizeIssuer', () => {
  it('accepts a bare https origin and strips the trailing slash', () => {
    expect(normalizeIssuer('https://wacrm.junkiescoder.com/')).toBe(
      'https://wacrm.junkiescoder.com'
    );
  });
  it('allows http only for localhost', () => {
    expect(normalizeIssuer('http://localhost:3000')).toBe(
      'http://localhost:3000'
    );
    expect(normalizeIssuer('http://wacrm.junkiescoder.com')).toBeNull();
  });
  it('rejects paths, queries, credentials and junk', () => {
    expect(normalizeIssuer('https://a.com/auth')).toBeNull();
    expect(normalizeIssuer('https://a.com?x=1')).toBeNull();
    expect(normalizeIssuer('https://u:p@a.com')).toBeNull();
    expect(normalizeIssuer('not a url')).toBeNull();
    expect(normalizeIssuer(undefined)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('is enabled with a complete environment', () => {
    const c = loadConfig(GOOD);
    expect(c.enabled).toBe(true);
    expect(c.disabledReason).toBeNull();
    expect(c.mcpUrl).toBe('https://wacrm.junkiescoder.com/mcp');
    expect(c.supabaseUrl).toBe('https://example.supabase.co');
    expect(c.allowedAccounts).toBeNull();
    expect(c.allowDevClients).toBe(false);
    expect(c.dcrEnabled).toBe(true);
  });

  it('fails closed when not explicitly enabled', () => {
    expect(loadConfig({ ...GOOD, AI_CONNECTOR_ENABLED: 'TRUE' }).enabled).toBe(
      false
    );
    expect(
      loadConfig({ ...GOOD, AI_CONNECTOR_ENABLED: undefined }).enabled
    ).toBe(false);
  });

  it('fails closed on a short pepper or missing key material', () => {
    expect(
      loadConfig({ ...GOOD, AI_CONNECTOR_TOKEN_PEPPER: 'short' }).enabled
    ).toBe(false);
    expect(
      loadConfig({ ...GOOD, AI_CONNECTOR_JWT_PRIVATE_KEY: ' ' }).enabled
    ).toBe(false);
    expect(loadConfig({ ...GOOD, AI_CONNECTOR_JWT_KID: '' }).enabled).toBe(
      false
    );
    const c = loadConfig({ ...GOOD, AI_CONNECTOR_ISSUER: 'http://evil.com' });
    expect(c.enabled).toBe(false);
    expect(c.disabledReason).toMatch(/ISSUER/);
  });

  it('parses the account allowlist and rejects malformed ids', () => {
    const id = '3430edae-763b-4aac-9b82-1c2364936d79';
    const c = loadConfig({
      ...GOOD,
      AI_CONNECTOR_ALLOWED_ACCOUNTS: ` ${id.toUpperCase()} ,`,
    });
    expect(c.enabled).toBe(true);
    expect(isAccountAllowed(c, id)).toBe(true);
    expect(isAccountAllowed(c, 'b69f6811-ab01-4b6d-b89e-68b65bdcba5d')).toBe(
      false
    );
    expect(
      loadConfig({ ...GOOD, AI_CONNECTOR_ALLOWED_ACCOUNTS: 'abc' }).enabled
    ).toBe(false);
  });

  it('ignores unknown platforms in the disabled list', () => {
    const c = loadConfig({
      ...GOOD,
      AI_CONNECTOR_DISABLED_PLATFORMS: 'chatgpt, myspace',
    });
    expect([...c.disabledPlatforms]).toEqual(['chatgpt']);
  });

  it('only keeps a previous pepper that is long enough', () => {
    expect(
      loadConfig({ ...GOOD, AI_CONNECTOR_TOKEN_PEPPER_PREVIOUS: 'tiny' })
        .tokenPepperPrevious
    ).toBeNull();
    expect(
      loadConfig({
        ...GOOD,
        AI_CONNECTOR_TOKEN_PEPPER_PREVIOUS: 'y'.repeat(40),
      }).tokenPepperPrevious
    ).toBe('y'.repeat(40));
  });
});
