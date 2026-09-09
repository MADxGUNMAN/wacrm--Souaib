'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { avatarColor, avatarInitials } from '@/lib/avatar-color';
import type { Contact, Deal, ContactNote, Tag } from '@/types';
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  X,
  Search,
  Loader2,
  Calendar,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ContactNotesSection } from '@/components/contacts/contact-notes-section';
import { DealForm } from '@/components/pipelines/deal-form';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { formatCurrency } from '@/lib/currency';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
// Status is read and written through the API route, NOT by importing
// `marketing-opt-out.ts` — that module pulls the Meta API layer into the
// client bundle. The route also stamps `actor_user_id` on the audit row,
// which the browser has no trustworthy way to do.
import {
  SubscriptionStatusRow,
  type SubscriptionInfo,
} from '@/components/inbox/subscription-status';

const PRESET_COLORS = [
  { name: 'emerald', value: '#10b981' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'violet', value: '#8b5cf6' },
  { name: 'pink', value: '#ec4899' },
  { name: 'amber', value: '#f59e0b' },
  { name: 'red', value: '#ef4444' },
  { name: 'cyan', value: '#06b6d4' },
  { name: 'orange', value: '#f97316' },
];

type InspectorSection = 'tags' | 'deals' | 'notes';

interface ContactSidebarProps {
  contact: Contact | null;
}

interface SectionHeaderProps {
  id: InspectorSection;
  icon: ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
}

