'use client';

// ============================================================
// The support-chat thread. One component serves both audiences.
//
// `viewerKind` decides which side is "mine"; `accountId` is required for
// the operator and ignored for the tenant (the server takes the tenant's
// account from their session either way — passing it from the client
// would be a tenancy hole).
//
// Realtime is a filtered subscription on `support_messages` for this one
// conversation. It works for BOTH audiences because the table carries a
// SELECT policy per audience: Supabase re-evaluates the SUBSCRIBER's JWT
// against RLS before it emits a row, so a service-role-only table would
// deliver nothing to either side no matter how the write happened.
//
// A resync token covers the gap Realtime cannot: a channel that drops
// while the tab is hidden misses every insert in between, and those are
// gone — there is no replay. Reconnect and tab-focus therefore refetch
// rather than trusting the socket.
// ============================================================

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Loader2,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Paperclip,
  RefreshCw,
  Reply,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  SUPPORT_MESSAGES_TABLE,
  type SupportAuthor,
  type SupportAuthorDirectory,
  type SupportConversation,
  type SupportMessage,
  type SupportSenderKind,
} from '@/lib/support-chat/types';
import { buildSupportPreview } from '@/lib/support-chat/validation';
import { SupportMessageBubble } from './support-message-bubble';
import type { QuotePreview } from '@/components/chat/quoted-message';
import {
  MESSAGE_FLASH_CLASS,
  useJumpToMessage,
} from '@/components/chat/use-jump-to-message';
import {
  SupportComposer,
  type SupportComposerHandle,
  type SupportReplyDraft,
  type SupportSendPayload,
} from './support-composer';
import { useTypingSignal } from './use-typing-signal';
import { SupportImageViewer } from './support-image-viewer';

/**
 * Same doodle tile the Inbox uses, so the two chats read as one product.
 * Duplicated as a constant rather than exported from `message-thread.tsx`
 * — that module pulls in the entire WhatsApp thread (templates, AI,
 * assignment) and importing it here for one string would drag all of it
 * into the Settings bundle.
 */
const DOODLE_BG_CLASSES =
  "bg-background bg-[url('/inbox-doodle.svg')] bg-repeat";

/**
 * Shortest gap between two focus-triggered resyncs.
 *
 * Returning to the tab is worth a re-read because Realtime has no replay,
 * but alt-tabbing through windows fires `visibilitychange` several times in
 * a row and nothing can have been missed in between.
 */
const MIN_RESYNC_GAP_MS = 15_000;

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function groupByDate(messages: SupportMessage[]) {
  const groups: { date: string; messages: SupportMessage[] }[] = [];
  let currentDay = '';
  for (const message of messages) {
    const day = format(new Date(message.created_at), 'yyyy-MM-dd');
    if (day !== currentDay) {
      currentDay = day;
      groups.push({ date: message.created_at, messages: [message] });
    } else {
      groups[groups.length - 1].messages.push(message);
    }
  }
  return groups;
}

interface ThreadResponse {
  conversation: SupportConversation;
  messages: SupportMessage[];
  authors: SupportAuthor[];
  has_older: boolean;
}

