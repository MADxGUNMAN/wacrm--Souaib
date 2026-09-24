-- ============================================================
-- Make an API campaign run self-describing.
--
-- THE PROBLEM
-- A run's personalization is already durable:
-- `broadcast_recipients.send_params.params` holds the positional body
-- values that were actually sent (migration 20260910030000). But it is
-- ONLY positional — `["Souaib","393392","200"]` — so the campaign detail
-- screen can render the values and nothing else. It cannot say which
-- spreadsheet column each one came from, because that name never
-- survives the trip: the add-on reads `variable.column` to look the cell
-- up (sheets-addon/src/rowmap.js) and then pushes only the value.
--
-- So the operator sees their own data stripped of its meaning. "393392"
-- is unreadable; "Delevery id: 393392" is the report they asked for.
--
-- WHY THE LABELS GO ON `broadcasts`, NOT ON `api_campaigns`
-- A campaign is fed by a RULE, and two rules on two different sheets can
-- legitimately drive the same campaign with different columns mapped to
-- the same template variables. Storing one label set per campaign would
-- silently mislabel the runs of whichever rule was not the last to
-- write. A run, by contrast, is exactly one rule firing once, so the
-- labels are a true property of the run.
--
-- WHY NOT INSIDE `send_params`
-- The labels describe the RULE, not the recipient, and the Sheets path
-- sends one recipient per call — repeating the same label array on every
-- recipient row would be duplicated data that could disagree with
-- itself. `parseStoredSendParams` would also have to grow a field it has
-- no use for at send time.
-- ============================================================

-- ── broadcasts.variable_labels ────────────────────────────────
-- Index-aligned with each recipient's `send_params.params`: element i
-- labels `{{i+1}}`. A jsonb ARRAY rather than an object keyed by
-- position, because the positions are already dense and 1-based by
-- Meta's own contract (validated add-on side — see `rules.js` validate,
-- which requires `variables.length === campaign.variableCount`).
--
-- NULL means "not recorded", which is materially different from an empty
-- array ("this template takes no variables"). Every run created before
-- this migration is NULL, and the UI falls back to "Value 1..n" for
-- those rather than inventing names.
--
-- A literal variable (a fixed value typed into the rule, not read from a
-- column) is stored as an empty string, so the UI can label it
-- generically while still keeping the positions aligned.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS variable_labels JSONB;

COMMENT ON COLUMN broadcasts.variable_labels IS
  'Human labels for the positional body params of this run, index-aligned with broadcast_recipients.send_params.params. For a Google Sheets run these are the spreadsheet column headers. Empty string = a literal (non-column) variable. NULL = not recorded (pre-existing runs, or a caller that did not send param_labels).';

-- ── broadcasts.source_ref ─────────────────────────────────────
-- Where this run came from, verbatim as the caller reported it:
-- { kind, spreadsheet_id, sheet, rule_id, row }.
--
-- This block was already being sent by the add-on on every call and then
-- discarded server-side apart from `kind`, which was interpolated into
-- the run's name — which is why every row of the runs table reads the
-- same campaign name and nothing distinguishes one run from another but
-- its timestamp.
--
-- One jsonb blob rather than columns: the shape is the caller's, not
-- ours. A customer's own backend triggering the same endpoint will send
-- a different set of keys than the Sheets add-on, and neither should
-- require a migration. Never queried by content, so not indexed.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS source_ref JSONB;

COMMENT ON COLUMN broadcasts.source_ref IS
  'Provenance of an externally triggered run, verbatim from the API caller: { kind, spreadsheet_id, sheet, rule_id, row }. NULL for dashboard broadcasts and for runs created before this column existed.';
