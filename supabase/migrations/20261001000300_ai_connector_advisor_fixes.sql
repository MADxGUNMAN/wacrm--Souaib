-- ============================================================
-- AI connector — fixes from the Supabase performance advisor run right
-- after 20261001000000..0200 were applied.
--
--  1. Covering indexes for the new foreign keys (unindexed_foreign_keys).
--     Cascading deletes (an account, a user, a connection) would otherwise
--     scan these tables.
--  2. One SELECT policy per table instead of two permissive ones
--     (multiple_permissive_policies): Postgres evaluates every permissive
--     policy for every row, so "own OR owner" in a single policy is cheaper
--     and means exactly the same thing.
--
-- Idempotent.
-- ============================================================

CREATE INDEX IF NOT EXISTS ai_audit_log_user_idx
  ON public.ai_audit_log (user_id);
CREATE INDEX IF NOT EXISTS ai_connections_revoked_by_idx
  ON public.ai_connections (revoked_by);
CREATE INDEX IF NOT EXISTS ai_connector_profiles_user_idx
  ON public.ai_connector_profiles (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_daily_connection_idx
  ON public.ai_usage_daily (connection_id);
CREATE INDEX IF NOT EXISTS ai_workspace_policies_updated_by_idx
  ON public.ai_workspace_policies (updated_by);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_client_idx
  ON public.oauth_authorization_codes (oauth_client_id);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_request_idx
  ON public.oauth_authorization_codes (request_id);
CREATE INDEX IF NOT EXISTS oauth_authorization_requests_client_idx
  ON public.oauth_authorization_requests (oauth_client_id);
CREATE INDEX IF NOT EXISTS oauth_authorization_requests_user_idx
  ON public.oauth_authorization_requests (user_id);

-- ai_connections: the connecting user, or the account owner.
DROP POLICY IF EXISTS ai_connections_select_own ON public.ai_connections;
DROP POLICY IF EXISTS ai_connections_select_owner ON public.ai_connections;
DROP POLICY IF EXISTS ai_connections_select ON public.ai_connections;
CREATE POLICY ai_connections_select ON public.ai_connections
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_account_member(account_id, 'owner')
  );

-- ai_audit_log: your own rows while you're a member, or every row if
-- you're the owner.
DROP POLICY IF EXISTS ai_audit_log_select_own ON public.ai_audit_log;
DROP POLICY IF EXISTS ai_audit_log_select_owner ON public.ai_audit_log;
DROP POLICY IF EXISTS ai_audit_log_select ON public.ai_audit_log;
CREATE POLICY ai_audit_log_select ON public.ai_audit_log
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.is_account_member(account_id))
    OR public.is_account_member(account_id, 'owner')
  );
