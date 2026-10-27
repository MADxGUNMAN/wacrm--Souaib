-- ============================================================
-- Razorpay Subscriptions — state functions (Phase 1).
--
-- Plan: docs/razopay/razorpay-subscriptions-plan.md, sections 3.6, 3.7,
-- 5 and 6.3.
--
-- Every state change runs inside ONE of these functions, in ONE
-- transaction, with the `accounts` row locked first (then the
-- subscription row). That ordering is the same in every function, so two
-- concurrent writers queue instead of deadlocking, and a webhook, the
-- verify route and reconciliation racing on the same payment apply it
-- exactly once.
--
-- The functions take NORMALISED snapshots built by
-- src/lib/billing/razorpay/mapping.ts from objects the server fetched
-- from api.razorpay.com itself. Nothing here trusts a browser.
--
-- Access is only ever extended, with greatest(), and only when:
--   payment captured + invoice paid + invoice belongs to our subscription
--   + invoice names this payment + amount and currency match what we
--   stored at checkout.
--
-- SECURITY DEFINER with a pinned search_path; EXECUTE is revoked from
-- PUBLIC/anon/authenticated (see the GRANT HARDENING note in
-- 20260827000000_super_admin_notifications.sql) and granted to
-- service_role only. Idempotent: CREATE OR REPLACE.
-- ============================================================

