-- ============================================================
-- Razorpay Subscriptions — Phase 4: customer lifecycle actions.
--
-- Plan: docs/razopay/razorpay-subscriptions-plan.md, sections 7.2, 8.3.
--
-- One function. Records WHO asked for an AutoPay to stop, after Razorpay
-- has accepted the cancel, so the billing page can tell "you cancelled"
-- apart from "your UPI app or bank cancelled it". The status itself is
-- still written only by billing_apply_subscription_snapshot from a fresh
-- Razorpay fetch.
--
-- Additive and idempotent. Service role only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.billing_mark_cancel_requested(p_id UUID, p_by TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_by IS NULL OR p_by NOT IN ('customer', 'admin', 'provider', 'system') THEN
    RAISE EXCEPTION 'billing_mark_cancel_requested: invalid actor %', p_by;
  END IF;

  -- First request wins: a double click or a retry never rewrites who
  -- asked or when.
  UPDATE billing_subscriptions
     SET cancel_requested_at = NOW(),
         cancelled_by = p_by
   WHERE id = p_id
     AND cancel_requested_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_mark_cancel_requested(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_mark_cancel_requested(UUID, TEXT) TO service_role;
