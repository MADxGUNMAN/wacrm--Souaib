-- ============================================================
-- Razorpay Subscriptions — Phase 3: webhooks, email outbox, refunds,
-- disputes and reconciliation support.
--
-- Plan: docs/razopay/razorpay-subscriptions-plan.md, sections 3.7, 3.8,
-- 5, 6.2, 6.3 and 10. Builds on 20261021000000 / 20261021010000.
--
-- Additive and idempotent, like the Phase 1 migrations:
--   - new nullable columns only (no backfill, no UPDATE of existing rows)
--   - the super-admin notification type CHECK is widened, every existing
--     value kept
--   - billing_* functions are CREATE OR REPLACE; only the Razorpay code
--     paths call them, and production has no Razorpay configuration yet
--   - one AFTER INSERT trigger on subscription_events that fires only for
--     the billing event types (which only these functions write), and
--     swallows its own errors so it can never block a billing write
--
-- SECURITY DEFINER with a pinned search_path; EXECUTE revoked from
-- PUBLIC/anon/authenticated and granted to service_role only.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

-- Dev (test mode) and production share this database. Each deployment
-- delivers only the emails of its own mode and environment, so a test
-- event on dev can never be emailed by production (with production
-- links), or the reverse.
ALTER TABLE public.billing_notifications
  ADD COLUMN IF NOT EXISTS mode TEXT,
  ADD COLUMN IF NOT EXISTS env TEXT;

ALTER TABLE public.billing_notifications
  DROP CONSTRAINT IF EXISTS billing_notifications_mode_check;
ALTER TABLE public.billing_notifications
  ADD CONSTRAINT billing_notifications_mode_check
  CHECK (mode IS NULL OR mode IN ('test', 'live'));

ALTER TABLE public.billing_notifications
  DROP CONSTRAINT IF EXISTS billing_notifications_env_check;
ALTER TABLE public.billing_notifications
  ADD CONSTRAINT billing_notifications_env_check
  CHECK (env IS NULL OR env IN ('dev', 'prod'));

CREATE INDEX IF NOT EXISTS idx_billing_notifications_mode_due
  ON public.billing_notifications (mode, next_attempt_at)
  WHERE status IN ('pending', 'failed', 'sending');

-- Set when a full refund or a lost dispute takes back the time this
-- payment bought (D4). Never cleared.
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 2. Super-admin notification types (plan section 6.2)
-- ------------------------------------------------------------
ALTER TABLE public.super_admin_notifications
  DROP CONSTRAINT IF EXISTS super_admin_notifications_type_check;
ALTER TABLE public.super_admin_notifications
  ADD CONSTRAINT super_admin_notifications_type_check
  CHECK (type IN (
    'account_created',
    'account_banned',
    'payment_requested',
    'payment_verified',
    'payment_rejected',
    'contact_submitted',
    'newsletter_subscribed',
    'template_rejected',
    'subscription_expiring',
    'support_message_received',
    -- Razorpay AutoPay (Phase 3)
    'autopay_payment_failed',
    'autopay_halted',
    'billing_dispute',
    'billing_webhook_dead',
    'billing_anomaly',
    'billing_refund'
  ));

