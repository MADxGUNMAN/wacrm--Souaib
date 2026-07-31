-- ============================================================
-- 039_member_suspension.sql — Member Suspension
--
-- Adds the is_active column to profiles and an RPC to safely
-- toggle it.
-- ============================================================

-- Add the column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- set_member_status(p_user_id, p_is_active)
--
-- Owner/Admin toggles another member's active status within the
-- caller's account. Owners cannot suspend themselves.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_status(
  p_user_id UUID,
  p_is_active BOOLEAN
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

  -- Can't suspend self via this endpoint.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend or activate your own account'
      USING ERRCODE = '22023';
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

  -- Owners cannot be suspended.
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot suspend the account owner'
      USING ERRCODE = '22023';
  END IF;

  -- Commit the update
  UPDATE profiles
  SET 
    is_active = p_is_active,
    updated_at = NOW()
  WHERE user_id = p_user_id;

END;
$$;
