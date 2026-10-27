-- ============================================================
-- AI connector — Phase 2 (OAuth server) schema additions.
--
--  1. notifications.type gains 'ai_connection' so the user gets an
--     in-app notice when an AI app is connected to their account, or
--     disconnected for a security reason.
--  2. ai_connections.revoke_reason gains 'code_reuse': an authorization
--     code presented a second time revokes the connection it created
--     (RFC 6749 §4.1.2), and the reason should say so.
--
-- Idempotent: constraints are dropped and re-created.
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'usage_threshold', 'ai_connection'));

ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_revoke_reason_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_revoke_reason_check
  CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'user',
    'owner',
    'replaced',
    'membership_changed',
    'refresh_reuse',
    'code_reuse',
    'client_revoked',
    'idle',
    'platform'
  ));
