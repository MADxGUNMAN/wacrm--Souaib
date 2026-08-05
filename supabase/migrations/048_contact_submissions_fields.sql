-- ============================================================
-- 048_contact_submissions_fields.sql
-- Add phone and company columns to contact_submissions
-- ============================================================

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT;
