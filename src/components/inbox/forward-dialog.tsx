'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Forward,
  Loader2,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  MapPin,
  User,
  Sticker,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Message, Conversation, Contact } from '@/types';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/phone/countries';

interface ConversationItem {
  id: string;
  contact?: {
    id: string;
    name: string;
    phone: string;
    avatar_url?: string;
  };
  last_message_text?: string;
}

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  currentConversationId?: string;
}

export function ForwardDialog({
  open,
  onOpenChange,
  message,
  currentConversationId,
}: ForwardDialogProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Load conversations when opened
  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSearchQuery('');
      return;
    }

    const loadConversations = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('conversations')
          .select('id, last_message_text, contacts(id, name, phone, avatar_url)')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(100);

        if (error) throw error;

        const mapped: ConversationItem[] = (data || []).map((row: any) => ({
          id: row.id,
          contact: row.contacts
            ? {
                id: row.contacts.id,
                name: row.contacts.name || row.contacts.phone || 'Unknown',
                phone: row.contacts.phone || '',
                avatar_url: row.contacts.avatar_url,
              }
            : undefined,
          last_message_text: row.last_message_text,
        }));

        setConversations(mapped);
      } catch (err) {
        console.error('Failed to load conversations for forward:', err);
        toast.error('Failed to load chats');
      } finally {
        setLoading(false);
      }
    };

    void loadConversations();
  }, [open]);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (c.id === currentConversationId) return false;
      if (!q) return true;
      const name = c.contact?.name?.toLowerCase() || '';
      const phone = c.contact?.phone?.toLowerCase() || '';
      return name.includes(q) || phone.includes(q);
    });
  }, [conversations, searchQuery, currentConversationId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (!message || selectedIds.size === 0) return;

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          targetConversationIds: Array.from(selectedIds),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to forward message');
      }

      toast.success(
        selectedIds.size === 1
          ? 'Message sent to 1 chat'
          : `Message sent to ${data.sentCount || selectedIds.size} chats`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Forwarding failed');
    } finally {
      setSending(false);
    }
  };

  if (!message) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Forward className="h-4 w-4 text-primary" />
            Send to another chat
          </DialogTitle>
        </DialogHeader>

        {/* Message Preview Banner */}
        <div className="rounded-lg border border-border/80 bg-muted/40 p-2.5 text-xs text-muted-foreground flex items-center gap-2.5">
          <MessagePreviewIcon type={message.content_type} />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground capitalize">
              {message.content_type} message:{' '}
            </span>
            <span className="truncate inline-block max-w-full align-bottom">
              {message.content_text || message.location_name || message.media_filename || 'Attachment'}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contact or phone..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Conversations List */}
        <ScrollArea className="h-64 border rounded-md p-1">
          {loading ? (
            <div className="flex h-full items-center justify-center py-12 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading chats...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No chats found.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conv) => {
                const isSelected = selectedIds.has(conv.id);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => toggleSelect(conv.id)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/70',
                      isSelected && 'bg-primary/10 hover:bg-primary/15'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-[11px]">
                        {conv.contact?.name?.[0]?.toUpperCase() || 'C'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {conv.contact?.name || 'Unknown'}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate font-mono">
                          {formatPhoneNumber(conv.contact?.phone)}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border transition-colors',
                        isSelected && 'bg-primary border-primary text-primary-foreground'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? 'chat' : 'chats'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleForward}
              disabled={selectedIds.size === 0 || sending}
              className="gap-1.5"
            >
              {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send ({selectedIds.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessagePreviewIcon({ type }: { type: string }) {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-4 w-4 text-emerald-500 shrink-0" />;
    case 'video':
      return <Video className="h-4 w-4 text-purple-500 shrink-0" />;
    case 'document':
      return <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
    case 'audio':
      return <Mic className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'location':
      return <MapPin className="h-4 w-4 text-red-500 shrink-0" />;
    case 'contacts':
      return <User className="h-4 w-4 text-indigo-500 shrink-0" />;
    case 'sticker':
      return <Sticker className="h-4 w-4 text-pink-500 shrink-0" />;
    default:
      return <Forward className="h-4 w-4 text-primary shrink-0" />;
  }
}
