'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useBroadcastConversations } from '@/hooks/use-broadcast-conversations';
import {
  allChatsSortKey,
  isVisibleInAllChats,
  rowPreview,
} from '@/lib/inbox/broadcast-visibility';
import {
  filterOptionsByKind,
  resolveSelectedBroadcastIds,
  type CampaignKindFilter,
} from '@/lib/messages/broadcast-origin';
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from '@/lib/inbox/conversations';
import { cn } from '@/lib/utils';
import { avatarColor, avatarInitials } from '@/lib/avatar-color';
import { primaryContactName } from '@/lib/contacts/display-name';
import type { Conversation, ConversationStatus, Tag } from '@/types';
import {
  Search,
  ChevronDown,
  Megaphone,
  MessageSquare,
  X,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Level 1 of the campaign filter.
 *
 * "Broadcast" is one a person built and sent from the dashboard; "API" is one
 * that fires on its own, from the Google Sheets add-on or a direct call to the
 * public API. Wording matches the Type column on the Broadcasts page so the
 * two screens name the same thing the same way.
 */
const CAMPAIGN_KIND_OPTIONS: {
  /** Full wording, for the dropdown menu where there is room. */
  label: string;
  /**
   * One word, for the closed control. The trigger carries its own "Type"
   * label, so repeating "campaigns" inside the value made two chips read
   * "All campaigns" / "All campaigns" — identical, and neither explaining
   * what it filtered.
   */
  short: string;
  value: CampaignKindFilter;
}[] = [
  { label: 'All campaigns', short: 'All', value: 'all' },
  { label: 'Broadcast campaigns', short: 'Broadcast', value: 'broadcast' },
  { label: 'API campaigns', short: 'API', value: 'api' },
];

/**
 * Shared look for every filter control in the list header.
 *
 * One constant rather than four copies, because they had drifted: the two
 * campaign pickers were full-width bordered rows at h-8 while status and tags
 * were borderless h-7 chips, so a single filter bar read as two unrelated
 * pieces of UI stacked on top of each other.
 */
const FILTER_CHIP =
  'hover:bg-muted border-border flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors';

/**
 * The "no specific campaign" row in level 2, named after the chosen kind.
 *
 * A single shared "All campaigns" string here would contradict level 1 — with
 * kind = API it would read as though the filter had been widened back out to
 * everything, when it has not.
 */
const ALL_CAMPAIGNS_LABEL: Record<CampaignKindFilter, string> = {
  all: 'All campaigns',
  broadcast: 'All broadcast campaigns',
  api: 'All API campaigns',
};

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: 'bg-primary',
  pending: 'bg-amber-500',
  closed: 'bg-muted-foreground',
};

/**
 * `starred` is per-USER, unlike every other option here.
 *
 * The rest of these read a column on the conversation row, so they are
 * pure client-side predicates over `conversations`. Stars live in
 * `message_stars(message_id, user_id)` — a different table, scoped to
 * whoever is looking — so that one needs the set of conversation ids
 * fetched separately. Kept in the same control anyway: from the operator's
 * side "show me the ones I flagged" is the same kind of question as "show
 * me the unread ones", and a second, differently-shaped filter UI for one
 * option would be worse than one fetch.
 */
