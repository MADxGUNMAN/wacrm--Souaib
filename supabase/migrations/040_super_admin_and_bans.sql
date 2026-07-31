-- ============================================================
-- 040_super_admin_and_bans.sql
-- Adds super admin flag and account ban system
-- ============================================================

-- 1. Add is_super_admin flag to profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add ban columns to accounts table
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Index for quick super admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin 
  ON profiles(is_super_admin) WHERE is_super_admin = TRUE;

-- 4. Index for banned accounts
CREATE INDEX IF NOT EXISTS idx_accounts_banned 
  ON accounts(is_banned) WHERE is_banned = TRUE;
