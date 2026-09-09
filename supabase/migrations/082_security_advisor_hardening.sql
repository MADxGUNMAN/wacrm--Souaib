-- ============================================================
-- 082_security_advisor_hardening.sql
--
-- Clears the Supabase Security Advisor findings without changing
-- any application behaviour. Three separate problems:
--
--   1. ERROR  security_definer_view
--      `v_platform_accounts_summary` runs as its owner (postgres),
--      so it bypasses RLS on accounts/profiles/account_members.
--      It is granted to `anon`, which means anyone holding the
--      publishable anon key could read every account on the
--      platform through /rest/v1/v_platform_accounts_summary.
--      The only reader in the app is
--      `src/lib/super-admin/queries.ts` via supabaseAdmin(), and
--      service_role has BYPASSRLS — so flipping the view to
--      security_invoker and revoking the client roles costs us
--      nothing.
--
--   2. WARN   function_search_path_mutable  (14 functions)
--      No pinned search_path, so a caller-controlled search_path
--      can resolve an unqualified name to an attacker's object.
--      Fixed with ALTER FUNCTION rather than CREATE OR REPLACE:
--      no body is retyped, so no chance of a transcription bug.
--      Verified beforehand that none of these 14 call a function
--      living in `extensions` (pgcrypto / uuid-ossp), so a bare
--      `public` is sufficient — same value the other 19 functions
--      in this schema already use.
--
--   3. WARN   {anon,authenticated}_security_definer_function_executable
--      SECURITY DEFINER functions reachable at /rest/v1/rpc/<name>
--      by client-side keys. Split by how the app actually calls
--      them (every call site checked in src/ first):
--        - trigger functions: nobody should ever RPC these
--        - service-role-only helpers: called with supabaseAdmin()
--        - user-facing RPCs: left alone, they need `authenticated`
--      `is_account_member` is deliberately untouched — 104 of the
--      120 RLS policies call it, and a policy body still needs
--      EXECUTE as the invoking role.
--      `peek_invitation` keeps `anon`: GET /api/invitations/[token]
--      /peek runs before the invitee has an account.
--
--      Note on PUBLIC: Postgres grants EXECUTE to PUBLIC on every
--      new function, and most of these still carry it (`=X/postgres`
--      in proacl). Revoking from `anon`/`authenticated` alone would
--      be a no-op, so PUBLIC is revoked too. Every function below
--      also carries an explicit `authenticated=X` and
--      `service_role=X` grant, which survives the PUBLIC revoke —
--      that is what keeps the logged-in and server paths working.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Platform accounts summary view -> security_invoker
-- ------------------------------------------------------------
ALTER VIEW public.v_platform_accounts_summary SET (security_invoker = true);

REVOKE ALL ON public.v_platform_accounts_summary FROM anon;
REVOKE ALL ON public.v_platform_accounts_summary FROM authenticated;

