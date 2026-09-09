-- ============================================================
-- Migration 081: record HOW MUCH time an event granted
--
-- THE GAP
-- `subscription_events` stored the resulting `ends_at` but never the
-- duration that produced it, nor the date it replaced. So the audit trail
-- could say "Subscription extended · ends Oct 8 2027" without answering
-- the first question anyone actually asks: extended by how much?
--
-- The information was available at every call site and thrown away.
-- `activateSubscription` receives a `GrantDuration` and reads the current
-- `subscription_ends_at` before overwriting it; both were in scope when
-- the event was written.
--
-- WHY STORE THE DURATION RATHER THAN DERIVE IT
-- The delta between two end dates is NOT the duration granted. A renewal
-- extends from the existing end date, while a lapsed account starts from
-- today — so "1 month" can move the date by 30 days or by 400, depending
-- on how long the account sat expired. Only the requested duration says
-- what the operator actually chose, which is what an audit answers for.
--
-- `previous_ends_at` is stored too, because "Sep 8 -> Oct 8" is the
-- sentence a human reads, and reconstructing it from the preceding row is
-- fragile once events are filtered or paginated.
-- ============================================================

-- What the operator asked for. Both nullable: events that move a date
-- without a duration (revoke, expire, an exact-date correction) have
-- neither, and that absence is meaningful rather than missing data.
ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS duration_months INTEGER;

ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;

-- The date this event replaced, so the move is readable on its own.
ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS previous_ends_at TIMESTAMPTZ;

-- Which window the event acted on. `subscription_extended` alone cannot
-- distinguish paid time from trial days, and the two are separate fields
-- in the admin UI — an operator asking "was this a comp or a trial
-- bump?" has no way to tell from the event type.
--
-- Nullable for the same reason as above, and for every row written before
-- this migration: guessing retroactively would be inventing history.
ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS window_kind TEXT;

ALTER TABLE subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_window_kind_check;

ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_window_kind_check
  CHECK (window_kind IS NULL OR window_kind IN ('paid', 'trial'));

-- Sanity bounds mirroring the API validators, so a bad write is refused
-- here as well as there.
ALTER TABLE subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_duration_check;

ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_duration_check
  CHECK (
    (duration_months IS NULL OR (duration_months > 0 AND duration_months <= 120))
    AND (duration_days IS NULL OR (duration_days > 0 AND duration_days <= 3650))
  );

COMMENT ON COLUMN subscription_events.duration_months IS
  'Months the operator granted, as requested. NOT derivable from the end dates: a renewal extends from the old end date while a lapsed account starts today.';
COMMENT ON COLUMN subscription_events.duration_days IS
  'Days the operator granted, as requested. Wins over duration_months when both are set, matching GrantDuration.';
COMMENT ON COLUMN subscription_events.previous_ends_at IS
  'The end date this event replaced, so "Sep 8 -> Oct 8" reads without joining the preceding row.';
COMMENT ON COLUMN subscription_events.window_kind IS
  'paid | trial — which window the event moved. NULL for rows written before migration 081 and for events with no window.';
