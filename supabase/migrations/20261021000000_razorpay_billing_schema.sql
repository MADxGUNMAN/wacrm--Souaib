-- ============================================================
-- Razorpay Subscriptions — schema (Phase 1).
--
-- Plan: docs/razopay/razorpay-subscriptions-plan.md, section 6.
--
-- ADDITIVE ONLY. New tables, new nullable columns, widened CHECK lists.
-- Nothing here updates or deletes an existing row, so the manual UPI
-- history (`payment_requests`, `subscription_events`) and every account's
-- current trial/paid window are untouched. Idempotent: safe to re-run.
--
-- Money in the new tables is INTEGER MINOR UNITS (paise) + ISO currency,
-- matching what Razorpay sends. Existing tables keep NUMERIC(12,2).
--
-- Every row carries `mode` ('test' | 'live') because dev and production
-- share this database. A deployment only ever processes its own mode.
--
-- Security: RLS on, NO client policies, and table privileges revoked from
-- anon/authenticated. Browsers reach this data only through server routes
-- that project it. Writes go through the SECURITY DEFINER functions in the
-- next migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Razorpay plan per (catalogue plan, cycle, price, frequency, mode)
--
-- Razorpay plans are immutable: a price change means a new provider plan.
-- `is_current` marks the one new checkouts use; older rows stay so that
-- grandfathered subscriptions (D8) still resolve.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_provider_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider = 'razorpay'),
  mode             TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  plan_id          UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  cycle_id         UUID REFERENCES public.billing_cycles(id) ON DELETE SET NULL,
  plan_name        TEXT NOT NULL,
  cycle_label      TEXT NOT NULL,
  duration_days    INTEGER NOT NULL CHECK (duration_days > 0),
  amount_minor     BIGINT NOT NULL CHECK (amount_minor > 0),
  currency         CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  period           TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_interval  INTEGER NOT NULL CHECK (period_interval > 0),
  provider_plan_id TEXT NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_provider_plans_provider_key UNIQUE (mode, provider_plan_id)
);

