-- ============================================================
-- 046_contact_page.sql
-- Contact page CMS table + contact form submissions
-- ============================================================

-- 1. CONTACT PAGE SETTINGS — singleton for dynamic contact page content
CREATE TABLE IF NOT EXISTS contact_page_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hero / Header
  heading TEXT NOT NULL DEFAULT 'Get in Touch',
  subheading TEXT NOT NULL DEFAULT 'Have a question or need help? We''d love to hear from you.',

  -- Contact info cards
  office_address TEXT DEFAULT '123 Business Hub, Mumbai, Maharashtra, India',
  phone_number TEXT DEFAULT '+91 8828891029',
  email_address TEXT DEFAULT 'info@junkiescoder.com',
  working_hours TEXT DEFAULT 'Mon – Fri, 9:00 AM – 6:00 PM IST',

  -- Form section
  form_heading TEXT DEFAULT 'Send us a message',
  form_subheading TEXT DEFAULT 'Fill out the form below and our team will get back to you within 24 hours.',

  -- Map / extra
  map_embed_url TEXT,
  extra_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CONTACT SUBMISSIONS — stores every form inquiry
CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON contact_submissions(created_at DESC);

-- 3. Add contact notification email to site_settings
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS contact_notification_email TEXT DEFAULT 'info@junkiescoder.com';

-- 4. Seed the singleton contact page settings row
INSERT INTO contact_page_settings (
  heading,
  subheading,
  office_address,
  phone_number,
  email_address,
  working_hours,
  form_heading,
  form_subheading
) VALUES (
  'Get in Touch',
  'Have a question, feedback, or need help getting started? We''d love to hear from you. Our team is here to assist you every step of the way.',
  'Junkies Coder, Mumbai, Maharashtra, India',
  '+91 8828891029',
  'info@junkiescoder.com',
  'Mon – Fri, 9:00 AM – 6:00 PM IST',
  'Send us a message',
  'Fill out the form below and our team will get back to you within 24 hours.'
)
ON CONFLICT DO NOTHING;
