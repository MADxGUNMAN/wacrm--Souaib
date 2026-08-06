-- ============================================================
-- 050_subscriptions_and_payments.sql
--
-- Subscription lifecycle + manual UPI payment verification.
--
-- What this adds
--   1. `subscription_settings`    — singleton: trial length, UPI payee
--      details, currency, and every piece of copy on /upgrade-plan.
--   2. `billing_cycles`           — the duration toggle (Monthly /
--      Quarterly / Yearly / anything the admin invents).
--   3. `subscription_plans`       — plan cards (name, tagline,
--      features, highlight badge, visibility, order).
--   4. `subscription_plan_prices` — price per (plan x cycle). This is
--      the ONLY source of truth for the amount encoded into a UPI QR,
--      so editing a price here changes what the QR asks for.
--   5. `payment_requests`         — one row per submitted UPI payment,
--      awaiting manual super-admin verification.
--   6. `subscription_events`      — append-only audit trail of every
--      status transition (who, when, why).
--   7. Subscription columns on `accounts` + a BEFORE INSERT trigger
--      that stamps the free trial window on every new account.
--
-- Tenancy / security posture
--   - The four catalogue tables are RLS-enabled with NO client
--     policies. Everything reads them through server routes using the
--     service role, so a client can never see a hidden plan, and can
--     never learn a price except via the server-computed quote. That
--     is what makes `expected_amount` trustworthy.
--   - `payment_requests` is readable by members of the owning account
--     (so a user can watch their own submission move to approved) but
--     NOT insertable/updatable from the client — the API route writes
--     it with a server-recomputed `expected_amount`.
--   - `subscription_events` is service-role only.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. SUBSCRIPTION SETTINGS (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Master switch. FALSE disables every gate: no trial banner, no
  -- redirect to /upgrade-plan. Lets an operator run the CRM without
  -- billing, or drop enforcement during an incident.
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Free trial length applied to every NEW account by the trigger at
  -- the bottom of this file. Changing it affects future signups only.
  trial_days INTEGER NOT NULL DEFAULT 14 CHECK (trial_days >= 0),

  -- Extra days of access AFTER trial_ends_at / subscription_ends_at
  -- before the account is actually blocked. 0 = block immediately.
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),

  -- ---- UPI payee (drives the QR payload) ----
  upi_id TEXT,
  upi_payee_name TEXT,
  -- ISO-4217. UPI itself only settles INR, but the column keeps the
  -- display formatting honest if an operator localises the catalogue.
  currency TEXT NOT NULL DEFAULT 'INR',

  -- ---- /upgrade-plan copy (all dynamic) ----
  page_heading TEXT NOT NULL DEFAULT 'Choose Your Replai Plan',
  page_subheading TEXT,
  cycle_hint TEXT,
  selected_plan_label TEXT NOT NULL DEFAULT 'Selected Plan',
  total_label TEXT NOT NULL DEFAULT 'Total',
  save_label TEXT NOT NULL DEFAULT 'Save',
  continue_label TEXT NOT NULL DEFAULT 'Continue to Payment',
  equals_label TEXT NOT NULL DEFAULT 'Equals',

  -- ---- payment / QR screen copy ----
  payment_heading TEXT NOT NULL DEFAULT 'Complete your payment',
  payment_instructions TEXT,
  submit_button_label TEXT NOT NULL DEFAULT 'I have paid - submit details',
  pending_review_message TEXT,
  support_note TEXT,

  -- ---- trial / expiry copy ----
  -- `{days}` is substituted client-side. Kept as a template rather
  -- than a hardcoded string so the wording is admin-editable.
  trial_banner_template TEXT NOT NULL DEFAULT '{days} days left in your free trial',
  trial_banner_cta TEXT NOT NULL DEFAULT 'Upgrade',
  expired_heading TEXT,
  free_plan_label TEXT NOT NULL DEFAULT 'Free Plan',
  free_plan_subtitle TEXT NOT NULL DEFAULT 'You are on a free trial',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce the singleton. A partial unique index on a constant is the
-- standard trick: at most one row can satisfy it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_settings_singleton
  ON subscription_settings ((TRUE));

