-- ============================================================
-- Auto Mail — automated trial and renewal reminder emails.
--
-- Two independently configured segments:
--   'trial'  accounts inside a trial window, reminded before it ends
--   'paid'   accounts inside a paid window, reminded before it renews
--
-- ─── WHY A ROW PER SEGMENT, NOT A SINGLETON ──────────────────
--
-- The obvious shape is one settings row with `trial_offset_days` /
-- `paid_offset_days`, `trial_subject` / `paid_subject`, and so on. That
-- was rejected: the requirement is that the two segments never share
-- configuration, and paired columns make that a naming convention rather
-- than a structural fact — one careless PUT that omits the prefix writes
-- the wrong segment. A row per segment also means adding a third
-- audience later (say 'expired', a win-back mail) is an INSERT rather
-- than another eight columns.
--
-- ─── WHY offsets_days IS AN ARRAY ────────────────────────────
--
-- The brief asks for one configurable threshold and lists multiple
-- stages ("7, 3 and 1 day before") as a possible extension. An array
-- serves both with one schema, so the extension needs no migration and
-- no second code path. Mirrors `whatsapp_usage_alerts.thresholds`, which
-- solved the same problem for usage alerts.
--
-- ─── WHY THE LOG IS THE IDEMPOTENCY MECHANISM ────────────────
--
-- deploy/cron-ping.sh fires every 5 minutes, so a "daily" reminder job
-- is really called 288 times a day. Deciding in JavaScript whether a
-- reminder was already sent cannot be made safe: two overlapping ticks
-- both read "not sent yet" and both send. So the INSERT into
-- `auto_email_log` IS the claim — whoever wins the unique index owns
-- that send, and the loser gets 23505 and skips. Same reasoning as
-- `whatsapp_usage_alert_events` (migration 079) and
-- `record_webhook_failure` (028): the state transition belongs in SQL.
-- ============================================================

-- ------------------------------------------------------------
-- Per-segment configuration
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_email_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One row per audience. UNIQUE is what makes "these two never share
  -- settings" true at the schema level.
  segment           TEXT NOT NULL UNIQUE
                      CHECK (segment IN ('trial', 'paid')),

  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,

  -- How many days before the window closes to send. Multiple entries =
  -- multiple reminder stages. Empty array disables sending as surely as
  -- is_enabled = FALSE, so both are checked.
  offsets_days      INTEGER[] NOT NULL DEFAULT ARRAY[1],

  -- Operator-authored copy. PLAIN TEXT, never HTML: it is rendered
  -- through src/lib/email/layout.ts, whose helpers escape everything and
  -- have no raw variant. Tokens are single-brace, matching the
  -- established `fillTemplate` convention used for subscription copy —
  -- {name} {workspace} {site_name} {expiry_date} {days_left}
  -- {days_phrase} {plan_name}. An unrecognised token is left visible on
  -- purpose so the operator who typed it can see their own typo.
  subject_template  TEXT NOT NULL,
  heading_template  TEXT NOT NULL,
  body_template     TEXT NOT NULL,
  cta_label         TEXT NOT NULL DEFAULT 'Open billing',
  -- Path, not a full URL: the origin comes from NEXT_PUBLIC_SITE_URL at
  -- render time, so the same row works in dev, staging and production.
  cta_path          TEXT NOT NULL DEFAULT '/settings?tab=billing',
  footer_note       TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auto_email_rules IS
  'One row per Auto Mail audience (trial / paid). Row-per-segment rather than prefixed column pairs so the two segments structurally cannot share configuration.';
COMMENT ON COLUMN auto_email_rules.offsets_days IS
  'Days before the window closes to send a reminder. Multiple entries = multiple stages. Empty disables the segment.';
COMMENT ON COLUMN auto_email_rules.body_template IS
  'Plain text with single-brace tokens. Never HTML — the email layer escapes everything and offers no raw variant.';
COMMENT ON COLUMN auto_email_rules.cta_path IS
  'Site-relative path. The origin is prepended at render time so one row is correct in every environment.';

-- ------------------------------------------------------------
-- Delivery log — also the idempotency claim
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_email_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment          TEXT NOT NULL CHECK (segment IN ('trial', 'paid')),

  -- Which stage produced this send. Recorded rather than derived because
  -- an operator editing offsets_days later would otherwise rewrite
  -- history: a log row must keep saying what actually happened.
  offset_days      INTEGER NOT NULL,

  -- THE DEDUPE ANCHOR: the expiry this reminder was about.
  --
  -- Deliberately the window end and not a calendar day. If an admin
  -- extends a subscription, window_end moves, the claim key changes, and
  -- a fresh reminder becomes due for the NEW date — which is correct, it
  -- is a different fact about a different deadline. Keying on "today"
  -- would have suppressed it.
  window_end       TIMESTAMPTZ NOT NULL,

  -- Snapshotted, not joined. A profile can change its address or be
  -- deleted, and "who did we actually mail, at what address" must stay
  -- answerable afterwards.
  recipient_email  TEXT NOT NULL,
  recipient_name   TEXT,
  subject          TEXT NOT NULL,
  days_left        INTEGER,

  -- 'sending' is written by the claim, then updated. A row left in
  -- 'sending' means the process died mid-send — worth being able to see
  -- rather than having it look like a success or a failure.
  status           TEXT NOT NULL DEFAULT 'sending'
                     CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  -- Verbatim reason from EmailResult: 'not_configured' / 'no_recipient' /
  -- 'send_failed' plus the SMTP detail.
  error_detail     TEXT,

  -- 'manual' rows come from the admin's Send now button. Kept in the
  -- same table so a per-account history shows everything that reached
  -- the customer, in one list.
  trigger          TEXT NOT NULL DEFAULT 'auto'
                     CHECK (trigger IN ('auto', 'manual')),
  triggered_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The claim index.
