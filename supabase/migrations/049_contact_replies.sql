-- Contact replies table to store admin replies sent from the super admin panel
CREATE TABLE IF NOT EXISTS contact_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT DEFAULT 'Super Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_replies_submission ON contact_replies(submission_id);

ALTER TABLE contact_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to contact_replies"
  ON contact_replies FOR ALL
  USING (true)
  WITH CHECK (true);
