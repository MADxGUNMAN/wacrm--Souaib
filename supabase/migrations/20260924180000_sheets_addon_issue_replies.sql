-- ============================================================
-- Issue reports: inbox statuses + operator reply thread.
--
-- Brings the add-on's issue reports in line with the contact-submissions
-- inbox, which is the pattern operators already know: a report arrives
-- `new`, flips to `read` the moment it is opened, and becomes `replied`
-- when an operator emails the reporter back.
--
-- WHY THE STATUS SET CHANGES
-- The original set (new / in_progress / resolved / closed) described a
-- bug tracker. What operators actually do with these is answer them, and
-- two inboxes side by side in the same panel with different vocabularies
-- and different behaviours is its own source of mistakes. So this adopts
-- contact_submissions' set verbatim: new / read / replied / archived.
--
-- The mapping below is written even though today's data is a single row
-- with status 'new'. A CHECK constraint swap that assumes the table is
-- nearly empty is exactly the migration that breaks when it meets a
-- staging database someone has been clicking around in.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Re-map then re-constrain the status column
-- ------------------------------------------------------------
-- Drop FIRST: the old constraint forbids the new values, so the UPDATE
-- below would be rejected by it mid-migration.
ALTER TABLE public.sheets_addon_issue_reports
  DROP CONSTRAINT IF EXISTS sheets_addon_issue_reports_status_check;

UPDATE public.sheets_addon_issue_reports
SET status = CASE status
      WHEN 'in_progress' THEN 'read'
      WHEN 'resolved'    THEN 'replied'
      WHEN 'closed'      THEN 'archived'
      ELSE status
    END
WHERE status IN ('in_progress', 'resolved', 'closed');

ALTER TABLE public.sheets_addon_issue_reports
  ADD CONSTRAINT sheets_addon_issue_reports_status_check
  CHECK (status IN ('new', 'read', 'replied', 'archived'));

COMMENT ON COLUMN public.sheets_addon_issue_reports.status IS
  'new (unopened) -> read (opened in Super Admin) -> replied (operator emailed the reporter) -> archived (manually filed away). Mirrors contact_submissions so both inboxes behave identically.';

COMMENT ON COLUMN public.sheets_addon_issue_reports.resolved_at IS
  'Stamped when the report moves to replied or archived, cleared when it moves back. Maintained server-side so the timestamp can never disagree with the status it describes.';

-- ------------------------------------------------------------
-- 2. The reply thread
-- ------------------------------------------------------------
-- Mirrors contact_replies. `sent_by` is the display name shown in the
-- thread; `sent_by_email` records WHICH operator actually sent it, which
-- the contact-replies table does not capture at all — it hardcodes
-- 'Super Admin' and loses the identity. With more than one operator,
-- "who answered this?" is a question worth being able to answer.
CREATE TABLE IF NOT EXISTS public.sheets_addon_issue_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE so deleting a report takes its thread with it, and the
  -- delete action needs no cleanup pass of its own.
  report_id UUID NOT NULL
    REFERENCES public.sheets_addon_issue_reports(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  body    TEXT NOT NULL,

  sent_by       TEXT NOT NULL DEFAULT 'Super Admin',
  sent_by_email TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sheets_addon_issue_replies_report_idx
  ON public.sheets_addon_issue_replies (report_id, created_at);

COMMENT ON TABLE public.sheets_addon_issue_replies IS
  'Operator replies emailed back to an add-on issue reporter. A row exists only if the email was accepted by SMTP, so the thread never claims a message was sent when it was not.';
COMMENT ON COLUMN public.sheets_addon_issue_replies.sent_by_email IS
  'The authenticated super admin who sent this reply. Audit only; the thread displays sent_by.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Every read and write goes through the service-role client, so this is
-- a backstop rather than the mechanism. With RLS on and only a
-- super-admin policy present, a browser-side client reaching this table
-- gets nothing.
--
-- Deliberately NOT the `FOR ALL USING (true) WITH CHECK (true)` policy
-- that contact_replies carries: that grants the `anon` role full access
-- to reply bodies over PostgREST. Reply text can quote a customer's
-- message, so it gets the same treatment as the reports themselves.
ALTER TABLE public.sheets_addon_issue_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sheets_addon_issue_replies_all_super_admin
  ON public.sheets_addon_issue_replies;
CREATE POLICY sheets_addon_issue_replies_all_super_admin
  ON public.sheets_addon_issue_replies
  FOR ALL
  TO authenticated
  USING (public.is_super_admin_user())
  WITH CHECK (public.is_super_admin_user());

COMMENT ON POLICY sheets_addon_issue_replies_all_super_admin
  ON public.sheets_addon_issue_replies IS
  'Operators only. Reply bodies quote reporter messages and may contain personal data, so there is no member-level or anonymous read path.';
