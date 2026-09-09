-- ============================================================
-- 073_message_failure_reason.sql
-- Record WHY a message failed, in Meta's own words.
-- ============================================================
--
-- THE PROBLEM
-- -----------
-- `messages.status` could already be 'failed', but nothing anywhere
-- recorded the reason. The operator saw a red cross in the thread and had
-- no way to learn what went wrong — not by hovering, not by reopening the
-- conversation, not ever. The explanation existed for a few seconds in a
-- toast and was then gone for good.
--
-- Worse, the inbox send path never persisted a failed row at all: the
-- insert in send-message.ts only ran AFTER Meta accepted the message, so a
-- rejected send left the failure as optimistic client state that vanished
-- on refresh. `broadcast_recipients` has had `error_message` since the
-- beginning; direct messages simply never got the same treatment.
--
-- WHAT IS STORED
-- --------------
-- Meta's fields, unedited. The operator is shown Meta's own wording rather
-- than a paraphrase, because a paraphrase is one more place for the real
-- cause to get lost. Meta reuses generic sentences across unrelated
-- failures, so the numeric code and `error_data.details` are kept
-- alongside the message — those are what actually identify the problem.
--
--   error_code    Meta's numeric code, e.g. 131042 (payment method) or
--                 131047 (24-hour window closed). Kept as TEXT because
--                 non-Meta failures also land here (validation, database)
--                 and those have no number.
--   error_message Meta's most specific wording, verbatim.
--   error_details The full structured payload — subcode, fbtrace_id,
--                 error_data.details, HTTP status. For support tickets:
--                 Meta asks for fbtrace_id, and without it a report is
--                 much harder for them to act on.
--
-- All nullable. A NULL means "no recorded reason", which is the correct
-- state for every message that succeeded and for failures that predate
-- this migration. It must never be rendered as an empty error.

alter table public.messages
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists error_details jsonb;

comment on column public.messages.error_code is
  'Meta numeric error code as text (e.g. 131042), or a domain code for '
  'non-Meta failures. NULL when there is no recorded failure.';

comment on column public.messages.error_message is
  'Why the send failed, in Meta''s own words, verbatim and unparaphrased. '
  'Prefers error_user_msg, then error_data.details, then error.message.';

comment on column public.messages.error_details is
  'Full Meta error payload: subcode, fbtrace_id, details, HTTP status. '
  'Quote fbtrace_id when opening a Direct Support ticket with Meta.';

-- Partial index: the only queries this serves are "show me the failures",
-- which never touch the NULL rows. Excluding them keeps the index small
-- as successful messages accumulate — and they vastly outnumber failures.
create index if not exists idx_messages_failed_with_reason
  on public.messages (conversation_id, created_at desc)
  where status = 'failed';
