-- ============================================================
-- Stop inbound messages overwriting a name an operator chose.
--
-- THE BUG
-- `findOrCreateContact` in the WhatsApp webhook did, on every inbound
-- message:
--
--   if (name && name !== existingContact.name) update({ name })
--
-- where `name` is `contacts[0].profile.name` — the sender's own WhatsApp
-- profile name. So a contact renamed to "Souaib Ansari" in the CRM reverted
-- to "Souaib" the next time they replied. The edit survived until the next
-- message and no further.
--
-- A guard for precisely this already existed (`betterContactName`), but only
-- the Coexistence address-book import used it. The live message path, which
-- runs orders of magnitude more often, did not.
--
-- THE FIX
-- Keep the two names apart, the way WhatsApp itself does:
--
--   contacts.name             the saved name. Operator-owned. Auto-filled
--                             only while nobody has set it.
--   contacts.wa_profile_name  their WhatsApp profile name, refreshed from
--                             every inbound message. Display only — shown as
--                             "Souaib Ansari ~Souaib" in the thread header
--                             and contact sidebar, and never used for
--                             matching, dedupe or search authority.
--
-- WHY NO `name_is_custom` FLAG
-- Storing the profile name makes a flag unnecessary. The webhook may advance
-- `name` in exactly two situations: there is no real name yet, or the saved
-- name is identical to the profile name we last recorded (meaning we
-- auto-filled it and nobody has since edited it). The instant an operator
-- types something different, the second condition stops matching and the
-- name is protected permanently. One column instead of two, and no flag that
-- can fall out of sync with reality.
--
-- DELIBERATELY NOT BACKFILLED
-- Every existing row keeps `wa_profile_name` NULL, so the "we auto-filled
-- it" condition cannot match and every name currently in the database is
-- protected. Backfilling `wa_profile_name = name` would be a guess about
-- which names came from WhatsApp versus a person, and guessing wrong
-- re-creates the reported bug for those contacts. The column fills itself
-- from the next inbound message per contact, which costs nothing and cannot
-- be wrong.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS wa_profile_name TEXT;

COMMENT ON COLUMN contacts.wa_profile_name IS
  'The contact''s own WhatsApp profile name, refreshed from contacts[0].profile.name on each inbound message. DISPLAY ONLY — rendered as the "~Name" suffix beside the saved name in the thread header and contact sidebar. Never authoritative: contacts.name is what the operator owns. Also the marker that lets the webhook tell an auto-filled name from an edited one, which is why there is no name_is_custom flag. NULL on rows that predate migration 20260917160000; it fills in on the contact''s next message.';