-- ------------------------------------------------------------
-- 3. Outbox insert, now tagged with mode and environment.
-- The dedupe key still makes a second call a no-op.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_enqueue_notification(
  p_mode TEXT, p_env TEXT, p_account_id UUID, p_kind TEXT, p_dedupe_key TEXT, p_data JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO billing_notifications (account_id, kind, dedupe_key, recipient_user_id, data, mode, env)
  SELECT a.id, p_kind, p_dedupe_key, a.owner_user_id, COALESCE(p_data, '{}'::JSONB), p_mode, p_env
    FROM accounts a
   WHERE a.id = p_account_id
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- ------------------------------------------------------------
-- 4. Apply functions, re-created to use the mode-aware outbox insert.
-- The bodies are otherwise identical to 20261021010000.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_subscription_snapshot(p_mode TEXT, p JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_account UUID;
  v_sub billing_subscriptions%ROWTYPE;
  v_old TEXT;
  v_new TEXT := p ->> 'status';
  v_fetched TIMESTAMPTZ := billing_ts(p, 'fetched_at');
  v_event TEXT;
  v_cycle_key TEXT;
  v_paid_through TIMESTAMPTZ;
  v_data JSONB;
BEGIN
  SELECT id, account_id INTO v_id, v_account
    FROM billing_subscriptions
   WHERE mode = p_mode AND provider_subscription_id = p ->> 'provider_subscription_id';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_subscription');
  END IF;

  PERFORM 1 FROM accounts WHERE id = v_account FOR UPDATE;
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = v_id FOR UPDATE;
  v_old := v_sub.status;

  -- Identity checks. A mismatch grants and changes nothing.
  IF NULLIF(p ->> 'notes_account_id', '') IS NOT NULL
     AND p ->> 'notes_account_id' <> v_sub.account_id::TEXT THEN
    UPDATE billing_subscriptions SET anomaly = 'account_mismatch' WHERE id = v_id;
    INSERT INTO subscription_events (account_id, event_type, note, billing_subscription_id, source)
    VALUES (v_account, 'billing_anomaly', 'Razorpay notes.account_id does not match this subscription', v_id, p_source);
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'account_mismatch');
  END IF;
  IF NULLIF(p ->> 'provider_plan_id', '') IS NOT NULL
     AND p ->> 'provider_plan_id' <> v_sub.provider_plan_id THEN
    UPDATE billing_subscriptions SET anomaly = 'plan_mismatch' WHERE id = v_id;
    INSERT INTO subscription_events (account_id, event_type, note, billing_subscription_id, source)
    VALUES (v_account, 'billing_anomaly', format('Razorpay plan %s differs from stored %s', p ->> 'provider_plan_id', v_sub.provider_plan_id), v_id, p_source);
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'plan_mismatch');
  END IF;
  IF v_new IS NULL OR v_new NOT IN ('created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired') THEN
    UPDATE billing_subscriptions SET anomaly = 'unknown_status' WHERE id = v_id;
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'unknown_status');
  END IF;

  IF v_sub.last_synced_at IS NOT NULL AND v_fetched IS NOT NULL AND v_fetched < v_sub.last_synced_at THEN
    RETURN jsonb_build_object('outcome', 'stale', 'subscription_id', v_id);
  END IF;

  -- A superseded subscription stays hidden while Razorpay agrees it is dead.
  IF v_old = 'superseded' AND v_new IN ('created', 'cancelled', 'expired') THEN
    v_new := 'superseded';
  END IF;

  UPDATE billing_subscriptions
     SET status = v_new,
         status_changed_at = CASE WHEN v_new <> v_old THEN NOW() ELSE status_changed_at END,
         provider_customer_id = COALESCE(NULLIF(p ->> 'customer_id', ''), provider_customer_id),
         payment_method = COALESCE(NULLIF(p ->> 'payment_method', ''), payment_method),
         start_at = COALESCE(billing_ts(p, 'start_at'), start_at),
         current_start = billing_ts(p, 'current_start'),
         current_end = billing_ts(p, 'current_end'),
         charge_at = billing_ts(p, 'charge_at'),
         end_at = COALESCE(billing_ts(p, 'end_at'), end_at),
         ended_at = billing_ts(p, 'ended_at'),
         expire_by = COALESCE(billing_ts(p, 'expire_by'), expire_by),
         total_count = COALESCE(NULLIF(p ->> 'total_count', '')::INTEGER, total_count),
         paid_count = NULLIF(p ->> 'paid_count', '')::INTEGER,
         remaining_count = NULLIF(p ->> 'remaining_count', '')::INTEGER,
         auth_attempts = NULLIF(p ->> 'auth_attempts', '')::INTEGER,
         has_scheduled_changes = NULLIF(p ->> 'has_scheduled_changes', '')::BOOLEAN,
         change_scheduled_at = billing_ts(p, 'change_scheduled_at'),
         short_url = COALESCE(NULLIF(p ->> 'short_url', ''), short_url),
         last_synced_at = COALESCE(v_fetched, NOW()),
         last_event_at = CASE WHEN p_source = 'razorpay_webhook' THEN NOW() ELSE last_event_at END
   WHERE id = v_id
  RETURNING * INTO v_sub;

  IF NULLIF(p ->> 'customer_id', '') IS NOT NULL THEN
    INSERT INTO billing_customers (mode, provider_customer_id, account_id)
    VALUES (p_mode, p ->> 'customer_id', v_account)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_new <> v_old THEN
    v_event := CASE
      WHEN v_new = 'authenticated' THEN 'autopay_authenticated'
      WHEN v_new = 'active' AND v_old = 'paused' THEN 'autopay_resumed'
      WHEN v_new = 'active' AND v_old IN ('created', 'authenticated') THEN 'autopay_activated'
      WHEN v_new = 'pending' THEN 'autopay_pending'
      WHEN v_new = 'halted' THEN 'autopay_halted'
      WHEN v_new = 'paused' THEN 'autopay_paused'
      WHEN v_new = 'cancelled' AND v_old NOT IN ('created', 'initiating', 'failed_to_create') THEN 'autopay_cancelled'
      WHEN v_new = 'completed' THEN 'autopay_completed'
      ELSE NULL
    END;

    IF v_event IS NOT NULL THEN
      INSERT INTO subscription_events (
        account_id, event_type, plan_name, cycle_label, amount, note,
        billing_subscription_id, source
      ) VALUES (
        v_account, v_event, v_sub.plan_name, v_sub.cycle_label,
        billing_minor_to_major(v_sub.amount_minor, v_sub.currency),
        format('Razorpay %s: %s -> %s', v_sub.provider_subscription_id, v_old, v_new),
        v_id, p_source
      );
    END IF;

    SELECT subscription_ends_at INTO v_paid_through FROM accounts WHERE id = v_account;
    v_cycle_key := COALESCE(
      extract(epoch FROM COALESCE(v_sub.current_start, v_sub.start_at, v_sub.charge_at))::BIGINT::TEXT,
      '0'
    );
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'plan_name', v_sub.plan_name,
      'cycle_label', v_sub.cycle_label,
      'amount_minor', v_sub.amount_minor,
      'currency', v_sub.currency,
      'duration_days', v_sub.duration_days,
      'first_charge_at', v_sub.start_at,
      'next_charge_at', v_sub.charge_at,
      'paid_through', v_paid_through,
      'payment_method', v_sub.payment_method,
      'method_summary', v_sub.method_summary,
      'provider_subscription_id', v_sub.provider_subscription_id
    ));

    IF v_new = 'authenticated' THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'mandate_authenticated', 'mandate:' || v_id, v_data);
    ELSIF v_new = 'pending' THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'payment_failed', 'failed:' || v_id || ':' || v_cycle_key, v_data);
    ELSIF v_new = 'halted' THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'action_required', 'halted:' || v_id || ':' || v_cycle_key, v_data);
    ELSIF v_new = 'cancelled' AND v_event IS NOT NULL THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'autopay_cancelled', 'cancelled:' || v_id, v_data);
    ELSIF v_new = 'paused' THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'autopay_paused', 'paused:' || v_id || ':' || COALESCE(v_sub.paid_count, 0), v_data);
    ELSIF v_new = 'completed' THEN
      PERFORM billing_enqueue_notification(p_mode, v_sub.env, v_account, 'subscription_completed', 'completed:' || v_id, v_data);
    END IF;
  END IF;

  PERFORM billing_refresh_account_grace(v_account, p_mode);

  RETURN jsonb_build_object(
    'outcome', 'applied', 'from', v_old, 'to', v_new,
    'subscription_id', v_id, 'account_id', v_account
  );
END;
$$;

