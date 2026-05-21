'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  Message,
  Contact,
  ConversationStatus,
} from '@/types';
import { useAuth } from '@/hooks/use-auth';
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Clock,
  ArrowLeft,
  UserX,
  Check,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBubble } from './message-bubble';
import { MessageComposer, type ComposerMessage } from './message-composer';
import { ImageViewer } from './image-viewer';
import { TemplateModal } from './template-modal';
import { toast } from 'sonner';

interface VendorOption {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  is_active: boolean;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onUpdateConversation?: (id: string, updates: Partial<Conversation>) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

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
  { label: 'Open', value: 'open', color: 'text-violet-600' },
  { label: 'Pending', value: 'pending', color: 'text-amber-600' },
  { label: 'Closed', value: 'closed', color: 'text-muted-foreground' },
];

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onUpdateConversation,
  onBack,
}: MessageThreadProps) {
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [viewerImageId, setViewerImageId] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const { isAdmin } = useAuth();

  // Fetch vendors for the assign dropdown (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await fetch('/api/vendors');
        if (res.ok) {
          const data = await res.json();
          setVendors(data.filter((v: VendorOption) => v.is_active));
        }
      } catch (e) {
        console.error('Failed to fetch vendors:', e);
      }
    })();
  }, [isAdmin]);

  const assignedVendor = useMemo(() => {
    if (!conversation?.assigned_agent_id || vendors.length === 0) return null;
    return vendors.find((v) => v.id === conversation.assigned_agent_id) ?? null;
  }, [conversation, vendors]);

  const handleAssignVendor = useCallback(
    async (vendorId: string | null) => {
      if (!conversation) return;

      // Capture the previous agent BEFORE the optimistic update
      const previousAgentId = conversation.assigned_agent_id;

      // Optimistic update
      if (onUpdateConversation) {
        onUpdateConversation(conversation.id, { assigned_agent_id: vendorId });
      }

      const supabase = createClient();
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: vendorId })
        .eq('id', conversation.id);

      if (error) {
        // Revert on error
        if (onUpdateConversation) {
          onUpdateConversation(conversation.id, { assigned_agent_id: previousAgentId });
        }
        toast.error('Failed to assign conversation');
        return;
      }

      // Broadcast assignment change so the old vendor's browser gets
      // notified even when RLS blocks the postgres_changes event.
      if (previousAgentId && previousAgentId !== vendorId) {
        const broadcastChannel = supabase.channel('vendor-assignment-updates');
        broadcastChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            broadcastChannel.send({
              type: 'broadcast',
              event: 'assignment-changed',
              payload: {
                conversationId: conversation.id,
                oldAgentId: previousAgentId,
                newAgentId: vendorId,
              },
            });
            // Clean up after a short delay to ensure delivery
            setTimeout(() => supabase.removeChannel(broadcastChannel), 1000);
          }
        });
      }

      const vendorName = vendorId
        ? (vendors.find((v) => v.id === vendorId)?.full_name ?? 'vendor')
        : null;
      toast.success(
        vendorId ? `Assigned to ${vendorName}` : 'Conversation unassigned'
      );
    },
    [conversation, vendors, onUpdateConversation]
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
      return { expired: true, remaining: 'Expired' };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? `${Math.floor(hoursLeft)}h remaining`
        : `${Math.floor(hoursLeft * 60)}m remaining`;

    return { expired, remaining };
  }, [messages]);

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

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch messages:', error);
      } else {
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('Failed to reset unread_count:', error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (message: ComposerMessage) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const contentType = message.messageType;
      const contentText =
        message.messageType === 'text'
          ? message.text
          : message.messageType === 'location'
            ? [
                message.locationName,
                message.locationAddress,
                message.locationUrl,
              ]
                .filter(Boolean)
                .join(' - ')
            : message.messageType === 'contact_card'
              ? [message.contactName, message.contactPhone]
                  .filter(Boolean)
                  .join(' - ')
              : message.messageType === 'document'
                ? message.text || message.filename || undefined
                : message.messageType === 'template'
                  ? `[Template: ${message.templateName}]`
                  : message.text || undefined;
      const mediaUrl =
        message.messageType === 'image' ||
        message.messageType === 'video' ||
        message.messageType === 'audio' ||
        message.messageType === 'document'
          ? message.mediaUrl || `/api/whatsapp/media/${message.mediaId}`
          : undefined;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        content_type: contentType,
        content_text: contentText,
        media_url: mediaUrl,
        status: 'sending',
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: message.messageType,
            content_text: contentText,
            media_id:
              message.messageType === 'image' ||
              message.messageType === 'video' ||
              message.messageType === 'audio' ||
              message.messageType === 'document'
                ? message.mediaId
                : undefined,
            media_url: mediaUrl,
            filename:
              message.messageType === 'document' ? message.filename : undefined,
            location_url:
              message.messageType === 'location'
                ? message.locationUrl
                : undefined,
            location_name:
              message.messageType === 'location'
                ? message.locationName
                : undefined,
            location_address:
              message.messageType === 'location'
                ? message.locationAddress
                : undefined,
            contact_name:
              message.messageType === 'contact_card'
                ? message.contactName
                : undefined,
            contact_phone:
              message.messageType === 'contact_card'
                ? message.contactPhone
                : undefined,
            template_name:
              message.messageType === 'template'
                ? message.templateName
                : undefined,
            template_params:
              message.messageType === 'template'
                ? message.templateParams
                : undefined,
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
    setIsTemplateModalOpen(true);
  }, []);

  const mediaMessages = useMemo(() => 
    messages.filter((m) => (m.content_type === 'image' || m.content_type === 'video') && m.media_url),
    [messages]
  );

  // Empty state
  if (!conversation || !contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-8 w-8 text-slate-600" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">
          Select a conversation
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Choose a conversation from the left to start messaging
        </p>
      </div>
    );
  }

  let displayName = contact.name || contact.phone;
  if (contact.name) {
    const words = contact.name.trim().split(/\s+/);
    if (words.length > 2) {
      displayName = `${words[0]} ${words[1]}...`;
    }
  }
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
          </div>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              'ml-1 hidden gap-1 border-border text-[10px] sm:ml-2 sm:inline-flex',
              sessionInfo.expired ? 'text-red-600' : 'text-violet-600'
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs hover:bg-muted',
                currentStatus?.color ?? 'text-muted-foreground'
              )}
            >
              {currentStatus?.label ?? 'Status'}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-muted"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn('text-sm', opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign button — admin only */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                {assignedVendor ? (
                  <Avatar className="h-4 w-4 shrink-0">
                    <AvatarImage src={assignedVendor.avatar_url || ''} alt={assignedVendor.full_name} />
                    <AvatarFallback className="bg-violet-500/10 text-[8px] font-medium text-violet-600">
                      {assignedVendor.full_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <UserPlus className="h-3 w-3" />
                )}
                {assignedVendor ? assignedVendor.full_name : 'Assign'}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-48 border-border bg-muted"
              >
                {vendors.length === 0 ? (
                  <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                    No vendors — create one in Settings
                  </DropdownMenuItem>
                ) : (
                  <>
                    {vendors.map((vendor) => (
                      <DropdownMenuItem
                        key={vendor.id}
                        onClick={() => handleAssignVendor(vendor.id)}
                        className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={vendor.avatar_url || ''} alt={vendor.full_name} />
                          <AvatarFallback className="bg-violet-500/10 text-[10px] font-medium text-violet-600">
                            {vendor.full_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1">{vendor.full_name}</span>
                        {assignedVendor?.id === vendor.id && (
                          <Check className="h-3.5 w-3.5 text-violet-600" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    {assignedVendor && (
                      <>
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem
                          onClick={() => handleAssignVendor(null)}
                          className="flex items-center gap-2 text-sm text-red-600"
                        >
                          <UserX className="h-4 w-4" />
                          Unassign
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-slate-600">
              Send a template to start the conversation
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => (
                    <MessageBubble 
                      key={msg.id} 
                      message={msg} 
                      onMediaClick={(m) => setViewerImageId(m.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onOpenTemplates={handleOpenTemplates}
      />

      {/* Lightbox Viewer */}
      {viewerImageId && (
        <ImageViewer
          images={mediaMessages}
          initialImageId={viewerImageId}
          onClose={() => setViewerImageId(null)}
        />
      )}

      {/* Template Modal */}
      <TemplateModal
        open={isTemplateModalOpen}
        onOpenChange={setIsTemplateModalOpen}
        onSend={handleSend}
      />
    </div>
  );
}
