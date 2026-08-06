-- ============================================================
-- 052_member_blocked_copy.sql
--
-- Copy for the member-facing "your owner needs to pay" screen.
--
-- Only the account OWNER can purchase a subscription. When a
-- workspace lapses, non-owner members are blocked too — but showing
-- them a pricing page with a payment button they cannot use is a dead
-- end. They get their own screen instead, telling them who to chase.
--
-- Every string lives here rather than in the component so the super
-- admin can reword it (and localise it) without a deploy, matching how
-- the rest of the upgrade flow is managed.
--
-- Template placeholders, substituted by `fillTemplate` in
-- src/lib/subscription/copy.ts. Unknown placeholders are left as-is and
-- ones with no value are dropped, so an operator cannot break the page
-- with a typo:
--   {account_name} — the workspace name
--   {owner_name}   — full name of the account owner
--   {owner_email}  — the owner's email
--   {plan_name}    — last active plan, when there was one
--   {expired_on}   — formatted end date of the lapsed window
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE subscription_settings
  ADD COLUMN IF NOT EXISTS member_blocked_heading TEXT
    NOT NULL DEFAULT 'This workspace needs an active subscription',
  ADD COLUMN IF NOT EXISTS member_blocked_body TEXT,
  ADD COLUMN IF NOT EXISTS member_blocked_note TEXT,
  ADD COLUMN IF NOT EXISTS member_blocked_contact_label TEXT
    NOT NULL DEFAULT 'Email account owner',
  -- When false the owner's name/email are withheld and only the
  -- generic body renders — for operators who would rather members not
  -- see a colleague's address on a shared screen.
  ADD COLUMN IF NOT EXISTS member_blocked_show_owner_contact BOOLEAN
    NOT NULL DEFAULT TRUE;

-- Seed the two nullable bodies only where an operator has not already
-- written their own. COALESCE-style guard keeps a re-run non-destructive.
UPDATE subscription_settings
SET member_blocked_body = COALESCE(
      member_blocked_body,
      'Access to {account_name} is paused because the subscription has ended. '
      || 'Only the workspace owner can renew it. Ask {owner_name} to complete '
      || 'the payment, and your access returns as soon as it is activated.'
    ),
    member_blocked_note = COALESCE(
      member_blocked_note,
      'Your data, conversations, and settings are safe and untouched while access is paused.'
    )
WHERE member_blocked_body IS NULL
   OR member_blocked_note IS NULL;
