// ============================================================
// OAuth scopes for the AI connector, grouped into the consent tiers
// shown to users. Plan: docs/ai-connector/03-tools.md §2.
// ============================================================

export const AI_SCOPES = [
  'profile',
  'contacts:read',
  'conversations:read',
  'messages:read',
  'deals:read',
  'templates:read',
  'broadcasts:read',
  'automations:read',
  'analytics:read',
  'contacts:write',
  'conversations:write',
  'deals:write',
  'messages:send',
  'broadcasts:send',
  'automations:manage',
] as const;

export type AiScope = (typeof AI_SCOPES)[number];

/** Not a resource scope; requests a refresh token. */
export const OFFLINE_ACCESS = 'offline_access';

export type ConsentTier =
  'always' | 'view' | 'edit' | 'send' | 'broadcast' | 'automations';

export const SCOPE_INFO: Record<AiScope, { tier: ConsentTier; label: string }> =
  {
    profile: { tier: 'always', label: 'Know who you are and which workspace' },
    'contacts:read': { tier: 'view', label: 'View contacts, tags and notes' },
    'conversations:read': { tier: 'view', label: 'View inbox conversations' },
    'messages:read': { tier: 'view', label: 'Read messages in conversations' },
    'deals:read': { tier: 'view', label: 'View pipelines and deals' },
    'templates:read': { tier: 'view', label: 'View message templates' },
    'broadcasts:read': {
      tier: 'view',
      label: 'View broadcasts and their results',
    },
    'automations:read': { tier: 'view', label: 'View automations and flows' },
    'analytics:read': { tier: 'view', label: 'View dashboard numbers' },
    'contacts:write': {
      tier: 'edit',
      label: 'Create and edit contacts, tags and notes',
    },
    'conversations:write': {
      tier: 'edit',
      label: 'Change conversation status and assignment',
    },
    'deals:write': { tier: 'edit', label: 'Create and update deals' },
    'messages:send': { tier: 'send', label: 'Send WhatsApp messages as you' },
    'broadcasts:send': {
      tier: 'broadcast',
      label: 'Send broadcasts to many contacts',
    },
    'automations:manage': {
      tier: 'automations',
      label: 'Turn automations and flows on or off',
    },
  };

export function isAiScope(value: unknown): value is AiScope {
  return (
    typeof value === 'string' &&
    (AI_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * View + Edit records: what /oauth/authorize grants when a client asks
 * for no scope at all. The 401 challenge lists every scope instead (see
 * unauthorizedChallenge), so the user chooses each level on consent.
 */
export const DEFAULT_REQUESTED_SCOPES: readonly AiScope[] = AI_SCOPES.filter(
  (s) => {
    const tier = SCOPE_INFO[s].tier;
    return tier === 'always' || tier === 'view' || tier === 'edit';
  }
);

/**
 * Parse an OAuth `scope` string. Unknown scopes are reported, not
 * silently dropped, so /oauth/authorize can answer `invalid_scope`.
 * `profile` is always included; duplicates are removed; order follows
 * AI_SCOPES so stored values are stable.
 */
export function parseScopeString(raw: string | null | undefined): {
  scopes: AiScope[];
  offlineAccess: boolean;
  unknown: string[];
} {
  const parts = (raw ?? '').split(/\s+/).filter(Boolean);
  const unknown: string[] = [];
  const set = new Set<AiScope>(['profile']);
  let offlineAccess = false;
  for (const p of parts) {
    if (p === OFFLINE_ACCESS) offlineAccess = true;
    else if (isAiScope(p)) set.add(p);
    else unknown.push(p);
  }
  return {
    scopes: AI_SCOPES.filter((s) => set.has(s)),
    offlineAccess,
    unknown,
  };
}

/** Space-separated, ordered — for token responses and challenges. */
export function formatScopes(scopes: Iterable<string>): string {
  const set = new Set(scopes);
  return AI_SCOPES.filter((s) => set.has(s)).join(' ');
}
