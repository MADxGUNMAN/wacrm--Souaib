'use client';

// ============================================================
// Super Admin → Live chat. The operator's end of every support thread.
//
// Two panes, matching the inbox the tenants already use: a conversation
// list on the left and one thread on the right. The thread itself is the
// shared `SupportThread` in `admin` mode, so there is one implementation
// of paging, realtime, read receipts and optimistic sends rather than
// two that drift.
//
// Workspaces with no thread are deliberately absent from the list. A
// conversation row is created lazily when someone first opens the pane,
// so an empty list means nobody has asked for help — not that the query
// is broken.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PresenceDot } from '@/components/presence/presence-dot';
import { SupportThread } from '@/components/support-chat/support-thread';
import { SupportNewMessageDialog } from '@/components/super-admin/support-new-message-dialog';
import type { SupportAccessRow } from '@/lib/support-chat/availability';
import { useAuth } from '@/hooks/use-auth';
import { usePresenceForAccount } from '@/hooks/use-presence';
import {
  formatLastSeen,
  presenceLabel,
  summarize,
  type PresenceStatus,
} from '@/lib/presence';
import type {
  SupportAuthor,
  SupportConversation,
  SupportConversationWithAccount,
} from '@/lib/support-chat/types';
import { cn } from '@/lib/utils';

/**
 * How often the list re-reads.
 *
 * The LIST is polled rather than subscribed: an operator watching every
 * workspace would need a Realtime subscription with no conversation
 * filter, and the `support_conversations` super-admin SELECT policy runs
 * per emitted row. A 20-second poll on a table with one row per paying
 * workspace is cheaper and cannot silently miss a row. The open THREAD is
 * still fully realtime — that is where latency is actually felt.
 */
const LIST_POLL_MS = 20_000;

interface SupportCounts {
  open: number;
  closed: number;
  total: number;
}

const EMPTY_COUNTS: SupportCounts = { open: 0, closed: 0, total: 0 };

/**
 * Status vocabulary for the tiles and the thread header.
 *
 * Only two states, unlike the four-state inboxes elsewhere in the admin
 * panel. A support chat has no "read" or "replied" to track — the unread
 * counters already answer both — so the only useful distinction is whether
 * this thread still needs someone.
 */
const STATUS_META: Record<
  'open' | 'closed',
  { label: string; text: string; icon: React.ElementType }
> = {
  open: { label: 'Open', text: 'text-blue-700', icon: MessagesSquare },
  closed: { label: 'Closed', text: 'text-slate-600', icon: CheckCircle2 },
};

