// ============================================================
// OAuth client resolution: trusted registry, Client ID Metadata
// Documents (CIMD), restricted Dynamic Client Registration (DCR), and
// redirect URI matching.
//
// Production accepts only registry-trusted clients (Claude, Claude Code,
// ChatGPT) plus DCR registrations whose every redirect URI is on a
// trusted platform host — a code can then only ever be delivered to
// claude.ai / chatgpt.com, so a look-alike registration gains nothing.
// Everything else needs AI_CONNECTOR_ALLOW_DEV_CLIENTS (dev only).
//
// Plan: docs/ai-connector/01-architecture.md §3.1, §6.1;
//       docs/ai-connector/02-security.md T5, T6, T12, T13.
// ============================================================

import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import type { AiConnectorConfig } from './config';
import { PLATFORM_LABELS, type Platform } from './platforms';

export type ClientTrust = 'trusted' | 'dev_only' | 'blocked';
export type ClientKind = 'cimd' | 'dcr';

export interface OAuthClientRecord {
  id: string;
  client_id: string;
  kind: ClientKind;
  platform: Platform;
  display_name: string;
  redirect_uris: string[];
  trust: ClientTrust;
}

/** Redirect hosts that identify a trusted platform for DCR clients. */
const TRUSTED_REDIRECT_HOSTS: Record<string, Platform> = {
  'claude.ai': 'claude',
  'chatgpt.com': 'chatgpt',
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const MAX_CLIENT_ID_LENGTH = 512;
export const MAX_REDIRECT_URIS = 10;
export const MAX_METADATA_BYTES = 8 * 1024;
export const CIMD_FETCH_TIMEOUT_MS = 3000;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** http on localhost / 127.0.0.1 / [::1] — a native app's loopback redirect. */
export function isLoopbackRedirect(uri: string): boolean {
  const u = parseUrl(uri);
  return Boolean(
    u && u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname.toLowerCase())
  );
}

function isAcceptableRedirect(uri: string): boolean {
  if (typeof uri !== 'string' || uri.length > 2048) return false;
  const u = parseUrl(uri);
  if (!u || u.hash || u.username || u.password) return false;
  return u.protocol === 'https:' || isLoopbackRedirect(uri);
}

/**
 * Exact string match against the registered list, except that loopback
 * redirects match with the port ignored (RFC 8252 §7.3; Claude Code uses
 * an ephemeral port and declares http://localhost/callback).
 */
export function redirectUriMatches(
  requested: string,
  registered: readonly string[]
): boolean {
  if (registered.includes(requested)) return true;
  if (!isLoopbackRedirect(requested)) return false;
  const r = new URL(requested);
  return registered.some((reg) => {
    if (!isLoopbackRedirect(reg)) return false;
    const g = new URL(reg);
    return (
      g.hostname.toLowerCase() === r.hostname.toLowerCase() &&
      g.pathname === r.pathname &&
      g.search === r.search
    );
  });
}

/** A client_id that is a plausible CIMD URL (https, has a path, no secrets). */
export function isCimdClientId(clientId: unknown): clientId is string {
  if (typeof clientId !== 'string' || clientId.length > MAX_CLIENT_ID_LENGTH)
    return false;
  const u = parseUrl(clientId);
  return Boolean(
    u &&
    u.protocol === 'https:' &&
    !u.username &&
    !u.password &&
    !u.hash &&
    u.pathname.length > 1
  );
}

export interface ValidatedMetadata {
  redirectUris: string[];
  clientName: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate a CIMD document: it must name itself, list acceptable
 * redirect URIs, and be usable as a public client (auth method `none`).
 */
export function validateCimdDocument(
  doc: unknown,
  clientIdUrl: string
): Result<ValidatedMetadata> {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'metadata document is not a JSON object' };
  }
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientIdUrl) {
    return {
      ok: false,
      error: 'client_id in the document does not equal its URL',
    };
  }
  const uris = d.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS
  ) {
    return { ok: false, error: 'redirect_uris must be a non-empty list' };
  }
  if (!uris.every((u) => typeof u === 'string' && isAcceptableRedirect(u))) {
    return { ok: false, error: 'redirect_uris must be https or loopback http' };
  }
  const single = d.token_endpoint_auth_method;
  const plural = d.token_endpoint_auth_methods_supported;
  const supportsNone =
    (Array.isArray(plural) && plural.includes('none')) ||
    (!Array.isArray(plural) && (single ?? 'none') === 'none');
  if (!supportsNone) {
    return {
      ok: false,
      error: 'client must support public-client token exchange (none)',
    };
  }
  const name =
    typeof d.client_name === 'string' ? d.client_name.slice(0, 100) : null;
  return {
    ok: true,
    value: { redirectUris: uris as string[], clientName: name },
  };
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  isDeliverable?: (url: string) => Promise<boolean>;
}

/**
 * Fetch a CIMD document: https only, public addresses only (SSRF guard),
 * no redirects, short timeout, size cap.
 */
