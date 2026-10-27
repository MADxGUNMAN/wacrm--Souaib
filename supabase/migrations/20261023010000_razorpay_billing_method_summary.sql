-- ============================================================
-- Razorpay Subscriptions — Phase 4: keep the shown payment method current.
--
-- billing_apply_payment records the mandate's method from the FIRST
-- successful payment only. After a card change (Checkout with
-- subscription_card_change) Razorpay charges the new card, so the
-- billing page must show it. This sets the summary from the NEWEST
-- successful payment on the subscription. Called by the verify route.
--
-- Network + last 4 and a masked VPA only, never a full card number or
-- VPA (they are never stored). Additive and idempotent. Service role only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.billing_refresh_method_summary(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay billing_payments%ROWTYPE;
  v_summary JSONB;
BEGIN
  SELECT * INTO v_pay
    FROM billing_payments
   WHERE subscription_id = p_subscription_id
     AND status IN ('authorized', 'captured', 'refunded')
   ORDER BY COALESCE(provider_created_at, created_at) DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_summary := jsonb_strip_nulls(jsonb_build_object(
    'method', v_pay.method, 'network', v_pay.card_network, 'card_type', v_pay.card_type,
    'last4', v_pay.card_last4, 'issuer', v_pay.card_issuer, 'vpa_masked', v_pay.vpa_masked,
    'bank', v_pay.bank, 'international', v_pay.international
  ));

  UPDATE billing_subscriptions
     SET payment_method = CASE WHEN v_pay.method IN ('card', 'upi', 'emandate', 'nach') THEN v_pay.method ELSE 'unknown' END,
         method_summary = v_summary
   WHERE id = p_subscription_id
     AND method_summary IS DISTINCT FROM v_summary;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_refresh_method_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_refresh_method_summary(UUID) TO service_role;
