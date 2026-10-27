'use client';

// ============================================================
// "…is typing" for the support chat, over Supabase Realtime BROADCAST.
//
// ─── Why broadcast and not a table ───────────────────────────
//
// Everything else live in this codebase is a row plus `postgres_changes`
// (`member_presence` is the closest example). That is right for presence,
// which has to survive a reload and answer "when were you last here".
// It is wrong for typing.
//
// A typing signal is worth nothing a second after it is sent, and the
// failure mode of persisting one is specific and bad: the writer closes
// the tab mid-word and the flag stays true, so the other side sees
// "typing…" forever. Avoiding that with a table means a heartbeat, an
// expiry column and a local re-derive tick — the whole apparatus
// `use-presence` needs — to transmit a fact that expires in three
// seconds. Broadcast is ephemeral by construction: nothing is stored, so
// nothing can be stale.
//
// It also keeps keystrokes out of Postgres. At one row-write per few
// keystrokes per conversation, a table would take more write traffic than
// the messages themselves.
//
// Broadcast is unauthenticated at the channel level, so the topic carries
// the conversation id (a UUID nobody can enumerate) and the payload
// carries nothing but a side and a display label. A leaked topic reveals
// that someone is typing — not what they typed.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import type { SupportSenderKind } from '@/lib/support-chat/types';

/**
 * How long a received signal is believed.
 *
 * Must comfortably exceed THROTTLE_MS or the indicator flickers between
 * keystrokes. Three seconds means it also clears on its own when the other
 * side stops typing, closes the tab, or loses the network — no "stopped
 * typing" message is needed, and none is sent, because that message is
 * exactly the one that goes missing.
 */
const SIGNAL_TTL_MS = 3000;

/** Minimum gap between outgoing signals. One per keystroke is absurd. */
const THROTTLE_MS = 1500;

interface TypingPayload {
  kind: SupportSenderKind;
  label: string;
}

export interface TypingSignal {
  /** Who is typing on the OTHER side, or null. */
  typing: { kind: SupportSenderKind; label: string } | null;
  /** Call on each keystroke. Throttled internally. */
  notifyTyping: () => void;
}

export function useTypingSignal({
  conversationId,
  viewerKind,
  label,
}: {
  conversationId: string | undefined;
  viewerKind: SupportSenderKind;
  /** What the other side should see, e.g. 'Support' or a member's name. */
  label: string;
}): TypingSignal {
  const [typing, setTyping] = useState<TypingPayload | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in refs so a changing label does not tear down the channel
  // mid-conversation.
  const viewerKindRef = useRef(viewerKind);
  const labelRef = useRef(label);
  useEffect(() => {
    viewerKindRef.current = viewerKind;
    labelRef.current = label;
  });

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    // NO per-mount suffix here, unlike the postgres_changes channels
    // elsewhere in this feature. The shared topic IS the mechanism — both
    // sides must be on the same one to hear each other, so making it
    // unique per mount would silently disable typing entirely.
    //
    // Safe to share, because the throw that forces a unique topic
    // elsewhere is specific to `postgres_changes`: those callbacks
    // describe a server-side subscription negotiated during `subscribe()`,
    // so they cannot be added afterwards. Broadcast listeners are purely
    // client-side and can be attached at any point in a channel's life.
    const channel = supabase.channel(`support-typing:${conversationId}`, {
      // Without this the sender receives its own broadcasts and shows
      // itself as typing.
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const signal = payload as TypingPayload;
        // Guard anyway: `self: false` is a server-side filter, and a second
        // tab open as the SAME side is still the same side.
        if (!signal?.kind || signal.kind === viewerKindRef.current) return;

        setTyping(signal);
        if (expiryRef.current) clearTimeout(expiryRef.current);
        // Each signal resets the clock, so continuous typing holds the
        // indicator up and silence drops it.
        expiryRef.current = setTimeout(() => setTyping(null), SIGNAL_TTL_MS);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (expiryRef.current) {
        clearTimeout(expiryRef.current);
        expiryRef.current = null;
      }
      channelRef.current = null;
      lastSentRef.current = 0;
      setTyping(null);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const now = Date.now();
    if (now - lastSentRef.current < THROTTLE_MS) return;
    lastSentRef.current = now;

    // Fire and forget. A dropped typing signal is invisible; retrying one
    // is pointless by the time the retry lands.
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        kind: viewerKindRef.current,
        label: labelRef.current,
      } satisfies TypingPayload,
    });
  }, []);

  return { typing, notifyTyping };
}
