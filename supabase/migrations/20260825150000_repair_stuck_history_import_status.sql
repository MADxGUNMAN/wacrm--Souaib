-- ============================================================
-- Repair history-import phases left permanently "running" at 100%.
--
-- THE BUG (fixed in the webhook, see upsertHistoryImport)
-- `progress` was clamped with Math.max so it could never regress, but
-- `status` was computed straight from the incoming chunk's progress. So
-- once a phase reached 100% and Meta re-sent or delivered an out-of-order
-- chunk reporting less, progress stayed pinned at 100 while status flipped
-- back to 'running'.
--
-- The row was then permanently self-contradictory: a full progress bar
-- with a spinner beside it, in a panel that polls for as long as anything
-- is 'running'. One production account sat like that for 21 hours,
-- re-fetching an unchanging payload the whole time.
--
-- WHAT THIS REPAIRS, AND WHAT IT LEAVES ALONE
-- Only rows where progress >= 100 AND status = 'running'. That pair is
-- impossible to reach any other way, so it is unambiguously the bug's
-- output and safe to settle as 'completed'.
--
-- Phases sitting at LESS than 100% and 'running' are deliberately NOT
-- touched. They mean something different: Meta simply stopped sending, and
-- 'running' remains a faithful record of the last thing it told us. There
-- is no per-phase "complete" event to wait for, so we genuinely cannot
-- tell "the history was exhausted" from "the phone went offline". Marking
-- those completed would be inventing a fact. The API now derives
-- `is_stalled` from `updated_at` at read time instead, which is the only
-- place the passage of silence can actually be observed.
-- ============================================================

UPDATE coexistence_history_imports
SET status = 'completed'
WHERE status = 'running'
  AND progress >= 100;
