-- ============================================================
-- AI connector (Claude / ChatGPT) — OAuth 2.1 core tables.
--
-- Plan: docs/ai-connector/01-architecture.md §4 and §6.
--
-- Replai acts as its own minimal OAuth 2.1 authorization server so Claude
-- and ChatGPT can sign a user in through the browser and then call the
-- remote MCP endpoint (/mcp) as that user. This migration holds the
-- client registry, the per-user connection, and the short- and long-lived
-- secrets of the flow.
--
-- ─── SECURITY MODEL ──────────────────────────────────────────
--
--  * Every secret (authorization code, access token, refresh token) is
--    stored ONLY as an HMAC-SHA256 hash keyed by AI_CONNECTOR_TOKEN_PEPPER.
--    A copy of this database cannot be replayed against /mcp.
--  * Token tables have RLS enabled and NO policies, and anon/authenticated
--    have no table privileges: only the service-role client (server code)
--    can read or write them.
--  * ai_connections is readable by the connecting user and by the account
--    owner (Settings → AI Connectors). All writes go through server routes
--    with the service-role client after their own authorization check.
--  * `issuer` and `resource` are stored on every token. devcrm and wacrm
--    share this database, so the gate rejects a token minted by the other
--    deployment.
--
-- Idempotent: IF NOT EXISTS everywhere, constraints/policies dropped
-- before re-creation, seed rows upserted.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Client registry (trusted CIMD clients + DCR registrations)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CIMD: the HTTPS URL of the client's metadata document.
  -- DCR:  the id we generated at registration.
  client_id       TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  platform        TEXT NOT NULL,
  -- Shown on the consent screen. Taken from OUR registry for trusted
  -- clients, never from the self-asserted metadata document.
  display_name    TEXT NOT NULL,
  redirect_uris   TEXT[] NOT NULL DEFAULT '{}',
  trust           TEXT NOT NULL DEFAULT 'blocked',
  -- Last metadata fetched live (CIMD) or posted (DCR). Size-capped by the
  -- application before it is stored.
  metadata        JSONB,
  -- Our own copy of a trusted client's document. Used when the live fetch
  -- fails so a CDN or bot-protection hiccup cannot block sign-in.
  pinned_metadata JSONB,
  fetched_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_kind_check;
ALTER TABLE public.oauth_clients ADD CONSTRAINT oauth_clients_kind_check
  CHECK (kind IN ('cimd', 'dcr'));

ALTER TABLE public.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_platform_check;
ALTER TABLE public.oauth_clients ADD CONSTRAINT oauth_clients_platform_check
  CHECK (platform IN ('claude', 'claude_code', 'chatgpt', 'codex', 'mcp_inspector', 'other'));

ALTER TABLE public.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_trust_check;
ALTER TABLE public.oauth_clients ADD CONSTRAINT oauth_clients_trust_check
  CHECK (trust IN ('trusted', 'dev_only', 'blocked'));

ALTER TABLE public.oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_client_id_len;
ALTER TABLE public.oauth_clients ADD CONSTRAINT oauth_clients_client_id_len
  CHECK (char_length(client_id) BETWEEN 1 AND 512);

COMMENT ON TABLE public.oauth_clients IS
  'AI connector OAuth clients. trust=trusted rows are the registry (Claude, Claude Code, ChatGPT); production accepts only those. Service-role only.';

-- ------------------------------------------------------------
-- 2. Connections — what the user sees in Settings → AI Connectors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_client_id UUID NOT NULL REFERENCES public.oauth_clients(id) ON DELETE RESTRICT,
  platform        TEXT NOT NULL,
  granted_scopes  TEXT[] NOT NULL DEFAULT '{}',
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  label           TEXT,
  issuer          TEXT NOT NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_platform_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_platform_check
  CHECK (platform IN ('claude', 'claude_code', 'chatgpt', 'codex', 'mcp_inspector', 'other'));

ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_label_len;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_label_len
  CHECK (label IS NULL OR char_length(label) <= 80);

ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_revoke_reason_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_revoke_reason_check
  CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'user',               -- the user disconnected (Replai UI or the AI's disconnect tool)
    'owner',              -- the workspace owner disconnected it
    'replaced',           -- a new consent for the same client replaced it
    'membership_changed', -- user removed, deactivated or moved to another account
    'refresh_reuse',      -- a used refresh token was presented again
    'client_revoked',     -- the platform called /oauth/revoke
    'idle',               -- no use within the idle window
    'platform'            -- super-admin / platform kill switch
  ));

