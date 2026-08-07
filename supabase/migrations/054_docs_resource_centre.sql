-- ============================================================
-- 054_docs_resource_centre.sql
--
-- Backs the public /docs page — a single resource centre listing every
-- document, guide and link a customer needs. The footer has linked to
-- /docs since the landing page shipped; until now it was a dead link.
--
-- THREE TABLES, mirroring the shapes already used by 041:
--   docs_page_settings  singleton copy for the page chrome
--   docs_categories     ordered groups (position + is_visible)
--   docs_resources      ordered links inside a group
--
-- Legal documents are deliberately NOT duplicated here. They already
-- live in `legal_pages` with their own Super Admin editor, so the page
-- reads that table directly. Copying them would create two places to
-- edit one document and guarantee they drift apart.
--
-- RLS: enabled with ZERO policies, exactly as 053_cms_rls_lockdown.sql
-- established for every other CMS table. Public reads go through the
-- service role in src/lib/cms/queries.ts. Getting this wrong does not
-- error — the page just silently renders nothing.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Page copy (singleton)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS docs_page_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  eyebrow TEXT DEFAULT 'Resource centre',
  heading TEXT NOT NULL DEFAULT 'Everything you need to run Replai',
  subheading TEXT DEFAULT 'Guides, feature walkthroughs, billing details and policies — all in one place.',

  show_search BOOLEAN NOT NULL DEFAULT TRUE,
  search_placeholder TEXT DEFAULT 'Search guides, features and policies…',

  -- Legal block, sourced live from legal_pages.
  show_legal_section BOOLEAN NOT NULL DEFAULT TRUE,
  legal_heading TEXT DEFAULT 'Policies & agreements',
  legal_subheading TEXT DEFAULT 'The legal documents that govern your use of the platform.',

  -- Support block.
  show_support_section BOOLEAN NOT NULL DEFAULT TRUE,
  support_heading TEXT DEFAULT 'Still need a hand?',
  support_body TEXT DEFAULT 'Our team answers every message personally. Tell us what you are trying to do and we will walk you through it.',
  support_cta_text TEXT DEFAULT 'Contact support',
  support_cta_link TEXT DEFAULT '/contact',

  extra_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS docs_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  -- Lucide icon name, resolved through an allowlist map in the
  -- component. An unknown name falls back rather than crashing render.
  icon_name TEXT NOT NULL DEFAULT 'BookOpen',
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_categories_position
  ON docs_categories(position);

-- ------------------------------------------------------------
-- 3. Resources (links)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS docs_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- CASCADE: deleting a category should not leave orphaned links that
  -- no editor screen can reach.
  category_id UUID NOT NULL REFERENCES docs_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  href TEXT NOT NULL DEFAULT '#',
  icon_name TEXT,
  -- Small pill, e.g. "New", "Beta", "Owner only".
  badge_label TEXT,
  is_external BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_resources_category
  ON docs_resources(category_id, position);

-- ------------------------------------------------------------
-- 4. RLS lockdown — matches 053
-- ------------------------------------------------------------
ALTER TABLE docs_page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_resources     ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies. Service-role reads/writes only.

-- ------------------------------------------------------------
-- 5. Seed
--
-- Seeded so the page looks finished the moment it ships rather than
-- presenting an empty shell. Every in-app link below uses a verified
-- route or `?tab=` slug from src/components/settings/settings-sections.ts,
-- so nothing here ships as a broken link.
--
-- Idempotent: guarded on emptiness so a re-run cannot duplicate rows.
-- ------------------------------------------------------------
INSERT INTO docs_page_settings (id)
SELECT uuid_generate_v4()
WHERE NOT EXISTS (SELECT 1 FROM docs_page_settings);

