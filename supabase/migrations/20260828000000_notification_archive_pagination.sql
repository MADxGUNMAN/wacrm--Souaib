-- Secure, server-only archive queries for the super-admin notification centre.
-- Read state remains scoped to one operator; neither function is browser-callable.

CREATE OR REPLACE FUNCTION public.fn_sa_list_notifications_for_admin(
  p_user_id UUID,
  p_read_filter TEXT DEFAULT 'all',
  p_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  severity TEXT,
  title TEXT,
  body TEXT,
  account_id UUID,
  account_name TEXT,
  entity_type TEXT,
  entity_id UUID,
  link TEXT,
  created_at TIMESTAMPTZ,
  is_read BOOLEAN,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      n.*,
      EXISTS (
        SELECT 1
        FROM super_admin_notification_reads r
        WHERE r.notification_id = n.id
          AND r.user_id = p_user_id
      ) AS operator_has_read
    FROM super_admin_notifications n
    WHERE EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.user_id = p_user_id
        AND p.is_super_admin = TRUE
    )
      AND (p_type IS NULL OR n.type = p_type)
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR n.title ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(n.body, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(n.account_name, '') ILIKE '%' || BTRIM(p_search) || '%'
      )
  ), filtered AS (
    SELECT *
    FROM scoped
    WHERE p_read_filter = 'all'
      OR (p_read_filter = 'read' AND operator_has_read)
      OR (p_read_filter = 'unread' AND NOT operator_has_read)
  )
  SELECT
    f.id,
    f.type,
    f.severity,
    f.title,
    f.body,
    f.account_id,
    f.account_name,
    f.entity_type,
    f.entity_id,
    f.link,
    f.created_at,
    f.operator_has_read AS is_read,
    COUNT(*) OVER () AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

ALTER FUNCTION public.fn_sa_list_notifications_for_admin(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_sa_list_notifications_for_admin(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sa_list_notifications_for_admin(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_sa_notification_summary_for_admin(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authorized AS (
    SELECT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = p_user_id
        AND p.is_super_admin = TRUE
    ) AS allowed
  ), notification_stats AS (
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1
          FROM super_admin_notification_reads r
          WHERE r.notification_id = n.id
            AND r.user_id = p_user_id
        )
      )::INTEGER AS unread,
      COUNT(*) FILTER (WHERE n.severity = 'critical')::INTEGER AS critical,
      COUNT(*) FILTER (
        WHERE n.created_at >= NOW() - INTERVAL '24 hours'
      )::INTEGER AS recent_24_hours
    FROM super_admin_notifications n, authorized a
    WHERE a.allowed
  ), type_stats AS (
    SELECT COALESCE(JSONB_OBJECT_AGG(grouped.type, grouped.count), '{}'::JSONB) AS by_type
    FROM (
      SELECT n.type, COUNT(*)::INTEGER AS count
      FROM super_admin_notifications n, authorized a
      WHERE a.allowed
      GROUP BY n.type
    ) grouped
  )
  SELECT JSONB_BUILD_OBJECT(
    'total', s.total,
    'unread', s.unread,
    'critical', s.critical,
    'recent_24_hours', s.recent_24_hours,
    'by_type', t.by_type
  )
  FROM notification_stats s
  CROSS JOIN type_stats t;
$$;

ALTER FUNCTION public.fn_sa_notification_summary_for_admin(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_sa_notification_summary_for_admin(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sa_notification_summary_for_admin(UUID)
  TO service_role;

-- The canonical payment status is `approved`, not `verified`. Preserve the
-- product-facing notification wording while making future approvals emit.
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
    PERFORM public.fn_sa_notify(
      'payment_requested', 'critical', 'Payment awaiting verification',
      COALESCE(v_account_name, 'A workspace') || ' paid ' || v_amount
        || ' for ' || NEW.plan_name_snapshot || ' (' || NEW.cycle_label_snapshot || ')',
      NEW.account_id, v_account_name, 'payment_request', NEW.id,
      '/super-admin/payments'
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.fn_sa_notify(
        'payment_verified', 'success', 'Payment verified',
        COALESCE(v_account_name, 'A workspace') || ' — ' || v_amount
          || ' for ' || NEW.plan_name_snapshot,
        NEW.account_id, v_account_name, 'payment_request', NEW.id,
        '/super-admin/payments'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.fn_sa_notify(
        'payment_rejected', 'warning', 'Payment rejected',
        COALESCE(v_account_name, 'A workspace') || ' — ' || v_amount
          || COALESCE(' — ' || NEW.review_note, ''),
        NEW.account_id, v_account_name, 'payment_request', NEW.id,
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
REVOKE EXECUTE ON FUNCTION public.sa_notify_payment_request()
  FROM PUBLIC, anon, authenticated;

-- Repair rows created by the old backfill and point enquiry notifications at
-- the route that actually exists.
UPDATE super_admin_notifications n
SET
  type = 'payment_verified',
  severity = 'success',
  title = 'Payment verified'
FROM payment_requests p
WHERE n.entity_type = 'payment_request'
  AND n.entity_id = p.id
  AND n.type = 'payment_requested'
  AND p.status = 'approved';

CREATE OR REPLACE FUNCTION public.sa_notify_contact_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sa_notify(
    'contact_submitted', 'warning', 'New enquiry from the website',
    NEW.name || ' <' || NEW.email || '>'
      || COALESCE(' — ' || NULLIF(NEW.subject, ''), ''),
    NULL, NULLIF(NEW.company, ''), 'contact_submission', NEW.id,
    '/super-admin/contact-submissions'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sa_notify_contact_submission failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.sa_notify_contact_submission() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.sa_notify_contact_submission()
  FROM PUBLIC, anon, authenticated;

UPDATE super_admin_notifications
SET link = '/super-admin/contact-submissions'
WHERE entity_type = 'contact_submission'
  AND link = '/super-admin/contact';
