-- ============================================================
-- Migration 076: Message Types Widening and Metadata Attributes
-- Parity Plan Phase 0 Foundation
-- ============================================================

-- 1. content_type widening: Drop and re-add CHECK constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text',
    'image',
    'document',
    'audio',
    'video',
    'location',
    'template',
    'interactive',
    'sticker',     -- dedicated render without bubble chrome
    'contacts',    -- contact cards (in and out)
    'unsupported'  -- poll / live location / view once: structured placeholder
  ));

-- 2. Location columns (structured coordinates)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_name    TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS location_address TEXT;

-- 3. Contact cards: raw contacts array payload
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contacts_payload JSONB;

-- 4. Per-status lifecycle timestamps
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- 5. Media metadata
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_filename  TEXT;

-- 6. Forward provenance tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID
  REFERENCES messages(id) ON DELETE SET NULL;
