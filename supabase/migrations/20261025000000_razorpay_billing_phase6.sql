-- ============================================================
-- Razorpay billing, Phase 6: existing-customer transition and manual-flow
-- retirement (docs/razopay/razorpay-subscriptions-plan.md section 15,
-- item F11).
--
-- Additive and idempotent. The only change is ONE new row in
-- `legal_pages`: a DRAFT Refund and Cancellation Policy, inserted with
-- is_published = false so nothing appears on the public site, in the
-- footer or in the sitemap. A super admin reviews it and publishes it
-- from Super-admin -> CMS -> Legal. ON CONFLICT (slug) DO NOTHING means a
-- re-run never overwrites a page somebody has since edited or published.
--
-- No functions, no schema changes, no UPDATE or DELETE of any row.
-- ============================================================

INSERT INTO public.legal_pages (slug, title, content_markdown, is_published)
VALUES (
  'refund-and-cancellation-policy',
  'Refund and Cancellation Policy',
  $refund$> **Draft for review.** Check every section, then remove this note and publish. [confirm contact] The contact address below is the one used in our Terms of Service; confirm it is right for billing questions.

Last updated: on publication

## Who we are

Replai is operated by Junkies Coder. This policy explains how AutoPay subscriptions are charged, how to cancel them, and when we refund a payment.

## Plans and AutoPay

Paid plans renew automatically through Razorpay AutoPay. You choose a term (every 30 days or every 360 days) and you are charged the price of that term at the start of each one until you cancel.

You can pay with a card or with UPI AutoPay. When you set up AutoPay with a card, your bank may run a small verification charge of ₹5. It is refunded automatically and does not count as a payment for your plan.

## When the first charge happens

If you already have access when you set up AutoPay, for example during a free trial or a period you have already paid for, nothing is charged until that access ends. Your first AutoPay charge is on the day your current access ends, so you never pay twice for the same days.

## How to cancel

The workspace owner can cancel at any time from **Settings -> Billing -> Cancel AutoPay**. A UPI AutoPay can also be cancelled from your UPI app. Only the workspace owner can cancel or change billing.

## When access ends after cancelling

Cancelling stops future charges. You keep access until the end of the period you have already paid for, and no further charges are made after that.

If you cancel before your first AutoPay charge, AutoPay ends immediately and nothing is charged. A free trial you are on continues until its normal end date.

## Refunds

We do not give pro-rated refunds for a partly used period.

If we agree to refund a payment, the refund is made through Razorpay to the original payment method.

A full refund of a payment removes the access that payment bought and cancels AutoPay. A partial refund does not change your access.

If you raise a dispute or chargeback with your bank and it is decided in your favour, it has the same effect as a full refund.

## Failed payments

If an AutoPay charge fails, Razorpay retries it automatically. Your access continues for up to 3 days while it retries. If the retries do not succeed, the subscription stops and you can set up AutoPay again from the Upgrade plan page.

## Earlier manual UPI payments

Payments you made earlier by manual UPI transfer are not affected by this policy change. They remain in your billing history in Settings -> Billing.

## Contact

For billing questions, write to legal@junkiescoder.com with your workspace name and, if you have one, the Razorpay payment ID.
$refund$,
  false
)
ON CONFLICT (slug) DO NOTHING;