export async function fetchCimdDocument(
  url: string,
  deps: FetchDeps = {}
): Promise<Result<unknown>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const deliverable = deps.isDeliverable ?? isDeliverableUrl;
  if (!isCimdClientId(url)) return { ok: false, error: 'not a CIMD URL' };
  if (!(await deliverable(url)))
    return { ok: false, error: 'metadata host is not publicly routable' };

  let res: Response;
  try {
    res = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'metadata fetch failed' };
  }
  if (res.status !== 200)
    return { ok: false, error: `metadata fetch returned ${res.status}` };

  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_METADATA_BYTES)
    return { ok: false, error: 'metadata document too large' };
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_METADATA_BYTES) {
    return { ok: false, error: 'metadata document too large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'metadata document is not JSON' };
  }
}

export interface ClientStore {
  findByClientId(clientId: string): Promise<OAuthClientRecord | null>;
  saveDevCimdClient(input: {
    client_id: string;
    redirect_uris: string[];
    display_name: string;
    metadata: unknown;
  }): Promise<OAuthClientRecord>;
}

export type ResolveError =
  | 'unknown_client'
  | 'blocked_client'
  | 'platform_disabled'
  | 'invalid_metadata';

/**
 * Decide whether `clientId` may start an authorization. Registry rows
 * are authoritative for trusted clients: their pinned redirect URIs are
 * used and the live document is never needed, so a CDN or bot-protection
 * failure on the platform's side cannot break sign-in.
 */
export async function resolveClient(
  clientId: string,
  config: Pick<AiConnectorConfig, 'allowDevClients' | 'disabledPlatforms'>,
  store: ClientStore,
  deps: FetchDeps = {}
): Promise<
  | { ok: true; client: OAuthClientRecord }
  | { ok: false; error: ResolveError; detail?: string }
> {
  if (
    typeof clientId !== 'string' ||
    !clientId ||
    clientId.length > MAX_CLIENT_ID_LENGTH
  ) {
    return { ok: false, error: 'unknown_client' };
  }

  const existing = await store.findByClientId(clientId);
  if (existing) {
    if (existing.trust === 'blocked')
      return { ok: false, error: 'blocked_client' };
    if (existing.trust === 'dev_only' && !config.allowDevClients)
      return { ok: false, error: 'unknown_client' };
    if (config.disabledPlatforms.has(existing.platform))
      return { ok: false, error: 'platform_disabled' };
    return { ok: true, client: existing };
  }

  // Unknown CIMD clients are a development convenience only.
  if (!config.allowDevClients || !isCimdClientId(clientId)) {
    return { ok: false, error: 'unknown_client' };
  }
  const fetched = await fetchCimdDocument(clientId, deps);
  if (!fetched.ok)
    return { ok: false, error: 'invalid_metadata', detail: fetched.error };
  const validated = validateCimdDocument(fetched.value, clientId);
  if (!validated.ok)
    return { ok: false, error: 'invalid_metadata', detail: validated.error };

  const client = await store.saveDevCimdClient({
    client_id: clientId,
    redirect_uris: validated.value.redirectUris,
    display_name: `An app at ${new URL(clientId).hostname}`,
    metadata: fetched.value,
  });
  return { ok: true, client };
}

export interface DcrRegistration {
  redirectUris: string[];
  platform: Platform;
  trust: ClientTrust;
  displayName: string;
}

/**
 * Validate an RFC 7591 registration request. Trust is derived from where
 * codes can be delivered, never from the self-declared client_name.
 */
export function validateDcrRequest(
  body: unknown,
  config: Pick<AiConnectorConfig, 'allowDevClients' | 'dcrEnabled'>
): Result<DcrRegistration> {
  if (!config.dcrEnabled)
    return { ok: false, error: 'registration is disabled' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_client_metadata' };
  }
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) {
    return { ok: false, error: 'invalid_redirect_uri' };
  }
  if (!uris.every((u) => typeof u === 'string' && isAcceptableRedirect(u))) {
    return { ok: false, error: 'invalid_redirect_uri' };
  }
  const method = b.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') return { ok: false, error: 'invalid_client_metadata' };
  const grants = b.grant_types ?? ['authorization_code'];
  if (
    !Array.isArray(grants) ||
    !grants.every((g) => g === 'authorization_code' || g === 'refresh_token')
  ) {
    return { ok: false, error: 'invalid_client_metadata' };
  }

  const hosts = (uris as string[]).map((u) =>
    new URL(u).hostname.toLowerCase()
  );
  const platforms = new Set<Platform | undefined>(
    hosts.map((h) =>
      Object.prototype.hasOwnProperty.call(TRUSTED_REDIRECT_HOSTS, h)
        ? TRUSTED_REDIRECT_HOSTS[h]
        : undefined
    )
  );
  const allTrustedHost = platforms.size === 1 && !platforms.has(undefined);
  if (allTrustedHost) {
    const platform = [...platforms][0] as Platform;
    return {
      ok: true,
      value: {
        redirectUris: uris as string[],
        platform,
        trust: 'trusted',
        displayName: PLATFORM_LABELS[platform],
      },
    };
  }

  if (!config.allowDevClients)
    return { ok: false, error: 'invalid_redirect_uri' };
  const label =
    typeof b.client_name === 'string'
      ? b.client_name.slice(0, 60)
      : 'Unregistered app';
  return {
    ok: true,
    value: {
      redirectUris: uris as string[],
      platform: /inspector/i.test(label) ? 'mcp_inspector' : 'other',
      trust: 'dev_only',
      displayName: `${label} (development)`,
    },
  };
}
