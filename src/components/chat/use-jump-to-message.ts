'use client';

// ============================================================
// Click a quote, land on the message it quotes, flash it.
//
// Shared by the WhatsApp Inbox and the in-app Live Chat. Each thread tags
// every message row with `data-message-id` and applies
// `MESSAGE_FLASH_CLASS` to the row whose id matches `highlightedId`.
//
// ─── The case that makes this more than scrollIntoView ────────
//
// Both threads page their history: the inbox loads 300 messages, the
// support chat 300, and anything older sits behind "Load earlier". A reply
// can quote a message from last month. Scrolling to an element that is not
// in the DOM does nothing at all — the click would look broken.
//
// So a jump to an unloaded message pages backwards until the target
// appears, then scrolls to it. Bounded (MAX_PAGES) so a quote pointing at a
// message that no longer exists cannot page through an entire imported
// history, and it says so when it gives up rather than failing silently.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** How long the flash stays on, in ms. Matches the CSS animation. */
const FLASH_MS = 1800;

/**
 * Most pages of history fetched looking for one quoted message.
 *
 * At 300 messages a page, five pages reaches 1,500 messages back — far
 * beyond anything a person scrolls to answer, and small enough that a
 * quote of a message that was hard-deleted gives up quickly.
 */
const MAX_PAGES = 5;

/** Applied to the target row. Defined in globals.css. */
export const MESSAGE_FLASH_CLASS = 'message-flash';

export function useJumpToMessage({
  containerRef,
  messageIds,
  hasOlder,
  loadOlder,
}: {
  /** The scrolling element the message rows live in. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Ids currently rendered, oldest first. Drives the retry loop. */
  messageIds: string[];
  /** Whether "Load earlier" would fetch anything. */
  hasOlder: boolean;
  /** Fetch the next older page. Must prepend to the rendered list. */
  loadOlder: () => Promise<void> | void;
}) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  /** The jump in progress, and how many pages it has fetched so far. */
  const pendingRef = useRef<{ id: string; pages: number } | null>(null);
  /** Guards against firing a second page load while one is in flight. */
  const loadingRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in refs so the effect below reacts to the message list changing,
  // not to a parent handing down a fresh `loadOlder` closure every render.
  const loadOlderRef = useRef(loadOlder);
  const hasOlderRef = useRef(hasOlder);
  useEffect(() => {
    loadOlderRef.current = loadOlder;
    hasOlderRef.current = hasOlder;
  });

  const flash = useCallback((id: string) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    // Clear first, then set on the next frame. Without the gap, jumping to
    // the SAME message twice does nothing: the class is already there, so
    // the browser never restarts the animation.
    setHighlightedId(null);
    requestAnimationFrame(() => {
      setHighlightedId(id);
      clearTimerRef.current = setTimeout(
        () => setHighlightedId(null),
        FLASH_MS
      );
    });
  }, []);

  /** Returns true when the row was found and scrolled to. */
  const tryScroll = useCallback(
    (id: string): boolean => {
      const container = containerRef.current;
      if (!container) return false;
      // Scoped to this thread's container rather than `document`, so the
      // inbox's floating chat and its main thread — which can both be open
      // on the same conversation — each find their own copy of the row.
      const el = container.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(id)}"]`
      );
      if (!el) return false;

      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      el.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
      flash(id);
      return true;
    },
    [containerRef, flash]
  );

  const jumpTo = useCallback(
    (id: string) => {
      if (tryScroll(id)) {
        pendingRef.current = null;
        return;
      }
      if (!hasOlderRef.current) {
        toast.info('The original message is no longer available.');
        return;
      }
      pendingRef.current = { id, pages: 0 };
      loadingRef.current = true;
      void Promise.resolve(loadOlderRef.current()).finally(() => {
        loadingRef.current = false;
      });
    },
    [tryScroll]
  );

  // Each time the rendered list changes, see whether the page that just
  // arrived contained the target — and if not, fetch another.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || loadingRef.current) return;

    // Deferred a frame: the thread's own scroll-restore effect (which keeps
    // the reader's position steady when older messages are prepended) runs
    // in the same commit, and scrolling before it would be undone by it.
    const frame = requestAnimationFrame(() => {
      if (tryScroll(pending.id)) {
        pendingRef.current = null;
        return;
      }
      if (!hasOlderRef.current || pending.pages + 1 >= MAX_PAGES) {
        pendingRef.current = null;
        toast.info('The original message is no longer available.');
        return;
      }
      pendingRef.current = { id: pending.id, pages: pending.pages + 1 };
      loadingRef.current = true;
      void Promise.resolve(loadOlderRef.current()).finally(() => {
        loadingRef.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messageIds, tryScroll]);

  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    },
    []
  );

  return { highlightedId, jumpTo };
}