export function SupportThread({
  viewerKind,
  accountId,
  currentUserId,
  header,
  emptyHint,
  className,
  onConversationChange,
  canManageAll = false,
  allowExpand = true,
  active = true,
}: {
  viewerKind: SupportSenderKind;
  /** Required when `viewerKind` is 'admin'. Ignored otherwise. */
  accountId?: string;
  /** The signed-in user, so their own messages can be labelled "You". */
  currentUserId?: string;
  header?: ReactNode;
  emptyHint?: string;
  className?: string;
  /** Lets a parent list refresh its unread badge after a read/send. */
  onConversationChange?: (conversation: SupportConversation) => void;
  /**
   * Whether this viewer may act on their whole side's messages, not just
   * their own — true for a workspace owner and for every operator.
   */
  canManageAll?: boolean;
  /** Offer the full-view toggle. On by default; both audiences get it. */
  allowExpand?: boolean;
  /**
   * Whether the thread is actually in front of the reader.
   *
   * The floating bubble keeps its thread mounted while collapsed, so
   * reopening is instant instead of refetching. A collapsed thread must NOT
   * mark messages read — that would clear the unread badge for a reply
   * nobody has seen. When this turns back on, the thread marks read then.
   */
  active?: boolean;
}) {
  const [conversation, setConversation] = useState<SupportConversation | null>(
    null
  );
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [authors, setAuthors] = useState<SupportAuthorDirectory>(new Map());
  const [hasOlder, setHasOlder] = useState(false);
  /**
   * Which thread we have successfully loaded at least once.
   *
   * `loading` is DERIVED from this rather than stored, and that is the
   * whole point: a stored flag was set true on every background resync,
   * which made the render swap the entire message list for a spinner. That
   * unmounted every bubble, so each image attachment lost the signed URL it
   * was holding in state and had to fetch a new one — the image visibly
   * vanished and came back every single time the tab regained focus.
   *
   * Keyed by thread identity, not a boolean, so switching the operator's
   * selected workspace DOES show a spinner (it is genuinely a different
   * thread) while a resync of the same one does not.
   */
  const [loadedThread, setLoadedThread] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<SupportReplyDraft | null>(null);

  /**
   * Bumped to force a refetch. Realtime has no replay, so a channel that
   * reconnects or a tab that comes back from the background has to
   * re-read rather than assume it saw everything.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /** Makes this mount's Realtime topic unique. See the channel below. */
  const instanceId = useId();

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Set just before a prepend so the scroll effect restores position. */
  const prependRef = useRef<{ prevScrollHeight: number } | null>(null);
  const onConversationChangeRef = useRef(onConversationChange);
  useEffect(() => {
    onConversationChangeRef.current = onConversationChange;
  });

  /**
   * Tell the parent about the conversation, once, after it settles.
   *
   * ─── Why this is an effect and not done inline ────────────────
   *
   * The three places that update `conversation` all use the updater form
   * (`setConversation(prev => …)`) because each one derives from the
   * current value. React runs those updater functions LAZILY — during the
   * next render, inside the `useState` call — so a side effect placed
   * inside one does not run when you called setState, it runs while this
   * component is rendering. Notifying the parent from there therefore
   * meant calling the parent's setState mid-render, which React reports
   * as "Cannot update a component while rendering a different component".
   *
   * Updaters have to be pure. Commit-phase notification belongs here.
   */
  useEffect(() => {
    if (conversation) onConversationChangeRef.current?.(conversation);
  }, [conversation]);

  /**
   * The account id to send on requests — only ever set for an operator.
   *
   * A tenant deliberately sends none: the server takes their account from
   * their session, and accepting one from the client would be a tenancy
   * hole one edited request wide.
   */
  const adminAccountId = viewerKind === 'admin' ? accountId : undefined;

  // The operator addresses a specific account; the tenant never sends one.
  const accountQuery = useMemo(
    () =>
      viewerKind === 'admin' && accountId ? `?accountId=${accountId}` : '',
    [viewerKind, accountId]
  );
  const accountBody = useMemo(
    () => (viewerKind === 'admin' && accountId ? { accountId } : {}),
    [viewerKind, accountId]
  );

  // An operator with no account selected has nothing to load — the API
  // would (correctly) 400.
  const ready = viewerKind !== 'admin' || Boolean(accountId);

  /** Identity of the thread being shown, for the first-load check. */
  const threadKey = `${viewerKind}:${accountId ?? 'self'}`;

  /**
   * Spinner only while we have never loaded THIS thread.
   *
   * A background resync keeps the existing messages on screen, which is
   * what stops attachments from being torn down and refetched.
   */
  const loading = ready && loadedThread !== threadKey;

  /** When the last load attempt finished, for the resync throttle below. */
  const lastLoadAtRef = useRef(0);

  const markRead = useCallback(async () => {
    try {
      const res = await fetch('/api/support-chat/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountBody),
      });
      if (!res.ok) return;
      // Reflect the cleared badge locally instead of refetching the whole
      // thread just to learn the counter is now zero. The parent is told
      // by the effect below, NOT from inside this updater — see the note
      // there.
      setConversation((prev) => {
        if (!prev) return prev;
        return viewerKind === 'admin'
          ? { ...prev, unread_for_admin: 0 }
          : { ...prev, unread_for_account: 0 };
      });
    } catch {
      // A failed read receipt is cosmetic — the badge clears next open.
    }
  }, [accountBody, viewerKind]);

  // Read in async callbacks (load, realtime), so it has to be current at the
  // moment they fire rather than when they were created.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });

  // Coming into view with unread replies waiting: that is the read.
  const unreadForMe = conversation
    ? viewerKind === 'admin'
      ? conversation.unread_for_admin
      : conversation.unread_for_account
    : 0;
  useEffect(() => {
    if (active && conversation && unreadForMe > 0) void markRead();
  }, [active, conversation, unreadForMe, markRead]);

  // ---- Initial + resync load ----------------------------------------

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/support-chat/messages${accountQuery}`, {
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as
          ThreadResponse | { error?: string };

        if (cancelled) return;

        if (!res.ok || !('conversation' in data)) {
          setLoadError(
            ('error' in data && data.error) || 'Could not load the chat.'
          );
          return;
        }

        setLoadError(null);
        setConversation(data.conversation);
        setMessages(data.messages);
        setAuthors(new Map(data.authors.map((a) => [a.user_id, a])));
        setHasOlder(data.has_older);
        setLoadedThread(threadKey);

        // Opening the thread IS reading it — when it is actually showing.
        if (activeRef.current) void markRead();
      } catch {
        if (!cancelled) setLoadError('Could not reach the server.');
      } finally {
        // Stamped even on failure: a server that is down should not be
        // retried on every tab focus.
        lastLoadAtRef.current = Date.now();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, accountQuery, threadKey, resyncToken, markRead]);

  // ---- Realtime ------------------------------------------------------

  const conversationId = conversation?.id;

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    // Per-conversation AND per-mount. `supabase.channel(topic)` returns an
    // already-open channel rather than a new one, and adding a
    // `postgres_changes` callback to a channel that has been subscribed
    // throws. Switching the operator's selected thread away and back
    // quickly re-enters this effect with the same conversation id while the
    // asynchronous `removeChannel` from the first mount is still in flight.
    const channel = supabase
      .channel(`support-chat:${conversationId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: SUPPORT_MESSAGES_TABLE,
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as SupportMessage;
            setMessages((prev) => {
              // The sender already has this row from the POST response,
              // and an optimistic row for it may still be in the list.
              if (prev.some((m) => m.id === row.id)) return prev;

              // Matching the optimistic row: `media_key` when there is
              // one, because it is unique per object, and only then the
              // text. Matching on text alone would drop the wrong row for
              // an UNCAPTIONED attachment, where content_text is null on
              // both the real row and every other uncaptioned temp row.
              const withoutTemp = prev.filter((m) => {
                if (!m.id.startsWith('temp-')) return true;
                if (m.sender_kind !== row.sender_kind) return true;
                if (row.media_key) return m.media_key !== row.media_key;
                if (m.media_key) return true;
                return m.content_text !== row.content_text;
              });
              return [...withoutTemp, row];
            });

            // An inbound message means the badge this side just cleared
            // is dirty again. Only mark read if the reader is looking at
            // a thread that is actually on screen — document.hidden is
            // the cheapest proxy for that.
            if (
              row.sender_kind !== viewerKind &&
              !document.hidden &&
              activeRef.current
            ) {
              void markRead();
            }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            // Read receipts and deletes both arrive as updates.
            const row = payload.new as SupportMessage;
            setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
          }
        }
      )
      .subscribe((status) => {
        // A channel that errors or times out has an unknown gap behind
        // it. Refetch rather than sit on a stale thread.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setResyncToken((n) => n + 1);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, viewerKind, markRead, instanceId]);

  // Coming back to the tab: the socket may have been asleep for minutes.
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.hidden) return;
      // Throttled. Alt-tabbing across a few windows fires this repeatedly,
      // and Realtime cannot have missed anything meaningful in the seconds
      // since the last read — so refetching on each one is pure work.
      if (Date.now() - lastLoadAtRef.current < MIN_RESYNC_GAP_MS) return;
      setResyncToken((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready]);

  // ---- Scrolling -----------------------------------------------------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pending = prependRef.current;
    if (pending) {
      prependRef.current = null;
      // Hold the previously-top message under the cursor: what was
      // inserted above the viewport is exactly the height difference.
      el.scrollTop = el.scrollHeight - pending.prevScrollHeight;
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const sep = accountQuery ? '&' : '?';
      const res = await fetch(
        `/api/support-chat/messages${accountQuery}${sep}before=${encodeURIComponent(
          messages[0].created_at
        )}`,
        { cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as
        ThreadResponse | { error?: string };
      if (!res.ok || !('messages' in data)) {
        toast.error(
          ('error' in data && data.error) || 'Could not load older messages.'
        );
        return;
      }

      setHasOlder(data.has_older);
      setAuthors((prev) => {
        const next = new Map(prev);
        for (const a of data.authors) next.set(a.user_id, a);
        return next;
      });

      // The page boundary uses `lte`, so the oldest rows overlap by
      // design. De-duplicate by id instead of using `lt`, which would
      // step over messages sharing a timestamp to the second.
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const older = data.messages.filter((m) => !known.has(m.id));
        if (older.length === 0) return prev;
        prependRef.current = {
          prevScrollHeight: scrollRef.current?.scrollHeight ?? 0,
        };
        return [...older, ...prev];
      });
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, messages, accountQuery]);

  // ---- Sending -------------------------------------------------------

  const handleSend = useCallback(
    async ({
      text,
      replyToMessageId,
      mediaKey,
      filename,
      kind,
      sizeBytes,
    }: SupportSendPayload) => {
      if (!conversation) throw new Error('No conversation');

      const tempId = `temp-${Date.now()}`;
      const optimistic: SupportMessage = {
        id: tempId,
        conversation_id: conversation.id,
        account_id: conversation.account_id,
        sender_kind: viewerKind,
        sender_user_id: currentUserId ?? null,
        // An optimistic attachment row renders as a placeholder rather
        // than fetching a signed URL — the bubble skips the fetch for
        // `temp-` ids, because the message it would sign against does not
        // exist yet.
        content_type: mediaKey ? (kind ?? 'document') : 'text',
        content_text: text || null,
        media_key: mediaKey ?? null,
        media_url: null,
        media_filename: filename ?? null,
        media_mime_type: null,
        media_size_bytes: sizeBytes ?? null,
        reply_to_message_id: replyToMessageId ?? null,
        read_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch('/api/support-chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...accountBody,
            text,
            replyToMessageId,
            ...(mediaKey ? { mediaKey, filename } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: SupportMessage;
          error?: string;
        };

        if (!res.ok || !data.message) {
          // Drop the optimistic row — leaving it would show a message as
          // sent that never was.
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          toast.error(data.error ?? 'Could not send the message.');
          throw new Error(data.error ?? 'send failed');
        }

        const sent = data.message;
        setMessages((prev) => {
          // Realtime may have already delivered the real row.
          if (prev.some((m) => m.id === sent.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) => (m.id === tempId ? sent : m));
        });

        // Keep the local list row honest without a round trip.
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            last_message_at: sent.created_at,
            last_message_preview: buildSupportPreview(
              sent.content_type,
              sent.content_text
            ),
          };
        });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [conversation, viewerKind, currentUserId, accountBody]
  );

  // ---- Reply targets -------------------------------------------------

  const byId = useMemo(() => {
    const map = new Map<string, SupportMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const replyLabel = useCallback(
    (message: SupportMessage): string => {
      if (message.sender_kind === 'admin') {
        return viewerKind === 'admin' ? 'You' : 'Support';
      }
      if (message.sender_user_id && message.sender_user_id === currentUserId) {
        return 'You';
      }
      const author = message.sender_user_id
        ? authors.get(message.sender_user_id)
        : undefined;
      return author?.full_name?.trim() || author?.email?.trim() || 'Customer';
    },
    [viewerKind, currentUserId, authors]
  );

  const groups = useMemo(() => groupByDate(messages), [messages]);

  // ---- Typing ---------------------------------------------------------
  //
  // The label travels with the signal because the receiver cannot resolve
  // it: an operator has no RLS path to another workspace's profiles, and a
  // tenant should only ever see one "Support" identity regardless of which
  // operator is at the keyboard.
  const typingLabel = useMemo(() => {
    if (viewerKind === 'admin') return 'Support';
    const me = currentUserId ? authors.get(currentUserId) : undefined;
    return me?.full_name?.trim() || me?.email?.trim() || 'Customer';
  }, [viewerKind, currentUserId, authors]);

  const { typing, notifyTyping } = useTypingSignal({
    conversationId,
    viewerKind,
    label: typingLabel,
  });

  // ---- Retract -------------------------------------------------------

  const [retracting, setRetracting] = useState<string | null>(null);

  /**
   * Mine to delete?
   *
   * Side AND author, matching the server's filter. `sender_kind` alone
   * would let one operator retract another operator's reply, and one
   * teammate retract another teammate's message — both share a side but
   * neither wrote the other's words.
   */
  const canRetract = useCallback(
    (message: SupportMessage) => {
      // Never the other side's messages, whatever your role.
      if (message.sender_kind !== viewerKind) return false;
      // An owner (and any operator) can withdraw anything from their own
      // side; a member only their own. Mirrors the retract route exactly —
      // the server is the boundary, this just avoids offering an action
      // that would be refused.
      if (canManageAll) return true;
      return Boolean(currentUserId) && message.sender_user_id === currentUserId;
    },
    [viewerKind, currentUserId, canManageAll]
  );

  const retract = useCallback(
    async (message: SupportMessage) => {
      if (retracting) return;
      setRetracting(message.id);
      try {
        const res = await fetch('/api/support-chat/messages/retract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...accountBody, messageId: message.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: SupportMessage;
          error?: string;
        };
        if (!res.ok) {
          toast.error(data.error ?? 'Could not delete that message.');
          return;
        }
        // Apply the returned row rather than waiting on Realtime, so the
        // bubble flips immediately for the person who asked. The other
        // side gets the same change over the UPDATE subscription.
        if (data.message) {
          const updated = data.message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      } catch {
        toast.error('Could not reach the server.');
      } finally {
        setRetracting(null);
      }
    },
    [retracting, accountBody]
  );

  // ---- Image viewer ---------------------------------------------------
  //
  // Owned here rather than in the bubble so the viewer can offer
  // next/previous and a filmstrip across the whole thread. Bubbles report
  // their signed URL up as they resolve it; an image that has not resolved
  // yet simply is not in the strip.

  /**
   * Full view.
   *
   * Escape closes it, but only when the image viewer is not open — that has
   * its own Escape handler and the inner one has to win, or dismissing an
   * image would collapse the whole chat at the same time.
   */
  const [expanded, setExpanded] = useState(false);

  const [viewerFor, setViewerFor] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  const handleImageResolved = useCallback(
    (messageId: string, url: string | null) => {
      setImageUrls((prev) => {
        const existing = prev.get(messageId);
        if (url === (existing ?? null)) return prev; // no change, no render
        const next = new Map(prev);
        if (url) next.set(messageId, url);
        else next.delete(messageId);
        return next;
      });
    },
    []
  );

  const viewerImages = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            m.content_type === 'image' && !m.deleted_at && imageUrls.has(m.id)
        )
        .map((m) => ({
          messageId: m.id,
          url: imageUrls.get(m.id) as string,
          filename: m.media_filename,
          caption: `${replyLabel(m)} · ${format(new Date(m.created_at), 'd MMM, HH:mm')}`,
        })),
    [messages, imageUrls, replyLabel]
  );

  const viewerIndex = viewerFor
    ? viewerImages.findIndex((i) => i.messageId === viewerFor)
    : -1;

  // ---- Reply quotes ---------------------------------------------------
  //
  // Defined after the image-URL map on purpose: an image quote's thumbnail
  // IS that map's entry. Support media has no public URL — it is only
  // reachable through a signed GET — so the only thumbnail we can show is
  // one a bubble has already resolved. An image not yet resolved simply
  // quotes without a thumbnail rather than minting a second signature.

  /**
   * "Mine" for colouring: the emerald bar goes on what the viewer's own
   * side sent. For a tenant that is their own messages, not a teammate's —
   * a teammate gets their own colour, which is what tells two people on
   * the same workspace apart in a quote.
   */
  const isSelfMessage = useCallback(
    (m: SupportMessage) =>
      m.sender_kind === viewerKind &&
      (viewerKind === 'admin' ||
        (Boolean(currentUserId) && m.sender_user_id === currentUserId)),
    [viewerKind, currentUserId]
  );

  /** One builder for the composer chip AND the in-bubble quote. */
  const quoteFor = useCallback(
    (m: SupportMessage): QuotePreview => {
      const base = { authorLabel: replyLabel(m), isSelf: isSelfMessage(m) };
      if (m.deleted_at) {
        return { ...base, kind: 'deleted', text: 'This message was deleted' };
      }
      const caption = m.content_text?.trim() || '';
      switch (m.content_type) {
        case 'image':
          return {
            ...base,
            kind: 'image',
            text: caption || 'Photo',
            thumbnailUrl: imageUrls.get(m.id) ?? null,
          };
        case 'document':
          // The filename says far more than "Document" does.
          return {
            ...base,
            kind: 'document',
            text: caption || m.media_filename?.trim() || 'Document',
          };
        case 'audio':
          // Everything recorded in this chat is a voice note.
          return { ...base, kind: 'voice', text: caption || 'Voice message' };
        default:
          return { ...base, kind: 'text', text: caption || 'Message' };
      }
    },
    [replyLabel, isSelfMessage, imageUrls]
  );

  const replyQuoteFor = useCallback(
    (m: SupportMessage): QuotePreview | null => {
      if (!m.reply_to_message_id) return null;
      const parent = byId.get(m.reply_to_message_id);
      // Outside the loaded page. Still a quote — and clicking it pages back
      // through history to find the original.
      if (!parent) {
        return {
          authorLabel: 'Original message',
          isSelf: false,
          kind: 'missing',
          text: 'Tap to find it in earlier history',
        };
      }
      return quoteFor(parent);
    },
    [byId, quoteFor]
  );

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { highlightedId, jumpTo } = useJumpToMessage({
    containerRef: scrollRef,
    messageIds,
    hasOlder,
    loadOlder,
  });

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      // `viewerFor` guards the nested case described above.
      if (e.key === 'Escape' && !viewerFor) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    // Lock the page behind the overlay, and restore whatever it was — not a
    // hardcoded '' — so a parent that was already locking scroll is not
    // broken on the way out.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, viewerFor]);

  // ---- Drag and drop -------------------------------------------------
  //
  // The drop target is the message list, because that is where people aim.
  // The file is handed to the composer, which owns validation, presigning,
  // progress and cleanup.

  const composerRef = useRef<SupportComposerHandle>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * Depth counter, not a boolean.
   *
   * `dragleave` fires every time the pointer crosses into a CHILD element,
   * so a boolean flickers the overlay off and on as the cursor moves over
   * each bubble. Counting enter/leave pairs means the overlay only clears
   * when the drag has genuinely left the container.
   */
  const dragDepth = useRef(0);

  const isFileDrag = useCallback((e: React.DragEvent) => {
    // Dragging selected text within the page also fires these events;
    // only a real file drag advertises the `Files` type.
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    [isFileDrag]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      // Without preventDefault on dragover the browser refuses the drop
      // and navigates to the file instead, which loses the whole page.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [isFileDrag]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);

      // Only the first file. The composer stages one attachment per
      // message, and silently dropping the rest would be worse than
      // saying so.
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;
      if (files.length > 1) {
        toast.info('One file at a time — attaching the first.');
      }
      composerRef.current?.attachFile(files[0]);
    },
    [isFileDrag]
  );

  // ---- Render --------------------------------------------------------

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden',
        // Expanded by swapping CLASSES on the same element, not by
        // portalling or re-parenting. Either of those would remount the
        // whole thread — losing the loaded messages, the scroll position,
        // every resolved attachment URL and any draft in the composer — so
        // expanding would visibly reload the conversation.
        expanded ? 'bg-background fixed inset-0 z-50 h-full' : 'flex-1',
        className
      )}
    >
      {header}

      <div
        ref={scrollRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto p-4',
          DOODLE_BG_CLASSES
        )}
      >
        {allowExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Exit full view' : 'Open in full view'}
            aria-pressed={expanded}
            title={expanded ? 'Exit full view (Esc)' : 'Open in full view'}
            // Sticky, not absolute: the scroll container is the positioning
            // context, so `absolute` would scroll away with the messages.
            className="bg-card/90 text-muted-foreground hover:text-foreground border-border sticky top-0 z-20 float-right inline-flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors"
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        ) : null}

        {dragging ? (
          // `pointer-events-none` is load-bearing: an overlay that takes
          // pointer events would itself fire dragleave on the container
          // the instant it appeared, so the drop would never land.
          <div className="border-primary bg-primary/10 pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed backdrop-blur-sm">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              <Paperclip className="h-4 w-4" />
              Drop a file to attach it
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : loadError && messages.length === 0 ? (
          // Only when there is nothing to show. A resync that fails while
          // messages are already on screen must NOT replace them with an
          // error panel: doing so throws away the thread (and every loaded
          // attachment) over a blip, and the next tick recovers anyway.
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-muted-foreground text-sm">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResyncToken((n) => n + 1)}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessagesSquare className="text-muted-foreground/60 h-8 w-8" />
            <p className="text-muted-foreground max-w-xs text-sm">
              {emptyHint ?? 'No messages yet.'}
            </p>
          </div>
        ) : (
          <>
            {hasOlder ? (
              <div className="mb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Load earlier messages
                </Button>
              </div>
            ) : null}

            {groups.map((group) => (
              <div key={group.date}>
                <div className="mb-4 flex items-center justify-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[10px] font-medium">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((message) => (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      className={cn(
                        'group/row',
                        highlightedId === message.id && MESSAGE_FLASH_CLASS
                      )}
                    >
                      <SupportMessageBubble
                        message={message}
                        viewerKind={viewerKind}
                        currentUserId={currentUserId}
                        authorDirectory={authors}
                        reply={replyQuoteFor(message)}
                        onJumpToReply={
                          message.reply_to_message_id
                            ? () =>
                                jumpTo(message.reply_to_message_id as string)
                            : undefined
                        }
                        accountId={adminAccountId}
                        onImageResolved={handleImageResolved}
                        onOpenImage={setViewerFor}
                      />
                      {/* Reply is the one message action phase 1 keeps.
                          Hidden until hover so it does not compete with
                          the message itself. */}
                      {!message.deleted_at &&
                      !message.id.startsWith('temp-') ? (
                        <div
                          className={cn(
                            'mt-0.5 flex gap-2 opacity-0 transition-opacity group-hover/row:opacity-100',
                            message.sender_kind === viewerKind
                              ? 'justify-end'
                              : 'justify-start'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setReplyTo({
                                id: message.id,
                                quote: quoteFor(message),
                              })
                            }
                            aria-label="Reply to this message"
                            title="Reply"
                            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-6 items-center justify-center rounded-full transition-colors"
                          >
                            <Reply className="size-3.5" />
                          </button>
                          {/* Retract is offered only on your OWN messages,
                              and the server enforces the same rule — a
                              super admin cannot rewrite a tenant's
                              history. */}
                          {canRetract(message) ? (
                            <button
                              type="button"
                              onClick={() => void retract(message)}
                              disabled={retracting === message.id}
                              aria-label="Delete message"
                              title="Delete message"
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex size-6 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                            >
                              {retracting === message.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Outside the scroll container, pinned above the composer. Inside
          it, the indicator would sit below the last message and be
          invisible whenever the reader was scrolled up. */}
      {typing ? (
        <div className="border-border bg-card text-muted-foreground flex items-center gap-2 border-t px-4 py-1.5 text-xs">
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
          </span>
          <span aria-live="polite">{typing.label} is typing…</span>
        </div>
      ) : null}

      <SupportComposer
        ref={composerRef}
        onSend={handleSend}
        onTyping={notifyTyping}
        // Blocked only when there is genuinely nothing to reply to. A
        // failed resync on a loaded thread leaves `loadError` set, and
        // locking the composer for that would stop someone replying to
        // messages they can see perfectly well.
        disabled={!ready || loading || !conversation}
        placeholder={
          viewerKind === 'admin'
            ? 'Reply to this workspace'
            : 'Message the Replai team'
        }
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        accountId={adminAccountId}
      />

      {viewerIndex >= 0 ? (
        <SupportImageViewer
          images={viewerImages}
          startIndex={viewerIndex}
          onClose={() => setViewerFor(null)}
        />
      ) : null}
    </div>
  );
}
