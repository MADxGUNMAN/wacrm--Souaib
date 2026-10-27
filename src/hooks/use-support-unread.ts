'use client';

// ============================================================
// Unread support-chat counts, for the navigation badges on both sides.
//
// Read straight from `support_conversations` over RLS rather than through
// an API route, matching `use-total-unread` and `use-unread-notifications`:
// the table already carries a SELECT policy per audience (Realtime needs
// one, see migration 20260925120000), the counters are maintained in SQL,
// and a route would add a round trip plus a polling interval to something
// Realtime already pushes.
//
// Two hooks rather than one with a flag, because the two sides ask
// genuinely different questions. A tenant has exactly one conversation and
// wants "do I have a reply". An operator has one per workspace and wants
// "how many workspaces are waiting on me" — which is a count of
// CONVERSATIONS, not of messages, for the same reason the tenant sidebar
// shows a count of conversations with unread rather than a message tally.
// ============================================================

import { useEffect, useId, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useSupportTenant } from '@/hooks/use-support-tenant';
import { SUPPORT_CONVERSATIONS_TABLE } from '@/lib/support-chat/types';

// ─── Why every topic below carries a per-instance id ──────────
//
// `supabase.channel(topic)` RETURNS AN EXISTING CHANNEL when one with that
// topic is already open — it does not create a second one. So a second
// mount of the same hook received a channel that had already been
// subscribed, and `.on()` threw outright:
//
//   cannot add `postgres_changes` callbacks for
//   realtime:support-unread:<id> after `subscribe()`
//
// Which happens here for real, not just in StrictMode: the tenant badge is
// mounted by the dashboard sidebar AND by the Settings page at the same
// time. React's development double-invoke hits it too, because
// `removeChannel` is asynchronous and the remount can call `channel()`
// before the teardown lands.
//
// `useId()` gives each mount its own topic, which is exactly what
// `usePresenceForAccount` does (`presence:${accountId}-${instanceId}`) and
// for the same reason. The cost is one extra subscription on the one page
// where both consumers render; the alternative — a module-level singleton
// store, as `notification-store.ts` uses after hitting this identical
// error — is the right call for a feed with many consumers and a lot of
// state, and overbuilt for a single integer.

/**
 * Unread replies from support, for the signed-in tenant's workspace.
 *
 * Returns 0 for a super admin browsing the tenant app and for anyone whose
 * profile has no account yet — both cases have nothing to badge.
 */
export function useSupportUnreadForAccount(): number {
  // Reads the shared tenant store instead of opening its own channel — the
  // sidebar, the Settings rail, the tab title and the floating bubble all
  // call this at once. Zero whenever Live chat is not available to this
  // user, which is what hides every badge when an operator turns it off.
  const { available, unread } = useSupportTenant();
  return available ? unread : 0;
}

export interface SupportAdminUnread {
  /** Workspaces with at least one unread message. Drives the badge. */
  conversations: number;
  /** Total unread messages across all of them, for the tooltip. */
  messages: number;
}

/**
 * Unread customer messages across every workspace, for an operator.
 *
 * Only meaningful for a super admin; RLS returns nothing for anyone else,
 * so the counts stay at zero rather than needing a role check here.
 */
/** Stable identity, so a non-admin consumer never re-renders on this. */
const ZERO_ADMIN_UNREAD: SupportAdminUnread = {
  conversations: 0,
  messages: 0,
};

export function useSupportUnreadForAdmin(): SupportAdminUnread {
  const { isSuperAdmin } = useAuth();
  const instanceId = useId();
  const [counts, setCounts] = useState<SupportAdminUnread>(ZERO_ADMIN_UNREAD);

  /**
   * Per-conversation mirror, so a Realtime change can be applied without
   * refetching. A payload carries one row; the badge is an aggregate over
   * all of them, and there is no way back from "the total was 7" to "this
   * row used to be 3".
   */
  const rowsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isSuperAdmin) return;

    const supabase = createClient();
    let cancelled = false;

    // Start from empty so a re-subscribe cannot merge into rows from a
    // previous session. A ref write is not a render, unlike the setState
    // this used to pair with.
    rowsRef.current = new Map();

    const recompute = () => {
      let conversations = 0;
      let messages = 0;
      for (const n of rowsRef.current.values()) {
        if (n > 0) {
          conversations += 1;
          messages += n;
        }
      }
      setCounts({ conversations, messages });
    };

    const channel = supabase
      // Static today (only the sidebar mounts this), but a fixed topic is
      // the bug waiting to happen — a remount before `removeChannel`
      // completes hits the same throw.
      .channel(`support-unread:admin-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: SUPPORT_CONVERSATIONS_TABLE,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Replica identity is FULL on this table, so the old row
            // carries its id.
            const old = payload.old as { id?: string };
            if (old?.id) rowsRef.current.delete(old.id);
          } else {
            const row = payload.new as {
              id?: string;
              unread_for_admin?: number;
            };
            if (row?.id) {
              rowsRef.current.set(row.id, row.unread_for_admin ?? 0);
            }
          }
          recompute();
        }
      )
      .subscribe();

    void supabase
      .from(SUPPORT_CONVERSATIONS_TABLE)
      .select('id, unread_for_admin')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        for (const row of data ?? []) {
          const id = row.id as string;
          // Do not clobber a live event that already landed for this row.
          if (!rowsRef.current.has(id)) {
            rowsRef.current.set(id, (row.unread_for_admin as number) ?? 0);
          }
        }
        recompute();
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [isSuperAdmin, instanceId]);

  // Gated on the way out rather than reset on the way in, for the same
  // reason as the tenant hook above.
  return isSuperAdmin ? counts : ZERO_ADMIN_UNREAD;
}
