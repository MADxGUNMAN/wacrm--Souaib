'use client';

// ============================================================
// The quoted message above a reply — WhatsApp's layout, shared by the
// WhatsApp Inbox and the in-app Live Chat so the two read as one product.
//
// Anatomy, left to right:
//   • a coloured bar, keyed to WHO wrote the quoted message
//   • the author's name in that same colour
//   • one line of the message — or, for media, an icon plus a label
//     ("Photo", the document's filename, "Voice message")
//   • a thumbnail on the right when the quoted message is an image
//
// Two variants from one component:
//   • embedded in a bubble, where clicking it jumps to the original
//   • a chip above the composer while drafting, with a dismiss button
//
// Purely presentational. Callers decide what the preview says, because
// only they know how to name the author and whether a thumbnail URL is
// safe to show — the inbox has public media URLs, the support chat has
// short-lived signed ones.
// ============================================================

import type { MouseEvent } from 'react';
import {
  Ban,
  Camera,
  CornerUpLeft,
  FileText,
  LayoutTemplate,
  MapPin,
  Mic,
  Music,
  MousePointerClick,
  Sticker,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export type QuoteKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'location'
  | 'sticker'
  | 'contacts'
  | 'template'
  | 'interactive'
  /** The quoted message was retracted. Its content must not be shown. */
  | 'deleted'
  /** The quoted message is not in the loaded page of the thread. */
  | 'missing';

export interface QuotePreview {
  authorLabel: string;
  /** The quoted message was written by the person looking at it. */
  isSelf: boolean;
  kind: QuoteKind;
  /** Body text, a caption, or the label standing in for media. */
  text: string;
  /** Only for image-like quotes. Null or absent renders no thumbnail. */
  thumbnailUrl?: string | null;
}

const KIND_ICON: Partial<Record<QuoteKind, LucideIcon>> = {
  image: Camera,
  video: Video,
  audio: Music,
  voice: Mic,
  document: FileText,
  location: MapPin,
  sticker: Sticker,
  contacts: UserRound,
  template: LayoutTemplate,
  interactive: MousePointerClick,
  deleted: Ban,
  missing: CornerUpLeft,
};

/**
 * Per-author colours for the OTHER party.
 *
 * WhatsApp gives each participant a stable colour so a quote says who it
 * is before you read the name. The viewer's own messages are always
 * emerald; everyone else is hashed into this palette by name, so the same
 * teammate keeps the same colour every time they appear.
 *
 * Each pair is spelled out in full — Tailwind cannot see a class name
 * assembled at runtime, so `text-${colour}-600` would be purged.
 */
const OTHER_TONES = [
  { bar: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  { bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  { bar: 'bg-pink-500', text: 'text-pink-600 dark:text-pink-400' },
  { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { bar: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400' },
] as const;

const SELF_TONE = {
  bar: 'bg-emerald-500',
  text: 'text-emerald-700 dark:text-emerald-400',
} as const;

function toneFor(authorLabel: string, isSelf: boolean) {
  if (isSelf) return SELF_TONE;
  // djb2 — tiny, stable, and good enough to spread a handful of names.
  let hash = 5381;
  for (let i = 0; i < authorLabel.length; i++) {
    hash = ((hash << 5) + hash + authorLabel.charCodeAt(i)) | 0;
  }
  return OTHER_TONES[Math.abs(hash) % OTHER_TONES.length];
}

export function QuotedMessage({
  preview,
  onClick,
  onDismiss,
  dismissLabel = 'Cancel reply',
  className,
}: {
  preview: QuotePreview;
  /** Embedded variant: jump to the original. */
  onClick?: () => void;
  /** Chip variant: drop the reply target. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}) {
  const tone = toneFor(preview.authorLabel, preview.isSelf);
  const Icon = KIND_ICON[preview.kind];
  const muted = preview.kind === 'deleted' || preview.kind === 'missing';
  // Every quote with a handler is clickable — including 'missing', which is
  // the case the jump's history paging exists for, and 'deleted', whose
  // placeholder row is still in the thread to land on.
  const interactive = Boolean(onClick);

  const body = (
    <>
      {/* The bar is its own element rather than a border so it can be a
          solid colour at full height regardless of the tint behind it. */}
      <span aria-hidden="true" className={cn('w-1 shrink-0', tone.bar)} />

      <span className="min-w-0 flex-1 px-2 py-1.5 text-left">
        <span
          className={cn(
            'block truncate text-xs leading-tight font-semibold',
            tone.text
          )}
        >
          {preview.authorLabel}
        </span>
        <span
          className={cn(
            'mt-0.5 flex min-w-0 items-start gap-1 text-xs leading-snug',
            muted ? 'text-foreground/50 italic' : 'text-foreground/70'
          )}
        >
          {Icon ? <Icon className="mt-px size-3.5 shrink-0" /> : null}
          {/* Two lines, then clip — enough to recognise the message, never
              enough to push the reply itself off the bubble. `break-words`
              stops a long URL from widening the bubble. */}
          <span className="line-clamp-2 min-w-0 break-words">
            {preview.text}
          </span>
        </span>
      </span>

      {preview.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.thumbnailUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="size-12 shrink-0 self-stretch object-cover"
        />
      ) : null}
    </>
  );

  // A tint that reads on BOTH bubble colours — the emerald of your own
  // messages and the muted grey of theirs — instead of a fixed colour that
  // only works on one.
  const shell = cn(
    'flex w-full min-w-0 overflow-hidden rounded-md bg-black/5 dark:bg-white/10',
    className
  );

  if (onDismiss) {
    return (
      <div className={cn(shell, 'items-stretch')}>
        {body}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex w-8 shrink-0 items-center justify-center transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (interactive) {
    return (
      <button
        type="button"
        onClick={(e: MouseEvent) => {
          // The bubble sits inside hover/long-press action wrappers; a click
          // on the quote is a jump, not a request to open those.
          e.stopPropagation();
          onClick?.();
        }}
        title="Go to original message"
        className={cn(
          shell,
          'mb-1.5 cursor-pointer transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:hover:bg-white/15'
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn(shell, 'mb-1.5')}>{body}</div>;
}
