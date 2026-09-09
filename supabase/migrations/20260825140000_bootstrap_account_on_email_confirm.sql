-- ============================================================
-- Stop provisioning accounts (and trials) for unverified signups.
--
-- THE BUG
-- -------
-- `on_auth_user_created` fired AFTER INSERT ON auth.users, and
-- /api/auth/signup creates that row via `admin.generateLink({type:'signup'})`
-- — which inserts the user immediately, unconfirmed, so the branded
-- confirmation email can carry the action link.
--
-- The consequence: the instant someone typed an email into the signup
-- form, they got a full workspace, a profile, and a 14-day trial that
-- started counting down. If they never clicked the link — or, as happened
-- here, they mistyped the domain (`@gamil.com`) and signed up again — the
-- first attempt was left behind as a ghost workspace:
--
--   * unreachable, because you cannot sign in without confirming
--   * counted in /super-admin as a live trialing subscriber
--   * burning a trial window nobody could use
--   * and, with two near-identical addresses side by side, looking
--     exactly like a duplicate-account bug
--
-- Worth stating plainly: the same address could NEVER produce two
-- accounts. `auth.users.users_email_partial_key` is unique on email, and
-- `accounts.idx_accounts_one_per_owner` is unique on owner_user_id. The
-- two rows in that report were genuinely different mailboxes.
--
-- THE FIX
-- -------
-- Bootstrap on CONFIRMATION rather than on insert. The work moves into a
-- shared, idempotent helper called from two places:
--
--   INSERT  — only when the row arrives already confirmed. That covers
--             `admin.createUser({email_confirm:true})` (how team members
--             are added) and deployments that run with email confirmation
--             switched off. Without this branch those users would never
--             get a workspace at all.
--
--   UPDATE  — when email_confirmed_at transitions NULL -> NOT NULL, i.e.
--             the moment a self-signup clicks the link.
--
-- A pleasant side effect: because `accounts_set_trial_defaults` runs
-- BEFORE INSERT ON accounts, deferring the account row automatically
-- defers the trial. The 14 days now start when the customer actually
-- gains access, not when they first typed their address.
--
-- Existing ghost accounts are deliberately NOT touched here. Deleting
-- customer rows is not a migration's job — it needs a human looking at
-- the list first.
-- ============================================================

-- ---- The shared bootstrap ----
-- Idempotent by design. Both triggers can fire for the same user (a row
-- inserted pre-confirmed, then updated), and a duplicate call must be a
-- no-op rather than a second workspace. `profiles.user_id` is the marker
-- because it is written last, so its presence proves the pair completed.
CREATE OR REPLACE FUNCTION public.bootstrap_user_account(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT
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

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (p_user_id, COALESCE(p_full_name, ''), p_email, v_account_id, 'owner');
END;
$$;

COMMENT ON FUNCTION public.bootstrap_user_account(UUID, TEXT, TEXT) IS
  'Creates the personal workspace + owner profile for a confirmed user. Idempotent: returns immediately if a profile already exists.';

-- ---- INSERT: confirmed arrivals only ----
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
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

-- ---- UPDATE: the confirmation moment, plus the existing email sync ----
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
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
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
