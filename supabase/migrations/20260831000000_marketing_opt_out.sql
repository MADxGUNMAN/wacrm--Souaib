-- ============================================================
-- 20260831000000_marketing_opt_out
--
-- Gives customers a way out of marketing messages, and makes that way
-- out binding.
--
-- WHY THIS EXISTS
--
-- Customers who cannot leave politely block the business instead. Blocks
-- feed Meta's quality rating, and a falling rating is what gets a number
-- restricted from opening new conversations. So this is account-health
-- infrastructure, not a courtesy feature.
--
-- Three things are added:
--   1. opt_in_out_configs   — per-account keywords + reply wording
--   2. marketing_opt_outs   — the suppression list itself
--   3. broadcast_recipients.status gains 'skipped'
--
-- DESIGN DECISIONS WORTH KEEPING
--
-- Suppression is keyed on (account_id, phone_normalized), NOT on a flag
-- on `contacts`. Two reasons, both load-bearing:
--
--   * /api/whatsapp/broadcast receives bare phone numbers and never
--     reads `contacts` at all. A phone-keyed table answers it with one
--     batched query rather than a new phone-to-contact resolution step.
--
--   * Opt-outs must survive contact deletion and CSV re-import. Every
--     CSV broadcast calls upsertCsvContacts, which inserts missing
--     contacts — so a column on `contacts` would let a re-upload
--     silently resurrect consent. That is the exact failure this
--     migration exists to prevent.
--
-- `contact_id` is kept for audit only, ON DELETE SET NULL. The phone is
-- the identity; the contact row is a convenience.
--
-- is_active gates CAPTURE, not ENFORCEMENT. Turning the feature off
-- stops watching for keywords; it does NOT release contacts who already
-- opted out. Consent was withdrawn, and a settings toggle is not consent
-- to resume. Nothing in the enforcement path reads is_active.
--
-- Only 'Marketing' templates are suppressed. Utility and Authentication
-- keep flowing — Meta's own copy for error 131050 says utility may still
-- be allowed, and blanket suppression would break order updates and OTPs.
--
-- Idempotent — safe to run multiple times. Written without reliance on a
-- surrounding transaction, because docker/supabase/migrate.sh applies
-- each file with autocommit per statement.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Per-account opt-in / opt-out configuration.
--
-- One row per account, mirroring ai_configs (migration 029): account_id
-- is UNIQUE, reads are open to any member, writes are OWNER-only.
--
-- Defaults are deliberately usable as-is. An account that never opens
-- Settings still honours "STOP", because the alternative — no opt-out
-- path unless someone configures one — is the same silent hole as a
-- missing permission defaulting to ALLOW.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opt_in_out_configs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Whether inbound keywords are WATCHED. See the header: this does not
  -- gate enforcement of opt-outs already recorded.
  is_active                boolean NOT NULL DEFAULT true,

  -- Stored UPPERCASE and matched case-insensitively. Uppercasing is done
  -- in TypeScript (normalizeKeyword in
  -- src/lib/whatsapp/marketing-opt-out.ts) because a CHECK constraint
  -- cannot contain the subquery an array-wide upper() test would need.
  opt_out_keywords         text[] NOT NULL DEFAULT ARRAY['STOP'],
  opt_in_keywords          text[] NOT NULL DEFAULT ARRAY['START'],

  opt_out_response_message text NOT NULL
    DEFAULT 'You have been opted out. Reply START to opt in again.',
  opt_in_response_message  text NOT NULL
    DEFAULT 'Thank you for opting in to our messages. Reply STOP to opt out at any time.',

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- At least one opt-out keyword, always. Removing the last one would
  -- leave customers with no way to leave, which is the problem this
  -- table solves. To switch the feature off, use is_active.
  --
  -- opt_in_keywords may legitimately be empty: a business can accept
  -- opt-outs without offering keyword re-subscription.
  CONSTRAINT opt_in_out_configs_opt_out_keywords_present
    CHECK (array_length(opt_out_keywords, 1) >= 1)
);