-- ------------------------------------------------------------
-- Apply a payment (and its invoice, when there is one).
--
-- Upserts both rows, then grants access ONCE if every check passes.
-- Outcomes: granted | recorded | awaiting_invoice | anomaly |
--           unknown_subscription
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_payment(p_mode TEXT, p_payment JSONB, p_invoice JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid TEXT := p_payment ->> 'provider_payment_id';
  v_spid TEXT := COALESCE(NULLIF(p_payment ->> 'provider_subscription_id', ''), p_invoice ->> 'provider_subscription_id');
  v_sub_id UUID;
  v_account UUID;
  v_sub billing_subscriptions%ROWTYPE;
  v_acc accounts%ROWTYPE;
  v_inv_id UUID;
  v_inv_status TEXT;
  v_inv_start TIMESTAMPTZ;
  v_inv_end TIMESTAMPTZ;
  v_inv_short_url TEXT;
  v_prev_status TEXT;
  v_pay billing_payments%ROWTYPE;
  v_kind TEXT := CASE WHEN p_invoice IS NULL OR p_invoice = 'null'::JSONB THEN 'authorization' ELSE 'charge' END;
  v_from TIMESTAMPTZ;
  v_until TIMESTAMPTZ;
  v_before TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
  v_status TEXT;
  v_anomaly TEXT;
BEGIN
  IF v_pid IS NULL OR v_spid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'missing_ids');
  END IF;

  SELECT id, account_id INTO v_sub_id, v_account
    FROM billing_subscriptions
   WHERE mode = p_mode AND provider_subscription_id = v_spid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_subscription');
  END IF;

  SELECT * INTO v_acc FROM accounts WHERE id = v_account FOR UPDATE;
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = v_sub_id FOR UPDATE;

  -- ---- Invoice ----
  IF v_kind = 'charge' THEN
    IF p_invoice ->> 'provider_subscription_id' IS DISTINCT FROM v_spid THEN
      v_anomaly := 'invoice_subscription_mismatch';
    ELSE
      INSERT INTO billing_invoices (
        mode, provider_invoice_id, subscription_id, account_id, status,
        amount_minor, amount_paid_minor, amount_due_minor, gross_amount_minor,
        tax_amount_minor, currency, billing_start, billing_end, issued_at,
        paid_at, expired_at, provider_payment_id, provider_order_id, short_url, line_items
      ) VALUES (
        p_mode, p_invoice ->> 'provider_invoice_id', v_sub_id, v_account, p_invoice ->> 'status',
        (p_invoice ->> 'amount_minor')::BIGINT, COALESCE((p_invoice ->> 'amount_paid_minor')::BIGINT, 0),
        COALESCE((p_invoice ->> 'amount_due_minor')::BIGINT, 0), NULLIF(p_invoice ->> 'gross_amount_minor', '')::BIGINT,
        NULLIF(p_invoice ->> 'tax_amount_minor', '')::BIGINT, p_invoice ->> 'currency',
        billing_ts(p_invoice, 'billing_start'), billing_ts(p_invoice, 'billing_end'),
        billing_ts(p_invoice, 'issued_at'), billing_ts(p_invoice, 'paid_at'), billing_ts(p_invoice, 'expired_at'),
        NULLIF(p_invoice ->> 'provider_payment_id', ''), NULLIF(p_invoice ->> 'provider_order_id', ''),
        NULLIF(p_invoice ->> 'short_url', ''), COALESCE(p_invoice -> 'line_items', '[]'::JSONB)
      )
      ON CONFLICT (mode, provider_invoice_id) DO UPDATE SET
        status = CASE WHEN billing_invoices.status = 'paid' THEN 'paid' ELSE EXCLUDED.status END,
        amount_paid_minor = GREATEST(billing_invoices.amount_paid_minor, EXCLUDED.amount_paid_minor),
        amount_due_minor = CASE WHEN billing_invoices.status = 'paid' THEN billing_invoices.amount_due_minor ELSE EXCLUDED.amount_due_minor END,
        gross_amount_minor = COALESCE(EXCLUDED.gross_amount_minor, billing_invoices.gross_amount_minor),
        tax_amount_minor = COALESCE(EXCLUDED.tax_amount_minor, billing_invoices.tax_amount_minor),
        billing_start = COALESCE(EXCLUDED.billing_start, billing_invoices.billing_start),
        billing_end = COALESCE(EXCLUDED.billing_end, billing_invoices.billing_end),
        paid_at = COALESCE(billing_invoices.paid_at, EXCLUDED.paid_at),
        expired_at = COALESCE(EXCLUDED.expired_at, billing_invoices.expired_at),
        provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, billing_invoices.provider_payment_id),
        provider_order_id = COALESCE(EXCLUDED.provider_order_id, billing_invoices.provider_order_id),
        short_url = COALESCE(EXCLUDED.short_url, billing_invoices.short_url),
        line_items = CASE WHEN EXCLUDED.line_items = '[]'::JSONB THEN billing_invoices.line_items ELSE EXCLUDED.line_items END
      RETURNING id, status, billing_start, billing_end, short_url
        INTO v_inv_id, v_inv_status, v_inv_start, v_inv_end, v_inv_short_url;
    END IF;
  END IF;

  -- ---- Payment (forward-only status) ----
  SELECT status INTO v_prev_status
    FROM billing_payments WHERE mode = p_mode AND provider_payment_id = v_pid;

  INSERT INTO billing_payments (
    mode, provider_payment_id, account_id, subscription_id, invoice_id, provider_order_id,
    kind, status, amount_minor, currency, amount_refunded_minor, refund_status, captured,
    method, international, card_network, card_type, card_last4, card_issuer, vpa_masked,
    bank, wallet, fee_minor, tax_minor, error_code, error_description, error_source,
    error_step, error_reason, provider_created_at, captured_at, failed_at
  ) VALUES (
    p_mode, v_pid, v_account, v_sub_id, v_inv_id, NULLIF(p_payment ->> 'provider_order_id', ''),
    v_kind, p_payment ->> 'status', (p_payment ->> 'amount_minor')::BIGINT, p_payment ->> 'currency',
    COALESCE((p_payment ->> 'amount_refunded_minor')::BIGINT, 0), NULLIF(p_payment ->> 'refund_status', ''),
    COALESCE((p_payment ->> 'captured')::BOOLEAN, FALSE),
    NULLIF(p_payment ->> 'method', ''), NULLIF(p_payment ->> 'international', '')::BOOLEAN,
    NULLIF(p_payment ->> 'card_network', ''), NULLIF(p_payment ->> 'card_type', ''),
    NULLIF(p_payment ->> 'card_last4', ''), NULLIF(p_payment ->> 'card_issuer', ''),
    NULLIF(p_payment ->> 'vpa_masked', ''), NULLIF(p_payment ->> 'bank', ''), NULLIF(p_payment ->> 'wallet', ''),
    NULLIF(p_payment ->> 'fee_minor', '')::BIGINT, NULLIF(p_payment ->> 'tax_minor', '')::BIGINT,
    NULLIF(p_payment ->> 'error_code', ''), NULLIF(p_payment ->> 'error_description', ''),
    NULLIF(p_payment ->> 'error_source', ''), NULLIF(p_payment ->> 'error_step', ''),
    NULLIF(p_payment ->> 'error_reason', ''), billing_ts(p_payment, 'provider_created_at'),
    billing_ts(p_payment, 'captured_at'), billing_ts(p_payment, 'failed_at')
  )
  ON CONFLICT (mode, provider_payment_id) DO UPDATE SET
    status = CASE WHEN billing_payment_rank(EXCLUDED.status) >= billing_payment_rank(billing_payments.status)
                  THEN EXCLUDED.status ELSE billing_payments.status END,
    captured = billing_payments.captured OR EXCLUDED.captured,
    amount_refunded_minor = GREATEST(billing_payments.amount_refunded_minor, EXCLUDED.amount_refunded_minor),
    refund_status = COALESCE(EXCLUDED.refund_status, billing_payments.refund_status),
    invoice_id = COALESCE(EXCLUDED.invoice_id, billing_payments.invoice_id),
    subscription_id = COALESCE(billing_payments.subscription_id, EXCLUDED.subscription_id),
    kind = CASE WHEN billing_payments.kind IN ('unknown', 'authorization') AND EXCLUDED.kind = 'charge'
                THEN 'charge' ELSE billing_payments.kind END,
    method = COALESCE(EXCLUDED.method, billing_payments.method),
    card_network = COALESCE(EXCLUDED.card_network, billing_payments.card_network),
    card_type = COALESCE(EXCLUDED.card_type, billing_payments.card_type),
    card_last4 = COALESCE(EXCLUDED.card_last4, billing_payments.card_last4),
    card_issuer = COALESCE(EXCLUDED.card_issuer, billing_payments.card_issuer),
    vpa_masked = COALESCE(EXCLUDED.vpa_masked, billing_payments.vpa_masked),
    fee_minor = COALESCE(EXCLUDED.fee_minor, billing_payments.fee_minor),
    tax_minor = COALESCE(EXCLUDED.tax_minor, billing_payments.tax_minor),
    error_code = COALESCE(EXCLUDED.error_code, billing_payments.error_code),
    error_description = COALESCE(EXCLUDED.error_description, billing_payments.error_description),
    error_source = COALESCE(EXCLUDED.error_source, billing_payments.error_source),
    error_step = COALESCE(EXCLUDED.error_step, billing_payments.error_step),
    error_reason = COALESCE(EXCLUDED.error_reason, billing_payments.error_reason),
    captured_at = COALESCE(billing_payments.captured_at, EXCLUDED.captured_at),
    failed_at = COALESCE(billing_payments.failed_at, EXCLUDED.failed_at)
  RETURNING * INTO v_pay;

  -- A failure is audited once, the first time we see it.
  IF v_pay.status = 'failed' AND v_prev_status IS DISTINCT FROM 'failed' THEN
    INSERT INTO subscription_events (
      account_id, event_type, plan_name, cycle_label, amount, note,
      billing_subscription_id, billing_payment_id, source
    ) VALUES (
      v_account, 'payment_failed', v_sub.plan_name, v_sub.cycle_label,
      billing_minor_to_major(v_pay.amount_minor, v_pay.currency),
      left(format('%s: %s %s', v_pid, COALESCE(v_pay.error_reason, v_pay.error_code, 'failed'), COALESCE(v_pay.error_step, '')), 500),
      v_sub_id, v_pay.id, p_source
    );
  END IF;

  -- The mandate's payment method, from the first successful payment.
  IF v_pay.status IN ('authorized', 'captured', 'refunded') AND v_sub.method_summary IS NULL THEN
    UPDATE billing_subscriptions
       SET payment_method = COALESCE(payment_method, CASE WHEN v_pay.method IN ('card', 'upi', 'emandate', 'nach') THEN v_pay.method ELSE 'unknown' END),
           method_summary = jsonb_strip_nulls(jsonb_build_object(
             'method', v_pay.method, 'network', v_pay.card_network, 'card_type', v_pay.card_type,
             'last4', v_pay.card_last4, 'issuer', v_pay.card_issuer, 'vpa_masked', v_pay.vpa_masked,
             'bank', v_pay.bank, 'international', v_pay.international
           ))
     WHERE id = v_sub_id;
  END IF;

  IF v_anomaly IS NOT NULL THEN
    UPDATE billing_payments SET anomaly = v_anomaly WHERE id = v_pay.id;
    INSERT INTO subscription_events (account_id, event_type, note, billing_subscription_id, billing_payment_id, source)
    VALUES (v_account, 'billing_anomaly', format('%s on %s', v_anomaly, v_pid), v_sub_id, v_pay.id, p_source);
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', v_anomaly, 'payment_id', v_pay.id);
  END IF;

  -- ---- Grant (once) ----
  IF v_pay.access_applied_at IS NULL AND v_pay.status = 'captured' AND v_pay.captured AND v_kind = 'charge' THEN
    IF v_inv_status IS DISTINCT FROM 'paid' THEN
      PERFORM billing_refresh_account_grace(v_account, p_mode);
      RETURN jsonb_build_object('outcome', 'awaiting_invoice', 'payment_id', v_pay.id);
    END IF;

    v_anomaly := CASE
      WHEN NULLIF(p_invoice ->> 'provider_payment_id', '') IS DISTINCT FROM v_pid THEN 'invoice_payment_mismatch'
      WHEN v_pay.currency <> v_sub.currency THEN 'currency_mismatch'
      WHEN v_pay.amount_minor <> v_sub.amount_minor * v_sub.quantity THEN 'amount_mismatch'
      WHEN v_sub.status IN ('initiating', 'failed_to_create') THEN 'subscription_not_attached'
      ELSE NULL
    END;

    IF v_anomaly IS NULL THEN
      v_from := COALESCE(v_inv_start, v_sub.current_start, v_pay.captured_at, NOW());
      v_until := COALESCE(
        v_inv_end,
        CASE WHEN v_sub.current_start = v_from THEN v_sub.current_end END,
        v_from + make_interval(days => v_sub.duration_days)
      );
      IF v_until <= v_from OR v_until - v_from > make_interval(days => v_sub.duration_days + 1) THEN
        v_anomaly := 'period_mismatch';
      END IF;
    END IF;

    IF v_anomaly IS NOT NULL THEN
      UPDATE billing_payments SET anomaly = v_anomaly WHERE id = v_pay.id;
      INSERT INTO subscription_events (account_id, event_type, note, billing_subscription_id, billing_payment_id, source)
      VALUES (v_account, 'billing_anomaly', format('%s on %s', v_anomaly, v_pid), v_sub_id, v_pay.id, p_source);
      RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', v_anomaly, 'payment_id', v_pay.id);
    END IF;

    v_before := v_acc.subscription_ends_at;
    v_new_end := GREATEST(COALESCE(v_before, '-infinity'::TIMESTAMPTZ), v_until);
    v_status := CASE
      WHEN v_acc.subscription_status = 'none' THEN 'none'
      WHEN v_acc.subscription_status = 'trialing' AND v_acc.trial_ends_at > NOW() THEN 'trialing'
      ELSE 'active'
    END;

    UPDATE accounts
       SET subscription_status = v_status,
           subscription_ends_at = v_new_end,
           subscription_plan_id = COALESCE(v_sub.plan_id, subscription_plan_id),
           subscription_plan_name = v_sub.plan_name,
           subscription_cycle_label = v_sub.cycle_label,
           subscription_started_at = COALESCE(subscription_started_at, v_from),
           subscription_updated_by_user_id = NULL,
           subscription_note = 'Razorpay payment ' || v_pid
     WHERE id = v_account;

    UPDATE billing_payments
       SET paid_through_before = v_before, granted_from = v_from, granted_until = v_until,
           access_applied_at = NOW(), invoice_id = COALESCE(invoice_id, v_inv_id)
     WHERE id = v_pay.id;

    INSERT INTO subscription_events (
      account_id, event_type, from_status, to_status, ends_at, previous_ends_at,
      plan_name, cycle_label, amount, duration_days, window_kind, note,
      billing_subscription_id, billing_payment_id, source
    ) VALUES (
      v_account, 'payment_succeeded', v_acc.subscription_status, v_status, v_new_end, v_before,
      v_sub.plan_name, v_sub.cycle_label, billing_minor_to_major(v_pay.amount_minor, v_pay.currency),
      LEAST(v_sub.duration_days, 3650), 'paid', 'Razorpay ' || v_pid,
      v_sub_id, v_pay.id, p_source
    );

    PERFORM billing_enqueue_notification(
      p_mode, v_sub.env, v_account, 'payment_receipt', 'receipt:' || v_pid,
      jsonb_strip_nulls(jsonb_build_object(
        'plan_name', v_sub.plan_name, 'cycle_label', v_sub.cycle_label,
        'amount_minor', v_pay.amount_minor, 'currency', v_pay.currency,
        'paid_at', COALESCE(v_pay.captured_at, NOW()), 'period_start', v_from, 'period_end', v_until,
        'paid_through', v_new_end, 'method', v_pay.method, 'card_network', v_pay.card_network,
        'card_last4', v_pay.card_last4, 'vpa_masked', v_pay.vpa_masked,
        'invoice_url', v_inv_short_url, 'provider_payment_id', v_pid,
        'first_payment', NOT EXISTS (
          SELECT 1 FROM billing_payments bp
           WHERE bp.subscription_id = v_sub_id AND bp.access_applied_at IS NOT NULL AND bp.id <> v_pay.id
        )
      ))
    );

    PERFORM billing_refresh_account_grace(v_account, p_mode);
    RETURN jsonb_build_object(
      'outcome', 'granted', 'payment_id', v_pay.id, 'granted_from', v_from,
      'granted_until', v_until, 'paid_through', v_new_end
    );
  END IF;

  PERFORM billing_refresh_account_grace(v_account, p_mode);
  RETURN jsonb_build_object('outcome', 'recorded', 'payment_id', v_pay.id, 'status', v_pay.status);