DO $$
DECLARE
  cat_start   UUID;
  cat_meta    UUID;
  cat_inbox   UUID;
  cat_crm     UUID;
  cat_auto    UUID;
  cat_billing UUID;
  cat_dev     UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM docs_categories) THEN
    RETURN;
  END IF;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Getting started',
          'Connect WhatsApp and send your first message.',
          'Rocket', 1)
  RETURNING id INTO cat_start;

  -- Second, ahead of our own feature guides: a customer hits Meta's
  -- pricing and messaging limits long before they need the Developers
  -- section, and being surprised by either is expensive.
  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('WhatsApp & Meta rules',
          'Meta sets the pricing, limits and policies for WhatsApp Business. These are their official documents.',
          'Scale', 2)
  RETURNING id INTO cat_meta;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Messaging & inbox',
          'Day-to-day conversations, templates and saved replies.',
          'MessageSquare', 3)
  RETURNING id INTO cat_inbox;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Contacts & sales',
          'Organise who you talk to and track deals through to close.',
          'Users', 4)
  RETURNING id INTO cat_crm;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Automation & AI',
          'Let Replai reply, follow up and qualify while you sleep.',
          'Zap', 5)
  RETURNING id INTO cat_auto;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Account & billing',
          'Your plan, your team and your workspace settings.',
          'CreditCard', 6)
  RETURNING id INTO cat_billing;

  INSERT INTO docs_categories (title, description, icon_name, position)
  VALUES ('Developers',
          'Drive Replai from your own code or an AI assistant.',
          'Code', 7)
  RETURNING id INTO cat_dev;

  -- ---- Meta's official documents ----
  --
  -- Every URL below was fetched and confirmed to resolve to the expected
  -- page at the time of writing. Two candidates were REJECTED during that
  -- check and are deliberately absent:
  --   * .../guides/how-to-monitor-quality-signals now redirects to the
  --     message_template_status_update webhook reference — Meta retired
  --     the page, so linking it would send customers somewhere useless.
  --   * whatsapp.com/legal/commerce-policy serves the same content as
  --     business-policy, so it would have been a duplicate card.
  -- Re-verify these if this migration is still being used in a year;
  -- Meta reorganises its docs regularly.
  INSERT INTO docs_resources
    (category_id, title, description, href, icon_name, badge_label, is_external, position)
  VALUES
    (cat_meta, 'WhatsApp pricing',
     'Meta charges per delivered template message. Rates depend on the template category and the customer''s country.',
     'https://developers.facebook.com/docs/whatsapp/pricing',
     'CreditCard', 'Read first', TRUE, 1),
    (cat_meta, 'The 24-hour reply window',
     'When a customer messages you, you can reply freely for 24 hours at no charge. After that, only templates.',
     'https://developers.facebook.com/docs/whatsapp/conversation-types',
     'MessageSquare', NULL, TRUE, 2),
    (cat_meta, 'Template rules & categories',
     'Marketing, utility or authentication — the category decides what you pay and whether it gets approved.',
     'https://developers.facebook.com/docs/whatsapp/message-templates/guidelines',
     'FileText', NULL, TRUE, 3),
    (cat_meta, 'Messaging limits',
     'How many new customers you may message in 24 hours, and how Meta raises that limit.',
     'https://developers.facebook.com/docs/whatsapp/api/rate-limits',
     'Gauge', NULL, TRUE, 4),
    (cat_meta, 'Number status & quality rating',
     'What Connected, Flagged and Restricted mean, and how your quality rating is scored.',
     'https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers',
     'Shield', NULL, TRUE, 5),
    (cat_meta, 'Business account limits',
     'Template caps, how many numbers you can register, and business verification status.',
     'https://developers.facebook.com/docs/whatsapp/overview/business-accounts',
     'BadgeCheck', NULL, TRUE, 6),
    (cat_meta, 'Business Messaging Policy',
     'Meta''s rules on opt-in, spam and prohibited content. Breaking these can suspend your number.',
     'https://www.whatsapp.com/legal/business-policy',
     'Scale', 'Important', TRUE, 7);

  INSERT INTO docs_resources
    (category_id, title, description, href, icon_name, badge_label, position)
  VALUES
    -- Getting started
    (cat_start, 'Connect WhatsApp Business',
     'Link your number, verify it and go live. Start here.',
     '/settings?tab=whatsapp-setup', 'Smartphone', 'Start here', 1),
    (cat_start, 'Sending limits & quality',
     'How many customers you can message per day, and how to raise it.',
     '/settings?tab=whatsapp-setup', 'Gauge', NULL, 2),
    (cat_start, 'Your dashboard',
     'A live view of conversations, deals and team activity.',
     '/dashboard', 'LayoutGrid', NULL, 3),

    -- Messaging & inbox
    (cat_inbox, 'Shared team inbox',
     'Assign chats, reply together and keep every thread in one place.',
     '/inbox', 'Inbox', NULL, 1),
    (cat_inbox, 'Message templates',
     'Create and submit the approved templates WhatsApp requires.',
     '/settings?tab=templates', 'FileText', NULL, 2),
    (cat_inbox, 'Quick replies',
     'Save the answers you type most and insert them in a keystroke.',
     '/settings?tab=quick-replies', 'Zap', NULL, 3),
    (cat_inbox, 'Broadcasts',
     'Send an approved template to a segment and track delivery.',
     '/broadcasts', 'Megaphone', NULL, 4),

    -- Contacts & sales
    (cat_crm, 'Contacts',
     'Import, tag and segment everyone you talk to.',
     '/contacts', 'Users', NULL, 1),
    (cat_crm, 'Custom fields & tags',
     'Model the data your business actually cares about.',
     '/settings?tab=fields', 'Tags', NULL, 2),
    (cat_crm, 'Pipelines & deals',
     'Move conversations through your sales stages.',
     '/pipelines', 'KanbanSquare', NULL, 3),
    (cat_crm, 'Deals & currency',
     'Set your currency and deal defaults.',
     '/settings?tab=deals', 'Coins', NULL, 4),

    -- Automation & AI
    (cat_auto, 'Automations',
     'Trigger replies and follow-ups from keywords and events.',
     '/automations', 'Workflow', NULL, 1),
    (cat_auto, 'Flows',
     'Build multi-step conversations with buttons and branches.',
     '/flows', 'GitBranch', 'Beta', 2),
    (cat_auto, 'AI agents',
     'Bring your own OpenAI or Anthropic key and let AI draft replies.',
     '/agents', 'Bot', NULL, 3),

    -- Account & billing
    (cat_billing, 'Billing & plan',
     'See your plan, renewal date and payment history.',
     '/settings?tab=billing', 'CreditCard', 'Owner only', 1),
    (cat_billing, 'Upgrade or renew',
     'Choose a plan and pay by UPI. Activated after verification.',
     '/upgrade-plan', 'BadgeCheck', NULL, 2),
    (cat_billing, 'Team members',
     'Invite colleagues and manage what they can access.',
     '/settings?tab=members', 'UsersRound', NULL, 3),
    (cat_billing, 'Your profile & security',
     'Update your details and turn on two-factor authentication.',
     '/settings?tab=security', 'Shield', NULL, 4),

    -- Developers
    (cat_dev, 'API keys',
     'Create scoped keys to drive Replai from your own scripts.',
     '/settings?tab=api', 'KeyRound', NULL, 1),
    -- The public API reference lives at docs/public-api.md in the repo,
    -- which is NOT served over HTTP, so there is no correct URL to seed
    -- here. Deliberately omitted rather than guessed: an earlier guess at
    -- a GitHub path shipped a 404 to customers. Add it from Super Admin →
    -- CMS → Docs & Resources once the doc is published somewhere public.
    (cat_dev, 'MCP server',
     'Run your CRM from Claude, Cursor or any MCP client.',
     'https://www.npmjs.com/package/wacrm-mcp', 'Terminal', NULL, 2);

  -- Off-site links get the external-link affordance and a new tab.
  UPDATE docs_resources
     SET is_external = TRUE
   WHERE category_id = cat_dev
     AND href LIKE 'http%';
END $$;
