'use client';

// ============================================================
// Support-chat composer: text, images and documents.
//
// Shaped after the Inbox composer (Enter sends, Shift+Enter newlines,
// autosize to four lines, emoji picker, staged attachment with a caption)
// but written fresh rather than imported: `message-composer.tsx` takes
// eleven required callbacks for templates, interactive messages, contact
// cards, location pins, stickers and AI drafts, none of which exist here,
// and it gates every input on the WhatsApp 24-hour session window, which
// does not apply to an in-app chat.
//
// The emoji picker IS reused — already self-contained, theme-aware and
// dynamically imported, with no inbox coupling.
//
// One attachment per message, deliberately. Multi-file would need its own
// upload queue, per-file progress and per-file failure handling, and a
// support conversation is better served by one file plus a sentence about
// it than by a dump of six.
// ============================================================

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  AudioLines,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Smile,
  Square,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { EmojiPicker } from '@/components/inbox/emoji-picker/emoji-picker';
import { cn } from '@/lib/utils';
import {
  SUPPORT_ACCEPT_ATTRIBUTE,
  SUPPORT_CAPTION_MAX,
  SUPPORT_RECORDING_MAX_SECONDS,
  formatSupportBytes,
  type SupportAttachmentKind,
} from '@/lib/support-chat/attachments';
import {
  SUPPORT_MESSAGE_MAX,
  normalizeSupportText,
} from '@/lib/support-chat/validation';
import {
  discardSupportAttachment,
  stageSupportAttachment,
  type SupportStagedAttachment,
} from './support-attachment-draft';
import { formatClipDuration, useVoiceRecorder } from './use-voice-recorder';
import {
  QuotedMessage,
  type QuotePreview,
} from '@/components/chat/quoted-message';

export interface SupportReplyDraft {
  id: string;
  /** Same shape as the quote the sent reply will carry, so they match. */
  quote: QuotePreview;
}

export interface SupportSendPayload {
  text: string;
  replyToMessageId?: string;
  /** Present when an attachment is staged. */
  mediaKey?: string;
  filename?: string;
  /**
   * Which kind was staged, so the optimistic bubble renders as the right
   * shape immediately. The SERVER still decides the stored content_type
   * from the object's real mime — this is presentation only, and is
   * replaced by the real row the moment the send returns.
   */
  kind?: SupportAttachmentKind;
  /** Byte size, for the optimistic document card. */
  sizeBytes?: number;
}

/**
 * When to start showing the character counter.
 *
 * Permanently visible it is noise — almost every support message is a
 * couple of lines. It only becomes information near the ceiling.
 */
const COUNTER_VISIBLE_FROM = SUPPORT_MESSAGE_MAX - 400;

/**
 * What the thread can ask the composer to do.
 *
 * Exists for drag-and-drop: the drop target is the whole message list (that
 * is where people aim), but everything that knows how to stage a file —
 * validation, presign, progress, GC of an abandoned object — lives here.
 * An imperative handle keeps that ownership intact; the alternatives were
 * lifting all the staging state into the thread, or passing a File down
 * through props and watching it in an effect, which needs a synthetic token
 * to re-trigger on the same file twice.
 */
export interface SupportComposerHandle {
  attachFile: (file: File) => void;
}