ALTER TABLE subscription_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscription_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. BILLING CYCLES — the duration toggle
--
-- `months` drives calendar-accurate expiry (1 month from Jan 31 is
-- Feb 28, not "+30 days"). `duration_days` is an optional override
-- for cycles that are not whole months (a 14-day starter, say). When
-- both are set, days wins.
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  -- Suffix rendered after the price, e.g. '/quarter'.
  unit_label TEXT,
  months INTEGER NOT NULL DEFAULT 1 CHECK (months >= 0),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
  -- Free-form pill next to the label on the toggle, e.g. '10%'.
  discount_label TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A cycle must resolve to a non-zero duration, otherwise approving
  -- a payment against it would grant an already-expired subscription.
  CONSTRAINT billing_cycles_has_duration
    CHECK (duration_days IS NOT NULL OR months > 0)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_position
  ON billing_cycles(position);

ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON billing_cycles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON billing_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. SUBSCRIPTION PLANS — the cards on /upgrade-plan
--
-- `features` is a JSONB array. Two accepted shapes, both handled by
-- the reader in src/lib/subscription/plans.ts:
--   ["Bulk broadcast", "Campaign scheduler"]
--   [{"label": "All Growth Features +", "emphasis": true}, ...]
-- `emphasis` renders the "All <lower tier> Features +" lead-in bold.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]',
  features_heading TEXT,
  is_highlighted BOOLEAN NOT NULL DEFAULT FALSE,
  highlight_label TEXT DEFAULT 'Most popular',
  cta_text TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_position
  ON subscription_plans(position);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscription_plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. PLAN PRICES — one amount per (plan x cycle)