-- ------------------------------------------------------------
-- 2. Pin search_path on the 14 unpinned functions
--
-- ─── WHY THIS IS A LOOP AND NOT 14 BARE ALTER STATEMENTS ────
--
-- It WAS 14 bare `ALTER FUNCTION` lines, and that made this migration
-- unreplayable on a fresh database. Replaying the full history against
-- an empty Postgres failed here with
--
--   ERROR: function public.fn_health_metrics() does not exist
--
-- for two different reasons, both of which a bare ALTER cannot survive:
--
--   1. `fn_health_metrics` existed only in production and had never been
--      committed as a migration at all (now fixed by 081b).
--   2. `handle_user_update` is created by
--      20260811000000_sync_email_changes.sql, which sorts AFTER this
--      file — so at this point in the history it genuinely does not
--      exist yet. It is hardened by 20260812000000 instead.
--
-- A migration that only works against one specific database is not a
-- migration. Skipping absent objects with a notice keeps this file
-- correct on a fresh install, on production (where it is already
-- applied and this is a no-op), and against any future drift.
-- ------------------------------------------------------------
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public._bcast_cols_for_status(text)',
    'public.update_updated_at_column()',
    'public.update_ai_knowledge_documents_updated_at()',
    'public.update_ai_configs_updated_at()',
    'public.fn_touch_updated_at()',
    'public.fn_restage_orphaned_staged_contact()',
    'public.fn_platform_metrics()',
    'public.fn_signups_over_time(integer)',
    'public.fn_account_deep_dive(uuid)',
    'public.fn_health_metrics()',
    'public.handle_user_update()',
    -- Added in migrations 079/080 without a pinned path.
    'public.int_array_between(integer[], integer, integer)',
    'public.message_status_rank(text)',
    'public.fn_apply_message_status(text, text, timestamptz, text, text, jsonb)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    -- to_regprocedure returns NULL instead of raising when the function
    -- is absent, which is what makes this safe to run out of order.
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '082: skipping search_path pin, % not present yet', sig;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', sig);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 3a. Trigger functions — never callable as RPC
--     Fired by the trigger owner, so revoking EXECUTE from the
--     client roles does not affect the triggers themselves.
-- ------------------------------------------------------------
-- Same absent-object tolerance as section 2 — `handle_user_update` in
-- particular does not exist yet at this point in a fresh replay.
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.broadcast_recipient_aggregate_trigger()',
    'public.handle_new_user()',
    'public.handle_user_update()',
    'public.notify_conversation_assigned()'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '082: skipping revoke, % not present yet', sig;
      CONTINUE;
    END IF;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig
    );
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 3b. Service-role-only helpers
--     Call sites, all supabaseAdmin():
--       fn_platform_metrics / fn_signups_over_time /
--       fn_account_deep_dive / fn_health_metrics
--                              src/lib/super-admin/queries.ts
--       record_webhook_failure src/lib/webhooks/deliver.ts
--                              (only caller passes supabaseAdmin())
--       claim_ai_reply_slot    src/lib/ai/auto-reply.ts
--       _bcast_bump            internal to the broadcast triggers
--       recompute_broadcast_counts  admin/backfill only
--       merge_duplicate_*      one-off data repair, run by hand
-- ------------------------------------------------------------
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.fn_platform_metrics()',
    'public.fn_signups_over_time(integer)',
    'public.fn_account_deep_dive(uuid)',
    'public.fn_health_metrics()',
    'public.record_webhook_failure(uuid, integer)',
    'public.claim_ai_reply_slot(uuid, integer)',
    'public._bcast_bump(uuid, text, integer)',
    'public.recompute_broadcast_counts(uuid)',
    'public.merge_duplicate_contacts()',
    'public.merge_duplicate_conversations()'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '082: skipping revoke, % not present', sig;
      CONTINUE;
    END IF;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig
    );
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 3c. User-facing RPCs — drop `anon`, keep `authenticated`
--     Each of these reads auth.uid() and enforces membership /
--     role itself, so an anonymous caller can only ever get a
--     permission error out of them. Removing `anon` shrinks the
--     unauthenticated surface without touching the logged-in
--     paths that actually use them.
-- ------------------------------------------------------------
-- Type names are SCHEMA-QUALIFIED here on purpose. They were bare
-- (`presence_status_enum`, `account_role_enum`) and line 198 failed on a
-- fresh replay with `type "presence_status_enum" does not exist` —
-- resolution depends on the applying session's search_path, which is not
-- something a migration should rely on.
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.redeem_invitation(text)',
    'public.remove_account_member(uuid)',
    'public.set_member_permissions(uuid, jsonb)',
    'public.set_member_role(uuid, public.account_role_enum)',
    'public.set_member_status(uuid, boolean)',
    'public.touch_presence(public.presence_status_enum, text)',
    'public.transfer_account_ownership(uuid)',
    'public.fn_account_outbound_message_count(uuid, timestamptz)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE '082: skipping revoke, % not present', sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', sig);
  END LOOP;
END
$$;

-- These three are called by the app but are not SECURITY DEFINER and
-- were not flagged; left untouched on purpose so this migration stays
-- limited to what the advisor reported:
--   filter_contacts_by_tags, match_ai_knowledge_semantic,
--   match_ai_knowledge_fts

-- Deliberately NOT revoked:
--   public.peek_invitation(text)                -- anon by design
--   public.is_account_member(uuid, account_role_enum) -- RLS depends on it
