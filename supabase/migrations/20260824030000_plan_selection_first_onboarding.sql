-- ============================================================
-- Plan-selection-first onboarding.
--
-- ─── What changes for a new signup ────────────────────────────
--
-- Today a new account lands on /dashboard with a silent 14-day trial and
-- only meets the pricing page when the trial lapses. From now on a new
-- account lands on /upgrade-plan first, picks a term, and chooses either
-- "pay now" or "start with trial". The choice is REMEMBERED, so when the
-- trial ends they go straight to that term's payment screen instead of
-- back to a generic pricing grid.
--
-- ─── The missing concept this adds ────────────────────────────
--
-- There was no way to record "the plan the customer intends to buy".
-- `accounts.subscription_plan_id` is written only on activation, i.e. the
-- plan they HAVE. Between picking a term and submitting a UTR the choice
-- existed solely in the URL query string, which is why trial expiry could
-- only ever dump someone on the generic chooser.
--
-- ─── Why existing accounts are untouched ──────────────────────
--
-- `plan_selection_required` defaults TRUE for new rows but is backfilled
-- to FALSE for every account that already exists. That is the whole
-- mechanism behind "applies to new users from now": a customer who is
-- mid-trial today must not be bounced to a pricing page on their next
-- page load, and a paying customer certainly must not.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The chosen-but-unpaid plan.
--
-- Separate columns from `subscription_plan_id` on purpose. Those describe
-- what the account HAS; these describe what it WANTS. Collapsing the two
-- would make an unpaid intention indistinguishable from paid coverage,
-- and every gate in the app reads the latter.
--
-- ON DELETE SET NULL on both: an admin deleting a plan or a cycle must
-- not delete customer accounts. The UI treats a dangling selection as
-- "no selection" and asks again, which is the correct outcome — the term
-- they picked genuinely no longer exists.
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS selected_plan_id UUID
    REFERENCES subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_cycle_id UUID
    REFERENCES billing_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_selection_required BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN accounts.selected_plan_id IS
  'The plan the customer chose but has not paid for. Distinct from subscription_plan_id, which is what they actually hold. Drives the trial-end redirect straight to this plan''s payment screen and the "upcoming plan" card in Billing.';
COMMENT ON COLUMN accounts.selected_cycle_id IS
  'Billing cycle chosen alongside selected_plan_id. Both are needed to price a payment, so a selection with only one of them set is treated as no selection.';
COMMENT ON COLUMN accounts.plan_selected_at IS
  'When the customer made the choice. Null means never chosen.';
COMMENT ON COLUMN accounts.plan_selection_required IS
  'TRUE means this account has not yet been through plan selection and should be sent to /upgrade-plan before the CRM. Backfilled FALSE for every account existing before this migration, which is what confines the new onboarding to new signups.';

-- ------------------------------------------------------------
-- 2. Grandfather every existing account.
--
-- Written as an explicit UPDATE rather than relying on a DEFAULT FALSE
-- and flipping new rows, because the DEFAULT has to be TRUE for the
-- trigger-free path (a plain INSERT from any of the several places
-- accounts get created) to opt IN automatically. So: default TRUE, then
-- immediately exempt everyone who is already here.
--
-- Runs before the trigger below is installed, so it cannot race with it.
-- ------------------------------------------------------------
DO $$
DECLARE
  grandfathered integer;
BEGIN
  UPDATE accounts
     SET plan_selection_required = FALSE
   WHERE plan_selection_required IS TRUE;

  GET DIAGNOSTICS grandfathered = ROW_COUNT;
  RAISE NOTICE 'plan selection: % existing account(s) grandfathered (will NOT be asked to choose)', grandfathered;
END
$$;