END;
$$;

-- The old 4-argument outbox insert has no callers left.
DROP FUNCTION IF EXISTS public.billing_enqueue_notification(UUID, TEXT, TEXT, JSONB);

-- ------------------------------------------------------------
-- 5. Take back the time one payment bought (D4: full refund, lost
-- dispute). Caller must hold the accounts row lock.
--
-- Paid-through becomes the later of: what the account had before this
-- payment was applied, and every other Razorpay grant still standing.
-- Manual windows are inside "what it had before", so they are never cut.
-- If something later (another charge, an operator) pushed paid-through
-- past this payment's grant, we cannot tell which days to remove, so
-- nothing is changed and the outcome says so for an operator to review.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_remove_payment_window(p_payment_id UUID, p_note TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay billing_payments%ROWTYPE;
  v_acc accounts%ROWTYPE;
  v_other TIMESTAMPTZ;
  v_new TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_pay FROM billing_payments WHERE id = p_payment_id;
  IF NOT FOUND OR v_pay.access_applied_at IS NULL OR v_pay.granted_until IS NULL THEN
    RETURN 'none_not_granted';
  END IF;
  IF v_pay.access_revoked_at IS NOT NULL THEN
    RETURN 'already_removed';
  END IF;

  SELECT * INTO v_acc FROM accounts WHERE id = v_pay.account_id;
  UPDATE billing_payments SET access_revoked_at = NOW() WHERE id = v_pay.id;

  IF v_acc.subscription_ends_at IS NULL
     OR v_acc.subscription_ends_at > v_pay.granted_until + INTERVAL '1 minute' THEN
    RETURN 'unchanged_later_grant';
  END IF;

  SELECT max(granted_until) INTO v_other
    FROM billing_payments
   WHERE account_id = v_pay.account_id
     AND id <> v_pay.id
     AND access_applied_at IS NOT NULL
     AND access_revoked_at IS NULL;

  v_new := GREATEST(
    COALESCE(v_pay.paid_through_before, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_other, '-infinity'::TIMESTAMPTZ)
  );
  -- No earlier paid time at all. Never write NULL: the resolver reads a
  -- NULL end on an active account as "no window", i.e. open access.
  IF v_new = '-infinity'::TIMESTAMPTZ THEN
    v_new := LEAST(COALESCE(v_pay.granted_from, NOW()), NOW());
  END IF;

  IF v_new >= v_acc.subscription_ends_at THEN
    RETURN 'unchanged';
  END IF;

  UPDATE accounts
     SET subscription_ends_at = v_new,
         subscription_note = left(p_note, 200)
   WHERE id = v_acc.id;

  INSERT INTO subscription_events (
    account_id, event_type, from_status, to_status, ends_at, previous_ends_at,
    plan_name, cycle_label, note, billing_subscription_id, billing_payment_id, source
  ) VALUES (
    v_acc.id, 'subscription_revoked', v_acc.subscription_status, v_acc.subscription_status,
    v_new, v_acc.subscription_ends_at, v_acc.subscription_plan_name, v_acc.subscription_cycle_label,
    left(p_note || ': time bought by ' || v_pay.provider_payment_id || ' removed', 500),
    v_pay.subscription_id, v_pay.id, 'system'
  );

  RETURN 'window_removed';
END;
$$;

-- ------------------------------------------------------------
-- 6. Refunds (created in the Razorpay Dashboard; recorded from
-- refund.* webhooks and reconciliation). The caller syncs the parent
-- payment first, so the payment row exists and is up to date.
--
-- Outcomes: unknown_payment | recorded | processed | anomaly
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_refund(p_mode TEXT, p JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid TEXT := p ->> 'provider_refund_id';
  v_pid TEXT := p ->> 'provider_payment_id';
  v_account UUID;
  v_pay billing_payments%ROWTYPE;
  v_sub billing_subscriptions%ROWTYPE;
  v_prev TEXT;
  v_ref billing_refunds%ROWTYPE;
  v_total BIGINT;
  v_effect TEXT;
  v_full BOOLEAN;
  v_paid_through TIMESTAMPTZ;
BEGIN
  IF v_rid IS NULL OR v_pid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'missing_ids');
  END IF;

  SELECT account_id INTO v_account
    FROM billing_payments WHERE mode = p_mode AND provider_payment_id = v_pid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_payment');
  END IF;

  PERFORM 1 FROM accounts WHERE id = v_account FOR UPDATE;
  SELECT * INTO v_pay FROM billing_payments
   WHERE mode = p_mode AND provider_payment_id = v_pid FOR UPDATE;
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = v_pay.subscription_id;

  IF upper(p ->> 'currency') IS DISTINCT FROM v_pay.currency
     OR (p ->> 'amount_minor')::BIGINT IS NULL
     OR (p ->> 'amount_minor')::BIGINT <= 0
     OR (p ->> 'amount_minor')::BIGINT > v_pay.amount_minor THEN
    INSERT INTO subscription_events (account_id, event_type, note, billing_subscription_id, billing_payment_id, source)
    VALUES (v_account, 'billing_anomaly', format('refund_mismatch on %s (%s)', v_rid, v_pid), v_pay.subscription_id, v_pay.id, p_source);
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'refund_mismatch');
  END IF;

  SELECT status INTO v_prev FROM billing_refunds WHERE mode = p_mode AND provider_refund_id = v_rid;

  INSERT INTO billing_refunds (
    mode, provider_refund_id, payment_id, account_id, amount_minor, currency, status,
    speed_requested, speed_processed, provider_created_at, processed_at
  ) VALUES (
    p_mode, v_rid, v_pay.id, v_account, (p ->> 'amount_minor')::BIGINT, upper(p ->> 'currency'),
    p ->> 'status', NULLIF(p ->> 'speed_requested', ''), NULLIF(p ->> 'speed_processed', ''),
    billing_ts(p, 'provider_created_at'),
    CASE WHEN p ->> 'status' = 'processed' THEN NOW() END
  )
  ON CONFLICT (mode, provider_refund_id) DO UPDATE SET
    -- Forward only: processed is final, failed does not go back to pending.
    status = CASE
      WHEN billing_refunds.status = 'processed' THEN 'processed'
      WHEN billing_refunds.status = 'failed' AND EXCLUDED.status = 'pending' THEN 'failed'
      ELSE EXCLUDED.status
    END,
    speed_processed = COALESCE(EXCLUDED.speed_processed, billing_refunds.speed_processed),
    processed_at = COALESCE(billing_refunds.processed_at, EXCLUDED.processed_at)
  RETURNING * INTO v_ref;

  IF v_ref.status <> 'processed' OR v_prev IS NOT DISTINCT FROM 'processed' THEN
    RETURN jsonb_build_object('outcome', 'recorded', 'status', v_ref.status);
  END IF;

  -- First time we see this refund processed.
  SELECT COALESCE(sum(amount_minor), 0) INTO v_total
    FROM billing_refunds WHERE payment_id = v_pay.id AND status = 'processed';
  v_full := v_total >= v_pay.amount_minor;

  UPDATE billing_payments
     SET amount_refunded_minor = GREATEST(amount_refunded_minor, v_total),
         refund_status = CASE WHEN v_full THEN 'full' ELSE 'partial' END,
         status = CASE WHEN v_full AND status = 'captured' THEN 'refunded' ELSE status END
   WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  IF v_pay.kind <> 'charge' THEN
    -- e.g. the ₹5 card verification Razorpay refunds by itself. Not news
    -- to the customer and nothing to do with access.
    v_effect := 'none_not_a_charge';
  ELSIF NOT v_full THEN
    v_effect := 'none_partial';
  ELSE
    v_effect := billing_remove_payment_window(v_pay.id, 'Full refund ' || v_rid);
  END IF;

  UPDATE billing_refunds SET access_effect = v_effect WHERE id = v_ref.id;

  IF v_pay.kind = 'charge' THEN
    INSERT INTO subscription_events (
      account_id, event_type, plan_name, cycle_label, amount, note,
      billing_subscription_id, billing_payment_id, source
    ) VALUES (
      v_account, 'refund_processed', v_sub.plan_name, v_sub.cycle_label,
      billing_minor_to_major(v_ref.amount_minor, v_ref.currency),
      format('Refund %s on %s (%s); access: %s', v_rid, v_pid, CASE WHEN v_full THEN 'full' ELSE 'partial' END, v_effect),
      v_pay.subscription_id, v_pay.id, p_source
    );

    SELECT subscription_ends_at INTO v_paid_through FROM accounts WHERE id = v_account;
    PERFORM billing_enqueue_notification(
      p_mode, v_sub.env, v_account, 'refund_processed', 'refund:' || v_rid,
      jsonb_strip_nulls(jsonb_build_object(
        'plan_name', v_sub.plan_name, 'cycle_label', v_sub.cycle_label,
        'amount_minor', v_ref.amount_minor, 'currency', v_ref.currency,
        'payment_amount_minor', v_pay.amount_minor, 'full', v_full,
        'access_effect', v_effect, 'paid_through', v_paid_through,
        'provider_payment_id', v_pid, 'provider_refund_id', v_rid
      ))
    );
  END IF;

  PERFORM billing_refresh_account_grace(v_account, p_mode);
  RETURN jsonb_build_object('outcome', 'processed', 'access_effect', v_effect, 'full', v_full);
