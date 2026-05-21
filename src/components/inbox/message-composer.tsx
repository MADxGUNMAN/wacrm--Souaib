'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  LayoutTemplate,
  Paperclip,
  FileText,
  Image,
  Music,
  MapPin,
  Contact as ContactIcon,
  Zap,
  Loader2,
  X,
  Plus,
  Search,
  Users,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Contact as SavedContact, QuickReply } from '@/types';

type MediaMessageType = 'image' | 'video' | 'audio' | 'document';

export type ComposerMessage =
  | { messageType: 'text'; text: string }
  | {
      messageType: MediaMessageType;
      mediaId: string;
      mediaUrl?: string;
      filename?: string;
      text?: string;
    }
  | {
      messageType: 'location';
      locationUrl: string;
      locationName?: string;
      locationAddress?: string;
    }
  | {
      messageType: 'contact_card';
      contactName: string;
      contactPhone: string;
    };

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (message: ComposerMessage) => void | Promise<void>;
  onOpenTemplates: () => void;
}

const MAX_MEDIA_SIZE = 16 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;

function isVideoFile(file: File, lowerName = file.name.toLowerCase()) {
  return (
    file.type.startsWith('video/') ||
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.3gp')
  );
}

type PendingAttachment = {
  id: string;
  messageType: MediaMessageType;
  file: File;
  previewUrl?: string;
};

