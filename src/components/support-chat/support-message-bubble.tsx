'use client';

// ============================================================
// One support-chat bubble.
//
// Visual language deliberately matches the WhatsApp Inbox
// (`message-bubble.tsx`): the "tail" is an asymmetric corner rather than
// an SVG, mine sits right on an emerald fill, theirs sits left on the
// muted surface. Reimplemented rather than imported because that
// component is welded to the `Message` row type and branches on nine
// WhatsApp content types this chat will never have.
//
// SECURITY: message text is rendered as a plain React child, so React
// escapes it. No `dangerouslySetInnerHTML`, and no linkifier — turning
// customer-supplied text into live anchors is a phishing surface for
// whoever clicks, and `break-words` already stops a long URL breaking
// the layout.
// ============================================================

import { format } from 'date-fns';
import { Ban, Check, CheckCheck, Clock, Headset } from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  SupportAuthorDirectory,
  SupportMessage,
  SupportSenderKind,
} from '@/lib/support-chat/types';
import {
  QuotedMessage,
  type QuotePreview,
} from '@/components/chat/quoted-message';
import {
  SupportAudioAttachment,
  SupportDocumentAttachment,
  SupportImageAttachment,
} from './support-attachment';

/**
 * Who to credit a message to.
 *
 * Returns null when there is no honest answer — an `account` message
 * whose author is not in the directory (a member who has since left).
 * Following the inbox's rule: a guessed name is worse than no name.
 */
function authorLabel(
  message: SupportMessage,
  viewerKind: SupportSenderKind,
  currentUserId: string | undefined,
  directory: SupportAuthorDirectory | undefined
): { label: string; isSupport: boolean } | null {
  if (message.sender_kind === 'admin') {
    // The tenant sees one identity for support regardless of which
    // operator replied — they are talking to "Replai", not to a person.
    // The operator sees their own replies as such.
    return viewerKind === 'admin'
      ? { label: 'You', isSupport: true }
      : { label: 'Support', isSupport: true };
  }

  if (message.sender_user_id && message.sender_user_id === currentUserId) {
    return { label: 'You', isSupport: false };
  }

  const author = message.sender_user_id
    ? directory?.get(message.sender_user_id)
    : undefined;
  const name = author?.full_name?.trim() || author?.email?.trim();
  return name ? { label: name, isSupport: false } : null;
}

export function SupportMessageBubble({
  message,
  viewerKind,
  currentUserId,
  authorDirectory,
  reply,
  onJumpToReply,
  accountId,
  onImageResolved,
  onOpenImage,
}: {
  message: SupportMessage;
  /** Which side is looking. Decides what counts as "mine". */
  viewerKind: SupportSenderKind;
  currentUserId?: string;
  authorDirectory?: SupportAuthorDirectory;
  reply?: QuotePreview | null;
  /** Jump to the quoted message. Omitted = the quote is not clickable. */
  onJumpToReply?: () => void;
  /**
   * Required for an operator viewing an attachment — the signing route
   * resolves which thread they mean from it. A tenant's thread comes from
   * their session, so it is ignored there.
   */
  accountId?: string;
  /** Passed straight through to the image attachment. */
  onImageResolved?: (messageId: string, url: string | null) => void;
  onOpenImage?: (messageId: string) => void;
}) {
  const isMine = message.sender_kind === viewerKind;
  const isDeleted = Boolean(message.deleted_at);
  const time = format(new Date(message.created_at), 'HH:mm');
  const author = authorLabel(
    message,
    viewerKind,
    currentUserId,
    authorDirectory
  );

  // Optimistic rows carry a `temp-` id and no server timestamp yet.
  const isPending = message.id.startsWith('temp-');

  return (
    <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative max-w-[75%] rounded-2xl px-3 py-2',
          isMine
            ? 'rounded-br-md bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50'
            : 'bg-muted text-foreground rounded-bl-md'
        )}
      >
        {reply ? (
          <QuotedMessage preview={reply} onClick={onJumpToReply} />
        ) : null}

        {/* A deleted message must not render its content. The text stays
            in the column so replies pointing here do not dangle, but
            showing it would display something explicitly retracted. */}
        {isDeleted ? (
          <p className="flex items-center gap-1.5 text-sm italic opacity-60">
            <Ban className="size-3.5 shrink-0" />
            This message was deleted
          </p>
        ) : (
          <>
            {message.content_type === 'image' ? (
              <SupportImageAttachment
                message={message}
                accountId={accountId}
                onResolved={onImageResolved}
                onOpen={onOpenImage}
              />
            ) : message.content_type === 'audio' ? (
              <SupportAudioAttachment
                message={message}
                accountId={accountId}
                isMine={isMine}
              />
            ) : message.content_type === 'document' ? (
              <SupportDocumentAttachment
                message={message}
                accountId={accountId}
                isMine={isMine}
              />
            ) : null}

            {/* For an attachment this is the caption, which is why it sits
                below the file and is only rendered when present — the
                column is nullable for media rows. */}
            {message.content_text ? (
              <p
                className={cn(
                  'text-sm break-words whitespace-pre-wrap',
                  message.content_type !== 'text' && 'mt-1.5'
                )}
              >
                {message.content_text}
              </p>
            ) : null}
          </>
        )}

        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isMine ? 'justify-end' : 'justify-start'
          )}
        >
          {author ? (
            <span
              className={cn(
                'inline-flex max-w-[10rem] items-center gap-0.5 truncate rounded-full px-1.5 py-px text-[9px] leading-none font-semibold tracking-wide uppercase',
                isMine
                  ? 'bg-emerald-200/60 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {author.isSupport ? (
                <Headset className="h-2.5 w-2.5 shrink-0" />
              ) : null}
              <span className="truncate">{author.label}</span>
            </span>
          ) : null}

          <span
            className={cn(
              'text-[10px]',
              // Outbound sits on the emerald fill, so the timestamp has to
              // read against that rather than the neutral foreground.
              isMine
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground'
            )}
          >
            {isPending ? '' : time}
          </span>

          {/* Ticks only on my own messages, and only two states exist:
              sent (the row is in) and read (the other side opened the
              thread). There is deliberately no "delivered" — in-app,
              delivery IS the insert, so a third tick would be decoration
              pretending to be information. */}
          {/* Lucide icons take no `title`, so the tooltip lives on a
              wrapping span — which is also what gives the state an
              accessible name. */}
          {isMine ? (
            isPending ? (
              <span title="Sending" className="inline-flex">
                <Clock className="text-muted-foreground h-3 w-3" />
              </span>
            ) : message.read_at ? (
              <span
                title={`Read ${format(new Date(message.read_at), 'HH:mm')}`}
                className="inline-flex"
              >
                <CheckCheck className="h-3 w-3 text-blue-500" />
              </span>
            ) : (
              <span title="Sent" className="inline-flex">
                <Check className="h-3 w-3 opacity-60" />
              </span>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
