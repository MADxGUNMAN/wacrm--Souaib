-- ============================================================
-- Razorpay Subscriptions — settings and admin-editable copy (Phase 1).
--
-- `payment_provider` defaults to 'manual_upi', so applying this changes
-- NOTHING a customer sees. Switching to 'razorpay' (Phase 6/7) is the
-- cutover; switching back is the rollback.
--
-- Copy columns are seeded only where NULL, so a re-run never overwrites
-- an operator's wording. Placeholders are filled server-side:
--   {business} {amount} {days} {first_charge_date} {access_until}
-- Idempotent.
-- ============================================================

ALTER TABLE public.subscription_settings
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'manual_upi',
  ADD COLUMN IF NOT EXISTS autopay_grace_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS razorpay_checkout_name TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_checkout_description TEXT,
  ADD COLUMN IF NOT EXISTS autopay_consent_template TEXT,
  ADD COLUMN IF NOT EXISTS autopay_defer_summary_template TEXT,
  ADD COLUMN IF NOT EXISTS autopay_immediate_summary_template TEXT,
  ADD COLUMN IF NOT EXISTS autopay_cancel_note TEXT;

ALTER TABLE public.subscription_settings
  DROP CONSTRAINT IF EXISTS subscription_settings_payment_provider_check;
ALTER TABLE public.subscription_settings
  ADD CONSTRAINT subscription_settings_payment_provider_check
  CHECK (payment_provider IN ('manual_upi', 'razorpay'));

ALTER TABLE public.subscription_settings
  DROP CONSTRAINT IF EXISTS subscription_settings_autopay_grace_days_check;
ALTER TABLE public.subscription_settings
  ADD CONSTRAINT subscription_settings_autopay_grace_days_check
  CHECK (autopay_grace_days BETWEEN 0 AND 10);

COMMENT ON COLUMN public.subscription_settings.payment_provider IS
  'manual_upi = legacy QR + UTR review flow; razorpay = Razorpay Subscriptions checkout. Webhook processing runs regardless, so access always follows money.';
COMMENT ON COLUMN public.subscription_settings.autopay_grace_days IS
  'D2: days of access kept past the due date while Razorpay is still collecting (authenticated/active/pending). 0 = strict.';

UPDATE public.subscription_settings
   SET razorpay_checkout_name = COALESCE(razorpay_checkout_name, 'Replai'),
       razorpay_checkout_description = COALESCE(razorpay_checkout_description, 'Replai subscription'),
       autopay_consent_template = COALESCE(
         autopay_consent_template,
         'I authorise {business} to charge {amount} every {days} days, starting {first_charge_date}, using the payment method I choose, until I cancel.'
       ),
       autopay_defer_summary_template = COALESCE(
         autopay_defer_summary_template,
         'No charge today. A small card verification is refunded automatically. Your first charge of {amount} is on {first_charge_date}, then every {days} days until you cancel.'
       ),
       autopay_immediate_summary_template = COALESCE(
         autopay_immediate_summary_template,
         'You pay {amount} today for {days} days of access, then {amount} every {days} days until you cancel.'
       ),
       autopay_cancel_note = COALESCE(
         autopay_cancel_note,
         'Cancelling stops future charges. Your access continues until {access_until}. Payments already made are not refunded.'
       );
