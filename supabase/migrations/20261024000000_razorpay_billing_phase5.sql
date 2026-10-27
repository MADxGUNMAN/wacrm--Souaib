-- ============================================================
-- Razorpay Subscriptions — Phase 5: super-admin automated billing.
--
-- Plan: docs/razopay/razorpay-subscriptions-plan.md, sections 7.4, 9
-- and 15 (Phase 5).
--
--   (a) a `billing_admin_action` event type, so an operator's sync,
--       cancel or webhook retry is audited with WHO did it and WHY.
--       Customers never see it (listCustomerPlanActivity allowlists).
--   (b) who re-queued a webhook event, when, and how often
--   (c) who started a reconciliation run by hand (NULL for cron)
--   (d) billing_admin_audit: write one admin audit row
--   (e) billing_admin_requeue_webhook_event: put a failed or dead event
--       back in the queue in ONE statement, so two clicks cannot both
--       reset it and a processed event can never be replayed
--   (f) billing_admin_overview: every count the Overview tab shows, in
--       one read instead of ~30 count queries
--   (g) service role only
--
-- Additive and idempotent. The super-admin notification types this phase
-- raises (billing_anomaly and friends) already exist (20261022000000).
-- ============================================================

-- (a) Every value already in the live CHECK, plus billing_admin_action.
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
    'refund_processed', 'dispute_opened', 'dispute_closed', 'billing_anomaly',
    'billing_admin_action'
  ));

-- (b)
ALTER TABLE public.billing_webhook_events
  ADD COLUMN IF NOT EXISTS requeued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requeued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requeue_count INTEGER NOT NULL DEFAULT 0;

-- (c)
ALTER TABLE public.billing_reconciliation_runs
  ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- (d) One audit row. Plan and cycle are copied from the subscription so
