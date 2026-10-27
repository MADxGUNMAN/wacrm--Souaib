-- ============================================================
-- Global (Universal) currency change: prices and currency in ONE step.
--
-- Report: docs/razopay/localized-pricing-report.md, section 12.
--
-- ADDITIVE AND IDEMPOTENT. One function plus its grants. No table, column,
-- constraint or index is created or changed, and nothing runs against data
-- when this file is applied. The function itself only writes when the super
-- admin route calls it.
--
-- Why a database function: Global prices are plain numbers with no currency
-- of their own (`subscription_plan_prices.amount`), and the Global currency
-- is `subscription_settings.currency`. Supabase JS has no transactions, so
-- writing the prices and then the currency from the route would leave a
-- window (or, after a crash, a permanent state) where they disagree, and a
-- checkout in that window would charge 990 USD instead of 990 INR. This
-- function locks the settings row and every Global price row, checks that
-- the caller sent a new price for EVERY Global price row (any plan, visible
-- or hidden), updates them all and the currency, and commits once.
--
-- It never touches `payment_provider`, `billing_subscriptions`,
-- `pricing_regions` or any country cycle. Existing AutoPay mandates keep
-- charging their own immutable Razorpay plan.
--
-- Apply only after explicit approval: dev and production share this
-- database, so the function becomes available to both at once.
--
-- Rollback (after a code rollback only):
--   DROP FUNCTION IF EXISTS public.fn_change_global_currency(TEXT, TEXT, JSONB);
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_change_global_currency(
  p_expected_currency TEXT,
  p_new_currency TEXT,
  p_prices JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_current TEXT;
  v_new TEXT := upper(btrim(coalesce(p_new_currency, '')));
  v_have INT;
  v_given INT;
  v_distinct INT;
  v_matched INT;
  v_updated INT;
BEGIN
  IF v_new !~ '^[A-Z]{3}$' THEN
    RETURN jsonb_build_object('outcome', 'invalid_currency');
  END IF;
  IF p_prices IS NULL OR jsonb_typeof(p_prices) <> 'array' THEN
    RETURN jsonb_build_object('outcome', 'invalid_prices');
  END IF;

  SELECT id, upper(btrim(currency)) INTO v_id, v_current
    FROM subscription_settings LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'settings_missing');
  END IF;
  IF v_current IS DISTINCT FROM upper(btrim(coalesce(p_expected_currency, ''))) THEN
    RETURN jsonb_build_object('outcome', 'stale', 'currency', v_current);
  END IF;
  IF v_new = v_current THEN
    RETURN jsonb_build_object('outcome', 'unchanged', 'currency', v_current);
  END IF;

  -- A concurrent single-price edit waits for this transaction.
  PERFORM 1 FROM subscription_plan_prices pp
    JOIN billing_cycles c ON c.id = pp.cycle_id
   WHERE c.region = 'global'
     FOR UPDATE OF pp;

  SELECT count(*) INTO v_have
    FROM subscription_plan_prices pp
    JOIN billing_cycles c ON c.id = pp.cycle_id
   WHERE c.region = 'global';

  SELECT count(*), count(DISTINCT (w.plan_id, w.cycle_id))
    INTO v_given, v_distinct
    FROM jsonb_to_recordset(p_prices)
      AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC);

  SELECT count(*) INTO v_matched
    FROM jsonb_to_recordset(p_prices)
      AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
    JOIN subscription_plan_prices pp
      ON pp.plan_id = w.plan_id AND pp.cycle_id = w.cycle_id
    JOIN billing_cycles c ON c.id = pp.cycle_id AND c.region = 'global';

  IF v_given <> v_distinct OR v_matched <> v_given OR v_matched <> v_have THEN
    RETURN jsonb_build_object('outcome', 'prices_mismatch',
      'expected', v_have, 'given', v_given);
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_prices)
      AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
     WHERE w.amount IS NULL OR w.amount <= 0 OR w.amount > 9999999999
        OR w.amount <> round(w.amount, 2)
        OR (w.per_day_amount IS NOT NULL AND (
              w.per_day_amount <= 0 OR w.per_day_amount > w.amount
              OR w.per_day_amount <> round(w.per_day_amount, 2)))
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_amount');
  END IF;

  UPDATE subscription_plan_prices pp
     SET amount = w.amount,
         per_day_amount = w.per_day_amount,
         compare_at_amount = NULL,
         updated_at = now()
    FROM jsonb_to_recordset(p_prices)
      AS w(plan_id UUID, cycle_id UUID, amount NUMERIC, per_day_amount NUMERIC)
   WHERE pp.plan_id = w.plan_id AND pp.cycle_id = w.cycle_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE subscription_settings
     SET currency = v_new, updated_at = now()
   WHERE id = v_id;

  RETURN jsonb_build_object('outcome', 'changed',
    'previous', v_current, 'currency', v_new, 'prices', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_change_global_currency(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_change_global_currency(TEXT, TEXT, JSONB)
  TO service_role;
