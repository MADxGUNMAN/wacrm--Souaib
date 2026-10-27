-- ============================================================
-- In-app support chat: customer workspace <-> super admin.
--
-- Replaces "message me on WhatsApp and I'll reply on WhatsApp" with a
-- real channel inside the product: a Live chat pane in the tenant's
-- Settings, and a matching inbox in Super Admin.
--
-- ─── WHY BOTH AUDIENCES GET RLS POLICIES ─────────────────────
--
-- Everywhere else in this codebase a super-admin read goes through
-- `supabaseAdmin()` in an /api/super-admin/* route, which bypasses RLS
-- entirely. That is correct for a snapshot and WRONG here, because this
-- chat has to be live in both directions.
--
-- Supabase Realtime re-evaluates the SUBSCRIBER'S OWN JWT against RLS on
-- every row change before it emits anything. A service-role read on the
-- server cannot make a browser subscription work. So each table carries
-- one permissive policy per audience and Postgres OR's them:
--
--   tenant   → is_account_member(account_id)
--   operator → is_super_admin_user()
--
-- One policy per audience rather than a single compound predicate,
-- following 20260921180000_member_presence_super_admin_read.sql, which
-- exists for exactly this reason and documents it.
--
-- `TO authenticated` on the operator policies is LOAD-BEARING, not
-- decoration: EXECUTE on is_super_admin_user() is revoked from `anon`,
-- so an unrestricted policy makes an anonymous read fail with
-- "permission denied for function" instead of returning zero rows.
-- is_account_member IS granted to anon, which is why the tenant policies
-- never hit this.
-- ============================================================

-- ------------------------------------------------------------
-- 1. One conversation per account
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE: the thread is shared by the whole workspace. Any member with
  -- Settings access talks in the same conversation, and every message
  -- records which member wrote it. A per-user thread would mean N threads
  -- per account to triage for no support benefit.
  account_id UUID NOT NULL UNIQUE
    REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Denormalised list-row fields, so rendering the operator's inbox does
  -- not need a per-row subquery into support_messages.
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,

  -- TWO counters, deliberately. "Unread" is a different question for each
  -- side, and a single shared counter is precisely the bug that makes a
  -- badge lie to one of them.
  unread_for_account INTEGER NOT NULL DEFAULT 0,
  unread_for_admin   INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'open',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_conversations
  DROP CONSTRAINT IF EXISTS support_conversations_status_check;
ALTER TABLE public.support_conversations
  ADD CONSTRAINT support_conversations_status_check
  CHECK (status IN ('open', 'closed'));

-- Operator inbox ordering: most recently active first.
CREATE INDEX IF NOT EXISTS support_conversations_last_message_idx
  ON public.support_conversations (last_message_at DESC NULLS LAST);

COMMENT ON TABLE public.support_conversations IS
  'One support thread per account, shared by every member with Settings access. Read and written by BOTH the tenant and the super admin through RLS (not the service-role client) because the chat is live in both directions and Realtime authorises against the subscriber JWT.';
COMMENT ON COLUMN public.support_conversations.unread_for_account IS
  'Messages from the operator the tenant has not read. Separate from unread_for_admin because one shared counter cannot answer both sides truthfully.';

-- ------------------------------------------------------------
-- 2. Messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,

  -- DENORMALISED on purpose. RLS runs per row on every read AND on every
  -- Realtime change; joining back to support_conversations inside the
  -- policy would put that join in the hottest path in the feature. The
  -- value is set server-side from the conversation, never from a client.
  account_id UUID NOT NULL
    REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Which side of the conversation this came from. Kept separate from
  -- sender_user_id so a row is still attributable after the author's auth
  -- user is deleted.
  sender_kind TEXT NOT NULL,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  content_type TEXT NOT NULL DEFAULT 'text',
  content_text TEXT,

  -- Attachment columns land in phase 1 unused, so phase 2 needs no
  -- migration. `media_key` is the S3 object key and is the SOURCE OF
  -- TRUTH: support attachments are served through short-lived presigned
  -- GETs rather than the bucket's public-read path, because a support
  -- screenshot routinely contains an API key or another customer's data.
  -- media_url stays nullable for that reason — there is no permanent URL
  -- to store.
  media_key        TEXT,
  media_url        TEXT,
  media_filename   TEXT,
  media_mime_type  TEXT,
  media_size_bytes BIGINT,

  reply_to_message_id UUID
    REFERENCES public.support_messages(id) ON DELETE SET NULL,

  -- Read receipt. One timestamp rather than a status enum: in-app there
  -- is no delivery event distinct from the INSERT, so a "delivered" tick
  -- would always mean the same thing as "sent" — decoration pretending to
  -- be information.
  read_at TIMESTAMPTZ,

  -- Soft delete, so replies pointing here do not dangle.
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_sender_kind_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_sender_kind_check
  CHECK (sender_kind IN ('account', 'admin'));

ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_content_type_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_content_type_check
  CHECK (content_type IN ('text', 'image', 'document', 'audio'));

-- A text message must carry text; a media message must carry a key.
-- Enforced here because a bubble with nothing in it is unrenderable and
-- the cause would be invisible at the UI layer.
ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_payload_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_payload_check
  CHECK (
    (content_type = 'text' AND content_text IS NOT NULL AND length(btrim(content_text)) > 0)
    OR (content_type <> 'text' AND media_key IS NOT NULL)
  );

-- Thread paging: newest-first within one conversation.
CREATE INDEX IF NOT EXISTS support_messages_conversation_created_idx
  ON public.support_messages (conversation_id, created_at DESC);
-- Backs the tenant RLS predicate and any per-account reporting.
CREATE INDEX IF NOT EXISTS support_messages_account_idx
  ON public.support_messages (account_id);

COMMENT ON COLUMN public.support_messages.account_id IS
  'Denormalised from the conversation so the RLS predicate is single-table. Set server-side, never accepted from a client.';
COMMENT ON COLUMN public.support_messages.media_key IS
  'S3 object key. Source of truth for attachments — they are served via short-lived presigned GETs, not the bucket public-read URL, because support screenshots routinely contain credentials or third-party data.';
COMMENT ON COLUMN public.support_messages.read_at IS
  'Set when the OTHER side opens the thread. There is deliberately no "delivered" state: in-app, delivery is the INSERT.';

-- ------------------------------------------------------------
-- 3. RLS — one policy per audience, OR'd
-- ------------------------------------------------------------
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- ---- conversations: tenant ----
DROP POLICY IF EXISTS support_conversations_select_member ON public.support_conversations;
CREATE POLICY support_conversations_select_member
  ON public.support_conversations
  FOR SELECT
  USING (public.is_account_member(account_id));

-- ---- conversations: operator ----
DROP POLICY IF EXISTS support_conversations_select_super_admin ON public.support_conversations;
CREATE POLICY support_conversations_select_super_admin
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin_user());

-- ---- messages: tenant read ----
DROP POLICY IF EXISTS support_messages_select_member ON public.support_messages;
CREATE POLICY support_messages_select_member
  ON public.support_messages
  FOR SELECT
  USING (public.is_account_member(account_id));

-- ---- messages: operator read ----
DROP POLICY IF EXISTS support_messages_select_super_admin ON public.support_messages;
CREATE POLICY support_messages_select_super_admin
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin_user());

-- NO client INSERT/UPDATE/DELETE policies, on purpose.
--
-- Reads must go through RLS for Realtime to work, but writes have
-- invariants a policy cannot express: sender_kind must match who the
-- caller actually is, account_id must come from the conversation rather
-- than the request, the text must be validated and length-capped, the
-- right unread counter must be bumped, and the send must be rate
-- limited. All of that lives in the API route on the service-role
-- client. Following super_admin_notifications, which makes the same
-- split for the same reason: a browser cannot be trusted to author
-- history even when it is allowed to read it.

COMMENT ON POLICY support_messages_select_super_admin ON public.support_messages IS
  'Scoped TO authenticated deliberately: is_super_admin_user() has EXECUTE revoked from anon, so an unrestricted policy would make anonymous reads ERROR instead of returning nothing.';

-- ------------------------------------------------------------
-- 4. Realtime
-- ------------------------------------------------------------
-- REPLICA IDENTITY FULL so an UPDATE payload carries the old column
-- values. Without it `payload.old` holds only the primary key, and the
-- client cannot tell whether a row was unread before the change — the
-- exact problem documented in 027_notifications.sql.
ALTER TABLE public.support_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;
