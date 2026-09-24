-- ============================================================
-- Google Sheets add-on: Help & Support content + issue reports.
--
-- Three tables behind one add-on dialog:
--
--   sheets_addon_help_settings  singleton, every heading and block of
--                               copy the dialog renders
--   sheets_addon_help_links     rows, the Get Support / Resources buttons
--   sheets_addon_issue_reports  rows, reports submitted from the dialog
--
-- WHY EVERY STRING LIVES HERE AND NOWHERE ELSE
-- The add-on ships no fallback copy. A hardcoded default in Apps Script
-- would silently win over whatever an operator types in Super Admin, and
-- there is no way to tell from the rendered dialog which of the two you
-- are looking at — so the panel would appear broken while being correct.
-- Consequence: these tables must never be empty, which is why every
-- text column is NOT NULL DEFAULT '' and why this migration seeds real
-- values rather than leaving the operator a blank form.
--
-- An empty string is meaningful, not missing: the dialog hides a section
-- whose heading is blank, and the API omits links with a blank URL, so a
-- half-filled row can never render as a dead button.
--
-- WHY LINKS ARE ROWS AND NOT MORE COLUMNS
-- The support and resource lists are expected to change — add a demo
-- booking link, drop one, reorder them — and none of that should need a
-- migration or a deploy.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dialog copy (singleton)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheets_addon_help_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Modal header
  dialog_title            TEXT NOT NULL DEFAULT '',
  dialog_subtitle         TEXT NOT NULL DEFAULT '',

  -- Section headings for the two link lists
  support_heading         TEXT NOT NULL DEFAULT '',
  resources_heading       TEXT NOT NULL DEFAULT '',

  -- The two actions that used to sit loose in the Extensions menu
  maintenance_heading     TEXT NOT NULL DEFAULT '',
  maintenance_description TEXT NOT NULL DEFAULT '',
  reinstall_label         TEXT NOT NULL DEFAULT '',
  reinstall_description   TEXT NOT NULL DEFAULT '',
  disconnect_label        TEXT NOT NULL DEFAULT '',
  disconnect_description  TEXT NOT NULL DEFAULT '',

  -- Danger card
  reset_heading           TEXT NOT NULL DEFAULT '',
  reset_description       TEXT NOT NULL DEFAULT '',
  reset_button_label      TEXT NOT NULL DEFAULT '',
  reset_confirm_label     TEXT NOT NULL DEFAULT '',

  -- Report form
  report_heading          TEXT NOT NULL DEFAULT '',
  report_intro            TEXT NOT NULL DEFAULT '',
  report_placeholder      TEXT NOT NULL DEFAULT '',
  report_button_label     TEXT NOT NULL DEFAULT '',
  report_success_message  TEXT NOT NULL DEFAULT '',

  -- Footer link
  footer_text             TEXT NOT NULL DEFAULT '',
  footer_url              TEXT NOT NULL DEFAULT '',

  -- Whole-section kill switches. Separate from blanking the copy so an
  -- operator can take a section down and put it back without retyping it.
  is_report_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  is_reset_enabled        BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce the singleton in the database rather than trusting every
-- caller to `LIMIT 1`. A second INSERT fails loudly instead of creating
-- a shadow row that some queries would read and others would not.
CREATE UNIQUE INDEX IF NOT EXISTS sheets_addon_help_settings_singleton
  ON public.sheets_addon_help_settings ((TRUE));

COMMENT ON TABLE public.sheets_addon_help_settings IS
  'Singleton. Every heading and block of copy rendered by the Google Sheets add-on Help & Support dialog. The add-on ships no fallback strings, so this row is the only source of that text and must never be empty.';
COMMENT ON COLUMN public.sheets_addon_help_settings.is_report_enabled IS
  'FALSE hides the whole Report Issue section in the add-on dialog without discarding its copy.';
COMMENT ON COLUMN public.sheets_addon_help_settings.is_reset_enabled IS
  'FALSE hides the Reset Configuration card. Use to withdraw a destructive action without a deploy.';
COMMENT ON COLUMN public.sheets_addon_help_settings.reset_confirm_label IS
  'Second-step label for the arm/confirm reset. The add-on appends the live rule count, so write this as a verb phrase (e.g. "Yes, delete everything").';

-- ------------------------------------------------------------
-- 2. Support + resource links
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheets_addon_help_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  section     TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',

  -- Constrained to a small named set the dialog knows how to draw. An
  -- arbitrary string would render as a missing glyph in the add-on,
  -- which has no icon library and inlines its SVGs.
  icon        TEXT NOT NULL DEFAULT 'link',

  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Postgres cannot ALTER a CHECK, so both are drop-then-add to stay
-- re-runnable.
ALTER TABLE public.sheets_addon_help_links
  DROP CONSTRAINT IF EXISTS sheets_addon_help_links_section_check;
