-- ============================================================
-- AI connector — "AI-deny" restrictive RLS (the second wall).
--
-- Plan: docs/ai-connector/01-architecture.md §5.2 (D3).
--
-- Connector tool calls run as the signed-in user with a short-lived
-- Supabase JWT that carries an extra `ai_conn` claim. Normal dashboard
-- sessions never carry that claim, so every policy below is a no-op for
-- them: `coalesce(auth.jwt() ->> 'ai_conn', '') = ''` is TRUE.
--
-- For an AI JWT the claim is set and these RESTRICTIVE policies are
-- AND-ed with the existing permissive ones, so access is denied even
-- though the user's own role would allow it. The application never
-- exposes tools for these tables; this makes sure a bug in a tool can't
-- reach them either.
--
-- `(SELECT auth.jwt())` is wrapped so Postgres evaluates it once per
-- statement (initplan), not once per row.
--
-- Two shapes:
--   * deny ALL      — secrets, billing, settings, connector internals
--   * deny WRITES   — tables the AI may read but must never change
--
-- Idempotent: each policy is dropped before it is created.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  deny_all TEXT[] := ARRAY[
    'api_keys',
    'webhook_endpoints',
    'whatsapp_config',
    'whatsapp_usage_alerts',
    'ai_configs',
    'ai_knowledge_documents',
    'ai_knowledge_chunks',
    'account_invitations',
    'payment_requests',
    'subscription_events',
    'opt_in_out_configs',
    'api_campaign_sends',
    'coexistence_history_imports',
    'support_conversations',
    'support_messages',
    'ai_connections',
    'ai_workspace_policies',
    'ai_audit_log'
  ];
  deny_writes TEXT[] := ARRAY[
    'profiles',
    'accounts',
    'marketing_opt_outs',
    'marketing_subscription_events',
    'api_campaigns'
  ];
  not_ai CONSTANT TEXT := 'coalesce((SELECT auth.jwt()) ->> ''ai_conn'', '''') = ''''';
BEGIN
  FOREACH t IN ARRAY deny_all LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'ai-deny: table public.% not found, skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS ai_connector_deny ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ai_connector_deny ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t, not_ai, not_ai
    );
  END LOOP;

  FOREACH t IN ARRAY deny_writes LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'ai-deny: table public.% not found, skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS ai_connector_deny_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ai_connector_deny_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ai_connector_deny_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY ai_connector_deny_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
      t, not_ai
    );
    EXECUTE format(
      'CREATE POLICY ai_connector_deny_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t, not_ai, not_ai
    );
    EXECUTE format(
      'CREATE POLICY ai_connector_deny_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',
      t, not_ai
    );
  END LOOP;
END;
$$;
