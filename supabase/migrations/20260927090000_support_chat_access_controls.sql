-- ============================================================
-- Live Chat: platform switch, visibility rule, per-workspace overrides.
--
-- Three decisions, evaluated in this order (first match wins):
--
--   1. MASTER SWITCH  support_chat_settings.enabled = false
--        → nobody sees Live chat. Beats everything, including overrides,
--          so "turn it off" always means off.
--   2. OVERRIDE       support_chat_access.mode for this workspace
--        → 'deny'  : never, whatever the rule says
--        → 'allow' : always, whatever the rule says
--   3. RULE           support_chat_settings.visibility
--        → 'all'                : every workspace
--        → 'whatsapp_connected' : only workspaces whose WhatsApp number
--                                 is connected right now
--        → 'selected'           : nobody unless allowed in step 2
--
-- The evaluation lives in ONE TypeScript function
-- (computeSupportAccess in src/lib/support-chat/availability.ts), used by
-- every API route, the availability endpoint and the reply-email cron, so
-- the settings page, the CRM and the server cannot disagree.
--
-- ─── Why no RLS policies ─────────────────────────────────────
--
-- Both tables are read and written only through service-role API routes.
-- A tenant never needs the raw rule — only the answer for their own
-- workspace, which /api/support-chat/availability computes. Exposing the
-- table would also expose which other workspaces were granted or blocked.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_chat_settings (
  -- Singleton. A boolean key with CHECK (id) admits exactly one row.
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  visibility TEXT NOT NULL DEFAULT 'all',
  -- The floating chat bubble, platform-wide. Users can still hide their
  -- own copy; this is the operator's switch for everyone.
  widget_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Shown in an empty chat and under the widget header.
  welcome_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.support_chat_settings DROP CONSTRAINT IF EXISTS support_chat_settings_singleton;
ALTER TABLE public.support_chat_settings ADD CONSTRAINT support_chat_settings_singleton CHECK (id);
ALTER TABLE public.support_chat_settings DROP CONSTRAINT IF EXISTS support_chat_settings_visibility_check;
ALTER TABLE public.support_chat_settings ADD CONSTRAINT support_chat_settings_visibility_check
  CHECK (visibility IN ('all', 'whatsapp_connected', 'selected'));
ALTER TABLE public.support_chat_settings DROP CONSTRAINT IF EXISTS support_chat_settings_welcome_length;
ALTER TABLE public.support_chat_settings ADD CONSTRAINT support_chat_settings_welcome_length
  CHECK (welcome_message IS NULL OR char_length(welcome_message) <= 280);

-- Defaults reproduce today's behaviour exactly (on, everyone), so this
-- migration changes nothing for any workspace until an operator acts.
INSERT INTO public.support_chat_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.support_chat_access (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  -- 'admin_message' = created automatically because an operator messaged a
  -- workspace that could not see the chat. Kept distinct from a manual
  -- grant so the settings page can say why a workspace has access.
  source TEXT NOT NULL DEFAULT 'manual',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_chat_access DROP CONSTRAINT IF EXISTS support_chat_access_mode_check;
ALTER TABLE public.support_chat_access ADD CONSTRAINT support_chat_access_mode_check
  CHECK (mode IN ('allow', 'deny'));
ALTER TABLE public.support_chat_access DROP CONSTRAINT IF EXISTS support_chat_access_source_check;
ALTER TABLE public.support_chat_access ADD CONSTRAINT support_chat_access_source_check
  CHECK (source IN ('manual', 'admin_message'));

ALTER TABLE public.support_chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_chat_access ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.support_chat_settings IS
  'Singleton (id = TRUE). Platform-wide Live Chat switches. Service-role only; tenants learn the outcome through /api/support-chat/availability, never the raw row.';
COMMENT ON TABLE public.support_chat_access IS
  'Per-workspace override of the Live Chat visibility rule. Absent row = follow the rule. allow/deny win over the rule; the master switch in support_chat_settings wins over both. source=admin_message marks an allow created automatically when an operator messaged a workspace that could not see the chat.';
