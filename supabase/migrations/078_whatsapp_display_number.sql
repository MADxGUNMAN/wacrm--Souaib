-- ============================================================
-- 078 — store the actual WhatsApp phone number
--
-- The super admin panel showed "Phone Number: 870875646113078". That is
-- the phone_number_id, a Meta asset id, and it was rendered under a
-- "Phone Number" label because THE REAL NUMBER WAS NEVER STORED. Settings
-- → WhatsApp Setup had the same bug from the other direction: it fell
-- back to `+${phone_number_id}`, printing a 15-digit id with a plus in
-- front of it, which looks exactly like a phone number and is not one.
--
-- Both connect paths (embedded signup and the manual form) already call
-- verifyPhoneNumber() and receive display_phone_number in the response —
-- they just discarded it. So did every inbound webhook, which carries
-- metadata.display_phone_number on every single event.
-- ============================================================

ALTER TABLE whatsapp_config
  -- Meta's own formatting, stored verbatim, because Meta is inconsistent
  -- about it and normalising would fight that for no gain:
  --   webhook metadata      '918588096070'      (digits only)
  --   GET /{phone_number_id} '+91 72020 72233'  (plus and spaces)
  -- Text, not a number: this is an identifier for display, never
  -- arithmetic, and leading zeros in some regions must survive.
  ADD COLUMN IF NOT EXISTS display_phone_number TEXT,
  -- The business name shown to customers beside the number. Comes from
  -- the same Meta call, and answers "is this the number I think it is?"
  -- better than digits alone.
  ADD COLUMN IF NOT EXISTS verified_name TEXT;

COMMENT ON COLUMN whatsapp_config.display_phone_number IS
  'The real WhatsApp number in Meta''s display format, digits only. NULL '
  'until the first sync from Meta (connect, account-info fetch, or any '
  'inbound webhook). NEVER show phone_number_id in its place — that is an '
  'asset id, not a number.';

COMMENT ON COLUMN whatsapp_config.verified_name IS
  'Business display name Meta shows customers for this number.';

-- ============================================================
-- fn_account_deep_dive — return the number, and stop shipping secrets
--
-- The whatsapp_config branch used `row_to_json(wc.*)`, which sent EVERY
-- column to the super-admin browser — including access_token and
-- verify_token. They are encrypted at rest, but an encrypted secret in a
-- JSON response is still a secret in a JSON response, and the client
-- reads neither. Replaced with an explicit column list, which also means
-- the next column added to the table cannot silently leak.
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
        'token_expires_at', wc.token_expires_at
        -- access_token and verify_token are deliberately absent.
      )
      FROM whatsapp_config wc WHERE wc.account_id = target_account_id
      LIMIT 1
    )
  ) INTO result;
  RETURN result;
END;
$function$;
