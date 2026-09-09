-- ============================================================
-- 20260812000000_harden_late_objects.sql
--
-- Applies 082's hardening to objects that are created AFTER 082 runs.
--
-- ─── WHY A SEPARATE FILE ────────────────────────────────────
--
-- Migrations apply in filename order, and that order is:
--
--   ... 081_... 081b_... 082_security_advisor_hardening.sql
--   20260811000000_sync_email_changes.sql      <- creates handle_user_update
--   20260812000000_harden_late_objects.sql     <- this file
--
-- `handle_user_update()` therefore does not exist when 082 runs (082
-- skips it with a NOTICE rather than failing — see the loops there), so
-- its search_path was never pinned and its EXECUTE grant was never
-- revoked on a fresh install. Production is unaffected because 082 was
-- applied by hand after everything else existed; only a clean replay
-- exposed the gap.
--
-- Rather than renumber history, the hardening for late-created objects
-- lives here, where they are guaranteed to exist.
--
-- Idempotent and drift-tolerant, for the same reasons 082 is.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.handle_user_update()') IS NULL THEN
    RAISE NOTICE 'handle_user_update() not found — nothing to harden';
    RETURN;
  END IF;

  -- A mutable search_path on a SECURITY DEFINER trigger function is the
  -- exact finding Supabase's linter raises as
  -- `function_search_path_mutable`.
  EXECUTE 'ALTER FUNCTION public.handle_user_update() SET search_path = public';

  -- It is a TRIGGER function on auth.users. Nothing should ever be able
  -- to call it over /rest/v1/rpc. Revoking PUBLIC matters as much as the
  -- two named roles: Postgres grants EXECUTE to PUBLIC on every new
  -- function, so revoking anon/authenticated alone would be a no-op.
  -- Triggers fire as the trigger owner, so this does not affect the
  -- trigger itself.
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_user_update() FROM PUBLIC, anon, authenticated';
END
$$;
