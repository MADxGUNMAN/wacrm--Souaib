-- ============================================================
-- AI connector — workspace policy, audit log, two-step confirmations,
-- daily usage counters, membership-change revocation, contact source.
--
-- Plan: docs/ai-connector/01-architecture.md §6.6–§6.10 and
-- docs/ai-connector/04-permissions-and-crm-ui.md §2.
-- Depends on 20261001000000_ai_connector_oauth.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Workspace AI policy (owner-managed). Absent row = defaults.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_workspace_policies (
  account_id                    UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  enabled                       BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_platforms             TEXT[] NOT NULL DEFAULT ARRAY['claude', 'claude_code', 'chatgpt', 'codex'],
  members_allowed               BOOLEAN NOT NULL DEFAULT TRUE,
  -- Highest capability tier a MEMBER's connection may have.
  max_member_tier               TEXT NOT NULL DEFAULT 'edit',
  allow_messaging               BOOLEAN NOT NULL DEFAULT TRUE,
  allow_broadcasts              BOOLEAN NOT NULL DEFAULT FALSE,
  allow_automation_changes      BOOLEAN NOT NULL DEFAULT FALSE,
  daily_message_cap             INTEGER NOT NULL DEFAULT 300,
  daily_broadcast_recipient_cap INTEGER NOT NULL DEFAULT 500,
  require_preview_for_sends     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set by a super admin. The owner cannot override it.
  locked_by_platform            BOOLEAN NOT NULL DEFAULT FALSE,
  locked_reason                 TEXT,
  updated_by                    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_workspace_policies DROP CONSTRAINT IF EXISTS ai_workspace_policies_tier_check;
ALTER TABLE public.ai_workspace_policies ADD CONSTRAINT ai_workspace_policies_tier_check
  CHECK (max_member_tier IN ('view', 'edit', 'send'));

ALTER TABLE public.ai_workspace_policies DROP CONSTRAINT IF EXISTS ai_workspace_policies_caps_check;
ALTER TABLE public.ai_workspace_policies ADD CONSTRAINT ai_workspace_policies_caps_check
  CHECK (daily_message_cap BETWEEN 0 AND 100000
     AND daily_broadcast_recipient_cap BETWEEN 0 AND 1000000);

ALTER TABLE public.ai_workspace_policies DROP CONSTRAINT IF EXISTS ai_workspace_policies_platforms_check;
ALTER TABLE public.ai_workspace_policies ADD CONSTRAINT ai_workspace_policies_platforms_check
  CHECK (allowed_platforms <@ ARRAY['claude', 'claude_code', 'chatgpt', 'codex', 'mcp_inspector', 'other']);

COMMENT ON TABLE public.ai_workspace_policies IS
  'Owner-managed AI connector policy. No row means the defaults in this table definition. Written only by server routes.';

-- ------------------------------------------------------------
-- 2. Audit log — one row per tool call and per OAuth event
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.ai_connections(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  platform      TEXT,
  -- Tool name, or an OAuth event such as 'oauth.connected'.
  action        TEXT NOT NULL,
  -- Redacted summary: ids and counts, never message bodies or secrets.
  args_summary  JSONB,
  outcome       TEXT NOT NULL,
  deny_reason   TEXT,
  affected_ids  UUID[],
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_audit_log DROP CONSTRAINT IF EXISTS ai_audit_log_outcome_check;
ALTER TABLE public.ai_audit_log ADD CONSTRAINT ai_audit_log_outcome_check
  CHECK (outcome IN ('ok', 'denied', 'error', 'confirmation_required'));

ALTER TABLE public.ai_audit_log DROP CONSTRAINT IF EXISTS ai_audit_log_action_len;
ALTER TABLE public.ai_audit_log ADD CONSTRAINT ai_audit_log_action_len
  CHECK (char_length(action) BETWEEN 1 AND 80);

CREATE INDEX IF NOT EXISTS ai_audit_log_account_idx
  ON public.ai_audit_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_log_connection_idx
  ON public.ai_audit_log (connection_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Two-step confirmations (preview → execute), 10 min, single use
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_confirmations (
  id            TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.ai_connections(id) ON DELETE CASCADE,
  tool          TEXT NOT NULL,
  args_hash     TEXT NOT NULL,
  preview       JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_confirmations_connection_idx
  ON public.ai_confirmations (connection_id);
CREATE INDEX IF NOT EXISTS ai_confirmations_expires_idx
  ON public.ai_confirmations (expires_at);

-- ------------------------------------------------------------
-- 4. Daily usage counters for caps
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  account_id           UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  connection_id        UUID NOT NULL REFERENCES public.ai_connections(id) ON DELETE CASCADE,
  day                  DATE NOT NULL,
  messages_sent        INTEGER NOT NULL DEFAULT 0,
  broadcast_recipients INTEGER NOT NULL DEFAULT 0,
  writes               INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, connection_id, day)
);
CREATE INDEX IF NOT EXISTS ai_usage_daily_account_day_idx
  ON public.ai_usage_daily (account_id, day);

-- Atomic "reserve then act": increments only when the new totals stay
-- within both caps, and reports whether it did. Called by the service
-- role only (EXECUTE revoked below), BEFORE the side effect runs, so two
-- concurrent sends can't both slip under the cap.
CREATE OR REPLACE FUNCTION public.ai_usage_try_increment(
  p_account_id         UUID,
  p_connection_id      UUID,
  p_day                DATE,
  p_messages           INTEGER,
  p_recipients         INTEGER,
  p_writes             INTEGER,
  p_connection_msg_cap INTEGER,
  p_account_msg_cap    INTEGER,
  p_account_rcpt_cap   INTEGER
)
RETURNS TABLE (allowed BOOLEAN, connection_messages INTEGER, account_messages INTEGER, account_recipients INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn_msgs  INTEGER;
  v_acct_msgs  INTEGER;
  v_acct_rcpts INTEGER;
BEGIN
  IF p_messages < 0 OR p_recipients < 0 OR p_writes < 0 THEN
    RAISE EXCEPTION 'increments must be non-negative';
  END IF;

  -- Serialise per account so the account-wide totals below are exact.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_account_id::text, 0));

  INSERT INTO ai_usage_daily (account_id, connection_id, day)
  VALUES (p_account_id, p_connection_id, p_day)
  ON CONFLICT DO NOTHING;

  SELECT messages_sent INTO v_conn_msgs
    FROM ai_usage_daily
   WHERE account_id = p_account_id AND connection_id = p_connection_id AND day = p_day;

  SELECT COALESCE(SUM(messages_sent), 0), COALESCE(SUM(broadcast_recipients), 0)
    INTO v_acct_msgs, v_acct_rcpts
    FROM ai_usage_daily
   WHERE account_id = p_account_id AND day = p_day;

  IF v_conn_msgs + p_messages > p_connection_msg_cap
     OR v_acct_msgs + p_messages > p_account_msg_cap
     OR v_acct_rcpts + p_recipients > p_account_rcpt_cap THEN
    RETURN QUERY SELECT FALSE, v_conn_msgs, v_acct_msgs, v_acct_rcpts;
    RETURN;
  END IF;

  UPDATE ai_usage_daily
     SET messages_sent = messages_sent + p_messages,
         broadcast_recipients = broadcast_recipients + p_recipients,
         writes = writes + p_writes
   WHERE account_id = p_account_id AND connection_id = p_connection_id AND day = p_day;

  RETURN QUERY SELECT TRUE, v_conn_msgs + p_messages, v_acct_msgs + p_messages, v_acct_rcpts + p_recipients;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_try_increment(UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_try_increment(UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
  TO service_role;

-- ------------------------------------------------------------
-- 5. RLS and privileges
-- ------------------------------------------------------------
ALTER TABLE public.ai_workspace_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_confirmations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_workspace_policies FROM anon, authenticated;
REVOKE ALL ON public.ai_audit_log          FROM anon, authenticated;
REVOKE ALL ON public.ai_confirmations      FROM anon, authenticated;
REVOKE ALL ON public.ai_usage_daily        FROM anon, authenticated;

-- Members can see the policy that governs them (Settings shows why an
-- option is disabled). Writes go through the owner-only server route.
GRANT SELECT ON public.ai_workspace_policies TO authenticated;
DROP POLICY IF EXISTS ai_workspace_policies_select ON public.ai_workspace_policies;
CREATE POLICY ai_workspace_policies_select ON public.ai_workspace_policies
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

-- Activity: your own rows, or every row in the account if you're the owner.
GRANT SELECT ON public.ai_audit_log TO authenticated;
DROP POLICY IF EXISTS ai_audit_log_select_own ON public.ai_audit_log;
CREATE POLICY ai_audit_log_select_own ON public.ai_audit_log
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_account_member(account_id));

DROP POLICY IF EXISTS ai_audit_log_select_owner ON public.ai_audit_log;
CREATE POLICY ai_audit_log_select_owner ON public.ai_audit_log
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id, 'owner'));

-- ------------------------------------------------------------
-- 6. Revoke connections when membership changes
-- ------------------------------------------------------------
-- The gate also re-checks membership on every call; this trigger makes
-- the revocation visible in Settings immediately and permanent.
CREATE OR REPLACE FUNCTION public.ai_connections_revoke_on_membership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR (OLD.is_active IS DISTINCT FROM FALSE AND NEW.is_active = FALSE) THEN
    UPDATE ai_connections
       SET revoked_at = NOW(),
           revoke_reason = 'membership_changed',
           updated_at = NOW()
     WHERE user_id = OLD.user_id
       AND account_id = OLD.account_id
       AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_connections_revoke_on_membership_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ai_connections_revoke_on_membership_change ON public.profiles;
CREATE TRIGGER trg_ai_connections_revoke_on_membership_change
  AFTER UPDATE OF account_id, is_active OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_connections_revoke_on_membership_change();

-- ------------------------------------------------------------
-- 7. contacts.source gains 'ai'
-- ------------------------------------------------------------
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_source_check CHECK (
  source IN (
    'manual', 'import', 'whatsapp', 'api', 'campaign', 'phone_sync',
    'ai',      -- created through the Claude / ChatGPT connector
    'unknown'
  )
);