-- One ACTIVE connection per user, per account, per client. Claude and
-- ChatGPT are different clients, so both can be connected at once.
CREATE UNIQUE INDEX IF NOT EXISTS ai_connections_active_unique
  ON public.ai_connections (account_id, user_id, oauth_client_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_connections_account_idx
  ON public.ai_connections (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_connections_user_idx
  ON public.ai_connections (user_id);
CREATE INDEX IF NOT EXISTS ai_connections_client_idx
  ON public.ai_connections (oauth_client_id);

COMMENT ON TABLE public.ai_connections IS
  'One row per user per AI client (Claude, ChatGPT, ...) per account. Readable by the user and the account owner; written only by server routes.';

-- ------------------------------------------------------------
-- 3. Stable, opaque profile id per (account, user) — ChatGPT multi-account
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_connector_profiles (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Never reassigned, never derived from the user id or email.
  profile_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, user_id)
);

-- ------------------------------------------------------------
-- 4. Pending authorization requests (between /oauth/authorize and consent)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_authorization_requests (
  id               TEXT PRIMARY KEY,
  oauth_client_id  UUID NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  redirect_uri     TEXT NOT NULL,
  state            TEXT,
  code_challenge   TEXT NOT NULL,
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  resource         TEXT NOT NULL,
  issuer           TEXT NOT NULL,
  csrf_hash        TEXT NOT NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oauth_authorization_requests_expires_idx
  ON public.oauth_authorization_requests (expires_at);

-- ------------------------------------------------------------
-- 5. Authorization codes (60 s, single use)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  code_hash       TEXT PRIMARY KEY,
  request_id      TEXT REFERENCES public.oauth_authorization_requests(id) ON DELETE SET NULL,
  connection_id   UUID NOT NULL REFERENCES public.ai_connections(id) ON DELETE CASCADE,
  oauth_client_id UUID NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,
  granted_scopes  TEXT[] NOT NULL DEFAULT '{}',
  resource        TEXT NOT NULL,
  issuer          TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_connection_idx
  ON public.oauth_authorization_codes (connection_id);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_idx
  ON public.oauth_authorization_codes (expires_at);

-- ------------------------------------------------------------
-- 6. Access tokens (1 h) and refresh tokens (30 d sliding, rotated)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  token_hash    TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ai_connections(id) ON DELETE CASCADE,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  issuer        TEXT NOT NULL,
  resource      TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_connection_idx
  ON public.oauth_access_tokens (connection_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_expires_idx
  ON public.oauth_access_tokens (expires_at);

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  token_hash          TEXT PRIMARY KEY,
  connection_id       UUID NOT NULL REFERENCES public.ai_connections(id) ON DELETE CASCADE,
  -- Every refresh token descended from one authorization shares a family.
  -- Reusing an already-used token revokes the whole family.
  family_id           UUID NOT NULL,
  scopes              TEXT[] NOT NULL DEFAULT '{}',
  issuer              TEXT NOT NULL,
  resource            TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  replaced_by         TEXT,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_connection_idx
  ON public.oauth_refresh_tokens (connection_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family_idx
  ON public.oauth_refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_expires_idx
  ON public.oauth_refresh_tokens (expires_at);

-- ------------------------------------------------------------
-- 7. RLS and privileges
-- ------------------------------------------------------------
ALTER TABLE public.oauth_clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_connections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_connector_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorization_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_access_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_refresh_tokens         ENABLE ROW LEVEL SECURITY;

-- Secrets and the registry: service role only. Revoking the grants as
-- well as having no policies means a future accidental policy still
-- can't expose them.
REVOKE ALL ON public.oauth_clients                FROM anon, authenticated;
REVOKE ALL ON public.ai_connector_profiles        FROM anon, authenticated;
REVOKE ALL ON public.oauth_authorization_requests FROM anon, authenticated;
REVOKE ALL ON public.oauth_authorization_codes    FROM anon, authenticated;
REVOKE ALL ON public.oauth_access_tokens          FROM anon, authenticated;
REVOKE ALL ON public.oauth_refresh_tokens         FROM anon, authenticated;

-- ai_connections: SELECT only, for the Settings page.
REVOKE ALL ON public.ai_connections FROM anon, authenticated;
GRANT SELECT ON public.ai_connections TO authenticated;

DROP POLICY IF EXISTS ai_connections_select_own ON public.ai_connections;
CREATE POLICY ai_connections_select_own ON public.ai_connections
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ai_connections_select_owner ON public.ai_connections;
CREATE POLICY ai_connections_select_owner ON public.ai_connections
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id, 'owner'));

-- ------------------------------------------------------------
-- 8. Trusted client registry seed (confirmed in Phase 0)
-- ------------------------------------------------------------
INSERT INTO public.oauth_clients (client_id, kind, platform, display_name, redirect_uris, trust, pinned_metadata)
VALUES
  (
    'https://claude.ai/oauth/mcp-oauth-client-metadata', 'cimd', 'claude', 'Claude',
    ARRAY['https://claude.ai/api/mcp/auth_callback'], 'trusted',
    '{"client_id":"https://claude.ai/oauth/mcp-oauth-client-metadata","client_name":"Claude","client_uri":"https://claude.ai","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"grant_types":["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:jwt-bearer"],"response_types":["code"],"token_endpoint_auth_method":"none"}'::jsonb
  ),
  (
    'https://claude.ai/oauth/claude-code-client-metadata', 'cimd', 'claude_code', 'Claude Code',
    ARRAY['http://localhost/callback', 'http://127.0.0.1/callback'], 'trusted',
    '{"client_id":"https://claude.ai/oauth/claude-code-client-metadata","client_name":"Claude Code","client_uri":"https://claude.ai","redirect_uris":["http://localhost/callback","http://127.0.0.1/callback"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}'::jsonb
  ),
  (
    'https://chatgpt.com/oauth/client.json', 'cimd', 'chatgpt', 'ChatGPT',
    ARRAY['https://chatgpt.com/connector_platform_oauth_redirect'], 'trusted',
    '{"client_id":"https://chatgpt.com/oauth/client.json","client_uri":"https://chatgpt.com/","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"],"token_endpoint_auth_method":"private_key_jwt","token_endpoint_auth_methods_supported":["none","private_key_jwt"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"client_name":"ChatGPT","jwks_uri":"https://chatgpt.com/oauth/jwks.json"}'::jsonb
  )
ON CONFLICT (client_id) DO UPDATE
  SET kind = EXCLUDED.kind,
      platform = EXCLUDED.platform,
      display_name = EXCLUDED.display_name,
      redirect_uris = EXCLUDED.redirect_uris,
      trust = EXCLUDED.trust,
      pinned_metadata = EXCLUDED.pinned_metadata,
      updated_at = NOW();
