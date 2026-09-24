-- ============================================================
-- Super Admin deep dive: broadcast and template counts.
--
-- WHY
-- The header row let the operator see members, contacts, messages and
-- automations per tenant, but not how much they actually SEND — which is the
-- thing that costs money and the thing a support conversation is usually
-- about. Two counts were missing:
--
--   broadcasts_total     every broadcast the tenant has created
--   templates_approved   templates Meta has actually approved
--
-- WHY broadcasts_total AND NOT THE EXISTING broadcasts_sent
-- `broadcasts_sent` already existed, filtered to `status = 'sent'`. It is the
-- right number for "how many landed", and the WRONG number for the header,
-- because it does not match what the operator sees on the tenant's own
-- Broadcasts page — that page lists every run regardless of outcome.
--
-- Verified against live data before choosing: account 44edbfb1 has four
-- broadcasts, three sent and one failed. Its Broadcasts page shows four rows,
-- so a header tile reading "3" would look like a bug in one of the two
-- screens. Both counts are now returned; the header uses the total and
-- `broadcasts_sent` stays available for anything that wants delivery only.
--
-- WHY UPPER() ON THE TEMPLATE STATUS
-- Live values are uppercase ('APPROVED'), but this codebase carries a
-- `template-status-normalize` helper precisely because casing has not always
-- been consistent, so the comparison is made case-insensitive rather than
-- assuming. `templates_total` comes along for context: "2 approved" means
-- something different when there are 2 templates than when there are 40.
--
-- Everything else is re-declared verbatim — CREATE OR REPLACE FUNCTION has no
-- partial form.
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
      -- Delivery-only. Kept because other screens may want it.
      'broadcasts_sent', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id AND status = 'sent'),
      -- NEW. Every run, matching what the tenant's own Broadcasts page lists.
      'broadcasts_total', (SELECT COUNT(*) FROM broadcasts WHERE account_id = target_account_id),
      -- NEW. Context for the approved figure below.
      'templates_total', (SELECT COUNT(*) FROM message_templates WHERE account_id = target_account_id),
      -- NEW. Case-insensitive on purpose; see the header comment.
      'templates_approved', (SELECT COUNT(*) FROM message_templates WHERE account_id = target_account_id AND UPPER(status) = 'APPROVED'),
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
        'insights_enabled_at', wc.insights_enabled_at,
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