const ATTACHMENT_OPTIONS: Array<{
  label: string;
  icon: typeof FileText;
  action: 'document' | 'photos' | 'audio' | 'location' | 'contact' | 'quick';
}> = [
  { label: 'Document', icon: FileText, action: 'document' },
  { label: 'Photos & Videos', icon: Image, action: 'photos' },
  { label: 'Audio', icon: Music, action: 'audio' },
  { label: 'Location', icon: MapPin, action: 'location' },
  { label: 'Contact', icon: ContactIcon, action: 'contact' },
  { label: 'Quick Replies', icon: Zap, action: 'quick' },
];

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onOpenTemplates,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [quickSearch, setQuickSearch] = useState('');
  const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);
  const [quickRepliesUnavailable, setQuickRepliesUnavailable] = useState(false);
  const [createQuickReplyOpen, setCreateQuickReplyOpen] = useState(false);
  const [newQuickShortcut, setNewQuickShortcut] = useState('');
  const [newQuickText, setNewQuickText] = useState('');
  const [savingQuickReply, setSavingQuickReply] = useState(false);
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [locationUrl, setLocationUrl] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((current) =>
      current.filter((attachment) => {
        if (attachment.id !== id) return true;
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        return false;
      })
    );
  }, []);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(
    () => () => {
      pendingAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    },
    []
  );

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const resetTextarea = useCallback(() => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const fetchQuickReplies = useCallback(async () => {
    if (
      quickReplies.length > 0 ||
      loadingQuickReplies ||
      quickRepliesUnavailable
    ) {
      return;
    }

    setLoadingQuickReplies(true);
    try {
      const res = await fetch('/api/quick-replies');
      const payload = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setQuickReplies(payload);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      const tableMissing = reason.includes('Quick replies are not installed');
      if (tableMissing) {
        setQuickRepliesUnavailable(true);
        toast.error('Quick replies table is missing. Apply migration 009.');
      } else {
        toast.error(`Failed to load quick replies: ${reason}`);
      }
    } finally {
      setLoadingQuickReplies(false);
    }
  }, [loadingQuickReplies, quickReplies.length, quickRepliesUnavailable]);

  const fetchSavedContacts = useCallback(async () => {
    if (savedContacts.length > 0 || loadingContacts) return;

    setLoadingContacts(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedContacts(data ?? []);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      toast.error(`Failed to load contacts: ${reason}`);
    } finally {
      setLoadingContacts(false);
    }
  }, [loadingContacts, savedContacts.length]);

  useEffect(() => {
    if (quickRepliesOpen || text.trimStart().startsWith('/')) {
      void fetchQuickReplies();
    }
  }, [fetchQuickReplies, quickRepliesOpen, text]);

  useEffect(() => {
    if (contactOpen) void fetchSavedContacts();
  }, [contactOpen, fetchSavedContacts]);

  const slashQuery = text.trimStart().startsWith('/')
    ? text.trimStart().slice(1).toLowerCase()
    : '';
  const replyQuery = (
    quickRepliesOpen ? quickSearch : slashQuery
  ).toLowerCase();
  const visibleQuickReplies = quickReplies.filter((reply) => {
    if (!replyQuery) return true;
    return (
      reply.shortcut.toLowerCase().includes(replyQuery) ||
      reply.text.toLowerCase().includes(replyQuery)
    );
  });
  const showInlineQuickReplies =
    !sessionExpired &&
    (quickRepliesOpen || text.trimStart().startsWith('/')) &&
    (quickRepliesOpen || loadingQuickReplies || visibleQuickReplies.length > 0);

  const visibleContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return savedContacts;

    return savedContacts.filter((contact) =>
      [contact.name, contact.phone, contact.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [contactSearch, savedContacts]);

  const selectedContacts = useMemo(() => {
    const byId = new Map(savedContacts.map((contact) => [contact.id, contact]));
    return selectedContactIds
      .map((id) => byId.get(id))
      .filter((contact): contact is SavedContact => Boolean(contact));
  }, [savedContacts, selectedContactIds]);

  const insertQuickReply = useCallback(
    (reply: QuickReply) => {
      setText(reply.text);
      setQuickRepliesOpen(false);
      setQuickSearch('');
      requestAnimationFrame(() => {
        adjustHeight();
        textareaRef.current?.focus();
      });
    },
    [adjustHeight]
  );

  const handleCreateQuickReply = useCallback(async () => {
    const shortcut = newQuickShortcut.trim().replace(/^\/+/, '');
    const replyText = newQuickText.trim();

    if (!shortcut || !replyText) {
      toast.error('Shortcut and message are required.');
      return;
    }

    setSavingQuickReply(true);
    try {
      const res = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, text: replyText }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setQuickReplies((current) =>
        [...current, payload].sort((a, b) =>
          a.shortcut.localeCompare(b.shortcut)
        )
      );
      setQuickRepliesUnavailable(false);
      setCreateQuickReplyOpen(false);
      setNewQuickShortcut('');
      setNewQuickText('');
      toast.success('Quick reply created');
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      if (reason.includes('Quick replies are not installed')) {
        setQuickRepliesUnavailable(true);
        toast.error('Quick replies table is missing. Apply migration 009.');
      } else {
        toast.error(`Failed to create quick reply: ${reason}`);
      }
    } finally {
      setSavingQuickReply(false);
    }
  }, [newQuickShortcut, newQuickText]);

  const uploadAndSendAttachment = useCallback(
    async (attachment: PendingAttachment, caption?: string) => {
      const { messageType, file } = attachment;
      const sizeLimit =
        messageType === 'document' ? MAX_DOCUMENT_SIZE : MAX_MEDIA_SIZE;
      if (file.size > sizeLimit) {
        toast.error(
          `File is too large. Limit is ${Math.floor(sizeLimit / 1024 / 1024)}MB.`
        );
        return false;
      }

      setUploadingLabel(file.name);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversation_id', conversationId);
        formData.append('message_type', messageType);

        const res = await fetch('/api/whatsapp/media/upload', {
          method: 'POST',
          body: formData,
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        await onSend({
          messageType,
          mediaId: payload.media_id,
          mediaUrl: payload.media_url,
          filename: messageType === 'document' ? file.name : undefined,
          text:
            messageType === 'audio'
              ? undefined
              : caption || undefined,
        });
        return true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'upload failed';
        toast.error(`Attachment failed: ${reason}`);
        return false;
      } finally {
        setUploadingLabel(null);
      }
    },
    [conversationId, onSend]
  );

  const sendAttachments = useCallback(
    async (attachments: PendingAttachment[]) => {
      const caption = text.trim();
      const sentIds = new Set<string>();

      for (const [index, attachment] of attachments.entries()) {
        const sent = await uploadAndSendAttachment(
          attachment,
          index === 0 ? caption : undefined
        );
        if (sent) sentIds.add(attachment.id);
      }

      if (sentIds.size === attachments.length) {
        clearPendingAttachments();
        if (caption) resetTextarea();
        return;
      }

      setPendingAttachments((current) => {
        current.forEach((attachment) => {
          if (sentIds.has(attachment.id) && attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });
        return current.filter((attachment) => !sentIds.has(attachment.id));
      });

      if (sentIds.size > 0) {
        toast.error(`${attachments.length - sentIds.size} attachment(s) failed.`);
      }
    },
    [
      clearPendingAttachments,
      resetTextarea,
      text,
      uploadAndSendAttachment,
    ]
  );

  const handleSendMessage = useCallback(async () => {
    if (sending || sessionExpired) return;
    if (pendingAttachments.length > 0) {
      setSending(true);
      try {
        await sendAttachments(pendingAttachments);
      } finally {
        setSending(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await onSend({ messageType: 'text', text: trimmed });
      resetTextarea();
    } finally {
      setSending(false);
    }
  }, [
    pendingAttachments,
    sending,
    sendAttachments,
    sessionExpired,
    onSend,
    resetTextarea,
    text,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  const stageFiles = useCallback(
    (messageType: MediaMessageType | 'photos', files: File[]) => {
      const validAttachments = files.flatMap((file, index) => {
        const lowerName = file.name.toLowerCase();
        const selectedVideo = isVideoFile(file, lowerName);
        const resolvedType: MediaMessageType =
          messageType === 'photos' && selectedVideo
            ? file.size > MAX_MEDIA_SIZE
              ? 'document'
              : 'video'
            : messageType === 'photos'
              ? 'image'
              : messageType;
        const resolvedSizeLimit =
          resolvedType === 'document' ? MAX_DOCUMENT_SIZE : MAX_MEDIA_SIZE;

        if (file.size > resolvedSizeLimit) {
          toast.error(
            `${file.name} is too large. Limit is ${Math.floor(
              resolvedSizeLimit / 1024 / 1024
            )}MB.`
          );
          return [];
        }

        const canPreview = resolvedType === 'image' || resolvedType === 'video';
        return [
          {
            id: `${Date.now()}-${index}-${file.name}`,
            messageType: resolvedType,
            file,
            previewUrl: canPreview ? URL.createObjectURL(file) : undefined,
          },
        ];
      });

      if (validAttachments.length === 0) return;
      setPendingAttachments((current) => [...current, ...validAttachments]);
    },
    []
  );

  const handleFileChange = useCallback(
    (messageType: MediaMessageType | 'photos') =>
      (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length === 0 || sessionExpired) return;
        stageFiles(messageType, files);
      },
    [sessionExpired, stageFiles]
  );

  const handleAttachmentAction = useCallback(
    (action: (typeof ATTACHMENT_OPTIONS)[number]['action']) => {
      setAttachmentOpen(false);
      if (sessionExpired) return;

      if (action === 'document') documentInputRef.current?.click();
      if (action === 'photos') photosInputRef.current?.click();
      if (action === 'audio') audioInputRef.current?.click();
      if (action === 'location') setLocationOpen(true);
      if (action === 'contact') setContactOpen(true);
      if (action === 'quick') setQuickRepliesOpen(true);
    },
    [sessionExpired]
  );

  const handleSendLocation = useCallback(async () => {
    const trimmedUrl = locationUrl.trim();

    if (!trimmedUrl) {
      toast.error('Paste a Google Maps URL.');
      return;
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
      toast.error('Enter a full Google Maps URL.');
      return;
    }

    setSending(true);
    try {
      await onSend({
        messageType: 'location',
        locationUrl: trimmedUrl,
        locationName: locationName.trim() || undefined,
        locationAddress: locationAddress.trim() || undefined,
      });
      setLocationOpen(false);
      setLocationUrl('');
      setLocationName('');
      setLocationAddress('');
    } finally {
      setSending(false);
    }
  }, [locationAddress, locationName, locationUrl, onSend]);

  const toggleSelectedContact = useCallback((contactId: string) => {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
  }, []);

  const handleSendContact = useCallback(async () => {
    if (selectedContacts.length === 0) {
      toast.error('Select at least one contact.');
      return;
    }

    setSending(true);
    try {
      for (const contact of selectedContacts) {
        await onSend({
          messageType: 'contact_card',
          contactName: contact.name?.trim() || contact.phone,
          contactPhone: contact.phone,
        });
      }
      setContactOpen(false);
      setContactSearch('');
      setSelectedContactIds([]);
    } finally {
      setSending(false);
    }
  }, [onSend, selectedContacts]);

  return (
    <div className="border-t border-border bg-card p-3">
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-600">
            24-hour session expired. Use a template to re-engage.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-600 hover:text-amber-700"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            Templates
          </Button>
        </div>
      )}

      <input
        ref={documentInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        onChange={handleFileChange('document')}
      />
      <input
        ref={photosInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.mp4,.3gp"
        onChange={handleFileChange('photos')}
      />
      <input
        ref={audioInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".mp3,.ogg,.amr,.aac"
        onChange={handleFileChange('audio')}
      />

      {pendingAttachments.length > 0 && (
        <div className="mb-2 rounded-lg border border-border bg-muted p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {pendingAttachments.length} attachment
              {pendingAttachments.length === 1 ? '' : 's'} selected
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearPendingAttachments}
              disabled={sending}
            >
              Clear
            </Button>
          </div>
          <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex min-w-0 items-center gap-2 rounded-md bg-card/70 p-2"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
                  {attachment.messageType === 'image' &&
                  attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : attachment.messageType === 'video' &&
                    attachment.previewUrl ? (
                    <video
                      src={attachment.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                    />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {attachment.file.name}
                  </p>
                  <p className="text-[10px] capitalize text-muted-foreground">
                    {attachment.messageType}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => removePendingAttachment(attachment.id)}
                  disabled={sending}
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInlineQuickReplies && (
        <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {quickRepliesOpen && (
            <div className="flex items-center gap-2 border-b border-border p-2">
              <Input
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Search quick replies"
                className="h-8 border-border bg-muted text-xs text-foreground"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 bg-violet-600 px-2 text-xs hover:bg-violet-500"
                onClick={() => {
                  setCreateQuickReplyOpen(true);
                  setQuickRepliesOpen(false);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            </div>
          )}
          {loadingQuickReplies ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading
            </div>
          ) : quickRepliesUnavailable ? (
            <div className="px-3 py-2 text-xs text-amber-700">
              Apply migration 009 to enable quick replies.
            </div>
          ) : visibleQuickReplies.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No quick replies yet.
            </div>
          ) : (
            visibleQuickReplies.slice(0, 6).map((reply) => (
              <button
                key={reply.id}
                type="button"
                onClick={() => insertQuickReply(reply)}
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-muted"
              >
                <span className="block text-xs font-medium text-violet-700">
                  /{reply.shortcut}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {reply.text}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          onClick={onOpenTemplates}
          title="Templates"
        >
          <LayoutTemplate className="h-4 w-4" />
        </Button>

        <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                disabled={sessionExpired || sending || Boolean(uploadingLabel)}
                title="Attachments"
              />
            }
          >
            {uploadingLabel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            className="w-64 border border-border bg-card p-1"
          >
            {ATTACHMENT_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.action}
                  type="button"
                  onClick={() => handleAttachmentAction(option.action)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-card-foreground hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={sessionExpired ? 'Session expired' : 'Type a message...'}
          disabled={sessionExpired || sending}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-slate-500 transition-colors outline-none focus:border-violet-500/50',
            sessionExpired && 'cursor-not-allowed opacity-50'
          )}
        />

        <Button
          size="sm"
          className="h-9 w-9 shrink-0 bg-violet-600 p-0 hover:bg-violet-500 disabled:opacity-40"
          disabled={
            (!text.trim() && pendingAttachments.length === 0) ||
            sessionExpired ||
            sending
          }
          onClick={() => void handleSendMessage()}
          title="Send"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {uploadingLabel && (
        <p className="mt-1 pl-[5.8rem] text-[10px] text-muted-foreground">
          Uploading {uploadingLabel}
        </p>
      )}

      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Location</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="location-url">Google Maps URL</Label>
              <Input
                id="location-url"
                value={locationUrl}
                onChange={(e) => setLocationUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="location-name">Name</Label>
              <Input
                id="location-name"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="location-address">Address</Label>
              <Input
                id="location-address"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>
          </div>
          <DialogFooter className="border-border bg-card">
            <Button
              className="bg-violet-600 hover:bg-violet-500"
              onClick={() => void handleSendLocation()}
              disabled={sending}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createQuickReplyOpen} onOpenChange={setCreateQuickReplyOpen}>
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Quick Reply</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quick-reply-shortcut">Shortcut</Label>
              <Input
                id="quick-reply-shortcut"
                value={newQuickShortcut}
                onChange={(e) => setNewQuickShortcut(e.target.value)}
                placeholder="/price"
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quick-reply-text">Message</Label>
              <textarea
                id="quick-reply-text"
                value={newQuickText}
                onChange={(e) => setNewQuickText(e.target.value)}
                rows={4}
                className="min-h-24 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-slate-500 outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
          <DialogFooter className="border-border bg-card">
            <Button
              className="bg-violet-600 hover:bg-violet-500"
              onClick={() => void handleCreateQuickReply()}
              disabled={savingQuickReply}
            >
              {savingQuickReply ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={contactOpen}
        onOpenChange={(open) => {
          setContactOpen(open);
          if (!open) setContactSearch('');
        }}
      >
        <DialogContent className="max-w-lg border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Contact</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search by name or number"
                className="border-border bg-muted pl-9 text-foreground"
              />
            </div>

            <div className="min-h-48 overflow-hidden rounded-lg border border-border bg-background/40">
              {loadingContacts ? (
                <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading contacts
                </div>
              ) : savedContacts.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <Users className="mb-2 h-6 w-6 text-slate-600" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No saved contacts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add contacts first, then share them here.
                  </p>
                </div>
              ) : visibleContacts.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  No contacts match your search.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto p-1">
                  {visibleContacts.map((contact) => {
                    const selected = selectedContactIds.includes(contact.id);
                    const displayName = contact.name || contact.phone;

                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleSelectedContact(contact.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                          selected
                            ? 'bg-violet-500/15'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                            selected
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-slate-600 bg-card'
                          )}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-card-foreground">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {displayName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {contact.phone}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="border-border bg-card">
            <p className="mr-auto text-xs text-muted-foreground">
              {selectedContacts.length} selected
            </p>
            <Button
              className="bg-violet-600 hover:bg-violet-500"
              onClick={() => void handleSendContact()}
              disabled={sending || selectedContacts.length === 0}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