--
-- PARTIAL on trigger = 'auto' for two reasons. A manual resend must
-- always be possible — an operator pressing Send now after a bounce is
-- the recovery path, and a unique violation there would look like a
-- broken button. And a manual send must not consume the automatic slot,
-- or testing the template would silently cancel the real reminder.
CREATE UNIQUE INDEX IF NOT EXISTS auto_email_log_auto_claim_key
  ON auto_email_log (account_id, segment, window_end, offset_days)
  WHERE trigger = 'auto';

-- Per-account history, newest first — the account deep-dive card.
CREATE INDEX IF NOT EXISTS idx_auto_email_log_account
  ON auto_email_log (account_id, created_at DESC);

-- The global history list and the "sent this month" figure.
CREATE INDEX IF NOT EXISTS idx_auto_email_log_created
  ON auto_email_log (created_at DESC);

-- Failure triage: find what needs resending without scanning the table.
CREATE INDEX IF NOT EXISTS idx_auto_email_log_failed
  ON auto_email_log (created_at DESC)
  WHERE status = 'failed';

COMMENT ON TABLE auto_email_log IS
  'Every Auto Mail send, and the idempotency claim for automatic ones. The INSERT is the claim: 23505 means another cron tick already owns that send.';
COMMENT ON INDEX auto_email_log_auto_claim_key IS
  'Partial on trigger=auto so a manual resend is never blocked by, and never consumes, the automatic slot.';
COMMENT ON COLUMN auto_email_log.window_end IS
  'The expiry this reminder was about, and part of the claim key. Extending a subscription moves it, which correctly makes a new reminder due.';

-- ------------------------------------------------------------
-- Per-account opt-out
-- ------------------------------------------------------------
-- On `accounts` rather than `profiles`: the reminder is about the
-- workspace's billing window, and it goes to whoever owns that
-- workspace. Storing the preference per user would raise a question with
-- no good answer — whether an ex-owner's opt-out should still suppress
-- mail for the current one.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS auto_email_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN accounts.auto_email_opted_out IS
  'When true, Auto Mail skips this workspace entirely. Set by a super admin; billing reminders are transactional so there is no customer-facing unsubscribe.';

-- ------------------------------------------------------------
-- RLS: service role only
-- ------------------------------------------------------------
-- Enabled with NO policies, which is the deny-all posture. Nothing
-- client-side reads these tables — the admin UI goes through
-- /api/super-admin/* behind requireSuperAdmin, and the cron uses the
-- service role, both of which bypass RLS. Leaving RLS off instead would
-- expose an account's mail history to any authenticated client.
ALTER TABLE auto_email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_email_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Seed both segments
-- ------------------------------------------------------------
-- Copy is written so it still reads correctly when a token resolves to
-- nothing: `fillTemplate` drops empty values and tidies the surrounding
-- punctuation, so a sentence must not depend on an optional token for
-- its grammar. {plan_name} is deliberately absent from the prose for
-- that reason — plan and dates are rendered in a detail table by the
-- builder, where a missing value drops its whole row cleanly.
INSERT INTO auto_email_rules (
  segment, offsets_days, subject_template, heading_template, body_template,
  cta_label, cta_path, footer_note
) VALUES (
  'trial',
  ARRAY[1],
  'Your {site_name} trial ends in {days_phrase}',
  'Your trial ends in {days_phrase}',
  'Hi {name},' || E'\n\n' ||
  'Your {site_name} trial for {workspace} ends on {expiry_date} — {days_phrase} from now.' || E'\n\n' ||
  'To keep your inbox, contacts and automations running without interruption, activate a plan before then. Everything carries over exactly as it is: your conversations, templates and connected WhatsApp number all stay in place.',
  'Activate my plan',
  '/upgrade-plan',
  'You are receiving this because your workspace has a trial ending shortly.'
)
ON CONFLICT (segment) DO NOTHING;

INSERT INTO auto_email_rules (
  segment, offsets_days, subject_template, heading_template, body_template,
  cta_label, cta_path, footer_note
) VALUES (
  'paid',
  ARRAY[3],
  'Your {site_name} subscription renews in {days_phrase}',
  'Time to renew your subscription',
  'Hi {name},' || E'\n\n' ||
  'Your {site_name} subscription for {workspace} is due on {expiry_date} — {days_phrase} from now.' || E'\n\n' ||
  'Renewing before then keeps your service running without a gap. If you would rather move to a different plan, you can change it from the same screen.',
  'Renew my plan',
  '/upgrade-plan',
  'You are receiving this because your workspace has a subscription renewing shortly.'
)
ON CONFLICT (segment) DO NOTHING;