COMMENT ON TABLE opt_in_out_configs IS
  'Per-account opt-in/opt-out keyword lists and reply wording. One row per account; defaults are usable as-is so an unconfigured account still honours STOP.';
COMMENT ON COLUMN opt_in_out_configs.is_active IS
  'Whether inbound keywords are watched. Does NOT gate enforcement — contacts already on marketing_opt_outs stay suppressed regardless, because withdrawn consent is not restored by a settings toggle.';
COMMENT ON COLUMN opt_in_out_configs.opt_out_keywords IS
  'UPPERCASE keywords that opt a customer out. Matched against the whole trimmed message, case-insensitively — never as a substring, so "stop by tomorrow" does not opt anyone out. See matchesKeyword() in src/lib/whatsapp/marketing-opt-out.ts.';
COMMENT ON COLUMN opt_in_out_configs.opt_in_keywords IS
  'UPPERCASE keywords that re-subscribe a customer. May be empty: accepting opt-outs without offering keyword re-subscription is a valid configuration.';
COMMENT ON COLUMN opt_in_out_configs.opt_out_response_message IS
  'Confirmation sent after a successful opt-out. Delivered inside the 24-hour window, which is open by definition because the customer just messaged.';

ALTER TABLE opt_in_out_configs ENABLE ROW LEVEL SECURITY;

-- SELECT: any member (viewer+) — the inbox and broadcast wizard need to
-- know the keywords to explain suppression in the UI.
DROP POLICY IF EXISTS opt_in_out_configs_select ON opt_in_out_configs;
CREATE POLICY opt_in_out_configs_select ON opt_in_out_configs FOR SELECT
  USING (is_account_member(account_id));

-- Writes: OWNER only.
--
-- Deliberately 'owner' and NOT the legacy 'admin' tier. Migration 038
-- (role simplification) rewrote is_account_member's rank table to
-- owner=2, member=1, with the legacy admin/agent/viewer values all
-- collapsed to 1 — so `is_account_member(account_id, 'admin')` now
-- evaluates true for an ordinary member. Using 'admin' here would let any
-- member disable the opt-out keywords or rewrite the confirmation text,
-- which is a compliance control, not day-to-day inbox work.
--
-- Same tier as usage_alerts (migration 079) for the same reason: a member
-- who can switch off the safeguard makes the safeguard pointless.
DROP POLICY IF EXISTS opt_in_out_configs_write ON opt_in_out_configs;
CREATE POLICY opt_in_out_configs_write ON opt_in_out_configs FOR ALL
  USING (is_account_member(account_id, 'owner'))
  WITH CHECK (is_account_member(account_id, 'owner'));

CREATE OR REPLACE FUNCTION public.update_opt_in_out_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

ALTER FUNCTION public.update_opt_in_out_configs_updated_at() OWNER TO postgres;

DROP TRIGGER IF EXISTS opt_in_out_configs_updated_at ON opt_in_out_configs;
CREATE TRIGGER opt_in_out_configs_updated_at
  BEFORE UPDATE ON opt_in_out_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_opt_in_out_configs_updated_at();


-- ------------------------------------------------------------
-- 2. The suppression list.
--
-- Presence of a row means: do not send this account's MARKETING
-- templates to this number. Absence means no recorded objection.
--
-- The UNIQUE index is the idempotency key: every writer claim-inserts
-- with ON CONFLICT DO NOTHING rather than read-then-decide, so two
-- concurrent STOPs (Meta redelivery, or a keyword and a button tap in
-- the same second) cannot produce duplicate rows or a lost write.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_opt_outs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Digits-only phone. Mirrors the generated contacts.phone_normalized
  -- column (migration 022) and normalizePhone() in
  -- src/lib/whatsapp/phone-utils.ts. NOT a display number: no '+',
  -- spaces or punctuation, so lookups cannot miss on formatting.
  phone_normalized text NOT NULL,

  -- Audit convenience only, and nullable on purpose. The phone is the
  -- identity — see the header note on surviving contact deletion.
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,

  source           text NOT NULL CHECK (source IN (
                     'customer_keyword',  -- replied STOP (or configured word)
                     'customer_button',   -- tapped a STOP quick-reply button
                     'meta_131050',       -- Meta told us on a send attempt
                     'agent',             -- recorded by a human in the CRM
                     'api',               -- recorded through the public API
                     'import'             -- bulk-loaded suppression list
                   )),

  opted_out_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketing_opt_outs_phone_normalized_not_blank
    CHECK (phone_normalized <> '')
);

