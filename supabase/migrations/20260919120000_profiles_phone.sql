-- ============================================================
-- Capture a phone number at signup, and surface it to super admins.
--
-- WHY: operators had no way to reach a customer other than email. The
-- number is collected once, at signup, and is deliberately an internal
-- ops field — no tenant-facing screen renders it (see the note on
-- visibility below).
--
-- ─── The data path this has to thread through ────────────────────
--
-- Signup does NOT write to `profiles`. The route only calls
-- auth.admin.generateLink(), which stores whatever it is given in
-- `auth.users.raw_user_meta_data`. A profile row appears later, the
-- moment the confirmation link is clicked, when handle_user_update()
-- fires and calls bootstrap_user_account(). So a new signup field has
-- to be picked up in FOUR places or it silently vanishes:
--
--   1. profiles.phone                      — the column itself
--   2. bootstrap_user_account(...)         — the only INSERT INTO profiles
--   3. handle_new_user()                   — confirmed-on-arrival path
--                                            (admin-created members)
--   4. handle_user_update()                — the normal signup path
--
-- ─── Nullable, and why there is no CHECK constraint ──────────────
--
-- Nullable because existing users predate the field and cannot be
-- backfilled — we have no number for them. Their rows read as NULL and
-- the UI shows a dash.
--
-- No format CHECK constraint on purpose. bootstrap_user_account runs
-- inside handle_new_user/handle_user_update, and BOTH of those swallow
-- exceptions with `RAISE WARNING` so a bootstrap failure can never block
-- a signup. A constraint violation there would therefore not surface as
-- an error — it would silently leave a confirmed user with no profile
-- and no workspace, which is far worse than an oddly-formatted string.
-- Format is enforced in the signup route (isValidE164) where a rejection
-- can actually be reported to the person typing it.
--
-- ─── Visibility ─────────────────────────────────────────────────
--
-- Reached only through super-admin surfaces: the service-role read of
-- v_platform_accounts_summary, fn_account_deep_dive, and the billing
-- subscriptions route. Every tenant-facing read of `profiles` uses an
-- explicit column list (verified across the codebase), so none of them
-- pick this up.
--
-- Note for future work: `profiles_select` (migration 017) allows
-- `auth.uid() = user_id OR is_account_member(account_id)`. RLS is
-- row-level, so a member of the SAME workspace could read this column
-- via a direct client query even though no screen shows it. That is the
-- workspace's own team reading their own owner's number, and it is not
-- readable across tenants. If it ever needs to be strictly
-- super-admin-only, the column has to move to a separate table with no
-- tenant SELECT policy — RLS cannot restrict a single column.
-- ============================================================

-- ---- 1. The column ----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.profiles.phone IS
  'Contact phone in E.164 (e.g. +919876543210), captured at signup. Internal/ops field: shown only in the super-admin panel. NULL for users created before this field existed, and for members an admin created directly.';

-- ---- 2. The single INSERT INTO profiles ----
-- Dropped rather than overloaded: adding a 4th parameter with a DEFAULT
-- alongside the existing 3-arg version would make `SELECT
-- bootstrap_user_account(a, b, c)` ambiguous and fail at runtime.
DROP FUNCTION IF EXISTS public.bootstrap_user_account(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.bootstrap_user_account(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(p_full_name, ''), p_email, 'My account'), p_user_id)
  RETURNING id INTO v_account_id;

  -- NULLIF so an empty-string phone is stored as NULL rather than '',
  -- keeping "not provided" a single value the UI can test for.
  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, phone)
  VALUES (
    p_user_id,
    COALESCE(p_full_name, ''),
    p_email,
    v_account_id,
    'owner',
    NULLIF(TRIM(COALESCE(p_phone, '')), '')
  );
END;
$$;

COMMENT ON FUNCTION public.bootstrap_user_account(UUID, TEXT, TEXT, TEXT) IS
  'Creates the personal workspace + owner profile for a confirmed user. Idempotent: returns immediately if a profile already exists. p_phone is optional and arrives from auth.users.raw_user_meta_data.';

-- ---- 3. Confirmed-on-arrival path (admin-created users) ----
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Unconfirmed: do nothing. handle_user_update() picks this up the
  -- moment the confirmation link is clicked. This single line is what
  -- stops ghost workspaces and premature trials.
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.bootstrap_user_account(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'
  );

  RETURN NEW;

