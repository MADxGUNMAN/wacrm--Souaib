import { describe, expect, it } from 'vitest';
import { isValidChallenge, s256Challenge, verifyPkce } from './pkce';

// RFC 7636 Appendix B test vector.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('pkce', () => {
  it('matches the RFC 7636 test vector', () => {
    expect(s256Challenge(VERIFIER)).toBe(CHALLENGE);
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
  });

  it('accepts only S256 challenges of the right shape', () => {
    expect(isValidChallenge(CHALLENGE, 'S256')).toBe(true);
    expect(isValidChallenge(CHALLENGE, 'plain')).toBe(false);
    expect(isValidChallenge(CHALLENGE, undefined)).toBe(false);
    expect(isValidChallenge('short', 'S256')).toBe(false);
    expect(isValidChallenge(CHALLENGE + '=', 'S256')).toBe(false);
  });

  it('rejects a wrong, short, long or malformed verifier', () => {
    expect(verifyPkce(VERIFIER.replace('d', 'e'), CHALLENGE)).toBe(false);
    expect(verifyPkce('a'.repeat(42), s256Challenge('a'.repeat(42)))).toBe(
      false
    );
    expect(verifyPkce('a'.repeat(129), s256Challenge('a'.repeat(129)))).toBe(
      false
    );
    expect(verifyPkce('a'.repeat(42) + ' ', CHALLENGE)).toBe(false);
    expect(verifyPkce(undefined, CHALLENGE)).toBe(false);
  });

  it('rejects the plain method trick (verifier equal to challenge)', () => {
    expect(verifyPkce(CHALLENGE, CHALLENGE)).toBe(false);
  });
});
