-- ============================================================
-- Let super admins read member presence, so the Account Deep Dive can
-- show the same live online / away / offline status the tenant's own
-- Settings → Team members page shows.
--
-- ─── Why an RLS policy and not just the service role ─────────────
--
-- Every other super-admin read goes through `supabaseAdmin()` in an
-- /api/super-admin/* route, which bypasses RLS entirely. That works for
-- a snapshot, but presence has to be LIVE, and the live mechanism is a
-- browser Supabase Realtime subscription on `member_presence`. Realtime
-- re-checks every change against the SUBSCRIBER'S JWT using these
-- policies before emitting it, so a service-role read on the server
-- cannot help — the browser itself has to be allowed to see the rows.
-- (A service-role key must never reach the browser.)
--
-- The only existing policy is:
--   member_presence_select USING (is_account_member(account_id))
-- and `is_account_member` reduces to "is the CALLER'S OWN
-- profiles.account_id this account" — it never consults is_super_admin.
-- So today a super admin inspecting another tenant gets an empty result
-- with NO error (RLS filters rather than throwing) and a subscription
-- that never fires. That silence is exactly why this needs a policy.
--
-- ─── Scope of what this grants ───────────────────────────────────
--
-- Permissive policies are OR'd, so this ADDS super-admin read without
-- touching the member policy. It grants SELECT only, and only on
-- `member_presence`, whose entire contents are a status enum, an
-- optional custom status, and a timestamp — no message content, no
-- contact data, no credentials. Super admins can already read all of it
-- server-side via fn_account_deep_dive; this simply lets the same
-- person's browser subscribe to it changing.
--
-- `is_super_admin_user()` is the codebase's existing helper
-- (20260827000000_super_admin_notifications.sql): SECURITY DEFINER so it
-- can read the flag without a broad SELECT policy on profiles, and
-- STABLE so Postgres caches it per statement rather than re-running it
-- per row.
-- ============================================================

-- ─── Why `TO authenticated` is load-bearing ──────────────────────
--
-- Without it this policy breaks ANONYMOUS reads of this table. Postgres
-- OR's all permissive SELECT policies, so an anon client would evaluate
-- `is_super_admin_user()` too — and that function has EXECUTE revoked
-- from anon (082 / 20260827000000), so the read fails outright with
-- "permission denied for function is_super_admin_user" instead of
-- returning zero rows. Verified against the live database before the
-- role restriction was added.
--
-- `is_account_member` IS granted to anon, which is why the pre-existing
-- member policy never had this problem, and why the other policies using
-- `is_super_admin_user()` (on super_admin_notifications*) never hit it:
-- no anon client queries those tables.
--
-- Restricting to `authenticated` means anon never considers this policy,
-- so anonymous behaviour is exactly what it was before this migration.

DROP POLICY IF EXISTS member_presence_select_super_admin ON public.member_presence;

CREATE POLICY member_presence_select_super_admin
  ON public.member_presence
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin_user());

COMMENT ON POLICY member_presence_select_super_admin ON public.member_presence IS
  'Super admins may read presence for every account, so the Account Deep Dive can subscribe to live online/away/offline status. Restricted TO authenticated because is_super_admin_user() has EXECUTE revoked from anon: an unrestricted policy makes anonymous reads of this table raise "permission denied for function" instead of returning zero rows. SELECT only; writes still go exclusively through touch_presence().';
