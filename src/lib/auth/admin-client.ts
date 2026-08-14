import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The shared service-role Supabase client.
 *
 * ─── Why the env vars are checked rather than asserted ────────────
 *
 * These used to be `process.env.X!` — a non-null assertion that lies to
 * the compiler. When the service-role key was missing, `createClient` was
 * handed `undefined`, every query came back as a PostgREST auth failure,
 * and the caller reported whatever its own failure meant. In the super
 * admin guard that surfaced as "profile not found", which the dashboard
 * showed as "ensure you have super admin access" — sending you to check
 * permissions for a problem that was a missing environment variable.
 *
 * A misconfigured server should say so, loudly, once. The message names
 * the variable so it is actionable in a deployment where you cannot
 * attach a debugger.
 */

let _adminClient: SupabaseClient | null = null;

/** Thrown for a missing or blank server env var, so callers can tell it apart. */
export class MissingServerConfigError extends Error {
  constructor(public readonly variable: string) {
    super(
      `${variable} is not set on the server. ` +
        'Add it to this environment (it is a server-only secret, so it is ' +
        'never present in the browser bundle) and restart.',
    );
    this.name = 'MissingServerConfigError';
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  // Blank counts as missing: a deployment panel with an empty box is a
  // more common mistake than an absent key, and produces the same
  // confusing downstream failures.
  if (!value || value.trim() === '') {
    throw new MissingServerConfigError(name);
  }
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    _adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}