-- ------------------------------------------------------------
-- Small pure helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_ts(p JSONB, k TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE
SET search_path = public
AS $$ SELECT NULLIF(p ->> k, '')::TIMESTAMPTZ $$;

CREATE OR REPLACE FUNCTION public.billing_minor_to_major(p_amount BIGINT, p_currency TEXT)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN upper(p_currency) IN ('JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX') THEN p_amount::NUMERIC
    WHEN upper(p_currency) IN ('KWD', 'BHD', 'OMR', 'JOD', 'TND') THEN round(p_amount::NUMERIC / 1000, 3)
    ELSE round(p_amount::NUMERIC / 100, 2)
  END
$$;

-- Forward-only ordering for payment status. A replayed or out-of-order
-- snapshot can never move a captured payment back to authorized.
CREATE OR REPLACE FUNCTION public.billing_payment_rank(p_status TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'created' THEN 0
    WHEN 'authorized' THEN 1
    WHEN 'failed' THEN 1
    WHEN 'captured' THEN 2
    WHEN 'refunded' THEN 3
    ELSE -1
  END
$$;

-- ------------------------------------------------------------
-- Outbox insert. The dedupe key makes a second call a no-op.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_enqueue_notification(
  p_account_id UUID, p_kind TEXT, p_dedupe_key TEXT, p_data JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO billing_notifications (account_id, kind, dedupe_key, recipient_user_id, data)
  SELECT a.id, p_kind, p_dedupe_key, a.owner_user_id, COALESCE(p_data, '{}'::JSONB)
    FROM accounts a
   WHERE a.id = p_account_id
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- ------------------------------------------------------------
-- Autopay grace (D2)
--
-- While a mandate is authenticated/active/pending and its charge is due
-- now-ish, keep access open until (current coverage end + N days). The
-- provider due date must fall inside that window, otherwise there is no
-- charge in flight to wait for (for example an admin shortened the trial
-- after the customer authorised) and no grace is given.
-- Cleared for halted, paused, cancelled, completed, or cancel-at-cycle-end.
-- Caller must already hold the accounts row lock.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_refresh_account_grace(p_account_id UUID, p_mode TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER;
  v_paid TIMESTAMPTZ;
  v_trial TIMESTAMPTZ;
  v_due TIMESTAMPTZ;
  v_provider_due TIMESTAMPTZ;
  v_grace TIMESTAMPTZ := NULL;
  v_sub billing_subscriptions%ROWTYPE;
BEGIN
  SELECT autopay_grace_days INTO v_days FROM subscription_settings LIMIT 1;
  v_days := COALESCE(v_days, 3);

  SELECT subscription_ends_at, trial_ends_at INTO v_paid, v_trial
    FROM accounts WHERE id = p_account_id;
  v_due := GREATEST(COALESCE(v_paid, '-infinity'::TIMESTAMPTZ), COALESCE(v_trial, '-infinity'::TIMESTAMPTZ));

  SELECT * INTO v_sub
    FROM billing_subscriptions
   WHERE account_id = p_account_id
     AND mode = p_mode
     AND status IN ('authenticated', 'active', 'pending')
     AND NOT cancel_at_cycle_end
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND AND v_days > 0 AND v_due > '-infinity'::TIMESTAMPTZ THEN
    v_provider_due := CASE v_sub.status
      WHEN 'authenticated' THEN v_sub.start_at
      ELSE COALESCE(v_sub.charge_at, v_sub.current_start, v_sub.start_at)
    END;
    IF v_provider_due IS NOT NULL AND v_provider_due <= v_due + make_interval(days => v_days) THEN
      v_grace := v_due + make_interval(days => v_days);
    END IF;
  END IF;

  UPDATE accounts
     SET billing_grace_ends_at = v_grace
   WHERE id = p_account_id
     AND billing_grace_ends_at IS DISTINCT FROM v_grace;

  RETURN v_grace;
END;
$$;

-- ------------------------------------------------------------
-- Checkout claim — taken BEFORE calling Razorpay.
--
-- Outcomes:
--   claimed             new 'initiating' row; caller creates the provider subscription
--   reuse               an unexpired, unauthorised subscription for the same
--                       plan/intent/start already exists; open that one (second tab)
--   in_progress         another request claimed < 2 minutes ago
--   autopay_exists      a mandate is already set up; nothing to buy
--   supersede_required  an unauthorised subscription for a DIFFERENT choice
--                       exists; caller cancels it at Razorpay, calls
--                       billing_mark_superseded, then claims again
--   account_not_found
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_claim_checkout(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account UUID := (p ->> 'account_id')::UUID;
  v_mode TEXT := p ->> 'mode';
  v_start TIMESTAMPTZ := billing_ts(p, 'start_at');
  v_live billing_subscriptions%ROWTYPE;
  v_row billing_subscriptions%ROWTYPE;
BEGIN
  PERFORM 1 FROM accounts WHERE id = v_account FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'account_not_found');
  END IF;

  SELECT * INTO v_live
    FROM billing_subscriptions
   WHERE account_id = v_account
     AND mode = v_mode
     AND status IN ('initiating', 'created', 'authenticated', 'active', 'pending', 'halted', 'paused')
     AND NOT cancel_at_cycle_end
   FOR UPDATE;

  IF FOUND THEN
    IF v_live.status IN ('authenticated', 'active', 'pending', 'halted', 'paused') THEN
      RETURN jsonb_build_object('outcome', 'autopay_exists', 'subscription', to_jsonb(v_live));
    END IF;

    IF v_live.status = 'initiating' THEN
      IF v_live.created_at > NOW() - INTERVAL '2 minutes' THEN
        RETURN jsonb_build_object('outcome', 'in_progress', 'subscription', to_jsonb(v_live));
      END IF;
      -- The process died between claim and Razorpay call. Release it; the
      -- reconciliation job looks for an orphan provider subscription by
      -- notes.checkout_id and cancels it.
      UPDATE billing_subscriptions
         SET status = 'failed_to_create', status_changed_at = NOW(),
             last_error = 'Stale checkout claim released'
       WHERE id = v_live.id;
    ELSIF v_live.status = 'created' THEN
      IF v_live.provider_plan_id = (p ->> 'provider_plan_id')
         AND v_live.intent = (p ->> 'intent')
         AND (
           (v_live.start_at IS NULL AND v_start IS NULL)
           OR abs(extract(epoch FROM (v_live.start_at - v_start))) < 60
         )
         AND v_live.expire_by > NOW() + INTERVAL '10 minutes' THEN
        RETURN jsonb_build_object('outcome', 'reuse', 'subscription', to_jsonb(v_live));
      END IF;
      RETURN jsonb_build_object('outcome', 'supersede_required', 'subscription', to_jsonb(v_live));
    END IF;
  END IF;

  INSERT INTO billing_subscriptions (
    account_id, mode, env, checkout_id, provider_plan_row, provider_plan_id,
    plan_id, cycle_id, plan_name, cycle_label, duration_days, amount_minor,
    currency, quantity, status, intent, start_at, created_by_user_id
  ) VALUES (
    v_account, v_mode, p ->> 'env', (p ->> 'checkout_id')::UUID,
    NULLIF(p ->> 'provider_plan_row', '')::UUID, p ->> 'provider_plan_id',
    NULLIF(p ->> 'plan_id', '')::UUID, NULLIF(p ->> 'cycle_id', '')::UUID,
    p ->> 'plan_name', p ->> 'cycle_label', (p ->> 'duration_days')::INTEGER,
    (p ->> 'amount_minor')::BIGINT, p ->> 'currency', 1, 'initiating',
    p ->> 'intent', v_start, NULLIF(p ->> 'created_by', '')::UUID
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('outcome', 'claimed', 'subscription', to_jsonb(v_row));
END;
$$;

-- Record the provider subscription the caller just created.
CREATE OR REPLACE FUNCTION public.billing_attach_provider_subscription(p_id UUID, p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row billing_subscriptions%ROWTYPE;
BEGIN
  UPDATE billing_subscriptions
     SET provider_subscription_id = p ->> 'provider_subscription_id',
         status = 'created',
         status_changed_at = NOW(),
         start_at = COALESCE(billing_ts(p, 'start_at'), start_at),
         charge_at = billing_ts(p, 'charge_at'),
         end_at = billing_ts(p, 'end_at'),
         expire_by = billing_ts(p, 'expire_by'),
         total_count = NULLIF(p ->> 'total_count', '')::INTEGER,
         remaining_count = NULLIF(p ->> 'remaining_count', '')::INTEGER,
         short_url = p ->> 'short_url',
         last_synced_at = COALESCE(billing_ts(p, 'fetched_at'), NOW())
   WHERE id = p_id AND status = 'initiating'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_initiating');
  END IF;

  INSERT INTO subscription_events (
    account_id, event_type, plan_name, cycle_label, amount, actor_user_id,
    note, billing_subscription_id, source
  ) VALUES (
    v_row.account_id, 'autopay_checkout_created', v_row.plan_name, v_row.cycle_label,
    billing_minor_to_major(v_row.amount_minor, v_row.currency), v_row.created_by_user_id,
    format('Razorpay %s created (%s)', v_row.provider_subscription_id, v_row.intent),
    v_row.id, 'checkout'
  );

  RETURN jsonb_build_object('outcome', 'attached', 'subscription', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_mark_create_failed(p_id UUID, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE billing_subscriptions
     SET status = 'failed_to_create', status_changed_at = NOW(), last_error = left(p_error, 500)
   WHERE id = p_id AND status = 'initiating';
  RETURN FOUND;
END;
$$;

-- Only for an unauthorised subscription the caller has already cancelled
-- (or confirmed expired) at Razorpay.
CREATE OR REPLACE FUNCTION public.billing_mark_superseded(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE billing_subscriptions
     SET status = 'superseded', status_changed_at = NOW()
   WHERE id = p_id AND status = 'created';
  RETURN FOUND;
END;
$$;

-- ------------------------------------------------------------
-- Apply a subscription snapshot fetched from Razorpay.
-- Order-independent: older snapshots (by fetched_at) are ignored, and
-- the status written is whatever Razorpay currently says.
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
      PERFORM billing_enqueue_notification(v_account, 'mandate_authenticated', 'mandate:' || v_id, v_data);
    ELSIF v_new = 'pending' THEN
      PERFORM billing_enqueue_notification(v_account, 'payment_failed', 'failed:' || v_id || ':' || v_cycle_key, v_data);
    ELSIF v_new = 'halted' THEN
      PERFORM billing_enqueue_notification(v_account, 'action_required', 'halted:' || v_id || ':' || v_cycle_key, v_data);
    ELSIF v_new = 'cancelled' AND v_event IS NOT NULL THEN
      PERFORM billing_enqueue_notification(v_account, 'autopay_cancelled', 'cancelled:' || v_id, v_data);
    ELSIF v_new = 'paused' THEN
      PERFORM billing_enqueue_notification(v_account, 'autopay_paused', 'paused:' || v_id || ':' || COALESCE(v_sub.paid_count, 0), v_data);
    ELSIF v_new = 'completed' THEN
      PERFORM billing_enqueue_notification(v_account, 'subscription_completed', 'completed:' || v_id, v_data);
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
      v_account, 'payment_receipt', 'receipt:' || v_pid,
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

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.billing_ts(jsonb, text)',
    'public.billing_minor_to_major(bigint, text)',
    'public.billing_payment_rank(text)',
    'public.billing_enqueue_notification(uuid, text, text, jsonb)',
    'public.billing_refresh_account_grace(uuid, text)',
    'public.billing_claim_checkout(jsonb)',
    'public.billing_attach_provider_subscription(uuid, jsonb)',
    'public.billing_mark_create_failed(uuid, text)',
    'public.billing_mark_superseded(uuid)',
    'public.billing_apply_subscription_snapshot(text, jsonb, text)',
    'public.billing_apply_payment(text, jsonb, jsonb, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END
$$;
