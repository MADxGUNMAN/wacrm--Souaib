-- ============================================================
-- Security: logged-in devices + login activity (per user).
--
-- Every user (owner or member) sees and manages only THEIR OWN devices
-- and activity under Settings → Login & security.
--
--   user_sessions    one row per Supabase auth session (auth.sessions.id)
--                    with what we learn about the device: first/last
--                    activity, IP, country, platform, device, browser,
--                    timezone. auth.sessions stays the source of truth
--                    for whether a session is live.
--   security_events  append-only log: logins, logouts, device revokes,
--                    failed sign-ins, password changes, API key changes.
--
-- Both tables are written and read only by the server (service role) —
-- RLS on, no policies, so the browser can never read or forge rows.
--
-- Revoking a device deletes its auth.sessions row (refresh tokens
-- cascade), through SECURITY DEFINER functions callable only by the
-- service role and always scoped to the caller's own user id.
--
-- Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts (id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  country_code text,
  timezone text,
  platform text,
  device_type text,
  browser text,
  browser_version text,
  user_agent text,
  ended_at timestamptz,
  end_reason text CHECK (
    end_reason IS NULL OR end_reason IN ('logout', 'revoked', 'logout_all', 'expired')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON public.user_sessions (user_id, last_seen_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts (id) ON DELETE CASCADE,
  -- Whose log this row belongs to.
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Who did it (same as user_id except for future admin actions).
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
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
      'api_key_revoked'
    )
  ),
  session_id uuid,
  -- For device revokes: the IP of the device that was signed out.
  target_ip text,
  ip text,
  country_code text,
  timezone text,
  platform text,
  device_type text,
  browser text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_user_idx
  ON public.security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_account_idx
  ON public.security_events (account_id, created_at DESC);
-- One "login" row per auth session, so backfill and heartbeat can't
-- double-log the same sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS security_events_login_once
  ON public.security_events (session_id)
  WHERE event_type = 'login' AND session_id IS NOT NULL;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.user_sessions TO service_role;
GRANT ALL ON public.security_events TO service_role;

-- ── Live auth sessions for one user ───────────────────────────
CREATE OR REPLACE FUNCTION public.security_list_auth_sessions(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip text,
  aal text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id,
         s.created_at,
         s.updated_at,
         s.refreshed_at AT TIME ZONE 'UTC',
         s.user_agent,
         host(s.ip),
         s.aal::text
    FROM auth.sessions s
   WHERE s.user_id = p_user_id
     AND (s.not_after IS NULL OR s.not_after > now())
   ORDER BY s.created_at DESC;
$$;

-- ── Revoke one session (must belong to p_user_id) ──────────────
CREATE OR REPLACE FUNCTION public.security_revoke_auth_session(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM auth.sessions
   WHERE id = p_session_id
     AND user_id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- ── Revoke every session except p_keep (NULL = all) ─────────────
CREATE OR REPLACE FUNCTION public.security_revoke_other_auth_sessions(
  p_user_id uuid,
  p_keep uuid
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM auth.sessions
   WHERE user_id = p_user_id
     AND (p_keep IS NULL OR id <> p_keep)
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.security_list_auth_sessions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.security_revoke_auth_session(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.security_revoke_other_auth_sessions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_list_auth_sessions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_revoke_auth_session(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_revoke_other_auth_sessions(uuid, uuid) TO service_role;
