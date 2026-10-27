-- ============================================================
-- Emailing a customer when support replies and they have left.
--
-- Phase 4 made a reply visible to anyone who is IN the app: a rail hint, a
-- sidebar badge, the notification bell on the operator side. None of that
-- reaches the person who asked a question, closed the tab and went back to
-- work — which is the normal way a support conversation goes. They would
-- learn the answer only by logging in and navigating to Settings → Live
-- chat on a hunch.
--
-- This table is the idempotency ledger for that email, not a queue. The
-- cron recomputes who is due on every tick (same approach as auto-mail's
-- recipients: derived state, no stored schedule), and this records what has
-- already gone out.
--
-- ─── THE CLAIM IS THE INSERT ─────────────────────────────────
--
-- The sweep runs every five minutes, so "have we already emailed about this
-- reply?" cannot be answered in JavaScript: two overlapping ticks both read
-- "no" and both send. The UNIQUE constraint on `message_id` is what makes
-- it exactly once — the INSERT wins or it raises 23505 and that tick backs
-- off. Copied deliberately from `auto_email_log`, whose header makes the
-- same point.
--
-- Anchored on the MESSAGE rather than the conversation so a genuinely new
-- reply, hours later and still unread, can legitimately send a second
-- nudge. A per-conversation cooldown (enforced in the sweep, see
-- REPLY_EMAIL_COOLDOWN_HOURS) is what stops that becoming a drip.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_reply_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,

  -- The operator reply this email was about. UNIQUE: one email per reply,
  -- enforced by the database rather than by the sweep's own bookkeeping.
  --
  -- NOT a foreign key with ON DELETE CASCADE to support_messages, on
  -- purpose: retracting a message must not erase the record that we
  -- emailed its contents to somebody. SET NULL would break the uniqueness
  -- guarantee, so the id is stored bare.
  message_id UUID NOT NULL UNIQUE,

  account_id UUID
    REFERENCES public.accounts(id) ON DELETE SET NULL,

  -- Who it actually went to. An array rather than a row per recipient:
  -- the send is one claim covering the whole batch, and splitting it would
  -- mean a partial failure could re-claim and re-send to the others.
  recipients TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending',

  -- Why it failed, when it did. Kept because "the customer says they were
  -- never told" is answerable from this column and nowhere else.
  detail TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_reply_emails
  DROP CONSTRAINT IF EXISTS support_reply_emails_status_check;
ALTER TABLE public.support_reply_emails
  ADD CONSTRAINT support_reply_emails_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));

-- Backs the per-conversation cooldown lookback, which is the only query
-- the sweep runs against this table besides the claim itself.
CREATE INDEX IF NOT EXISTS support_reply_emails_conversation_created_idx
  ON public.support_reply_emails (conversation_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS: enabled, with no policies at all
-- ------------------------------------------------------------
-- Deliberate, and different from the support chat tables themselves. Those
-- need SELECT policies because Realtime authorises against the subscriber's
-- JWT. Nothing in any browser reads this ledger — it is written and read
-- only by the cron on the service-role client, which bypasses RLS. Enabling
-- RLS with zero policies is therefore the correct "deny everyone" rather
-- than an oversight, and it is what keeps a customer's email address out of
-- reach of the anon key.
ALTER TABLE public.support_reply_emails ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.support_reply_emails IS
  'Idempotency ledger for the "support replied while you were away" email. One row per operator reply; UNIQUE(message_id) is what makes two overlapping cron ticks send exactly once. RLS is on with no policies because only the service-role cron touches it.';
COMMENT ON COLUMN public.support_reply_emails.message_id IS
  'The support_messages row this email was about. Intentionally not a FK: retracting a message must not erase the record that its contents were emailed.';
