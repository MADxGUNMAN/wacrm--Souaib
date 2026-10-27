// ============================================================
// Per-request Supabase user JWT for connector tool calls (D3).
//
// Signed with the ES256 key imported into the Supabase project as a
// signing key (Phase 0, S1: PostgREST accepts it and RLS scopes results
// to `sub`). The `ai_conn` claim is what the restrictive "AI-deny" RLS
// policies key on (20261001000200_ai_connector_deny_policies.sql).
//
// The JWT lives 5 minutes, is minted per request, and never leaves the
// server.
// ============================================================

import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Platform } from './platforms';
import { TTL } from './tokens';

export interface UserJwtInput {
  userId: string;
  connectionId: string;
  platform: Platform;
  supabaseUrl: string;
  privateKey: crypto.KeyObject;
  kid: string;
  ttlSeconds?: number;
  now?: Date;
}

/**
 * Parse the configured key. Accepts a JWK JSON string (the format the
 * Supabase dashboard imports) or a PKCS#8 / SEC1 PEM. Must be a P-256 EC
 * private key.
 */
export function parseSigningKey(raw: string): crypto.KeyObject {
  const text = raw.trim();
  const key = text.startsWith('{')
    ? crypto.createPrivateKey({
        key: JSON.parse(text) as JsonWebKey,
        format: 'jwk',
      })
    : crypto.createPrivateKey(text.replace(/\\n/g, '\n'));
  if (
    key.asymmetricKeyType !== 'ec' ||
    key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
  ) {
    throw new Error(
      'AI connector signing key must be an EC P-256 (ES256) private key'
    );
  }
  return key;
}

const b64u = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url');

export function mintUserJwt(input: UserJwtInput): string {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid: input.kid };
  const payload = {
    iss: `${input.supabaseUrl}/auth/v1`,
    sub: input.userId,
    aud: 'authenticated',
    role: 'authenticated',
    iat,
    exp: iat + (input.ttlSeconds ?? TTL.userJwt),
    session_id: input.connectionId,
    ai_conn: input.connectionId,
    ai_platform: input.platform,
  };
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: input.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64u(signature)}`;
}

/**
 * Supabase client that acts as the user under RLS, plus the AI-deny
 * policies. No session persistence, no refresh: the JWT is single-use
 * per request.
 */
export function createUserScopedClient(
  supabaseUrl: string,
  anonKey: string,
  jwt: string
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