type InboxFilter = ConversationStatus | 'all' | 'unread' | 'starred';

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations('Inbox.conversationList');
  const { user } = useAuth();

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(
    () => [
      { label: t('filterAll'), value: 'all' },
      { label: t('filterUnread'), value: 'unread' },
      { label: t('filterStarred'), value: 'starred' },
      { label: t('filterOpen'), value: 'open' },
      { label: t('filterPending'), value: 'pending' },
      { label: t('filterClosed'), value: 'closed' },
    ],
    [t]
  );

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  /**
   * Which half of the Inbox is showing: every chat, or only the threads a
   * broadcast campaign reached.
   *
   * A separate axis from `filter` above rather than another entry in it,
   * because the two compose — "unread, from the Diwali campaign" is a
   * question worth asking, and folding broadcasts into the status filter
   * would make it unanswerable.
   */
  const [viewMode, setViewMode] = useState<'all' | 'broadcast'>('all');
  /**
   * Which filter entry is selected; null = every campaign.
   *
   * Keyed by the entry's `key` rather than by a `broadcasts.id`, because one
   * entry can cover many rows — every run of an API campaign is its own
   * broadcast row, and selecting a campaign has to mean "any of its runs".
   */
  const [selectedBroadcastKey, setSelectedBroadcastKey] = useState<
    string | null
  >(null);

  /**
   * First level of the campaign filter: which KIND. Narrowing by kind before
   * picking a campaign is what makes the second dropdown usable — a single
   * flat list mixed hand-built broadcasts with automated API runs, and an
   * account with a few dozen of each could find neither.
   */
  const [campaignKind, setCampaignKind] = useState<CampaignKindFilter>('all');

  /**
   * Pick a kind and drop any campaign selected under the previous one.
   *
   * Without the reset, switching from Broadcast to API would keep filtering
   * by a broadcast that is not in the new list — the dropdown would read
   * "All API campaigns" while showing the threads of one broadcast.
   */
  const selectCampaignKind = useCallback((kind: CampaignKindFilter) => {
    setCampaignKind(kind);
    setSelectedBroadcastKey(null);
  }, []);

  const {
    broadcasts,
    byConversation: broadcastsByConversation,
    allBroadcastConvIds,
    optionByKey: broadcastOptionByKey,
    loaded: broadcastsLoaded,
  } = useBroadcastConversations(viewMode === 'broadcast', resyncToken);

  /** Campaigns of the selected kind — the contents of the second dropdown. */
  const campaignOptions = useMemo(
    () => filterOptionsByKind(broadcasts, campaignKind),
    [broadcasts, campaignKind]
  );

  /** Broadcast rows the current two-level selection covers. */
  const selectedBroadcastIds = useMemo(
    () =>
      resolveSelectedBroadcastIds({
        options: broadcasts,
        kind: campaignKind,
        selectedKey: selectedBroadcastKey,
      }),
    [broadcasts, campaignKind, selectedBroadcastKey]
  );

  const selectedCampaign = selectedBroadcastKey
    ? (broadcastOptionByKey.get(selectedBroadcastKey) ?? null)
    : null;

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        // Imported-but-unreviewed chats are deliberately excluded.
        //
        // Connecting a coexistence number delivers up to six months of the
        // phone's chat history, and it used to land here directly — 69
        // conversations and 7,533 messages appearing unannounced, personal
        // chats included, with no way to choose. They are still stored
        // (Meta sends history once and cannot replay it) and are approved
        // from the review screen; they just do not appear in the inbox
        // until then.
        //
        // Pre-existing rows all default to 'live', so this changes nothing
        // for conversations that already exist.
        .eq('import_state', 'live')
        .order('last_message_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error('Failed to fetch conversations:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  /**
   * Conversations containing at least one message THIS user has starred.
   *
   * Fetched lazily — only once the operator actually picks the Starred
   * filter — because the overwhelming majority of inbox sessions never use
   * it, and an extra query on every mount to support a filter nobody
   * selected is a cost paid by everyone for the benefit of a few. Refetched
   * on `resyncToken` and whenever the filter is re-selected, so a message
   * starred in the thread shows up here without a reload.
   */
  /**
   * Result keyed by WHICH fetch produced it.
   *
   * The token (user + resync counter) is what makes "loading" a derived
   * value instead of a second piece of state: if the stored token is not
   * the current one, the answer we hold is stale and a fetch is in flight.
   * Storing an `isLoading` boolean instead would mean flipping it to true
   * synchronously inside the effect, which triggers the cascading-render
   * this codebase lints against (react-hooks/set-state-in-effect).
   *
   * `ids: null` is the FAILED case, kept distinct from an empty Set. An
   * empty Set means "you have starred nothing"; null means "we do not
   * know", and the two must not render the same way.
   */
  const [starred, setStarred] = useState<{
    token: string;
    ids: Set<string> | null;
  } | null>(null);

  const starredToken = `${user?.id ?? ''}:${resyncToken}`;
  const starredLoading =
    filter === 'starred' && starred?.token !== starredToken;
  const starredConvIds = starred?.token === starredToken ? starred.ids : null;

  useEffect(() => {
    if (filter !== 'starred' || !user?.id) return;
    // Already have the answer for this exact token — nothing to refetch.
    if (starred?.token === starredToken) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // One round trip via the message_stars → messages FK. RLS already
      // limits stars to this user and messages to this account, so no
      // account filter is needed (or trustworthy) here.
      const { data, error } = await supabase
        .from('message_stars')
        .select('messages(conversation_id)')
        .eq('user_id', user.id);

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch starred messages:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        // An empty set would silently read as "you have starred nothing",
        // which is a different and wrong answer. Null keeps the list
        // unfiltered rather than showing a confidently empty inbox.
        setStarred({ token: starredToken, ids: null });
        return;
      }

      const rows = (data ?? []) as unknown as Array<{
        messages: { conversation_id: string } | null;
      }>;
      setStarred({
        token: starredToken,
        ids: new Set(
          rows
            .map((r) => r.messages?.conversation_id)
            .filter((id): id is string => Boolean(id))
        ),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [filter, user?.id, starredToken, starred?.token]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('tags').select('*').order('name');
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    // Keep campaign-only threads out of All chats, and order this view by
    // real activity rather than by "any message".
    //
    // Both halves matter and they fix different symptoms. Without the
    // filter, a campaign creates inbox rows for people nobody has spoken
    // to. Without the re-sort, existing threads still jump to the top the
    // moment a campaign touches them, showing campaign copy as the preview.
    //
    // A reply undoes both automatically: it is a direct message, so the
    // trigger populates `last_direct_message_at` and the thread appears in
    // its natural position. Nothing is hidden inside the thread itself —
    // the campaign bubbles stay visible so an agent has the context for
    // whatever the customer is replying to.
    if (viewMode === 'all') {
      result = result
        .filter(isVisibleInAllChats)
        .sort((a, b) => allChatsSortKey(b) - allChatsSortKey(a));
    }

    if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === 'starred') {
      // While the ids are still loading (or the fetch failed) leave the
      // list alone rather than rendering an empty inbox — a momentary
      // "no starred messages" is indistinguishable from the real answer.
      if (starredConvIds) {
        result = result.filter((c) => starredConvIds.has(c.id));
      }
    } else if (filter !== 'all') {
      result = result.filter((c) => c.status === filter);
    }

    // Broadcast view: narrow to threads a campaign actually reached.
    //
    // Held back until the mapping has loaded, for the same reason the
    // starred filter waits: a momentary empty list is indistinguishable
    // from "this campaign reached nobody", and the second reading is
    // alarming when it is not true.
    if (viewMode === 'broadcast' && broadcastsLoaded) {
      // null = no id constraint, i.e. every campaign. Otherwise an
      // intersection test, because one entry can cover many broadcast rows
      // (a kind covers many campaigns; a campaign covers many runs).
      // Matching a single id would show only the threads one run reached.
      result =
        selectedBroadcastIds === null
          ? result.filter((c) => allBroadcastConvIds.has(c.id))
          : result.filter((c) => {
              const reached = broadcastsByConversation.get(c.id);
              return reached
                ? selectedBroadcastIds.some((id) => reached.has(id))
                : false;
            });
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? '';
        const phone = c.contact?.phone?.toLowerCase() ?? '';
        const lastMsg = c.last_message_text?.toLowerCase() ?? '';
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [
    conversations,
    filter,
    search,
    selectedTagIds,
    selectedCompany,
    starredConvIds,
    viewMode,
    selectedBroadcastIds,
    broadcastsLoaded,
    allBroadcastConvIds,
    broadcastsByConversation,
  ]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters =
    selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="border-border bg-card flex h-full w-full flex-col border-r lg:w-80">
      {/* Search + Filter.
          Tighter than the default rhythm on purpose: this header competes for
          vertical space with the conversation list itself, and the Broadcasts
          view stacks two filter rows under the tabs. */}
      <div className="border-border space-y-1.5 border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t('searchPlaceholder')}
            className="border-border bg-muted text-foreground placeholder-muted-foreground focus:border-primary/50 pl-9 text-sm"
          />
        </div>

        {/*
          All chats / Broadcasts.

          Broadcast sends were invisible here until they began being stored
          as real messages, so there was nothing to switch to. Now that a
          campaign send lands in the customer's thread like any other
          message, this is the way to look at only those threads —
          "who did that campaign actually reach, and did anyone answer".
        */}
        <div className="bg-muted/60 flex items-center gap-1 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors',
              viewMode === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            All chats
          </button>
          <button
            type="button"
            onClick={() => setViewMode('broadcast')}
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors',
              viewMode === 'broadcast'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Megaphone className="h-3.5 w-3.5" />
            Broadcasts
          </button>
        </div>

        {/*
          Campaign filter — only meaningful in the broadcast view.

          TWO levels, on purpose. A single flat list mixed hand-built
          broadcasts with automated API runs and grew without bound, so
          neither kind could be found in it. Kind narrows first ("show me
          only the automated ones"), then a specific campaign within that
          kind ("...and only Wellcome Schedule test").

          The second dropdown is hidden when the chosen kind has nothing in
          it, rather than rendered empty — an enabled control that can only
          say "none" invites the reader to think the filter is broken.
        */}
        {viewMode === 'broadcast' && (
          <div className="flex items-center gap-1">
            {/*
              Level 1 — kind.

              Side by side rather than stacked, and each with its own "Type" /
              "Campaign" label. Two full-width rows both reading
              "All campaigns" cost three lines of a narrow sidebar and told the
              reader nothing about which one did what; left-to-right also reads
              as the narrowing order it actually is.
            */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(FILTER_CHIP, 'flex-1')}
                title="Filter by campaign type"
              >
                <span className="text-muted-foreground shrink-0">Type</span>
                {campaignKind === 'api' ? (
                  <Zap className="text-primary h-3 w-3 shrink-0" />
                ) : campaignKind === 'broadcast' ? (
                  <Megaphone className="text-primary h-3 w-3 shrink-0" />
                ) : null}
                <span
                  className={cn(
                    'truncate font-medium',
                    campaignKind === 'all' ? 'text-foreground' : 'text-primary'
                  )}
                >
                  {CAMPAIGN_KIND_OPTIONS.find((o) => o.value === campaignKind)
                    ?.short ?? 'All'}
                </span>
                <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover w-64"
              >
                {CAMPAIGN_KIND_OPTIONS.map((opt) => {
                  const count = filterOptionsByKind(
                    broadcasts,
                    opt.value
                  ).length;
                  return (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => selectCampaignKind(opt.value)}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        campaignKind === opt.value
                          ? 'text-primary'
                          : 'text-popover-foreground'
                      )}
                    >
                      {opt.value === 'api' ? (
                        <Zap className="h-3 w-3 shrink-0 opacity-70" />
                      ) : opt.value === 'broadcast' ? (
                        <Megaphone className="h-3 w-3 shrink-0 opacity-70" />
                      ) : null}
                      <span className="truncate">{opt.label}</span>
                      <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                        {count}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Level 2 — a specific campaign within the chosen kind */}
            {campaignOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(FILTER_CHIP, 'flex-1')}
                  title={
                    selectedCampaign
                      ? `Showing chats reached by ${selectedCampaign.label}`
                      : 'Filter by a specific campaign'
                  }
                >
                  <span className="text-muted-foreground shrink-0">
                    Campaign
                  </span>
                  <span
                    className={cn(
                      'truncate font-medium',
                      selectedCampaign ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {/*
                      Count shown only on "All", where it answers "how many
                      campaigns are there". It counts CAMPAIGNS, not runs — it
                      used to count runs, so one Sheets campaign fired thirteen
                      times reported "(13)" as though thirteen different things
                      had been sent.
                    */}
                    {selectedCampaign
                      ? selectedCampaign.label
                      : `All (${campaignOptions.length})`}
                  </span>
                  <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="border-border bg-popover max-h-72 w-64 overflow-y-auto"
                >
                  <DropdownMenuItem
                    onClick={() => setSelectedBroadcastKey(null)}
                    className={cn(
                      'text-sm',
                      selectedBroadcastKey === null
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    )}
                  >
                    {ALL_CAMPAIGNS_LABEL[campaignKind]}
                  </DropdownMenuItem>
                  {campaignOptions.map((b) => (
                    <DropdownMenuItem
                      key={b.key}
                      onClick={() => setSelectedBroadcastKey(b.key)}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        selectedBroadcastKey === b.key
                          ? 'text-primary'
                          : 'text-popover-foreground'
                      )}
                    >
                      {/* Kept even inside a kind-filtered list, because the
                          'All campaigns' kind mixes both. */}
                      {b.kind === 'api_campaign' ? (
                        <Zap className="h-3 w-3 shrink-0 opacity-70" />
                      ) : (
                        <Megaphone className="h-3 w-3 shrink-0 opacity-70" />
                      )}
                      <span className="truncate">{b.label}</span>
                      {b.runCount > 1 && (
                        <span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                          {b.runCount} runs
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Sits outside the chip row so it can use the full width instead of
            being squeezed into a third column. */}
        {viewMode === 'broadcast' &&
          broadcasts.length === 0 &&
          broadcastsLoaded && (
            <p className="text-muted-foreground px-0.5 text-[11px]">
              No campaigns have reached a chat yet.
            </p>
          )}

        <div className="flex flex-wrap items-center gap-1">
          {/* Status. Labelled, because a lone "All" next to a lone "Tags" gave
              no clue that the first one was about read/unread state. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={FILTER_CHIP}
              title="Filter by conversation status"
            >
              <span className="text-muted-foreground shrink-0">Status</span>
              <span
                className={cn(
                  'truncate font-medium',
                  filter === 'all' ? 'text-foreground' : 'text-primary'
                )}
              >
                {activeFilter?.label ?? t('filterAll')}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'text-sm',
                    filter === opt.value
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={FILTER_CHIP}
                title="Filter by contact tag"
              >
                <span className="text-muted-foreground shrink-0">
                  {t('tags')}
                </span>
                <span
                  className={cn(
                    'truncate font-medium',
                    selectedTagIds.length > 0
                      ? 'text-primary'
                      : 'text-foreground'
                  )}
                >
                  {selectedTagIds.length > 0 ? selectedTagIds.length : 'All'}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-popover-foreground text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(FILTER_CHIP, 'max-w-40')}
                title="Filter by company"
              >
                <span className="text-muted-foreground shrink-0">
                  {t('company')}
                </span>
                <span
                  className={cn(
                    'truncate font-medium',
                    selectedCompany ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {selectedCompany ?? 'All'}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    'text-sm',
                    selectedCompany === null
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {t('allCompanies')}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      'text-sm',
                      selectedCompany === co
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: tag?.color ?? 'var(--muted-foreground)',
                    }}
                  />
                  <span className="max-w-24 truncate">
                    {tag?.name ?? t('tags')}
                  </span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-[11px]"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : starredLoading && filter === 'starred' ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            {/* Naming the reason matters here: "No conversations found"
                under the Starred filter reads as "your inbox is empty",
                which is alarming and wrong. The broadcast view has the
                same trap, plus one of its own — a campaign sent before
                sends were recorded in the Inbox has no threads to show,
                and that is worth distinguishing from "nobody replied". */}
            {viewMode === 'broadcast' ? (
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-sm">
                  {selectedBroadcastKey
                    ? 'No chats from this campaign.'
                    : 'No chats from any campaign yet.'}
                </p>
                <p className="text-muted-foreground/80 text-xs">
                  Campaigns appear here once they send. Broadcasts sent before
                  this view existed were not recorded as chats, so they will not
                  be listed.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {filter === 'starred'
                  ? t('noStarredConversations')
                  : t('noConversations')}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                viewMode={viewMode}
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  /**
   * Which tab is showing. Decides whether the row previews the last real
   * exchange or the last campaign send — see `rowPreview`.
   */
  viewMode: 'all' | 'broadcast';
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  viewMode,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  // Saved name ONLY here, with no "~profile" suffix. A list is for scanning,
  // and two names per row halves how many fit on screen. The thread header and
  // contact sidebar are where both are shown.
  const displayName = contact
    ? primaryContactName(contact, t('unknown'))
    : t('unknown');
  // Two initials where a full name exists, so "Kavi Sharma" reads as KS
  // rather than a lone K shared with every other K in the list. Falls back
  // to '#' for a contact known only by number, since charAt(0) of a phone
  // string produced a meaningless '9'.
  const initials = avatarInitials(contact?.name, '#');

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  // In All chats these come from the last NON-broadcast message, so a
  // campaign send neither rewrites the preview nor resets the timestamp.
  const preview = rowPreview(conversation, viewMode);

  const timeAgo = preview.at
    ? formatDistanceToNow(new Date(preview.at), {
        addSuffix: false,
      })
    : '';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'hover:bg-muted/50 flex w-full items-start gap-3 px-3 py-3 text-left transition-colors',
        isActive && 'border-primary bg-muted/70 border-l-2'
      )}
    >
      {/* Avatar.
          WhatsApp gives us no customer profile picture (see
          src/lib/avatar-color.ts), so initials are the finished design
          rather than a placeholder. Coloured from the contact id so the
          same person is always the same colour — a uniform grey circle on
          every row was what made this look unfinished.

          `avatar_url` is still honoured: it is populated for contacts
          created through the API or edited by hand. */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          avatarColor(contact?.id ?? contact?.phone ?? displayName)
        )}
      >
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {displayName}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px]">
            {timeAgo}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs">
            {preview.text || t('noMessagesYet')}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
