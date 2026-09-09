'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useId,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import { PresenceDot } from '@/components/presence/presence-dot';
import { presenceLabel } from '@/lib/presence';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  MessageTemplate,
  Profile,
  InteractiveMessagePayload,
} from '@/types';
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Check,
  Clock,
  ArrowLeft,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  UserX,
  ExternalLink,
  Pin,
  Loader2,
  X,
  Star,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { MessageActions } from './message-actions';
import {
  MessageComposer,
  CHAT_MEDIA_BUCKET,
  type SendMediaPayload,
} from './message-composer';
import { deleteAccountMedia } from '@/lib/storage/upload-media';
import {
  TemplatePicker,
  buildTemplateSendRequest,
  type TemplateSendValues,
} from './template-picker';
import type { TemplateRenderData } from './template-message';
import { definitionFromRow } from '@/lib/whatsapp/template-definition';
import type { WhatsAppContactCard } from '@/lib/whatsapp/meta-api';
import {
  DEFAULT_LOCATION_REQUEST_PROMPT,
  type LocationPayload,
} from './location-picker-dialog';
import { AiThreadBanner } from './ai-thread-banner';
import { buildReplyPreview } from './reply-quote';
import { isOutboundSender } from '@/lib/messages/sender-type';
import { buildAuthorDirectory } from '@/lib/messages/author-label';
import { describeSendFailure } from '@/lib/whatsapp/meta-send-errors';
import { toast } from 'sonner';

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    return params[idx] ?? `{{${raw}}}`;
  });
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
  isFloating?: boolean;
  onPopOut?: () => void;
  headerActions?: React.ReactNode;
}

function formatDateSeparator(
  dateStr: string,
  t: ReturnType<typeof useTranslations>
): string {
  const date = new Date(dateStr);
  if (isToday(date)) return t('today');
  if (isYesterday(date)) return t('yesterday');
  return format(date, 'MMMM d, yyyy');
}

/**
 * How many messages one page of thread history holds.
 *
 * Must stay comfortably under PostgREST's 1,000-row response cap, which is
 * what silently truncated this thread before paging existed. 300 covers
 * more than anyone scrolls in a sitting while keeping the initial render
 * bounded — a coexistence import can leave a single conversation with
 * thousands of messages, and putting all of them in the DOM is its own
 * problem.
 */
const MESSAGE_PAGE_SIZE = 300;

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), 'yyyy-MM-dd');
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: {
  label: string;
  value: ConversationStatus;
  color: string;
}[] = [
  { label: 'Open', value: 'open', color: 'text-primary' },
  { label: 'Pending', value: 'pending', color: 'text-amber-400' },
  { label: 'Closed', value: 'closed', color: 'text-muted-foreground' },
];

