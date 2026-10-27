-- ============================================================
-- Super admin: permanently delete a workspace (account) and every
-- user in it.
--
-- sa_delete_account() runs in ONE transaction:
--   1. locks the account row; refuses if it is missing, BANNED (it must
--      be unbanned first), or contains a super admin / the caller,
--   2. removes rows that only SET NULL on account delete (super-admin
--      notifications, support reply emails, add-on issue reports), so no
--      trace of the workspace's data is left behind,
--   3. deletes the account — every workspace table cascades from it,
--   4. deletes each member's auth user (identities, sessions, MFA and
--      all per-user tables cascade), so their email can sign up again as
--      a brand-new user,
--   5. writes one PII-free audit row (who deleted which account id, when).
--
-- Files in object storage are removed by the server afterwards; the
-- function returns the member and support-conversation ids it needs.
--
-- Callable by the service role only. Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.super_admin_account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The deleted account's id. No name, email or other personal data.
  account_id uuid NOT NULL,
  deleted_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  member_count integer NOT NULL DEFAULT 0,
  storage_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_account_deletions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.super_admin_account_deletions TO service_role;

CREATE OR REPLACE FUNCTION public.sa_delete_account(
  p_account_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_banned boolean;
  v_members uuid[];
  v_support uuid[];
  v_audit uuid;
BEGIN
  -- The actor must be a super admin (defence in depth: the API checks too).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = p_actor_user_id AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'not_super_admin' USING ERRCODE = '42501';
  END IF;

  SELECT a.is_banned INTO v_banned
    FROM public.accounts a
   WHERE a.id = p_account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(v_banned, false) THEN
    RAISE EXCEPTION 'account_banned' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(p.user_id), '{}') INTO v_members
    FROM public.profiles p
   WHERE p.account_id = p_account_id;
  -- The owner always goes too, even without a profile row.
  SELECT array(
    SELECT DISTINCT u FROM unnest(
      v_members || (SELECT a.owner_user_id FROM public.accounts a WHERE a.id = p_account_id)
    ) u WHERE u IS NOT NULL
  ) INTO v_members;

  IF p_actor_user_id = ANY (v_members) OR EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = ANY (v_members) AND p.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'protected_account' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(c.id), '{}') INTO v_support
    FROM public.support_conversations c
   WHERE c.account_id = p_account_id;

  DELETE FROM public.super_admin_notifications WHERE account_id = p_account_id;
  DELETE FROM public.support_reply_emails WHERE account_id = p_account_id;
  DELETE FROM public.sheets_addon_issue_reports WHERE account_id = p_account_id;

  DELETE FROM public.accounts WHERE id = p_account_id;
  DELETE FROM auth.users WHERE id = ANY (v_members);

  INSERT INTO public.super_admin_account_deletions (account_id, deleted_by_user_id, member_count)
  VALUES (p_account_id, p_actor_user_id, coalesce(array_length(v_members, 1), 0))
  RETURNING id INTO v_audit;

  RETURN jsonb_build_object(
    'audit_id', v_audit,
    'member_ids', to_jsonb(v_members),
    'support_conversation_ids', to_jsonb(v_support)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sa_delete_account(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_delete_account(uuid, uuid) TO service_role;
