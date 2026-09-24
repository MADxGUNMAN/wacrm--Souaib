-- ============================================================
-- Super Admin deep dive: two more WhatsApp facts, and no new secrets.
--
-- WHY
-- The platform operator could not answer, per tenant: which flow they
-- connected through, whether they are on pure Cloud API or Coexistence,
-- whether their number is registered, whether webhooks are subscribed, or
-- when their token expires. Every one of those columns already existed on
-- `whatsapp_config` and most were already returned by this function — they
-- were simply never rendered. The card showed three fields: number, phone id,
-- WABA id.
--
-- So this migration is small on purpose. It adds the only two facts the
-- function was genuinely missing:
--
--   insights_enabled_at   whether template analytics were ever switched on
--                         (added by 20260917180000, after 078 wrote this
--                         function, so it was never included)
--   has_two_step_pin      whether a two-step PIN is stored
--
-- HAS_TWO_STEP_PIN IS A BOOLEAN, NOT THE PIN
-- `whatsapp_config.two_step_pin` is the only copy of a PIN this app
-- generated — Meta cannot return it — and it is encrypted at rest. Whether
-- one exists is useful to an operator diagnosing a failed registration;
-- the value itself is never useful in a browser. Migration 078 exists
-- precisely because `row_to_json(wc.*)` shipped every column including the
-- token, so this stays an explicit column list and the PIN is reduced to a
-- boolean at the SQL boundary rather than filtered out later.
--
-- Everything else in the function is unchanged and re-declared verbatim,
-- because CREATE OR REPLACE FUNCTION has no partial form.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_account_deep_dive(target_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
      SELECT json_build_object(
        'id', wc.id,
        'account_id', wc.account_id,
        'user_id', wc.user_id,
        'phone_number_id', wc.phone_number_id,
        'display_phone_number', wc.display_phone_number,
        'verified_name', wc.verified_name,
        'waba_id', wc.waba_id,
        'status', wc.status,
        'connected_at', wc.connected_at,
        'registered_at', wc.registered_at,
        'subscribed_apps_at', wc.subscribed_apps_at,
        'last_registration_error', wc.last_registration_error,
        'connection_source', wc.connection_source,
        'connection_mode', wc.connection_mode,
        'coexistence_detected_at', wc.coexistence_detected_at,
        'disconnect_event', wc.disconnect_event,
        'disconnect_reason', wc.disconnect_reason,
        'disconnected_at', wc.disconnected_at,
        'token_expires_at', wc.token_expires_at,
        -- NEW: added by 20260917180000, after 078 last wrote this function.
        'insights_enabled_at', wc.insights_enabled_at,
        -- NEW, and deliberately a boolean. The PIN is encrypted and is the
        -- only copy in existence; whether one EXISTS helps diagnose a failed
        -- registration, the value never helps a browser.
        'has_two_step_pin', (wc.two_step_pin IS NOT NULL)
        -- access_token and verify_token remain deliberately absent.
      )
      FROM whatsapp_config wc WHERE wc.account_id = target_account_id
      LIMIT 1
    )
  ) INTO result;
  RETURN result;
END;
$function$;
