'use client';

// ============================================================
// Attachment bodies for a support bubble: an image with a lightbox, and a
// document card.
//
// Both resolve their URL through `useSupportAttachment`, which asks the
// server to sign one per view. Written fresh rather than reusing the
// inbox's `MediaImage` because that component branches on a dead
// `/api/whatsapp/media/` proxy path, fetches into a blob URL for it, and
// takes a permanent `media_url` — none of which applies to a signed URL
// that has to be refreshed on a timer.
//
// Plain <img>, not next/image: `next.config.ts` has no `images` config at
// all, so a remote host would need `remotePatterns` added, and the URL
// changes every five minutes — which is precisely the wrong shape for an
// optimiser that caches by URL. The inbox made the same call.
// ============================================================

import { useEffect, useRef } from 'react';
import {
  AudioLines,
  Download,
  Expand,
  FileText,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { formatSupportBytes } from '@/lib/support-chat/attachments';
import type { SupportMessage } from '@/lib/support-chat/types';
import { cn } from '@/lib/utils';
import { useSupportAttachment } from './use-support-attachment';

/** Fallback when a file cannot be resolved. */
function Unavailable({
  label,
  onRetry,
}: {
  label: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
      <ImageOff className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="hover:text-foreground shrink-0 font-medium underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SupportImageAttachment({
  message,
  accountId,
  onResolved,
  onOpen,
}: {
  message: SupportMessage;
  accountId?: string;
  /**
   * Reports the resolved URL up to the thread, which owns the full-screen
   * viewer. The viewer needs every image's URL to offer next/previous and a
   * filmstrip, and only the bubble that rendered one knows its signed URL —
   * a hook cannot be called once per item of a dynamic list.
   */
  onResolved?: (messageId: string, url: string | null) => void;
  /** Asks the thread to open the viewer at this image. */
  onOpen?: (messageId: string) => void;
}) {
  const { url, loading, error, reload } = useSupportAttachment(
    message.id,
    accountId,
    // An optimistic row has no server-side object yet, and a retracted one
    // must not fetch at all.
    !message.id.startsWith('temp-') && !message.deleted_at
  );

  const alt = message.media_filename || 'Shared image';

  // Reported from an effect, never during render: calling the parent's
  // setState while rendering is the "Cannot update a component while
  // rendering a different component" error.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });
  useEffect(() => {
    onResolvedRef.current?.(message.id, url);
  }, [message.id, url]);

  if (loading || (!url && !error)) {
    return (
      <div className="bg-muted/60 flex h-40 w-60 items-center justify-center rounded-lg">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <Unavailable label={error ?? 'Image unavailable'} onRetry={reload} />
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(message.id)}
      aria-label={`Open ${alt}`}
      className="group/img relative m-0 block overflow-hidden rounded-lg border-none bg-transparent p-0 focus:outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="max-h-64 max-w-60 cursor-zoom-in rounded-lg object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
      />
      {/* An affordance, because a thumbnail that opens a full-screen viewer
          should look like it does something. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/img:bg-black/20 group-hover/img:opacity-100">
        <span className="rounded-full bg-black/60 p-2 text-white">
          <Expand className="size-4" />
        </span>
      </span>
    </button>
  );
}

export function SupportAudioAttachment({
  message,
  accountId,
  isMine,
}: {
  message: SupportMessage;
  accountId?: string;
  isMine?: boolean;
}) {
  const { url, loading, error, reload } = useSupportAttachment(
    message.id,
    accountId,
    !message.id.startsWith('temp-') && !message.deleted_at
  );

  const shell = cn(
    'flex w-60 items-center gap-2 rounded-lg px-2 py-1.5',
    isMine ? 'bg-emerald-200/50 dark:bg-emerald-800/50' : 'bg-background/70'
  );

  if (loading || (!url && !error)) {
    return (
      <div className={shell}>
        <AudioLines className="h-5 w-5 shrink-0 opacity-60" />
        <span className="flex-1 text-xs opacity-70">Voice note</span>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />
      </div>
    );
  }

  if (error || !url) {
    return <Unavailable label="Voice note — unavailable" onRetry={reload} />;
  }

  return (
    <div className={shell}>
      <AudioLines className="h-5 w-5 shrink-0 opacity-70" />
      {/*
        The native player, deliberately.
        A custom waveform scrubber would need the whole clip decoded in the
        browser to draw peaks — for a support voice note that is a lot of
        work to make a play button look nicer, and the native control
        already gives keyboard access, a real seek bar, playback speed and
        the duration read straight off the container (which is why no
        duration column was added).
      */}
      <audio
        src={url}
        controls
        preload="metadata"
        className="h-8 min-w-0 flex-1"
      />
    </div>
  );
}

export function SupportDocumentAttachment({
  message,
  accountId,
  isMine,
}: {
  message: SupportMessage;
  accountId?: string;
  /** Sits on the emerald fill, so the card has to read against that. */
  isMine?: boolean;
}) {
  const { url, loading, error, reload } = useSupportAttachment(
    message.id,
    accountId,
    !message.id.startsWith('temp-') && !message.deleted_at
  );

  const name = message.media_filename || 'Document';
  const size = message.media_size_bytes
    ? formatSupportBytes(message.media_size_bytes)
    : null;

  const card = (
    <>
      <FileText className="h-5 w-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {/* Size is shown here and not in the inbox on purpose: a support
            document is often the thing being diagnosed, and "did my 12 MB
            export actually arrive" is a real question. */}
        {size ? (
          <span className="block text-[11px] opacity-70">{size}</span>
        ) : null}
      </span>
    </>
  );

  const shell = cn(
    'flex max-w-64 items-center gap-2 rounded-lg px-3 py-2',
    isMine
      ? 'bg-emerald-200/50 hover:bg-emerald-200/80 dark:bg-emerald-800/50 dark:hover:bg-emerald-800/80'
      : 'bg-background/70 hover:bg-background'
  );

  if (loading || (!url && !error)) {
    return (
      <div className={shell}>
        {card}
        <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />
      </div>
    );
  }

  if (error || !url) {
    return <Unavailable label={`${name} — unavailable`} onRetry={reload} />;
  }

  return (
    <a
      href={url}
      // The signed URL carries a Content-Disposition of `attachment`, so
      // this downloads rather than navigating. `noreferrer` keeps the
      // signature out of any Referer header.
      target="_blank"
      rel="noopener noreferrer"
      className={shell}
      title={`Download ${name}`}
    >
      {card}
      <Download className="h-4 w-4 shrink-0 opacity-60" />
    </a>
  );
}