-- ------------------------------------------------------------
-- 3. Do not ask an account that was created already paid.
--
-- Extends the existing trial trigger rather than adding a second one, so
-- there is one place that decides what a newly inserted account starts
-- life as.
--
-- The early-return branch is the tell: a caller who supplied
-- `trial_ends_at` themselves is provisioning deliberately (super-admin
-- tooling creating a pre-paid or internal account), and sending that
-- customer to a pricing page would be wrong. Same for anything inserted
-- with a subscription window or a plan already attached.
--
-- Body is otherwise identical to migration 050's version.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_set_trial_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- An account that arrives already provisioned never needs to choose.
  IF NEW.subscription_ends_at IS NOT NULL
     OR NEW.subscription_plan_id IS NOT NULL
     OR NEW.subscription_status = 'none' THEN
    NEW.plan_selection_required := FALSE;
  END IF;

  -- Respect an explicit window when the caller already supplied one
  -- (super-admin tooling creating a pre-paid account).
  IF NEW.trial_ends_at IS NOT NULL THEN
    NEW.plan_selection_required := FALSE;
    RETURN NEW;
  END IF;

  SELECT trial_days INTO v_trial_days FROM subscription_settings LIMIT 1;
  v_trial_days := COALESCE(v_trial_days, 14);

  NEW.trial_started_at := COALESCE(NEW.trial_started_at, NOW());
  NEW.trial_ends_at := NEW.trial_started_at + (v_trial_days || ' days')::INTERVAL;

  -- Only claim 'trialing' when the caller did not ask for something
  -- else (e.g. an operator inserting an 'none' account directly).
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'trialing' THEN
    NEW.subscription_status := 'trialing';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.accounts_set_trial_defaults() OWNER TO postgres;

DROP TRIGGER IF EXISTS accounts_set_trial_defaults ON accounts;
CREATE TRIGGER accounts_set_trial_defaults
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_set_trial_defaults();

-- ------------------------------------------------------------
-- 4. Admin-editable copy for the new UI.
--
-- Columns on the settings singleton, matching how every other string on
-- /upgrade-plan is stored. Not per-plan columns: the page sells exactly
-- one plan and the cards are billing CYCLES, so per-plan text would have
-- no card to attach to — and the two badges say the same thing on every
-- card by design.
--
-- `trial_badge_template` takes `{days}` and is filled from
-- `trial_days` at render time, deliberately. A hardcoded
-- "14 days free trial" becomes a lie the moment an operator changes the
-- trial length in the panel two tabs away, and it would be a lie in the
-- most expensive possible place — the buy button.
-- ------------------------------------------------------------
ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS show_trial_badges BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS trial_badge_template TEXT
    NOT NULL DEFAULT '{days} days free trial',
  ADD COLUMN IF NOT EXISTS no_card_label TEXT
    NOT NULL DEFAULT 'No card or payment required',
  ADD COLUMN IF NOT EXISTS trial_cta_label TEXT
    NOT NULL DEFAULT 'Start with trial',
  ADD COLUMN IF NOT EXISTS trial_cta_note TEXT,
  ADD COLUMN IF NOT EXISTS upcoming_plan_label TEXT
    NOT NULL DEFAULT 'Upcoming plan',
  ADD COLUMN IF NOT EXISTS upcoming_unpaid_label TEXT
    NOT NULL DEFAULT 'Not paid',
  ADD COLUMN IF NOT EXISTS pay_now_label TEXT
    NOT NULL DEFAULT 'Pay now',
  ADD COLUMN IF NOT EXISTS change_plan_label TEXT
    NOT NULL DEFAULT 'Change plan';

COMMENT ON COLUMN subscription_settings.show_trial_badges IS
  'Master switch for the "free trial" / "no card required" badges on the plan cards and the "Start with trial" button. FALSE turns the whole trial-first flow off in the UI without touching trial_days.';
COMMENT ON COLUMN subscription_settings.trial_badge_template IS
  'Badge on every plan card. Supports {days}, filled from trial_days at render time so it can never contradict the actual trial length.';
COMMENT ON COLUMN subscription_settings.no_card_label IS
  'Second badge on every plan card — the reassurance that selecting a plan does not charge anything.';
COMMENT ON COLUMN subscription_settings.trial_cta_label IS
  'The secondary button beside "Continue to payment": takes the chosen plan, records it, and starts the free trial instead of paying now.';
COMMENT ON COLUMN subscription_settings.trial_cta_note IS
  'Optional small print under the two buttons, e.g. what happens when the trial ends.';
COMMENT ON COLUMN subscription_settings.upcoming_plan_label IS
  'Heading of the unpaid-plan card in Settings -> Billing.';
COMMENT ON COLUMN subscription_settings.upcoming_unpaid_label IS
  'Status pill on the unpaid-plan card.';

-- Give the seeded row a note explaining the trial to the customer,
-- without overwriting an operator who has already written their own.
UPDATE subscription_settings
   SET trial_cta_note = 'Start free today. When your trial ends you will be asked to pay for the plan you picked — you can change it any time before then.'
 WHERE trial_cta_note IS NULL;
