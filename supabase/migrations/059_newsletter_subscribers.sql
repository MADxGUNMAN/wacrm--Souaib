-- 059_newsletter_subscribers.sql
-- Newsletter subscriber storage with email verification tracking.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL,

  -- Verification status: pending → confirmed | bounced | unsubscribed
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'bounced', 'unsubscribed')),

  -- Token for email confirmation link (UUID, set on insert)
  confirm_token   UUID DEFAULT uuid_generate_v4(),

  -- Delivery tracking
  email_sent      BOOLEAN NOT NULL DEFAULT false,
  email_sent_at   TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  bounce_reason   TEXT,

  -- Metadata
  ip_address      TEXT,
  user_agent      TEXT,
  source          TEXT DEFAULT 'footer_form',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate emails
  CONSTRAINT newsletter_subscribers_email_unique UNIQUE (email)
);

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_created ON newsletter_subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_token ON newsletter_subscribers(confirm_token);

-- Enable RLS (service-role client bypasses it, but good practice)
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