/**
 * WhatsApp-style doodle background applied to the chat area (both the
 * active thread and the empty state). The SVG tile lives at
 * `/public/inbox-doodle.svg`; the slate-950 colour sits underneath so
 * the doodles read as a subtle pattern rather than a stark grid.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const DOODLE_BG_CLASSES =
  "bg-background bg-[url('/inbox-doodle.svg')] bg-repeat";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
  isFloating,
  onPopOut,
  headerActions,
}: MessageThreadProps) {
  const t = useTranslations('Inbox.messageThread');
  const tTimer = useTranslations('Inbox.sessionTimer');
  const tQuote = useTranslations('Inbox.replyQuote');
  const instanceId = useId();

  const { user, isOwner } = useAuth();
  const { getPresence, getRow, now } = usePresence();
  const [loading, setLoading] = useState(false);
  /** Older history probably exists behind the loaded page. */
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  /**
   * Set immediately before a prepend so the scroll effect restores the
   * reading position instead of jumping to the bottom. Holds the pre-
   * prepend scrollHeight, which is the only way to work out how much
   * content was inserted above the viewport.
   */
  const prependRef = useRef<{ prevScrollHeight: number } | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  /**
   * Template header / footer / buttons, keyed by template name.
   *
   * A message row stores only the RENDERED body, not the structure around
   * it, so a template message could never show its header, footer or
   * buttons — an agent saw a plain paragraph where the customer saw a card
   * with a Track Order button. This map supplies the missing parts.
   *
   * Fetched once per conversation rather than per message: the alternative
   * is one request per bubble, and a long thread of template sends would
   * fan out badly. Keyed by name alone because `messages.template_name` is
   * the only link stored — there is no language column on the message, so
   * a template translated into several languages resolves to whichever row
   * arrives first. Acceptable, since header shape and buttons are the same
   * across translations even when the wording is not.
   *
   * Failure is silent by design: without this the body still renders, so a
   * fetch error must degrade the card rather than break the thread.
   */
  const [templateRenderMap, setTemplateRenderMap] = useState<
    Record<string, TemplateRenderData>
  >({});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*');

      if (cancelled) return;
      if (error) {
        console.warn(
          '[message-thread] template details unavailable, template cards will show body only:',
          error.message
        );
        return;
      }

      const map: Record<string, TemplateRenderData> = {};
      for (const row of data ?? []) {
        if (!row.name) continue;
        const def = definitionFromRow(row);
        map[row.name] = {
          definition: def,
          headerType: row.header_type,
          headerContent: row.header_content,
          headerMediaUrl: row.header_media_url,
          footerText: row.footer_text,
          buttons: row.buttons,
          bodyText: row.body_text,
        };
      }
      setTemplateRenderMap(map);
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see: `profiles_select` (migration 017) is
  // `auth.uid() = user_id OR is_account_member(account_id)`, so an
  // unfiltered select returns exactly this account's team. Used by the
  // assignment dropdown AND by the per-message author badge.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to fetch profiles:', error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // user_id → member, for the per-message author badge. Memoised on the
  // profiles array so it is rebuilt when the team changes and not once
  // per message per render.
  const authorDirectory = useMemo(
    () => buildAuthorDirectory(profiles),
    [profiles]
  );

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: '' };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === 'customer');

    if (!lastCustomerMsg)
      return { expired: true, remaining: 'No customer messages' };

    const hoursSince = differenceInHours(
      new Date(),
      new Date(lastCustomerMsg.created_at)
    );
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: tTimer('expired') };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? tTimer('xhRemaining', { hours: Math.floor(hoursLeft) })
        : tTimer('xmRemaining', { minutes: Math.floor(hoursLeft * 60) });

    return { expired, remaining };
  }, [messages, tTimer]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      // NEWEST-first with an explicit limit, then reversed for display.
      //
      // THE BUG THIS FIXES: this used to be `.order('created_at', {
      // ascending: true })` with no limit, on the assumption that "no
      // limit" means "everything". PostgREST caps a response at 1,000
      // rows regardless, so an ascending sort silently returned the
      // OLDEST 1,000 and dropped the rest.
      //
      // Invisible until a conversation grew past 1,000 messages, which the
      // coexistence history import does in one shot — one thread here
      // reached 7,003. The consequences were both reported as separate
      // bugs:
      //
      //   * the newest messages simply never rendered, while the
      //     conversation list still previewed them correctly (it reads
      //     conversations.last_message_text, not this query)
      //   * the 24-hour window read as expired, because the newest
      //     customer message this query could see was five weeks old
      //
      // A chat thread wants the TAIL, so descending + limit is also the
      // right shape: it is bounded work no matter how long the history is.
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch messages:', error);
      } else {
        const page = data ?? [];
        // A full page means there is probably older history behind it.
        setHasOlder(page.length === MESSAGE_PAGE_SIZE);
        onMessagesLoadedRef.current([...page].reverse());
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus —
    // realtime is best-effort and any message events sent while the WS
    // was disconnected or throttled are otherwise lost.
  }, [conversationId, resyncToken]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('conversation_id', conversationId);
      if (cancelled) return;
      if (error) {
        console.error('Failed to fetch reactions:', error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Starred & hidden message IDs for the current user (Phase 7)
  useEffect(() => {
    if (!conversationId || !user?.id) {
      setStarredIds(new Set());
      setHiddenIds(new Set());
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [starsRes, hiddenRes] = await Promise.all([
        supabase
          .from('message_stars')
          .select('message_id')
          .eq('user_id', user.id),
        supabase
          .from('message_hidden_users')
          .select('message_id')
          .eq('user_id', user.id),
      ]);

      if (cancelled) return;

      // Typed narrowly rather than `any`: both tables are keyed by
      // (message_id, user_id) and only the id is read here.
      type MessageIdRow = { message_id: string };
      if (starsRes.data) {
        setStarredIds(
          new Set((starsRes.data as MessageIdRow[]).map((r) => r.message_id))
        );
      }
      if (hiddenRes.data) {
        setHiddenIds(
          new Set((hiddenRes.data as MessageIdRow[]).map((r) => r.message_id))
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.id, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith('temp-') &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, [conversationId]);

  // Reset the server-side unread_count and send blue ticks (status: 'read')
  // to Meta whenever an unread count surfaces on the active conversation.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    fetch(`/api/whatsapp/conversations/${conversationId}/read`, {
      method: 'POST',
    }).catch((error) => {
      console.error('Failed to mark conversation as read:', error);
    });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages — except after a prepend, where
  // jumping to the bottom would throw away the position of whatever the
  // reader just asked to see more of.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pending = prependRef.current;
    if (pending) {
      prependRef.current = null;
      // Keep the previously-top message under the cursor: everything
      // inserted above the viewport is exactly the height difference.
      el.scrollTop = el.scrollHeight - pending.prevScrollHeight;
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [messages]);

  /**
   * Pull the page of history immediately before what is loaded.
   *
   * Uses `lte` on the oldest loaded timestamp rather than `lt`, then
   * de-duplicates by id. Imported history routinely contains several
   * messages sharing one timestamp to the second, and `lt` would step
   * straight over them — losing messages silently, which is worse than
   * re-reading a couple and discarding them.
   */
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingOlder || messages.length === 0) return;

    const oldest = messages[0];
    setLoadingOlder(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lte('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) {
        console.error('Failed to load older messages:', error);
        return;
      }

      const known = new Set(messages.map((m) => m.id));
      const older = [...(data ?? [])]
        .reverse()
        .filter((m) => !known.has(m.id as string));

      // A short page means we reached the beginning. Measured on the raw
      // response, not the de-duplicated list, or the boundary overlap
      // would look like exhaustion.
      setHasOlder((data ?? []).length === MESSAGE_PAGE_SIZE);

      if (older.length > 0) {
        prependRef.current = {
          prevScrollHeight: scrollRef.current?.scrollHeight ?? 0,
        };
        onMessagesLoadedRef.current([...older, ...messages] as Message[]);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, messages]);

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'text',
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send message:', reason);
          toast.error(`Failed to send: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row. If realtime hasn't arrived yet, at least
        // flip status to 'sent' so the UI stops showing "sending".
        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send message:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === 'document'
          ? payload.caption || payload.filename || 'Document'
          : payload.caption;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: payload.kind,
        content_text: contentText,
        media_url: payload.mediaUrl,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send media:', reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
            () => {}
          );
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send media:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
          () => {}
        );
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendInteractive = useCallback(
    async (payload: InteractiveMessagePayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      // Optimistic bubble — renders the buttons/list immediately via the
      // interactive_payload, same as the persisted row will.
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'interactive',
        content_text: payload.body,
        interactive_payload: payload,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'interactive',
            interactive_payload: payload,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send interactive message:', reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send interactive message:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendContacts = useCallback(
    async (contacts: WhatsAppContactCard[], replyToId?: string) => {
      if (!conversation || !contacts.length) return;

      const tempId = `temp-${Date.now()}`;
      const contactNames = contacts
        .map((c) => c.name?.formatted_name || 'Contact')
        .join(', ');

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'contacts',
        content_text: `👤 ${contactNames}`,
        contacts_payload: contacts as unknown as Record<string, unknown>[],
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'contacts',
            contacts_payload: contacts,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send contact card:', reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send contact card:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendLocation = useCallback(
    async (location: LocationPayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const locationLabel =
        [location.name, location.address].filter(Boolean).join(', ') ||
        `${location.latitude}, ${location.longitude}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'location',
        content_text: `📍 ${locationLabel}`,
        latitude: location.latitude,
        longitude: location.longitude,
        location_name: location.name || null,
        location_address: location.address || null,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'location',
            location,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send location pin:', reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to send location pin:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleRequestLocation = useCallback(
    async (promptText: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'interactive',
        content_text: `📍 ${promptText}`,
        interactive_payload: {
          type: 'location_request_message',
          body: promptText,
          action: { name: 'send_location' },
        } as unknown as InteractiveMessagePayload,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'location_request',
            content_text: promptText,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to request location:', reason);
          toast.error(`Failed to request location: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        console.error('Failed to request location:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to request location: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  /**
   * One-tap location request from the "Live Location Shared" card.
   *
   * Skips the picker dialog deliberately: the card is already the answer to
   * "the customer sent something I cannot see", and making the agent open a
   * dialog to retype a sentence we have a sensible default for adds a step
   * without adding a decision. The wording is shared with the dialog so the
   * two entry points cannot drift.
   */
  const handleRequestLocationDefault = useCallback(() => {
    void handleRequestLocation(DEFAULT_LOCATION_REQUEST_PROMPT);
  }, [handleRequestLocation]);

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      await supabase
        .from('conversations')
        .update({ status })
        .eq('id', conversation.id);

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (template: MessageTemplate, values: TemplateSendValues) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = `temp-${Date.now()}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: 'template',
        content_text: renderedBody,
        template_name: template.name,
        status: 'sending',
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Shared with the contacts panel — see buildTemplateSendRequest
          // for why this must never be written out field by field.
          body: JSON.stringify(
            buildTemplateSendRequest({
              template,
              values,
              target: { conversationId: conversation.id },
              contentText: renderedBody,
            })
          ),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          // Translate before showing. This used to print
          // `payload?.error || "HTTP " + res.status`, which surfaced a bare
          // "HTTP 502" whenever the JSON body did not survive — a gateway
          // status that reads like an outage when the real cause is almost
          // always a fixable account condition (no payment method, the
          // 24-hour window closed, template not approved, number not
          // registered). describeSendFailure maps Meta's codes and, failing
          // that, explains the status in words.
          const reason = describeSendFailure({
            status: res.status,
            error: payload?.error,
          });
          // Keep the raw values in the console — the operator gets the
          // explanation, a developer still needs the original.
          console.error('Failed to send template:', {
            status: res.status,
            rawError: payload?.error ?? '(no JSON body returned)',
            shown: reason,
          });
          toast.error(reason);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, { status: 'sent' });
      } catch (err) {
        // A throw here means the request never completed — offline, DNS,
        // TLS, or the server dropping the connection. Distinct from a
        // response we could read, so it gets its own wording.
        console.error('Failed to send template:', err);
        toast.error(
          'Could not reach the server to send this template. Check your ' +
            'internet connection and try again.'
        );
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const contactDisplayName = contact?.name || contact?.phone || 'Customer';

  // Author label for a quoted message: "You" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      // 'business_app' counts as "You": the business did send it, just
      // from the phone rather than here. The bubble carries a "from
      // phone" marker so the distinction is not lost.
      return isOutboundSender(m.sender_type) ? 'You' : contactDisplayName;
    },
    [contactDisplayName]
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg, tQuote),
      });
    },
    [authorLabelFor]
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn('[reactions] missing user or conversation');
        return;
      }
      if (messageId.startsWith('temp-')) {
        toast.error('Wait for the message to finish sending');
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === 'agent' &&
            r.actor_id === userId
        );
        if (emoji === '') return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            message_id: messageId,
            conversation_id: convId,
            actor_type: 'agent',
            actor_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetch('/api/whatsapp/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Reaction failed: ${reason}`);
        setReactions(snapshot);
      }
    },
    [conversation, user?.id]
  );

  const handleToggleStar = useCallback(
    async (msgId: string) => {
      const isStarred = starredIds.has(msgId);
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (isStarred) next.delete(msgId);
        else next.add(msgId);
        return next;
      });

      try {
        const res = await fetch(`/api/whatsapp/messages/${msgId}/star`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to update star');
        toast.success(isStarred ? 'Message unstarred' : 'Message starred');
      } catch {
        setStarredIds((prev) => {
          const next = new Set(prev);
          if (isStarred) next.add(msgId);
          else next.delete(msgId);
          return next;
        });
        toast.error('Failed to update star');
      }
    },
    [starredIds]
  );

  const handleTogglePin = useCallback(
    async (msgId: string) => {
      if (!conversation) return;
      const isPinned = conversation.pinned_message_id === msgId;
      const nextPinnedId = isPinned ? null : msgId;

      try {
        const res = await fetch(
          `/api/whatsapp/conversations/${conversation.id}/pin`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: nextPinnedId }),
          }
        );
        if (!res.ok) throw new Error('Failed to update pin');
        toast.success(isPinned ? 'Message unpinned' : 'Message pinned to chat');
        onRefresh?.();
      } catch {
        toast.error('Failed to update pinned message');
      }
    },
    [conversation, onRefresh]
  );

  const handleDeleteForMe = useCallback(async (msgId: string) => {
    setHiddenIds((prev) => new Set(prev).add(msgId));
    try {
      const res = await fetch(`/api/whatsapp/messages/${msgId}/hide`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to hide message');
      toast.success('Message deleted for you');
    } catch {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
      toast.error('Failed to delete message');
    }
  }, []);

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const supabase = createClient();
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('id', conversation.id);

      if (error) {
        console.error('Failed to update assignment:', error);
        toast.error('Failed to update assignment');
        return;
      }

      const assignee = profiles.find((p) => p.user_id === agentId);
      if (agentId && assignee) {
        toast.success(t('assignedTo', { name: assignee.full_name }));
      } else {
        toast.success(t('unassignedSuccess'));
      }

      onAssignChange(conversation.id, agentId);
    },
    [conversation, onAssignChange, profiles, t]
  );

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => !hiddenIds.has(m.id));
  }, [messages, hiddenIds]);
  const messageGroups = useMemo(() => {
    return groupMessagesByDate(visibleMessages);
  }, [visibleMessages]);
  const pinnedMessage = useMemo(() => {
    if (!conversation?.pinned_message_id) return null;
    return (
      messages.find((m) => m.id === conversation.pinned_message_id) ?? null
    );
  }, [conversation?.pinned_message_id, messages]);

  // Empty state — same WhatsApp-style doodle background as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center',
          DOODLE_BG_CLASSES
        )}
      >
        <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
          <MessageSquare className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="text-muted-foreground mt-4 text-sm font-medium">
          {t('selectConversation')}
        </h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('selectConversationHint')}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? t('assigned'))
    : t('assign');

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' break-words / max-w caps apply.
    // Issue #257.
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', DOODLE_BG_CLASSES)}
    >
      {/* Header — solid card surface sits on top of the doodle so the
          name/avatar/dropdowns stay legible. */}
      <div
        className={cn(
          'border-border bg-card flex items-center justify-between gap-2 border-b px-3 py-3 sm:px-4',
          isFloating && 'drag-handle'
        )}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('backToConversations')}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="bg-muted text-foreground flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-foreground truncate text-sm font-semibold">
              {displayName}
            </h2>
            <p className="text-muted-foreground truncate text-xs">
              {contact.phone}
            </p>
          </div>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              'border-border ml-1 hidden gap-1 text-[10px]',
              isFloating ? 'hidden' : 'sm:ml-2 sm:inline-flex',
              sessionInfo.expired ? 'text-red-400' : 'text-primary'
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Contact-panel toggle — desktop only. The contact sidebar
              eats a chunk of horizontal width that crowds the thread on
              smaller laptops; this lets agents reclaim it when they just
              want to read and reply. Hidden on mobile, where the sidebar
              never renders as a permanent panel anyway. Issue #258. */}
          {onToggleContactPanel && (
            <button
              type="button"
              onClick={onToggleContactPanel}
              aria-label={
                contactPanelOpen ? t('hideContactPanel') : t('showContactPanel')
              }
              title={contactPanelOpen ? t('hideContact') : t('showContact')}
              aria-pressed={contactPanelOpen}
              className={cn(
                'hover:bg-muted hover:text-foreground hidden h-7 w-7 items-center justify-center rounded-md transition-colors lg:inline-flex',
                contactPanelOpen ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {contactPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Pop out button — only shown if onPopOut is provided and it's not already floating */}
          {!isFloating && onPopOut && (
            <button
              type="button"
              onClick={onPopOut}
              aria-label="Pop out chat"
              title="Pop out chat"
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}

          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label={t('refreshConversation')}
              title={t('refresh')}
              className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-60'
              )}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs whitespace-nowrap',
                currentStatus?.color ?? 'text-muted-foreground',
                isFloating && 'w-7 px-1' // Make it a square icon button when floating
              )}
            >
              <span className={cn(isFloating && 'hidden')}>
                {currentStatus
                  ? t(`status${currentStatus.label}`)
                  : t('status')}
              </span>
              {isFloating ? (
                <div
                  className="h-3 w-3 rounded-full border-[2px] border-current"
                  title={
                    currentStatus
                      ? t(`status${currentStatus.label}`)
                      : t('status')
                  }
                />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn('text-sm', opt.color)}
                >
                  {t(`status${opt.label}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown (owner only) */}
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap',
                  isFloating && 'w-7 justify-center px-0' // Make it a square icon button when floating
                )}
                title={assignLabel}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span
                  className={cn(isFloating ? 'hidden' : 'hidden sm:inline')}
                >
                  {assignLabel}
                </span>
                {!isFloating && <ChevronDown className="h-3 w-3" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-border bg-muted min-w-48"
              >
                {profiles.length === 0 ? (
                  <DropdownMenuItem
                    disabled
                    className="text-muted-foreground text-sm"
                  >
                    {t('noTeammates')}
                  </DropdownMenuItem>
                ) : (
                  <>
                    {profiles.map((p) => {
                      const isSelected = p.user_id === assignedAgentId;
                      return (
                        <DropdownMenuItem
                          key={p.id}
                          onClick={() => handleAssignChange(p.user_id)}
                          className="text-muted-foreground flex items-center gap-2 text-sm"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-medium text-violet-600">
                            {p.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="flex-1">
                            {p.full_name}
                            {p.user_id === user?.id ? t('me') : ''}
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-violet-600" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    {assignedAgentId && (
                      <>
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem
                          onClick={() => handleAssignChange(null)}
                          className="flex items-center gap-2 text-sm text-red-600"
                        >
                          <UserX className="h-4 w-4" />
                          {t('unassign')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Custom actions (like floating window controls) */}
          {headerActions}
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 relative flex-1 overflow-y-auto px-4 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {/* Pinned Message Strip (Phase 7) */}
        {pinnedMessage && (
          <div className="bg-card/95 border-border sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 border-b px-4 py-2 text-xs shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`msg-${pinnedMessage.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-2', 'ring-primary', 'transition-all');
                  setTimeout(
                    () => el.classList.remove('ring-2', 'ring-primary'),
                    2000
                  );
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity hover:opacity-80"
            >
              <Pin className="text-primary fill-primary h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1 truncate">
                <span className="text-foreground mr-1.5 font-semibold">
                  Pinned:
                </span>
                <span className="text-muted-foreground truncate">
                  {pinnedMessage.content_text ||
                    pinnedMessage.location_name ||
                    pinnedMessage.media_filename ||
                    `[${pinnedMessage.content_type}]`}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTogglePin(pinnedMessage.id)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1"
              title="Unpin message"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">
              {t('noMessagesYet')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('sendTemplateHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Earlier history is paged rather than loaded up front. On a
                coexistence account a thread can hold thousands of imported
                messages, so this keeps the thread reachable without making
                every open pay for all of it. */}
            {hasOlder ? (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingOlder}
                  className="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {loadingOlder ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            ) : null}

            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[10px] font-medium">
                    {formatDateSeparator(group.date, t)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel: isOutboundSender(parent.sender_type)
                            ? t('me')
                            : contact?.name || contact?.phone || 'Unknown',
                          preview: buildReplyPreview(parent, tQuote),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — `msgReactions`
                    // and `user?.id` are already in scope, no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const own = msgReactions?.find(
                        (r) =>
                          r.actor_type === 'agent' && r.actor_id === user?.id
                      );
                      const next = own?.emoji === emoji ? '' : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <div
                        id={`msg-${msg.id}`}
                        key={msg.id}
                        className="rounded-lg transition-all"
                      >
                        <MessageActions
                          message={msg}
                          onReply={() => handleStartReply(msg)}
                          onReact={(emoji) => {
                            if (emoji) void postReaction(msg.id, emoji);
                          }}
                          isStarred={starredIds.has(msg.id)}
                          onToggleStar={() => handleToggleStar(msg.id)}
                          isPinned={conversation.pinned_message_id === msg.id}
                          onTogglePin={() => handleTogglePin(msg.id)}
                          onDeleteForMe={() => handleDeleteForMe(msg.id)}
                        >
                          <MessageBubble
                            message={msg}
                            template={
                              msg.template_name
                                ? (templateRenderMap[msg.template_name] ?? null)
                                : null
                            }
                            reply={reply}
                            reactions={msgReactions}
                            currentUserId={user?.id}
                            isStarred={starredIds.has(msg.id)}
                            onToggleReaction={handlePillToggle}
                            authorDirectory={authorDirectory}
                            onRequestLocation={handleRequestLocationDefault}
                          />
                        </MessageActions>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI auto-reply banner — take over an active bot, or resume it
          after a handoff. Renders nothing unless the account has
          auto-reply configured. */}
      <AiThreadBanner
        conversationId={conversation.id}
        disabled={conversation.ai_autoreply_disabled ?? false}
        handoffSummary={conversation.ai_handoff_summary}
        assignedAgentId={assignedAgentId}
        currentUserId={user?.id}
        onChange={(patch) => {
          if ('assigned_agent_id' in patch) {
            onAssignChange(conversation.id, patch.assigned_agent_id ?? null);
          }
        }}
      />

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onSendInteractive={handleSendInteractive}
        onSendContacts={handleSendContacts}
        onSendLocation={handleSendLocation}
        onRequestLocation={handleRequestLocation}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        isFloating={isFloating}
      />

      <TemplatePicker
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onSelect={handleSendTemplate}
      />
    </div>
  );
}
