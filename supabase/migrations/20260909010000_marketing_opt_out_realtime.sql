-- ============================================================
-- 20260909010000_marketing_opt_out_realtime
--
-- Makes a contact's subscription status update live in the inbox.
--
-- WHY THIS EXISTS
--
-- The contact panel read the status once when the conversation was opened.
-- That is exactly the wrong moment: the interesting case is a customer
-- replying STOP while an agent is looking at the thread. The badge kept
-- saying "Subscribed" until the agent clicked away and back, which is
-- precisely when an agent might send a marketing template to somebody who
-- had just asked them not to.
--
-- WHY BOTH TABLES
--
-- `marketing_subscription_events` is append-only, so a single INSERT covers
-- BOTH directions — subscribe and unsubscribe. That alone would be enough
-- almost always.
--
-- `marketing_opt_outs` is added as well because the event write is
-- deliberately best-effort: `recordSubscriptionEvent` never throws, so a
-- failed audit write leaves the suppression index correct while no event
-- fires. Subscribing to the index too means the badge still updates in that
-- case. The index is also the authority the send paths obey, so it is the
-- signal that actually matters.
--
-- REPLICA IDENTITY FULL on marketing_opt_outs
--
-- Re-subscribing DELETEs the suppression row. With Postgres's default
-- replica identity, a DELETE's `old` record carries only the primary key —
-- so the client would receive "some row was deleted" with no phone number,
-- could not tell whether it concerned the open conversation, and Realtime's
-- own `phone_normalized=eq.…` filter could not match it either. Full
-- identity puts every column in `old`, which is what makes a re-subscribe
-- observable at all.
--
-- Same reasoning and same fix as `notifications` (migration 027) and
-- `super_admin_notification_reads` (20260827000000).
--
-- Cost: slightly larger WAL records for these two tables. They see a handful
-- of writes per account per day, so this is immaterial.
--
-- RLS still applies to Realtime: a client only receives rows it could have
-- SELECTed, and `marketing_opt_outs_select` /
-- `marketing_subscription_events_select` both require `is_account_member`.
-- So one tenant cannot observe another's opt-outs through this channel.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE marketing_opt_outs REPLICA IDENTITY FULL;

COMMENT ON TABLE marketing_opt_outs IS
  'Suppression list. A row means this account must not send MARKETING templates to this number. Utility and Authentication templates are unaffected. REPLICA IDENTITY FULL so realtime DELETE payloads carry phone_normalized — a re-subscribe is a delete, and without it the inbox could not tell which contact changed.';

-- `marketing_subscription_events` is append-only (INSERT-only policy, no
-- UPDATE or DELETE policy), so its default replica identity is sufficient:
-- there are no deletes to observe and INSERT payloads always carry `new`.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marketing_opt_outs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_opt_outs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'marketing_subscription_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketing_subscription_events;
  END IF;
END $$;
