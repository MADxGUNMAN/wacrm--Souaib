-- ============================================================
-- 043_platform_analytics.sql
-- Views and RPCs for super admin analytics
-- ============================================================

-- 1. Platform-wide account summary view
CREATE OR REPLACE VIEW v_platform_accounts_summary AS
SELECT 
  a.id AS account_id,
  a.name AS account_name,
  a.is_banned,
  a.banned_at,
  a.banned_reason,
  a.created_at AS account_created_at,
  -- Owner info
  p_owner.user_id AS owner_user_id,
  p_owner.full_name AS owner_name,
  p_owner.email AS owner_email,
  p_owner.avatar_url AS owner_avatar_url,
  -- Member count
  (SELECT COUNT(*) FROM profiles p2 WHERE p2.account_id = a.id) AS member_count,
  -- Contact count
  (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id) AS contact_count,
  -- Conversation count
  (SELECT COUNT(*) FROM conversations cv WHERE cv.account_id = a.id) AS conversation_count,
  -- Message count (last 30 days)
  (SELECT COUNT(*) FROM messages m 
   JOIN conversations cv2 ON cv2.id = m.conversation_id 
   WHERE cv2.account_id = a.id 
   AND m.created_at > NOW() - INTERVAL '30 days') AS messages_30d,
  -- WhatsApp connection status
  (SELECT wc.status FROM whatsapp_config wc WHERE wc.account_id = a.id LIMIT 1) AS whatsapp_status,
  -- Last activity (most recent message)
  (SELECT MAX(m2.created_at) FROM messages m2 
   JOIN conversations cv3 ON cv3.id = m2.conversation_id 
   WHERE cv3.account_id = a.id) AS last_activity_at
FROM accounts a
JOIN profiles p_owner ON p_owner.user_id = a.owner_user_id;

-- 2. Platform metrics RPC
CREATE OR REPLACE FUNCTION fn_platform_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_accounts', (SELECT COUNT(*) FROM accounts),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'active_today', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '24 hours'),
    'active_7d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '7 days'),
    'active_30d', (SELECT COUNT(DISTINCT p.account_id) FROM profiles p 
      JOIN member_presence mp ON mp.user_id = p.user_id 
      WHERE mp.last_seen_at > NOW() - INTERVAL '30 days'),
    'messages_today', (SELECT COUNT(*) FROM messages WHERE created_at > CURRENT_DATE),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_accounts_today', (SELECT COUNT(*) FROM accounts WHERE created_at > CURRENT_DATE),
    'new_accounts_7d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '7 days'),
    'new_accounts_30d', (SELECT COUNT(*) FROM accounts WHERE created_at > NOW() - INTERVAL '30 days'),
    'banned_accounts', (SELECT COUNT(*) FROM accounts WHERE is_banned = TRUE),
    'total_contacts', (SELECT COUNT(*) FROM contacts),
    'total_broadcasts', (SELECT COUNT(*) FROM broadcasts),
    'total_automations', (SELECT COUNT(*) FROM automations WHERE is_active = TRUE),
    'total_deals_value', (SELECT COALESCE(SUM(value), 0) FROM deals WHERE status = 'open'),
    'connected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'connected'),
    'disconnected_whatsapp', (SELECT COUNT(*) FROM whatsapp_config WHERE status = 'disconnected')
  ) INTO result;
  RETURN result;
END;
$$;

-- 3. Account deep dive RPC
CREATE OR REPLACE FUNCTION fn_account_deep_dive(target_account_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'account', (SELECT row_to_json(a.*) FROM accounts a WHERE a.id = target_account_id),
    'members', (
      SELECT json_agg(json_build_object(
        'user_id', p.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'avatar_url', p.avatar_url,
        'account_role', p.account_role,
        'permissions', p.permissions,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'last_seen_at', (SELECT mp.last_seen_at FROM member_presence mp WHERE mp.user_id = p.user_id),
        'is_online', (SELECT mp.last_seen_at > NOW() - INTERVAL '5 minutes' FROM member_presence mp WHERE mp.user_id = p.user_id)
      ))
      FROM profiles p WHERE p.account_id = target_account_id
    ),
    'stats', json_build_object(
      'contact_count', (SELECT COUNT(*) FROM contacts WHERE account_id = target_account_id),
      'conversation_count', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id),
      'active_conversations', (SELECT COUNT(*) FROM conversations WHERE account_id = target_account_id AND status = 'open'),
      'messages_total', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id),
      'messages_30d', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = target_account_id AND m.created_at > NOW() - INTERVAL '30 days'),
      'active_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id AND is_active = TRUE),
      'total_automations', (SELECT COUNT(*) FROM automations WHERE account_id = target_account_id),
      'broadcasts_sent', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id AND status = 'sent'),
      'deals_open_value', (SELECT COALESCE(SUM(value), 0) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open'),
      'deals_open_count', (SELECT COUNT(*) FROM deals d JOIN pipelines pl ON pl.id = d.pipeline_id WHERE pl.account_id = target_account_id AND d.status = 'open')
    ),
    'whatsapp_config', (
      SELECT row_to_json(wc.*)
      FROM whatsapp_config wc WHERE wc.account_id = target_account_id
      LIMIT 1
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- 4. New signups over time (for growth chart)
CREATE OR REPLACE FUNCTION fn_signups_over_time(days_back INTEGER DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT 
      d::date AS date,
      (SELECT COUNT(*) FROM accounts WHERE created_at::date = d::date) AS new_accounts,
      (SELECT COUNT(*) FROM profiles WHERE created_at::date = d::date) AS new_users
    FROM generate_series(
      CURRENT_DATE - (days_back || ' days')::INTERVAL,
      CURRENT_DATE,
      '1 day'::INTERVAL
    ) AS d
    ORDER BY d
  ) t;
  RETURN result;
END;
$$;