--
-- The amount the UPI QR encodes comes from here and nowhere else.
-- `compare_at_amount` is an optional strike-through / "Save X"
-- override; when NULL the app derives the saving from the plan's
-- 1-month price x the cycle's month count.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plan_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  compare_at_amount NUMERIC(12, 2) CHECK (compare_at_amount IS NULL OR compare_at_amount >= 0),
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_plan_prices_unique UNIQUE (plan_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON subscription_plan_prices(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_cycle ON subscription_plan_prices(cycle_id);

ALTER TABLE subscription_plan_prices ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscription_plan_prices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_plan_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. ACCOUNT SUBSCRIPTION STATE
--
-- Denormalised onto `accounts` because the gate runs in middleware on
-- every CRM request — middleware already fetches this row for the ban
-- check, so folding these columns in costs zero extra round trips.
--
--   trialing — inside the free trial window
--   active   — a super admin approved a payment / granted access
--   expired  — trial or subscription ended; CRM is blocked
--   none     — billing not applicable. Never set by the app; an
--              escape hatch for operators who want a permanently
--              open account (internal, demo, grandfathered).
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_plan_name TEXT,
  ADD COLUMN IF NOT EXISTS subscription_cycle_label TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_subscription_status_check'
      AND conrelid = 'accounts'::regclass
  ) THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_subscription_status_check
      CHECK (subscription_status IN ('trialing', 'active', 'expired', 'none'));
  END IF;
END $$;

-- Hot paths for the super-admin subscriber / "expiring soon" lists.
CREATE INDEX IF NOT EXISTS idx_accounts_subscription_status
  ON accounts(subscription_status);
CREATE INDEX IF NOT EXISTS idx_accounts_subscription_ends_at
  ON accounts(subscription_ends_at)
  WHERE subscription_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_trial_ends_at
  ON accounts(trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

-- ============================================================
-- 6. PAYMENT REQUESTS
--
-- Every plan/cycle reference is duplicated as a *_snapshot column.
-- Prices and plans change; a payment record must keep saying what was
-- actually bought even after the admin renames the plan or deletes
-- the tier. The FKs are ON DELETE SET NULL for the same reason —
-- losing the link must not lose the receipt.
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Who submitted the form (the account owner, normally).
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  cycle_id UUID REFERENCES billing_cycles(id) ON DELETE SET NULL,
  plan_name_snapshot TEXT NOT NULL,
  cycle_label_snapshot TEXT NOT NULL,
  -- Duration the admin will grant on approval, snapshotted at submit
  -- time from the cycle. Months for calendar accuracy; days when the
  -- cycle used a day override.
  cycle_months INTEGER,
  cycle_duration_days INTEGER,

  -- Server-computed from subscription_plan_prices. Never client input.
  expected_amount NUMERIC(12, 2) NOT NULL CHECK (expected_amount >= 0),
  -- What the user says they actually transferred. Deliberately stored
  -- separately from expected_amount so the admin can spot a mismatch.
  paid_amount NUMERIC(12, 2) NOT NULL CHECK (paid_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',

  -- ---- payer-supplied verification details ----
  transaction_ref TEXT NOT NULL,        -- UTR / UPI transaction id
  payer_name TEXT NOT NULL,             -- account holder name
  payer_mobile TEXT NOT NULL,
  payer_upi_id TEXT,
  payer_bank TEXT,
  paid_at TIMESTAMPTZ,                  -- when the payer says they paid
  payment_method TEXT NOT NULL DEFAULT 'upi',
  reference_note TEXT,                  -- the tn/tr we encoded in the QR
  payer_note TEXT,                      -- free-text message to the admin
  screenshot_url TEXT,

  -- ---- review ----
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  -- Window actually granted on approval. May differ from the cycle
  -- when the admin overrides the duration.
  activated_from TIMESTAMPTZ,
  activated_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_account
  ON payment_requests(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status
  ON payment_requests(status, created_at DESC);

-- One live claim per UTR. A rejected row releases the reference (the
-- payer may have fat-fingered it), but a pending/approved one locks
-- it so the same transaction cannot be replayed for a second account.
-- Case/whitespace-insensitive because UTRs get copy-pasted out of
-- banking apps in mixed case with stray spaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_txn_ref_live
  ON payment_requests (LOWER(TRIM(transaction_ref)))
  WHERE status <> 'rejected';

-- At most one pending submission per account — stops a user queueing
-- ten requests while the first is still under review.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_one_pending
  ON payment_requests (account_id)
  WHERE status = 'pending';

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON payment_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Members read their own account's submissions so the payment screen
-- can show "under review". No client INSERT/UPDATE/DELETE policy:
-- writes go exclusively through the API route, which recomputes
-- expected_amount server-side and owns every status transition.
DROP POLICY IF EXISTS payment_requests_select ON payment_requests;
CREATE POLICY payment_requests_select ON payment_requests FOR SELECT
  USING (is_account_member(account_id));

-- ============================================================
-- 7. SUBSCRIPTION EVENTS — append-only audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  ends_at TIMESTAMPTZ,
  plan_name TEXT,
  cycle_label TEXT,
  amount NUMERIC(12, 2),
  payment_request_id UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_events_type_check CHECK (event_type IN (
    'trial_started', 'trial_extended', 'payment_submitted',
    'payment_approved', 'payment_rejected', 'subscription_activated',
    'subscription_extended', 'subscription_revoked', 'subscription_expired'
  ))
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_account
  ON subscription_events(account_id, created_at DESC);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
-- Service-role only: no policies. The audit trail is an operator tool.

-- ============================================================
-- 8. TRIAL BOOTSTRAP TRIGGER
--
-- Deliberately a trigger on `accounts` rather than an edit to
-- `handle_new_user`. Accounts are created from more than one place
-- (the signup trigger, the member-removal path added in 017, and any
-- future admin tooling) and all of them must start a trial. Hooking
-- the table covers every caller and leaves handle_new_user free to
-- change independently.
--
-- Reads trial_days from settings at insert time, so changing the
-- trial length in the super admin panel applies to the next signup
-- with no redeploy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accounts_set_trial_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- Respect an explicit window when the caller already supplied one
  -- (super-admin tooling creating a pre-paid account).
  IF NEW.trial_ends_at IS NOT NULL THEN
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

-- ============================================================
-- 9. SEED — settings singleton + default catalogue
--
-- Every INSERT is guarded so re-running the migration never clobbers
-- an operator's edited prices or copy. The seeded plans/cycles mirror
-- the designed pricing page; all of it is editable from the super
-- admin panel.
--
-- NOTE: `upi_id` is intentionally left NULL. The payment screen
-- refuses to render a QR until an operator sets a real UPI ID, rather
-- than silently generating a QR that pays nobody.
-- ============================================================
INSERT INTO subscription_settings (
  upi_payee_name, page_subheading, cycle_hint, payment_instructions,
  pending_review_message, support_note, expired_heading
)
SELECT
  'Replai',
  'Pick the plan that fits your team. Change or cancel whenever you need to.',
  'Longer cycles cost less per month.',
  'Scan the QR with any UPI app and pay the exact amount shown. Then submit your transaction details below so we can verify the payment and activate your subscription.',
  'Your payment is under review. We verify manually and usually activate within a few hours.',
  'Payment sent but not activated yet? Email support@junkiescoder.com with your UTR number.',
  'Your free trial has ended'
WHERE NOT EXISTS (SELECT 1 FROM subscription_settings);

-- ---- billing cycles ----
INSERT INTO billing_cycles (cycle_key, label, unit_label, months, discount_label, is_default, position)
SELECT * FROM (VALUES
  ('monthly',   'Monthly',   '/month',   1,  NULL::TEXT, FALSE, 0),
  ('quarterly', 'Quarterly', '/quarter', 3,  '10%',      TRUE,  1),
  ('yearly',    'Yearly',    '/year',    12, '20%',      FALSE, 2)
) AS seed(cycle_key, label, unit_label, months, discount_label, is_default, position)
WHERE NOT EXISTS (SELECT 1 FROM billing_cycles);

-- ---- plans ----
INSERT INTO subscription_plans (name, tagline, features, is_highlighted, highlight_label, position)
SELECT * FROM (VALUES
  (
    'Growth',
    'Send bulk campaigns. Measure results.',
    '[
      {"label": "10,000 Marketing Messages/month"},
      {"label": "WhatsApp Bulk Broadcast"},
      {"label": "Campaign Scheduler"},
      {"label": "Retargeting Campaigns"},
      {"label": "Opt-In / Opt-Out Management"},
      {"label": "URL Click Tracking"},
      {"label": "Advanced Analytics Dashboard"}
    ]'::JSONB,
    FALSE, NULL::TEXT, 0
  ),
  (
    'Pro',
    'Automate sales, support, and follow-ups.',
    '[
      {"label": "All Growth Features +", "emphasis": true},
      {"label": "50,000 Marketing Messages/month"},
      {"label": "5 Chatbot Flows"},
      {"label": "5 Agent Logins"},
      {"label": "Meta Lead Ads to WhatsApp"},
      {"label": "WhatsApp Flows / Forms"},
      {"label": "AI Auto-Reply Agents"}
    ]'::JSONB,
    TRUE, 'Most popular', 1
  ),
  (
    'Business',
    'High-volume automation with dedicated support.',
    '[
      {"label": "All Pro Features +", "emphasis": true},
      {"label": "Unlimited Marketing Messages"},
      {"label": "Unlimited Chatbot Flows"},
      {"label": "15 Agent Logins"},
      {"label": "Dedicated Onboarding by Our Team"},
      {"label": "WhatsApp Growth Strategy Sessions"},
      {"label": "Priority Support"}
    ]'::JSONB,
    FALSE, NULL::TEXT, 2
  )
) AS seed(name, tagline, features, is_highlighted, highlight_label, position)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans);