function relativeTime(ts: string | null): string {
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * The workspace's best presence, plus the row behind it.
 *
 * "Best" because the question an operator is asking is whether anyone is
 * there to answer — one member online makes the workspace reachable even
 * if four others are not. The returned row is whichever member was seen
 * most recently, so the offline tooltip reports the freshest "last seen"
 * rather than the staleest.
 */
function rollUpPresence(
  members: SupportAuthor[],
  getPresence: (userId: string) => PresenceStatus,
  getRow: (userId: string) => { last_seen_at: string } | undefined
): { status: PresenceStatus; lastSeenAt: string | null } {
  const counts = summarize(members.map((m) => getPresence(m.user_id)));
  const status: PresenceStatus =
    counts.online > 0 ? 'online' : counts.away > 0 ? 'away' : 'offline';

  let lastSeenAt: string | null = null;
  for (const member of members) {
    const seen = getRow(member.user_id)?.last_seen_at;
    if (!seen) continue;
    if (!lastSeenAt || new Date(seen) > new Date(lastSeenAt)) lastSeenAt = seen;
  }

  return { status, lastSeenAt };
}

export default function SuperAdminLiveChatPage() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState<
    SupportConversationWithAccount[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>(
    'all'
  );
  const [counts, setCounts] = useState<SupportCounts>(EMPTY_COUNTS);
  /**
   * Selection is by WORKSPACE, not by conversation id.
   *
   * "New message" can pick a workspace that has never had a conversation,
   * so there is no id to select yet. `pendingTarget` is a stand-in row for
   * that case; as soon as the thread opens (which creates the conversation)
   * the list reloads and the real row takes over under the same account id,
   * with no remount of the thread in between.
   */
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [pendingTarget, setPendingTarget] =
    useState<SupportConversationWithAccount | null>(null);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  /**
   * `?account=<id>` deep link (e.g. "Open chat" in the reply email log).
   * Read once on mount into a ref and applied after the first list load,
   * so the server render and first client render agree.
   */
  const deepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('account');
    if (id) deepLinkRef.current = id;
  }, []);

  // Search and the unread filter are applied client-side on an already
  // loaded list, so typing does not refire the request on every keystroke.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch('/api/super-admin/support-chat/conversations', {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        conversations?: SupportConversationWithAccount[];
        counts?: SupportCounts;
        chat_enabled?: boolean;
        error?: string;
      };
      if (!res.ok || !data.conversations) {
        setError(data.error ?? 'Could not load conversations.');
        return;
      }
      setError(null);
      setConversations(data.conversations);
      setCounts(data.counts ?? EMPTY_COUNTS);
      setChatEnabled(data.chat_enabled !== false);

      const linked = deepLinkRef.current;
      if (linked) {
        deepLinkRef.current = null;
        if (data.conversations.some((c) => c.account_id === linked)) {
          setSelectedAccountId(linked);
        }
        // Drop the param so a refresh or back-navigation does not keep
        // forcing this thread open.
        const url = new URL(window.location.href);
        url.searchParams.delete('account');
        window.history.replaceState(null, '', url.pathname + url.search);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      // Skip the poll while the tab is hidden — nobody is reading it, and
      // a backgrounded admin tab left open overnight would otherwise keep
      // hitting the endpoint.
      if (!document.hidden) void load(true);
    }, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (unreadOnly && c.unread_for_admin <= 0) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!term) return true;
      return (
        (c.account_name ?? '').toLowerCase().includes(term) ||
        (c.last_message_preview ?? '').toLowerCase().includes(term)
      );
    });
  }, [conversations, search, unreadOnly, statusFilter]);

  /**
   * Open or close a thread.
   *
   * Optimistic, then rolled back on failure — following the reports inbox,
   * where the note is that a silently-failed PATCH leaves the UI claiming
   * a state the database does not have.
   */
  const setStatus = useCallback(
    async (id: string, status: 'open' | 'closed') => {
      const previous = conversations.find((c) => c.id === id)?.status;
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status } : c))
      );
      try {
        const res = await fetch('/api/super-admin/support-chat/conversations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? 'Could not update the conversation.');
        }
        // Refetch so the tiles track the change too.
        void load(true);
      } catch (err) {
        if (previous) {
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, status: previous } : c))
          );
        }
        toast.error(
          err instanceof Error ? err.message : 'Could not update the thread.'
        );
      }
    },
    [conversations, load]
  );

  const selected = useMemo(() => {
    if (!selectedAccountId) return null;
    return (
      conversations.find((c) => c.account_id === selectedAccountId) ??
      (pendingTarget?.account_id === selectedAccountId ? pendingTarget : null)
    );
  }, [conversations, selectedAccountId, pendingTarget]);

  /** Open a workspace picked from "New message". */
  const handlePick = useCallback((row: SupportAccessRow) => {
    setPendingTarget({
      // No conversation yet, or one the list has not loaded: an empty id
      // marks the stand-in, and hides Close until the real row arrives.
      id: row.conversationId ?? '',
      account_id: row.accountId,
      last_message_at: row.lastMessageAt,
      last_message_preview: null,
      unread_for_account: 0,
      unread_for_admin: 0,
      status: 'open',
      created_at: row.createdAt,
      updated_at: row.createdAt,
      account_name: row.accountName,
      members: row.owner
        ? [
            {
              user_id: row.owner.user_id,
              full_name: row.owner.full_name,
              email: row.owner.email,
              avatar_url: row.owner.avatar_url,
            },
          ]
        : [],
      owner: row.owner,
      access: { available: row.access.available, reason: row.access.reason },
    });
    setSelectedAccountId(row.accountId);
  }, []);

  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  });

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_for_admin || 0), 0),
    [conversations]
  );

  // The thread reports its own counter changes so the list row stops
  // showing a badge the operator has just cleared, without a refetch.
  const handleConversationChange = useCallback(
    (updated: SupportConversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
      // Reload the list when it cannot describe this thread correctly:
      // the conversation was just created for a workspace picked from "New
      // message", or the workspace had no access and a send may have just
      // granted it. Both are rare events, so this is not a polling loop.
      const listed = conversationsRef.current.find((c) => c.id === updated.id);
      if (!listed || listed.access?.available === false) void load(true);
    },
    [load]
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <SupportNewMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        onPick={handlePick}
      />

      {!chatEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Live chat is turned off. Customers can&rsquo;t see it, and you
            can&rsquo;t send until it&rsquo;s back on.
          </span>
          <Link
            href="/super-admin/live-chat-settings"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open settings
          </Link>
        </div>
      ) : null}

      {/* Status tiles. Clicking one filters by it; clicking the active one
          clears the filter, since doing nothing would be the surprising
          behaviour once the number is on screen. Same contract as the Issue
          Reports inbox. */}
      <div className="grid grid-cols-2 gap-3">
        {(['open', 'closed'] as const).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(active ? 'all' : s)}
              className={cn(
                'rounded-xl border bg-white p-4 text-left shadow-sm transition-colors',
                active
                  ? 'border-[#25D366] ring-1 ring-[#25D366]/30'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase">
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </p>
              <p className={cn('mt-1 text-2xl font-bold', meta.text)}>
                {counts[s]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <MessagesSquare className="h-4 w-4" />
          {conversations.length} conversation
          {conversations.length === 1 ? '' : 's'}
          {totalUnread > 0 ? (
            <span className="bg-primary rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
              {totalUnread} unread
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setNewMessageOpen(true)}>
            <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
            New message
          </Button>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread only
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspace or message"
                className="pl-8"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : error ? (
              <p className="p-4 text-sm text-red-600">{error}</p>
            ) : visible.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                {conversations.length === 0
                  ? 'No workspace has started a support chat yet.'
                  : 'No conversation matches that filter.'}
              </p>
            ) : (
              visible.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.account_id === selectedAccountId}
                  onSelect={() => setSelectedAccountId(c.account_id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          {selected ? (
            <SupportThread
              // Keyed by account so switching threads remounts rather
              // than carrying the previous conversation's messages,
              // scroll position and reply draft across.
              key={selected.account_id}
              viewerKind="admin"
              accountId={selected.account_id}
              currentUserId={user?.id}
              // Operators are peers: any of them can withdraw any reply the
              // support side sent. The retract route agrees — it treats
              // every operator as owning their side of the thread.
              canManageAll
              header={
                <ThreadHeader
                  conversation={selected}
                  chatEnabled={chatEnabled}
                  onSetStatus={
                    selected.id
                      ? (status) => void setStatus(selected.id, status)
                      : undefined
                  }
                />
              }
              emptyHint="No messages yet. Say hello — they'll see it in their CRM."
              onConversationChange={handleConversationChange}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
              <MessagesSquare className="h-8 w-8 opacity-50" />
              <p className="text-sm">Pick a conversation to start replying.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => setNewMessageOpen(true)}
              >
                <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
                Message a workspace
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: SupportConversationWithAccount;
  active: boolean;
  onSelect: () => void;
}) {
  // One subscription per visible row. The hook is per-account by design
  // and the list is one row per paying workspace, so this stays bounded —
  // and a row that shows a stale dot is worse than a few channels.
  const { getPresence, getRow, now } = usePresenceForAccount(
    conversation.account_id
  );
  const { status, lastSeenAt } = rollUpPresence(
    conversation.members,
    getPresence,
    getRow
  );

  const unread = conversation.unread_for_admin || 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 border-b border-slate-50 px-3 py-3 text-left transition-colors last:border-0',
        active ? 'bg-[#25D366]/10' : 'hover:bg-slate-50'
      )}
    >
      <WorkspaceAvatar
        conversation={conversation}
        status={status}
        presence={presenceLabel(status, lastSeenAt, now)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              unread > 0 ? 'font-semibold text-slate-900' : 'text-slate-700'
            )}
          >
            {conversation.account_name ?? 'Unnamed workspace'}
          </span>
          {/* Only closed is marked. Open is the default state of every
              thread, so a chip on it would be noise on every row. */}
          {conversation.status === 'closed' ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold tracking-wide text-slate-500 uppercase">
              Closed
            </span>
          ) : null}
          <span className="shrink-0 text-[10px] text-slate-400">
            {relativeTime(conversation.last_message_at)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {conversation.last_message_preview || 'No messages yet'}
        </p>
      </div>
      {unread > 0 ? (
        <span className="bg-primary mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The workspace owner's picture, with a presence dot badged onto it.
 *
 * Falls back to their initial when no avatar has been uploaded — never to a
 * generic silhouette, because an initial still identifies the person and a
 * grey outline identifies nobody.
 */
function WorkspaceAvatar({
  conversation,
  status,
  presence,
  size = 'sm',
}: {
  conversation: SupportConversationWithAccount;
  status: PresenceStatus;
  presence: string;
  size?: 'sm' | 'md';
}) {
  const owner = conversation.owner;
  const name = owner?.full_name || conversation.account_name || owner?.email;
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="relative shrink-0">
      <Avatar
        className={cn(
          'overflow-hidden rounded-full ring-1 ring-slate-200',
          size === 'md' ? 'size-9' : 'size-8'
        )}
      >
        {owner?.avatar_url ? (
          <AvatarImage
            src={owner.avatar_url}
            alt={name ?? 'Workspace owner'}
            className="size-full object-cover object-center"
          />
        ) : null}
        <AvatarFallback className="bg-[#25D366]/15 text-xs font-semibold text-[#159947]">
          {initial}
        </AvatarFallback>
      </Avatar>
      {/* Badged onto the avatar rather than sitting beside the name: it is a
          property of the person, and it frees the row's text to be text. */}
      <PresenceDot
        status={status}
        label={presence}
        className="ring-background absolute -right-0.5 -bottom-0.5 size-2.5 ring-2"
      />
    </div>
  );
}

function ThreadHeader({
  conversation,
  chatEnabled,
  onSetStatus,
}: {
  conversation: SupportConversationWithAccount;
  chatEnabled: boolean;
  /** Absent for a stand-in with no conversation yet. */
  onSetStatus?: (status: 'open' | 'closed') => void;
}) {
  const { getPresence, getRow, now } = usePresenceForAccount(
    conversation.account_id
  );
  const { status, lastSeenAt } = rollUpPresence(
    conversation.members,
    getPresence,
    getRow
  );
  const counts = summarize(
    conversation.members.map((m) => getPresence(m.user_id))
  );
  const accountHref = `/super-admin/accounts/${conversation.account_id}`;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <WorkspaceAvatar
          conversation={conversation}
          status={status}
          presence={presenceLabel(status, lastSeenAt, now)}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {conversation.account_name ?? 'Unnamed workspace'}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {/* The EMAIL, not the name. A workspace is very often named after
              its owner — "Souaib Ansari" as both — so showing the name here
              repeated the heading and said nothing. The email is the one
              identifier that is always distinct and is what an operator
              actually needs to look someone up or write to them. */}
            {conversation.owner?.email ? (
              <>
                <span className="text-slate-600">
                  {conversation.owner.email}
                </span>
                {' · '}
              </>
            ) : null}
            {status === 'online'
              ? 'Online'
              : status === 'away'
                ? 'Away'
                : `Offline — last seen ${formatLastSeen(lastSeenAt, now)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p
            className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex"
            title="Members online / away / offline"
          >
            <Users className="h-3.5 w-3.5" />
            {counts.online} online · {counts.away} away · {counts.offline}{' '}
            offline
          </p>
          {/* Straight to the account deep dive. The question an operator has
            while reading a support thread is almost always about the
            workspace behind it — plan, usage, WABA state — and retyping the
            account id into the URL is the only route there today. */}
          {/* An anchor styled with `buttonVariants`, NOT `<Button render={<Link/>}>`.
            This Button is the Base UI ButtonPrimitive: it has no Radix-style
            slot, and it asserts a native <button> unless told otherwise, so
            rendering a Link through it warns that button semantics were
            dropped. Same approach as invite-member-dialog and api-keys. */}
          <Link
            href={accountHref}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Building2 className="h-3.5 w-3.5" />
            View account
          </Link>

          {/* Hidden for a workspace picked from "New message" that has no
            conversation yet: there is nothing to close. */}
          {onSetStatus ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onSetStatus(conversation.status === 'open' ? 'closed' : 'open')
              }
              title={
                conversation.status === 'open'
                  ? 'Mark handled. It reopens by itself if they write again.'
                  : 'Move back to Open.'
              }
            >
              {conversation.status === 'open' ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Close
                </>
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reopen
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Said BEFORE the operator types, not after they send: the reply is
          going somewhere the customer currently cannot open, and sending is
          what changes that. */}
      {chatEnabled && conversation.access && !conversation.access.available ? (
        <p className="flex items-center gap-2 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {conversation.access.reason === 'blocked'
            ? 'You blocked Live chat for this workspace. Sending a message will unblock it.'
            : "This workspace can't see Live chat yet. Your first message will give them access."}
        </p>
      ) : null}
    </div>
  );
}
