// ============================================================
// AI connector configuration — parsed once from the environment.
//
// FAILS CLOSED. The feature is on only when AI_CONNECTOR_ENABLED is the
// exact string "true" AND every secret it needs is present and well
// formed. Anything else yields `enabled: false` with a reason, so routes
// answer 503 instead of running half-configured (for example signing
// tokens with an empty pepper).
//
// Server-only: none of these variables are NEXT_PUBLIC_.
// Plan: docs/ai-connector/01-architecture.md §8.
// ============================================================

import { PLATFORMS, type Platform } from './platforms';

export interface AiConnectorConfig {
  enabled: boolean;
  /** Why the feature is off (only when `enabled` is false). */
  disabledReason: string | null;
  /** e.g. https://wacrm.junkiescoder.com — no trailing slash. */
  issuer: string;
  /** `${issuer}/mcp` — the OAuth `resource` and the token audience. */
  mcpUrl: string;
  /** HMAC key for code/token hashes. */
  tokenPepper: string;
  /** Previous pepper, accepted for verification during rotation. */
  tokenPepperPrevious: string | null;
  /** ES256 private key (JWK JSON or PKCS#8 PEM) for per-request user JWTs. */
  jwtPrivateKey: string;
  jwtKid: string;
  supabaseUrl: string;
  /** null = every account may connect. */
  allowedAccounts: ReadonlySet<string> | null;
  allowDevClients: boolean;
  dcrEnabled: boolean;
  disabledPlatforms: ReadonlySet<Platform>;
}

type Env = Record<string, string | undefined>;

const MIN_PEPPER_LENGTH = 32;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalise and validate the issuer. HTTPS is required, except plain
 * http on localhost / 127.0.0.1 for local development. Returns null when
 * the value can't be used.
 */
export function normalizeIssuer(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return `${url.protocol}//${url.host}`;
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: Env = process.env): AiConnectorConfig {
  const issuer = normalizeIssuer(env.AI_CONNECTOR_ISSUER) ?? '';
  const pepper = env.AI_CONNECTOR_TOKEN_PEPPER ?? '';
  const prevPepper = env.AI_CONNECTOR_TOKEN_PEPPER_PREVIOUS ?? '';
  const jwtKey = env.AI_CONNECTOR_JWT_PRIVATE_KEY ?? '';
  const jwtKid = (env.AI_CONNECTOR_JWT_KID ?? '').trim();
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

  const allowed = parseList(env.AI_CONNECTOR_ALLOWED_ACCOUNTS);
  const disabledPlatforms = new Set(
    parseList(env.AI_CONNECTOR_DISABLED_PLATFORMS).filter((p): p is Platform =>
      (PLATFORMS as readonly string[]).includes(p)
    )
  );

  const problems: string[] = [];
  if (env.AI_CONNECTOR_ENABLED !== 'true')
    problems.push('AI_CONNECTOR_ENABLED is not "true"');
  if (!issuer)
    problems.push('AI_CONNECTOR_ISSUER is missing or not a bare https origin');
  if (pepper.length < MIN_PEPPER_LENGTH)
    problems.push(
      `AI_CONNECTOR_TOKEN_PEPPER must be at least ${MIN_PEPPER_LENGTH} characters`
    );
  if (!jwtKey.trim()) problems.push('AI_CONNECTOR_JWT_PRIVATE_KEY is missing');
  if (!jwtKid) problems.push('AI_CONNECTOR_JWT_KID is missing');
  if (!supabaseUrl) problems.push('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (allowed.some((id) => !UUID_RE.test(id)))
    problems.push(
      'AI_CONNECTOR_ALLOWED_ACCOUNTS must be comma-separated account UUIDs'
    );

  return {
    enabled: problems.length === 0,
    disabledReason: problems.length === 0 ? null : problems.join('; '),
    issuer,
    mcpUrl: issuer ? `${issuer}/mcp` : '',
    tokenPepper: pepper,
    tokenPepperPrevious:
      prevPepper.length >= MIN_PEPPER_LENGTH ? prevPepper : null,
    jwtPrivateKey: jwtKey,
    jwtKid,
    supabaseUrl,
    allowedAccounts:
      allowed.length > 0 ? new Set(allowed.map((a) => a.toLowerCase())) : null,
    allowDevClients: env.AI_CONNECTOR_ALLOW_DEV_CLIENTS === 'true',
    dcrEnabled: env.AI_CONNECTOR_DCR_ENABLED !== 'false',
    disabledPlatforms,
  };
}

let cached: AiConnectorConfig | null = null;

/** Process-wide config. Env changes need a restart, like the rest of the app. */
export function getConfig(): AiConnectorConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test hook. */
export function resetConfigForTests(): void {
  cached = null;
}

/** True when `accountId` may use the connector under the allowlist. */
export function isAccountAllowed(
  config: AiConnectorConfig,
  accountId: string
): boolean {
  return (
    config.allowedAccounts === null ||
    config.allowedAccounts.has(accountId.toLowerCase())
  );
}
