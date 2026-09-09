-- ============================================================
-- SUPER ADMIN NOTIFICATIONS
--
-- Why this exists: the super-admin bell had no notifications behind it
-- at all. It fetched the health dashboard's `activity_feed` and set the
-- badge to `Math.min(feed.length, 9)`, so the count was a capped tally
-- of recent platform activity, not unread anything. "Marking read" was
-- a local `setUnreadCount(0)` with nothing to persist to, which is why
-- the badge came back on refresh — and, worse, came back on its own
-- every two minutes when the poll re-ran.
--
-- The tenant `notifications` table (migration 027) cannot serve this:
-- `account_id` is NOT NULL, `user_id` is the assigned agent, the type
-- CHECK admits exactly one value, and RLS scopes reads to
-- `auth.uid() = user_id`. Platform events belong to no account and are
-- addressed to every operator, so they need their own table.
--
-- Read state is modelled as a SEPARATE per-admin table rather than a
-- `read_at` column on the event. Events are written by triggers that
-- have no idea who the operators are, operators come and go, and each
-- one needs their own badge. A column would force the trigger to fan
-- out one row per admin at insert time and would make "read" a
-- property of the event instead of a property of the reader.
-- ============================================================

-- ------------------------------------------------------------
-- Who counts as an operator
-- ------------------------------------------------------------
-- SECURITY DEFINER so the policies below can consult `profiles`
-- without needing a SELECT policy that would expose the flag more
-- widely. STABLE so Postgres can cache it per statement.
CREATE OR REPLACE FUNCTION public.is_super_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid() AND is_super_admin = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin_user() TO authenticated;

-- ------------------------------------------------------------
-- The events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  type TEXT NOT NULL CHECK (type IN (
    'account_created',
    'account_banned',
    'payment_requested',
    'payment_verified',
    'payment_rejected',
    'contact_submitted',
    'newsletter_subscribed',
    'template_rejected',
    'subscription_expiring'
  )),

  -- Drives the icon and colour, and lets the UI sort urgency without
  -- hardcoding a per-type mapping that drifts from this list.
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'critical')),

  title TEXT NOT NULL,
  body TEXT,

  -- Context. Nullable because plenty of platform events (a website
  -- enquiry, a newsletter signup) belong to no tenant at all.
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  account_name TEXT,

  -- What the notification is about, so the UI can deep-link and so a
  -- backfill can avoid duplicating rows it already created.
  entity_type TEXT,
  entity_id UUID,

  -- Relative href inside the admin panel. Stored rather than derived so
  -- the destination travels with the event and one renderer handles
  -- every type.
  link TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_notifications_created
  ON super_admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_notifications_entity
  ON super_admin_notifications(entity_type, entity_id);

-- ------------------------------------------------------------
-- Per-operator read state
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admin_notification_reads (
  notification_id UUID NOT NULL
    REFERENCES super_admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sa_notification_reads_user
  ON super_admin_notification_reads(user_id);

-- Realtime DELETE payloads carry only the primary key unless replica
-- identity is full. The badge needs `user_id` on a delete to know
-- whether the change was even about the current operator.
ALTER TABLE super_admin_notification_reads REPLICA IDENTITY FULL;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE super_admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- Operators can read every platform event. There is deliberately NO
-- client INSERT/UPDATE/DELETE policy: events are created by the
-- triggers below (SECURITY DEFINER) and by service-role code, never by
-- a browser, so a compromised admin session cannot forge history.
DROP POLICY IF EXISTS sa_notifications_select ON super_admin_notifications;
CREATE POLICY sa_notifications_select ON super_admin_notifications
  FOR SELECT USING (public.is_super_admin_user());

-- Read state is the one thing a browser may write, and only its own.
DROP POLICY IF EXISTS sa_notification_reads_select ON super_admin_notification_reads;
DROP POLICY IF EXISTS sa_notification_reads_insert ON super_admin_notification_reads;
DROP POLICY IF EXISTS sa_notification_reads_delete ON super_admin_notification_reads;

CREATE POLICY sa_notification_reads_select ON super_admin_notification_reads
  FOR SELECT USING (user_id = auth.uid() AND public.is_super_admin_user());
CREATE POLICY sa_notification_reads_insert ON super_admin_notification_reads
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_super_admin_user());
-- DELETE exists so "mark as unread" is possible without a second table.
CREATE POLICY sa_notification_reads_delete ON super_admin_notification_reads
  FOR DELETE USING (user_id = auth.uid() AND public.is_super_admin_user());

