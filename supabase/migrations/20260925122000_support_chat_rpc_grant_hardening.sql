-- ============================================================
-- Support chat RPCs: revoke EXECUTE from the browser roles.
--
-- WHY THIS IS A SEPARATE MIGRATION
--
-- 20260925121000 created both functions with `REVOKE ALL ... FROM
-- PUBLIC`, which reads like it locks them down and does not. This
-- project's public schema carries ALTER DEFAULT PRIVILEGES granting
-- EXECUTE ON FUNCTIONS to `anon` and `authenticated`, so a freshly
-- CREATEd function is handed those two grants at birth. Revoking from
-- PUBLIC does not touch a grant held by a named role — verified on the
-- live database, where both functions showed
-- `anon=X/postgres | authenticated=X/postgres` after that migration ran.
--
-- WHAT THAT MEANT IN PRACTICE
--
-- Both functions are SECURITY DEFINER and take a bare conversation id,
-- because the routes that call them have already established who the
-- caller is. Reachable from a browser session they become:
--
--   * fn_support_chat_after_send(<any conversation>, true, 'text')
--     — writes an arbitrary `last_message_preview` into another
--     workspace's thread row and inflates its unread counter. The
--     preview is what the operator's inbox list renders, so this is
--     content injection into a surface the victim never wrote to.
--
--   * fn_support_chat_mark_read(<any conversation>, true)
--     — zeroes the OPERATOR's unread counter for someone else's
--     conversation and forges `read_at` on their messages, which is how
--     a support request gets silently buried.
--
-- Neither leaks message text (RLS on SELECT still holds), so this is
-- tampering rather than disclosure — but a tenant being able to hide
-- another tenant's support request is not an acceptable failure mode.
--
-- The same trap is documented in the GRANT HARDENING section of
-- 20260827000000_super_admin_notifications.sql. Naming the roles
-- explicitly is the only thing that actually closes it.
-- ============================================================

REVOKE ALL ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_support_chat_mark_read(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- service_role keeps EXECUTE: that is the identity the send and read
-- routes use, and it is never handed to a browser.
GRANT EXECUTE ON FUNCTION public.fn_support_chat_after_send(UUID, BOOLEAN, TEXT)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_support_chat_mark_read(UUID, BOOLEAN)
  TO service_role;