-- ---- prices (plan x cycle) ----
INSERT INTO subscription_plan_prices (plan_id, cycle_id, amount)
SELECT p.id, c.id, seed.amount
FROM (VALUES
  ('Growth',   'monthly',    1000.00),
  ('Growth',   'quarterly',  2700.00),
  ('Growth',   'yearly',     9600.00),
  ('Pro',      'monthly',    2800.00),
  ('Pro',      'quarterly',  7560.00),
  ('Pro',      'yearly',    26880.00),
  ('Business', 'monthly',    4600.00),
  ('Business', 'quarterly', 12300.00),
  ('Business', 'yearly',    44160.00)
) AS seed(plan_name, cycle_key, amount)
JOIN subscription_plans p ON p.name = seed.plan_name
JOIN billing_cycles c ON c.cycle_key = seed.cycle_key
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan_prices)
ON CONFLICT (plan_id, cycle_id) DO NOTHING;

-- ============================================================
-- 10. BACKFILL EXISTING ACCOUNTS
--
-- Applying this migration must not lock anybody out mid-session, so
-- every pre-existing account gets a FULL trial window starting now
-- rather than one measured from its (possibly ancient) created_at.
-- Operators who would rather grandfather accounts in permanently can
-- set subscription_status = 'none' on them afterwards.
-- ============================================================
UPDATE accounts a
SET trial_started_at = COALESCE(a.trial_started_at, NOW()),
    trial_ends_at = NOW() + (
      (SELECT COALESCE(trial_days, 14) FROM subscription_settings LIMIT 1) || ' days'
    )::INTERVAL,
    subscription_status = 'trialing'
WHERE a.trial_ends_at IS NULL
  AND a.subscription_ends_at IS NULL;
