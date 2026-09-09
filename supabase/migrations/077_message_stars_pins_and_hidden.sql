-- Migration 077: Message Stars, Pinned Messages & Local Hidden Messages (Phase 7 / TASK-087)

-- 1. Per-user message bookmarks (Starring)
CREATE TABLE IF NOT EXISTS message_stars (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE message_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own starred messages"
  ON message_stars
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_message_stars_user_id ON message_stars(user_id);

-- 2. Conversation pinned message
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Per-user soft-hidden messages ("Delete for me")
CREATE TABLE IF NOT EXISTS message_hidden_users (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE message_hidden_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own hidden messages"
  ON message_hidden_users
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_message_hidden_users_user ON message_hidden_users(user_id);
