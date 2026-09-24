'use client';

import {
  Suspense,
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import type {
  Conversation,
  Message,
  Contact,
  ConversationStatus,
} from '@/types';
import { useRealtime } from '@/hooks/use-realtime';
import { ConversationList } from '@/components/inbox/conversation-list';
import { MessageThread } from '@/components/inbox/message-thread';
import { ContactSidebar } from '@/components/inbox/contact-sidebar';
import { ImportedChatsReview } from '@/components/inbox/imported-chats-review';
import { useFloatingChats } from '@/components/inbox/floating-chats-context';
import { ArrowRight, ChevronsLeftRight, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const WA_ICON_PATH =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z';

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = 'wacrm:inbox:contact-panel-open';
const CONTACT_PANEL_WIDTH_STORAGE_KEY = 'wacrm:inbox:contact-panel-width:v2';
const DEFAULT_CONTACT_PANEL_WIDTH = 380;
const MIN_CONTACT_PANEL_WIDTH = 320;
const MAX_CONTACT_PANEL_WIDTH = 560;
const CONTACT_PANEL_KEYBOARD_STEP = 16;

function clampContactPanelWidth(width: number) {
  return Math.min(
    MAX_CONTACT_PANEL_WIDTH,
    Math.max(MIN_CONTACT_PANEL_WIDTH, Math.round(width))
  );
}

// `useSearchParams` (the `?c=<id>` deep link below) requires a Suspense
// boundary or the production build bails to CSR and errors out. Thin
// wrapper supplies it; the inner component holds all the inbox state.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function InboxPageInner() {
  const t = useTranslations('Inbox.page');
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get('c');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  const { openChat } = useFloatingChats();

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === 'true');
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const [contactPanelWidth, setContactPanelWidth] = useState(
    DEFAULT_CONTACT_PANEL_WIDTH
  );
  const [isResizingContactPanel, setIsResizingContactPanel] = useState(false);
  const contactPanelResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const contactPanelElementRef = useRef<HTMLDivElement | null>(null);
  const contactPanelResizeHandleRef = useRef<HTMLDivElement | null>(null);
  const pendingContactPanelWidthRef = useRef(DEFAULT_CONTACT_PANEL_WIDTH);
  const contactPanelResizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const stored = Number(
        localStorage.getItem(CONTACT_PANEL_WIDTH_STORAGE_KEY)
      );
      if (Number.isFinite(stored) && stored > 0) {
        // Reconcile the device preference after hydration; the server and
        // initial client render intentionally share the default width.
        const nextWidth = clampContactPanelWidth(stored);
        pendingContactPanelWidthRef.current = nextWidth;
        setContactPanelWidth(nextWidth);
      }
    } catch {
      // Persistence is best-effort.
    }
  }, []);

  useEffect(
    () => () => {
      if (contactPanelResizeFrameRef.current !== null) {
        cancelAnimationFrame(contactPanelResizeFrameRef.current);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    []
  );

  const persistContactPanelWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(
        CONTACT_PANEL_WIDTH_STORAGE_KEY,
        String(clampContactPanelWidth(width))
      );
    } catch {
      // Persistence is best-effort.
    }
  }, []);

  const applyContactPanelWidth = useCallback((width: number) => {
    const nextWidth = clampContactPanelWidth(width);
    pendingContactPanelWidthRef.current = nextWidth;

    const panel = contactPanelElementRef.current;
    if (panel) {
      panel.style.width = `${nextWidth}px`;
      panel.style.flexBasis = `${nextWidth}px`;
    }
    contactPanelResizeHandleRef.current?.setAttribute(
      'aria-valuenow',
      String(nextWidth)
    );
    return nextWidth;
  }, []);

  const handleContactPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      contactPanelResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: pendingContactPanelWidthRef.current,
      };
      setIsResizingContactPanel(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    []
  );

  const handleContactPanelResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = contactPanelResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;

      pendingContactPanelWidthRef.current = clampContactPanelWidth(
        resize.startWidth + (resize.startX - event.clientX)
      );
      if (contactPanelResizeFrameRef.current !== null) return;

      contactPanelResizeFrameRef.current = requestAnimationFrame(() => {
        contactPanelResizeFrameRef.current = null;
        applyContactPanelWidth(pendingContactPanelWidthRef.current);
      });
    },
    [applyContactPanelWidth]
  );

  const finishContactPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = contactPanelResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;

      if (contactPanelResizeFrameRef.current !== null) {
        cancelAnimationFrame(contactPanelResizeFrameRef.current);
        contactPanelResizeFrameRef.current = null;
      }
      const width = applyContactPanelWidth(
        resize.startWidth + (resize.startX - event.clientX)
      );
      setContactPanelWidth(width);
      persistContactPanelWidth(width);
      contactPanelResizeRef.current = null;
      setIsResizingContactPanel(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [applyContactPanelWidth, persistContactPanelWidth]
  );

  const cancelContactPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = contactPanelResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;

      if (contactPanelResizeFrameRef.current !== null) {
        cancelAnimationFrame(contactPanelResizeFrameRef.current);
        contactPanelResizeFrameRef.current = null;
      }
      const width = applyContactPanelWidth(pendingContactPanelWidthRef.current);
      setContactPanelWidth(width);
      persistContactPanelWidth(width);
      contactPanelResizeRef.current = null;
      setIsResizingContactPanel(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [applyContactPanelWidth, persistContactPanelWidth]
  );

  const setAndPersistContactPanelWidth = useCallback(
    (width: number) => {
      const next = applyContactPanelWidth(width);
      setContactPanelWidth(next);
      persistContactPanelWidth(next);
    },
    [applyContactPanelWidth, persistContactPanelWidth]
  );

  const handleContactPanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;
      if (event.key === 'ArrowLeft') {
        nextWidth = contactPanelWidth + CONTACT_PANEL_KEYBOARD_STEP;
      } else if (event.key === 'ArrowRight') {
        nextWidth = contactPanelWidth - CONTACT_PANEL_KEYBOARD_STEP;
      } else if (event.key === 'Home') {
        nextWidth = MIN_CONTACT_PANEL_WIDTH;
      } else if (event.key === 'End') {
        nextWidth = MAX_CONTACT_PANEL_WIDTH;
      }

      if (nextWidth === null) return;
      event.preventDefault();
      setAndPersistContactPanelWidth(nextWidth);
    },
    [contactPanelWidth, setAndPersistContactPanelWidth]
  );

  const handleToggleContactPanel = useCallback(() => {
    setContactPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the supabase client and starving the
   * realtime channel). The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  // Pull the conversation row with its `contact` joined and merge it
  // into state. Needed because Supabase Realtime payloads only carry the
  // row's own columns — a brand-new conversation arrives without a
  // contact, which surfaced as "Unknown" names, empty avatars, and
  // (when the conv-INSERT event was delayed past the message-INSERT)
  // conversations stuck on "No messages yet" until the user reloaded.
  // Also self-heals if a realtime event was missed: callers can invoke
  // this whenever they reference a conversation id they don't recognise.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('id', convId)
        .maybeSingle();
      if (error) {
        // Supabase errors have non-enumerable properties — log fields
        // explicitly so the console message isn't just `{}`.
        console.error('Failed to hydrate conversation:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }
      if (!data) return;
      const fetched = normalizeConversation(data);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep its fields (a realtime UPDATE may
          // have landed while the fetch was in flight and patched
          // last_message_text / unread_count to fresher values than
          // the row we just read). Only backfill `contact`, which the
          // realtime payloads never carry.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c
          );
        }
        return [fetched, ...prev];
      });
      return fetched;
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, []);

  // Check WhatsApp connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) return;

      // whatsapp_config is one-row-per-account post-multi-user, so
      // the previous `.eq('user_id', user.id)` would miss the row
      // for any teammate who didn't personally save the config —
      // the "WhatsApp not connected" banner would show in the
      // shared inbox even though the admin had it configured.
      // Resolve account_id via the profile and query by that.
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const accountId = profile?.account_id as string | undefined;
      if (!accountId) {
        setWhatsappConnected(false);
        return;
      }

      const { data } = await supabase
        .from('whatsapp_config')
        .select('status')
        .eq('account_id', accountId)
        .maybeSingle();

      setWhatsappConnected(data?.status === 'connected');
    };

    checkConnection();
  }, []);

  // Handle realtime message events
  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;

      if (event.eventType === 'INSERT') {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic message if it exists
            const withoutOptimistic = prev.filter(
              (m) => !m.id.startsWith('temp-')
            );
            return [...withoutOptimistic, newMsg];
          });
        }

        // Update conversation list preview. We need to know *synchronously*
        // whether the conv is already in state to decide between patching
        // the preview and triggering a hydrate — see the comment on
        // knownConvIdsRef for why a closure flag inside the updater would
        // always read false here.
        if (knownConvIdsRef.current.has(newMsg.conversation_id)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message_text: newMsg.content_text ?? '',
                    last_message_at: newMsg.created_at,
                    // Mirror the database trigger: only a NON-broadcast
                    // message advances the direct-activity fields. Patching
                    // them unconditionally would let a live campaign send
                    // pull the thread into All chats and rewrite its
                    // preview, then have it vanish again on the next
                    // refetch — a flicker that reads as a bug in both
                    // directions. See migration 20260917140000.
                    ...(newMsg.broadcast_id
                      ? {}
                      : {
                          last_direct_message_text: newMsg.content_text ?? '',
                          last_direct_message_at: newMsg.created_at,
                        }),
                    unread_count:
                      activeConversation?.id === newMsg.conversation_id
                        ? 0
                        : c.unread_count + 1,
                  }
                : c
            )
          );
        } else {
          // First time we're seeing this conv: the conv-INSERT event
          // hasn't landed yet, or was missed. Hydrate from the DB so
          // the row surfaces with its `contact` joined; the conv-UPDATE
          // event the webhook emits right after the message INSERT will
          // converge state when it arrives.
          hydrateConversation(newMsg.conversation_id);
        }
      }

      if (event.eventType === 'UPDATE') {
        // Update message status
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Handle realtime conversation events
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === 'INSERT') {
        // Prepend immediately for snappy UX so the new conv shows in the
        // list right away, then hydrate to fill in the `contact` join
        // (realtime payloads never include joins). Skip both if we
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === 'UPDATE') {
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id
                ? {
                    ...c,
                    ...conv,
                    unread_count: isActive ? 0 : conv.unread_count,
                  }
                : c
            )
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) => (prev ? { ...prev, ...conv } : prev));
        }
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Subscribe to realtime. The `isConnected` flag below feeds the
  // reconnect resync: realtime is best-effort and events sent while the
  // WS was disconnected (laptop sleep, network blip, background-tab
  // throttle) are simply lost. We need a way to catch up.
  const { isConnected } = useRealtime({
    channelName: 'inbox-realtime',
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      // Resolve a pending deep-link here rather than in an effect — this
      // is an event handler, so the setState calls below are allowed by
      // react-hooks/set-state-in-effect. Runs once per ?c=<id> URL value
      // via the ref, so realtime refreshes of the list can't snap the
      // user back to the deep-linked thread after they've navigated.
      if (
        deepLinkConvId &&
        autoSelectedForDeepLinkRef.current !== deepLinkConvId &&
        loaded.length > 0
      ) {
        autoSelectedForDeepLinkRef.current = deepLinkConvId;
        // If the deep-linked conversation is already the active one
        // (e.g. because the user clicked it in the list and we
        // router.replace()'d the URL, which made the ConversationList
        // refetch and land us back here), do NOT re-apply it. Doing so
        // would setMessages([]) on a thread whose messages have
        // already been loaded by MessageThread — and because
        // conversationId didn't change, MessageThread wouldn't
        // refetch. The thread would read "No messages yet" until a
        // full page reload rehydrated state from scratch.
        if (activeConversation?.id === deepLinkConvId) return;
        const match = loaded.find((c) => c.id === deepLinkConvId);
        if (match) {
          setActiveConversation(match);
          setActiveContact(match.contact ?? null);
          setMessages([]);
          // Mirror the optimistic unread reset that handleSelectConversation
          // does — the user just deep-linked into this conv, treat that the
          // same as a click. Leaves activeConversation.unread_count alone so
          // the MessageThread reset effect still fires the server UPDATE.
          if (match.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === match.id ? { ...c, unread_count: 0 } : c
              )
            );
          }
        } else {
          hydrateConversation(deepLinkConvId).then((fetched) => {
            if (fetched) {
              setActiveConversation(fetched);
              setActiveContact(fetched.contact ?? null);
              setMessages([]);
            }
          });
        }
      }
    },
    [deepLinkConvId, activeConversation?.id, hydrateConversation]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      // Optimistically clear the unread badge for this conv. The
      // server-side reset is fired by the unread-reset effect inside
      // MessageThread (which reads activeConversation.unread_count, not
      // the list copy — so we deliberately leave that intact below to
      // keep the effect firing), and the realtime UPDATE that comes
      // back will sync to 0 again as a no-op. Zeroing the list copy
      // here means the user sees the badge disappear the instant they
      // click instead of waiting for the round-trip — and it persists
      // even if the realtime UPDATE is dropped.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0 ? { ...c, unread_count: 0 } : c
        )
      );
      // Record the selection on the deep-link ref BEFORE we change the
      // URL. The router.replace below flips `deepLinkConvId`, which can
      // in turn cause ConversationList to refetch and eventually call
      // handleConversationsLoaded again. Without this line, the ref
      // still points at the previous value, the auto-select block
      // sees `ref !== deepLinkConvId`, fires a second time, and
      // clobbers the messages MessageThread just fetched.
      autoSelectedForDeepLinkRef.current = conv.id;
      // Reflect the selection in the URL so a refresh lands the user
      // back in the same thread, and so copy-paste links work. Use
      // replace() to avoid polluting browser history with every click.
      router.replace(`/inbox?c=${conv.id}`, { scroll: false });
    },
    [activeConversation?.id, router]
  );

  // Mobile "back" — deselect the conversation so the list pane comes
  // back. Also clears the ?c= param so a refresh lands on the list
  // instead of re-opening the thread the user just backed out of.
  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setMessages([]);
    // Clearing the ref lets the deep-link auto-selector fire again if
    // the user later visits /inbox?c=<same-id> — desirable UX.
    autoSelectedForDeepLinkRef.current = null;
    router.replace('/inbox', { scroll: false });
  }, [router]);

  const handlePopOut = useCallback(() => {
    if (activeConversation) {
      openChat(activeConversation, activeContact);
      setActiveConversation(null);
      setActiveContact(null);
      router.replace('/inbox', { scroll: false });
    }
  }, [activeConversation, activeContact, openChat, router]);

  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] flex-col overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      {/* WhatsApp connection banner — in the flex column, not absolute,
          so it pushes the panels down instead of overlapping them. */}
      {whatsappConnected === false && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <WifiOff className="size-4 shrink-0 text-amber-500" />
            <span>{t('whatsappNotConnected')}</span>
          </div>
          <Link
            href="/settings?tab=whatsapp&mode=guided"
            className="group animate-wa-ring relative inline-flex items-center gap-1.5 overflow-hidden rounded-md bg-gradient-to-r from-[#00A884] to-[#008f6f] px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_2px_10px_rgba(0,168,132,0.4)] active:scale-[0.98]"
          >
            <span
              className="animate-wa-shimmer pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
              aria-hidden="true"
            />
            <svg
              className="relative size-3.5 fill-current transition-transform duration-200 group-hover:scale-110"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d={WA_ICON_PATH} />
            </svg>
            <span className="relative tracking-wide">
              {t('connectWhatsAppBusiness')}
            </span>
            <ArrowRight className="relative size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {/* Imported-chat review banner.
          In the flex column alongside the connection banner so it pushes the
          panels down rather than overlapping them. Renders nothing at all
          unless this account actually has imported chats, so it costs a
          non-coexistence inbox one count query and no layout. */}
      <ImportedChatsReview onApproved={() => setResyncToken((t) => t + 1)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            'flex h-full flex-1 lg:flex-none',
            hasActiveConv ? 'hidden lg:flex' : 'flex'
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet).

            `min-w-0` is load-bearing: without it, a single wide piece
            of content inside the thread (long quote preview, very
            long URL in a message body) forces the flex child past
            its share and pushes the contact-sidebar panel off-screen
            on the right. Issue #165. */}
        <div
          className={cn(
            'flex h-full min-w-0 flex-1 lg:flex',
            hasActiveConv ? 'flex' : 'hidden lg:flex'
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
            onPopOut={handlePopOut}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258).
            On mobile it's always hidden (the `lg:block` below), so the
            toggle — which is itself desktop-only — never affects it. */}
        {contactPanelOpen && (
          <div
            ref={contactPanelElementRef}
            className="relative hidden h-full min-h-0 shrink-0 overflow-hidden lg:block"
            style={{
              width: contactPanelWidth,
              minWidth: MIN_CONTACT_PANEL_WIDTH,
              maxWidth: MAX_CONTACT_PANEL_WIDTH,
              flexBasis: contactPanelWidth,
            }}
          >
            <div
              ref={contactPanelResizeHandleRef}
              role="separator"
              aria-label="Resize contact details panel"
              aria-orientation="vertical"
              aria-valuemin={MIN_CONTACT_PANEL_WIDTH}
              aria-valuemax={MAX_CONTACT_PANEL_WIDTH}
              aria-valuenow={contactPanelWidth}
              tabIndex={0}
              title="Drag to resize · Double-click to reset"
              onPointerDown={handleContactPanelResizeStart}
              onPointerMove={handleContactPanelResizeMove}
              onPointerUp={finishContactPanelResize}
              onPointerCancel={cancelContactPanelResize}
              onKeyDown={handleContactPanelResizeKeyDown}
              onDoubleClick={() =>
                setAndPersistContactPanelWidth(DEFAULT_CONTACT_PANEL_WIDTH)
              }
              className={cn(
                'contact-panel-resize-handle group absolute inset-y-0 left-0 z-20 w-2 touch-none outline-none',
                'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset'
              )}
            >
              <span
                className={cn(
                  'bg-border group-hover:bg-primary/60 absolute inset-y-0 left-0 w-px transition-colors',
                  isResizingContactPanel && 'bg-primary w-0.5'
                )}
              />
              <span
                className={cn(
                  'contact-panel-resize-icon',
                  'absolute top-1/2 left-0 flex h-9 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 shadow-sm',
                  'opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                  isResizingContactPanel && 'opacity-100'
                )}
              >
                <ChevronsLeftRight className="size-3.5 stroke-[2.25]" />
              </span>
            </div>
            <ContactSidebar contact={activeContact} />
          </div>
        )}
      </div>
    </div>
  );
}
