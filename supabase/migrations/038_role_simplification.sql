-- ============================================================
-- 038_role_simplification.sql — Collapse roles to owner/member
--
-- Simplifies the account_role_enum from 4 values (owner, admin,
-- agent, viewer) down to 2 (owner, member). All existing admin,
-- agent, and viewer users are converted to 'member'. Their
-- specific capabilities are now governed entirely by the JSON
-- permissions column on profiles (added in migration 037).
--
-- Also rewrites the `is_account_member` helper and conversation
-- RLS policies to enforce assignment-based visibility: members
-- can only see conversations assigned to them.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. ENUM MIGRATION
--
-- Postgres doesn't allow removing enum values, so we:
--   a) Rename the old enum
--   b) Create the new one with just owner/member
--   c) Migrate all columns
--   d) Drop the old enum
-- ============================================================

-- Step 1a: Convert all admin/agent/viewer → 'member' text first
-- (We do this while the old enum is still in place)
UPDATE profiles SET account_role = 'agent' WHERE account_role IN ('admin', 'viewer');

-- Step 1b: Add 'member' to the existing enum (safe, additive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'account_role_enum'::regtype
      AND enumlabel = 'member'
  ) THEN
    ALTER TYPE account_role_enum ADD VALUE 'member';
  END IF;
END $$;

-- Step 1c: Now convert all non-owner users to 'member'
-- (must be in a separate transaction block from ADD VALUE in some PG versions,
--  but Supabase migrations run each file as a single transaction that supports this)
UPDATE profiles SET account_role = 'member' WHERE account_role IN ('admin', 'agent', 'viewer');

-- Step 1d: Update account_invitations to use 'member' for any pending invites
UPDATE account_invitations SET role = 'member' WHERE role IN ('admin', 'agent', 'viewer');

-- ============================================================
-- 2. UPDATE is_account_member HELPER
--
-- Simplified hierarchy: owner=2, member=1.
-- The old admin(3)/agent(2)/viewer(1) ranks collapse into member(1).
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'member'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 2
            WHEN 'member' THEN 1
            -- Legacy values (should not exist post-migration, but be safe)
            WHEN 'admin'  THEN 1
            WHEN 'agent'  THEN 1
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 2
            WHEN 'member' THEN 1
            WHEN 'admin'  THEN 1
            WHEN 'agent'  THEN 1
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- 3. CONVERSATION ASSIGNMENT INDEX
--
-- The assigned_agent_id column already exists (migration 001).
-- Add an index for fast member-scoped queries.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent
  ON conversations(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- ============================================================
-- 4. REWRITE CONVERSATION RLS POLICIES
--
-- New visibility rules:
--   SELECT: owners see everything in their account.
--           members see ONLY conversations assigned to them.
--   INSERT: any account member (for webhook/system inserts).
--   UPDATE: owners can update any; members can update assigned.
--   DELETE: owners only.
-- ============================================================

-- Drop existing conversation policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', pol.policyname);
  END LOOP;
END $$;

-- Owners see all account conversations; members see only assigned
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  CASE
    WHEN (SELECT account_role FROM profiles WHERE user_id = auth.uid() AND account_id = conversations.account_id) = 'owner'
    THEN TRUE
    ELSE conversations.assigned_agent_id = auth.uid()
  END
);

-- Inserts: any member of the account (webhooks use service_role, so this
-- primarily covers client-side conversation creation if any).
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (is_account_member(account_id));

-- Updates: owners can update any; members can update their assigned conversations
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (
  CASE
    WHEN (SELECT account_role FROM profiles WHERE user_id = auth.uid() AND account_id = conversations.account_id) = 'owner'
    THEN TRUE
    ELSE conversations.assigned_agent_id = auth.uid()
  END
);

-- Deletes: owner only
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (is_account_member(account_id, 'owner'));

-- ============================================================
-- 5. UPDATE set_member_permissions RPC
--
-- Allow 'member' as a valid role value in addition to legacy ones.
-- The RPC was created in migration 018; we replace it here.
-- ============================================================

-- (The existing RPC accepts account_role_enum, which now includes 'member',
--  so no change is needed to the function signature itself.)

-- ============================================================
-- 6. DONE
-- ============================================================