COMMENT ON TABLE marketing_opt_outs IS
  'Suppression list. A row means this account must not send MARKETING templates to this number. Utility and Authentication templates are unaffected.';
COMMENT ON COLUMN marketing_opt_outs.phone_normalized IS
  'Digits-only phone, mirroring contacts.phone_normalized (migration 022) and normalizePhone(). It is the identity for suppression — deliberately not contact_id, so an opt-out survives contact deletion and CSV re-import.';
COMMENT ON COLUMN marketing_opt_outs.contact_id IS
  'Audit convenience, nullable, ON DELETE SET NULL. Never the lookup key: a deleted-and-reimported contact gets a new id but keeps the same number.';
COMMENT ON COLUMN marketing_opt_outs.source IS
  'How the opt-out was recorded. meta_131050 is Meta reporting on a send attempt that the customer had already opted out at the platform level.';

-- Idempotency key AND the read path. filterOptedOutPhones() queries
-- (account_id, phone_normalized IN (...)) for a whole broadcast batch in
-- one round trip, which this index serves directly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_opt_outs_account_phone
  ON marketing_opt_outs (account_id, phone_normalized);

COMMENT ON INDEX idx_marketing_opt_outs_account_phone IS
  'Claim-insert idempotency key and the batched suppression lookup. Per-account: one tenant''s opt-out must never suppress another''s send.';

-- Serves the contact-detail badge ("this contact unsubscribed").
CREATE INDEX IF NOT EXISTS idx_marketing_opt_outs_contact
  ON marketing_opt_outs (contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE marketing_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_opt_outs_select ON marketing_opt_outs;
CREATE POLICY marketing_opt_outs_select ON marketing_opt_outs FOR SELECT
  USING (is_account_member(account_id));

-- agent+ to write: re-subscribing a contact who asked in conversation is
-- ordinary inbox work, not a settings change. The webhook and the send
-- paths use the service role and bypass RLS entirely — which is exactly
-- why enforcement is also checked in TypeScript rather than left to RLS.
DROP POLICY IF EXISTS marketing_opt_outs_write ON marketing_opt_outs;
CREATE POLICY marketing_opt_outs_write ON marketing_opt_outs FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));


-- ------------------------------------------------------------
-- 3. broadcast_recipients.status gains 'skipped'.
--
-- A suppressed recipient is not a failure. Recording it as 'failed'
-- would inflate failed_count and make a compliant send look like a
-- broken one.
--
-- Safe with the existing aggregate trigger: broadcast_recipient_aggregate
-- (migrations 003 / 005) re-counts with COUNT(*) FILTER (WHERE status IN
-- (...)) over explicit status lists, so 'skipped' increments neither
-- sent_count nor failed_count. It lands in no bucket, which is the
-- intent — total_recipients minus the counted buckets is the skipped
-- remainder, and the UI can show it as such.
--
-- Inline CHECKs get an auto-generated name; 001 created this one as
-- broadcast_recipients_status_check.
-- ------------------------------------------------------------
ALTER TABLE broadcast_recipients
  DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (status IN (
    'pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped'
  ));

COMMENT ON COLUMN broadcast_recipients.status IS
  'Delivery state. ''skipped'' means suppressed before sending (marketing opt-out) — deliberately counted in neither sent_count nor failed_count by the aggregate trigger, because a respected opt-out is not a delivery failure.';