export function SupportComposer({
  ref,
  onSend,
  disabled = false,
  placeholder = 'Type a message',
  replyTo,
  onClearReply,
  accountId,
  onTyping,
}: {
  ref?: React.Ref<SupportComposerHandle>;
  /**
   * Resolves when the send has been accepted. Rejecting is fine — the
   * composer keeps the draft so nothing is lost.
   */
  onSend: (payload: SupportSendPayload) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  replyTo?: SupportReplyDraft | null;
  onClearReply?: () => void;
  /** Only sent by an operator, who is acting on a thread they don't own. */
  accountId?: string;
  /** Called as the user types. Throttling is the caller's business. */
  onTyping?: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Staged attachment: uploaded to S3, not yet attached to a message.
  const [staged, setStaged] = useState<SupportStagedAttachment | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Mirror of `staged` for the unmount cleanup, which cannot read render
  // state. Kept in sync below so navigating away with an unsent
  // attachment GCs the orphaned object instead of leaving it in the
  // bucket forever.
  const stagedRef = useRef<SupportStagedAttachment | null>(null);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  const releaseStaged = useCallback(
    (item: SupportStagedAttachment | null, alsoDelete: boolean) => {
      if (!item) return;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (alsoDelete) discardSupportAttachment(item.key, accountId);
    },
    [accountId]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      releaseStaged(stagedRef.current, true);
    };
  }, [releaseStaged]);

  const uploading = uploadPercent !== null;

  /**
   * Duration of a staged voice note, in seconds.
   *
   * Held alongside the staged attachment rather than in it because the
   * recorder is the only thing that knows it — there is no duration column
   * on the message, and reading it back out of an Ogg container to display
   * a number we already had would be work for its own sake. Playback in
   * the thread gets the duration from the <audio> element instead.
   */
  const [clipSeconds, setClipSeconds] = useState<number | null>(null);

  // The cap depends on what is staged: a caption is much shorter than a
  // standalone message, because anything longer wants to be its own
  // message so it can be quoted and replied to.
  const maxChars = staged ? SUPPORT_CAPTION_MAX : SUPPORT_MESSAGE_MAX;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Four lines, matching the inbox. Past that the textarea scrolls
    // rather than eating the thread.
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  // Opening a reply should put the cursor where the user is about to
  // type, the way every chat client behaves.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // ---- Attachments ---------------------------------------------------

  const handlePicked = useCallback(
    async (file: File | undefined) => {
      if (!file || uploading) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setUploadPercent(0);
      try {
        const next = await stageSupportAttachment({
          file,
          accountId,
          onProgress: setUploadPercent,
          signal: controller.signal,
        });
        // Replacing an existing draft: GC the previous object, which was
        // uploaded and will now never be sent.
        releaseStaged(stagedRef.current, true);
        setStaged(next);
        // Put the cursor in the caption field — that is what the user
        // wants next.
        requestAnimationFrame(() => textareaRef.current?.focus());
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not attach that file.';
        // A cancel is the user's own doing; toasting it is nagging.
        if (message !== 'Upload cancelled.') toast.error(message);
      } finally {
        setUploadPercent(null);
        abortRef.current = null;
      }
    },
    [uploading, accountId, releaseStaged]
  );

  // ---- Voice notes ---------------------------------------------------

  const recorder = useVoiceRecorder({
    onComplete: (file, secs) => {
      setClipSeconds(secs);
      void handlePicked(file);
    },
    onError: (message) => toast.error(message),
  });

  // The thread's drop zone routes files here, so a dropped file goes
  // through exactly the same validation and staging path as the attach
  // menu.
  useImperativeHandle(ref, () => ({
    attachFile: (file: File) => void handlePicked(file),
  }));

  /**
   * Ctrl+V a screenshot.
   *
   * This is THE way people share a screenshot — PrintScreen or Win+Shift+S
   * puts the image on the clipboard and never touches the filesystem, so
   * without this the only route is "save the file somewhere, then use the
   * attach menu to find it again".
   *
   * A clipboard payload can carry both text and an image (copying a cell
   * out of Excel does exactly that), so text wins when present: pasting
   * into a textarea and getting a file attached instead of your words
   * would be worse than the reverse.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // An already-staged attachment is REPLACED rather than refused —
      // pasting a second screenshot reads as a correction, and
      // `handlePicked` GCs the object being dropped.
      if (disabled || uploading) return;

      const data = e.clipboardData;
      if (!data) return;
      if (data.getData('text')?.trim()) return;

      // `files` is the reliable surface for a pasted bitmap. `items` is
      // checked too because some browsers populate only that for a
      // screenshot.
      let file: File | null = data.files?.[0] ?? null;
      if (!file && data.items) {
        for (const item of Array.from(data.items)) {
          if (item.kind === 'file') {
            const asFile = item.getAsFile();
            if (asFile) {
              file = asFile;
              break;
            }
          }
        }
      }
      if (!file) return;

      // A pasted bitmap usually arrives named "image.png" or with no name
      // at all. Give it something a human can recognise later in the
      // thread, since this becomes `media_filename`.
      const named =
        file.name && file.name !== 'image.png'
          ? file
          : new File(
              [file],
              `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${
                file.type === 'image/jpeg' ? 'jpg' : 'png'
              }`,
              { type: file.type || 'image/png' }
            );

      // Stop the browser also dropping a filename or markup into the box.
      e.preventDefault();
      void handlePicked(named);
    },
    [disabled, uploading, handlePicked]
  );

  const removeStaged = useCallback(() => {
    releaseStaged(stagedRef.current, true);
    setStaged(null);
    setClipSeconds(null);
    // Trim a caption that is now over the standalone limit? No — the
    // limit only goes UP when the attachment is removed, so the existing
    // text is always still valid.
  }, [releaseStaged]);

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ---- Sending -------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (sending || disabled || uploading) return;

    const trimmed = text.trim();

    // An attachment can go with no caption; text cannot go empty.
    if (!staged) {
      const parsed = normalizeSupportText(text);
      if (!parsed.ok) {
        // A blank composer is the ordinary case (Enter on an empty box);
        // toasting that would be nagging. Anything else is worth saying.
        if (trimmed) toast.error(parsed.error);
        return;
      }
    }

    setSending(true);
    try {
      await onSend({
        text: trimmed,
        replyToMessageId: replyTo?.id,
        ...(staged
          ? {
              mediaKey: staged.key,
              filename: staged.filename,
              kind: staged.kind,
              sizeBytes: staged.sizeBytes,
            }
          : {}),
      });
      setText('');
      // The object now belongs to a sent message, so release the preview
      // URL WITHOUT deleting it from storage.
      releaseStaged(stagedRef.current, false);
      setStaged(null);
      setClipSeconds(null);
      onClearReply?.();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch {
      // The caller has already surfaced the reason. The draft stays put
      // deliberately — clearing it would destroy the user's message (and
      // orphan their upload) on a transient network failure.
    } finally {
      setSending(false);
    }
  }, [
    sending,
    disabled,
    uploading,
    text,
    staged,
    onSend,
    replyTo?.id,
    onClearReply,
    releaseStaged,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
        return;
      }
      // Escape drops the reply target rather than the whole draft.
      if (e.key === 'Escape' && replyTo) {
        e.preventDefault();
        onClearReply?.();
      }
    },
    [handleSend, replyTo, onClearReply]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Hard-clip instead of rejecting on send: a paste that is 20
      // characters over should not throw away the other 4,096.
      const next = e.target.value.slice(0, maxChars);
      setText(next);
      adjustHeight();
      // Only on real content. Signalling on an empty box means clearing
      // the draft reads as "still typing".
      if (next.trim()) onTyping?.();
    },
    [adjustHeight, maxChars, onTyping]
  );

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = textareaRef.current;
      if (!el) {
        setText((prev) => (prev + emoji).slice(0, maxChars));
        return;
      }

      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      if (next.length > maxChars) {
        toast.warning('Message is at the character limit.');
        return;
      }
      setText(next);

      // Restore the caret after the inserted glyph — an emoji can be
      // several UTF-16 units, so the offset is the string length, not 1.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
        adjustHeight();
      });
    },
    [text, adjustHeight, maxChars]
  );

  const canSend =
    (text.trim().length > 0 || Boolean(staged)) &&
    !sending &&
    !disabled &&
    !uploading;
  const showCounter = text.length >= Math.min(COUNTER_VISIBLE_FROM, maxChars);

  return (
    <div className="border-border bg-card border-t p-3">
      {/* Hidden inputs driven by the attach menu. `accept` is derived from
          the same allowlist the server enforces, so the picker and the
          route cannot disagree about what is allowed. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={SUPPORT_ACCEPT_ATTRIBUTE.image}
        className="hidden"
        onChange={(e) => {
          void handlePicked(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={SUPPORT_ACCEPT_ATTRIBUTE.document}
        className="hidden"
        onChange={(e) => {
          void handlePicked(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {replyTo ? (
        <div className="mb-2">
          <QuotedMessage preview={replyTo.quote} onDismiss={onClearReply} />
        </div>
      ) : null}

      {recorder.recording ? (
        // Replaces the composer row entirely while the mic is live, so
        // there is no ambiguity about what Send would do.
        <div className="border-border bg-muted flex items-center gap-3 rounded-xl border px-4 py-2.5">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="text-foreground flex-1 text-sm">
            Recording {formatClipDuration(recorder.seconds)} /{' '}
            {formatClipDuration(SUPPORT_RECORDING_MAX_SECONDS)}
          </span>
          <button
            type="button"
            onClick={recorder.cancel}
            className="text-muted-foreground hover:bg-card hover:text-foreground rounded-md px-2 py-1 text-xs"
          >
            Discard
          </button>
          <Button
            size="icon"
            onClick={recorder.stop}
            className="h-9 w-9 shrink-0"
            title="Stop and attach"
            aria-label="Stop recording and attach"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : uploading ? (
        <div className="bg-muted mb-2 flex items-center gap-3 rounded-md px-3 py-2">
          <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-xs font-medium">
              Uploading… {uploadPercent}%
            </p>
            <div
              className="bg-background mt-1 h-1 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={uploadPercent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${uploadPercent ?? 0}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={cancelUpload}
            className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      ) : staged ? (
        <div className="bg-muted mb-2 flex items-center gap-3 rounded-md px-3 py-2">
          {staged.kind === 'image' && staged.previewUrl ? (
            // Local object URL, not a signed GET: the bytes are already
            // here, so signing a URL for a file the user is looking at
            // would be pure latency.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={staged.previewUrl}
              alt={staged.filename}
              className="h-12 w-12 shrink-0 rounded object-cover"
            />
          ) : staged.kind === 'audio' ? (
            <AudioLines className="text-primary h-8 w-8 shrink-0" />
          ) : (
            <FileText className="text-muted-foreground h-8 w-8 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {staged.kind === 'audio' && staged.previewUrl ? (
              // Let them hear the take before it goes. A voice note is the
              // one attachment you cannot check by looking at it, and
              // "send and hope" is how a garbled recording reaches support.
              <audio
                src={staged.previewUrl}
                controls
                className="h-8 w-full max-w-64"
              />
            ) : (
              <p className="text-foreground truncate text-xs font-medium">
                {staged.filename}
              </p>
            )}
            <p className="text-muted-foreground text-[11px]">
              {staged.kind === 'audio' && clipSeconds !== null
                ? `Voice note · ${formatClipDuration(clipSeconds)} · `
                : ''}
              {formatSupportBytes(staged.sizeBytes)} · ready to send
            </p>
          </div>
          <button
            type="button"
            onClick={removeStaged}
            aria-label="Remove attachment"
            className="text-muted-foreground hover:bg-background hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          'flex items-end gap-2',
          // Hidden rather than unmounted while recording: unmounting would
          // throw away the caption the user may already have typed.
          recorder.recording && 'hidden'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled || uploading}
            aria-label="Attach a file"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Paperclip className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48">
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
              <ImageIcon className="text-muted-foreground mr-2 h-4 w-4" />
              Photo or screenshot
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
              <FileText className="text-muted-foreground mr-2 h-4 w-4" />
              Document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* This repo's PopoverTrigger renders its own native button and
            has no `asChild`, so the trigger is styled directly rather
            than wrapping a <Button> (which would nest buttons). */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger
            disabled={disabled}
            aria-label="Insert emoji"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Smile className="h-5 w-5" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            className="w-auto border-0 bg-transparent p-0 shadow-none"
          >
            <EmojiPicker onSelect={insertEmoji} />
          </PopoverContent>
        </Popover>

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            rows={1}
            placeholder={staged ? 'Add a caption (optional)' : placeholder}
            aria-label={staged ? 'Caption' : 'Message'}
            className={cn(
              'border-border bg-background text-foreground placeholder:text-muted-foreground',
              'focus:ring-primary/40 w-full resize-none rounded-xl border px-3 py-2 text-sm',
              'focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            )}
          />
          {showCounter ? (
            <p
              className={cn(
                'mt-1 text-right text-[10px]',
                text.length >= maxChars
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              )}
            >
              {text.length.toLocaleString()} / {maxChars.toLocaleString()}
            </p>
          ) : null}
        </div>

        {/* Mic where Send would be when there is nothing to send, which is
            how every chat client behaves — and it keeps the row at a fixed
            width instead of adding a permanent extra button. Hidden
            entirely where recording is unsupported rather than shown
            disabled: a greyed-out mic invites clicking and explains
            nothing. */}
        {canSend || sending || !recorder.supported ? (
          <Button
            type="button"
            size="icon"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Send message"
            className="h-9 w-9 shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => void recorder.start()}
            disabled={disabled || uploading || recorder.starting}
            aria-label="Record a voice note"
            title="Record a voice note"
            className="h-9 w-9 shrink-0"
          >
            {recorder.starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
