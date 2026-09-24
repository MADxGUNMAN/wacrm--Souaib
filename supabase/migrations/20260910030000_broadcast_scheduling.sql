-- ============================================================
-- Scheduled broadcasts + send-time value persistence.
--
-- Two features need durable state that the schema could not hold:
--
--   1. SCHEDULING. `broadcasts.scheduled_at` and the 'scheduled' value
--      in the status CHECK have existed since migration 001, but nothing
--      ever wrote them and no executor ever read them. Making them real
--      needs an index the sweep can use, plus somewhere to keep the
--      values a send is reconstructed from — a campaign that fires two
--      hours from now cannot re-derive them from React state that is
--      long gone.
--
--   2. SEND-TIME VALUES. A template's media header, carousel cards,
--      limited-time-offer deadline and commerce fields are collected in
--      the personalize step and, until now, existed ONLY in the
--      browser. Saving a draft silently dropped every one of them, so
--      reloading a draft carousel broadcast lost its card images. The
--      same gap would have made a scheduled carousel unsendable.
--
-- Both columns are additive and nullable. Existing rows read as NULL,
-- which every consumer already treats as "no extra values" — the same
-- state a text-only template is in today.
-- ============================================================

-- ── broadcasts.send_config ────────────────────────────────────
-- The recipient-INDEPENDENT half of a send, as collected by the
-- wizard: { headerMediaUrl, sendExtras, csvContacts }.
--
-- Deliberately one JSONB blob rather than a column per field. These are
-- Meta's template-shape concerns (offer deadlines, per-card media,
-- invoice line items, product section lists) and they change whenever
-- Meta adds a template type — three have been added to this codebase
-- already. A column each would mean a migration each, and the send
-- builder reads them as a single nested object regardless.
--
-- NOT indexed and never queried by content: it is write-once,
-- read-once-at-send payload, not a filter target.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS send_config JSONB;

COMMENT ON COLUMN broadcasts.send_config IS
  'Recipient-independent send values from the wizard: headerMediaUrl, sendExtras (offer expiry, carousel cards, commerce fields), csvContacts. Consumed when a scheduled broadcast executes; also restores a draft. NULL = nothing beyond body variables.';

-- ── broadcast_recipients.send_params ──────────────────────────
-- The per-recipient half: { params: string[], messageParams: {...} }.
--
-- Body variables resolve PER CONTACT (a `field` mapping reads that
-- contact's name, a `custom_field` mapping reads its own value), so they
-- cannot live on the parent row. Resolving them at schedule time and
-- storing them here is what lets the cron executor send without
-- re-resolving an audience — and it freezes the personalization to what
-- the operator actually reviewed, rather than silently picking up a
-- contact edit made after scheduling.
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS send_params JSONB;

COMMENT ON COLUMN broadcast_recipients.send_params IS
  'Per-recipient resolved send values: { params: positional body values, messageParams: SendTimeParams }. Written when a broadcast is scheduled so the cron executor need not re-resolve the audience. NULL = send with no parameters.';

-- ── The sweep index ───────────────────────────────────────────
-- The cron executor asks exactly one question every five minutes:
-- "which broadcasts are due?" — status = 'scheduled' AND scheduled_at
-- <= now(). A partial index answers it by touching only the handful of
-- pending rows instead of scanning every broadcast the account has ever
-- sent, and stays small forever because a row leaves the index the
-- moment it starts sending.
CREATE INDEX IF NOT EXISTS idx_broadcasts_due_scheduled
  ON broadcasts (scheduled_at)
  WHERE status = 'scheduled';

-- ── Integrity: a scheduled broadcast must have a time ─────────
-- Without this, a bug that sets status='scheduled' and forgets
-- scheduled_at produces a campaign that is invisible to the sweep and
-- never sends — the exact failure mode that is hardest to notice,
-- because the UI happily shows "Scheduled".
--
-- NOT VALID so the constraint applies to new and updated rows without
-- forcing a full-table scan on deploy. It is validated separately
-- below; if any legacy row violated it the validation would fail loudly
-- rather than silently skipping enforcement.
ALTER TABLE broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_scheduled_needs_time;

ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_scheduled_needs_time
  CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL)
  NOT VALID;

ALTER TABLE broadcasts
  VALIDATE CONSTRAINT broadcasts_scheduled_needs_time;
