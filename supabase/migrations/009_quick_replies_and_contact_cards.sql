-- Quick replies and outbound contact-card support.

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_user_id ON quick_replies(user_id);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own quick replies" ON quick_replies;
CREATE POLICY "Users can manage own quick replies" ON quick_replies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON quick_replies TO authenticated;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (
    content_type IN (
      'text',
      'image',
      'document',
      'audio',
      'video',
      'location',
      'template',
      'contact_card'
    )
  );