ALTER TABLE public.sheets_addon_help_links
  ADD CONSTRAINT sheets_addon_help_links_section_check
  CHECK (section IN ('support', 'resources'));

ALTER TABLE public.sheets_addon_help_links
  DROP CONSTRAINT IF EXISTS sheets_addon_help_links_icon_check;
ALTER TABLE public.sheets_addon_help_links
  ADD CONSTRAINT sheets_addon_help_links_icon_check
  CHECK (icon IN ('whatsapp', 'mail', 'calendar', 'book', 'globe', 'link'));

CREATE INDEX IF NOT EXISTS sheets_addon_help_links_section_order_idx
  ON public.sheets_addon_help_links (section, sort_order, created_at);

COMMENT ON TABLE public.sheets_addon_help_links IS
  'Buttons under Get Support and Resources in the add-on Help & Support dialog. Rows rather than columns so the list can be extended, reordered or disabled without a migration.';
COMMENT ON COLUMN public.sheets_addon_help_links.url IS
  'https://, mailto: or https://wa.me/ target. A blank value is treated as unconfigured and the API omits the row, so an enabled-but-unset link can never render as a dead button.';
COMMENT ON COLUMN public.sheets_addon_help_links.icon IS
  'One of a fixed set the add-on has inline SVG for. Not free text: the dialog has no icon library and an unknown name would draw nothing.';

-- ------------------------------------------------------------
-- 3. Issue reports
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheets_addon_issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message TEXT NOT NULL,

  -- Google account the add-on was running as. The only reliable way to
  -- reply, since the dialog is reachable with no Replai key at all.
  reporter_email TEXT,

  -- Set only when the submission carried a valid API key. NULL means
  -- "we could not tell which account this was" — the expected state for
  -- a report filed because setup itself failed. ON DELETE SET NULL so
  -- closing an account never destroys its support history.
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  -- Denormalised on purpose: keeps the row readable after the account
  -- above is deleted and the reference goes NULL.
  account_name TEXT,

  spreadsheet_id   TEXT,
  spreadsheet_name TEXT,
  addon_version    TEXT,

  status     TEXT NOT NULL DEFAULT 'new',
  -- Operator-only. Never returned by any public endpoint.
  admin_note TEXT,

  -- Abuse triage for an unauthenticated write, not analytics.
  ip_address TEXT,
  user_agent TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.sheets_addon_issue_reports
  DROP CONSTRAINT IF EXISTS sheets_addon_issue_reports_status_check;
ALTER TABLE public.sheets_addon_issue_reports
  ADD CONSTRAINT sheets_addon_issue_reports_status_check
  CHECK (status IN ('new', 'in_progress', 'resolved', 'closed'));

-- The inbox is always "newest first, optionally filtered by status".
CREATE INDEX IF NOT EXISTS sheets_addon_issue_reports_status_created_idx
  ON public.sheets_addon_issue_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sheets_addon_issue_reports_created_idx
  ON public.sheets_addon_issue_reports (created_at DESC);
-- Supports the per-IP hourly rate limit count on the public POST.
CREATE INDEX IF NOT EXISTS sheets_addon_issue_reports_ip_created_idx
  ON public.sheets_addon_issue_reports (ip_address, created_at DESC);

COMMENT ON TABLE public.sheets_addon_issue_reports IS
  'Issue reports submitted from the Google Sheets add-on Help & Support dialog. Written by an UNAUTHENTICATED public endpoint (the dialog must work for a user whose API key is the thing that is broken), so the endpoint rate-limits per IP and caps message length.';
COMMENT ON COLUMN public.sheets_addon_issue_reports.account_id IS
  'NULL when the submission carried no valid API key. Expected, not an error: a user who cannot connect their key still needs to reach support.';
COMMENT ON COLUMN public.sheets_addon_issue_reports.admin_note IS
  'Internal operator note. Never exposed by a public endpoint and never shown to the reporter.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Reads and writes all go through the service-role client, which bypasses
-- RLS — so these policies are not what makes the feature work. They are
-- the backstop that keeps the tables closed if a browser-side client ever
-- reaches them: with RLS on and no permissive policy, the default is deny.
--
-- `TO authenticated` is deliberate on the super-admin policies. EXECUTE on
-- is_super_admin_user() is revoked from `anon`, so an unrestricted policy
-- would make an anonymous read fail with "permission denied for function"
-- instead of simply returning no rows.
ALTER TABLE public.sheets_addon_help_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_addon_help_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_addon_issue_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sheets_addon_help_settings_all_super_admin
  ON public.sheets_addon_help_settings;
CREATE POLICY sheets_addon_help_settings_all_super_admin
  ON public.sheets_addon_help_settings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin_user())
  WITH CHECK (public.is_super_admin_user());

DROP POLICY IF EXISTS sheets_addon_help_links_all_super_admin
  ON public.sheets_addon_help_links;
