-- ============================================================
-- Mirror the connected number's WhatsApp business profile picture.
--
-- WHAT META ACTUALLY GIVES US
-- `/{phone-number-id}/whatsapp_business_profile?fields=profile_picture_url`
-- returns the avatar customers see when they tap the business name in a
-- chat. This is the ONLY WhatsApp profile picture obtainable through the
-- Cloud API — there is no equivalent for customers. Verified against the
-- live API: the business profile call returns a real pps.whatsapp.net URL,
-- while `/{wa_id}/picture` fails with "Tried accessing nonexisting field".
--
-- WHY WE STORE OUR OWN URL AND NOT META'S
-- Meta's URL is signed and short-lived. The one measured while building
-- this carried `oe=6A915F10`, which decodes to 28 Aug 2026 — three days
-- out. Persisting it would give every workspace a broken image a few days
-- after connecting, and the breakage would appear long after the change
-- that caused it, which is the hardest kind to attribute.
--
-- So the bytes are copied into our own S3 bucket on sync and
-- `business_profile_picture_url` holds OUR permanent URL.
-- `business_profile_synced_at` records when we last copied, so a refresh
-- can be rate-limited and the UI can say how current it is.
--
-- `business_about` rides along because it comes back in the same request
-- for free, and the setup card can show the tagline customers see.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS business_profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS business_about TEXT,
  ADD COLUMN IF NOT EXISTS business_profile_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_config.business_profile_picture_url IS
  'Our S3 URL for a mirrored copy of the WhatsApp business avatar. NOT Meta''s URL — that one is signed and expires in days.';

COMMENT ON COLUMN whatsapp_config.business_about IS
  'The business profile About text, as customers see it. Fetched alongside the picture.';

COMMENT ON COLUMN whatsapp_config.business_profile_synced_at IS
  'When the profile was last copied from Meta. Drives refresh rate limiting.';