function SectionHeader({
  id,
  icon,
  label,
  count,
  expanded,
  onToggle,
  action,
}: SectionHeaderProps) {
  return (
    <div className="border-border/70 bg-card flex h-11 shrink-0 items-center gap-1 border-t px-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-section-content`}
        onClick={onToggle}
        className="hover:text-foreground flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
        <span className="bg-muted border-border text-muted-foreground rounded-full border px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums">
          {count}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground ml-auto size-3.5 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {action}
    </div>
  );
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tSidebar = useTranslations('Inbox.sidebar');
  const tThread = useTranslations('Inbox.messageThread');
  const { user, accountId } = useAuth();

  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [allAccountTags, setAllAccountTags] = useState<Tag[]>([]);
  const [expandedSection, setExpandedSection] =
    useState<InspectorSection | null>('deals');
  const [allDealsOpen, setAllDealsOpen] = useState(false);
  const [allNotesOpen, setAllNotesOpen] = useState(false);
  const activeContactIdRef = useRef<string | null>(contact?.id ?? null);

  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [updatingTagId, setUpdatingTagId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [selectedTagColor, setSelectedTagColor] = useState(
    PRESET_COLORS[0].value
  );
  const [creatingTag, setCreatingTag] = useState(false);

  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  // Marketing subscription state for this number. Keyed on the phone, not
  // the contact id — see marketing_opt_outs in migration 20260831000000.
  //
  // `null` means "not read yet" and renders as loading. A boolean default
  // would have to pick a side, and defaulting to "Subscribed" would show a
  // reassuring badge for a contact who is in fact suppressed.
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [updatingOptOut, setUpdatingOptOut] = useState(false);

  /**
   * Read this contact's subscription status.
   *
   * Extracted from `fetchContactData` because the realtime subscription
   * below needs to call it on its own. It deliberately re-reads the route
   * rather than deriving the new status from the realtime payload: the route
   * combines the suppression row (which the send paths obey) with the newest
   * audit event (which supplies the date and reason) and knows what to do
   * when those two disagree. Reconstructing that here would be a second
   * implementation of the same rule, free to drift from the first.
   */
  const refreshSubscription = useCallback(async () => {
    const requestedContactId = contact?.id;
    const phoneKey = normalizePhone(contact?.phone ?? '');
    if (!requestedContactId || !phoneKey) return;

    try {
      const res = await fetch(
        `/api/whatsapp/opt-in-out/status?phone=${encodeURIComponent(phoneKey)}`
      );
      if (!res.ok) return;
      const payload = await res.json();
      // The agent may have switched conversations while this was in flight.
      if (activeContactIdRef.current !== requestedContactId) return;
      setSubscription({
        status:
          payload?.status === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
        since: payload?.since ?? null,
        source: payload?.source ?? null,
      });
    } catch {
      // Leave the previous value alone. Blanking the badge on a transient
      // network error would replace real information with a spinner.
    }
  }, [contact?.id, contact?.phone]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;
    const requestedContactId = contact.id;
    const supabase = createClient();
    const [dealsRes, notesRes, tagsRes, allTagsRes] = await Promise.all([
      supabase
        .from('deals')
        .select('*, stage:pipeline_stages(*)')
        .eq('contact_id', requestedContactId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', requestedContactId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_tags')
        .select('id, tag_id, tags(*)')
        .eq('contact_id', requestedContactId),
      supabase.from('tags').select('*').order('name'),
    ]);

    if (activeContactIdRef.current !== requestedContactId) return;
    setDeals((dealsRes.data ?? []) as Deal[]);
    setNotes((notesRes.data ?? []) as ContactNote[]);
    setAllAccountTags((allTagsRes.data ?? []) as Tag[]);
    const mapped = (tagsRes.data ?? [])
      .filter((ct: Record<string, unknown>) => ct.tags)
      .map((ct: Record<string, unknown>) => ({
        ...(ct.tags as Tag),
        contact_tag_id: ct.id as string,
      }));
    setTags(mapped);
    // `accountId` is no longer read in here — the status route resolves the
    // account from the session — so it is deliberately not a dependency.
  }, [contact]);

  useEffect(() => {
    activeContactIdRef.current = contact?.id ?? null;
    setDeals([]);
    setNotes([]);
    setTags([]);
    setAllAccountTags([]);
    setExpandedSection('deals');
    setAllDealsOpen(false);
    setAllNotesOpen(false);
    setTagPopoverOpen(false);
    // Back to "not read yet" rather than to a guessed state, so switching
    // contacts cannot briefly show the previous contact's consent.
    setSubscription(null);
    void fetchContactData();
    void refreshSubscription();
  }, [contact?.id, fetchContactData, refreshSubscription]);

  /**
   * Live subscription status.
   *
   * The interesting case is a customer replying STOP while an agent has the
   * thread open. Reading the status only on mount meant the badge kept
   * saying "Subscribed" until the agent clicked away and back — exactly the
   * window in which they might send a marketing template to somebody who had
   * just asked them to stop.
   *
   * Watches BOTH tables, because they fail in different directions:
   *
   *   * `marketing_subscription_events` is append-only, so one INSERT covers
   *     both directions and carries the reason.
   *   * `marketing_opt_outs` is the index the send paths actually obey, and
   *     the event write is best-effort — a failed audit write would
   *     otherwise leave the badge stale. A re-subscribe is a DELETE here,
   *     which is why the migration sets REPLICA IDENTITY FULL: without it
   *     the payload carries no phone and this filter could never match.
   *
   * Scoped to the visible contact's phone rather than the whole account, so
   * a busy inbox does not wake every open sidebar on every opt-out.
   */
  useEffect(() => {
    const phoneKey = normalizePhone(contact?.phone ?? '');
    if (!phoneKey) return;

    const supabase = createClient();
    const filter = `phone_normalized=eq.${phoneKey}`;
    const channel = supabase
      .channel(`subscription:${phoneKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marketing_subscription_events',
          filter,
        },
        () => void refreshSubscription()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marketing_opt_outs',
          filter,
        },
        () => void refreshSubscription()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contact?.phone, refreshSubscription]);

  /**
   * Record or clear a marketing opt-out by hand.
   *
   * Agents need both directions: a customer says "stop sending me offers"
   * mid-conversation, or asks to be put back on. Source is 'agent' so the
   * audit trail distinguishes it from a customer's own STOP.
   */
  const handleToggleOptOut = async () => {
    if (!contact?.phone || !subscription) return;
    const contactId = contact.id;
    const action =
      subscription.status === 'unsubscribed' ? 'resubscribe' : 'unsubscribe';

    setUpdatingOptOut(true);
    try {
      const res = await fetch('/api/whatsapp/opt-in-out/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.phone,
          contact_id: contactId,
          action,
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          payload?.error ||
            (action === 'resubscribe'
              ? 'Could not re-subscribe this contact.'
              : 'Could not unsubscribe this contact.')
        );
        return;
      }

      if (activeContactIdRef.current !== contactId) return;
      // Render what the server actually stored, including the new date,
      // rather than an optimistic guess that carries no timestamp.
      setSubscription({
        status:
          payload?.status === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
        since: payload?.since ?? null,
        source: payload?.source ?? null,
      });
      toast.success(
        action === 'resubscribe'
          ? 'Contact re-subscribed to marketing messages.'
          : 'Contact unsubscribed from marketing messages.'
      );
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setUpdatingOptOut(false);
    }
  };

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleToggleTag = async (tagId: string) => {
    if (!contact) return;
    const contactId = contact.id;
    const isAssigned = tags.some((tag) => tag.id === tagId);
    setUpdatingTagId(tagId);
    try {
      if (isAssigned) {
        await deleteContactTag(contactId, tagId);
        if (activeContactIdRef.current !== contactId) return;
        setTags((current) => current.filter((tag) => tag.id !== tagId));
        toast.success('Tag removed from contact');
      } else {
        await addContactTag(contactId, tagId);
        if (activeContactIdRef.current !== contactId) return;
        const tag = allAccountTags.find((candidate) => candidate.id === tagId);
        if (tag) {
          setTags((current) => [
            ...current,
            { ...tag, contact_tag_id: `temp-${Date.now()}` },
          ]);
        }
        toast.success('Tag added to contact');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update tag'
      );
      void fetchContactData();
    } finally {
      setUpdatingTagId(null);
    }
  };

  const handleCreateTag = async () => {
    const name = (newTagName || tagSearchQuery).trim();
    if (!contact || !name || !user || !accountId) return;
    const contactId = contact.id;
    setCreatingTag(true);
    try {
      const supabase = createClient();
      const { data: created, error } = await supabase
        .from('tags')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name,
          color: selectedTagColor,
        })
        .select('*')
        .single();
      if (error) throw error;
      if (created) {
        await addContactTag(contactId, created.id);
        if (activeContactIdRef.current !== contactId) return;
        setAllAccountTags((current) =>
          current.some((tag) => tag.id === created.id)
            ? current
            : [...current, created]
        );
        setTags((current) => [
          ...current,
          { ...created, contact_tag_id: `temp-${Date.now()}` },
        ]);
        toast.success(`Tag "${name}" created and added`);
        setNewTagName('');
        setTagSearchQuery('');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create tag'
      );
    } finally {
      setCreatingTag(false);
    }
  };

  const filteredTags = useMemo(() => {
    const query = tagSearchQuery.trim().toLowerCase();
    return query
      ? allAccountTags.filter((tag) => tag.name.toLowerCase().includes(query))
      : allAccountTags;
  }, [allAccountTags, tagSearchQuery]);

  const exactMatchExists = useMemo(() => {
    const query = tagSearchQuery.trim().toLowerCase();
    return (
      !query || allAccountTags.some((tag) => tag.name.toLowerCase() === query)
    );
  }, [allAccountTags, tagSearchQuery]);

  const handleOpenCreateDeal = () => {
    setSelectedDeal(null);
    setDealFormOpen(true);
  };

  const handleOpenEditDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setAllDealsOpen(false);
    setDealFormOpen(true);
  };

  const toggleSection = (section: InspectorSection) => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  if (!contact) {
    return (
      <div className="border-border bg-card flex h-full min-h-0 w-full items-center justify-center overflow-hidden border-l">
        <p className="text-muted-foreground text-sm">
          {tThread('selectConversation')}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = avatarInitials(contact.name, '#');

  const renderDealCard = (deal: Deal) => (
    <button
      key={deal.id}
      type="button"
      onClick={() => handleOpenEditDeal(deal)}
      className="group border-border bg-background hover:border-primary/50 w-full cursor-pointer rounded-lg border p-2.5 text-left text-xs shadow-2xs transition-all hover:shadow-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground group-hover:text-primary truncate font-semibold transition-colors">
          {deal.title}
        </p>
        <ChevronRight className="text-muted-foreground group-hover:text-primary size-3.5 shrink-0 transition-colors" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-foreground font-mono text-xs font-bold">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.stage && (
          <span
            className="max-w-[55%] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `${deal.stage.color}20`,
              color: deal.stage.color,
              border: `1px solid ${deal.stage.color}35`,
            }}
          >
            {deal.stage.name}
          </span>
        )}
      </div>
      {deal.expected_close_date && (
        <div className="text-muted-foreground border-border/40 mt-2 flex items-center gap-1 border-t pt-1.5 text-[10px]">
          <Calendar className="size-3" />
          <span>Close: {deal.expected_close_date}</span>
        </div>
      )}
    </button>
  );

  const tagManager = (
    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-primary h-7 cursor-pointer px-2 text-[11px]"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        Manage
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="bg-popover border-border text-popover-foreground w-72 rounded-xl p-2.5 shadow-lg"
      >
        <div className="relative mb-2">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search or add tag..."
            value={tagSearchQuery}
            onChange={(event) => setTagSearchQuery(event.target.value)}
            className="bg-muted/50 border-border h-8 pl-8 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {filteredTags.length === 0 && tagSearchQuery.trim() ? (
            <p className="text-muted-foreground py-2 text-center text-xs">
              No tag named &quot;{tagSearchQuery}&quot;
            </p>
          ) : (
            filteredTags.map((tag) => {
              const assigned = tags.some((item) => item.id === tag.id);
              const updating = updatingTagId === tag.id;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => void handleToggleTag(tag.id)}
                  disabled={updating}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                    assigned
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color || '#3b82f6' }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </span>
                  {updating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : assigned ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        {!exactMatchExists && tagSearchQuery.trim() && (
          <div className="border-border mt-2 border-t pt-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-[11px] font-medium">
                Pick color
              </span>
              <div className="flex gap-1">
                {PRESET_COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    aria-label={`Use ${color.name}`}
                    onClick={() => setSelectedTagColor(color.value)}
                    className={cn(
                      'size-4 cursor-pointer rounded-full',
                      selectedTagColor === color.value &&
                        'ring-primary ring-2 ring-offset-1'
                    )}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void handleCreateTag()}
              disabled={creatingTag}
              className="h-7 w-full gap-1.5 text-xs"
            >
              {creatingTag ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              Create &quot;{tagSearchQuery.trim()}&quot;
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      <aside className="border-border bg-card flex h-full min-h-0 w-full flex-col overflow-hidden border-l">
        <div className="border-border/70 bg-muted/10 shrink-0 border-b px-3 py-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold shadow-xs',
                avatarColor(contact.id ?? contact.phone ?? displayName)
              )}
            >
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="size-11 object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground truncate text-sm font-semibold">
                {displayName}
              </h3>
              {contact.company && (
                <p className="text-muted-foreground truncate text-xs">
                  {contact.company}
                </p>
              )}
              <button
                type="button"
                onClick={handleCopyPhone}
                className="text-muted-foreground hover:text-foreground mt-1 flex max-w-full cursor-pointer items-center gap-1.5 text-xs"
              >
                <Phone className="size-3 shrink-0" />
                <span className="truncate">{contact.phone}</span>
                {copied ? (
                  <Check className="text-primary size-3 shrink-0" />
                ) : (
                  <Copy className="size-3 shrink-0" />
                )}
              </button>
              {contact.email && (
                <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                  <Mail className="size-3 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Marketing consent. Shown in the header rather than inside a
              collapsible section because an agent about to send a campaign
              template needs to see it without hunting for it. */}
          <SubscriptionStatusRow
            info={subscription}
            // Honest fallback for somebody who never unsubscribed: there is
            // no opt-in event to date, but this IS when the number entered
            // the CRM, and the label says exactly that.
            fallbackSince={contact.created_at ?? null}
            busy={updatingOptOut}
            disabled={!contact.phone}
            onToggle={() => void handleToggleOptOut()}
          />
        </div>

        <div className="min-h-0 shrink-0 overflow-hidden">
          <section className="flex min-h-0 shrink-0 flex-col overflow-hidden">
            <SectionHeader
              id="tags"
              icon={<TagIcon className="size-3.5" />}
              label={tSidebar('tags')}
              count={tags.length}
              expanded={expandedSection === 'tags'}
              onToggle={() => toggleSection('tags')}
              action={tagManager}
            />
            {expandedSection === 'tags' && (
              <div
                id="tags-section-content"
                className="max-h-48 min-h-0 shrink overflow-y-auto"
              >
                <div className="p-3">
                  {tags.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setTagPopoverOpen(true)}
                      className="border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-xs transition-colors"
                    >
                      <Plus className="size-3" />
                      {tSidebar('noTags')}
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag.contact_tag_id || tag.id}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${tag.color || '#3b82f6'}18`,
                            color: tag.color || '#3b82f6',
                            border: `1px solid ${tag.color || '#3b82f6'}30`,
                          }}
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color || '#3b82f6' }}
                          />
                          <span className="truncate">{tag.name}</span>
                          <button
                            type="button"
                            onClick={() => void handleToggleTag(tag.id)}
                            className="cursor-pointer rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                            title="Remove tag"
                          >
                            <X className="size-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="flex min-h-0 shrink-0 flex-col overflow-hidden">
            <SectionHeader
              id="deals"
              icon={<DollarSign className="size-3.5" />}
              label={tSidebar('deals')}
              count={deals.length}
              expanded={expandedSection === 'deals'}
              onToggle={() => toggleSection('deals')}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenCreateDeal}
                  className="text-primary h-7 cursor-pointer gap-1 px-2 text-[11px]"
                >
                  <Plus className="size-3" />
                  Add
                </Button>
              }
            />
            {expandedSection === 'deals' && (
              <div
                id="deals-section-content"
                className={cn(
                  'min-h-0 shrink overflow-y-auto',
                  deals.length === 0
                    ? 'max-h-28'
                    : deals.length === 1
                      ? 'max-h-36'
                      : 'max-h-56'
                )}
              >
                <div className="space-y-2 p-3">
                  {deals.length === 0 ? (
                    <div className="border-border/80 rounded-lg border border-dashed p-3 text-center">
                      <p className="text-muted-foreground text-xs">
                        {tSidebar('noDeals')}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenCreateDeal}
                        className="mt-2 h-7 cursor-pointer gap-1.5 text-xs"
                      >
                        <Plus className="text-primary size-3" />
                        Create deal
                      </Button>
                    </div>
                  ) : (
                    <>
                      {deals.slice(0, 2).map(renderDealCard)}
                      {deals.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAllDealsOpen(true)}
                          className="border-border/80 text-muted-foreground hover:text-foreground h-8 w-full cursor-pointer border-dashed text-xs"
                        >
                          View all {deals.length} deals
                          <ChevronRight className="size-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="flex min-h-0 shrink-0 flex-col overflow-hidden">
            <SectionHeader
              id="notes"
              icon={<StickyNote className="size-3.5" />}
              label={tSidebar('notes')}
              count={notes.length}
              expanded={expandedSection === 'notes'}
              onToggle={() => toggleSection('notes')}
              action={
                notes.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAllNotesOpen(true)}
                    className="text-primary h-7 cursor-pointer px-2 text-[11px]"
                  >
                    View all
                  </Button>
                ) : undefined
              }
            />
            {expandedSection === 'notes' && (
              <div
                id="notes-section-content"
                className="max-h-56 min-h-0 shrink overflow-y-auto"
              >
                <div className="p-3 pb-5">
                  <ContactNotesSection
                    contactId={contact.id}
                    notes={notes}
                    onNotesChange={setNotes}
                    compact
                    maxDisplayCount={1}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>

      <Dialog open={allDealsOpen} onOpenChange={setAllDealsOpen}>
        <DialogContent className="bg-card border-border flex max-h-[80vh] max-w-xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-border border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <DollarSign className="text-primary size-4" />
              All deals
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-xs">
                {deals.length}
              </span>
            </DialogTitle>
            <DialogDescription>
              Deals linked to {displayName}. Select one to view or edit it.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-5">{deals.map(renderDealCard)}</div>
          </ScrollArea>
          <div className="border-border border-t p-4">
            <Button
              onClick={() => {
                setAllDealsOpen(false);
                handleOpenCreateDeal();
              }}
              className="w-full gap-1.5"
            >
              <Plus className="size-3.5" />
              Add deal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={allNotesOpen} onOpenChange={setAllNotesOpen}>
        <DialogContent className="bg-card border-border flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-border border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="text-primary size-4" />
              All notes
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-xs">
                {notes.length}
              </span>
            </DialogTitle>
            <DialogDescription>
              Notes and follow-ups for {displayName}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5">
              <ContactNotesSection
                contactId={contact.id}
                notes={notes}
                onNotesChange={setNotes}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={selectedDeal}
        defaultContactId={contact.id}
        onSaved={fetchContactData}
      />
    </>
  );
}
