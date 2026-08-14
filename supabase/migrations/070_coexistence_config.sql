-- ============================================================
-- WhatsApp Coexistence, part 2 of 2 — the `whatsapp_config` table.
--
-- Two problems this solves.
--
-- FIRST: nothing records HOW a number was onboarded. The browser
-- already knows — it passes `featureType: 'whatsapp_business_app_onboarding'`
-- to Meta and receives a `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`
-- event back — but it forwards only the asset ids to the server, so the
-- distinction is thrown away. Without it the CRM cannot tell an operator
-- their phone is still in the loop, cannot label phone-sent messages
-- confidently, and cannot warn about the coexistence-only rules (open
-- the app every 13 days, profile picture is frozen, no calling API).
--
-- SECOND: a coexistence pairing breaks for at least six different
-- reasons, and Meta reports every one of them as the SAME webhook event
-- (`account_update` / PARTNER_REMOVED) with the real cause buried in
-- `disconnection_info.reason`:
--
--   PRIMARY_INACTIVITY    the business app was not opened for ~13 days
--   COMPANION_INACTIVITY  the linked companion device went idle ~30 days
--   USER_RE_REGISTERED    they re-registered WhatsApp on a new device
--   CHANGE_NUMBER         they changed their phone number
--   BUSINESS_DOWNGRADE    they registered the number on consumer WhatsApp
--   ACCOUNT_DISCONNECTED  enforcement, or they deleted the account
--
-- plus PARTNER_APP_UNINSTALLED when they disconnect from the app's own
-- Settings → Account → Business Platform screen.
--
-- Storing only `status = 'disconnected'` would make all of these look
-- identical, and most are things the operator can actually fix — but
-- only if told which one happened. "Open WhatsApp on your phone" is not
-- a guessable remedy.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  -- 'cloud_api'    — normal API-only number. The phone app is NOT in use.
  -- 'coexistence'  — the same number runs on the WhatsApp Business App
  --                  and the Cloud API together.
  --
  -- Defaults to 'cloud_api' so every existing row keeps today's exact
  -- behaviour: coexistence handling is opt-in per number, and a NULL or
  -- unset value must never be read as "maybe coexistence".
  ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'cloud_api',

  -- When we first had PROOF of coexistence, as opposed to being told at
  -- onboarding. Set on the first smb_message_echoes webhook.
  --
  -- Belt and braces on purpose: onboarding detection depends on the
  -- browser reporting the variation it used, which can be lost to a
  -- popup blocker, a refresh mid-flow, or a number connected through the
  -- legacy manual-credentials form. An echo arriving is unambiguous — no
  -- other setup produces one.
  ADD COLUMN IF NOT EXISTS coexistence_detected_at TIMESTAMPTZ,

  -- The raw Meta event name (PARTNER_REMOVED / PARTNER_APP_UNINSTALLED)
  -- and its reason code, kept verbatim rather than mapped to our own
  -- wording. Meta adds reasons over time, and an unrecognised code we
  -- stored raw can still be looked up; one we normalised into "other"
  -- cannot.
  ADD COLUMN IF NOT EXISTS disconnect_event TEXT,
  ADD COLUMN IF NOT EXISTS disconnect_reason TEXT,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

ALTER TABLE whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_connection_mode_check;

ALTER TABLE whatsapp_config
  ADD CONSTRAINT whatsapp_config_connection_mode_check
  CHECK (connection_mode IN ('cloud_api', 'coexistence'));

-- Supports "which of my numbers are coexistence numbers" — needed by the
-- 13-day inactivity nudge and by support triage. Partial, because the
-- overwhelming majority of rows are plain cloud_api and indexing those
-- would be dead weight.
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_coexistence
  ON whatsapp_config (connection_mode)
  WHERE connection_mode = 'coexistence';

COMMENT ON COLUMN whatsapp_config.connection_mode IS
  'cloud_api = API only. coexistence = the same number also runs on the WhatsApp Business App, so Meta sends smb_message_echoes for phone-sent messages.';
COMMENT ON COLUMN whatsapp_config.coexistence_detected_at IS
  'First time an smb_message_echoes webhook proved this number is in coexistence mode, independent of what onboarding reported.';
COMMENT ON COLUMN whatsapp_config.disconnect_reason IS
  'Meta disconnection_info.reason, verbatim (PRIMARY_INACTIVITY, USER_RE_REGISTERED, CHANGE_NUMBER, ...). Most are operator-fixable, but only if we can name which one happened.';
