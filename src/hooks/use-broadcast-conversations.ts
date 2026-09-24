'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  buildBroadcastFilterOptions,
  type BroadcastFilterOption,
} from '@/lib/messages/broadcast-origin';

interface UseBroadcastConversationsResult {
  /**
   * Filter entries that actually produced inbox messages, newest first.
   *
   * One entry per CAMPAIGN or per ordinary broadcast — not one per
   * `broadcasts` row. See `buildBroadcastFilterOptions`.
   */
  broadcasts: BroadcastFilterOption[];
  /** conversation id -> the `broadcasts.id`s that messaged that thread. */
  byConversation: Map<string, Set<string>>;
  /** Every conversation reached by any campaign. */
  allBroadcastConvIds: Set<string>;
  /** Filter entries by `key`, for resolving the current selection. */
  optionByKey: Map<string, BroadcastFilterOption>;
  loading: boolean;
  /** True once a fetch has completed, so an empty result is trustworthy. */
  loaded: boolean;
}

/**
 * PostgREST caps an unbounded select at roughly 1000 rows. A single
 * broadcast can exceed that on its own, and this query spans every
 * campaign the account has ever sent — so paging is not optional. Reading
 * only the first page would silently drop conversations from the filter,
 * which looks exactly like "that campaign never reached anyone".
 *
 * The same cap has already bitten this codebase twice (the inbox message
 * tail fetch and the staged-contact import), hence the explicit loop.
 */
const PAGE_SIZE = 1000;
/** Hard ceiling, so a runaway dataset cannot spin forever. */
const MAX_PAGES = 25;

/**
 * Which conversations each broadcast campaign reached.
 *
 * Powers the Inbox's Broadcasts view: the toggle needs "was this thread
 * ever part of a campaign", and the dropdown needs "was it part of THIS
 * campaign".
 *
 * Derived from `messages.broadcast_id` rather than from
 * `broadcast_recipients`, deliberately. The recipient table records who a
 * campaign was AIMED at, including people it failed to reach; the messages
 * table records what actually landed in a thread. The Inbox is a view of
 * conversations, so it has to follow the messages.
 */
export function useBroadcastConversations(
  enabled: boolean,
  refreshToken = 0
): UseBroadcastConversationsResult {
  const [broadcasts, setBroadcasts] = useState<BroadcastFilterOption[]>([]);
  const [byConversation, setByConversation] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Avoids refetching every time the toggle is flipped back and forth.
  const fetchedTokenRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      // 1. Every broadcast message, paged. Only two columns, so even a
      //    large account moves little data.
      const pairs: { conversation_id: string; broadcast_id: string }[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from('messages')
          .select('conversation_id, broadcast_id')
          .not('broadcast_id', 'is', null)
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('Failed to load broadcast messages:', {
            message: error.message,
            details: error.details,
            code: error.code,
          });
          break;
        }
        const rows = data ?? [];
        for (const row of rows) {
          const convId = row.conversation_id as string | null;
          const bId = row.broadcast_id as string | null;
          if (convId && bId) {
            pairs.push({ conversation_id: convId, broadcast_id: bId });
          }
        }
        if (rows.length < PAGE_SIZE) break;
      }

      const map = new Map<string, Set<string>>();
      const usedBroadcastIds = new Set<string>();
      for (const { conversation_id, broadcast_id } of pairs) {
        const set = map.get(conversation_id) ?? new Set<string>();
        set.add(broadcast_id);
        map.set(conversation_id, set);
        usedBroadcastIds.add(broadcast_id);
      }

      // 2. Names for the dropdown. Only campaigns that actually produced a
      //    message are listed — offering a filter that can only ever
      //    return nothing is worse than omitting it.
      //
      //    `api_campaign_name` is selected so runs of one API campaign
      //    collapse into a single entry. Without it the dropdown listed one
      //    row per run: thirteen entries all reading
      //    "api camping (google_sheets)", identical on screen and each
      //    filtering to a single send.
      let options: BroadcastFilterOption[] = [];
      if (usedBroadcastIds.size > 0) {
        const { data: rows, error } = await supabase
          .from('broadcasts')
          .select('id, name, created_at, api_campaign_name')
          .in('id', [...usedBroadcastIds])
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load broadcast names:', error.message);
        } else {
          options = buildBroadcastFilterOptions(
            (rows ?? []).map((r) => ({
              id: r.id as string,
              name: r.name as string | null,
              api_campaign_name: r.api_campaign_name as string | null,
              created_at: r.created_at as string | null,
            }))
          );
        }
      }

      setByConversation(map);
      setBroadcasts(options);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Refetch when the caller bumps the token (a new broadcast landed),
    // but not merely because the view was toggled again.
    if (fetchedTokenRef.current === refreshToken) return;
    fetchedTokenRef.current = refreshToken;
    void fetchData();
  }, [enabled, refreshToken, fetchData]);

  const allBroadcastConvIds = useMemo(
    () => new Set(byConversation.keys()),
    [byConversation]
  );

  const optionByKey = useMemo(
    () => new Map(broadcasts.map((o) => [o.key, o])),
    [broadcasts]
  );

  return {
    broadcasts,
    byConversation,
    allBroadcastConvIds,
    optionByKey,
    loading,
    loaded,
  };
}