CREATE POLICY sheets_addon_help_links_all_super_admin
  ON public.sheets_addon_help_links
  FOR ALL
  TO authenticated
  USING (public.is_super_admin_user())
  WITH CHECK (public.is_super_admin_user());

DROP POLICY IF EXISTS sheets_addon_issue_reports_all_super_admin
  ON public.sheets_addon_issue_reports;
CREATE POLICY sheets_addon_issue_reports_all_super_admin
  ON public.sheets_addon_issue_reports
  FOR ALL
  TO authenticated
  USING (public.is_super_admin_user())
  WITH CHECK (public.is_super_admin_user());

COMMENT ON POLICY sheets_addon_issue_reports_all_super_admin
  ON public.sheets_addon_issue_reports IS
  'Operators only. Reports carry a reporter email address and free-text that may contain personal data, so there is deliberately no member-level or anonymous read path.';

-- ------------------------------------------------------------
-- Seed
-- ------------------------------------------------------------
-- Real copy, not placeholders: the add-on has no fallback text, so an
-- unseeded install would render an empty dialog. Operators edit from here
-- rather than starting from a blank form.
INSERT INTO public.sheets_addon_help_settings (
  dialog_title,
  dialog_subtitle,
  support_heading,
  resources_heading,
  maintenance_heading,
  maintenance_description,
  reinstall_label,
  reinstall_description,
  disconnect_label,
  disconnect_description,
  reset_heading,
  reset_description,
  reset_button_label,
  reset_confirm_label,
  report_heading,
  report_intro,
  report_placeholder,
  report_button_label,
  report_success_message,
  footer_text,
  footer_url
)
SELECT
  'Help & Support',
  'WhatsApp Sender & Automation by Replai',
  'Get Support',
  'Resources',
  'Maintenance',
  'Fix a spreadsheet where rules look active but nothing is sending.',
  'Reinstall automatic triggers',
  'Rebuilds the triggers for this spreadsheet. Safe to run at any time.',
  'Disconnect this account',
  'Forgets your API key on this device. Your rules are kept.',
  'Reset Configuration',
  'Clears everything for this spreadsheet: your API key, every rule, and all triggers. Rules are stored in the spreadsheet only, so this cannot be undone.',
  'Reset Everything',
  'Yes, delete everything',
  'Report Issue',
  'Found a bug or need help? Include your email or phone number if you would like us to follow up.',
  'Describe what happened, what you expected, and which sheet or rule it affected.',
  'Submit Report',
  'Thanks — your report reached our team. We will follow up by email.',
  'wacrm.junkiescoder.com',
  'https://wacrm.junkiescoder.com'
WHERE NOT EXISTS (SELECT 1 FROM public.sheets_addon_help_settings);

-- Support links.
--
-- WhatsApp ships DISABLED with a blank URL because there is no correct
-- number to hardcode here — an operator sets theirs in Super Admin and
-- enables it. Email seeds from the support address already configured in
-- site_settings, and stays disabled if that is unset, so neither row can
-- go live pointing nowhere.
INSERT INTO public.sheets_addon_help_links
  (section, label, description, url, icon, sort_order, is_enabled)
SELECT
  'support',
  'WhatsApp Support',
  'Chat instantly',
  '',
  'whatsapp',
  10,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.sheets_addon_help_links
  WHERE section = 'support' AND icon = 'whatsapp'
);

INSERT INTO public.sheets_addon_help_links
  (section, label, description, url, icon, sort_order, is_enabled)
SELECT
  'support',
  'Email Support',
  COALESCE(NULLIF(s.support_email, ''), 'Set a support email in Platform Settings'),
  CASE
    WHEN COALESCE(s.support_email, '') = '' THEN ''
    ELSE 'mailto:' || s.support_email
  END,
  'mail',
  20,
  COALESCE(s.support_email, '') <> ''
FROM (SELECT support_email FROM public.site_settings LIMIT 1) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM public.sheets_addon_help_links
  WHERE section = 'support' AND icon = 'mail'
);

-- Resource links point at the production host, not the dev tunnel: these
-- are rendered inside a published Marketplace add-on.
INSERT INTO public.sheets_addon_help_links
  (section, label, description, url, icon, sort_order, is_enabled)
SELECT
  'resources',
  'API Docs',
  'Endpoints, scopes and code samples',
  'https://wacrm.junkiescoder.com/api-reference',
  'book',
  10,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.sheets_addon_help_links
  WHERE section = 'resources' AND icon = 'book'
);

INSERT INTO public.sheets_addon_help_links
  (section, label, description, url, icon, sort_order, is_enabled)
SELECT
  'resources',
  'Website',
  'Open Replai in your browser',
  'https://wacrm.junkiescoder.com',
  'globe',
  20,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.sheets_addon_help_links
  WHERE section = 'resources' AND icon = 'globe'
);