-- One current mapping per (mode, plan, cycle). A concurrent second insert
-- loses here and re-reads the winner instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS billing_provider_plans_current_key
  ON public.billing_provider_plans (mode, plan_id, cycle_id)
  WHERE is_current AND plan_id IS NOT NULL AND cycle_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Razorpay customers seen for an account (no email/phone stored)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_customers (
  mode                 TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_customer_id TEXT NOT NULL,
  account_id           UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mode, provider_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_account
  ON public.billing_customers (account_id);

-- ------------------------------------------------------------
-- 3. Subscriptions
--
-- `initiating` is our claim taken BEFORE calling Razorpay, so a double
-- click or a second tab cannot create a second provider subscription.
-- `failed_to_create` and `superseded` are local terminal states.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  mode                     TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  env                      TEXT NOT NULL CHECK (env IN ('dev', 'prod')),
  checkout_id              UUID NOT NULL UNIQUE,
  provider_subscription_id TEXT,
  provider_plan_row        UUID REFERENCES public.billing_provider_plans(id) ON DELETE SET NULL,
  provider_plan_id         TEXT NOT NULL,
  provider_customer_id     TEXT,

  -- Catalogue snapshot at checkout. FKs set null so a deleted plan never
  -- deletes a billing record; the snapshot keeps it explainable.
  plan_id                  UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  cycle_id                 UUID REFERENCES public.billing_cycles(id) ON DELETE SET NULL,
  plan_name                TEXT NOT NULL,
  cycle_label              TEXT NOT NULL,
  duration_days            INTEGER NOT NULL CHECK (duration_days > 0),
  amount_minor             BIGINT NOT NULL CHECK (amount_minor > 0),
  currency                 CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quantity                 INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),

  status                   TEXT NOT NULL DEFAULT 'initiating',
  status_changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  intent                   TEXT NOT NULL,

  -- Schedule, as Razorpay reports it.
  start_at                 TIMESTAMPTZ,
  current_start            TIMESTAMPTZ,
  current_end              TIMESTAMPTZ,
  charge_at                TIMESTAMPTZ,
  end_at                   TIMESTAMPTZ,
  ended_at                 TIMESTAMPTZ,
  expire_by                TIMESTAMPTZ,
  total_count              INTEGER CHECK (total_count IS NULL OR total_count > 0),
  paid_count               INTEGER,
  remaining_count          INTEGER,
  auth_attempts            INTEGER,
  has_scheduled_changes    BOOLEAN,
  change_scheduled_at      TIMESTAMPTZ,

  -- Mandate summary. Never PAN/CVV/full VPA.
  payment_method           TEXT CHECK (payment_method IS NULL OR payment_method IN ('card', 'upi', 'emandate', 'nach', 'unknown')),
  method_summary           JSONB,
  short_url                TEXT,

  cancel_requested_at      TIMESTAMPTZ,
  cancel_at_cycle_end      BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_by             TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'admin', 'provider', 'system')),

  last_error               TEXT,
  anomaly                  TEXT,
  created_by_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_synced_at           TIMESTAMPTZ,
  last_event_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_subscriptions_status_check CHECK (status IN (
    'initiating', 'failed_to_create', 'created', 'authenticated', 'active',
    'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired', 'superseded'
  )),
  CONSTRAINT billing_subscriptions_intent_check CHECK (intent IN (
    'defer_to_trial_end', 'defer_to_paid_end', 'immediate'
  )),
  -- Once Razorpay has the subscription its id must be recorded.
  CONSTRAINT billing_subscriptions_provider_id_required CHECK (
    status IN ('initiating', 'failed_to_create') OR provider_subscription_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_provider_key
  ON public.billing_subscriptions (mode, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- AT MOST ONE live subscription per account and mode. This index, not
-- application code, is what stops two tabs creating two mandates. A
-- subscription already set to cancel at cycle end is excluded so the
-- customer can line up its replacement (D6) without a gap.
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_one_live
  ON public.billing_subscriptions (account_id, mode)
  WHERE status IN ('initiating', 'created', 'authenticated', 'active', 'pending', 'halted', 'paused')
    AND NOT cancel_at_cycle_end;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_account
  ON public.billing_subscriptions (account_id, created_at DESC);
-- Reconciliation: non-terminal rows whose charge time has passed.
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_due
  ON public.billing_subscriptions (mode, charge_at)
  WHERE status IN ('created', 'authenticated', 'active', 'pending', 'halted', 'paused');

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 4. Invoices
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                 TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_invoice_id  TEXT NOT NULL,
  subscription_id      UUID REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  account_id           UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status               TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'expired', 'cancelled', 'deleted')),
  amount_minor         BIGINT NOT NULL CHECK (amount_minor >= 0),
  amount_paid_minor    BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  amount_due_minor     BIGINT NOT NULL DEFAULT 0 CHECK (amount_due_minor >= 0),
  gross_amount_minor   BIGINT,
  tax_amount_minor     BIGINT,
  currency             CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_start        TIMESTAMPTZ,
  billing_end          TIMESTAMPTZ,
  issued_at            TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  expired_at           TIMESTAMPTZ,
  provider_payment_id  TEXT,
  provider_order_id    TEXT,
  short_url            TEXT,
  -- Name, amount and type per line only. No customer details.
  line_items           JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_invoices_provider_key UNIQUE (mode, provider_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_account
  ON public.billing_invoices (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription
  ON public.billing_invoices (subscription_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 5. Payments (authorisation attempts and charges)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_payments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                   TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_payment_id    TEXT NOT NULL,
  account_id             UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  subscription_id        UUID REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  invoice_id             UUID REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  provider_order_id      TEXT,
  kind                   TEXT NOT NULL DEFAULT 'unknown' CHECK (kind IN ('authorization', 'charge', 'upfront', 'unknown')),
  status                 TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'refunded', 'failed')),
  amount_minor           BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency               CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_refunded_minor  BIGINT NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),
  refund_status          TEXT CHECK (refund_status IS NULL OR refund_status IN ('partial', 'full')),
  captured               BOOLEAN NOT NULL DEFAULT FALSE,
  method                 TEXT,
  international          BOOLEAN,
  card_network           TEXT,
  card_type              TEXT,
  card_last4             CHAR(4) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_issuer            TEXT,
  vpa_masked             TEXT,
  bank                   TEXT,
  wallet                 TEXT,
  -- Razorpay's fee (incl. GST) and the GST on it, when reported.
  fee_minor              BIGINT,
  tax_minor              BIGINT,
  error_code             TEXT,
  error_description      TEXT,
  error_source           TEXT,
  error_step             TEXT,
  error_reason           TEXT,
  provider_created_at    TIMESTAMPTZ,
  captured_at            TIMESTAMPTZ,
  failed_at              TIMESTAMPTZ,
  -- Access this payment bought. Set once, by billing_apply_payment.
  paid_through_before    TIMESTAMPTZ,
  granted_from           TIMESTAMPTZ,
  granted_until          TIMESTAMPTZ,
  access_applied_at      TIMESTAMPTZ,
  anomaly                TEXT,
  settlement_id          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_payments_provider_key UNIQUE (mode, provider_payment_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_account
  ON public.billing_payments (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_subscription
  ON public.billing_payments (subscription_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_payments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 6. Refunds and disputes (recorded from webhooks; created in Dashboard)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_refund_id  TEXT NOT NULL,
  payment_id          UUID REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
  currency            CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status              TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
  speed_requested     TEXT,
  speed_processed     TEXT,
  provider_created_at TIMESTAMPTZ,
  processed_at        TIMESTAMPTZ,
  access_effect       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_refunds_provider_key UNIQUE (mode, provider_refund_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_refunds_account
  ON public.billing_refunds (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_dispute_id TEXT NOT NULL,
  payment_id          UUID REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount_minor        BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency            CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason_code         TEXT,
  phase               TEXT,
  status              TEXT NOT NULL,
  respond_by          TIMESTAMPTZ,
  provider_created_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_disputes_provider_key UNIQUE (mode, provider_dispute_id)
);

-- ------------------------------------------------------------
-- 7. Webhook event store — stored BEFORE processing
--
-- UNIQUE (mode, provider_event_id) is the idempotency claim: Razorpay
-- redelivers with the same x-razorpay-event-id, and the duplicate insert
-- is a no-op. `payload` can contain customer email/phone/VPA, so it is
-- service-role only and nulled after 90 days (Phase 3 cron).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_event_id   TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  account_id          UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  entity_ids          JSONB NOT NULL DEFAULT '{}'::JSONB,
  provider_created_at TIMESTAMPTZ,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload             JSONB,
  status              TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed', 'dead')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     TIMESTAMPTZ,
  locked_until        TIMESTAMPTZ,
  last_error          TEXT,
  anomaly             TEXT,
  processed_at        TIMESTAMPTZ,
  CONSTRAINT billing_webhook_events_provider_key UNIQUE (mode, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_due
  ON public.billing_webhook_events (status, next_attempt_at)
  WHERE status IN ('received', 'processing', 'failed');
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_received
  ON public.billing_webhook_events (received_at DESC);

-- ------------------------------------------------------------
-- 8. Email outbox
--
-- Rows are inserted INSIDE the transaction that changes billing state,
-- keyed by `dedupe_key`, so a webhook retry, the verify route and
-- reconciliation can never enqueue the same email twice.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN (
    'mandate_authenticated', 'payment_receipt', 'payment_failed', 'payment_retry_final',
    'action_required', 'autopay_cancelled', 'autopay_paused', 'subscription_completed',
    'refund_processed'
  )),
  dedupe_key          TEXT NOT NULL UNIQUE,
  recipient_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email     TEXT,
  data                JSONB NOT NULL DEFAULT '{}'::JSONB,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error          TEXT,
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_notifications_due
  ON public.billing_notifications (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_billing_notifications_account
  ON public.billing_notifications (account_id, created_at DESC);

-- ------------------------------------------------------------
-- 9. Reconciliation runs (operational visibility)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_reconciliation_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode        TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  scope       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  checked     INTEGER NOT NULL DEFAULT 0,
  changed     INTEGER NOT NULL DEFAULT 0,
  errors      JSONB NOT NULL DEFAULT '[]'::JSONB,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_runs_started
  ON public.billing_reconciliation_runs (started_at DESC);

-- ------------------------------------------------------------
-- 10. Changes to existing tables (nullable / widened only)
-- ------------------------------------------------------------

-- Extra open window for the access gate while Razorpay is collecting a
-- due charge (D2). NULL for every existing row, which leaves the gate's
-- behaviour exactly as before.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS billing_grace_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.accounts.billing_grace_ends_at IS
  'Set by billing_refresh_account_grace while a Razorpay subscription is authenticated/active/pending and its charge is due. Keeps access open until then; NULL means no autopay grace. Never written by client code.';

ALTER TABLE public.subscription_events
  ADD COLUMN IF NOT EXISTS billing_subscription_id UUID
    REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_payment_id UUID
    REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_source_check;
ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_source_check CHECK (
    source IS NULL OR source IN ('customer', 'admin', 'razorpay_webhook', 'reconciliation', 'checkout', 'system')
  );

-- Widen the event-type list. Every value from migration 050 is kept.
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_type_check;
ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_type_check CHECK (event_type IN (
    'trial_started', 'trial_extended', 'payment_submitted',
    'payment_approved', 'payment_rejected', 'subscription_activated',
    'subscription_extended', 'subscription_revoked', 'subscription_expired',
    'autopay_checkout_created', 'autopay_authenticated', 'autopay_activated',
    'payment_succeeded', 'payment_failed', 'autopay_pending', 'autopay_halted',
    'autopay_paused', 'autopay_resumed', 'autopay_cancelled', 'autopay_completed',
    'refund_processed', 'dispute_opened', 'dispute_closed', 'billing_anomaly'
  ));

CREATE INDEX IF NOT EXISTS idx_subscription_events_billing_subscription
  ON public.subscription_events (billing_subscription_id)
  WHERE billing_subscription_id IS NOT NULL;

-- ------------------------------------------------------------
-- 11. Lock the new tables down
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_provider_plans', 'billing_customers', 'billing_subscriptions',
    'billing_invoices', 'billing_payments', 'billing_refunds', 'billing_disputes',
    'billing_webhook_events', 'billing_notifications', 'billing_reconciliation_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$$;
