-- 078_field_config.sql
-- Add field_key, is_system, and visible columns to custom_fields for manageable standard fields (Email, Company)

ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS field_key TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_custom_fields_account_system
  ON custom_fields(account_id, is_system);