-- ------------------------------------------------------------
-- Insert helper
-- ------------------------------------------------------------
-- Keeps every trigger body to a single call, so adding an event type
-- later cannot accidentally diverge on column order or defaults.
CREATE OR REPLACE FUNCTION public.fn_sa_notify(
  p_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_body TEXT,
  p_account_id UUID DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO super_admin_notifications (
    type, severity, title, body,
    account_id, account_name, entity_type, entity_id, link
  ) VALUES (
    p_type, p_severity, p_title, p_body,
    p_account_id, p_account_name, p_entity_type, p_entity_id, p_link
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER FUNCTION public.fn_sa_notify(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_sa_notify(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC;

-- ============================================================
-- TRIGGERS
--
-- Every one of these swallows its own errors and returns the row
-- unchanged, following the precedent set by
-- `notify_conversation_assigned` in migration 027. These fire on
-- signup, on payment, on a website enquiry — a notification bug must
-- never be able to block a customer paying or an account being
-- created.
-- ============================================================

-- ---- new workspace ----------------------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_account_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sa_notify(
    'account_created',
    'success',
    'New workspace signed up',
    NEW.name,
    NEW.id,
    NEW.name,
    'account',
    NEW.id,
    '/super-admin/accounts/' || NEW.id::TEXT
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_account_created failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_account_created() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_account_created ON accounts;
CREATE TRIGGER trg_sa_notify_account_created
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_account_created();

-- ---- account banned ---------------------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_account_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_banned = TRUE AND COALESCE(OLD.is_banned, FALSE) = FALSE THEN
    PERFORM public.fn_sa_notify(
      'account_banned',
      'warning',
      'Workspace banned',
      NEW.name || COALESCE(' — ' || NEW.banned_reason, ''),
      NEW.id,
      NEW.name,
      'account',
      NEW.id,
      '/super-admin/accounts/' || NEW.id::TEXT
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_account_banned failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_account_banned() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_account_banned ON accounts;
CREATE TRIGGER trg_sa_notify_account_banned
  AFTER UPDATE OF is_banned ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_account_banned();

-- ---- payment raised / reviewed -----------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_payment_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_name TEXT;
  v_amount TEXT;
BEGIN
  SELECT name INTO v_account_name FROM accounts WHERE id = NEW.account_id;
  v_amount := NEW.currency || ' ' || TRIM(TO_CHAR(NEW.paid_amount, 'FM999999990.00'));

  IF TG_OP = 'INSERT' THEN
    -- The one notification an operator must not miss: money is sitting
    -- unverified and the customer is waiting on a manual check.
    PERFORM public.fn_sa_notify(
      'payment_requested',
      'critical',
      'Payment awaiting verification',
      COALESCE(v_account_name, 'A workspace') || ' paid ' || v_amount
        || ' for ' || NEW.plan_name_snapshot || ' (' || NEW.cycle_label_snapshot || ')',
      NEW.account_id,
      v_account_name,
      'payment_request',
      NEW.id,
      '/super-admin/payments'
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'verified' THEN
      PERFORM public.fn_sa_notify(
        'payment_verified',
        'success',
        'Payment verified',
        COALESCE(v_account_name, 'A workspace') || ' — ' || v_amount
          || ' for ' || NEW.plan_name_snapshot,
        NEW.account_id,
        v_account_name,
        'payment_request',
        NEW.id,
        '/super-admin/payments'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.fn_sa_notify(
        'payment_rejected',
        'warning',
        'Payment rejected',
        COALESCE(v_account_name, 'A workspace') || ' — ' || v_amount
          || COALESCE(' — ' || NEW.review_note, ''),
        NEW.account_id,
        v_account_name,
        'payment_request',
        NEW.id,
        '/super-admin/payments'
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_payment_request failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_payment_request() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_payment_request ON payment_requests;
CREATE TRIGGER trg_sa_notify_payment_request
  AFTER INSERT OR UPDATE OF status ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_payment_request();

-- ---- website enquiry --------------------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_contact_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sa_notify(
    'contact_submitted',
    'warning',
    'New enquiry from the website',
    NEW.name || ' <' || NEW.email || '>'
      || COALESCE(' — ' || NULLIF(NEW.subject, ''), ''),
    NULL,
    NULLIF(NEW.company, ''),
    'contact_submission',
    NEW.id,
    '/super-admin/contact'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_contact_submission failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_contact_submission() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_contact_submission ON contact_submissions;
CREATE TRIGGER trg_sa_notify_contact_submission
  AFTER INSERT ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_contact_submission();

-- ---- newsletter signup -----------------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_newsletter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sa_notify(
    'newsletter_subscribed',
    'info',
    'New newsletter subscriber',
    NEW.email || COALESCE(' — via ' || NULLIF(NEW.source, ''), ''),
    NULL,
    NULL,
    'newsletter_subscriber',
    NEW.id,
    '/super-admin/newsletter'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_newsletter failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_newsletter() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_newsletter ON newsletter_subscribers;
CREATE TRIGGER trg_sa_notify_newsletter
  AFTER INSERT ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_newsletter();

-- ---- template rejected by Meta ----------------------------
CREATE OR REPLACE FUNCTION public.sa_notify_template_rejected()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_name TEXT;
BEGIN
  IF NEW.status = 'REJECTED' AND COALESCE(OLD.status, '') <> 'REJECTED' THEN
    SELECT name INTO v_account_name FROM accounts WHERE id = NEW.account_id;
    PERFORM public.fn_sa_notify(
      'template_rejected',
      'warning',
      'Template rejected by Meta',
      COALESCE(v_account_name, 'A workspace') || ' — "' || NEW.name || '"'
        || COALESCE(': ' || NEW.rejection_reason, ''),
      NEW.account_id,
      v_account_name,
      'message_template',
      NEW.id,
      '/super-admin/accounts/' || NEW.account_id::TEXT
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_template_rejected failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sa_notify_template_rejected() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_sa_notify_template_rejected ON message_templates;
CREATE TRIGGER trg_sa_notify_template_rejected
  AFTER UPDATE OF status ON message_templates
  FOR EACH ROW EXECUTE FUNCTION public.sa_notify_template_rejected();

-- ============================================================
-- REALTIME
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'super_admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE super_admin_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'super_admin_notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE super_admin_notification_reads;
  END IF;
END $$;

-- ============================================================
-- BACKFILL
--
-- Seeds the last 90 days from what already happened, then marks every
-- seeded row READ for every current operator. Both halves matter: an
-- empty bell on day one looks broken, and nine freshly-minted "unread"
-- notifications for things the operator dealt with weeks ago is the
-- exact confusion this migration exists to remove.
--
-- Guarded by NOT EXISTS on (entity_type, entity_id) so re-running is
-- harmless.
-- ============================================================
DO $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 days';
BEGIN
  -- Accounts
  INSERT INTO super_admin_notifications (
    type, severity, title, body, account_id, account_name,
    entity_type, entity_id, link, created_at
  )
  SELECT
    'account_created', 'success', 'New workspace signed up', a.name,
    a.id, a.name, 'account', a.id,
    '/super-admin/accounts/' || a.id::TEXT, a.created_at
  FROM accounts a
  WHERE a.created_at >= v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM super_admin_notifications n
      WHERE n.entity_type = 'account' AND n.entity_id = a.id
        AND n.type = 'account_created'
    );

  -- Payment requests still awaiting a decision keep their urgency;
  -- reviewed ones are recorded as history at their reviewed severity.
  INSERT INTO super_admin_notifications (
    type, severity, title, body, account_id, account_name,
    entity_type, entity_id, link, created_at
  )
  SELECT
    CASE p.status
      WHEN 'verified' THEN 'payment_verified'
      WHEN 'rejected' THEN 'payment_rejected'
      ELSE 'payment_requested'
    END,
    CASE p.status
      WHEN 'verified' THEN 'success'
      WHEN 'rejected' THEN 'warning'
      ELSE 'critical'
    END,
    CASE p.status
      WHEN 'verified' THEN 'Payment verified'
      WHEN 'rejected' THEN 'Payment rejected'
      ELSE 'Payment awaiting verification'
    END,
    COALESCE(a.name, 'A workspace') || ' — ' || p.currency || ' '
      || TRIM(TO_CHAR(p.paid_amount, 'FM999999990.00'))
      || ' for ' || p.plan_name_snapshot,
    p.account_id, a.name, 'payment_request', p.id,
    '/super-admin/payments', p.created_at
  FROM payment_requests p
  LEFT JOIN accounts a ON a.id = p.account_id
  WHERE p.created_at >= v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM super_admin_notifications n
      WHERE n.entity_type = 'payment_request' AND n.entity_id = p.id
    );

  -- Website enquiries
  INSERT INTO super_admin_notifications (
    type, severity, title, body, entity_type, entity_id, link, created_at
  )
  SELECT
    'contact_submitted', 'warning', 'New enquiry from the website',
    c.name || ' <' || c.email || '>' || COALESCE(' — ' || NULLIF(c.subject, ''), ''),
    'contact_submission', c.id, '/super-admin/contact', c.created_at
  FROM contact_submissions c
  WHERE c.created_at >= v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM super_admin_notifications n
      WHERE n.entity_type = 'contact_submission' AND n.entity_id = c.id
    );

  -- Everything seeded above starts READ for everyone who is already an
  -- operator. A brand-new operator added later legitimately sees this
  -- history as unread, which is the right behaviour for them.
  INSERT INTO super_admin_notification_reads (notification_id, user_id, read_at)
  SELECT n.id, p.user_id, NOW()
  FROM super_admin_notifications n
  CROSS JOIN (
    SELECT user_id FROM profiles WHERE is_super_admin = TRUE
  ) p
  ON CONFLICT (notification_id, user_id) DO NOTHING;
END $$;

-- ============================================================
-- RPCs
-- ============================================================

-- Exact unread count for the calling operator.
--
-- A client-side diff of "latest N notifications" against "my reads"
-- would undercount the badge as soon as history outgrows the window,
-- and the badge being wrong is the entire bug this work exists to fix.
-- Counted in SQL instead, over the whole table.
--
-- Takes no user argument on purpose: it reads auth.uid() itself, so a
-- browser cannot ask for somebody else's count.
CREATE OR REPLACE FUNCTION public.fn_sa_unread_notification_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_super_admin_user() THEN 0
    ELSE (
      SELECT COUNT(*)::INTEGER
      FROM super_admin_notifications n
      WHERE NOT EXISTS (
        SELECT 1 FROM super_admin_notification_reads r
        WHERE r.notification_id = n.id AND r.user_id = auth.uid()
      )
    )
  END;
$$;

ALTER FUNCTION public.fn_sa_unread_notification_count() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_sa_unread_notification_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sa_unread_notification_count() TO authenticated;

-- Mark every currently-existing notification read for the caller.
--
-- Server-side so "mark all as read" is one round trip and is atomic:
-- doing it client-side meant sending N inserts, and any that failed
-- left a badge that silently disagreed with the list.
CREATE OR REPLACE FUNCTION public.fn_sa_mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_super_admin_user() THEN
    RETURN 0;
  END IF;

  WITH inserted AS (
    INSERT INTO super_admin_notification_reads (notification_id, user_id)
    SELECT n.id, auth.uid()
    FROM super_admin_notifications n
    WHERE NOT EXISTS (
      SELECT 1 FROM super_admin_notification_reads r
      WHERE r.notification_id = n.id AND r.user_id = auth.uid()
    )
    ON CONFLICT (notification_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

ALTER FUNCTION public.fn_sa_mark_all_notifications_read() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_sa_mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sa_mark_all_notifications_read() TO authenticated;

-- ============================================================
-- GRANT HARDENING
--
-- `REVOKE ... FROM PUBLIC` above is not sufficient on its own: this
-- project grants EXECUTE to `anon` and `authenticated` explicitly, so
-- every SECURITY DEFINER function here stayed reachable at
-- /rest/v1/rpc/<name>. For `fn_sa_notify` that meant any signed-in user
-- — or an anonymous caller — could mint arbitrary super-admin
-- notifications, defeating the reason the table has no client INSERT
-- policy at all. Caught by the Supabase security advisor.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.fn_sa_notify(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sa_notify_account_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_notify_account_banned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_notify_payment_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_notify_contact_submission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_notify_newsletter() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_notify_template_rejected() FROM PUBLIC, anon, authenticated;

-- These three the browser legitimately needs, but only once signed in.
-- Each re-checks `is_super_admin_user()` internally and reads auth.uid()
-- rather than trusting an argument, so a non-admin calling them gets
-- 0 / a no-op rather than data.
REVOKE EXECUTE ON FUNCTION public.is_super_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin_user() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_sa_unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sa_unread_notification_count() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_sa_mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sa_mark_all_notifications_read() TO authenticated;
