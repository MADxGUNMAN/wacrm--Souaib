// AI client platforms the connector knows about. Must match the CHECK
// constraints on oauth_clients.platform / ai_connections.platform.

export const PLATFORMS = [
  'claude',
  'claude_code',
  'chatgpt',
  'codex',
  'mcp_inspector',
  'other',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return (
    typeof value === 'string' &&
    (PLATFORMS as readonly string[]).includes(value)
  );
}

/** Name shown on the consent screen and in Settings. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  claude: 'Claude',
  claude_code: 'Claude Code',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  mcp_inspector: 'MCP Inspector',
  other: 'Other app',
};

/**
 * How a platform wants to be told that a tool needs a scope it doesn't
 * have (Phase 0, S4): Claude re-consents on an HTTP 403 challenge and
 * ignores the in-result `_meta` form; ChatGPT documents the `_meta` form.
 */
export type StepUpStyle = 'http_403' | 'tool_meta';

export function stepUpStyleFor(platform: Platform): StepUpStyle {
  return platform === 'chatgpt' || platform === 'codex'
    ? 'tool_meta'
    : 'http_403';
}

/** Platforms a workspace allows by default (matches the SQL default). */
export const DEFAULT_ALLOWED_PLATFORMS: readonly Platform[] = [
  'claude',
  'claude_code',
  'chatgpt',
  'codex',
];
