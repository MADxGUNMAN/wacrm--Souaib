import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mintUserJwt, parseSigningKey } from './supabase-jwt';

function keyPair() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
}

function decode(jwt: string) {
  const [h, p, s] = jwt.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, 'base64url'),
  };
}

describe('parseSigningKey', () => {
  it('accepts JWK JSON and PEM forms of a P-256 key', () => {
    const { privateKey } = keyPair();
    const jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    expect(parseSigningKey(jwk).asymmetricKeyType).toBe('ec');
    expect(parseSigningKey(pem).asymmetricKeyType).toBe('ec');
    // .env files often carry PEMs with literal \n
    expect(parseSigningKey(pem.replace(/\n/g, '\\n')).asymmetricKeyType).toBe(
      'ec'
    );
  });

  it('rejects other key types and curves', () => {
    const rsa = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    }).privateKey;
    expect(() =>
      parseSigningKey(rsa.export({ format: 'pem', type: 'pkcs8' }).toString())
    ).toThrow(/P-256/);
    const p384 = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-384',
    }).privateKey;
    expect(() =>
      parseSigningKey(JSON.stringify(p384.export({ format: 'jwk' })))
    ).toThrow(/P-256/);
  });
});

describe('mintUserJwt', () => {
  it('signs a 5-minute ES256 user JWT carrying the ai_conn claim', () => {
    const { privateKey, publicKey } = keyPair();
    const now = new Date('2026-10-01T10:00:00Z');
    const jwt = mintUserJwt({
      userId: 'user-1',
      connectionId: 'conn-1',
      platform: 'claude',
      supabaseUrl: 'https://proj.supabase.co',
      privateKey,
      kid: 'kid-1',
      now,
    });
    const { header, payload, signingInput, signature } = decode(jwt);
    expect(header).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'kid-1' });
    expect(payload).toMatchObject({
      iss: 'https://proj.supabase.co/auth/v1',
      sub: 'user-1',
      aud: 'authenticated',
      role: 'authenticated',
      ai_conn: 'conn-1',
      ai_platform: 'claude',
    });
    expect(payload.exp - payload.iat).toBe(300);
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000));
    expect(
      crypto.verify(
        'sha256',
        Buffer.from(signingInput),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signature
      )
    ).toBe(true);
  });

  it('does not verify with a different key', () => {
    const a = keyPair();
    const b = keyPair();
    const jwt = mintUserJwt({
      userId: 'u',
      connectionId: 'c',
      platform: 'chatgpt',
      supabaseUrl: 'https://p.supabase.co',
      privateKey: a.privateKey,
      kid: 'k',
    });
    const { signingInput, signature } = decode(jwt);
    expect(
      crypto.verify(
        'sha256',
        Buffer.from(signingInput),
        { key: b.publicKey, dsaEncoding: 'ieee-p1363' },
        signature
      )
    ).toBe(false);
  });
});