-- the row still reads correctly after the subscription is gone.
CREATE OR REPLACE FUNCTION public.billing_admin_audit(
  p_account_id UUID,
  p_billing_subscription_id UUID,
  p_actor UUID,
  p_note TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_cycle TEXT;
  v_id    UUID;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'billing_admin_audit: actor is required';
  END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'billing_admin_audit: note is required';
  END IF;

  IF p_billing_subscription_id IS NOT NULL THEN
    SELECT plan_name, cycle_label INTO v_plan, v_cycle
      FROM billing_subscriptions
     WHERE id = p_billing_subscription_id
       AND account_id = p_account_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'billing_admin_audit: subscription % does not belong to account %',
        p_billing_subscription_id, p_account_id;
    END IF;
  END IF;

  INSERT INTO subscription_events (
    account_id, event_type, actor_user_id, note, billing_subscription_id,
    source, plan_name, cycle_label
  )
  VALUES (
    p_account_id, 'billing_admin_action', p_actor, left(p_note, 1000),
    p_billing_subscription_id, 'admin', v_plan, v_cycle
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- (e) Only failed or dead events can be re-queued. `last_error` is kept
-- so the operator still sees why it failed before.
CREATE OR REPLACE FUNCTION public.billing_admin_requeue_webhook_event(p_id UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          UUID;
  v_mode        TEXT;
  v_account     UUID;
  v_event_type  TEXT;
  v_provider_id TEXT;
  v_status      TEXT;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'billing_admin_requeue_webhook_event: actor is required';
  END IF;

  UPDATE billing_webhook_events
     SET status = 'received',
         attempts = 0,
         next_attempt_at = NOW(),
         locked_until = NULL,
         requeued_at = NOW(),
         requeued_by = p_actor,
         requeue_count = requeue_count + 1
   WHERE id = p_id
     AND status IN ('failed', 'dead')
  RETURNING id, mode, account_id, event_type, provider_event_id
       INTO v_id, v_mode, v_account, v_event_type, v_provider_id;

  IF NOT FOUND THEN
    SELECT status INTO v_status FROM billing_webhook_events WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'not_found');
    END IF;
    RETURN jsonb_build_object('outcome', 'not_retryable', 'status', v_status);
  END IF;

  IF v_account IS NOT NULL THEN
    PERFORM billing_admin_audit(
      v_account, NULL, p_actor,
      format('Re-queued Razorpay webhook %s (%s)', v_provider_id, v_event_type)
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'requeued',
    'id', v_id,
    'mode', v_mode,
    'account_id', v_account
  );
END;
$$;

-- (f) Overview counts, keyed by mode so test and live never mix.
--   subscriptions          {"<mode>:<status>": n}
--   trialing_with_autopay  {mode: n}  authenticated and still in trial
--   upcoming_charges_7d    {mode: n}  will be charged in the next 7 days
--   failures_7d            {mode: n}  failed payments in the last 7 days
--   webhooks               {mode: {last_received_at, failed, dead, anomalies}}
--                          (failed/dead: current state; anomalies: last 7 days)
--   last_runs              {mode: newest reconciliation run}
CREATE OR REPLACE FUNCTION public.billing_admin_overview()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'subscriptions', COALESCE((
      SELECT jsonb_object_agg(s.mode || ':' || s.status, s.n)
        FROM (
          SELECT mode, status, count(*) AS n
            FROM billing_subscriptions
           GROUP BY mode, status
        ) s
    ), '{}'::jsonb),
    'trialing_with_autopay', COALESCE((
      SELECT jsonb_object_agg(t.mode, t.n)
        FROM (
          SELECT bs.mode, count(*) AS n
            FROM billing_subscriptions bs
            JOIN accounts a ON a.id = bs.account_id
           WHERE bs.status = 'authenticated'
             AND a.trial_ends_at > NOW()
           GROUP BY bs.mode
        ) t
    ), '{}'::jsonb),
    'upcoming_charges_7d', COALESCE((
      SELECT jsonb_object_agg(u.mode, u.n)
        FROM (
          SELECT mode, count(*) AS n
            FROM billing_subscriptions
           WHERE status IN ('authenticated', 'active', 'pending')
             AND charge_at >= NOW()
             AND charge_at < NOW() + INTERVAL '7 days'
           GROUP BY mode
        ) u
    ), '{}'::jsonb),
    'failures_7d', COALESCE((
      SELECT jsonb_object_agg(f.mode, f.n)
        FROM (
          SELECT mode, count(*) AS n
            FROM billing_payments
           WHERE status = 'failed'
             AND created_at >= NOW() - INTERVAL '7 days'
           GROUP BY mode
        ) f
    ), '{}'::jsonb),
    'webhooks', COALESCE((
      SELECT jsonb_object_agg(w.mode, jsonb_build_object(
               'last_received_at', w.last_received_at,
               'failed', w.failed,
               'dead', w.dead,
               'anomalies', w.anomalies
             ))
        FROM (
          SELECT mode,
                 max(received_at) AS last_received_at,
                 count(*) FILTER (WHERE status = 'failed') AS failed,
                 count(*) FILTER (WHERE status = 'dead') AS dead,
                 count(*) FILTER (
                   WHERE anomaly IS NOT NULL
                     AND received_at >= NOW() - INTERVAL '7 days'
                 ) AS anomalies
            FROM billing_webhook_events
           GROUP BY mode
        ) w
    ), '{}'::jsonb),
    'last_runs', COALESCE((
      SELECT jsonb_object_agg(r.mode, jsonb_build_object(
               'id', r.id,
               'scope', r.scope,
               'status', r.status,
               'checked', r.checked,
               'changed', r.changed,
               'error_count', CASE WHEN jsonb_typeof(r.errors) = 'array'
                                   THEN jsonb_array_length(r.errors) ELSE 0 END,
               'started_at', r.started_at,
               'finished_at', r.finished_at,
               'triggered_by', r.triggered_by
             ))
        FROM (
          SELECT DISTINCT ON (mode)
                 id, mode, scope, status, checked, changed, errors,
                 started_at, finished_at, triggered_by
            FROM billing_reconciliation_runs
           ORDER BY mode, started_at DESC
        ) r
    ), '{}'::jsonb)
  );
$$;

-- (g)
REVOKE ALL ON FUNCTION public.billing_admin_audit(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_audit(UUID, UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.billing_admin_requeue_webhook_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_requeue_webhook_event(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.billing_admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_overview() TO service_role;
