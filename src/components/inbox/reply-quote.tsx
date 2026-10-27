'use client';

// ============================================================
// Reply quotes for the WhatsApp Inbox.
//
// Rendering lives in the shared `QuotedMessage` (src/components/chat), so
// the Inbox and the in-app Live Chat look identical. What stays here is the
// inbox-specific half: turning an inbox `Message` into a preview — which
// label a sticker gets, whether audio is a voice note, when a thumbnail is
// safe to show.
// ============================================================

import { useTranslations } from 'next-intl';

import {
  QuotedMessage,
  type QuoteKind,
  type QuotePreview,
} from '@/components/chat/quoted-message';
import type { Message } from '@/types';

export type { QuotePreview };

type T = ReturnType<typeof useTranslations>;

/**
 * Ogg/Opus is what WhatsApp uses for push-to-talk notes, and what our own
 * composer records. Anything else under audio is a music or audio file
 * someone attached, which WhatsApp labels differently.
 */
function isVoiceNote(message: Message): boolean {
  const mime = (message.media_mime_type ?? '').toLowerCase();
  return mime.includes('ogg') || mime.includes('opus');
}

/**
 * A media URL we can safely put in an <img> for the thumbnail.
 *
 * Only absolute http(s) URLs. The legacy `/api/whatsapp/media/<id>` proxy
 * path no longer has a route behind it, and an <img> pointing at it would
 * render a broken-image glyph inside every quote of an old photo.
 */
function thumbnailFor(message: Message): string | null {
  const url = message.media_url;
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Build the quote for `parent`, the message being replied to.
 *
 * `isSelf` is decided by the caller from the sender type, because what
 * counts as "us" (agent, AI, the business phone app) is inbox policy.
 */
export function buildInboxQuote(
  parent: Message,
  opts: { authorLabel: string; isSelf: boolean },
  t: T
): QuotePreview {
  const base = { authorLabel: opts.authorLabel, isSelf: opts.isSelf };

  // Retracted: never show what it said. Same rule as the bubble itself.
  if (parent.deleted_at) {
    return { ...base, kind: 'deleted', text: t('deleted') };
  }

  const caption = parent.content_text?.trim() || '';
  let kind: QuoteKind = 'text';
  let label = '';

  switch (parent.content_type) {
    case 'image':
      kind = 'image';
      label = t('photo');
      break;
    case 'video':
      kind = 'video';
      label = t('video');
      break;
    case 'audio':
      kind = isVoiceNote(parent) ? 'voice' : 'audio';
      label = isVoiceNote(parent) ? t('voiceMessage') : t('audio');
      break;
    case 'document':
      // The filename IS the useful preview for a document — "Invoice.pdf"
      // says far more than "Document" does.
      kind = 'document';
      label = parent.media_filename?.trim() || t('document');
      break;
    case 'sticker':
      kind = 'sticker';
      label = t('sticker');
      break;
    case 'location':
      kind = 'location';
      label = parent.location_name?.trim() || t('location');
      break;
    case 'contacts':
      kind = 'contacts';
      label = t('contact');
      break;
    case 'template':
      kind = 'template';
      label = t('template');
      break;
    case 'interactive':
      kind = 'interactive';
      label = t('interactive');
      break;
    default:
      kind = 'text';
      label = t('message');
  }

  return {
    ...base,
    kind,
    // A caption beats the generic label, exactly as WhatsApp does: a photo
    // captioned "the error I get" quotes as that, not as "Photo".
    text: caption || label,
    thumbnailUrl:
      kind === 'image' || kind === 'sticker' ? thumbnailFor(parent) : null,
  };
}

/** A quote for a reply whose parent is outside the loaded history. */
export function missingInboxQuote(t: T): QuotePreview {
  return {
    authorLabel: t('original'),
    isSelf: false,
    kind: 'missing',
    text: t('olderMessage'),
  };
}

/**
 * The composer's "replying to…" chip. Kept as a named export so the
 * composer does not need to know which shared component renders it.
 */
export function ReplyDraftQuote({
  preview,
  onDismiss,
}: {
  preview: QuotePreview;
  onDismiss?: () => void;
}) {
  const t = useTranslations('Inbox.replyQuote');
  return (
    <QuotedMessage
      preview={preview}
      onDismiss={onDismiss}
      dismissLabel={t('cancelReply')}
    />
  );
}
