-- ============================================================
-- WhatsApp Coexistence, Phase 2 — history + contact sync.
--
-- When a number joins through Coexistence, Meta can hand over what the
-- business already has: up to ~6 months of 1:1 chat history, and the
-- phone's address book. Both need somewhere to land.
--
-- ─── Why history needs its own progress table ─────────────────────
--
-- The handover is NOT one webhook. Meta streams it in chunks across
-- three phases (day 0–1, day 1–90, day 90–180), each carrying a
-- `chunk_order` and a `progress` percentage. It can also stop early:
-- the business is asked on their phone whether to share history at all,
-- and declining arrives as an error (code 2593109) rather than as zero
-- messages.
--
-- Without state, the UI could only say "waiting" forever, and there
-- would be no way to tell "still importing" from "the business said no"
-- from "Meta stopped talking to us".
--
-- ─── Why contacts are STAGED and not imported ─────────────────────
--
-- `smb_app_state_sync` sends the phone's WHOLE address book. That is not
-- a customer list — it is family, friends, the plumber, and every
-- one-off number the owner ever saved. Writing it straight into
-- `contacts` would pollute the CRM permanently and, worse, silently
-- inflate every broadcast audience built from "all contacts". Someone's
-- mother would receive a marketing campaign.
--
-- So they land in a staging table and a human decides. The cost is one
-- review step; the alternative is unrecoverable without knowing which
-- rows came from where.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. whatsapp_config: the one-shot sync trigger
--
-- Meta allows the history and contact sync to be STARTED ONCE, and only
-- within 24 hours of onboarding. Miss the window and the only way back
-- is for the customer to disconnect and re-onboard. So the attempt has
-- to be recorded durably — not left to a fire-and-forget call in the
-- signup handler that a cold start could lose.
--
-- `attempts` exists so a retry loop is bounded and visible. A silent
-- infinite retry against a one-shot endpoint is how you burn the window.
-- ============================================================
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS sync_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_last_error TEXT;

COMMENT ON COLUMN whatsapp_config.sync_requested_at IS
  'When Meta accepted the one-shot history/contact sync request. NULL means never successfully requested. Meta only allows this once, within 24h of onboarding.';
COMMENT ON COLUMN whatsapp_config.sync_last_error IS
  'Why the last sync request failed. Kept so a missed 24h window is diagnosable after the fact rather than looking like the business declined.';

-- ============================================================
-- 2. coexistence_history_imports — progress of the chat backfill
--
-- One row per (config, phase). Phases arrive independently and can
-- overlap, so a single "progress" column on whatsapp_config would be
-- overwritten by whichever chunk landed last and jump backwards.
-- ============================================================
CREATE TABLE IF NOT EXISTS coexistence_history_imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id   uuid NOT NULL REFERENCES whatsapp_config(id) ON DELETE CASCADE,

  -- Meta's phase: 0 = day 0–1, 1 = day 1–90, 2 = day 90–180.
  -- Stored as the raw integer rather than a label — Meta may add phases,
  -- and an unrecognised number we kept is still meaningful.
  phase       integer NOT NULL,

  -- Highest chunk_order seen, and Meta's own percentage. `progress` is
  -- taken from the payload rather than computed: we cannot know the total
  -- number of chunks in advance, so any local calculation would be a
  -- guess that disagrees with Meta.
  last_chunk_order integer,
  progress    integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),

  -- running   — chunks are arriving
  -- completed — progress reached 100
  -- declined  — the business refused history sharing on their phone
  --             (Meta error 2593109). A DISTINCT state from failed:
  --             nothing is broken and there is nothing to retry, so the
  --             UI must not offer one.
  -- failed    — Meta reported some other error
  status      text NOT NULL DEFAULT 'running'
              CHECK (status IN ('running', 'completed', 'declined', 'failed')),
  error_code  text,
  error_message text,

  -- Counters for the UI, and for spotting a sync that "succeeded" while
  -- importing nothing.
  threads_seen    integer NOT NULL DEFAULT 0,
  messages_stored integer NOT NULL DEFAULT 0,
  messages_skipped integer NOT NULL DEFAULT 0,

  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT coexistence_history_imports_config_phase_key
    UNIQUE (config_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_coex_history_account
  ON coexistence_history_imports (account_id);

-- ============================================================
-- 3. coexistence_staged_contacts — the phone's address book, pending review
-- ============================================================
CREATE TABLE IF NOT EXISTS coexistence_staged_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id   uuid NOT NULL REFERENCES whatsapp_config(id) ON DELETE CASCADE,

  phone       text NOT NULL,
  -- Normalised copy, so matching against existing contacts uses the same
  -- basis the rest of the app does (see 022 / the dedupe helper).
  phone_normalized text,
  full_name   text,
  first_name  text,

  -- pending  — waiting for a human
  -- imported — a contacts row now exists for it
  -- skipped  — explicitly rejected. KEPT rather than deleted so a later
  --            re-sync does not resurface a number the operator already
  --            said no to. Without this, every sync would re-offer the
  --            owner's family.
  -- removed  — deleted from the phone's address book after we staged it
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'imported', 'skipped', 'removed')),

  -- Set when status = 'imported', so the review UI can link through and
  -- so re-syncs can tell "already handled" from "new".
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- True when a contacts row for this number ALREADY existed when we
  -- staged it. Surfaced in the UI so an operator reviewing 400 numbers
  -- can skip the ones they already have.
  already_known boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,

  -- One row per number per config. Re-syncs UPDATE rather than duplicate,
  -- which is what keeps 'skipped' decisions sticky.
  CONSTRAINT coexistence_staged_contacts_config_phone_key
    UNIQUE (config_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_coex_staged_account_status
  ON coexistence_staged_contacts (account_id, status);

-- ============================================================
-- 4. RLS
--
-- Reads for any member; writes for admins only. Both tables are
-- settings-class: importing contacts changes who broadcasts reach, which
-- is not something an ordinary agent should be able to do. Matches the
-- shape used by webhook_endpoints (migration 028).
--
-- The webhook writes through the service-role client, which bypasses RLS
-- entirely — these policies govern the dashboard and the public API.
-- ============================================================
ALTER TABLE coexistence_history_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE coexistence_staged_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coex_history_select ON coexistence_history_imports;
CREATE POLICY coex_history_select ON coexistence_history_imports FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS coex_history_write ON coexistence_history_imports;
CREATE POLICY coex_history_write ON coexistence_history_imports FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS coex_staged_select ON coexistence_staged_contacts;
CREATE POLICY coex_staged_select ON coexistence_staged_contacts FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS coex_staged_write ON coexistence_staged_contacts;
CREATE POLICY coex_staged_write ON coexistence_staged_contacts FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- Keep updated_at honest without every caller remembering it. Reuses the
-- function migration 065 installed.
DROP TRIGGER IF EXISTS coex_history_touch ON coexistence_history_imports;
CREATE TRIGGER coex_history_touch
  BEFORE UPDATE ON coexistence_history_imports
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS coex_staged_touch ON coexistence_staged_contacts;
CREATE TRIGGER coex_staged_touch
  BEFORE UPDATE ON coexistence_staged_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
