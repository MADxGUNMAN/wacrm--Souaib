-- ============================================================
-- 051_subscription_trigger_grants.sql
--
-- Lock down the trial-bootstrap trigger function's callable surface.
--
-- `accounts_set_trial_defaults()` is SECURITY DEFINER (it has to read
-- `subscription_settings`, which is service-role only) and lives in
-- `public`, so PostgREST advertises it at
-- `/rest/v1/rpc/accounts_set_trial_defaults` and Supabase's database
-- linter flags it under `0028/0029_*_security_definer_function_executable`.
--
-- In practice it isn't exploitable — Postgres refuses to invoke a
-- trigger function outside a trigger context ("trigger functions can
-- only be called as triggers", error 0A000) — but an advertised
-- SECURITY DEFINER endpoint is noise that hides real findings, so
-- revoke it explicitly.
--
-- Revoking EXECUTE does NOT stop the trigger firing: Postgres checks
-- EXECUTE on a trigger function once, when the trigger is CREATEd, and
-- does not re-check per firing. Verified after applying by inserting an
-- auth.users row inside a rolled-back transaction and confirming the
-- trial window was still stamped.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

REVOKE ALL ON FUNCTION public.accounts_set_trial_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accounts_set_trial_defaults() FROM anon;
REVOKE ALL ON FUNCTION public.accounts_set_trial_defaults() FROM authenticated;

-- The trigger executes as the table owner, so only `postgres` and the
-- service role need to retain EXECUTE.
GRANT EXECUTE ON FUNCTION public.accounts_set_trial_defaults() TO service_role;
