-- ============================================================
-- Two-factor authentication (TOTP), per user, plus an optional
-- workspace-owner verification requirement for members.
--
--   user_two_factor               one row per user who set up an
--                                 authenticator app. The TOTP secret is
--                                 AES-256-GCM encrypted by the server.
--   user_two_factor_recovery_codes single-use backup codes (HMAC hashes).
--   two_factor_used_steps         replay guard: the last TOTP time step
--                                 each user consumed per secret, so a
--                                 code can't be used twice.
--   accounts.require_owner_two_factor
--                                 workspace setting: members must enter
--                                 the OWNER's code to sign in.
--   user_sessions.two_factor_*    which auth session passed 2FA, and how.
--
-- Sessions stay per user. security_two_factor_gate() decides, for the
-- calling user's current session, which code is required and whether it
-- was already given. The proxy calls it on every signed-in request.
--
-- All new tables: RLS on, no policies (server/service role only).
-- Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_two_factor (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  enabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_two_factor ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_two_factor_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
ALTER TABLE public.user_two_factor_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.two_factor_used_steps (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  secret_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_step bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, secret_user_id)
);
ALTER TABLE public.two_factor_used_steps ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.user_two_factor TO service_role;
GRANT ALL ON public.user_two_factor_recovery_codes TO service_role;
GRANT ALL ON public.two_factor_used_steps TO service_role;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS require_owner_two_factor boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS two_factor_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_sessions_two_factor_method_check'
       AND conrelid = 'public.user_sessions'::regclass
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_two_factor_method_check CHECK (
        two_factor_method IS NULL
        OR two_factor_method IN ('personal', 'owner', 'recovery', 'enrollment')
      );
  END IF;
END $$;

-- ── Activity log: new event types ─────────────────────────────
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.security_events'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.security_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.security_events
  ADD CONSTRAINT security_events_event_type_check CHECK (
    event_type IN (
      'login',
      'logout',
      'logout_all',
      'session_revoked',
      'sessions_revoked_others',
      'login_failed',
      'password_changed',
      'email_change_requested',
      'api_key_created',
      'api_key_revoked',
      'two_factor_enabled',
      'two_factor_disabled',
      'two_factor_verified',
      'two_factor_failed',
      'two_factor_recovery_used',
      'recovery_codes_regenerated',
      'owner_verification_enabled',
      'owner_verification_disabled',
      'owner_code_used'
    )
  );

-- ── The owner-verification switch is server-managed only ──────
-- accounts_update lets workspace admins edit their account row through
-- the REST API. This setting must go through the server route (which
-- asks for the owner's current code), so browser roles can't flip it.
CREATE OR REPLACE FUNCTION public.guard_require_owner_two_factor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.require_owner_two_factor IS DISTINCT FROM OLD.require_owner_two_factor
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'require_owner_two_factor can only be changed by the server'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_guard_require_owner_two_factor ON public.accounts;
CREATE TRIGGER accounts_guard_require_owner_two_factor
  BEFORE UPDATE OF require_owner_two_factor ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_require_owner_two_factor();

-- ── Gate: what does the CALLER's current session still need? ───
-- required: 'none' | 'personal' | 'owner'
--   owner    the workspace requires the owner's code, the caller is not
--            the owner, and the owner has an active authenticator.
--   personal the caller has their own active authenticator.
-- satisfied: this auth session (JWT session_id) already passed it.
--   An owner requirement is only met by an owner-code verification.
CREATE OR REPLACE FUNCTION public.security_two_factor_gate()
RETURNS TABLE (required text, satisfied boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_account uuid;
  v_owner uuid;
  v_require boolean;
  v_required text := 'none';
  v_method text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'none'::text, true;
    RETURN;
  END IF;

  BEGIN
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_sid := NULL;
  END;

  SELECT p.account_id INTO v_account FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_account IS NOT NULL THEN
    SELECT a.owner_user_id, a.require_owner_two_factor
      INTO v_owner, v_require
      FROM public.accounts a WHERE a.id = v_account;
  END IF;

  IF coalesce(v_require, false)
     AND v_owner IS NOT NULL
     AND v_owner <> v_uid
     AND EXISTS (
       SELECT 1 FROM public.user_two_factor t
        WHERE t.user_id = v_owner AND t.status = 'active'
     ) THEN
    v_required := 'owner';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_two_factor t
     WHERE t.user_id = v_uid AND t.status = 'active'
  ) THEN
    v_required := 'personal';
  END IF;

  IF v_required = 'none' THEN
    RETURN QUERY SELECT v_required, true;
    RETURN;
  END IF;

  IF v_sid IS NULL THEN
    RETURN QUERY SELECT v_required, false;
    RETURN;
  END IF;

  SELECT s.two_factor_method INTO v_method
    FROM public.user_sessions s
   WHERE s.session_id = v_sid
     AND s.user_id = v_uid
     AND s.ended_at IS NULL
     AND s.two_factor_verified_at IS NOT NULL;

  RETURN QUERY SELECT
    v_required,
    (v_method IS NOT NULL AND (v_required = 'personal' OR v_method = 'owner'));
END;
$$;

REVOKE ALL ON FUNCTION public.security_two_factor_gate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_two_factor_gate() TO authenticated, service_role;

-- ── Replay guard: claim a TOTP step atomically ────────────────
-- True only if p_step is newer than the last step this user consumed
-- for this secret.
CREATE OR REPLACE FUNCTION public.security_two_factor_claim_step(
  p_user_id uuid,
  p_secret_user_id uuid,
  p_step bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.two_factor_used_steps AS u (user_id, secret_user_id, last_step, updated_at)
  VALUES (p_user_id, p_secret_user_id, p_step, now())
  ON CONFLICT (user_id, secret_user_id) DO UPDATE
     SET last_step = excluded.last_step, updated_at = now()
   WHERE u.last_step < excluded.last_step;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.security_two_factor_claim_step(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_two_factor_claim_step(uuid, uuid, bigint) TO service_role;
