-- ============================================================
-- Migration: 037_member_permissions.sql
--
-- Adds granular per-section permissions (`permissions` JSONB) to the
-- `profiles` table. This supports the IDP account creation ("Create member")
-- flow and custom member permission editing.
--
-- If `permissions` is NULL, the member inherits standard access according
-- to their `account_role` (owner, admin, agent, viewer).
-- If `permissions` is a JSONB object, it defines boolean flags for:
--   inbox, dashboard, contacts, pipelines, broadcasts, automations, settings
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;

-- ============================================================
-- set_member_permissions(p_user_id, p_permissions)
--
-- Admin-only RPC to update the `permissions` JSONB on a target member's
-- profile within the caller's account. Cannot target the account owner.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_permissions(
  p_user_id UUID,
  p_permissions JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller's account + role.
  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+.
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve target.
  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Target must be in caller's account.
  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  -- Cannot modify owner permissions.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot modify permissions of the account owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET permissions = p_permissions
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_permissions(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_permissions(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_permissions(UUID, JSONB) TO authenticated;
