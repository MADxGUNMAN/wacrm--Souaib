'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  buildBroadcastOriginMap,
  type BroadcastOrigin,
} from '@/lib/messages/broadcast-origin';
import type { Message } from '@/types';

/**
 * Resolve, for the messages in one thread, which bulk send each came from.
 *
 * The thread already has `messages.broadcast_id` on every row (the message
 * fetch is `select('*')`), but an id is not something to show an agent. The
 * name and the API-campaign-or-not distinction live on the parent
 * `broadcasts` row, so exactly one extra query is needed.
 *
 * ─── Why this is keyed on the ids present, not the conversation ────
 *
 * Fetching "broadcasts for this conversation" would need a join through
 * messages and would re-run whenever the thread changed. Collecting the
 * distinct `broadcast_id`s already in hand and asking for those instead
 * means the query is skipped entirely for the overwhelming majority of
 * threads, which contain no broadcast messages at all.
 *
 * Results accumulate across fetches rather than being replaced. Paging
 * older messages into a thread adds ids without invalidating the ones
 * already resolved, and dropping them would make earlier badges flicker
 * out and back.
 */
export function useBroadcastOrigins(
  messages: readonly Message[]
): Map<string, BroadcastOrigin> {
  const [origins, setOrigins] = useState<Map<string, BroadcastOrigin>>(
    new Map()
  );

  // Sorted + joined so the effect depends on the SET of ids rather than on
  // array identity. Without this, every re-render of the thread would
  // refetch, because `messages` is a fresh array each time.
  const idKey = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.broadcast_id) ids.add(m.broadcast_id);
    }
    return [...ids].sort().join(',');
  }, [messages]);

  // Which ids have already been resolved, so a thread that pages in older
  // messages only asks about the new ones.
  const resolvedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!idKey) return;

    const ids = idKey.split(',').filter((id) => !resolvedRef.current.has(id));
    if (ids.length === 0) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('broadcasts')
        // `api_campaign_name` is the discriminator, not `api_campaign_id` —
        // the id is ON DELETE SET NULL, so a deleted campaign's runs would
        // start reporting as ordinary broadcasts. See broadcast-origin.ts.
        .select('id, name, api_campaign_name')
        .in('id', ids);

      if (cancelled) return;

      if (error) {
        // A badge is supplementary. The thread and its messages are
        // unaffected, so this degrades to "no origin badge" rather than
        // disturbing the conversation.
        console.warn(
          '[use-broadcast-origins] could not resolve broadcast origins, ' +
            'template messages will show without a source badge:',
          error.message
        );
        return;
      }

      for (const id of ids) resolvedRef.current.add(id);

      const fetched = buildBroadcastOriginMap(
        (data ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string | null,
          api_campaign_name: r.api_campaign_name as string | null,
        }))
      );

      setOrigins((prev) => {
        const next = new Map(prev);
        for (const [id, origin] of fetched) next.set(id, origin);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return origins;
}