-- Never let a bootstrap failure block the signup itself: a user who
-- exists without a workspace can be repaired, but a hard error here
-- surfaces to the customer as "signup failed" on an account that may
-- already have been created.
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ---- 4. The normal signup path: the confirmation moment ----
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Just confirmed — provision now. Guarded on the NULL -> NOT NULL
  -- transition specifically: this trigger fires on every auth.users
  -- update (last_sign_in_at, token rotation, password changes), and
  -- testing only `IS NOT NULL` would re-enter the helper on every
  -- single sign-in.
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    BEGIN
      PERFORM public.bootstrap_user_account(
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.raw_user_meta_data->>'phone'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to bootstrap account/profile on confirm for user %: %', NEW.id, SQLERRM;
    END;
  END IF;

  -- Pre-existing behaviour: keep the profile's copy of the address in
  -- step. A no-op while unconfirmed, since there is no profile yet.
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- 5. Super-admin accounts list ----
-- `owner_phone` is appended at the END of the select list, not beside
-- owner_email: CREATE OR REPLACE VIEW can only add columns after the
-- existing ones, and reordering or inserting would fail outright. The
-- consumer reads the view with select('*'), so position is irrelevant.
CREATE OR REPLACE VIEW public.v_platform_accounts_summary AS
SELECT
  a.id AS account_id,
  a.name AS account_name,
  a.is_banned,
  a.banned_at,
  a.banned_reason,
  a.created_at AS account_created_at,
  p_owner.user_id AS owner_user_id,
  p_owner.full_name AS owner_name,
  p_owner.email AS owner_email,
  p_owner.avatar_url AS owner_avatar_url,
  (SELECT count(*) FROM profiles p2 WHERE p2.account_id = a.id) AS member_count,
  (SELECT count(*) FROM contacts c WHERE c.account_id = a.id) AS contact_count,
  (SELECT count(*) FROM conversations cv WHERE cv.account_id = a.id) AS conversation_count,
  (
    SELECT count(*)
    FROM messages m
      JOIN conversations cv2 ON cv2.id = m.conversation_id
    WHERE cv2.account_id = a.id
      AND m.created_at > (now() - '30 days'::interval)
  ) AS messages_30d,
  (
    SELECT wc.status
    FROM whatsapp_config wc
    WHERE wc.account_id = a.id
    LIMIT 1
  ) AS whatsapp_status,
  (
    SELECT max(m2.created_at)
    FROM messages m2
      JOIN conversations cv3 ON cv3.id = m2.conversation_id
    WHERE cv3.account_id = a.id
  ) AS last_activity_at,
  p_owner.phone AS owner_phone
FROM accounts a
  JOIN profiles p_owner ON p_owner.user_id = a.owner_user_id;

-- ---- 6. Super-admin account deep dive ----
-- The whole body is re-declared because CREATE OR REPLACE FUNCTION has
-- no partial form. Two changes versus the previous version:
--   * 'phone' added to each member object.
--   * `SET search_path TO 'public'` restored. Migration 082 pinned it
--     for the security advisor, but 20260918140000 re-declared the
--     function without the clause and silently un-pinned it. An
--     unpinned SECURITY DEFINER function is search-path injectable, so
--     it goes back here.
CREATE OR REPLACE FUNCTION public.fn_account_deep_dive(target_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'account', (SELECT row_to_json(a.*) FROM accounts a WHERE a.id = target_account_id),
    'members', (
      SELECT json_agg(json_build_object(
        'user_id', p.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'avatar_url', p.avatar_url,
        'account_role', p.account_role,
        'permissions', p.permissions,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'last_seen_at', (SELECT mp.last_seen_at FROM member_presence mp WHERE mp.user_id = p.user_id),
        'is_online', (SELECT mp.last_seen_at > NOW() - INTERVAL '5 minutes' FROM member_presence mp WHERE mp.user_id = p.user_id)
      ))
      FROM profiles p WHERE p.account_id = target_account_id
    ),
    'stats', json_build_object(
      'contact_count', (SELECT COUNT(*) FROM contacts WHERE account_id = target_account_id),
      'conversation_count', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id),
      'active_conversations', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id AND status = 'open'),
      'messages_total', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id),
      'messages_30d', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id AND m.created_at > NOW() - INTERVAL '30 days'),
      'active_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id AND is_active = TRUE),
      'total_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id),
      'broadcasts_sent', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id AND status = 'sent'),
      'broadcasts_total', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id),
      'templates_total', (SELECT COUNT(*) FROM message_templates WHERE account_id = target_account_id),
      'templates_approved', (SELECT COUNT(*) FROM message_templates WHERE account_id = target_account_id AND UPPER(status) = 'APPROVED'),
      'deals_open_value', (SELECT COALESCE(SUM(value), 0) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open'),
      'deals_open_count', (SELECT COUNT(*) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open')
    ),
    'whatsapp_config', (
      SELECT json_build_object(
        'id', wc.id,
        'account_id', wc.account_id,
        'user_id', wc.user_id,
        'phone_number_id', wc.phone_number_id,
        'display_phone_number', wc.display_phone_number,
        'verified_name', wc.verified_name,
        'waba_id', wc.waba_id,
        'status', wc.status,
        'connected_at', wc.connected_at,
        'registered_at', wc.registered_at,
        'subscribed_apps_at', wc.subscribed_apps_at,
        'last_registration_error', wc.last_registration_error,
        'connection_source', wc.connection_source,
        'connection_mode', wc.connection_mode,
        'coexistence_detected_at', wc.coexistence_detected_at,
        'disconnect_event', wc.disconnect_event,
        'disconnect_reason', wc.disconnect_reason,
        'disconnected_at', wc.disconnected_at,
        'token_expires_at', wc.token_expires_at,
        'insights_enabled_at', wc.insights_enabled_at,
        'has_two_step_pin', (wc.two_step_pin IS NOT NULL)
      )
      FROM whatsapp_config wc WHERE wc.account_id = target_account_id
      LIMIT 1
    )
  ) INTO result;
  RETURN result;
END;
$$;