END;
$$;

-- ------------------------------------------------------------
-- 7. Disputes (chargebacks). Answered in the Razorpay Dashboard; we
-- record them, tell operators, and on a LOST dispute take back the time
-- the payment bought (D4). The caller cancels the AutoPay at Razorpay
-- when `lost` is true.
--
-- Outcomes: unknown_payment | applied
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_dispute(p_mode TEXT, p JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did TEXT := p ->> 'provider_dispute_id';
  v_pid TEXT := p ->> 'provider_payment_id';
  v_status TEXT := lower(COALESCE(p ->> 'status', 'open'));
  v_account UUID;
  v_pay billing_payments%ROWTYPE;
  v_sub billing_subscriptions%ROWTYPE;
  v_prev TEXT;
  v_row billing_disputes%ROWTYPE;
  v_effect TEXT;
  v_lost BOOLEAN := FALSE;
BEGIN
  IF v_did IS NULL OR v_pid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'anomaly', 'anomaly', 'missing_ids');
  END IF;

  SELECT account_id INTO v_account
    FROM billing_payments WHERE mode = p_mode AND provider_payment_id = v_pid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_payment');
  END IF;

  PERFORM 1 FROM accounts WHERE id = v_account FOR UPDATE;
  SELECT * INTO v_pay FROM billing_payments
   WHERE mode = p_mode AND provider_payment_id = v_pid FOR UPDATE;
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = v_pay.subscription_id;

  SELECT status INTO v_prev FROM billing_disputes WHERE mode = p_mode AND provider_dispute_id = v_did;

  INSERT INTO billing_disputes (
    mode, provider_dispute_id, payment_id, account_id, amount_minor, currency,
    reason_code, phase, status, respond_by, provider_created_at
  ) VALUES (
    p_mode, v_did, v_pay.id, v_account, COALESCE((p ->> 'amount_minor')::BIGINT, 0),
    upper(COALESCE(p ->> 'currency', v_pay.currency)), NULLIF(p ->> 'reason_code', ''),
    NULLIF(p ->> 'phase', ''), v_status, billing_ts(p, 'respond_by'), billing_ts(p, 'provider_created_at')
  )
  ON CONFLICT (mode, provider_dispute_id) DO UPDATE SET
    -- won / lost / closed are final.
    status = CASE WHEN billing_disputes.status IN ('won', 'lost', 'closed') THEN billing_disputes.status ELSE EXCLUDED.status END,
    phase = COALESCE(EXCLUDED.phase, billing_disputes.phase),
    respond_by = COALESCE(EXCLUDED.respond_by, billing_disputes.respond_by),
    amount_minor = GREATEST(billing_disputes.amount_minor, EXCLUDED.amount_minor),
    reason_code = COALESCE(EXCLUDED.reason_code, billing_disputes.reason_code)
  RETURNING * INTO v_row;

  IF v_prev IS NULL THEN
    INSERT INTO subscription_events (
      account_id, event_type, plan_name, cycle_label, amount, note,
      billing_subscription_id, billing_payment_id, source
    ) VALUES (
      v_account, 'dispute_opened', v_sub.plan_name, v_sub.cycle_label,
      billing_minor_to_major(v_row.amount_minor, v_row.currency),
      left(format('Dispute %s on %s (%s, %s), respond by %s', v_did, v_pid,
        COALESCE(v_row.phase, 'unknown phase'), COALESCE(v_row.reason_code, 'no reason code'),
        COALESCE(to_char(v_row.respond_by AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI "IST"'), 'unknown')), 500),
      v_pay.subscription_id, v_pay.id, p_source
    );
  END IF;

  IF v_row.status IN ('won', 'lost', 'closed')
     AND (v_prev IS NULL OR v_prev NOT IN ('won', 'lost', 'closed')) THEN
    IF v_row.status = 'lost' THEN
      v_lost := TRUE;
      v_effect := CASE WHEN v_pay.kind = 'charge'
        THEN billing_remove_payment_window(v_pay.id, 'Dispute lost ' || v_did)
        ELSE 'none_not_a_charge' END;
    END IF;
    INSERT INTO subscription_events (
      account_id, event_type, plan_name, cycle_label, amount, note,
      billing_subscription_id, billing_payment_id, source
    ) VALUES (
      v_account, 'dispute_closed', v_sub.plan_name, v_sub.cycle_label,
      billing_minor_to_major(v_row.amount_minor, v_row.currency),
      format('Dispute %s %s; access: %s', v_did, v_row.status, COALESCE(v_effect, 'unchanged')),
      v_pay.subscription_id, v_pay.id, p_source
    );
    PERFORM billing_refresh_account_grace(v_account, p_mode);
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'applied', 'status', v_row.status, 'lost', v_lost,
    'access_effect', v_effect, 'provider_subscription_id', v_sub.provider_subscription_id
  );
END;
$$;

-- ------------------------------------------------------------
-- 8. Work claims (FOR UPDATE SKIP LOCKED), so the webhook's after(),
-- overlapping cron ticks and a second container never process the same
-- event or send the same email at the same time.
-- ------------------------------------------------------------

-- Webhook events: due 'received'/'failed' rows, or 'processing' rows
-- whose lease ran out (the process died mid-way). A row that has crashed
-- the processor 8 times is parked as 'dead' instead of looping forever.
CREATE OR REPLACE FUNCTION public.billing_claim_webhook_events(p_mode TEXT, p_limit INTEGER, p_id UUID DEFAULT NULL)
RETURNS SETOF public.billing_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE billing_webhook_events
     SET status = 'dead', last_error = COALESCE(last_error, 'Processing lease expired too many times')
   WHERE mode = p_mode AND status = 'processing' AND locked_until < NOW() AND attempts >= 8;

  RETURN QUERY
  UPDATE billing_webhook_events e
     SET status = 'processing',
         attempts = e.attempts + 1,
         locked_until = NOW() + INTERVAL '5 minutes'
   WHERE e.id IN (
     SELECT w.id
       FROM billing_webhook_events w
      WHERE w.mode = p_mode
        AND (p_id IS NULL OR w.id = p_id)
        AND (
          (w.status IN ('received', 'failed') AND COALESCE(w.next_attempt_at, w.received_at) <= NOW())
          OR (w.status = 'processing' AND w.locked_until < NOW())
        )
      ORDER BY w.received_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
END;
$$;

-- Outbox: due rows of THIS deployment's mode and environment. A claim
-- leases the row for 10 minutes (next_attempt_at), so a sender that dies
-- mid-send is retried, and at most 6 attempts are ever made.
CREATE OR REPLACE FUNCTION public.billing_claim_notifications(p_mode TEXT, p_env TEXT, p_limit INTEGER, p_id UUID DEFAULT NULL)
RETURNS SETOF public.billing_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_notifications n
     SET status = 'sending',
         attempts = n.attempts + 1,
         next_attempt_at = NOW() + INTERVAL '10 minutes'
   WHERE n.id IN (
     SELECT b.id
       FROM billing_notifications b
      WHERE b.mode = p_mode
        AND (b.env IS NULL OR b.env = p_env)
        AND (p_id IS NULL OR b.id = p_id)
        AND b.status IN ('pending', 'failed', 'sending')
        AND b.next_attempt_at <= NOW()
        AND b.attempts < 6
      ORDER BY b.created_at
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING n.*;
END;
$$;

-- ------------------------------------------------------------
-- 9. What reconciliation should look at (plan section 3.8 b, c, d).
-- Oldest-synced first, bounded, so one tick never does unbounded work.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_reconcile_candidates(p_mode TEXT, p_limit INTEGER)
RETURNS TABLE (id UUID, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         CASE
           WHEN s.provider_subscription_id IS NULL THEN 'orphan_check'
           WHEN s.status = 'created' THEN 'unauthorised'
           WHEN s.status IN ('authenticated', 'active', 'pending')
                AND s.charge_at < NOW() - INTERVAL '30 minutes' THEN 'charge_overdue'
           ELSE 'sweep'
         END
    FROM billing_subscriptions s
   WHERE s.mode = p_mode
     AND (
       -- (c) a claim whose process died before or during the Razorpay call
       (s.status = 'initiating' AND s.created_at < NOW() - INTERVAL '10 minutes')
       OR (s.status = 'failed_to_create' AND s.provider_subscription_id IS NULL
           AND s.last_synced_at IS NULL AND s.created_at > NOW() - INTERVAL '48 hours')
       -- (c) unauthorised checkouts past expire_by: close them
       OR (s.status = 'created'
           AND (s.expire_by < NOW() OR s.created_at < NOW() - INTERVAL '25 hours')
           AND COALESCE(s.last_synced_at, '-infinity'::TIMESTAMPTZ) < NOW() - INTERVAL '30 minutes')
       -- (b) a charge was due 30+ minutes ago and nothing has told us since
       OR (s.status IN ('authenticated', 'active', 'pending')
           AND s.charge_at < NOW() - INTERVAL '30 minutes'
           AND COALESCE(s.last_synced_at, '-infinity'::TIMESTAMPTZ) < NOW() - INTERVAL '15 minutes')
       -- (d) rolling daily sweep of everything still alive
       OR (s.status IN ('authenticated', 'active', 'pending', 'halted', 'paused')
           AND COALESCE(s.last_synced_at, '-infinity'::TIMESTAMPTZ) < NOW() - INTERVAL '24 hours')
     )
   ORDER BY COALESCE(s.last_synced_at, '-infinity'::TIMESTAMPTZ) ASC, s.created_at ASC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
$$;

-- ------------------------------------------------------------
-- 10. Super-admin notifications
-- ------------------------------------------------------------

-- For callers outside SQL (a webhook event that went dead). Never
-- throws: an unwritable notification must not fail the caller.
CREATE OR REPLACE FUNCTION public.billing_notify_admin(
  p_type TEXT, p_severity TEXT, p_title TEXT, p_body TEXT,
  p_account_id UUID DEFAULT NULL, p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_account_id IS NOT NULL THEN
    SELECT name INTO v_name FROM accounts WHERE id = p_account_id;
  END IF;
  RETURN fn_sa_notify(
    p_type, p_severity, left(p_title, 200), left(p_body, 1000),
    p_account_id, v_name,
    CASE WHEN p_account_id IS NOT NULL THEN 'account' END, p_account_id,
    COALESCE(p_link, CASE WHEN p_account_id IS NOT NULL THEN '/super-admin/accounts/' || p_account_id::TEXT END)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'billing_notify_admin failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Billing events that need an operator, from inside the same
-- transaction that wrote them. Test-mode events (dev shares this
-- database) are prefixed "[Test]" so they are never mistaken for a real
-- customer's money.
CREATE OR REPLACE FUNCTION public.billing_events_notify_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_type TEXT;
  v_severity TEXT;
  v_title TEXT;
BEGIN
  BEGIN
    SELECT mode INTO v_mode FROM billing_subscriptions WHERE id = NEW.billing_subscription_id;

    v_type := CASE NEW.event_type
      WHEN 'billing_anomaly' THEN 'billing_anomaly'
      WHEN 'autopay_pending' THEN 'autopay_payment_failed'
      WHEN 'autopay_halted' THEN 'autopay_halted'
      WHEN 'refund_processed' THEN 'billing_refund'
      ELSE 'billing_dispute'
    END;
    v_severity := CASE NEW.event_type
      WHEN 'billing_anomaly' THEN 'critical'
      WHEN 'dispute_opened' THEN 'critical'
      WHEN 'autopay_halted' THEN 'warning'
      WHEN 'autopay_pending' THEN 'warning'
      ELSE 'info'
    END;
    v_title := CASE WHEN v_mode = 'test' THEN '[Test] ' ELSE '' END || CASE NEW.event_type
      WHEN 'billing_anomaly' THEN 'Billing check failed, nothing was granted'
      WHEN 'autopay_pending' THEN 'AutoPay charge failed, Razorpay is retrying'
      WHEN 'autopay_halted' THEN 'AutoPay stopped after failed retries'
      WHEN 'refund_processed' THEN 'Razorpay refund processed'
      WHEN 'dispute_opened' THEN 'Payment disputed (chargeback)'
      ELSE 'Payment dispute closed'
    END;

    PERFORM billing_notify_admin(v_type, v_severity, v_title, NEW.note, NEW.account_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'billing_events_notify_admin failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_events_notify_admin ON public.subscription_events;
CREATE TRIGGER trg_billing_events_notify_admin
  AFTER INSERT ON public.subscription_events
  FOR EACH ROW
  WHEN (NEW.event_type IN (
    'billing_anomaly', 'autopay_pending', 'autopay_halted',
    'refund_processed', 'dispute_opened', 'dispute_closed'
  ))
  EXECUTE FUNCTION public.billing_events_notify_admin();

-- ------------------------------------------------------------
-- 11. Grants
-- ------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.billing_enqueue_notification(text, text, uuid, text, text, jsonb)',
    'public.billing_apply_subscription_snapshot(text, jsonb, text)',
    'public.billing_apply_payment(text, jsonb, jsonb, text)',
    'public.billing_remove_payment_window(uuid, text)',
    'public.billing_apply_refund(text, jsonb, text)',
    'public.billing_apply_dispute(text, jsonb, text)',
    'public.billing_claim_webhook_events(text, integer, uuid)',
    'public.billing_claim_notifications(text, text, integer, uuid)',
    'public.billing_reconcile_candidates(text, integer)',
    'public.billing_notify_admin(text, text, text, text, uuid, text)',
    'public.billing_events_notify_admin()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END
$$;
