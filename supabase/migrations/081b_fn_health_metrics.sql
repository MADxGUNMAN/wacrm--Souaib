-- ============================================================
-- 081b_fn_health_metrics.sql
--
-- Adds `fn_health_metrics()` — the RPC behind the super admin Health
-- dashboard (src/lib/super-admin/queries.ts -> getHealthDashboardData).
--
-- ─── WHY THIS FILE EXISTS ───────────────────────────────────
--
-- Schema drift. This function has existed in PRODUCTION for a while but
-- was never committed as a migration — it was created directly against
-- the hosted database. Nothing caught it, because the only environment
-- anyone ran was the one that already had it.
--
-- It surfaced when the full migration history was replayed against an
-- empty local Postgres: 082_security_advisor_hardening.sql references
-- the function to pin its search_path, and died with
--
--   ERROR: function public.fn_health_metrics() does not exist
--
-- taking migrations 082-086 down with it. A fresh install of this repo
-- could therefore never reach a working schema.
--
-- The body below is the definition read back out of production
-- verbatim, so local and prod agree exactly.
--
-- ─── WHY THE ODD FILENAME ───────────────────────────────────
--
-- Migrations are applied in filename order, and this has to land AFTER
-- the tables it counts and BEFORE 082 hardens it. `_` (0x5F) sorts
-- before `b` (0x62), so `081_...` < `081b_...` < `082_...` — exactly the
-- slot required.
--
-- Already present in production, so this is a no-op there:
-- CREATE OR REPLACE makes re-application safe either way.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_health_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_metrics jsonb;
  v_message_volume jsonb;
  v_activity_feed jsonb;
  v_table_stats jsonb;
BEGIN
  -- 1. KPI Metrics
  SELECT jsonb_build_object(
    'total_messages', (SELECT count(*) FROM messages),
    'messages_today', (SELECT count(*) FROM messages WHERE created_at >= CURRENT_DATE),
    'messages_7d', (SELECT count(*) FROM messages WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    'total_contacts', (SELECT count(*) FROM contacts),
    'total_conversations', (SELECT count(*) FROM conversations),
    'total_accounts', (SELECT count(*) FROM accounts),
    'active_accounts', (SELECT count(*) FROM accounts WHERE is_banned = false),
    'banned_accounts', (SELECT count(*) FROM accounts WHERE is_banned = true),
    'total_ai_tokens', COALESCE((SELECT sum(total_tokens) FROM ai_usage_log), 0),
    'ai_requests_today', (SELECT count(*) FROM ai_usage_log WHERE created_at >= CURRENT_DATE),
    'total_automation_runs', (SELECT count(*) FROM automation_logs),
    'automation_runs_today', (SELECT count(*) FROM automation_logs WHERE created_at >= CURRENT_DATE),
    'total_broadcasts', (SELECT count(*) FROM broadcasts),
    'total_users', (SELECT count(*) FROM profiles),
    'connected_whatsapp', (SELECT count(*) FROM whatsapp_config WHERE status = 'connected')
  ) INTO v_metrics;

  -- 2. Message volume per day (last 30 days)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('date', d.day::text, 'count', COALESCE(m.cnt, 0))
    ORDER BY d.day
  ), '[]'::jsonb)
  INTO v_message_volume
  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') AS d(day)
  LEFT JOIN (
    SELECT date_trunc('day', created_at)::date AS msg_day, count(*) AS cnt
    FROM messages
    WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY msg_day
  ) m ON m.msg_day = d.day::date;

  -- 3. Recent activity feed (last 50 events combined)
  WITH combined AS (
    (SELECT 'account_created' AS event_type,
            'New account created: ' || a.name AS description,
            a.name AS account_name,
            a.created_at AS ts
     FROM accounts a
     ORDER BY a.created_at DESC LIMIT 15)
    UNION ALL
    (SELECT 'broadcast_sent',
            'Broadcast "' || b.name || '" sent to ' || COALESCE(b.total_recipients, 0) || ' recipients',
            COALESCE((SELECT name FROM accounts WHERE id = b.account_id), 'Unknown'),
            b.created_at
     FROM broadcasts b
     ORDER BY b.created_at DESC LIMIT 15)
    UNION ALL
    (SELECT 'automation_triggered',
            'Automation triggered: ' || COALESCE(al.trigger_event, 'unknown') || ' (' || COALESCE(al.status, 'unknown') || ')',
            COALESCE((SELECT name FROM accounts WHERE id = al.account_id), 'Unknown'),
            al.created_at
     FROM automation_logs al
     ORDER BY al.created_at DESC LIMIT 20)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type', event_type,
      'description', description,
      'account_name', account_name,
      'timestamp', ts
    ) ORDER BY ts DESC
  ), '[]'::jsonb)
  INTO v_activity_feed
  FROM combined;

  -- 4. Table stats
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table_name', t.table_name,
      'row_count', COALESCE(s.n_live_tup, 0)
    ) ORDER BY t.table_name
  ), '[]'::jsonb)
  INTO v_table_stats
  FROM (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) t
  LEFT JOIN pg_stat_user_tables s ON s.schemaname = 'public' AND s.relname = t.table_name;

  -- Combine
  result := jsonb_build_object(
    'metrics', v_metrics,
    'message_volume', v_message_volume,
    'activity_feed', v_activity_feed,
    'table_stats', v_table_stats
  );

  RETURN result;
END;
$function$;

ALTER FUNCTION public.fn_health_metrics() OWNER TO postgres;

-- Service-role only, matching what 082 enforces for the other
-- super-admin RPCs. src/lib/super-admin/queries.ts calls this with
-- supabaseAdmin(), never from the browser.
REVOKE EXECUTE ON FUNCTION public.fn_health_metrics() FROM PUBLIC, anon, authenticated;
